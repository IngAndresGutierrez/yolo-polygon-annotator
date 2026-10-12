"""Build Ultralytics-ready dataset ZIPs from the internal annotation format.

ZIP layout (`<root>` is the slugified dataset name):

    <root>/images/{train,val,test}/<image_id>.<ext>
    <root>/labels/{train,val,test}/<image_id>.txt
    <root>/data.yaml
    <root>/split_manifest.csv

File stems are internal image ids, which are unique per project, so names
never collide even if two source files share a stem with different
extensions.
"""

from __future__ import annotations

import csv
import io
import os
import stat
import tempfile
import zipfile
from pathlib import Path

from annotator.core.config import Settings
from annotator.core.errors import InvalidInputError
from annotator.models.export import ExportCreate, ExportResult, SplitCreate, SplitManifest
from annotator.models.project import Project
from annotator.services.annotations import AnnotationService
from annotator.services.exporters.yolo import build_data_yaml, detection_line, segmentation_line
from annotator.services.projects import utcnow
from annotator.services.splits import SplitService, new_id
from annotator.services.validation import ValidationService
from annotator.services.validators.annotations import to_coords
from annotator.storage.paths import slugify
from annotator.storage.repository import ProjectRepository

SPLITS = ("train", "val", "test")
# Fixed timestamp makes archives byte-for-byte reproducible for identical inputs.
_ZIP_DATE = (2020, 1, 1, 0, 0, 0)


def _zip_info(name: str, compress: bool) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=_ZIP_DATE)
    info.compress_type = zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED
    if name.endswith("/"):
        # Directories need the execute bit (and the MS-DOS directory flag), otherwise
        # `unzip` creates folders that cannot be entered.
        info.external_attr = (stat.S_IFDIR | 0o755) << 16 | 0x10
    else:
        info.external_attr = (stat.S_IFREG | 0o644) << 16
    return info


class ExportService:
    def __init__(
        self,
        repo: ProjectRepository,
        annotations: AnnotationService,
        splits: SplitService,
        validation: ValidationService,
        settings: Settings,
    ) -> None:
        self._repo = repo
        self._annotations = annotations
        self._splits = splits
        self._validation = validation
        self._settings = settings

    def list(self, project_id: str) -> list[ExportResult]:
        self._repo.get_project(project_id)
        return self._repo.list_exports(project_id)

    def get(self, project_id: str, export_id: str) -> ExportResult:
        return self._repo.get_export(project_id, export_id)

    def zip_path(self, project_id: str, export_id: str) -> Path:
        self.get(project_id, export_id)
        return self._repo.export_zip_path(project_id, export_id)

    def delete(self, project_id: str, export_id: str) -> None:
        self.get(project_id, export_id)
        self._repo.delete_export(project_id, export_id)

    def export(self, project_id: str, request: ExportCreate) -> ExportResult:
        report = self._validation.validate_project(project_id)
        if not report.valid:
            raise InvalidInputError(
                f"Project has {report.error_count} validation error(s); fix them before exporting",
                details=report.model_dump(by_alias=True, mode="json"),
            )
        if request.split_id:
            manifest = self._splits.get(project_id, request.split_id)
        else:
            manifest = self._splits.create(project_id, request.split or SplitCreate())

        with self._repo.lock(project_id):
            project = self._repo.get_project(project_id)
            return self._write_export(project, manifest, request)

    def _write_export(
        self, project: Project, manifest: SplitManifest, request: ExportCreate
    ) -> ExportResult:
        records = {img.id: img for img in project.images}
        class_names = {c.id: c.name for c in project.classes}
        root = slugify(request.dataset_name, fallback="dataset")
        export_id = new_id("export")
        warnings = list(manifest.warnings)
        counts = dict.fromkeys(SPLITS, 0)
        object_count = 0
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer, lineterminator="\n")
        writer.writerow(
            [
                "image_id",
                "original_filename",
                "split",
                "image_file",
                "label_file",
                "objects",
                "width",
                "height",
                "sha256",
            ]
        )

        manifest_ids = {a.image_id for a in manifest.assignments}
        excluded = [
            img.filename
            for img in project.images
            if img.id not in manifest_ids and (manifest.include_pending or img.status != "pending")
        ]
        if excluded:
            warnings.append(
                f"{len(excluded)} image(s) are not in the frozen split and were excluded: "
                + ", ".join(excluded[:10])
            )

        line_fn = detection_line if request.format == "detection" else segmentation_line
        export_dir = self._repo.export_dir(project.id)
        export_dir.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=export_dir, prefix=f".{export_id}.", suffix=".tmp")
        os.close(fd)
        try:
            with zipfile.ZipFile(tmp_name, "w") as archive:
                for split in SPLITS:
                    for kind in ("images", "labels"):
                        archive.writestr(_zip_info(f"{root}/{kind}/{split}/", False), b"")
                for assignment in manifest.assignments:
                    record = records.get(assignment.image_id)
                    if record is None:
                        warnings.append(
                            f"{assignment.filename} was deleted after the split; skipped"
                        )
                        continue
                    if record.status == "pending" and not manifest.include_pending:
                        warnings.append(f"{record.filename} has no annotations anymore; skipped")
                        continue
                    doc = self._annotations.load(project.id, record)
                    lines = []
                    for annotation in doc.annotations:
                        points = to_coords(annotation.points)
                        lines.append(
                            line_fn(annotation.class_id, points, record.width, record.height)
                        )
                    label_text = "\n".join(lines) + ("\n" if lines else "")

                    split = assignment.split
                    extension = Path(record.stored_name).suffix
                    image_name = f"{root}/images/{split}/{record.id}{extension}"
                    label_name = f"{root}/labels/{split}/{record.id}.txt"
                    archive.writestr(
                        _zip_info(image_name, False),
                        self._repo.image_path(project.id, record).read_bytes(),
                    )
                    archive.writestr(_zip_info(label_name, True), label_text.encode("utf-8"))
                    writer.writerow(
                        [
                            record.id,
                            record.filename,
                            split,
                            image_name.removeprefix(f"{root}/"),
                            label_name.removeprefix(f"{root}/"),
                            len(lines),
                            record.width,
                            record.height,
                            record.sha256,
                        ]
                    )
                    counts[split] += 1
                    object_count += len(lines)

                include_test = counts["test"] > 0 or manifest.ratios.test > 0
                archive.writestr(
                    _zip_info(f"{root}/data.yaml", True),
                    build_data_yaml(class_names, include_test).encode("utf-8"),
                )
                archive.writestr(
                    _zip_info(f"{root}/split_manifest.csv", True),
                    csv_buffer.getvalue().encode("utf-8"),
                )
            zip_path = self._repo.export_zip_path(project.id, export_id)
            Path(tmp_name).replace(zip_path)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise

        result = ExportResult(
            id=export_id,
            project_id=project.id,
            format=request.format,
            dataset_name=root,
            split_id=manifest.id,
            created_at=utcnow(),
            counts=counts,  # type: ignore[arg-type]
            object_count=object_count,
            size_bytes=zip_path.stat().st_size,
            download_url=f"/api/projects/{project.id}/exports/{export_id}/download",
            warnings=warnings,
        )
        self._repo.save_export_meta(result)
        return result
