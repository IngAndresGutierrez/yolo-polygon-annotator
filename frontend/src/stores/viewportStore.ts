import { create } from 'zustand'
import type { Point } from '../types/annotation'
import { type Size, type Viewport, fitViewport, panBy, zoomAt } from '../utils/coordinates'

interface ViewportState {
  viewport: Viewport
  container: Size
  image: Size
  /** While true, the image is re-fitted whenever the container or image size changes. */
  autoFit: boolean
  /** Pointer position in IMAGE pixel coordinates, or null when outside the canvas. */
  pointer: Point | null
  setPointer: (pointer: Point | null) => void
  setContainer: (size: Size) => void
  setImage: (size: Size) => void
  fit: () => void
  zoomAtPoint: (anchor: Point, factor: number) => void
  zoomCentered: (factor: number) => void
  setActualSize: () => void
  pan: (dx: number, dy: number) => void
  setViewport: (viewport: Viewport) => void
}

export const ZOOM_STEP = 1.25

export const useViewportStore = create<ViewportState>()((set, get) => ({
  viewport: { scale: 1, x: 0, y: 0 },
  container: { width: 0, height: 0 },
  image: { width: 0, height: 0 },
  autoFit: true,
  pointer: null,

  setPointer: (pointer) => set({ pointer }),
  setContainer: (container) => {
    set({ container })
    if (get().autoFit) get().fit()
  },
  setImage: (image) => {
    set({ image, autoFit: true })
    get().fit()
  },
  fit: () => {
    const { image, container } = get()
    set({ viewport: fitViewport(image, container), autoFit: true })
  },
  zoomAtPoint: (anchor, factor) => set((s) => ({ viewport: zoomAt(s.viewport, anchor, factor), autoFit: false })),
  zoomCentered: (factor) => {
    const { container } = get()
    get().zoomAtPoint({ x: container.width / 2, y: container.height / 2 }, factor)
  },
  setActualSize: () => {
    const { viewport, container } = get()
    get().zoomAtPoint({ x: container.width / 2, y: container.height / 2 }, 1 / viewport.scale)
  },
  pan: (dx, dy) => set((s) => ({ viewport: panBy(s.viewport, dx, dy), autoFit: false })),
  setViewport: (viewport) => set({ viewport, autoFit: false }),
}))
