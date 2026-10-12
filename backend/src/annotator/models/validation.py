from __future__ import annotations

from typing import Literal

from annotator.models.base import ApiModel

Severity = Literal["error", "warning"]


class ValidationIssue(ApiModel):
    code: str
    message: str
    severity: Severity = "error"
    annotation_id: str | None = None


class ImageValidation(ApiModel):
    image_id: str
    filename: str
    issues: list[ValidationIssue]


class ProjectValidationReport(ApiModel):
    project_id: str
    valid: bool
    image_count: int
    error_count: int
    warning_count: int
    images: list[ImageValidation]
    project_issues: list[ValidationIssue]
