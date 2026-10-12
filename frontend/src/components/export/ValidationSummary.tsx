import { CircleAlert, CircleCheck, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { navigate } from '../../app/router'
import type { ProjectValidationReport } from '../../types/export'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Feedback'

interface ValidationSummaryProps {
  report: ProjectValidationReport | null
  loading: boolean
  onRefresh: () => void
}

export function ValidationSummary({ report, loading, onRefresh }: ValidationSummaryProps) {
  return (
    <section aria-labelledby="validation-title" className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="validation-title" className="text-sm font-semibold text-white">
          1. Validation
        </h2>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={ShieldCheck} onClick={() => navigate({ name: 'quality' })}>
            Clean up dataset
          </Button>
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onRefresh} disabled={loading}>
            Re-check
          </Button>
        </div>
      </div>
      {loading && !report ? (
        <Spinner />
      ) : report ? (
        <>
          <p className={`flex items-center gap-2 text-sm ${report.valid ? 'text-emerald-300' : 'text-rose-300'}`}>
            {report.valid ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
            {report.valid
              ? `Ready to export · ${report.warningCount} warning(s)`
              : `${report.errorCount} error(s) must be fixed before exporting`}
          </p>
          {report.projectIssues.length > 0 && (
            <ul className="space-y-1 text-xs">
              {report.projectIssues.map((issue, i) => (
                <li key={`${issue.code}-${i}`} className={`flex gap-1.5 ${issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}`}>
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          {report.images.length > 0 && (
            <ul className="max-h-64 divide-y divide-surface-700 overflow-y-auto rounded-md border border-surface-700">
              {report.images.map((image) => (
                <li key={image.imageId} className="flex items-start justify-between gap-3 p-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-slate-200">{image.filename}</p>
                    {image.issues.map((issue, i) => (
                      <p key={`${issue.code}-${i}`} className={`text-xs ${issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}`}>
                        {issue.message}
                      </p>
                    ))}
                  </div>
                  <Button size="sm" onClick={() => navigate({ name: 'editor', imageId: image.imageId })}>
                    Fix
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  )
}
