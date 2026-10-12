from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from annotator.api.dependencies import ContainerDep
from annotator.models.export import (
    ExportCreate,
    ExportFormat,
    ExportResult,
    SelectionExportCreate,
    SplitCreate,
    SplitManifest,
    SplitSummary,
    YoloLabel,
)
from annotator.models.quality import QualityReport
from annotator.models.validation import ProjectValidationReport
from annotator.storage.paths import slugify

router = APIRouter(prefix="/api/projects/{project_id}", tags=["validation & export"])


@router.get("/validation", response_model=ProjectValidationReport)
def validate_project(project_id: str, container: ContainerDep) -> ProjectValidationReport:
    return container.validation.validate_project(project_id)


@router.get("/quality", response_model=QualityReport)
def quality_report(project_id: str, container: ContainerDep) -> QualityReport:
    """Duplicate groups and invalid images among the images included in the dataset."""
    return container.quality.report(project_id)


@router.get("/splits", response_model=list[SplitSummary])
def list_splits(project_id: str, container: ContainerDep) -> list[SplitSummary]:
    return container.splits.list(project_id)


@router.post("/splits", response_model=SplitManifest, status_code=status.HTTP_201_CREATED)
def create_split(project_id: str, payload: SplitCreate, container: ContainerDep) -> SplitManifest:
    return container.splits.create(project_id, payload)


@router.get("/splits/{split_id}", response_model=SplitManifest)
def get_split(project_id: str, split_id: str, container: ContainerDep) -> SplitManifest:
    return container.splits.get(project_id, split_id)


@router.get("/exports", response_model=list[ExportResult])
def list_exports(project_id: str, container: ContainerDep) -> list[ExportResult]:
    return container.exports.list(project_id)


@router.post("/exports", response_model=ExportResult, status_code=status.HTTP_201_CREATED)
def create_export(project_id: str, payload: ExportCreate, container: ContainerDep) -> ExportResult:
    return container.exports.export(project_id, payload)


@router.get("/exports/{export_id}/download", response_class=FileResponse)
def download_export(project_id: str, export_id: str, container: ContainerDep) -> FileResponse:
    export = container.exports.get(project_id, export_id)
    path = container.exports.zip_path(project_id, export_id)
    filename = f"{export.dataset_name}-{export.format}-{export_id}.zip"
    return FileResponse(path, media_type="application/zip", filename=filename)


@router.delete("/exports/{export_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_export(project_id: str, export_id: str, container: ContainerDep) -> None:
    container.exports.delete(project_id, export_id)


@router.post(
    "/exports/selection",
    response_class=FileResponse,
    responses={200: {"content": {"application/zip": {}}}},
)
async def export_selection(
    project_id: str, payload: SelectionExportCreate, container: ContainerDep
) -> FileResponse:
    """Download chosen images with YOLO labels as a flat ZIP (no split, not stored)."""
    path = await run_in_threadpool(container.exports.export_selection, project_id, payload)
    filename = f"{slugify(payload.dataset_name, fallback='selection')}-{payload.format}.zip"
    return FileResponse(
        path,
        media_type="application/zip",
        filename=filename,
        background=BackgroundTask(path.unlink, missing_ok=True),
    )


@router.get("/images/{image_id}/yolo", response_model=YoloLabel)
def image_yolo_label(
    project_id: str,
    image_id: str,
    container: ContainerDep,
    format: Annotated[ExportFormat, Query()] = "detection",
) -> YoloLabel:
    """YOLO label text of one image, as it would appear in an export."""
    return container.exports.image_label(project_id, image_id, format)
