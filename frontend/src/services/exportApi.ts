import type {
  ExportCreate,
  ExportResult,
  ProjectValidationReport,
  SplitCreate,
  SplitManifest,
  SplitSummary,
} from '../types/export'
import type { QualityReport } from '../types/quality'
import { API_BASE_URL, api } from './apiClient'

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`

export const exportApi = {
  quality: (projectId: string) => api.get<QualityReport>(`${base(projectId)}/quality`),
  validate: (projectId: string) => api.get<ProjectValidationReport>(`${base(projectId)}/validation`),
  listSplits: (projectId: string) => api.get<SplitSummary[]>(`${base(projectId)}/splits`),
  createSplit: (projectId: string, body: SplitCreate) => api.post<SplitManifest>(`${base(projectId)}/splits`, body),
  listExports: (projectId: string) => api.get<ExportResult[]>(`${base(projectId)}/exports`),
  createExport: (projectId: string, body: ExportCreate) => api.post<ExportResult>(`${base(projectId)}/exports`, body),
}

export const downloadUrl = (result: ExportResult): string => `${API_BASE_URL}${result.downloadUrl}`
