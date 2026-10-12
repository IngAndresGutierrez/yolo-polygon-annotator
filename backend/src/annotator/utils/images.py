"""Image inspection: real format detection, safety limits, hashing, thumbnails."""

from __future__ import annotations

import hashlib
import io
import warnings
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from annotator.core.errors import InvalidInputError

ALLOWED_EXTENSIONS = {".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png"}
_PIL_FORMATS = {"JPEG": "jpeg", "PNG": "png"}
STORED_EXTENSION = {"jpeg": ".jpg", "png": ".png"}
_EXIF_ORIENTATION_TAG = 0x0112


@dataclass(frozen=True)
class InspectedImage:
    data: bytes
    format: str
    width: int
    height: int
    sha256: str
    dhash: str
    reoriented: bool


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def difference_hash(image: Image.Image, hash_size: int = 8) -> str:
    """64-bit dHash: robust to resizing/re-encoding, used for near-duplicate warnings."""
    small = image.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    pixels = small.tobytes()  # mode "L": one byte per pixel, row-major
    bits = 0
    for row in range(hash_size):
        for col in range(hash_size):
            left = pixels[row * (hash_size + 1) + col]
            right = pixels[row * (hash_size + 1) + col + 1]
            bits = (bits << 1) | int(left > right)
    return f"{bits:0{hash_size * hash_size // 4}x}"


def hamming_distance(hash_a: str, hash_b: str) -> int:
    return (int(hash_a, 16) ^ int(hash_b, 16)).bit_count()


def inspect_image(data: bytes, extension: str, max_pixels: int) -> InspectedImage:
    """Decode and validate an uploaded image.

    The declared extension must match the decoded format. JPEGs with an EXIF
    orientation are physically rotated so that the pixels stored on disk, the
    browser canvas and the training pipeline all agree on one coordinate frame.
    """
    expected = ALLOWED_EXTENSIONS.get(extension.lower())
    if expected is None:
        raise InvalidInputError(f"Unsupported extension {extension!r} (use .jpg, .jpeg or .png)")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(data))
            detected = _PIL_FORMATS.get(image.format or "")
            if detected is None:
                raise InvalidInputError(f"Unsupported image format {image.format!r}")
            if detected != expected:
                raise InvalidInputError(
                    f"File extension {extension!r} does not match its content ({detected})"
                )
            width, height = image.size
            if width * height > max_pixels:
                raise InvalidInputError(
                    f"Image is too large ({width}x{height}); limit is {max_pixels} pixels"
                )
            image.load()
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise InvalidInputError("File is not a valid or complete image") from exc
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise InvalidInputError("Image exceeds the decompression safety limit") from exc

    reoriented = False
    orientation = image.getexif().get(_EXIF_ORIENTATION_TAG, 1)
    if detected == "jpeg" and orientation not in (1, None):
        transposed = ImageOps.exif_transpose(image)
        buffer = io.BytesIO()
        transposed.convert("RGB").save(buffer, format="JPEG", quality=95)
        data = buffer.getvalue()
        image = transposed
        reoriented = True

    return InspectedImage(
        data=data,
        format=detected,
        width=image.width,
        height=image.height,
        sha256=sha256_hex(data),
        dhash=difference_hash(image),
        reoriented=reoriented,
    )


def make_thumbnail(data: bytes, size: int) -> bytes:
    with Image.open(io.BytesIO(data)) as image:
        thumb = image.convert("RGB")
        thumb.thumbnail((size, size), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        thumb.save(buffer, format="JPEG", quality=82)
        return buffer.getvalue()
