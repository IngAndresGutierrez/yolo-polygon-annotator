"""Service container wired once at startup and exposed through FastAPI dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from annotator.core.config import Settings
from annotator.services.annotations import AnnotationService
from annotator.services.exports import ExportService
from annotator.services.images import ImageService
from annotator.services.projects import ProjectService
from annotator.services.splits import SplitService
from annotator.services.validation import ValidationService
from annotator.storage.repository import ProjectRepository


@dataclass(frozen=True)
class Container:
    settings: Settings
    projects: ProjectService
    images: ImageService
    annotations: AnnotationService
    validation: ValidationService
    splits: SplitService
    exports: ExportService

    @classmethod
    def build(cls, settings: Settings) -> Container:
        repo = ProjectRepository(settings.projects_dir, settings.exports_dir)
        annotations = AnnotationService(repo, settings)
        validation = ValidationService(repo, annotations, settings)
        splits = SplitService(repo, settings)
        return cls(
            settings=settings,
            projects=ProjectService(repo, settings),
            images=ImageService(repo, settings),
            annotations=annotations,
            validation=validation,
            splits=splits,
            exports=ExportService(repo, annotations, splits, validation, settings),
        )


def get_container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


ContainerDep = Annotated[Container, Depends(get_container)]
