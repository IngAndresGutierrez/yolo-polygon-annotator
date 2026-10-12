from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from annotator.models.base import ApiModel
from annotator.models.classes import LabelClass

ImageStatus = Literal["pending", "annotated", "negative"]
ImageFormat = Literal["jpeg", "png"]


class ImageRecord(ApiModel):
    id: str
    filename: str
    stored_name: str
    format: ImageFormat
    width: int
    height: int
    size_bytes: int
    sha256: str
    # 64-bit difference hash (hex) used to warn about near-duplicates.
    dhash: str
    created_at: datetime
    annotation_count: int = 0
    status: ImageStatus = "pending"
    revision: int = 0


class Project(ApiModel):
    schema_version: Literal[1] = 1
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    classes: list[LabelClass]
    images: list[ImageRecord] = Field(default_factory=list)


class ProjectSummary(ApiModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    image_count: int
    annotated_count: int
    negative_count: int
    pending_count: int
    classes: list[LabelClass]


class ProjectCreate(ApiModel):
    name: str = Field(min_length=1, max_length=80)


class ImageImportIssue(ApiModel):
    filename: str
    code: str
    message: str


class ImageImportResult(ApiModel):
    imported: list[ImageRecord]
    rejected: list[ImageImportIssue]
    warnings: list[ImageImportIssue]


class VocImportResult(ApiModel):
    matched: list[str]
    annotations_imported: int
    skipped_existing: list[str]
    unmatched: list[ImageImportIssue]
    rejected: list[ImageImportIssue]
    warnings: list[ImageImportIssue]
