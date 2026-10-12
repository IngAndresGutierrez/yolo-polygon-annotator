from __future__ import annotations

from typing import Literal

from annotator.models.base import ApiModel
from annotator.models.validation import ImageValidation

DuplicateKind = Literal["exact", "near"]


class DuplicateGroup(ApiModel):
    kind: DuplicateKind
    image_ids: list[str]
    # Suggested image to keep: annotated > negative > pending, then more objects,
    # higher resolution, oldest import.
    keep_id: str
    # Largest perceptual-hash distance between members (0 for exact duplicates).
    max_distance: int


class QualityReport(ApiModel):
    project_id: str
    exact_groups: list[DuplicateGroup]
    near_groups: list[DuplicateGroup]
    invalid_images: list[ImageValidation]
    excluded_count: int
    issue_count: int
