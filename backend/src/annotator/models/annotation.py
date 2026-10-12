"""Internal, versioned annotation format (the editing source of truth).

Coordinates are floats in the pixel space of the original image, so no
precision is lost between editing sessions. YOLO `.txt` files are only an
export artifact and are never read back.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from annotator.models.base import ApiModel

SCHEMA_VERSION = 1
QUAD_VERTEX_COUNT = 4


class Point(ApiModel):
    x: float
    y: float

    @field_validator("x", "y")
    @classmethod
    def _finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("coordinates must be finite numbers")
        return value


class Annotation(ApiModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    class_id: int = Field(ge=0)
    class_name: str = Field(min_length=1, max_length=64)
    type: Literal["quadrilateral"] = "quadrilateral"
    points: list[Point] = Field(min_length=QUAD_VERTEX_COUNT, max_length=QUAD_VERTEX_COUNT)


class ImageAnnotations(ApiModel):
    schema_version: Literal[1] = SCHEMA_VERSION
    image_id: str
    filename: str
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    # Set when a user confirms that an image intentionally contains no objects
    # (exported as a background image with an empty label file).
    negative: bool = False
    revision: int = Field(default=0, ge=0)
    updated_at: datetime | None = None
    annotations: list[Annotation] = Field(default_factory=list)


class AnnotationsUpdate(ApiModel):
    """Payload for replacing the annotations of one image."""

    annotations: list[Annotation] = Field(max_length=500)
    negative: bool = False
    # Optimistic concurrency: the revision the client edited. `None` skips the check.
    base_revision: int | None = Field(default=None, ge=0)
