"""Exporting a single image or a selection of images in YOLO format."""

from __future__ import annotations

import io
import zipfile

from fastapi.testclient import TestClient

from annotator.services.exports import build_classes_txt
from tests.factories import make_image_bytes

PLATE = [{"x": 229, "y": 176}, {"x": 270, "y": 176}, {"x": 270, "y": 193}, {"x": 229, "y": 193}]
DART = [{"x": 10, "y": 10}, {"x": 50, "y": 10}, {"x": 20, "y": 20}, {"x": 10, "y": 50}]


def setup_images(client: TestClient, project_id: str) -> str:
    base = f"/api/projects/{project_id}"
    files = [
        ("files", (name, make_image_bytes(color=color, fmt=fmt), "application/octet-stream"))
        for name, color, fmt in [
            ("a.png", (10, 20, 30), "PNG"),
            ("b.jpg", (200, 20, 30), "JPEG"),
            ("c.png", (20, 200, 30), "PNG"),
            ("bad.png", (90, 90, 200), "PNG"),
        ]
    ]
    assert client.post(f"{base}/images", files=files).status_code == 201

    def put(image_id: str, points) -> None:
        body = {
            "annotations": [{"id": "a-1", "classId": 0, "className": "licence", "points": points}]
        }
        assert client.put(f"{base}/images/{image_id}/annotations", json=body).status_code == 200

    put("a", PLATE)
    put("b", PLATE)
    put("bad", DART)
    return base


def test_single_image_label_in_both_formats(client: TestClient, project_id: str):
    base = setup_images(client, project_id)
    det = client.get(f"{base}/images/a/yolo", params={"format": "detection"}).json()
    assert det == {
        "imageId": "a",
        "filename": "a.png",
        "format": "detection",
        "text": "0 0.623750 0.461250 0.102500 0.042500\n",
        "objectCount": 1,
    }
    seg = client.get(f"{base}/images/a/yolo", params={"format": "segmentation"}).json()
    assert (
        seg["text"] == "0 0.572500 0.440000 0.675000 0.440000 0.675000 0.482500 0.572500 0.482500\n"
    )
    # default format is detection
    assert client.get(f"{base}/images/a/yolo").json()["format"] == "detection"


def test_single_image_label_empty_and_errors(client: TestClient, project_id: str):
    base = setup_images(client, project_id)
    empty = client.get(f"{base}/images/c/yolo").json()
    assert empty["text"] == "" and empty["objectCount"] == 0
    invalid = client.get(f"{base}/images/bad/yolo")
    assert invalid.status_code == 422
    assert invalid.json()["error"]["details"]["images"][0]["imageId"] == "bad"
    assert client.get(f"{base}/images/nope/yolo").status_code == 404
    assert client.get(f"{base}/images/a/yolo", params={"format": "obb"}).status_code == 422


def test_selection_zip_layout_and_labels(client: TestClient, project_id: str):
    base = setup_images(client, project_id)
    response = client.post(
        f"{base}/exports/selection",
        json={
            "imageIds": ["b", "a", "c", "a"],
            "format": "segmentation",
            "datasetName": "My Picks",
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert 'filename="my-picks-segmentation.zip"' in response.headers["content-disposition"]

    archive = zipfile.ZipFile(io.BytesIO(response.content))
    assert sorted(archive.namelist()) == [
        "my-picks/classes.txt",
        "my-picks/images/",
        "my-picks/images/a.png",
        "my-picks/images/b.jpg",
        "my-picks/images/c.png",
        "my-picks/labels/",
        "my-picks/labels/a.txt",
        "my-picks/labels/b.txt",
        "my-picks/labels/c.txt",
    ]
    assert archive.read("my-picks/classes.txt") == b"licence\n"
    assert archive.read("my-picks/labels/c.txt") == b""  # no objects -> empty label
    seg_a = client.get(f"{base}/images/a/yolo", params={"format": "segmentation"}).json()["text"]
    assert archive.read("my-picks/labels/a.txt").decode() == seg_a
    assert archive.read("my-picks/images/a.png") == client.get(f"{base}/images/a/file").content
    for info in archive.infolist():
        if info.is_dir():
            assert (info.external_attr >> 16) & 0o111 == 0o111

    # Not stored in the export history
    assert client.get(f"{base}/exports").json() == []


def test_selection_rejects_invalid_and_unknown_images(client: TestClient, project_id: str):
    base = setup_images(client, project_id)
    invalid = client.post(
        f"{base}/exports/selection", json={"imageIds": ["a", "bad"], "format": "detection"}
    )
    assert invalid.status_code == 422
    assert [i["filename"] for i in invalid.json()["error"]["details"]["images"]] == ["bad.png"]
    unknown = client.post(
        f"{base}/exports/selection", json={"imageIds": ["a", "ghost"], "format": "detection"}
    )
    assert unknown.status_code == 404
    empty = client.post(f"{base}/exports/selection", json={"imageIds": [], "format": "detection"})
    assert empty.status_code == 422


def test_single_image_zip_works(client: TestClient, project_id: str):
    base = setup_images(client, project_id)
    response = client.post(
        f"{base}/exports/selection",
        json={"imageIds": ["a"], "format": "detection", "datasetName": "a"},
    )
    names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
    assert "a/images/a.png" in names and "a/labels/a.txt" in names


def test_classes_txt_keeps_ids_as_line_numbers():
    assert build_classes_txt({0: "licence"}) == "licence\n"
    assert build_classes_txt({0: "car", 2: "plate"}) == "car\n\nplate\n"
    assert build_classes_txt({}) == ""
