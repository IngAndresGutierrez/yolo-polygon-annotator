/**
 * Editor state for the image currently open in the polygon editor.
 *
 * Annotations are kept in ORIGINAL image pixel coordinates. The image itself is
 * never stored here (only its id/size); the canvas loads it from a URL.
 *
 * Change tracking: every edit bumps `changeCounter`; the autosave records the
 * counter it sent, so edits made while a save is in flight stay dirty.
 */
import { create } from 'zustand'
import type { Annotation, ImageAnnotations, Point } from '../types/annotation'
import type { LabelClass } from '../types/project'
import { newAnnotationId } from '../utils/format'
import {
  QUAD_VERTEX_COUNT,
  clampPoint,
  clampTranslation,
  orderQuad,
  translatePoints,
} from '../utils/geometry'

export type EditorMode = 'select' | 'draw'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

interface Snapshot {
  annotations: Annotation[]
  negative: boolean
}

export const HISTORY_LIMIT = 100
export const DEFAULT_CLASS: LabelClass = { id: 0, name: 'licence' }

export interface EditorState {
  imageId: string | null
  width: number
  height: number
  annotations: Annotation[]
  negative: boolean
  revision: number
  selectedId: string | null
  mode: EditorMode
  draft: Point[]
  activeClass: LabelClass
  past: Snapshot[]
  future: Snapshot[]
  /** Snapshot taken when a drag starts; committed to history only if something changed. */
  pendingTransform: Snapshot | null
  changeCounter: number
  savedCounter: number
  saveStatus: SaveStatus
  saveError: string | null
}

export interface EditorActions {
  load: (doc: ImageAnnotations) => void
  reset: () => void
  setMode: (mode: EditorMode) => void
  setActiveClass: (labelClass: LabelClass) => void
  select: (id: string | null) => void
  selectNext: (direction: 1 | -1) => void
  addDraftPoint: (point: Point, minDistance?: number) => void
  removeLastDraftPoint: () => void
  cancelDraft: () => void
  beginTransform: () => void
  setVertex: (id: string, index: number, point: Point) => void
  endTransform: (id: string) => void
  moveAnnotation: (id: string, dx: number, dy: number) => void
  deleteAnnotation: (id: string) => void
  deleteSelected: () => void
  setNegative: (negative: boolean) => void
  undo: () => void
  redo: () => void
  markSaving: () => void
  markSaved: (imageId: string, counter: number, revision: number) => void
  markSaveError: (imageId: string, message: string, conflict: boolean) => void
}

export type EditorStore = EditorState & EditorActions

const initialState: EditorState = {
  imageId: null,
  width: 0,
  height: 0,
  annotations: [],
  negative: false,
  revision: 0,
  selectedId: null,
  mode: 'select',
  draft: [],
  activeClass: DEFAULT_CLASS,
  past: [],
  future: [],
  pendingTransform: null,
  changeCounter: 0,
  savedCounter: 0,
  saveStatus: 'idle',
  saveError: null,
}

const snapshot = (s: EditorState): Snapshot => ({ annotations: s.annotations, negative: s.negative })

const sameSnapshot = (a: Snapshot, b: Snapshot): boolean =>
  a.negative === b.negative && JSON.stringify(a.annotations) === JSON.stringify(b.annotations)

const pushPast = (past: Snapshot[], entry: Snapshot): Snapshot[] => [...past, entry].slice(-HISTORY_LIMIT)

/** State patch for a recorded (undoable) edit. */
function recorded(s: EditorState, next: Partial<Snapshot> & Partial<EditorState>): Partial<EditorState> {
  return {
    ...next,
    past: pushPast(s.past, snapshot(s)),
    future: [],
    changeCounter: s.changeCounter + 1,
  }
}

const updatePoints = (annotations: Annotation[], id: string, fn: (points: Point[]) => Point[]) =>
  annotations.map((a) => (a.id === id ? { ...a, points: fn(a.points) } : a))

