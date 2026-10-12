from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePath

from annotator.core.config import Settings
from annotator.core.errors import AppError, NotFoundError
from annotator.models.project import (
    ImageBulkAction,
    ImageBulkResult,
    ImageImportIssue,
    ImageImportResult,
    ImageRecord,
    Project,
)
from annotator.services.projects import utcnow
from annotator.storage.paths import sanitize_filename, slugify
from annotator.storage.repository import ProjectRepository
from annotator.utils.images import (
    ALLOWED_EXTENSIONS,
    STORED_EXTENSION,
    hamming_distance,
    inspect_image,
    make_thumbnail,
)


@dataclass(frozen=True)
class UploadedFile:
    filename: str
    data: bytes


class ImportRejectedError(AppError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def find_image(project: Project, image_id: str) -> ImageRecord:
    record = next((img for img in project.images if img.id == image_id), None)
    if record is None:
        raise NotFoundError(f"Image {image_id!r} not found in project {project.id!r}")
    return record


def unique_image_id(filename: str, taken: set[str]) -> str:
    base = slugify(PurePath(filename).stem, fallback="image")
    candidate = base
    suffix = 2
    while candidate in taken:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


class ImageService:
    def __init__(self, repo: ProjectRepository, settings: Settings) -> None:
        self._repo = repo
        self._settings = settings

    def list(self, project_id: str, search: str | None = None) -> list[ImageRecord]:
        images = self._repo.get_project(project_id).images
        if search:
            needle = search.strip().lower()
            images = [img for img in images if needle in img.filename.lower()]
        return images

    def get(self, project_id: str, image_id: str) -> ImageRecord:
        return find_image(self._repo.get_project(project_id), image_id)

    def file_path(self, project_id: str, record: ImageRecord) -> Path:
        return self._repo.image_path(project_id, record)

    def thumbnail_path(self, project_id: str, record: ImageRecord) -> Path:
        return self._repo.thumbnail_path(project_id, record.id)

    def import_images(self, project_id: str, files: list[UploadedFile]) -> ImageImportResult:
        imported: list[ImageRecord] = []
        rejected: list[ImageImportIssue] = []
        warnings: list[ImageImportIssue] = []

        with self._repo.lock(project_id):
            project = self._repo.get_project(project_id)
            taken_ids = {img.id for img in project.images}
            by_filename = {img.filename.lower(): img for img in project.images}
            by_hash = {img.sha256: img for img in project.images}

            for upload in files:
                try:
                    filename = sanitize_filename(upload.filename)
                    extension = PurePath(filename).suffix.lower()
                    if extension not in ALLOWED_EXTENSIONS:
                        raise ImportRejectedError(
                            "unsupported_type", "Only .jpg, .jpeg and .png are accepted"
                        )
                    if len(upload.data) > self._settings.max_upload_bytes:
                        raise ImportRejectedError(
                            "too_large", "File exceeds the configured size limit"
                        )
                    if filename.lower() in by_filename:
                        raise ImportRejectedError(
                            "duplicate_filename", "An image with this name already exists"
                        )
                    inspected = inspect_image(
                        upload.data, extension, self._settings.max_image_pixels
                    )
                except AppError as exc:
                    rejected.append(
                        ImageImportIssue(
                            filename=upload.filename or "", code=exc.code, message=exc.message
                        )
                    )
                    continue

                image_id = unique_image_id(filename, taken_ids)
                record = ImageRecord(
                    id=image_id,
                    filename=filename,
                    stored_name=f"{image_id}{STORED_EXTENSION[inspected.format]}",
                    format=inspected.format,  # type: ignore[arg-type]
                    width=inspected.width,
                    height=inspected.height,
                    size_bytes=len(inspected.data),
                    sha256=inspected.sha256,
                    dhash=inspected.dhash,
                    created_at=utcnow(),
                )
                thumb = make_thumbnail(inspected.data, self._settings.thumbnail_size)
                self._repo.write_image(project_id, record, inspected.data, thumb)

                warnings.extend(self._duplicate_warnings(record, by_hash, project.images))
                if inspected.reoriented:
                    warnings.append(
                        ImageImportIssue(
                            filename=filename,
                            code="exif_rotated",
                            message="EXIF orientation applied; stored image was rotated upright",
                        )
                    )
                taken_ids.add(image_id)
                by_filename[filename.lower()] = record
                by_hash.setdefault(record.sha256, record)
                project.images.append(record)
                imported.append(record)

            if imported:
                project.updated_at = utcnow()
                self._repo.save_project(project)
        return ImageImportResult(imported=imported, rejected=rejected, warnings=warnings)

    def _duplicate_warnings(
        self, record: ImageRecord, by_hash: dict[str, ImageRecord], existing: list[ImageRecord]
    ) -> list[ImageImportIssue]:
        exact = by_hash.get(record.sha256)
        if exact is not None:
            return [
                ImageImportIssue(
                    filename=record.filename,
                    code="exact_duplicate",
                    message=f"Identical to {exact.filename}; both will always share a split",
                )
            ]
        threshold = self._settings.near_duplicate_threshold
        similar = [
            img.filename
            for img in existing
            if hamming_distance(img.dhash, record.dhash) <= threshold
        ]
        if similar:
            return [
                ImageImportIssue(
                    filename=record.filename,
                    code="near_duplicate",
                    message=f"Looks very similar to {', '.join(similar[:3])}",
                )
            ]
        return []

    def delete(self, project_id: str, image_id: str) -> None:
        with self._repo.lock(project_id):
            project = self._repo.get_project(project_id)
            record = find_image(project, image_id)
            project.images = [img for img in project.images if img.id != image_id]
            project.updated_at = utcnow()
            self._repo.save_project(project)
            self._repo.delete_image_files(project_id, record)

    def bulk(self, project_id: str, request: ImageBulkAction) -> ImageBulkResult:
        """Exclude, re-include or delete several images in one locked operation."""
        with self._repo.lock(project_id):
            project = self._repo.get_project(project_id)
            by_id = {img.id: img for img in project.images}
            targets = [by_id[i] for i in dict.fromkeys(request.image_ids) if i in by_id]
            not_found = [i for i in request.image_ids if i not in by_id]
            if request.action == "delete":
                deleted = {img.id for img in targets}
                project.images = [img for img in project.images if img.id not in deleted]
            else:
                exclude = request.action == "exclude"
                for img in targets:
                    img.excluded = exclude
                    img.excluded_reason = (request.reason or "manual") if exclude else None
            if targets:
                project.updated_at = utcnow()
                self._repo.save_project(project)
            if request.action == "delete":
                for img in targets:
                    self._repo.delete_image_files(project_id, img)
        return ImageBulkResult(
            action=request.action, updated=[img.id for img in targets], not_found=not_found
        )
