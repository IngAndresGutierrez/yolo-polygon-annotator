from __future__ import annotations

import pytest
import yaml

from annotator.services.exporters.yolo import (
    build_data_yaml,
    detection_line,
    detection_values,
    normalize_point,
    segmentation_line,
)

PLATE = [(229.0, 176.0), (270.0, 176.0), (270.0, 193.0), (229.0, 193.0)]


def test_normalize_point():
    assert normalize_point(200, 100, 400, 400) == (0.5, 0.25)


def test_normalize_point_clamps_to_unit_range():
    assert normalize_point(-3, 450, 400, 400) == (0.0, 1.0)


def test_detection_line_for_axis_aligned_box():
    # center (249.5, 184.5), size 41 x 17 on a 400x400 image
    assert detection_line(0, PLATE, 400, 400) == "0 0.623750 0.461250 0.102500 0.042500"


def test_detection_uses_extreme_coordinates_of_perspective_quad():
    quad = [(100.0, 110.0), (200.0, 100.0), (210.0, 140.0), (90.0, 150.0)]
    cx, cy, w, h = detection_values(quad, 400, 200)
    assert (cx, cy) == pytest.approx((150 / 400, 125 / 200))
    assert (w, h) == pytest.approx((120 / 400, 50 / 200))


def test_segmentation_line_keeps_four_vertices_in_canonical_order():
    shuffled = [PLATE[2], PLATE[0], PLATE[3], PLATE[1]]
    line = segmentation_line(0, shuffled, 400, 400)
    assert line == "0 0.572500 0.440000 0.675000 0.440000 0.675000 0.482500 0.572500 0.482500"


def test_all_values_are_normalized():
    for line in (detection_line(0, PLATE, 400, 400), segmentation_line(0, PLATE, 400, 400)):
        class_id, *values = line.split()
        assert class_id == "0"
        assert all(0.0 <= float(v) <= 1.0 for v in values)


def test_data_yaml_is_valid_and_portable():
    parsed = yaml.safe_load(build_data_yaml({0: "licence"}, include_test=True))
    assert parsed == {
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": 1,
        "names": {0: "licence"},
    }
    assert "path" not in parsed  # root = directory of data.yaml


def test_data_yaml_omits_test_when_unused_and_escapes_names():
    parsed = yaml.safe_load(build_data_yaml({0: 'plate "eu"', 1: "car"}, include_test=False))
    assert "test" not in parsed
    assert parsed["names"] == {0: 'plate "eu"', 1: "car"}
    assert parsed["nc"] == 2