export const useEditorStore = create<EditorStore>()((set, get) => ({
  ...initialState,

  load: (doc) =>
    set({
      ...initialState,
      activeClass: get().activeClass,
      imageId: doc.imageId,
      width: doc.width,
      height: doc.height,
      annotations: doc.annotations,
      negative: doc.negative,
      revision: doc.revision,
      saveStatus: 'saved',
    }),

  reset: () => set({ ...initialState, activeClass: get().activeClass }),

  setMode: (mode) => set({ mode, draft: [], selectedId: mode === 'draw' ? null : get().selectedId }),

  setActiveClass: (activeClass) => set({ activeClass }),

  select: (selectedId) => set({ selectedId }),

  selectNext: (direction) => {
    const { annotations, selectedId } = get()
    if (annotations.length === 0) return
    const index = annotations.findIndex((a) => a.id === selectedId)
    const next = index === -1 ? (direction === 1 ? 0 : annotations.length - 1) : index + direction
    const wrapped = (next + annotations.length) % annotations.length
    set({ selectedId: annotations[wrapped]?.id ?? null })
  },

  addDraftPoint: (point, minDistance = 0) => {
    const s = get()
    if (s.mode !== 'draw' || !s.imageId) return
    const clamped = clampPoint(point, s.width, s.height)
    const last = s.draft[s.draft.length - 1]
    if (last && Math.hypot(last.x - clamped.x, last.y - clamped.y) <= Math.max(minDistance, 1e-9)) return
    const draft = [...s.draft, clamped]
    if (draft.length < QUAD_VERTEX_COUNT) {
      set({ draft })
      return
    }
    const annotation: Annotation = {
      id: newAnnotationId(),
      classId: s.activeClass.id,
      className: s.activeClass.name,
      type: 'quadrilateral',
      points: orderQuad(draft),
    }
    set(
      recorded(s, {
        annotations: [...s.annotations, annotation],
        negative: false,
        draft: [],
        mode: 'select',
        selectedId: annotation.id,
      }),
    )
  },

  removeLastDraftPoint: () => set((s) => ({ draft: s.draft.slice(0, -1) })),

  cancelDraft: () => set({ draft: [] }),

  beginTransform: () => set((s) => ({ pendingTransform: snapshot(s) })),

  setVertex: (id, index, point) =>
    set((s) => ({
      annotations: updatePoints(s.annotations, id, (points) =>
        points.map((p, i) => (i === index ? clampPoint(point, s.width, s.height) : p)),
      ),
      changeCounter: s.changeCounter + 1,
    })),

  endTransform: (id) =>
    set((s) => {
      const annotations = updatePoints(s.annotations, id, orderQuad)
      const before = s.pendingTransform
      if (!before) return { annotations }
      if (sameSnapshot(before, { annotations, negative: s.negative })) {
        return { annotations, pendingTransform: null }
      }
      return {
        annotations,
        pendingTransform: null,
        past: pushPast(s.past, before),
        future: [],
        changeCounter: s.changeCounter + 1,
      }
    }),

  moveAnnotation: (id, dx, dy) => {
    const s = get()
    const target = s.annotations.find((a) => a.id === id)
    if (!target) return
    const offset = clampTranslation(target.points, dx, dy, s.width, s.height)
    if (offset.x === 0 && offset.y === 0) return
    set(recorded(s, { annotations: updatePoints(s.annotations, id, (p) => translatePoints(p, offset.x, offset.y)) }))
  },

  deleteAnnotation: (id) => {
    const s = get()
    if (!s.annotations.some((a) => a.id === id)) return
    set(
      recorded(s, {
        annotations: s.annotations.filter((a) => a.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      }),
    )
  },

  deleteSelected: () => {
    const { selectedId, deleteAnnotation } = get()
    if (selectedId) deleteAnnotation(selectedId)
  },

  setNegative: (negative) => {
    const s = get()
    if (s.negative === negative || (negative && s.annotations.length > 0)) return
    set(recorded(s, { negative }))
  },

  undo: () =>
    set((s) => {
      const previous = s.past[s.past.length - 1]
      if (!previous) return {}
      const selectedId = previous.annotations.some((a) => a.id === s.selectedId) ? s.selectedId : null
      return {
        ...previous,
        selectedId,
        past: s.past.slice(0, -1),
        future: [snapshot(s), ...s.future],
        draft: [],
        changeCounter: s.changeCounter + 1,
      }
    }),

  redo: () =>
    set((s) => {
      const [next, ...rest] = s.future
      if (!next) return {}
      const selectedId = next.annotations.some((a) => a.id === s.selectedId) ? s.selectedId : null
      return {
        ...next,
        selectedId,
        past: pushPast(s.past, snapshot(s)),
        future: rest,
        changeCounter: s.changeCounter + 1,
      }
    }),

  markSaving: () => set({ saveStatus: 'saving', saveError: null }),

  markSaved: (imageId, counter, revision) =>
    set((s) => {
      if (s.imageId !== imageId) return {}
      const dirty = s.changeCounter !== counter
      return { savedCounter: counter, revision, saveStatus: dirty ? 'idle' : 'saved', saveError: null }
    }),

  markSaveError: (imageId, message, conflict) =>
    set((s) => (s.imageId === imageId ? { saveStatus: conflict ? 'conflict' : 'error', saveError: message } : {})),
}))

export const selectIsDirty = (s: EditorState): boolean => s.changeCounter !== s.savedCounter
export const selectCanUndo = (s: EditorState): boolean => s.past.length > 0
export const selectCanRedo = (s: EditorState): boolean => s.future.length > 0
export const selectSelectedAnnotation = (s: EditorState): Annotation | null =>
  s.annotations.find((a) => a.id === s.selectedId) ?? null
