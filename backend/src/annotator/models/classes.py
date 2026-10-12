"""Label class registry.

The MVP ships a single class, but every annotation stores `classId` and
`className` so that more classes can be added without a schema migration.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LabelClass(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=64)


DEFAULT_CLASSES: tuple[LabelClass, ...] = (LabelClass(id=0, name="licence"),)


def find_class_by_name(classes: tuple[LabelClass, ...], name: str) -> LabelClass | None:
    normalized = name.strip().lower()
    return next((c for c in classes if c.name.lower() == normalized), None)


def find_class_by_id(classes: tuple[LabelClass, ...], class_id: int) -> LabelClass | None:
    return next((c for c in classes if c.id == class_id), None)
