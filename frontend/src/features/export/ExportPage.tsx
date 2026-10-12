import { useCallback, useEffect, useState } from 'react'
import { ExportForm, type ExportFormValues } from '../../components/export/ExportForm'
import { ExportHistory, ExportResultCard } from '../../components/export/ExportHistory'
import { ValidationSummary } from '../../components/export/ValidationSummary'
import { Alert } from '../../components/ui/Feedback'
import { ApiError, errorMessage } from '../../services/apiClient'
import { exportApi } from '../../services/exportApi'
import { useProjectStore } from '../../stores/projectStore'
import { toast } from '../../stores/toastStore'
import type { ExportCreate, ExportResult, ProjectValidationReport, SplitSummary } from '../../types/export'

const INITIAL_VALUES: ExportFormValues = {
  format: 'detection',
  datasetName: 'dataset',
  splitMode: 'new',
  splitId: '',
  ratios: { train: 70, val: 20, test: 10 },
  seed: 42,
  includePending: false,
}

function toRequest(values: ExportFormValues): ExportCreate {
  if (values.splitMode === 'existing') {
    return { format: values.format, datasetName: values.datasetName.trim(), splitId: values.splitId, split: null }
  }
  return {
    format: values.format,
    datasetName: values.datasetName.trim(),
    splitId: null,
    split: {
      ratios: { train: values.ratios.train / 100, val: values.ratios.val / 100, test: values.ratios.test / 100 },
      seed: values.seed,
      includePending: values.includePending,
    },
  }
}

export function ExportPage() {
  const projectId = useProjectStore((s) => s.projectId)
  const images = useProjectStore((s) => s.images)
  const [report, setReport] = useState<ProjectValidationReport | null>(null)
  const [checking, setChecking] = useState(true)
  const [splits, setSplits] = useState<SplitSummary[]>([])
  const [exports, setExports] = useState<ExportResult[]>([])
  const [values, setValues] = useState<ExportFormValues>(INITIAL_VALUES)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // State is only set after awaiting, so this is safe to call from an effect.
  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const [nextReport, nextSplits, nextExports] = await Promise.all([
        exportApi.validate(projectId),
        exportApi.listSplits(projectId),
        exportApi.listExports(projectId),
      ])
      setReport(nextReport)
      setSplits(nextSplits)
      setExports(nextExports)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setChecking(false)
    }
  }, [projectId])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- load() only sets state after awaiting the fetch
    void load()
  }, [load])

  const refresh = useCallback(async () => {
    setChecking(true)
    await load()
  }, [load])

  const submit = async () => {
    if (!projectId) return
    setBusy(true)
    setError(null)
    try {
      const created = await exportApi.createExport(projectId, toRequest(values))
      setResult(created)
      toast.success(`Exported ${created.datasetName} (${created.format})`)
      // Freeze the split used, so the other format can reuse identical partitions.
      setValues((v) => ({ ...v, splitMode: 'existing', splitId: created.splitId }))
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
      if (err instanceof ApiError && err.status === 422) await refresh()
    } finally {
      setBusy(false)
    }
  }

  const exportableCount = images.filter((img) => !img.excluded && img.status !== 'pending').length
  const includedCount = images.filter((img) => !img.excluded).length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Export dataset</h1>
          <p className="text-sm text-slate-400">
            Generates an Ultralytics-ready ZIP: images/ and labels/ per split, data.yaml and split_manifest.csv.
          </p>
        </div>
        <ValidationSummary report={report} loading={checking} onRefresh={() => void refresh()} />
        <ExportForm
          values={values}
          onChange={setValues}
          onSubmit={() => void submit()}
          splits={splits}
          exportableCount={exportableCount}
          totalCount={includedCount}
          busy={busy}
          disabled={!report?.valid}
        />
        {error && <Alert tone="error" title="Export failed">{error}</Alert>}
        {result && (
          <section aria-label="Latest export" className="panel flex flex-col gap-2 p-4">
            <h2 className="text-sm font-semibold text-white">3. Download</h2>
            <ExportResultCard result={result} />
            {result.warnings.length > 0 && (
              <Alert tone="warning" title="Warnings">
                <ul className="list-disc pl-4">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </section>
        )}
        <ExportHistory exports={exports} />
      </div>
    </div>
  )
}
