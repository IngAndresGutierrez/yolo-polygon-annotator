import type { ReactNode } from 'react'
import type { ImageRecord } from '../../types/project'

export interface ImageIssueRow {
  image: ImageRecord
  detail: ReactNode
  actions: ReactNode
}

/** Compact list of images with a description and per-row actions. */
export function ImageIssueList({ rows, thumbnailUrl }: { rows: ImageIssueRow[]; thumbnailUrl: (image: ImageRecord) => string }) {
  return (
    <ul className="divide-y divide-surface-700 rounded-lg border border-surface-700 bg-surface-900">
      {rows.map(({ image, detail, actions }) => (
        <li key={image.id} className="flex flex-wrap items-center gap-3 p-2.5">
          <img src={thumbnailUrl(image)} alt="" loading="lazy" className="size-12 shrink-0 rounded bg-surface-950 object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs text-slate-200">{image.filename}</p>
            <div className="text-xs text-slate-400">{detail}</div>
          </div>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </li>
      ))}
    </ul>
  )
}
