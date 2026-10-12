import { describe, expect, it } from 'vitest'
import type { Point } from '../src/types/annotation'
import {
  boundingBox,
  clampPoint,
  clampTranslation,
  isCanonicalOrder,
  isSelfIntersecting,
  isStrictlyConvex,
  orderQuad,
  polygonArea,
  segmentsIntersect,
  validateQuad,
} from '../src/utils/geometry'

const p = (x: number, y: number): Point => ({ x, y })
const SQUARE = [p(10, 10), p(50, 10), p(50, 30), p(10, 30)]
const codes = (points: Point[], minArea = 16) => validateQuad(points, 100, 100, minArea).map((i) => i.code)

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]))
}

describe('geometry', () => {
  it('computes polygon area', () => {
    expect(polygonArea(SQUARE)).toBe(800)
  })

  it('accepts a valid rectangle and a perspective quad', () => {
    expect(codes(SQUARE)).toEqual([])
    expect(codes([p(12, 20), p(61.5, 14.2), p(63, 31), p(13, 36.5)])).toEqual([])
  })

  it('orders any permutation into the same canonical clockwise order (TL, TR, BR, BL)', () => {
    for (const perm of permutations(SQUARE)) expect(orderQuad(perm)).toEqual(SQUARE)
  })

  it('matches the backend tie-breaking for diamonds', () => {
    const diamond = [p(30, 5), p(55, 30), p(30, 55), p(5, 30)]
    expect(orderQuad([diamond[2]!, diamond[0]!, diamond[3]!, diamond[1]!])).toEqual(diamond)
  })

  it('untangles a bow-tie by reordering', () => {
    const bowtie = [p(10, 10), p(50, 30), p(50, 10), p(10, 30)]
    expect(isSelfIntersecting(bowtie)).toBe(true)
    expect(codes(bowtie)).toContain('self_intersecting')
    expect(isSelfIntersecting(orderQuad(bowtie))).toBe(false)
  })

  it('rejects concave and collinear quads', () => {
    const dart = [p(10, 10), p(50, 10), p(20, 20), p(10, 50)]
    expect(isStrictlyConvex(dart)).toBe(false)
    expect(codes(dart)).toContain('not_convex')
    expect(codes([p(10, 10), p(30, 10), p(50, 10), p(30, 40)])).toContain('not_convex')
  })

  it('detects out of bounds, tiny area, duplicates and wrong vertex count', () => {
    expect(codes([p(-1, 0), p(50, 0), p(50, 20), p(0, 20)])).toContain('out_of_bounds')
    expect(codes([p(0, 0), p(100, 0), p(100, 100), p(0, 100)])).toEqual([])
    expect(codes([p(0, 0), p(3, 0), p(3, 3), p(0, 3)])).toContain('area_too_small')
    expect(codes([p(0, 0), p(0, 0), p(30, 30), p(0, 30)])).toEqual(['duplicate_points'])
    expect(codes([p(0, 0), p(10, 0), p(10, 10)])).toEqual(['vertex_count'])
  })

  it('reports non-canonical order only for otherwise valid polygons', () => {
    const shifted = [...SQUARE.slice(1), SQUARE[0]!]
    expect(isCanonicalOrder(shifted)).toBe(false)
    expect(codes(shifted)).toEqual(['non_canonical_order'])
  })

  it('handles segment intersection edge cases', () => {
    expect(segmentsIntersect(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(true)
    expect(segmentsIntersect(p(0, 0), p(10, 0), p(0, 1), p(10, 1))).toBe(false)
    expect(segmentsIntersect(p(0, 0), p(10, 0), p(5, 0), p(15, 0))).toBe(true)
    expect(segmentsIntersect(p(0, 0), p(10, 0), p(10, 0), p(10, 5))).toBe(true)
  })

  it('clamps points and translations to the image', () => {
    expect(clampPoint(p(-5, 120), 100, 100)).toEqual(p(0, 100))
    expect(boundingBox(SQUARE)).toEqual({ minX: 10, minY: 10, maxX: 50, maxY: 30 })
    expect(clampTranslation(SQUARE, -50, 200, 100, 100)).toEqual(p(-10, 70))
  })
})
