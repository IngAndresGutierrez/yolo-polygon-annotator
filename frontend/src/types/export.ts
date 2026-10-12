import type { ValidationIssue } from './annotation'

export type ExportFormat = 'detection' | 'segmentation'
export type SplitName = 'train' | 'val' | 'test'
export type SplitCounts = Record<SplitName, number>

export interface SplitRatios {
  train: number
  val: number
  test: number
}

export interface SplitCreate {
  ratios: SplitRatios
  seed: number
  includePending: boolean
}

export interface SplitAssignment {
  imageId: string
  filename: string
  sha256: string
  split: SplitName
}

export interface SplitSummary {
  id: string
  createdAt: string
  seed: number
  ratios: SplitRatios
  counts: SplitCounts
  imageCount: number
}

export interface SplitManifest extends Omit<SplitSummary, 'imageCount'> {
  schemaVersion: 1
  projectId: string
  includePending: boolean
  assignments: SplitAssignment[]
  warnings: string[]
}

export interface ExportCreate {
  format: ExportFormat
  datasetName: string
  splitId: string | null
  split: SplitCreate | null
}

export interface ExportResult {
  id: string
  projectId: string
  format: ExportFormat
  datasetName: string
  splitId: string
  createdAt: string
  counts: SplitCounts
  objectCount: number
  sizeBytes: number
  downloadUrl: string
  warnings: string[]
}

export interface ImageValidation {
  imageId: string
  filename: string
  issues: ValidationIssue[]
}

export interface ProjectValidationReport {
  projectId: string
  valid: boolean
  imageCount: number
  errorCount: number
  warningCount: number
  images: ImageValidation[]
  projectIssues: ValidationIssue[]
}

export interface YoloLabel {
  imageId: string
  filename: string
  format: ExportFormat
  text: string
  objectCount: number
}
