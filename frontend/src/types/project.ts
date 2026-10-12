export interface LabelClass {
  id: number
  name: string
}

export type ImageStatus = 'pending' | 'annotated' | 'negative'

export interface ImageRecord {
  id: string
  filename: string
  storedName: string
  format: 'jpeg' | 'png'
  width: number
  height: number
  sizeBytes: number
  sha256: string
  dhash: string
  createdAt: string
  annotationCount: number
  status: ImageStatus
  revision: number
  /** Kept in the project but left out of validation, splits and exports. */
  excluded: boolean
  excludedReason: string | null
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  imageCount: number
  annotatedCount: number
  negativeCount: number
  pendingCount: number
  excludedCount: number
  classes: LabelClass[]
}

export interface ImportIssue {
  filename: string
  code: string
  message: string
}

export interface ImageImportResult {
  imported: ImageRecord[]
  rejected: ImportIssue[]
  warnings: ImportIssue[]
}

export interface VocImportResult {
  matched: string[]
  annotationsImported: number
  skippedExisting: string[]
  unmatched: ImportIssue[]
  rejected: ImportIssue[]
  warnings: ImportIssue[]
}

export type ImageBulkActionName = 'exclude' | 'include' | 'delete'

export interface ImageBulkResult {
  action: ImageBulkActionName
  updated: string[]
  notFound: string[]
}
