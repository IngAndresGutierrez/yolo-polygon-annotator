from __future__ import annotations

from fastapi import UploadFile

from annotator.core.errors import InvalidInputError, PayloadTooLargeError
from annotator.services.images import UploadedFile

_CHUNK_SIZE = 1024 * 1024


async def read_upload(upload: UploadFile, max_bytes: int) -> UploadedFile:
    """Read an upload in chunks, aborting as soon as it exceeds `max_bytes`."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(_CHUNK_SIZE):
        total += len(chunk)
        if total > max_bytes:
            raise PayloadTooLargeError(
                f"{upload.filename!r} exceeds the {max_bytes // (1024 * 1024) or 1} MB limit"
            )
        chunks.append(chunk)
    return UploadedFile(filename=upload.filename or "", data=b"".join(chunks))


async def read_uploads(
    uploads: list[UploadFile], max_bytes: int, max_files: int
) -> list[UploadedFile]:
    if not uploads:
        raise InvalidInputError("No files were uploaded")
    if len(uploads) > max_files:
        raise InvalidInputError(f"Too many files in one request (max {max_files})")
    return [await read_upload(upload, max_bytes) for upload in uploads]
