"""End-to-end flow through the HTTP API (spec section 13, integration test)."""

from __future__ import annotations

import csv
import io
import zipfile

import yaml
from fastapi.testclient import TestClient

from annotator.core.config import Settings
from annotator.main import create_app
from tests.factories import make_image_bytes, make_voc_xml


def upload_images(client: TestClient, project_id: str, files: dict[str, bytes]):
    payload = [("files", (name, data, "application/octet-stream")) for name, data in files.items()]
    return client.post(f"/api/projects/{project_id}/images", files=payload)


def upload_voc(client: TestClient, project_id: str, files: dict[str, bytes], overwrite=False):
    payload = [("files", (name, data, "application/xml")) for name, data in files.items()]
    return client.post(
        f"/api/projects/{project_id}/annotations/import-voc",
        files=payload,
        params={"overwrite": str(overwrite).lower()},
    )


def read_zip(client: TestClient, url: str) -> zipfile.ZipFile:
    response = client.get(url)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    return zipfile.ZipFile(io.BytesIO(response.content))


def test_full_flow_import_edit_save_reload_export(client: TestClient, project_id: str):
    base = f"/api/projects/{project_id}"

    # 1. Import an image (+ two backgrounds so the split has enough images)
    response = upload_images(
        client,
        project_id,
        {
            "Cars2.png": make_image_bytes(color=(10, 20, 30)),
            "Cars3.png": make_image_bytes(color=(200, 20, 30)),
            "Cars4.jpg": make_image_bytes(fmt="JPEG", color=(20, 200, 30)),
        },
    )
    assert response.status_code == 201, response.text
    imported = {img["filename"]: img for img in response.json()["imported"]}
    assert set(imported) == {"Cars2.png", "Cars3.png", "Cars4.jpg"}
    image_id = imported["Cars2.png"]["id"]
    assert image_id == "cars2"
    assert imported["Cars2.png"]["status"] == "pending"

    # 2. Import its PASCAL VOC XML
    response = upload_voc(
        client,
        project_id,
        {
            "Cars2.xml": make_voc_xml("Cars2.png", [(229, 176, 270, 193)]),
            "Cars3.xml": make_voc_xml("Cars3.png", [(20, 30, 120, 60), (200, 200, 260, 230)]),
            "Ghost.xml": make_voc_xml("Ghost.png", [(1, 1, 50, 50)]),
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert sorted(result["matched"]) == ["Cars2.png", "Cars3.png"]
    assert result["annotationsImported"] == 3
    assert [u["filename"] for u in result["unmatched"]] == ["Ghost.xml"]

    # 3. The box became an editable 4-point polygon in pixel space
    doc = client.get(f"{base}/images/{image_id}/annotations").json()
    annotation = doc["document"]["annotations"][0]
    assert annotation["type"] == "quadrilateral"
    assert annotation["classId"] == 0 and annotation["className"] == "licence"
    assert annotation["points"] == [
        {"x": 229, "y": 176},
        {"x": 270, "y": 176},
        {"x": 270, "y": 193},
        {"x": 229, "y": 193},
    ]
    assert doc["issues"] == []
    revision = doc["document"]["revision"]

    # 4. Modify the four vertices (perspective) — sent in a scrambled order
    edited = [
        {"x": 231.5, "y": 175.0},
        {"x": 228.0, "y": 194.5},
        {"x": 271.25, "y": 177.5},
        {"x": 269.0, "y": 195.0},
    ]
    annotation["points"] = edited

    # 5. Save
    response = client.put(
        f"{base}/images/{image_id}/annotations",
        json={
            "annotations": [annotation],
            "baseRevision": revision,
        },
    )
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["document"]["revision"] == revision + 1
    assert saved["issues"] == []

    # 6. Recover it — from a brand-new app instance on the same workspace (restart)
    settings: Settings = client.app.state.container.settings
    with TestClient(create_app(settings)) as restarted:
        recovered = restarted.get(f"{base}/images/{image_id}/annotations").json()["document"]
    assert recovered["annotations"][0]["id"] == annotation["id"]
    assert recovered["annotations"][0]["points"] == [  # canonical clockwise order from top-left
        {"x": 231.5, "y": 175.0},
        {"x": 271.25, "y": 177.5},
        {"x": 269.0, "y": 195.0},
        {"x": 228.0, "y": 194.5},
    ]

    # Mark Cars4 as an intentional background image
    response = client.put(
        f"{base}/images/cars4/annotations",
        json={
            "annotations": [],
            "negative": True,
        },
    )
    assert response.json()["document"]["negative"] is True

    report = client.get(f"{base}/validation").json()
    assert report["valid"] is True, report

    # Freeze one split and reuse it for both formats
    split = client.post(
        f"{base}/splits",
        json={
            "ratios": {"train": 0.34, "val": 0.33, "test": 0.33},
            "seed": 3,
        },
    ).json()
    assert sum(split["counts"].values()) == 3

    # 7. Export Detection
    det = client.post(
        f"{base}/exports",
        json={
            "format": "detection",
            "datasetName": "Plates v1",
            "splitId": split["id"],
        },
    )
    assert det.status_code == 201, det.text
    # 8. Export Segmentation
    seg = client.post(
        f"{base}/exports",
        json={
            "format": "segmentation",
            "datasetName": "Plates v1",
            "splitId": split["id"],
        },
    )
    assert seg.status_code == 201, seg.text

    # 9. Labels are valid, consistent and reproducible
    det_zip = read_zip(client, det.json()["downloadUrl"])
    seg_zip = read_zip(client, seg.json()["downloadUrl"])
    split_of = {a["imageId"]: a["split"] for a in split["assignments"]}
    root = "plates-v1"

    for archive in (det_zip, seg_zip):
        names = set(archive.namelist())
        assert f"{root}/data.yaml" in names
        assert f"{root}/split_manifest.csv" in names
        for sub in ("images", "labels"):
            for part in ("train", "val", "test"):
                assert f"{root}/{sub}/{part}/" in names
        data = yaml.safe_load(archive.read(f"{root}/data.yaml"))
        assert data["names"] == {0: "licence"} and data["nc"] == 1
        assert data["train"] == "images/train" and data["val"] == "images/val"
        rows = list(
            csv.DictReader(io.StringIO(archive.read(f"{root}/split_manifest.csv").decode()))
        )
        assert {r["image_id"]: r["split"] for r in rows} == split_of
        for image in ("cars2", "cars3", "cars4"):
            part = split_of[image]
            ext = ".jpg" if image == "cars4" else ".png"
            assert f"{root}/images/{part}/{image}{ext}" in names
            assert f"{root}/labels/{part}/{image}.txt" in names

    def label(archive, image):
        return archive.read(f"{root}/labels/{split_of[image]}/{image}.txt").decode()

    # Detection: bbox from extreme coordinates of the edited polygon
    det_line = label(det_zip, "cars2").strip()
    cls, cx, cy, w, h = det_line.split()
    assert cls == "0"
    assert float(cx) == round((228.0 + 271.25) / 2 / 400, 6)
    assert float(w) == round((271.25 - 228.0) / 400, 6)
    assert float(cy) == round((175.0 + 195.0) / 2 / 400, 6)
    assert float(h) == round((195.0 - 175.0) / 400, 6)

    # Segmentation: the 4 edited vertices, canonical order, normalized
    seg_values = [float(v) for v in label(seg_zip, "cars2").split()]
    assert seg_values[0] == 0
    assert seg_values[1:] == [
        round(v / 400, 6) for v in (231.5, 175.0, 271.25, 177.5, 269.0, 195.0, 228.0, 194.5)
    ]
    assert len(label(seg_zip, "cars3").strip().splitlines()) == 2

    # Background image -> empty label file
    assert label(det_zip, "cars4") == ""
    assert label(seg_zip, "cars4") == ""

    # Unix permissions survive extraction: dirs traversable, files readable
    for info in det_zip.infolist():
        mode = info.external_attr >> 16
        assert mode & 0o444 == 0o444
        if info.is_dir():
            assert mode & 0o111 == 0o111

    # Re-exporting with the same split gives identical bytes
    again = client.post(
        f"{base}/exports",
        json={
            "format": "detection",
            "datasetName": "Plates v1",
            "splitId": split["id"],
        },
    )
    again_zip = read_zip(client, again.json()["downloadUrl"])
    for name in det_zip.namelist():
        assert det_zip.read(name) == again_zip.read(name)


def test_export_is_blocked_when_polygons_are_invalid(client: TestClient, project_id: str):
    base = f"/api/projects/{project_id}"
    upload_images(
        client,
        project_id,
        {"a.png": make_image_bytes(color=(1, 2, 3)), "b.png": make_image_bytes(color=(250, 2, 3))},
    )
    dart = [{"x": 10, "y": 10}, {"x": 50, "y": 10}, {"x": 20, "y": 20}, {"x": 10, "y": 50}]
    response = client.put(
        f"{base}/images/a/annotations",
        json={
            "annotations": [
                {"id": "a-1", "classId": 0, "className": "licence", "points": dart},
            ]
        },
    )
    assert response.status_code == 200  # autosave never loses work...
    assert [i["code"] for i in response.json()["issues"]] == ["not_convex"]
    client.put(f"{base}/images/b/annotations", json={"annotations": [], "negative": True})

    report = client.get(f"{base}/validation").json()
    assert report["valid"] is False
    response = client.post(f"{base}/exports", json={"format": "detection"})
    assert response.status_code == 422  # ...but export refuses invalid geometry
    assert response.json()["error"]["details"]["errorCount"] == 1


def test_revision_conflict_is_reported(client: TestClient, project_id: str):
    base = f"/api/projects/{project_id}"
    upload_images(client, project_id, {"a.png": make_image_bytes()})
    client.put(f"{base}/images/a/annotations", json={"annotations": [], "baseRevision": 0})
    stale = client.put(f"{base}/images/a/annotations", json={"annotations": [], "baseRevision": 0})
    assert stale.status_code == 409
    assert stale.json()["error"]["details"] == {"currentRevision": 1}


def test_upload_validation_and_duplicates(client: TestClient, project_id: str):
    png = make_image_bytes()
    response = upload_images(
        client,
        project_id,
        {
            "ok.png": png,
            "copy.png": png,
            "fake.jpg": png,
            "notes.txt": b"hello",
            "../../evil.png": make_image_bytes(color=(9, 9, 9)),
        },
    )
    body = response.json()
    imported = sorted(img["filename"] for img in body["imported"])
    assert imported == ["copy.png", "evil.png", "ok.png"]  # traversal stripped to basename
    rejected = {r["filename"]: r["code"] for r in body["rejected"]}
    assert rejected == {"fake.jpg": "invalid_input", "notes.txt": "unsupported_type"}
    assert any(w["code"] == "exact_duplicate" for w in body["warnings"])

    again = upload_images(client, project_id, {"ok.png": png}).json()
    assert again["rejected"][0]["code"] == "duplicate_filename"


def test_upload_size_limit(client: TestClient, project_id: str):
    big = b"\x89PNG" + b"0" * (3 * 1024 * 1024)
    response = upload_images(client, project_id, {"big.png": big})
    assert response.status_code == 413


def test_unsafe_ids_are_rejected(client: TestClient, project_id: str):
    assert client.get("/api/projects/..%2F..%2Fetc/images").status_code in {400, 404}
    assert client.get("/api/projects/BAD.ID/images").status_code == 400
    response = client.get(f"/api/projects/{project_id}/splits/..%2Fproject")
    assert response.status_code in {400, 404}


def test_voc_import_respects_existing_annotations(client: TestClient, project_id: str):
    upload_images(client, project_id, {"a.png": make_image_bytes()})
    xml = {"a.xml": make_voc_xml("a.png", [(10, 10, 60, 40)])}
    assert upload_voc(client, project_id, xml).json()["matched"] == ["a.png"]
    second = upload_voc(client, project_id, xml).json()
    assert second["skippedExisting"] == ["a.png"]
    third = upload_voc(client, project_id, xml, overwrite=True).json()
    assert third["matched"] == ["a.png"]


def test_voc_import_rejects_xxe(client: TestClient, project_id: str):
    upload_images(client, project_id, {"a.png": make_image_bytes()})
    xxe = b"""<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]>
<annotation><filename>&x;</filename></annotation>"""
    body = upload_voc(client, project_id, {"a.xml": xxe}).json()
    assert body["rejected"][0]["filename"] == "a.xml"


def test_delete_image_and_search(client: TestClient, project_id: str):
    base = f"/api/projects/{project_id}"
    upload_images(
        client,
        project_id,
        {
            "Cars1.png": make_image_bytes(color=(1, 1, 1)),
            "Truck.png": make_image_bytes(color=(99, 1, 1)),
        },
    )
    assert [i["id"] for i in client.get(f"{base}/images", params={"search": "car"}).json()] == [
        "cars1"
    ]
    assert client.delete(f"{base}/images/cars1").status_code == 204
    assert client.get(f"{base}/images/cars1").status_code == 404
    assert client.get(f"{base}/images/truck/file").headers["content-type"] == "image/png"
    assert client.get(f"{base}/images/truck/thumbnail").headers["content-type"] == "image/jpeg"


def test_projects_crud(client: TestClient):
    created = client.post("/api/projects", json={"name": "Plates EU"}).json()
    assert created["id"] == "plates-eu"
    assert client.post("/api/projects", json={"name": "Plates EU"}).json()["id"] == "plates-eu-2"
    ids = [p["id"] for p in client.get("/api/projects").json()]
    assert "plates-eu" in ids
    assert client.delete("/api/projects/plates-eu").status_code == 204
    assert client.get("/api/projects/plates-eu").status_code == 404


def test_fifty_images_default_split(client: TestClient, project_id: str):
    base = f"/api/projects/{project_id}"
    files = {
        f"car{i:02d}.png": make_image_bytes(32, 32, color=(i * 5, 255 - i * 5, i))
        for i in range(50)
    }
    assert len(upload_images(client, project_id, files).json()["imported"]) == 50
    for i in range(50):
        client.put(
            f"{base}/images/car{i:02d}/annotations",
            json={
                "annotations": [
                    {
                        "id": "a-1",
                        "classId": 0,
                        "className": "licence",
                        "points": [
                            {"x": 2, "y": 2},
                            {"x": 30, "y": 2},
                            {"x": 30, "y": 20},
                            {"x": 2, "y": 20},
                        ],
                    },
                ]
            },
        )
    response = client.post(f"{base}/exports", json={"format": "detection"})
    assert response.status_code == 201, response.text
    assert response.json()["counts"] == {"train": 35, "val": 10, "test": 5}
    assert response.json()["objectCount"] == 50


def test_health_exposes_editor_config(client: TestClient):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["classes"] == [{"id": 0, "name": "licence"}]
    assert body["minPolygonArea"] == 16.0
