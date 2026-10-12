"""File-system persistence for projects, images, annotations, splits and exports.

Layout (all under WORKSPACE_DIR):

    projects/<project_id>/project.json             project metadata + image index
    projects/<project_id>/images/<image_id>.<ext>  original image bytes
    projects/<project_id>/thumbnails/<image_id>.jpg
    projects/<project_id>/annotations/<image_id>.json   editing source of truth
    projects/<project_id>/splits/<split_id>.json        frozen split manifests
    exports/<project_id>/<export_id>.zip (+ .json metadata)

Writes are atomic and serialized per project with a re-entrant lock, because
FastAPI runs sync endpoints in a thread pool and autosave may overlap with
imports.
"""

from __future__ import annotations

import shutil
import threading
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from pydantic import ValidationError

from annotator.core.errors import NotFoundError
from annotator.models.annotation import ImageAnnotations
from annotator.models.export import ExportResult, SplitManifest
from annotator.models.project import ImageRecord, Project
from annotator.storage.atomic import atomic_write_bytes, atomic_write_model
from annotator.storage.paths import safe_join, validate_identifier


class ProjectRepository:
    def __init__(self, projects_dir: Path, exports_dir: Path) -> None:
        self._projects_dir = projects_dir
        self._exports_dir = exports_dir
        self._locks: dict[str, threading.RLock] = {}
        self._locks_guard = threading.Lock()

    # -- locking -----------------------------------------------------------
    @contextmanager
    def lock(self, project_id: str) -> Generator[None]:
        with self._locks_guard:
            project_lock = self._locks.setdefault(project_id, threading.RLock())
        with project_lock:
            yield

    # -- paths -------------------------------------------------------------
    def project_dir(self, project_id: str) -> Path:
        return safe_join(self._projects_dir, validate_identifier(project_id, "project id"))

    def _project_file(self, project_id: str) -> Path:
        return self.project_dir(project_id) / "project.json"

    def image_path(self, project_id: str, record: ImageRecord) -> Path:
        return safe_join(self.project_dir(project_id) / "images", record.stored_name)

    def thumbnail_path(self, project_id: str, image_id: str) -> Path:
        validate_identifier(image_id, "image id")
        return safe_join(self.project_dir(project_id) / "thumbnails", f"{image_id}.jpg")

    def _annotation_path(self, project_id: str, image_id: str) -> Path:
        validate_identifier(image_id, "image id")
        return safe_join(self.project_dir(project_id) / "annotations", f"{image_id}.json")

    def _split_path(self, project_id: str, split_id: str) -> Path:
        validate_identifier(split_id, "split id")
        return safe_join(self.project_dir(project_id) / "splits", f"{split_id}.json")

    def export_dir(self, project_id: str) -> Path:
        return safe_join(self._exports_dir, validate_identifier(project_id, "project id"))

    def export_zip_path(self, project_id: str, export_id: str) -> Path:
        validate_identifier(export_id, "export id")
        return safe_join(self.export_dir(project_id), f"{export_id}.zip")

    def _export_meta_path(self, project_id: str, export_id: str) -> Path:
        validate_identifier(export_id, "export id")
        return safe_join(self.export_dir(project_id), f"{export_id}.json")

    # -- projects ----------------------------------------------------------
    def list_projects(self) -> list[Project]:
        if not self._projects_dir.exists():
            return []
        projects = []
        for entry in sorted(self._projects_dir.iterdir()):
            project_file = entry / "project.json"
            if entry.is_dir() and project_file.exists():
                try:
                    projects.append(Project.model_validate_json(project_file.read_bytes()))
                except ValidationError:
                    continue  # a corrupt project must not break the whole listing
        return projects

    def project_exists(self, project_id: str) -> bool:
        return self._project_file(project_id).exists()

    def get_project(self, project_id: str) -> Project:
        path = self._project_file(project_id)
        if not path.exists():
            raise NotFoundError(f"Project {project_id!r} not found")
        return Project.model_validate_json(path.read_bytes())

    def save_project(self, project: Project) -> None:
        atomic_write_model(self._project_file(project.id), project)

    # -- images ------------------------------------------------------------
    def write_image(self, project_id: str, record: ImageRecord, data: bytes, thumb: bytes) -> None:
        atomic_write_bytes(self.image_path(project_id, record), data)
        atomic_write_bytes(self.thumbnail_path(project_id, record.id), thumb)

    def delete_image_files(self, project_id: str, record: ImageRecord) -> None:
        self.image_path(project_id, record).unlink(missing_ok=True)
        self.thumbnail_path(project_id, record.id).unlink(missing_ok=True)
        self._annotation_path(project_id, record.id).unlink(missing_ok=True)

    # -- annotations -------------------------------------------------------
    def read_annotations(self, project_id: str, record: ImageRecord) -> ImageAnnotations | None:
        path = self._annotation_path(project_id, record.id)
        if not path.exists():
            return None
        return ImageAnnotations.model_validate_json(path.read_bytes())

    def write_annotations(self, project_id: str, doc: ImageAnnotations) -> None:
        atomic_write_model(self._annotation_path(project_id, doc.image_id), doc)

    # -- splits ------------------------------------------------------------
    def save_split(self, manifest: SplitManifest) -> None:
        atomic_write_model(self._split_path(manifest.project_id, manifest.id), manifest)

    def get_split(self, project_id: str, split_id: str) -> SplitManifest:
        path = self._split_path(project_id, split_id)
        if not path.exists():
            raise NotFoundError(f"Split {split_id!r} not found")
        return SplitManifest.model_validate_json(path.read_bytes())

    def list_splits(self, project_id: str) -> list[SplitManifest]:
        directory = self.project_dir(project_id) / "splits"
        if not directory.exists():
            return []
        manifests = [
            SplitManifest.model_validate_json(p.read_bytes()) for p in directory.glob("*.json")
        ]
        return sorted(manifests, key=lambda m: m.created_at, reverse=True)

    # -- exports -----------------------------------------------------------
    def save_export_meta(self, result: ExportResult) -> None:
        atomic_write_model(self._export_meta_path(result.project_id, result.id), result)

    def get_export(self, project_id: str, export_id: str) -> ExportResult:
        path = self._export_meta_path(project_id, export_id)
        if not path.exists():
            raise NotFoundError(f"Export {export_id!r} not found")
        return ExportResult.model_validate_json(path.read_bytes())

    def list_exports(self, project_id: str) -> list[ExportResult]:
        directory = self.export_dir(project_id)
        if not directory.exists():
            return []
        results = [
            ExportResult.model_validate_json(p.read_bytes()) for p in directory.glob("*.json")
        ]
        return sorted(results, key=lambda r: r.created_at, reverse=True)

    def delete_export(self, project_id: str, export_id: str) -> None:
        self.export_zip_path(project_id, export_id).unlink(missing_ok=True)
        self._export_meta_path(project_id, export_id).unlink(missing_ok=True)

    def delete_project(self, project_id: str) -> None:
        shutil.rmtree(self.project_dir(project_id), ignore_errors=True)
        shutil.rmtree(self.export_dir(project_id), ignore_errors=True)
