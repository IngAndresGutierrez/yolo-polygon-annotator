from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from annotator.api.dependencies import ContainerDep
from annotator.api.uploads import read_uploads
from annotator.models.annotation import AnnotationsUpdate
from annotator.models.project import VocImportResult
from annotator.services.annotations import AnnotationDocument

router = APIRouter(prefix="/api/projects/{project_id}", tags=["annotations"])


@router.get("/images/{image_id}/annotations", response_model=AnnotationDocument)
def get_annotations(project_id: str, image_id: str, container: ContainerDep) -> AnnotationDocument:
    return container.annotations.get(project_id, image_id)


@router.put("/images/{image_id}/annotations", response_model=AnnotationDocument)
def save_annotations(
    project_id: str, image_id: str, payload: AnnotationsUpdate, container: ContainerDep
) -> AnnotationDocument:
    return container.annotations.save(project_id, image_id, payload)


@router.delete("/images/{image_id}/annotations", response_model=AnnotationDocument)
def clear_annotations(
    project_id: str, image_id: str, container: ContainerDep
) -> AnnotationDocument:
    return container.annotations.clear(project_id, image_id)


@router.post("/annotations/import-voc", response_model=VocImportResult)
async def import_voc(
    project_id: str,
    container: ContainerDep,
    files: Annotated[list[UploadFile], File(description="PASCAL VOC .xml files")],
    overwrite: Annotated[bool, Query(description="Replace existing annotations")] = False,
) -> VocImportResult:
    settings = container.settings
    uploads = await read_uploads(files, settings.max_xml_bytes, settings.max_files_per_request)
    return await run_in_threadpool(container.annotations.import_voc, project_id, uploads, overwrite)
