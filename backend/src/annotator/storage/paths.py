"""Path safety helpers.

Every path derived from user input (project ids, image ids, filenames) goes
through these helpers so that nothing can escape the workspace directory.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path, PurePosixPath, PureWindowsPath

from annotator.core.errors import UnsafePathError

_IDENTIFIER_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_SLUG_INVALID_RE = re.compile(r"[^a-z0-9_-]+")
_MAX_FILENAME_LENGTH = 255


def validate_identifier(value: str, kind: str = "identifier") -> str:
    """Ensure an id is a short lowercase slug; ids are used as path components."""
    if not _IDENTIFIER_RE.fullmatch(value):
        raise UnsafePathError(f"Invalid {kind}: {value!r}")
    return value


def slugify(value: str, fallback: str = "item", max_length: int = 48) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_INVALID_RE.sub("-", normalized.lower()).strip("-_")
    slug = re.sub(r"-{2,}", "-", slug)[:max_length].strip("-_")
    return slug or fallback


def sanitize_filename(raw: str | None) -> str:
    """Return the basename of an uploaded filename, rejecting anything suspicious.

    Browsers send only the basename, but clients can send anything, so both
    POSIX and Windows separators are stripped and control characters rejected.
    """
    if not raw:
        raise UnsafePathError("Missing filename")
    name = PureWindowsPath(PurePosixPath(raw).name).name.strip()
    if name in {"", ".", ".."} or name.startswith("."):
        raise UnsafePathError(f"Invalid filename: {raw!r}")
    if any(ord(ch) < 32 for ch in name) or len(name) > _MAX_FILENAME_LENGTH:
        raise UnsafePathError(f"Invalid filename: {raw!r}")
    return name


def safe_join(base: Path, *parts: str) -> Path:
    """Join path parts under `base`, refusing any result outside of it."""
    base_resolved = base.resolve()
    candidate = base_resolved.joinpath(*parts).resolve()
    if candidate != base_resolved and base_resolved not in candidate.parents:
        raise UnsafePathError("Path escapes the workspace directory")
    return candidate
