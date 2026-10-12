import { CircleAlert, CircleCheck, Keyboard, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { modKeyLabel } from '../../hooks/useKeyboardShortcuts'
import { exclusionReasonLabel, useImageActions } from '../../hooks/useImageActions'
import { selectSelectedAnnotation, useEditorStore } from '../../stores/editorStore'
import { useProjectStore } from '../../stores/projectStore'
import { YoloExportSection } from './YoloExportSection'
import type { Annotation } from '../../types/annotation'
import type { IssuesById } from '../../utils/annotationValidation'
import { imageToYolo } from '../../utils/coordinates'
import { formatCoord } from '../../utils/format'

const SHORTCUTS: [string, string][] = [
  ['N', 'Draw polygon'],
  ['V', 'Select / edit'],
  ['Esc', 'Cancel drawing / deselect'],
  ['Del', 'Delete selected (last point while drawing)'],
  [`${modKeyLabel}+Z / ${modKeyLabel}+Shift+Z`, 'Undo / redo'],
  ['[ / ]', 'Previous / next object'],
  ['Arrows', 'Nudge selected 1px (Shift: 10px)'],
  ['A / D', 'Previous / next image'],
  ['Wheel', 'Zoom at pointer'],
  ['Space+drag', 'Pan (or middle mouse / drag empty area)'],
  ['F / 1', 'Fit / 100%'],
  [`${modKeyLabel}+S`, 'Save now'],
]

function AnnotationRow({
  annotation,
  index,
  selected,
  issues,
}: {
  annotation: Annotation
  index: number
  selected: boolean
  issues: IssuesById
}) {
  const select = useEditorStore((s) => s.select)
  const remove = useEditorStore((s) => s.deleteAnnotation)
  const problems = issues.get(annotation.id) ?? []
  const valid = problems.length === 0
  return (
    <li>
      <div
        className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${
          selected ? 'border-accent-500 bg-accent-500/10' : 'border-transparent hover:bg-surface-800'
        }`}
      >
        <button
          type="button"
          onClick={() => select(annotation.id)}
          aria-pressed={selected}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {valid ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-label="Valid" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-400" aria-label="Invalid" />
          )}
          <span className="min-w-0">
            <span className="block text-sm text-slate-200">
              #{index + 1} {annotation.className}{' '}
              <span className="font-mono text-xs text-slate-500">class {annotation.classId}</span>
            </span>
            {problems.map((p) => (
              <span key={p.code} className="block text-xs text-rose-300">
                {p.message}
              </span>
            ))}
          </span>
        </button>
        <button
          type="button"
          onClick={() => remove(annotation.id)}
          aria-label={`Delete object ${index + 1}`}
          title="Delete"
          className="rounded p-1 text-slate-500 hover:bg-surface-700 hover:text-rose-400"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  )
}

/** Toggle whether the open image takes part in the dataset (validation, splits, exports). */
function DatasetToggle() {
  const imageId = useEditorStore((s) => s.imageId)
  const image = useProjectStore((s) => s.images.find((img) => img.id === imageId))
  const { run, busy } = useImageActions()
  if (!image) return null
  return (
    <section className="border-b border-surface-700 p-3">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Dataset</h2>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          className="size-4 accent-rose-500"
          checked={image.excluded}
          disabled={busy}
          onChange={(e) => void run([image.id], e.target.checked ? 'exclude' : 'include', 'manual')}
        />
        Exclude this image from the dataset
      </label>
      {image.excluded && (
        <p className="mt-1.5 text-xs text-rose-300">
          {exclusionReasonLabel(image.excludedReason)} — not validated or exported; annotations are kept.
        </p>
      )}
    </section>
  )
}

function VertexTable({ annotation, width, height }: { annotation: Annotation; width: number; height: number }) {
  return (
    <table className="w-full text-xs">
      <caption className="mb-1 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
        Vertices (clockwise)
      </caption>
      <thead className="text-slate-500">
        <tr>
          <th className="text-left font-normal">#</th>
          <th className="text-right font-normal">x px</th>
          <th className="text-right font-normal">y px</th>
          <th className="text-right font-normal">x norm</th>
          <th className="text-right font-normal">y norm</th>
        </tr>
      </thead>
      <tbody className="font-mono text-slate-300">
        {annotation.points.map((p, i) => {
          const n = imageToYolo(p, { width, height })
          return (
            <tr key={i}>
              <td>{i + 1}</td>
              <td className="text-right">{formatCoord(p.x)}</td>
              <td className="text-right">{formatCoord(p.y)}</td>
              <td className="text-right">{n.x.toFixed(4)}</td>
              <td className="text-right">{n.y.toFixed(4)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

interface AnnotationPanelProps {
  issues: IssuesById
  /** Saves pending edits; used before exporting so labels match the canvas. */
  onBeforeExport: () => Promise<boolean>
  className?: string
}

export function AnnotationPanel({ issues, onBeforeExport, className = '' }: AnnotationPanelProps) {
  const { annotations, selectedId, negative, width, height, activeClass, setNegative } = useEditorStore(
    useShallow((s) => ({
      annotations: s.annotations,
      selectedId: s.selectedId,
      negative: s.negative,
      width: s.width,
      height: s.height,
      activeClass: s.activeClass,
      setNegative: s.setNegative,
    })),
  )
  const selected = useEditorStore(selectSelectedAnnotation)
  const imageId = useEditorStore((s) => s.imageId)
  const filename = useProjectStore((s) => s.images.find((img) => img.id === imageId)?.filename)

  return (
    <aside aria-label="Annotations" className={`flex flex-col overflow-y-auto border-l border-surface-700 bg-surface-900 ${className}`}>
      <section className="border-b border-surface-700 p-3">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Class</h2>
        <div className="inline-flex items-center gap-2 rounded-md border border-surface-600 px-2 py-1 text-sm">
          <span className="size-2.5 rounded-full bg-emerald-400" aria-hidden />
          {activeClass.name}
          <span className="font-mono text-xs text-slate-500">id {activeClass.id}</span>
        </div>
      </section>

      <section className="border-b border-surface-700 p-3">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          Objects ({annotations.length})
        </h2>
        {annotations.length === 0 ? (
          <p className="text-xs text-slate-500">
            No objects yet. Press <kbd className="kbd">N</kbd> and click the 4 corners of a plate.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {annotations.map((a, i) => (
              <AnnotationRow key={a.id} annotation={a} index={i} selected={a.id === selectedId} issues={issues} />
            ))}
          </ul>
        )}
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            className="size-4 accent-violet-500"
            checked={negative}
            disabled={annotations.length > 0}
            onChange={(e) => setNegative(e.target.checked)}
          />
          This image has no objects (export as background)
        </label>
      </section>

      <DatasetToggle />

      {imageId && filename && (
        <YoloExportSection imageId={imageId} filename={filename} invalid={issues.size > 0} onBeforeExport={onBeforeExport} />
      )}

      {selected && (
        <section className="border-b border-surface-700 p-3">
          <VertexTable annotation={selected} width={width} height={height} />
        </section>
      )}

      <details className="p-3 text-xs">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold tracking-wide text-slate-400 uppercase">
          <Keyboard className="size-4" aria-hidden /> Shortcuts
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="kbd">{keys}</kbd>
              </dt>
              <dd className="text-slate-400">{action}</dd>
            </div>
          ))}
        </dl>
      </details>
    </aside>
  )
}
