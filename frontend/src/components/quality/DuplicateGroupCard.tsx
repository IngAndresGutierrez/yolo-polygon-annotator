import { EyeOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ImageRecord } from '../../types/project'
import type { DuplicateGroup } from '../../types/quality'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/Feedback'

interface DuplicateGroupCardProps {
  group: DuplicateGroup
  images: ReadonlyMap<string, ImageRecord>
  thumbnailUrl: (image: ImageRecord) => string
  busy: boolean
  onExcludeOthers: (keepId: string, others: string[]) => void
  onDeleteOthers: (keepId: string, others: string[]) => void
  onOpen: (imageId: string) => void
  onHide?: () => void
}

/** One group of duplicate images: pick the copy to keep, then exclude or delete the rest. */
export function DuplicateGroupCard({
  group,
  images,
  thumbnailUrl,
  busy,
  onExcludeOthers,
  onDeleteOthers,
  onOpen,
  onHide,
}: DuplicateGroupCardProps) {
  const [keepId, setKeepId] = useState(group.keepId)
  const members = group.imageIds.map((id) => images.get(id)).filter((img): img is ImageRecord => !!img)
  const others = members.filter((img) => img.id !== keepId).map((img) => img.id)
  const radioName = `keep-${group.kind}-${group.imageIds.join('-')}`

  return (
    <li className="panel flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          {members.length} images ·{' '}
          {group.kind === 'exact' ? 'byte-identical' : `perceptual difference ≤ ${group.maxDistance} bits`}
        </span>
        <span>Choose the image to keep</span>
      </div>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {members.map((image) => {
          const keep = image.id === keepId
          return (
            <li key={image.id} className="w-44 shrink-0">
              <label
                className={`flex cursor-pointer flex-col gap-1.5 rounded-md border p-1.5 ${
                  keep ? 'border-emerald-500 bg-emerald-500/10' : 'border-surface-600 opacity-80 hover:opacity-100'
                }`}
              >
                <div className="flex aspect-[4/3] items-center justify-center rounded bg-surface-950">
                  <img src={thumbnailUrl(image)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                </div>
                <span className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={radioName}
                    checked={keep}
                    onChange={() => setKeepId(image.id)}
                    className="accent-emerald-500"
                    aria-label={`Keep ${image.filename}`}
                  />
                  <span className="truncate text-xs text-slate-200" title={image.filename}>
                    {image.filename}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-1">
                  <StatusBadge status={image.status} />
                  <span className="text-[11px] text-slate-500">
                    {image.annotationCount} obj · {image.width}×{image.height}
                  </span>
                </span>
                <span className="flex items-center justify-between text-[11px]">
                  {image.id === group.keepId ? <span className="text-emerald-300">Suggested</span> : <span />}
                  <button type="button" onClick={() => onOpen(image.id)} className="text-slate-400 underline hover:text-white">
                    Open
                  </button>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={EyeOff} disabled={busy || others.length === 0} onClick={() => onExcludeOthers(keepId, others)}>
          Exclude the other {others.length}
        </Button>
        <Button size="sm" variant="danger" icon={Trash2} disabled={busy || others.length === 0} onClick={() => onDeleteOthers(keepId, others)}>
          Delete the other {others.length}
        </Button>
        {onHide && (
          <Button size="sm" variant="ghost" onClick={onHide}>
            Not duplicates — hide
          </Button>
        )}
      </div>
    </li>
  )
}
