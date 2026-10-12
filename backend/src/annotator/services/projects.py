from __future__ import annotations

from datetime import UTC, datetime

from annotator.core.config import Settings
from annotator.core.errors import NotFoundError
from annotator.models.project import Project, ProjectSummary
from annotator.storage.paths import slugify
from annotator.storage.repository import ProjectRepository

DEFAULT_PROJECT_NAME = "Default project"


def utcnow() -> datetime:
    return datetime.now(UTC)


def summarize(project: Project) -> ProjectSummary:
    statuses = [image.status for image in project.images]
    return ProjectSummary(
        id=project.id,
        name=project.name,
        created_at=project.created_at,
        updated_at=project.updated_at,
        image_count=len(project.images),
        annotated_count=statuses.count("annotated"),
        negative_count=statuses.count("negative"),
        pending_count=statuses.count("pending"),
        classes=project.classes,
    )


class ProjectService:
    def __init__(self, repo: ProjectRepository, settings: Settings) -> None:
        self._repo = repo
        self._settings = settings

    def list(self) -> list[ProjectSummary]:
        return [
            summarize(p) for p in sorted(self._repo.list_projects(), key=lambda p: p.created_at)
        ]

    def get(self, project_id: str) -> Project:
        return self._repo.get_project(project_id)

    def summary(self, project_id: str) -> ProjectSummary:
        return summarize(self.get(project_id))

    def create(self, name: str) -> ProjectSummary:
        base = slugify(name, fallback="project", max_length=40)
        with self._repo.lock("__projects__"):
            project_id = base
            suffix = 2
            while self._repo.project_exists(project_id):
                project_id = f"{base}-{suffix}"
                suffix += 1
            now = utcnow()
            project = Project(
                id=project_id,
                name=name.strip(),
                created_at=now,
                updated_at=now,
                classes=list(self._settings.classes),
            )
            self._repo.save_project(project)
        return summarize(project)

    def delete(self, project_id: str) -> None:
        if not self._repo.project_exists(project_id):
            raise NotFoundError(f"Project {project_id!r} not found")
        with self._repo.lock(project_id):
            self._repo.delete_project(project_id)

    def ensure_default(self) -> None:
        """Create a project on first start so the UI is usable immediately."""
        if not self._repo.list_projects():
            self.create(DEFAULT_PROJECT_NAME)
