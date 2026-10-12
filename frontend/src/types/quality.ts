import type { ImageValidation } from './export'

export type DuplicateKind = 'exact' | 'near'

export interface DuplicateGroup {
  kind: DuplicateKind
  imageIds: string[]
  /** Server suggestion: annotated > no objects > pending, then more objects, resolution, oldest. */
  keepId: string
  maxDistance: number
}

export interface QualityReport {
  projectId: string
  exactGroups: DuplicateGroup[]
  nearGroups: DuplicateGroup[]
  invalidImages: ImageValidation[]
  excludedCount: number
  issueCount: number
}
