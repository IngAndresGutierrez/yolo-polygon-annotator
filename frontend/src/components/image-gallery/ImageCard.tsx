import { Trash2 } from 'lucide-react'
import { memo } from 'react'
import type { ImageRecord } from '../../types/project'
import { StatusBadge } from '../ui/Feedback'

interface ImageCardProps {
  image: ImageRecord
  thumbnailUrl: string
  onOpen: (image: ImageRecord) => void
  onDelete: (image: ImageRecord) => void
}

export const ImageCard = memo(function ImageCard({ image, thumbnailUrl, onOpen, onDelete }: ImageCardProps) {
  return (
    <li className="group relative overflow-hidden rounded-lg border border-surface-700 bg-surface-900 transition-colors hover:border-accent-500/60">
      <button
        type="button"
        onClick={() => onOpen(image)}
        className="block w-full text-left"
        aria-label={`Open ${image.filename} in the editor`}
      >
        <div className="flex aspect-[4/3] items-center justify-center bg-surface-950">
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="max-h-full max-w-full object-contain"
          />
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
