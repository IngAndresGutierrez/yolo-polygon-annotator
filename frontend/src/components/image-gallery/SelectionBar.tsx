import { CheckSquare, Download, EyeOff, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '../ui/Button'

interface SelectionBarProps {
  count: number
  visibleCount: number
  busy: boolean
  onSelectAllVisible: () => void
  onExclude: () => void
  onInclude: () => void
  onDelete: () => void
  onExportYolo: () => void
  onClear: () => void
}

/** Bulk actions for the images selected in the gallery. */
export function SelectionBar({
  count,
  visibleCount,
  busy,
  onSelectAllVisible,
  onExclude,
  onInclude,
  onDelete,
  onExportYolo,
  onClear,
}: SelectionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Selected images"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-accent-500/50 bg-surface-800/95 p-2 backdrop-blur"
    >
      <span className="px-1 text-sm text-slate-200">{count} selected</span>
      {count < visibleCount && (
        <Button size="sm" variant="ghost" icon={CheckSquare} onClick={onSelectAllVisible}>
          Select all {visibleCount} shown
        </Button>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" icon={Download} disabled={busy} onClick={onExportYolo}>
          Export YOLO
        </Button>
        <Button size="sm" variant="primary" icon={EyeOff} disabled={busy} onClick={onExclude}>
          Exclude from dataset
        </Button>
        <Button size="sm" icon={RotateCcw} disabled={busy} onClick={onInclude}>
          Include
        </Button>
        <Button size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={onDelete}>
          Delete
        </Button>
        <Button size="sm" variant="ghost" icon={X} onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  )
}
