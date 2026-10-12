import type { AnnotationDocument, AnnotationsUpdate } from '../types/annotation'
import { api } from './apiClient'

const path = (projectId: string, imageId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}/annotations`

export const annotationsApi = {
  get: (projectId: string, imageId: string) => api.get<AnnotationDocument>(path(projectId, imageId)),
  save: (projectId: string, imageId: string, update: AnnotationsUpdate) =>
    api.put<AnnotationDocument>(path(projectId, imageId), update),
}
