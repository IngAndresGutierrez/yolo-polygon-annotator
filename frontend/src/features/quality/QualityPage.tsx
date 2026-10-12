import { CircleCheck, Copy, EyeOff, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { navigate } from '../../app/router'
import { DuplicateGroupCard } from '../../components/quality/DuplicateGroupCard'
import { ImageIssueList, type ImageIssueRow } from '../../components/quality/ImageIssueList'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback'
import { type ExclusionReason, exclusionReasonLabel, useImageActions } from '../../hooks/useImageActions'
import { errorMessage } from '../../services/apiClient'
import { exportApi } from '../../services/exportApi'
import { thumbnailUrl } from '../../services/projectsApi'
import { useProjectStore } from '../../stores/projectStore'
import type { ImageRecord } from '../../types/project'
import type { DuplicateGroup, QualityReport } from '../../types/quality'

interface PendingDelete {
  imageIds: string[]
  description: string
}

const groupKey = (group: DuplicateGroup) => `${group.kind}:${group.imageIds.join(',')}`

function Section({ title, count, description, actions, children }: {
  title: string
  count: number
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {title} <span className="text-slate-500">({count})</span>
          </h2>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function QualityPage() {
  const projectId = useProjectStore((s) => s.projectId)
  const images = useProjectStore((s) => s.images)
  const { run, busy } = useImageActions()
  const [report, setReport] = useState<QualityReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const byId = useMemo(() => new Map(images.map((img) => [img.id, img])), [images])
  const thumb = useCallback((img: ImageRecord) => (projectId ? thumbnailUrl(projectId, img) : ''), [projectId])
  const excluded = useMemo(() => images.filter((img) => img.excluded), [images])

  // State is only set after awaiting, so this is safe to call from an effect.
  const load = useCallback(async () => {
    if (!projectId) return
    try {
      setReport(await exportApi.quality(projectId))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- load() only sets state after awaiting the fetch
    void load()
  }, [load])

  const refresh = async () => {
    setLoading(true)
    await load()
  }

  const act = async (ids: string[], action: 'exclude' | 'include' | 'delete', reason?: ExclusionReason) => {
    if (await run(ids, action, reason)) await load()
  }

  const othersOf = (groups: DuplicateGroup[]) => groups.flatMap((g) => g.imageIds.filter((id) => id !== g.keepId))
  const exactGroups = report?.exactGroups ?? []
  const nearGroups = (report?.nearGroups ?? []).filter((g) => !hidden.has(groupKey(g)))
  const invalidRows: ImageIssueRow[] = (report?.invalidImages ?? []).flatMap((entry) => {
    const image = byId.get(entry.imageId)
    if (!image) return []
    return [
      {
        image,
        detail: entry.issues.map((issue) => issue.message).join(' · '),
        actions: (
          <>
            <Button size="sm" onClick={() => navigate({ name: 'editor', imageId: image.id })}>
              Fix in editor
            </Button>
            <Button size="sm" icon={EyeOff} disabled={busy} onClick={() => void act([image.id], 'exclude', 'invalid')}>
              Exclude
            </Button>
          </>
        ),
      },
    ]
  })
  const excludedRows: ImageIssueRow[] = excluded.map((image) => ({
    image,
    detail: `${exclusionReasonLabel(image.excludedReason)} · ${image.annotationCount} obj`,
    actions: (
      <>
        <Button size="sm" icon={RotateCcw} disabled={busy} onClick={() => void act([image.id], 'include')}>
          Include again
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={Trash2}
          disabled={busy}
          onClick={() => setPendingDelete({ imageIds: [image.id], description: image.filename })}
        >
          Delete
        </Button>
      </>
    ),
  }))

  const clean = report && exactGroups.length === 0 && nearGroups.length === 0 && invalidRows.length === 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Dataset quality</h1>
            <p className="text-sm text-slate-400">
              Remove duplicates and broken images from the dataset. <strong className="text-slate-300">Exclude</strong>{' '}
              keeps the image and its annotations in the project (reversible); <strong className="text-slate-300">Delete</strong>{' '}
              removes them for good.
            </p>
          </div>
          <Button size="sm" variant="ghost" icon={RefreshCw} disabled={loading} onClick={() => void refresh()}>
            Re-check
          </Button>
        </div>

        {error && <Alert tone="error" title="Could not analyse the project">{error}</Alert>}
        {loading && !report && (
          <div className="flex justify-center py-10">
            <Spinner className="size-6" />
          </div>
        )}
        {clean && (
          <Alert tone="success" title="No duplicates or invalid images in the dataset">
            {excluded.length > 0 ? `${excluded.length} image(s) are excluded; see below.` : 'Nothing to clean up.'}
          </Alert>
        )}

        {exactGroups.length > 0 && (
          <Section
            title="Exact duplicates"
            count={exactGroups.length}
            description="Byte-identical files. Keeping more than one copy only adds redundant samples."
            actions={
              <>
                <Button size="sm" variant="primary" icon={EyeOff} disabled={busy} onClick={() => void act(othersOf(exactGroups), 'exclude', 'exact_duplicate')}>
                  Exclude all extra copies
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={Trash2}
                  disabled={busy}
                  onClick={() =>
                    setPendingDelete({ imageIds: othersOf(exactGroups), description: `${othersOf(exactGroups).length} extra copies` })
                  }
                >
                  Delete all extra copies
                </Button>
              </>
            }
          >
            <ul className="flex flex-col gap-3">
              {exactGroups.map((group) => (
                <DuplicateGroupCard
                  key={groupKey(group)}
                  group={group}
                  images={byId}
                  thumbnailUrl={thumb}
                  busy={busy}
                  onOpen={(id) => navigate({ name: 'editor', imageId: id })}
                  onExcludeOthers={(_, others) => void act(others, 'exclude', 'exact_duplicate')}
                  onDeleteOthers={(_, others) => setPendingDelete({ imageIds: others, description: `${others.length} duplicate(s)` })}
                />
              ))}
            </ul>
          </Section>
        )}

        {nearGroups.length > 0 && (
          <Section
            title="Near duplicates"
            count={nearGroups.length}
            description="Visually very similar images (resized, re-encoded or consecutive frames). Review them: different photos can be kept."
            actions={
              <Button size="sm" icon={EyeOff} disabled={busy} onClick={() => void act(othersOf(nearGroups), 'exclude', 'near_duplicate')}>
                Exclude all but the suggested
              </Button>
            }
          >
            <ul className="flex flex-col gap-3">
              {nearGroups.map((group) => (
                <DuplicateGroupCard
                  key={groupKey(group)}
                  group={group}
                  images={byId}
                  thumbnailUrl={thumb}
                  busy={busy}
                  onOpen={(id) => navigate({ name: 'editor', imageId: id })}
                  onExcludeOthers={(_, others) => void act(others, 'exclude', 'near_duplicate')}
                  onDeleteOthers={(_, others) => setPendingDelete({ imageIds: others, description: `${others.length} image(s)` })}
                  onHide={() => setHidden((prev) => new Set(prev).add(groupKey(group)))}
                />
              ))}
            </ul>
          </Section>
        )}

        {invalidRows.length > 0 && (
          <Section
            title="Invalid annotations"
            count={invalidRows.length}
            description="These images block the export. Fix the polygons or exclude the images."
            actions={
              <Button size="sm" icon={EyeOff} disabled={busy} onClick={() => void act(invalidRows.map((r) => r.image.id), 'exclude', 'invalid')}>
                Exclude all
              </Button>
            }
          >
            <ImageIssueList rows={invalidRows} thumbnailUrl={thumb} />
          </Section>
        )}

        <Section
          title="Excluded images"
          count={excluded.length}
          description="Not used for validation, splits or exports. Their annotations are kept."
          actions={
            excluded.length > 0 ? (
              <Button size="sm" icon={RotateCcw} disabled={busy} onClick={() => void act(excluded.map((img) => img.id), 'include')}>
                Include all again
              </Button>
            ) : undefined
          }
        >
          {excludedRows.length > 0 ? (
            <ImageIssueList rows={excludedRows} thumbnailUrl={thumb} />
          ) : (
            <EmptyState icon={report && !clean ? Copy : CircleCheck} title="No excluded images" />
          )}
        </Section>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete images permanently?"
        message={
          <>
            {pendingDelete?.description} will be removed from the project together with their annotations. This cannot be
            undone; use <strong>Exclude</strong> if you might need them later.
          </>
        }
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void act(target.imageIds, 'delete')
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
