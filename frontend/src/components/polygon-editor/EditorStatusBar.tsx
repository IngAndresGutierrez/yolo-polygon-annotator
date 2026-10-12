import { CircleAlert, CircleCheck, CloudOff, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { selectIsDirty, useEditorStore } from '../../stores/editorStore'
import { useViewportStore } from '../../stores/viewportStore'
import { formatCoord } from '../../utils/format'

interface EditorStatusBarProps {
  filename: string
  position: number
  total: number
  invalidCount: number
  onRetrySave: () => void
  onReload: () => void
}

function SaveIndicator({ onRetry, onReload }: { onRetry: () => void; onReload: () => void }) {
  const { status, error, dirty } = useEditorStore(
    useShallow((s) => ({ status: s.saveStatus, error: s.saveError, dirty: selectIsDirty(s) })),
  )
  let content: ReactNode
  if (status === 'conflict') {
    content = (
      <span className="flex items-center gap-1.5 text-rose-300">
        <TriangleAlert className="size-3.5" aria-hidden /> Modified elsewhere
        <button type="button" onClick={onReload} className="underline hover:text-white">
          Reload from server
        </button>
      </span>
    )
  } else if (status === 'error') {
    content = (
      <span className="flex items-center gap-1.5 text-rose-300" title={error ?? undefined}>
        <CloudOff className="size-3.5" aria-hidden /> Not saved
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 underline hover:text-white">
          <RotateCcw className="size-3" aria-hidden /> Retry
        </button>
      </span>
    )
  } else if (status === 'saving') {
    content = (
      <span className="flex items-center gap-1.5 text-sky-300">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Saving…
      </span>
    )
  } else if (dirty) {
    content = <span className="text-amber-300">● Unsaved changes</span>
  } else {
    content = (
      <span className="flex items-center gap-1.5 text-emerald-300">
        <CircleCheck className="size-3.5" aria-hidden /> All changes saved
      </span>
    )
  }
  return (
    <span role="status" aria-live="polite">
      {content}
    </span>
  )
}

export function EditorStatusBar({ filename, position, total, invalidCount, onRetrySave, onReload }: EditorStatusBarProps) {
  const { width, height, count } = useEditorStore(
    useShallow((s) => ({ width: s.width, height: s.height, count: s.annotations.length })),
  )
  const { pointer, scale } = useViewportStore(useShallow((s) => ({ pointer: s.pointer, scale: s.viewport.scale })))
  const inside = pointer && pointer.x >= 0 && pointer.y >= 0 && pointer.x <= width && pointer.y <= height

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 overflow-x-auto border-t border-surface-700 bg-surface-900 px-3 text-xs whitespace-nowrap text-slate-400">
      <SaveIndicator onRetry={onRetrySave} onReload={onReload} />
      <span className="truncate text-slate-300" title={filename}>
        {filename}
      </span>
      <span>
        {position}/{total}
      </span>
      <span>
        {width}×{height}px
      </span>
      <span>{count} object(s)</span>
      {invalidCount > 0 ? (
        <span className="flex items-center gap-1 text-rose-300">
          <CircleAlert className="size-3.5" aria-hidden /> {invalidCount} invalid
        </span>
      ) : (
        count > 0 && <span className="text-emerald-300">All polygons valid</span>
      )}
      <span className="ml-auto font-mono">
        {inside ? `x ${formatCoord(Math.round(pointer.x * 10) / 10)}  y ${formatCoord(Math.round(pointer.y * 10) / 10)}` : '—'}
        {'  ·  '}
        {Math.round(scale * 100)}%
      </span>
    </footer>
  )
}
