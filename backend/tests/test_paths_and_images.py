from __future__ import annotations

import io

import pytest
from PIL import Image

from annotator.core.errors import InvalidInputError, UnsafePathError
from annotator.storage.paths import safe_join, sanitize_filename, slugify, validate_identifier
from annotator.utils.images import inspect_image
from tests.factories import make_image_bytes


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Cars2.png", "Cars2.png"),
        ("../../etc/passwd.png", "passwd.png"),
        ("C:\\Users\\me\\plate.jpg", "plate.jpg"),
        ("/abs/path/img.jpeg", "img.jpeg"),
    ],
)
def test_sanitize_filename_keeps_only_basename(raw, expected):
    assert sanitize_filename(raw) == expected


@pytest.mark.parametrize(
    "raw", ["", "..", ".", ".hidden.png", "bad\x00name.png", "a/..", "x" * 300]
)
def test_sanitize_filename_rejects_unsafe_names(raw):
    with pytest.raises(UnsafePathError):
        sanitize_filename(raw)


@pytest.mark.parametrize("value", ["../x", "a/b", "UPPER", "", "-lead", "a" * 65, "a.b"])
def test_validate_identifier_rejects_unsafe_ids(value):
    with pytest.raises(UnsafePathError):
        validate_identifier(value)


def test_safe_join_blocks_traversal(tmp_path):
    assert safe_join(tmp_path, "a", "b.json") == (tmp_path / "a" / "b.json").resolve()
    with pytest.raises(UnsafePathError):
        safe_join(tmp_path, "..", "outside.json")
    with pytest.raises(UnsafePathError):
        safe_join(tmp_path, "/etc/passwd")


def test_slugify():
    assert slugify("Cars 2 (copy).PNG") == "cars-2-copy-png"
    assert slugify("Matrícula ñandú") == "matricula-nandu"
    assert slugify("***") == "item"


def test_inspect_image_detects_format_and_size():
    inspected = inspect_image(make_image_bytes(64, 32, "PNG"), ".png", max_pixels=10_000)
    assert (inspected.format, inspected.width, inspected.height) == ("png", 64, 32)
    assert len(inspected.sha256) == 64 and len(inspected.dhash) == 16


def test_inspect_image_rejects_extension_mismatch():
    with pytest.raises(InvalidInputError, match="does not match"):
        inspect_image(make_image_bytes(10, 10, "PNG"), ".jpg", max_pixels=10_000)


def test_inspect_image_rejects_garbage_and_oversized():
    with pytest.raises(InvalidInputError):
        inspect_image(b"not an image", ".png", max_pixels=10_000)
    with pytest.raises(InvalidInputError, match="too large"):
        inspect_image(make_image_bytes(200, 200, "PNG"), ".png", max_pixels=1_000)


def test_inspect_image_applies_exif_orientation():
    image = Image.new("RGB", (60, 20), (200, 10, 10))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90° clockwise when displayed
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif.tobytes())
    inspected = inspect_image(buffer.getvalue(), ".jpg", max_pixels=10_000)
    assert inspected.reoriented
    assert (inspected.width, inspected.height) == (20, 60)
