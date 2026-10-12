import { X } from 'lucide-react'
import type { ImportReport } from '../../features/gallery/useImport'
import type { ImportIssue } from '../../types/project'

function IssueList({ title, issues, tone }: { title: string; issues: ImportIssue[]; tone: string }) {
  if (issues.length === 0) return null
  return (
    <div>
      <h4 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>
        {title} ({issues.length})
      </h4>
      <ul className="max-h-40 space-y-0.5 overflow-auto text-xs text-slate-300">
        {issues.map((issue, index) => (
          <li key={`${issue.filename}-${issue.code}-${index}`}>
            <span className="font-mono text-slate-400">{issue.filename}</span> — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ImportReportPanel({ report, onClose }: { report: ImportReport; onClose: () => void }) {
  const skipped: ImportIssue[] = report.skippedExisting.map((filename) => ({
    filename,
    code: 'skipped_existing',
    message: 'already annotated; enable “Overwrite existing” to replace',
  }))
  const hasDetails = report.rejected.length + report.unmatched.length + report.warnings.length + skipped.length > 0
  return (
    <section aria-label="Import report" className="panel flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-slate-200">
          Imported <strong>{report.imagesImported}</strong> image(s) and <strong>{report.annotationsImported}</strong>{' '}
          annotation(s) from <strong>{report.xmlMatched}</strong> XML file(s).
        </p>
        <button type="button" onClick={onClose} aria-label="Close report" className="text-slate-500 hover:text-white">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {hasDetails && (
        <div className="grid gap-3 md:grid-cols-2">
          <IssueList title="Rejected" issues={report.rejected} tone="text-rose-300" />
          <IssueList title="XML without matching image" issues={report.unmatched} tone="text-amber-300" />
          <IssueList title="Skipped" issues={skipped} tone="text-slate-400" />
          <IssueList title="Warnings" issues={report.warnings} tone="text-amber-300" />
        </div>
      )}
    </section>
  )
}
