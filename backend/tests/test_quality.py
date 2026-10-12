"""Dataset cleanup: duplicate grouping, exclusion and bulk actions."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from annotator.models.project import ImageRecord, Project
from annotator.services.quality import (
    exact_duplicate_groups,
    near_duplicate_groups,
    suggest_keep,
)
from tests.factories import make_image_bytes, make_voc_xml

T0 = datetime(2026, 1, 1, tzinfo=UTC)
PLATE = [{"x": 10, "y": 10}, {"x": 60, "y": 10}, {"x": 60, "y": 30}, {"x": 10, "y": 30}]
DART = [{"x": 10, "y": 10}, {"x": 50, "y": 10}, {"x": 20, "y": 20}, {"x": 10, "y": 50}]


def record(image_id: str, sha: str, dhash: str = "0" * 16, **kwargs) -> ImageRecord:
    defaults = {
        "filename": f"{image_id}.png",
        "stored_name": f"{image_id}.png",
        "format": "png",
        "width": 100,
        "height": 100,
        "size_bytes": 1,
        "created_at": T0,
    }
    return ImageRecord(id=image_id, sha256=sha, dhash=dhash, **{**defaults, **kwargs})


def test_suggest_keep_prefers_annotated_then_objects_then_resolution_then_oldest():
    pending = record("a", "s", status="pending")
    annotated = record("b", "s", status="annotated", annotation_count=1)
    richer = record("c", "s", status="annotated", annotation_count=2)
    assert suggest_keep([pending, annotated, richer]).id == "c"
    small = record("d", "s", status="annotated", annotation_count=1, width=50)
    assert suggest_keep([small, annotated]).id == "b"
    newer = record("e", "s", status="annotated", annotation_count=1, created_at=T0 + timedelta(1))
    assert suggest_keep([newer, annotated]).id == "b"


def test_exact_groups_only_for_shared_hashes():
    images = [record("a", "h1"), record("b", "h1"), record("c", "h2")]
    groups = exact_duplicate_groups(images)
    assert [(g.kind, g.image_ids, g.max_distance) for g in groups] == [("exact", ["a", "b"], 0)]


def test_near_groups_are_transitive_and_skip_exact_copies():
    images = [
        record("a", "h1", "ffffffffffffffff"),
        record("a-copy", "h1", "ffffffffffffffff"),  # exact copy: represented once
        record("b", "h2", "fffffffffffffff0"),  # 4 bits from a
        record("c", "h3", "ffffffffffffff00"),  # 4 bits from b, 8 from a
        record("z", "h4", "0000000000000000"),
    ]
    groups = near_duplicate_groups(images, threshold=4)
    assert len(groups) == 1
    assert sorted(groups[0].image_ids) == ["a", "b", "c"]
    assert groups[0].max_distance == 8


def upload(client: TestClient, project_id: str, files: dict[str, bytes]) -> None:
    payload = [("files", (name, data, "application/octet-stream")) for name, data in files.items()]
    assert client.post(f"/api/projects/{project_id}/images", files=payload).status_code == 201


def annotate(client: TestClient, base: str, image_id: str, points=PLATE) -> None:
    response = client.put(
        f"{base}/images/{image_id}/annotations",
        json={
            "annotations": [{"id": "a-1", "classId": 0, "className": "licence", "points": points}]
        },
    )
    assert response.status_code == 200


def bulk(client: TestClient, base: str, ids: list[str], action: str):
    return client.post(f"{base}/images/bulk", json={"imageIds": ids, "action": action})


def test_quality_report_and_resolving_duplicates(client: TestClient, project_id: str):
    base = f"/api/projects/{project_id}"
    png = make_image_bytes(color=(10, 20, 30))
    upload(
        client,
        project_id,
        {
            "a.png": png,
            "a-copy.png": png,
            "b.png": make_image_bytes(color=(200, 20, 30)),
        },
    )
    annotate(client, base, "a")

    report = client.get(f"{base}/quality").json()
    assert len(report["exactGroups"]) == 1
    group = report["exactGroups"][0]
    assert sorted(group["imageIds"]) == ["a", "a-copy"]
    assert group["keepId"] == "a"  # the annotated copy
    assert report["issueCount"] >= 1

    # Exclude the extra copy: the group disappears, the image stays in the project
    result = bulk(client, base, ["a-copy", "missing"], "exclude").json()
    assert result == {"action": "exclude", "updated": ["a-copy"], "notFound": ["missing"]}
    report = client.get(f"{base}/quality").json()
    assert report["exactGroups"] == []
    assert report["excludedCount"] == 1
    image = client.get(f"{base}/images/a-copy").json()
    assert image["excluded"] is True and image["excludedReason"] == "manual"
    summary = client.get(base).json()
    assert summary["excludedCount"] == 1 and summary["imageCount"] == 3

    # Re-include brings the group back
    bulk(client, base, ["a-copy"], "include")
    assert len(client.get(f"{base}/quality").json()["exactGroups"]) == 1
    assert client.get(f"{base}/images/a-copy").json()["excludedReason"] is None

    # Delete removes files and annotations for good
    assert bulk(client, base, ["a-copy"], "delete").json()["updated"] == ["a-copy"]
    assert client.get(f"{base}/images/a-copy").status_code == 404
    assert client.get(f"{base}/quality").json()["exactGroups"] == []


def test_excluded_images_do_not_block_export_and_are_not_exported(client, project_id):
    base = f"/api/projects/{project_id}"
    upload(
        client,
        project_id,
        {f"img{i}.png": make_image_bytes(color=(i * 40, 90, 200 - i * 30)) for i in range(4)},
    )
    for i in range(3):
        annotate(client, base, f"img{i}")
    annotate(client, base, "img3", points=DART)  # invalid polygon

    assert client.get(f"{base}/validation").json()["valid"] is False
    assert [i["imageId"] for i in client.get(f"{base}/quality").json()["invalidImages"]] == ["img3"]

    bulk(client, base, ["img3"], "exclude")
    report = client.get(f"{base}/validation").json()
    assert report["valid"] is True
    assert report["imageCount"] == 3
    assert any(i["code"] == "excluded_images" for i in report["projectIssues"])

    split = client.post(f"{base}/splits", json={"seed": 1}).json()
    assert "img3" not in {a["imageId"] for a in split["assignments"]}
    export = client.post(f"{base}/exports", json={"format": "detection", "splitId": split["id"]})
    assert export.status_code == 201, export.text
    archive = zipfile.ZipFile(io.BytesIO(client.get(export.json()["downloadUrl"]).content))
    assert not any("img3" in name for name in archive.namelist())

    # Excluding an image after freezing a split skips it with a warning
    bulk(client, base, ["img0"], "exclude")
    again = client.post(f"{base}/exports", json={"format": "detection", "splitId": split["id"]})
    assert any("img0.png is excluded" in w for w in again.json()["warnings"])
    assert sum(again.json()["counts"].values()) == 2


def test_bulk_rejects_unknown_actions(client: TestClient, project_id: str):
    response = client.post(
        f"/api/projects/{project_id}/images/bulk", json={"imageIds": ["x"], "action": "nuke"}
    )
    assert response.status_code == 422


def test_project_files_without_exclusion_fields_still_load(client: TestClient, project_id: str):
    upload(client, project_id, {"a.png": make_image_bytes()})
    settings = client.app.state.container.settings
    project_file = settings.projects_dir / project_id / "project.json"
    raw = json.loads(project_file.read_text())
    for image in raw["images"]:
        image.pop("excluded")
        image.pop("excludedReason")
    project_file.write_text(json.dumps(raw))
    project = Project.model_validate_json(project_file.read_text())
    assert project.images[0].excluded is False
    assert client.get(f"/api/projects/{project_id}/images/a").json()["excluded"] is False


def test_voc_import_still_works_for_excluded_images(client: TestClient, project_id: str):
    base = f"/api/projects/{project_id}"
    upload(client, project_id, {"a.png": make_image_bytes()})
    bulk(client, base, ["a"], "exclude")
    files = [("files", ("a.xml", make_voc_xml("a.png", [(10, 10, 60, 40)]), "application/xml"))]
    response = client.post(f"{base}/annotations/import-voc", files=files)
    assert response.json()["matched"] == ["a.png"]
    assert client.get(f"{base}/images/a").json()["excluded"] is True
