from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from annotator.models.base import ApiModel

ExportFormat = Literal["detection", "segmentation"]
SplitName = Literal["train", "val", "test"]
RATIO_TOLERANCE = 1e-6


class SplitRatios(ApiModel):
    train: float = Field(default=0.7, gt=0, le=1)
    val: float = Field(default=0.2, gt=0, le=1)
    test: float = Field(default=0.1, ge=0, le=1)

    @model_validator(mode="after")
    def _sum_to_one(self) -> SplitRatios:
        total = self.train + self.val + self.test
        if abs(total - 1.0) > RATIO_TOLERANCE:
            raise ValueError(f"split ratios must sum to 1.0 (got {total:.4f})")
        return self


class SplitCreate(ApiModel):
    ratios: SplitRatios = Field(default_factory=SplitRatios)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)
    include_pending: bool = False


class SplitAssignment(ApiModel):
    image_id: str
    filename: str
    sha256: str
    split: SplitName


class SplitManifest(ApiModel):
    schema_version: Literal[1] = 1
    id: str
    project_id: str
    created_at: datetime
    seed: int
    ratios: SplitRatios
    include_pending: bool
    counts: dict[SplitName, int]
    assignments: list[SplitAssignment]
    warnings: list[str] = Field(default_factory=list)


class SplitSummary(ApiModel):
    id: str
    created_at: datetime
    seed: int
    ratios: SplitRatios
    counts: dict[SplitName, int]
    image_count: int


class ExportCreate(ApiModel):
    format: ExportFormat
    dataset_name: str = Field(default="dataset", min_length=1, max_length=64)
    # Reuse a frozen manifest so Detection and Segmentation share partitions.
    split_id: str | None = None
    split: SplitCreate | None = None


class ExportResult(ApiModel):
    id: str
    project_id: str
    format: ExportFormat
    dataset_name: str
    split_id: str
    created_at: datetime
    counts: dict[SplitName, int]
    object_count: int
    size_bytes: int
    download_url: str
    warnings: list[str] = Field(default_factory=list)
