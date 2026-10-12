import { ImageOff, Search } from 'lucide-react'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { navigate } from '../../app/router'
import { DropZone } from '../../components/image-gallery/DropZone'
import { ImageCard } from '../../components/image-gallery/ImageCard'
import { ImportReportPanel } from '../../components/image-gallery/ImportReportPanel'
import { SelectionBar } from '../../components/image-gallery/SelectionBar'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback'
import { useImageActions } from '../../hooks/useImageActions'
import { thumbnailUrl } from '../../services/projectsApi'
import { useProjectStore } from '../../stores/projectStore'
import type { ImageRecord, ImageStatus } from '../../types/project'
import { useImport } from './useImport'

type StatusFilter = 'all' | ImageStatus | 'excluded'

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'annotated', label: 'Annotated' },
  { value: 'negative', label: 'No objects' },
  { value: 'excluded', label: 'Excluded' },
]

/** Status filters only show images in the dataset; excluded ones have their own filter. */
const matchesFilter = (image: ImageRecord, filter: StatusFilter): boolean => {
  if (filter === 'all') return true
  if (filter === 'excluded') return image.excluded
  return !image.excluded && image.status === filter
}

export function GalleryPage() {
  const projectId = useProjectStore((s) => s.projectId)
  const images = useProjectStore((s) => s.images)
  const loading = useProjectStore((s) => s.loading)
  const error = useProjectStore((s) => s.error)
  const { importFiles, progress, report, clearReport } = useImport()
  const { run, busy } = useImageActions()

  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [overwrite, setOverwrite] = useState(false)
  const [toDelete, setToDelete] = useState<ImageRecord[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: images.length, pending: 0, annotated: 0, negative: 0, excluded: 0 }
    images.forEach((img) => {
      result[img.excluded ? 'excluded' : img.status] += 1
    })
    return result
  }, [images])

  const visible = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase()
    return images.filter(
      (img) => matchesFilter(img, filter) && (!needle || img.filename.toLowerCase().includes(needle)),
    )
  }, [images, filter, deferredSearch])

  // Selection only ever refers to images that still exist.
  const selected = useMemo(() => images.filter((img) => selectedIds.has(img.id)), [images, selectedIds])

  const onOpen = useCallback((image: ImageRecord) => navigate({ name: 'editor', imageId: image.id }), [])
  const onDelete = useCallback((image: ImageRecord) => setToDelete([image]), [])
  const onToggleSelect = useCallback(
    (image: ImageRecord) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (!next.delete(image.id)) next.add(image.id)
        return next
      }),
    [],
  )

  const runOnSelection = async (action: 'exclude' | 'include') => {
    if (await run(selected.map((img) => img.id), action, 'manual')) setSelectedIds(new Set())
  }

  const confirmDelete = async () => {
    const targets = toDelete ?? []
    setToDelete(null)
    if (await run(targets.map((img) => img.id), 'delete')) {
      setSelectedIds((prev) => new Set([...prev].filter((id) => !targets.some((t) => t.id === id))))
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Images</h1>
            <p className="text-sm text-slate-400">
              {counts.all} total · {counts.annotated} annotated · {counts.negative} without objects · {counts.pending}{' '}
              pending{counts.excluded > 0 && ` · ${counts.excluded} excluded`}
            </p>
          </div>
        </div>

        <DropZone disabled={!projectId || progress !== null} onFiles={(files) => void importFiles(files, overwrite)}>
          <label className="inline-flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="size-4 accent-sky-500"
            />
            Overwrite existing annotations
          </label>
        </DropZone>

        {progress && (
          <div className="panel flex items-center gap-3 p-3" role="status">
            <Spinner />
            <span className="text-sm text-slate-300">
              Uploading {progress.phase === 'images' ? 'images' : 'annotations'}… {progress.done}/{progress.total}
            </span>
            <progress className="h-1.5 flex-1 accent-sky-500" max={progress.total} value={progress.done} />
          </div>
        )}
        {report && <ImportReportPanel report={report} onClose={clearReport} />}
        {error && <Alert tone="error" title="Could not load the project">{error}</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-slate-500" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by filename…"
              aria-label="Search images by filename"
              className="field-input pl-8"
            />
          </div>
          <div role="tablist" aria-label="Filter by status" className="flex rounded-md border border-surface-600 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  filter === f.value ? 'bg-surface-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {f.label} <span className="text-slate-500">{counts[f.value]}</span>
              </button>
            ))}
          </div>
        </div>

        {selected.length > 0 && (
          <SelectionBar
            count={selected.length}
            visibleCount={visible.length}
            busy={busy}
            onSelectAllVisible={() => setSelectedIds(new Set(visible.map((img) => img.id)))}
            onExclude={() => void runOnSelection('exclude')}
            onInclude={() => void runOnSelection('include')}
            onDelete={() => setToDelete(selected)}
            onClear={() => setSelectedIds(new Set())}
          />
        )}

        {loading && images.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-6" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon={ImageOff} title={images.length === 0 ? 'No images yet' : 'No images match'}>
            {images.length === 0
              ? 'Drop your JPG/PNG images above, then their PASCAL VOC XML files to pre-fill the polygons.'
              : 'Try another search term or status filter.'}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {visible.map((image) => (
              <ImageCard
                key={image.id}
                image={image}
                thumbnailUrl={projectId ? thumbnailUrl(projectId, image) : ''}
                selected={selectedIds.has(image.id)}
                onOpen={onOpen}
                onDelete={onDelete}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete && toDelete.length > 1 ? `Delete ${toDelete.length} images?` : 'Delete image?'}
        message={
          <>
            {toDelete && toDelete.length === 1 ? (
              <span className="font-mono text-slate-200">{toDelete[0]?.filename}</span>
            ) : (
              `${toDelete?.length ?? 0} images`
            )}{' '}
            and their annotations will be removed from the project. This cannot be undone; use{' '}
            <strong>Exclude from dataset</strong> to keep them out of exports reversibly.
          </>
        }
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
