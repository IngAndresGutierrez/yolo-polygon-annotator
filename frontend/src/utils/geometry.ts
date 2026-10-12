/**
 * Pure quadrilateral geometry, independent of React and Konva.
 *
 * Mirrors `backend/src/annotator/services/validators/geometry.py` so the editor
 * shows the same verdict the export will apply.
 *
 * Coordinates are image pixels: origin top-left, y grows downwards. Canonical
 * vertex order = sorted by angle around the centroid (clockwise on screen),
 * starting at the vertex with the smallest x + y (ties: smaller y, then x).
 * For an axis-aligned box: top-left, top-right, bottom-right, bottom-left.
 */
import type { Point } from '../types/annotation'

export const EPSILON = 1e-9
export const QUAD_VERTEX_COUNT = 4

export type GeometryIssueCode =
  | 'vertex_count'
  | 'out_of_bounds'
  | 'duplicate_points'
  | 'self_intersecting'
  | 'not_convex'
  | 'area_too_small'
  | 'non_canonical_order'

export interface GeometryIssue {
  code: GeometryIssueCode
  message: string
}

export interface BoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const at = <T>(items: readonly T[], index: number): T => items[(index + items.length) % items.length] as T

export function signedArea(points: readonly Point[]): number {
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const a = at(points, i)
    const b = at(points, i + 1)
    total += a.x * b.y - b.x * a.y
  }
  return total / 2
}

export const polygonArea = (points: readonly Point[]): number => Math.abs(signedArea(points))

const cross = (o: Point, a: Point, b: Point): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

const sign = (value: number): -1 | 0 | 1 => (value > EPSILON ? 1 : value < -EPSILON ? -1 : 0)

const onSegment = (p: Point, q: Point, r: Point): boolean =>
  Math.min(p.x, r.x) - EPSILON <= q.x &&
  q.x <= Math.max(p.x, r.x) + EPSILON &&
  Math.min(p.y, r.y) - EPSILON <= q.y &&
  q.y <= Math.max(p.y, r.y) + EPSILON

/** Whether closed segments p1p2 and q1q2 share at least one point. */
export function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = sign(cross(q1, q2, p1))
  const d2 = sign(cross(q1, q2, p2))
  const d3 = sign(cross(p1, p2, q1))
  const d4 = sign(cross(p1, p2, q2))
  if (d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) return true
  return (
    (d1 === 0 && onSegment(q1, p1, q2)) ||
    (d2 === 0 && onSegment(q1, p2, q2)) ||
    (d3 === 0 && onSegment(p1, q1, p2)) ||
    (d4 === 0 && onSegment(p1, q2, p2))
  )
}

export function isSelfIntersecting(points: readonly Point[]): boolean {
  const n = points.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (adjacent) continue
      if (segmentsIntersect(at(points, i), at(points, i + 1), at(points, j), at(points, j + 1))) {
        return true
      }
    }
  }
  return false
}

/** All turns in the same direction and no three consecutive collinear vertices. */
export function isStrictlyConvex(points: readonly Point[]): boolean {
  if (points.length < 3) return false
  const signs = new Set<number>()
  for (let i = 0; i < points.length; i++) {
    signs.add(sign(cross(at(points, i), at(points, i + 1), at(points, i + 2))))
  }
  return signs.size === 1 && !signs.has(0)
}

export function orderQuad(points: readonly Point[]): Point[] {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length
  const byAngle = [...points].sort((a, b) => {
    const angleDiff = Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
    return angleDiff !== 0 ? angleDiff : a.x - b.x || a.y - b.y
  })
  let start = 0
  byAngle.forEach((p, i) => {
    const best = at(byAngle, start)
    const key = p.x + p.y
    const bestKey = best.x + best.y
    if (key < bestKey || (key === bestKey && (p.y < best.y || (p.y === best.y && p.x < best.x)))) {
      start = i
    }
  })
  return [...byAngle.slice(start), ...byAngle.slice(0, start)].map((p) => ({ x: p.x, y: p.y }))
}

export function isCanonicalOrder(points: readonly Point[]): boolean {
  const ordered = orderQuad(points)
  return ordered.every((p, i) => p.x === at(points, i).x && p.y === at(points, i).y)
}

export function boundingBox(points: readonly Point[]): BoundingBox {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

export function clampPoint(point: Point, width: number, height: number): Point {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
  }
}

/** Translate a polygon, limiting the offset so the polygon stays inside the image. */
export function clampTranslation(
  points: readonly Point[],
  dx: number,
  dy: number,
  width: number,
  height: number,
): Point {
  const box = boundingBox(points)
  return {
    x: Math.min(Math.max(dx, -box.minX), width - box.maxX),
    y: Math.min(Math.max(dy, -box.minY), height - box.maxY),
  }
}

export function translatePoints(points: readonly Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

export function validateQuad(
  points: readonly Point[],
  width: number,
  height: number,
  minArea: number,
): GeometryIssue[] {
  if (points.length !== QUAD_VERTEX_COUNT) {
    return [{ code: 'vertex_count', message: `Expected 4 vertices, got ${points.length}` }]
  }
  const issues: GeometryIssue[] = []
  const outside = points
    .map((p, i) => ({ p, i: i + 1 }))
    .filter(({ p }) => p.x < -EPSILON || p.y < -EPSILON || p.x > width + EPSILON || p.y > height + EPSILON)
    .map(({ i }) => i)
  if (outside.length > 0) {
    issues.push({ code: 'out_of_bounds', message: `Vertices ${outside.join(', ')} are outside the image` })
  }

  const duplicates = points
    .map((p, i) => ({ i: i + 1, d: Math.hypot(p.x - at(points, i + 1).x, p.y - at(points, i + 1).y) }))
    .filter(({ d }) => d <= EPSILON)
    .map(({ i }) => i)
  if (duplicates.length > 0) {
    issues.push({ code: 'duplicate_points', message: `Consecutive vertices coincide at ${duplicates.join(', ')}` })
    return issues
  }

  if (isSelfIntersecting(points)) {
    issues.push({ code: 'self_intersecting', message: 'Polygon edges cross each other' })
  } else if (!isStrictlyConvex(points)) {
    issues.push({ code: 'not_convex', message: 'Polygon must be convex (no dents or collinear vertices)' })
  }

  const area = polygonArea(points)
  if (area < minArea) {
    issues.push({
      code: 'area_too_small',
      message: `Area ${area.toFixed(1)}px² is below the minimum ${minArea}px²`,
    })
  }

  if (issues.length === 0 && !isCanonicalOrder(points)) {
    issues.push({ code: 'non_canonical_order', message: 'Vertices are not in canonical clockwise order' })
  }
  return issues
}
