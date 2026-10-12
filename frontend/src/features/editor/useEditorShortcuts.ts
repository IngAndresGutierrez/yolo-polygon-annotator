import { type Shortcut, useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useEditorStore } from '../../stores/editorStore'
import { ZOOM_STEP, useViewportStore } from '../../stores/viewportStore'

interface Handlers {
  onPrevious: () => void
  onNext: () => void
  onSave: () => void
}

const editor = () => useEditorStore.getState()
const viewport = () => useViewportStore.getState()

function nudge(dx: number, dy: number, fallback?: () => void) {
  const { selectedId, moveAnnotation } = editor()
  if (selectedId) moveAnnotation(selectedId, dx, dy)
  else fallback?.()
}

export function useEditorShortcuts({ onPrevious, onNext, onSave }: Handlers): void {
  const shortcuts: Shortcut[] = [
    { key: 'n', handler: () => editor().setMode('draw') },
    { key: 'v', handler: () => editor().setMode('select') },
    {
      key: 'Escape',
      handler: () => {
        const s = editor()
        if (s.draft.length > 0) s.cancelDraft()
        else if (s.mode === 'draw') s.setMode('select')
        else s.select(null)
      },
    },
    ...['Delete', 'Backspace'].map(
      (key): Shortcut => ({
        key,
        handler: () => {
          const s = editor()
          if (s.mode === 'draw') s.removeLastDraftPoint()
          else s.deleteSelected()
        },
      }),
    ),
    { key: 'z', mod: true, shift: false, handler: () => editor().undo(), allowRepeat: true },
    { key: 'z', mod: true, shift: true, handler: () => editor().redo(), allowRepeat: true },
    { key: 'y', mod: true, handler: () => editor().redo(), allowRepeat: true },
    { key: 's', mod: true, handler: onSave },
    { key: '[', handler: () => editor().selectNext(-1) },
    { key: ']', handler: () => editor().selectNext(1) },
    { key: 'f', handler: () => viewport().fit() },
    { key: '1', handler: () => viewport().setActualSize() },
    { key: '+', handler: () => viewport().zoomCentered(ZOOM_STEP), allowRepeat: true },
    { key: '=', handler: () => viewport().zoomCentered(ZOOM_STEP), allowRepeat: true },
    { key: '-', handler: () => viewport().zoomCentered(1 / ZOOM_STEP), allowRepeat: true },
    { key: 'a', handler: onPrevious },
    { key: 'd', handler: onNext },
    { key: 'ArrowLeft', shift: false, handler: () => nudge(-1, 0, onPrevious), allowRepeat: true },
    { key: 'ArrowRight', shift: false, handler: () => nudge(1, 0, onNext), allowRepeat: true },
    { key: 'ArrowUp', shift: false, handler: () => nudge(0, -1), allowRepeat: true },
    { key: 'ArrowDown', shift: false, handler: () => nudge(0, 1), allowRepeat: true },
    { key: 'ArrowLeft', shift: true, handler: () => nudge(-10, 0), allowRepeat: true },
    { key: 'ArrowRight', shift: true, handler: () => nudge(10, 0), allowRepeat: true },
    { key: 'ArrowUp', shift: true, handler: () => nudge(0, -10), allowRepeat: true },
    { key: 'ArrowDown', shift: true, handler: () => nudge(0, 10), allowRepeat: true },
  ]
  useKeyboardShortcuts(shortcuts)
}
