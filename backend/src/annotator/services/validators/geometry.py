"""Pure geometry for quadrilateral annotations.

Coordinates live in image pixel space: origin at the top-left corner, x grows
to the right and y grows downwards. An image of size W x H covers the
continuous range [0, W] x [0, H].

Canonical vertex order (shared with the frontend, see
`frontend/src/utils/geometry.ts`): vertices are sorted by angle around their
centroid, which in a y-down system walks the contour **clockwise on screen**,
and the sequence starts at the vertex with the smallest `x + y` (the visual
top-left corner; ties broken by smaller y, then smaller x). For an
axis-aligned box this yields: top-left, top-right, bottom-right, bottom-left.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

EPSILON = 1e-9

Coord = tuple[float, float]


@dataclass(frozen=True)
class GeometryIssue:
    code: str
    message: str


def polygon_area(points: Sequence[Coord]) -> float:
    """Unsigned polygon area (shoelace formula)."""
    return abs(signed_area(points))


def signed_area(points: Sequence[Coord]) -> float:
    total = 0.0
    count = len(points)
    for i in range(count):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % count]
        total += x1 * y2 - x2 * y1
    return total / 2.0


def _cross(o: Coord, a: Coord, b: Coord) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _on_segment(p: Coord, q: Coord, r: Coord) -> bool:
    """Whether q lies on segment pr, given p, q, r are collinear."""
    return (
        min(p[0], r[0]) - EPSILON <= q[0] <= max(p[0], r[0]) + EPSILON
        and min(p[1], r[1]) - EPSILON <= q[1] <= max(p[1], r[1]) + EPSILON
    )


def _sign(value: float) -> int:
    if value > EPSILON:
        return 1
    if value < -EPSILON:
        return -1
    return 0


def segments_intersect(p1: Coord, p2: Coord, q1: Coord, q2: Coord) -> bool:
    """Whether closed segments p1p2 and q1q2 share at least one point."""
    d1 = _sign(_cross(q1, q2, p1))
    d2 = _sign(_cross(q1, q2, p2))
    d3 = _sign(_cross(p1, p2, q1))
    d4 = _sign(_cross(p1, p2, q2))
    if d1 != d2 and d3 != d4 and d1 != 0 and d2 != 0 and d3 != 0 and d4 != 0:
        return True
    return (
        (d1 == 0 and _on_segment(q1, p1, q2))
        or (d2 == 0 and _on_segment(q1, p2, q2))
        or (d3 == 0 and _on_segment(p1, q1, p2))
        or (d4 == 0 and _on_segment(p1, q2, p2))
    )


def is_self_intersecting(points: Sequence[Coord]) -> bool:
    """Whether any pair of non-adjacent edges of the closed polygon intersect."""
    count = len(points)
    edges = [(points[i], points[(i + 1) % count]) for i in range(count)]
    for i in range(count):
        for j in range(i + 1, count):
            adjacent = j == i + 1 or (i == 0 and j == count - 1)
            if adjacent:
                continue
            if segments_intersect(*edges[i], *edges[j]):
                return True
    return False


def is_strictly_convex(points: Sequence[Coord]) -> bool:
    """All turns go the same direction and no three consecutive points are collinear."""
    count = len(points)
    if count < 3:
        return False
    signs = {
        _sign(_cross(points[i], points[(i + 1) % count], points[(i + 2) % count]))
        for i in range(count)
    }
    return signs in ({1}, {-1})


def order_quad(points: Sequence[Coord]) -> list[Coord]:
    """Return the points in canonical order (see module docstring)."""
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    by_angle = sorted(points, key=lambda p: (math.atan2(p[1] - cy, p[0] - cx), p[0], p[1]))
    start = min(
        range(len(by_angle)),
        key=lambda i: (by_angle[i][0] + by_angle[i][1], by_angle[i][1], by_angle[i][0]),
    )
    return by_angle[start:] + by_angle[:start]


def is_canonical_order(points: Sequence[Coord]) -> bool:
    return list(points) == order_quad(points)


def bounding_box(points: Sequence[Coord]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def validate_quad(
    points: Sequence[Coord],
    width: float,
    height: float,
    min_area: float,
) -> list[GeometryIssue]:
    """Validate a quadrilateral annotation; an empty list means valid."""
    issues: list[GeometryIssue] = []
    if len(points) != 4:
        return [GeometryIssue("vertex_count", f"Expected 4 vertices, got {len(points)}")]

    outside = [
        i + 1
        for i, (x, y) in enumerate(points)
        if x < -EPSILON or y < -EPSILON or x > width + EPSILON or y > height + EPSILON
    ]
    if outside:
        issues.append(
            GeometryIssue(
                "out_of_bounds",
                f"Vertices {outside} are outside the image ({width:g}x{height:g})",
            )
        )

    duplicates = [i + 1 for i in range(4) if math.dist(points[i], points[(i + 1) % 4]) <= EPSILON]
    if duplicates:
        issues.append(
            GeometryIssue("duplicate_points", f"Consecutive vertices coincide at {duplicates}")
        )
        return issues

    if is_self_intersecting(points):
        issues.append(GeometryIssue("self_intersecting", "Polygon edges cross each other"))
    elif not is_strictly_convex(points):
        issues.append(
            GeometryIssue("not_convex", "Polygon must be convex (no dents or collinear vertices)")
        )

    area = polygon_area(points)
    if area < min_area:
        issues.append(
            GeometryIssue(
                "area_too_small", f"Area {area:.1f}px² is below the minimum {min_area:g}px²"
            )
        )

    if not issues and not is_canonical_order(points):
        issues.append(
            GeometryIssue("non_canonical_order", "Vertices are not in canonical clockwise order")
        )
    return issues
