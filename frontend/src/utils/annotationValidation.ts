import type { Annotation } from '../types/annotation'
import { type GeometryIssue, validateQuad } from './geometry'

export type IssuesById = ReadonlyMap<string, GeometryIssue[]>

/** Geometry issues for every annotation of an image, keyed by annotation id. */
export function validateAnnotations(
  annotations: readonly Annotation[],
  width: number,
  height: number,
  minArea: number,
): IssuesById {
  const result = new Map<string, GeometryIssue[]>()
  annotations.forEach((annotation) => {
    const issues = validateQuad(annotation.points, width, height, minArea)
    if (issues.length > 0) result.set(annotation.id, issues)
  })
  return result
}
