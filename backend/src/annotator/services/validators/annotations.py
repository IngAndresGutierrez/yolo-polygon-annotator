"""Validation of an image's annotations against geometry and class rules."""

from __future__ import annotations

from annotator.models.annotation import Annotation, ImageAnnotations, Point
from annotator.models.classes import LabelClass, find_class_by_id
from annotator.models.validation import ValidationIssue
from annotator.services.validators.geometry import order_quad, validate_quad


def to_coords(points: list[Point]) -> list[tuple[float, float]]:
    return [(p.x, p.y) for p in points]


def canonicalize_annotation(annotation: Annotation) -> Annotation:
    ordered = order_quad(to_coords(annotation.points))
    return annotation.model_copy(update={"points": [Point(x=x, y=y) for x, y in ordered]})


def validate_annotation(
    annotation: Annotation,
    width: int,
    height: int,
    classes: tuple[LabelClass, ...],
    min_area: float,
) -> list[ValidationIssue]:
    issues = [
        ValidationIssue(code=issue.code, message=issue.message, annotation_id=annotation.id)
        for issue in validate_quad(to_coords(annotation.points), width, height, min_area)
    ]
    label_class = find_class_by_id(classes, annotation.class_id)
    if label_class is None:
        issues.append(
            ValidationIssue(
                code="unknown_class",
                message=f"Unknown class id {annotation.class_id}",
                annotation_id=annotation.id,
            )
        )
    elif label_class.name != annotation.class_name:
        issues.append(
            ValidationIssue(
                code="class_name_mismatch",
                message=f"Class {annotation.class_id} is named {label_class.name!r}, "
                f"not {annotation.class_name!r}",
                severity="warning",
                annotation_id=annotation.id,
            )
        )
    return issues


def validate_image_annotations(
    doc: ImageAnnotations,
    classes: tuple[LabelClass, ...],
    min_area: float,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    seen_ids: set[str] = set()
    for annotation in doc.annotations:
        if annotation.id in seen_ids:
            issues.append(
                ValidationIssue(
                    code="duplicate_annotation_id",
                    message=f"Annotation id {annotation.id!r} is used more than once",
                    annotation_id=annotation.id,
                )
            )
        seen_ids.add(annotation.id)
        issues.extend(validate_annotation(annotation, doc.width, doc.height, classes, min_area))
    if doc.negative and doc.annotations:
        issues.append(
            ValidationIssue(
                code="negative_with_objects",
                message="Image is marked as 'no objects' but contains annotations",
            )
        )
    return issues
