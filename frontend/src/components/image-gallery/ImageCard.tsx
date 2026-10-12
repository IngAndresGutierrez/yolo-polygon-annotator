import { EyeOff, Trash2 } from 'lucide-react'
import { memo } from 'react'
import type { ImageRecord } from '../../types/project'
import { StatusBadge } from '../ui/Feedback'

interface ImageCardProps {
  image: ImageRecord
  thumbnailUrl: string
  selected: boolean
  onOpen: (image: ImageRecord) => void
  onDelete: (image: ImageRecord) => void
  onToggleSelect: (image: ImageRecord) => void
}

export const ImageCard = memo(function ImageCard({
  image,
  thumbnailUrl,
  selected,
  onOpen,
  onDelete,
  onToggleSelect,
}: ImageCardProps) {
  return (
    <li
      className={`group relative overflow-hidden rounded-lg border bg-surface-900 transition-colors ${
        selected ? 'border-accent-400 ring-1 ring-accent-400' : 'border-surface-700 hover:border-accent-500/60'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(image)}
        className="block w-full text-left"
        aria-label={`Open ${image.filename} in the editor`}
      >
        <div className="relative flex aspect-[4/3] items-center justify-center bg-surface-950">
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={`max-h-full max-w-full object-contain ${image.excluded ? 'opacity-35 grayscale' : ''}`}
          />
          {image.excluded && (
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-rose-950/80 py-0.5 text-[11px] font-medium text-rose-200">
              <EyeOff className="size-3" aria-hidden /> Excluded
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          <p className="truncate text-xs font-medium text-slate-200" title={image.filename}>
            {image.filename}
          </p>
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={image.status} />
            <span className="text-[11px] text-slate-500">
              {image.annotationCount} obj · {image.width}×{image.height}
            </span>
          </div>
        </div>
      </button>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(image)}
        aria-label={`Select ${image.filename}`}
        className={`absolute top-2 left-2 size-4 accent-sky-500 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${
          selected ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <button
        type="button"
        onClick={() => onDelete(image)}
        aria-label={`Delete ${image.filename}`}
        title="Delete image"
        className="absolute top-2 right-2 rounded-md bg-surface-950/80 p-1.5 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-400 focus-visible:opacity-100"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  )
})
