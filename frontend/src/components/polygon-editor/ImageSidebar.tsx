import { Search } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ImageRecord } from '../../types/project'

interface ImageSidebarProps {
  images: ImageRecord[]
  currentId: string
  thumbnailUrl: (image: ImageRecord) => string
  onOpen: (imageId: string) => void
  className?: string
}

const statusDot: Record<ImageRecord['status'], string> = {
  annotated: 'bg-emerald-400',
  negative: 'bg-violet-400',
  pending: 'bg-amber-400',
}

const SidebarItem = memo(function SidebarItem({
  image,
  active,
  thumbnail,
  onOpen,
}: {
  image: ImageRecord
  active: boolean
  thumbnail: string
  onOpen: (imageId: string) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={() => onOpen(image.id)}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full items-center gap-2 rounded-md p-1.5 text-left ${
          active ? 'bg-accent-500/15 ring-1 ring-accent-500' : 'hover:bg-surface-800'
        }`}
      >
        <img src={thumbnail} alt="" loading="lazy" className="size-10 shrink-0 rounded bg-surface-950 object-cover" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-slate-200">{image.filename}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className={`size-1.5 rounded-full ${statusDot[image.status]}`} aria-hidden />
            {image.status === 'negative' ? 'no objects' : `${image.annotationCount} obj`}
          </span>
        </span>
      </button>
    </li>
  )
})

export function ImageSidebar({ images, currentId, thumbnailUrl, onOpen, className = '' }: ImageSidebarProps) {
  const [search, setSearch] = useState('')
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? images.filter((img) => img.filename.toLowerCase().includes(needle)) : images
  }, [images, search])
  const done = images.filter((img) => img.status !== 'pending').length

  return (
    <aside aria-label="Images" className={`flex-col border-r border-surface-700 bg-surface-900 ${className}`}>
      <div className="flex flex-col gap-2 border-b border-surface-700 p-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold tracking-wide uppercase">Images</span>
          <span>
            {done}/{images.length} done
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-slate-500" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter images"
            className="field-input py-1 pl-7 text-xs"
          />
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {visible.map((image) => (
          <SidebarItem
            key={image.id}
            image={image}
            active={image.id === currentId}
            thumbnail={thumbnailUrl(image)}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </aside>
  )
}
