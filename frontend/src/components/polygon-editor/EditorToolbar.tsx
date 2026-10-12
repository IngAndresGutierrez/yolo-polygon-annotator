import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  MousePointer2,
  PanelLeft,
  PenTool,
  Redo2,
  Save,
  Scan,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { modKeyLabel } from '../../hooks/useKeyboardShortcuts'
import { selectCanRedo, selectCanUndo, selectIsDirty, useEditorStore } from '../../stores/editorStore'
import { ZOOM_STEP, useViewportStore } from '../../stores/viewportStore'
import { IconButton } from '../ui/Button'

interface EditorToolbarProps {
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
  onSave: () => void
  onToggleSidebar: () => void
}

const Divider = () => <span className="mx-1 h-6 w-px bg-surface-600" aria-hidden />

export function EditorToolbar({ hasPrevious, hasNext, onPrevious, onNext, onSave, onToggleSidebar }: EditorToolbarProps) {
  const state = useEditorStore(
    useShallow((s) => ({
      mode: s.mode,
      canUndo: selectCanUndo(s),
      canRedo: selectCanRedo(s),
      hasSelection: s.selectedId !== null,
      dirty: selectIsDirty(s),
      draftPoints: s.draft.length,
    })),
  )
  const { setMode, undo, redo, deleteSelected } = useEditorStore(
    useShallow((s) => ({ setMode: s.setMode, undo: s.undo, redo: s.redo, deleteSelected: s.deleteSelected })),
  )
  const { scale, zoomCentered, fit, setActualSize } = useViewportStore(
    useShallow((s) => ({
      scale: s.viewport.scale,
      zoomCentered: s.zoomCentered,
      fit: s.fit,
      setActualSize: s.setActualSize,
    })),
  )

  return (
    <div
      role="toolbar"
      aria-label="Editor tools"
      className="flex h-12 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-surface-700 bg-surface-900 px-2"
    >
      <IconButton icon={PanelLeft} label="Toggle image list" onClick={onToggleSidebar} className="lg:hidden" />
      <IconButton icon={MousePointer2} label="Select / edit" shortcut="V" active={state.mode === 'select'} onClick={() => setMode('select')} />
      <IconButton icon={PenTool} label="Draw polygon (4 clicks)" shortcut="N" active={state.mode === 'draw'} onClick={() => setMode('draw')} />
      {state.mode === 'draw' && (
        <span className="px-2 text-xs whitespace-nowrap text-amber-300" role="status">
          Point {state.draftPoints + 1} of 4 · Esc to cancel
        </span>
      )}
      <Divider />
      <IconButton icon={Undo2} label="Undo" shortcut={`${modKeyLabel}+Z`} disabled={!state.canUndo} onClick={undo} />
      <IconButton icon={Redo2} label="Redo" shortcut={`${modKeyLabel}+Shift+Z`} disabled={!state.canRedo} onClick={redo} />
      <IconButton icon={Trash2} label="Delete selected" shortcut="Del" disabled={!state.hasSelection} onClick={deleteSelected} />
      <Divider />
      <IconButton icon={ZoomOut} label="Zoom out" shortcut="-" onClick={() => zoomCentered(1 / ZOOM_STEP)} />
      <span className="w-12 text-center font-mono text-xs text-slate-400" aria-label="Zoom level">
        {Math.round(scale * 100)}%
      </span>
      <IconButton icon={ZoomIn} label="Zoom in" shortcut="+" onClick={() => zoomCentered(ZOOM_STEP)} />
      <IconButton icon={Maximize} label="Fit image" shortcut="F" onClick={fit} />
      <IconButton icon={Scan} label="Actual size (100%)" shortcut="1" onClick={setActualSize} />
      <div className="ml-auto flex items-center gap-0.5">
        <IconButton icon={Save} label={state.dirty ? 'Save now' : 'All changes saved'} shortcut={`${modKeyLabel}+S`} disabled={!state.dirty} onClick={onSave} />
        <Divider />
        <IconButton icon={ChevronLeft} label="Previous image" shortcut="A" disabled={!hasPrevious} onClick={onPrevious} />
        <IconButton icon={ChevronRight} label="Next image" shortcut="D" disabled={!hasNext} onClick={onNext} />
      </div>
    </div>
  )
}
