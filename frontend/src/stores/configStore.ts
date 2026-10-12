import { create } from 'zustand'
import { api } from '../services/apiClient'
import type { LabelClass } from '../types/project'

interface HealthResponse {
  status: string
  version: string
  classes: LabelClass[]
  minPolygonArea: number
  maxUploadBytes: number
}

interface ConfigState {
  classes: LabelClass[]
  minPolygonArea: number
  maxUploadBytes: number
  load: () => Promise<void>
}

/** Server-side editor settings, so client validation matches export validation. */
export const useConfigStore = create<ConfigState>()((set) => ({
  classes: [{ id: 0, name: 'licence' }],
  minPolygonArea: 16,
  maxUploadBytes: 25 * 1024 * 1024,
  load: async () => {
    const health = await api.get<HealthResponse>('/api/health')
    set({ classes: health.classes, minPolygonArea: health.minPolygonArea, maxUploadBytes: health.maxUploadBytes })
  },
}))
