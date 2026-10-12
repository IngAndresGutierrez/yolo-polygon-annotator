import { Download } from 'lucide-react'
import { downloadUrl } from '../../services/exportApi'
import type { ExportResult } from '../../types/export'
import { formatBytes, formatDateTime } from '../../utils/format'

export function ExportResultCard({ result }: { result: ExportResult }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-surface-700 bg-surface-950/50 p-3">
      <div className="min-w-0 text-xs">
        <p className="text-sm text-slate-200">
          <span className="font-medium">{result.datasetName}</span>{' '}
          <span className="rounded bg-surface-700 px-1.5 py-0.5 text-[11px] uppercase">{result.format}</span>
        </p>
        <p className="text-slate-400">
          train {result.counts.train} · val {result.counts.val} · test {result.counts.test} · {result.objectCount}{' '}
          objects · {formatBytes(result.sizeBytes)}
        </p>
        <p className="text-slate-500">
          {formatDateTime(result.createdAt)} · split <span className="font-mono">{result.splitId}</span>
        </p>
      </div>
      <a
        href={downloadUrl(result)}
        download
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-500"
      >
        <Download className="size-4" aria-hidden /> Download ZIP
      </a>
    </div>
  )
}

export function ExportHistory({ exports }: { exports: ExportResult[] }) {
  return (
    <section aria-labelledby="history-title" className="panel flex flex-col gap-3 p-4">
      <h2 id="history-title" className="text-sm font-semibold text-white">
        Previous exports
      </h2>
      {exports.length === 0 ? (
        <p className="text-xs text-slate-500">No exports yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {exports.map((result) => (
            <li key={result.id}>
              <ExportResultCard result={result} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
