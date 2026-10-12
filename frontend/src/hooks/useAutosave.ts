import { useCallback, useEffect, useRef } from 'react'
import { annotationsApi } from '../services/annotationsApi'
import { ApiError, errorMessage } from '../services/apiClient'
import { selectIsDirty, useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'

export const AUTOSAVE_DELAY_MS = 700

/**
 * Debounced, sequential autosave of the editor store.
 *
 * - At most one request in flight; edits made meanwhile trigger another save.
 * - `flush()` saves immediately and resolves to `false` if the save failed, so
 *   navigation can refuse to drop unsaved work.
 * - Warns before closing the tab with unsaved changes.
 */
export function useAutosave(projectId: string | null): { flush: () => Promise<boolean> } {
  const inFlight = useRef<Promise<boolean> | null>(null)
  const timer = useRef<number | null>(null)

  const saveOnce = useCallback(async (): Promise<boolean> => {
    const state = useEditorStore.getState()
    const { imageId } = state
    if (!projectId || !imageId || !selectIsDirty(state)) return true
    if (state.saveStatus === 'conflict') return false

    const counter = state.changeCounter
    state.markSaving()
    try {
      const result = await annotationsApi.save(projectId, imageId, {
        annotations: state.annotations,
        negative: state.negative,
        baseRevision: state.revision,
      })
      const doc = result.document
      useEditorStore.getState().markSaved(imageId, counter, doc.revision)
      useProjectStore.getState().updateImage(imageId, {
        annotationCount: doc.annotations.length,
        status: doc.annotations.length > 0 ? 'annotated' : doc.negative ? 'negative' : 'pending',
        revision: doc.revision,
      })
      return true
    } catch (error) {
      const conflict = error instanceof ApiError && error.isConflict
      useEditorStore.getState().markSaveError(imageId, errorMessage(error), conflict)
      return false
    }
  }, [projectId])

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    // Chain behind any in-flight save, then save until nothing is dirty
    // (edits made during a request are picked up by the next iteration).
    for (;;) {
      while (inFlight.current) await inFlight.current
      if (!selectIsDirty(useEditorStore.getState())) return true
      const run = saveOnce().finally(() => {
        inFlight.current = null
      })
      inFlight.current = run
      if (!(await run)) return false
    }
  }, [saveOnce])

  useEffect(
    () =>
      useEditorStore.subscribe((state, prev) => {
        const changed = state.changeCounter !== prev.changeCounter
        const transformEnded = prev.pendingTransform !== null && state.pendingTransform === null
        if (!(changed || transformEnded) || !selectIsDirty(state)) return
        if (state.pendingTransform) return // wait for the drag to finish
        if (timer.current !== null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          timer.current = null
          void flush()
        }, AUTOSAVE_DELAY_MS)
      }),
    [flush],
  )

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (selectIsDirty(useEditorStore.getState())) event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return { flush }
}
