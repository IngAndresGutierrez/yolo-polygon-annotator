import type { ImageImportResult, ImageRecord, ProjectSummary, VocImportResult } from '../types/project'
import { API_BASE_URL, api } from './apiClient'

const enc = encodeURIComponent
const projectPath = (projectId: string) => `/api/projects/${enc(projectId)}`

export const projectsApi = {
  list: () => api.get<ProjectSummary[]>('/api/projects'),
  get: (projectId: string) => api.get<ProjectSummary>(projectPath(projectId)),
  create: (name: string) => api.post<ProjectSummary>('/api/projects', { name }),
}

export const imagesApi = {
  list: (projectId: string) => api.get<ImageRecord[]>(`${projectPath(projectId)}/images`),
  upload: (projectId: string, files: readonly File[]) =>
    api.upload<ImageImportResult>(`${projectPath(projectId)}/images`, files),
  remove: (projectId: string, imageId: string) => api.delete(`${projectPath(projectId)}/images/${enc(imageId)}`),
  importVoc: (projectId: string, files: readonly File[], overwrite: boolean) =>
    api.upload<VocImportResult>(`${projectPath(projectId)}/annotations/import-voc?overwrite=${overwrite}`, files),
}

/** Content-addressed URLs: the hash suffix lets the browser cache images forever. */
export const imageFileUrl = (projectId: string, image: ImageRecord): string =>
  `${API_BASE_URL}${projectPath(projectId)}/images/${enc(image.id)}/file?v=${image.sha256.slice(0, 16)}`

export const thumbnailUrl = (projectId: string, image: ImageRecord): string =>
  `${API_BASE_URL}${projectPath(projectId)}/images/${enc(image.id)}/thumbnail?v=${image.sha256.slice(0, 16)}`
