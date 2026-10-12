"""Application settings loaded from environment variables.

A tiny explicit loader is used instead of an extra settings dependency: the
surface is small and every value is documented in `.env.example`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from annotator.models.classes import DEFAULT_CLASSES, LabelClass


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be an integer, got {raw!r}") from exc


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be a number, got {raw!r}") from exc


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    workspace_dir: Path
    max_upload_bytes: int = 25 * 1024 * 1024
    max_xml_bytes: int = 1 * 1024 * 1024
    max_files_per_request: int = 200
    max_image_pixels: int = 60_000_000
    min_polygon_area: float = 16.0
    near_duplicate_threshold: int = 4
    thumbnail_size: int = 320
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    classes: tuple[LabelClass, ...] = DEFAULT_CLASSES

    @property
    def projects_dir(self) -> Path:
        return self.workspace_dir / "projects"

    @property
    def exports_dir(self) -> Path:
        return self.workspace_dir / "exports"

    @classmethod
    def from_env(cls) -> Settings:
        default_workspace = Path(__file__).resolve().parents[4] / "workspace"
        return cls(
            workspace_dir=Path(os.environ.get("WORKSPACE_DIR", str(default_workspace))).resolve(),
            max_upload_bytes=_env_int("MAX_UPLOAD_MB", 25) * 1024 * 1024,
            max_xml_bytes=_env_int("MAX_XML_KB", 1024) * 1024,
            max_files_per_request=_env_int("MAX_FILES_PER_REQUEST", 200),
            max_image_pixels=_env_int("MAX_IMAGE_PIXELS", 60_000_000),
            min_polygon_area=_env_float("MIN_POLYGON_AREA", 16.0),
            near_duplicate_threshold=_env_int("NEAR_DUPLICATE_THRESHOLD", 4),
            cors_origins=_env_list(
                "CORS_ORIGINS", ["http://localhost:5173", "http://127.0.0.1:5173"]
            ),
        )

    def ensure_directories(self) -> None:
        for directory in (self.workspace_dir, self.projects_dir, self.exports_dir):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
