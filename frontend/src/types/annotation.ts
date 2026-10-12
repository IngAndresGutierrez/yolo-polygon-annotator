/** A point in the pixel space of the ORIGINAL image (never canvas/screen space). */
export interface Point {
  x: number
  y: number
}

export interface Annotation {
  id: string
  classId: number
  className: string
  type: 'quadrilateral'
  points: Point[]
}

/** Internal versioned annotation document (schemaVersion 1), mirrored from the API. */
export interface ImageAnnotations {
  schemaVersion: 1
  imageId: string
  filename: string
  width: number
  height: number
  negative: boolean
  revision: number
  updatedAt: string | null
  annotations: Annotation[]
}

export type Severity = 'error' | 'warning'

export interface ValidationIssue {
  code: string
  message: string
  severity: Severity
  annotationId: string | null
}

export interface AnnotationDocument {
  document: ImageAnnotations
  issues: ValidationIssue[]
}

export interface AnnotationsUpdate {
  annotations: Annotation[]
  negative: boolean
  baseRevision: number | null
}
