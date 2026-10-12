from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from annotator.api.dependencies import ContainerDep
from annotator.api.uploads import read_uploads
from annotator.core.errors import NotFoundError
from annotator.models.project import ImageImportResult, ImageRecord

router = APIRouter(prefix="/api/projects/{project_id}/images", tags=["images"])

# Image URLs carry a content-hash query parameter (`?v=`), so responses are immutable.
_IMMUTABLE_CACHE = {"Cache-Control": "private, max-age=31536000, immutable"}
_MEDIA_TYPES = {"jpeg": "image/jpeg", "png": "image/png"}


@router.get("", response_model=list[ImageRecord])
def list_images(
    project_id: str,
    container: ContainerDep,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> list[ImageRecord]:
    return container.images.list(project_id, search)


@router.post("", response_model=ImageImportResult, status_code=status.HTTP_201_CREATED)
async def upload_images(
    project_id: str,
    container: ContainerDep,
    files: Annotated[list[UploadFile], File(description="JPG, JPEG or PNG images")],
) -> ImageImportResult:
    settings = container.settings
    uploads = await read_uploads(files, settings.max_upload_bytes, settings.max_files_per_request)
    return await run_in_threadpool(container.images.import_images, project_id, uploads)


@router.get("/{image_id}", response_model=ImageRecord)
def get_image(project_id: str, image_id: str, container: ContainerDep) -> ImageRecord:
    return container.images.get(project_id, image_id)


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(project_id: str, image_id: str, container: ContainerDep) -> None:
    container.images.delete(project_id, image_id)


@router.get("/{image_id}/file", response_class=FileResponse)
def get_image_file(project_id: str, image_id: str, container: ContainerDep) -> FileResponse:
    record = container.images.get(project_id, image_id)
    path = container.images.file_path(project_id, record)
    if not path.exists():
        raise NotFoundError("Image file is missing from the workspace")
    return FileResponse(path, media_type=_MEDIA_TYPES[record.format], headers=_IMMUTABLE_CACHE)


@router.get("/{image_id}/thumbnail", response_class=FileResponse)
def get_thumbnail(project_id: str, image_id: str, container: ContainerDep) -> FileResponse:
    record = container.images.get(project_id, image_id)
    path = container.images.thumbnail_path(project_id, record)
    if not path.exists():
        raise NotFoundError("Thumbnail is missing from the workspace")
    return FileResponse(path, media_type="image/jpeg", headers=_IMMUTABLE_CACHE)
