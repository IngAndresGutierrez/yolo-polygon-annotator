from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from annotator.api.dependencies import Container
from annotator.api.routes import annotations, exports, images, projects
from annotator.core.config import Settings, get_settings
from annotator.core.errors import register_error_handlers
from annotator.models.base import ApiModel
from annotator.models.classes import LabelClass


class HealthResponse(ApiModel):
    status: str
    version: str
    classes: list[LabelClass]
    min_polygon_area: float
    max_upload_bytes: int


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        settings.ensure_directories()
        container = Container.build(settings)
        container.projects.ensure_default()
        app.state.container = container
        yield

    app = FastAPI(
        title="YOLO Polygon Annotator API",
        version="0.1.0",
        description="Local API to annotate licence plates with 4-point polygons and export "
        "Ultralytics YOLO Detection / Segmentation datasets.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )
    register_error_handlers(app)

    @app.get("/api/health", response_model=HealthResponse, tags=["health"])
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            version=app.version,
            classes=list(settings.classes),
            min_polygon_area=settings.min_polygon_area,
            max_upload_bytes=settings.max_upload_bytes,
        )

    for module in (projects, images, annotations, exports):
        app.include_router(module.router)
    return app


app = create_app()
