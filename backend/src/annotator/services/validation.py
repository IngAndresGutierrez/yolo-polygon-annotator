from __future__ import annotations

from collections import defaultdict

from annotator.core.config import Settings
from annotator.models.validation import ImageValidation, ProjectValidationReport, ValidationIssue
from annotator.services.annotations import AnnotationService
from annotator.services.validators.annotations import validate_image_annotations
from annotator.storage.repository import ProjectRepository


class ValidationService:
    def __init__(
        self, repo: ProjectRepository, annotations: AnnotationService, settings: Settings
    ) -> None:
        self._repo = repo
        self._annotations = annotations
        self._settings = settings

    def validate_project(self, project_id: str) -> ProjectValidationReport:
        project = self._repo.get_project(project_id)
        included = [img for img in project.images if not img.excluded]
        images: list[ImageValidation] = []
        for record in included:
            doc = self._annotations.load(project_id, record)
            issues = validate_image_annotations(
                doc, self._settings.classes, self._settings.min_polygon_area
            )
            if issues:
                images.append(
                    ImageValidation(image_id=record.id, filename=record.filename, issues=issues)
                )

        project_issues: list[ValidationIssue] = []
        exportable = [img for img in included if img.status != "pending"]
        if not exportable:
            project_issues.append(
                ValidationIssue(
                    code="nothing_to_export",
                    message="No image is annotated or marked as 'no objects' yet",
                )
            )
        pending = len(included) - len(exportable)
        if pending:
            project_issues.append(
                ValidationIssue(
                    code="pending_images",
                    severity="warning",
                    message=f"{pending} image(s) are not annotated and will be excluded by default",
                )
            )
        excluded_count = len(project.images) - len(included)
        if excluded_count:
            project_issues.append(
                ValidationIssue(
                    code="excluded_images",
                    severity="warning",
                    message=f"{excluded_count} image(s) are excluded from the dataset",
                )
            )
        by_hash: dict[str, list[str]] = defaultdict(list)
        for record in included:
            by_hash[record.sha256].append(record.filename)
        for filenames in by_hash.values():
            if len(filenames) > 1:
                project_issues.append(
                    ValidationIssue(
                        code="exact_duplicates",
                        severity="warning",
                        message=f"Identical images: {', '.join(filenames)} (kept in one split)",
                    )
                )

        all_issues = [i for img in images for i in img.issues] + project_issues
        error_count = sum(1 for i in all_issues if i.severity == "error")
        return ProjectValidationReport(
            project_id=project_id,
            valid=error_count == 0,
            image_count=len(included),
            error_count=error_count,
            warning_count=len(all_issues) - error_count,
            images=images,
            project_issues=project_issues,
        )
