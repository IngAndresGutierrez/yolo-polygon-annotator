from __future__ import annotations

from fastapi import APIRouter, status

from annotator.api.dependencies import ContainerDep
from annotator.models.project import ProjectCreate, ProjectSummary

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectSummary])
def list_projects(container: ContainerDep) -> list[ProjectSummary]:
    return container.projects.list()


@router.post("", response_model=ProjectSummary, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, container: ContainerDep) -> ProjectSummary:
    return container.projects.create(payload.name)


@router.get("/{project_id}", response_model=ProjectSummary)
def get_project(project_id: str, container: ContainerDep) -> ProjectSummary:
    return container.projects.summary(project_id)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, container: ContainerDep) -> None:
    container.projects.delete(project_id)
