from __future__ import annotations

import itertools

import pytest

from annotator.services.validators.geometry import (
    is_canonical_order,
    is_self_intersecting,
    is_strictly_convex,
    order_quad,
    polygon_area,
    segments_intersect,
    validate_quad,
)

SQUARE = [(10.0, 10.0), (50.0, 10.0), (50.0, 30.0), (10.0, 30.0)]


def codes(points, width=100, height=100, min_area=16.0):
    return [issue.code for issue in validate_quad(points, width, height, min_area)]


def test_area_of_rectangle():
    assert polygon_area(SQUARE) == pytest.approx(800.0)


def test_valid_rectangle_has_no_issues():
    assert codes(SQUARE) == []


def test_valid_perspective_quad():
    plate = [(12.0, 20.0), (61.5, 14.2), (63.0, 31.0), (13.0, 36.5)]
    assert codes(plate) == []


@pytest.mark.parametrize("permutation", list(itertools.permutations(SQUARE)))
def test_order_quad_is_deterministic_for_any_input_order(permutation):
    assert order_quad(list(permutation)) == SQUARE


def test_order_quad_starts_top_left_and_goes_clockwise_on_screen():
    rotated = [(30.0, 5.0), (55.0, 30.0), (30.0, 55.0), (5.0, 30.0)]
    ordered = order_quad(rotated)
    # Smallest x + y is the left vertex (5,30) tied with top (30,5) -> smaller y wins.
    assert ordered[0] == (30.0, 5.0)
    assert ordered == [(30.0, 5.0), (55.0, 30.0), (30.0, 55.0), (5.0, 30.0)]


def test_order_quad_untangles_bowtie():
    bowtie = [(10.0, 10.0), (50.0, 30.0), (50.0, 10.0), (10.0, 30.0)]
    assert is_self_intersecting(bowtie)
    assert not is_self_intersecting(order_quad(bowtie))


def test_detects_self_intersection():
    bowtie = [(10.0, 10.0), (50.0, 30.0), (50.0, 10.0), (10.0, 30.0)]
    assert "self_intersecting" in codes(bowtie)


def test_detects_concave_quad():
    dart = [(10.0, 10.0), (50.0, 10.0), (20.0, 20.0), (10.0, 50.0)]
    assert not is_self_intersecting(dart)
    assert not is_strictly_convex(dart)
    assert "not_convex" in codes(dart)


def test_detects_collinear_vertices_as_not_convex():
    flat = [(10.0, 10.0), (30.0, 10.0), (50.0, 10.0), (30.0, 40.0)]
    assert "not_convex" in codes(flat)


def test_detects_out_of_bounds():
    assert "out_of_bounds" in codes([(-1.0, 0.0), (50.0, 0.0), (50.0, 20.0), (0.0, 20.0)])
    assert "out_of_bounds" in codes([(0.0, 0.0), (101.0, 0.0), (100.0, 20.0), (0.0, 20.0)])


def test_points_on_the_image_border_are_valid():
    assert codes([(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)]) == []


def test_detects_tiny_area():
    assert "area_too_small" in codes([(0.0, 0.0), (3.0, 0.0), (3.0, 3.0), (0.0, 3.0)])


def test_detects_duplicate_consecutive_points():
    assert codes([(0.0, 0.0), (0.0, 0.0), (30.0, 30.0), (0.0, 30.0)]) == ["duplicate_points"]


def test_wrong_vertex_count():
    assert codes([(0.0, 0.0), (10.0, 0.0), (10.0, 10.0)]) == ["vertex_count"]


def test_non_canonical_order_reported():
    shifted = SQUARE[1:] + SQUARE[:1]
    assert not is_canonical_order(shifted)
    assert codes(shifted) == ["non_canonical_order"]


def test_segment_intersection_cases():
    assert segments_intersect((0, 0), (10, 10), (0, 10), (10, 0))
    assert not segments_intersect((0, 0), (10, 0), (0, 1), (10, 1))
    assert segments_intersect((0, 0), (10, 0), (5, 0), (15, 0))  # collinear overlap
    assert segments_intersect((0, 0), (10, 0), (10, 0), (10, 5))  # touching endpoint
