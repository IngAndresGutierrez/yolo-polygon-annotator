import { create } from 'zustand'
import { errorMessage } from '../services/apiClient'
import { imagesApi, projectsApi } from '../services/projectsApi'
import type { ImageBulkResult, ImageRecord, ProjectSummary } from '../types/project'

const LAST_PROJECT_KEY = 'yolo-annotator:last-project'

interface ProjectState {
  projects: ProjectSummary[]
  projectId: string | null
  images: ImageRecord[]
  loading: boolean
  error: string | null
  loadProjects: () => Promise<void>
  selectProject: (projectId: string) => Promise<void>
  createProject: (name: string) => Promise<void>
  refreshImages: () => Promise<void>
  addImages: (images: ImageRecord[]) => void
  updateImage: (imageId: string, patch: Partial<ImageRecord>) => void
  removeImage: (imageId: string) => void
  applyBulk: (result: ImageBulkResult, reason?: string) => void
}

/** Only the last project id goes to localStorage; annotations live on the server. */
const rememberProject = (projectId: string) => {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, projectId)
  } catch {
    // Storage may be unavailable (private mode); remembering is best-effort.
  }
}

const recallProject = (): string | null => {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  projectId: null,
  images: [],
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await projectsApi.list()
      set({ projects })
      const remembered = recallProject()
      const target = projects.find((p) => p.id === remembered) ?? projects[0]
      if (target) await get().selectProject(target.id)
      else set({ loading: false })
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
    }
  },

  selectProject: async (projectId) => {
    set({ projectId, images: [], loading: true, error: null })
    rememberProject(projectId)
    await get().refreshImages()
  },

  createProject: async (name) => {
    const project = await projectsApi.create(name)
    set((s) => ({ projects: [...s.projects, project] }))
    await get().selectProject(project.id)
  },

  refreshImages: async () => {
    const { projectId } = get()
    if (!projectId) return
    set({ loading: true })
    try {
      const images = await imagesApi.list(projectId)
      if (get().projectId === projectId) set({ images, loading: false, error: null })
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
    }
  },

  addImages: (images) => set((s) => ({ images: [...s.images, ...images] })),

  updateImage: (imageId, patch) =>
    set((s) => ({ images: s.images.map((img) => (img.id === imageId ? { ...img, ...patch } : img)) })),

  removeImage: (imageId) => set((s) => ({ images: s.images.filter((img) => img.id !== imageId) })),

  applyBulk: (result, reason) =>
    set((s) => {
      const ids = new Set(result.updated)
      if (result.action === 'delete') return { images: s.images.filter((img) => !ids.has(img.id)) }
      const excluded = result.action === 'exclude'
      return {
        images: s.images.map((img) =>
          ids.has(img.id) ? { ...img, excluded, excludedReason: excluded ? (reason ?? 'manual') : null } : img,
        ),
      }
    }),
}))

export const selectCurrentProject = (s: ProjectState): ProjectSummary | null =>
  s.projects.find((p) => p.id === s.projectId) ?? null
