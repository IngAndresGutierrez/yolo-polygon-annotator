from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from annotator.core.config import Settings
from annotator.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(workspace_dir=tmp_path / "workspace", max_upload_bytes=2 * 1024 * 1024)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def project_id(client: TestClient) -> str:
    response = client.get("/api/projects")
    assert response.status_code == 200
    return response.json()[0]["id"]
