import { PackageOpen } from 'lucide-react'
import type { FormEvent } from 'react'
import type { ExportFormat, SplitRatios, SplitSummary } from '../../types/export'
import { formatDateTime } from '../../utils/format'
import { ratiosSum, targetCounts } from '../../utils/split'
import { Button } from '../ui/Button'

export interface ExportFormValues {
  format: ExportFormat
  datasetName: string
  splitMode: 'new' | 'existing'
  splitId: string
  /** Percentages (0–100) as typed by the user. */
  ratios: SplitRatios
  seed: number
  includePending: boolean
}

interface ExportFormProps {
  values: ExportFormValues
  onChange: (values: ExportFormValues) => void
  onSubmit: () => void
  splits: SplitSummary[]
  exportableCount: number
  totalCount: number
  busy: boolean
  disabled: boolean
}

const FORMATS: { value: ExportFormat; title: string; description: string }[] = [
  {
    value: 'detection',
    title: 'YOLO Detection',
    description: 'Axis-aligned box from the polygon extremes: class xc yc w h',
  },
  {
    value: 'segmentation',
    title: 'YOLO Segmentation',
    description: 'The 4 original vertices in clockwise order: class x1 y1 … x4 y4',
  },
]

export function ExportForm({ values, onChange, onSubmit, splits, exportableCount, totalCount, busy, disabled }: ExportFormProps) {
  const set = <K extends keyof ExportFormValues>(key: K, value: ExportFormValues[K]) => onChange({ ...values, [key]: value })
  const setRatio = (key: keyof SplitRatios, value: number) => set('ratios', { ...values.ratios, [key]: value })

  const sum = ratiosSum(values.ratios)
  const ratiosValid = Math.abs(sum - 100) < 1e-6 && values.ratios.train > 0 && values.ratios.val > 0 && values.ratios.test >= 0
  const imageCount = values.includePending ? totalCount : exportableCount
  const preview = targetCounts(imageCount, {
    train: values.ratios.train / 100,
    val: values.ratios.val / 100,
    test: values.ratios.test / 100,
  })
  const canSubmit =
    !disabled && !busy && values.datasetName.trim() !== '' && (values.splitMode === 'existing' ? !!values.splitId : ratiosValid)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit) onSubmit()
  }

  return (
    <form onSubmit={submit} aria-labelledby="export-title" className="panel flex flex-col gap-5 p-4">
      <h2 id="export-title" className="text-sm font-semibold text-white">
        2. Dataset
      </h2>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-medium text-slate-400">Format</legend>
        {FORMATS.map((f) => (
          <label
            key={f.value}
            className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
              values.format === f.value ? 'border-accent-500 bg-accent-500/10' : 'border-surface-600 hover:border-surface-600/80'
            }`}
          >
            <input
              type="radio"
              name="format"
              value={f.value}
              checked={values.format === f.value}
              onChange={() => set('format', f.value)}
              className="mt-0.5 accent-sky-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-100">{f.title}</span>
              <span className="block text-xs text-slate-400">{f.description}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-slate-500 sm:col-span-2">
          YOLO OBB is not available: a perspective quadrilateral is not a rotated rectangle. See the README.
        </p>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-slate-400">Dataset name</span>
        <input
          className="field-input max-w-sm"
          value={values.datasetName}
          maxLength={64}
          onChange={(e) => set('datasetName', e.target.value)}
          required
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-xs font-medium text-slate-400">Train / val / test split</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="split-mode" checked={values.splitMode === 'new'} onChange={() => set('splitMode', 'new')} className="accent-sky-500" />
            New split
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="split-mode"
              checked={values.splitMode === 'existing'}
              disabled={splits.length === 0}
              onChange={() => set('splitMode', 'existing')}
              className="accent-sky-500"
            />
            Reuse a frozen split {splits.length === 0 && <span className="text-xs text-slate-500">(none yet)</span>}
          </label>
        </div>

        {values.splitMode === 'new' ? (
          <div className="flex flex-col gap-3">
            <div className="grid max-w-lg grid-cols-4 gap-2">
              {(['train', 'val', 'test'] as const).map((key) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400 capitalize">{key} %</span>
                  <input
                    type="number"
                    min={key === 'test' ? 0 : 1}
                    max={100}
                    step={1}
                    className="field-input"
                    value={values.ratios[key]}
                    onChange={(e) => setRatio(key, Number(e.target.value))}
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Seed</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="field-input"
                  value={values.seed}
                  onChange={(e) => set('seed', Math.max(0, Math.trunc(Number(e.target.value))))}
                />
              </label>
            </div>
            {!ratiosValid && <p className="text-xs text-rose-300">Percentages must add up to 100 (now {sum}); train and val must be &gt; 0.</p>}
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={values.includePending}
                onChange={(e) => set('includePending', e.target.checked)}
                className="size-4 accent-sky-500"
              />
              Include pending (unreviewed) images as backgrounds — not recommended
            </label>
            <p className="text-xs text-slate-400" aria-live="polite">
              {imageCount} image(s) → <strong className="text-slate-200">train {preview.train}</strong> ·{' '}
              <strong className="text-slate-200">val {preview.val}</strong> · <strong className="text-slate-200">test {preview.test}</strong>
              <span className="text-slate-500"> (exact duplicates stay together; counts may shift slightly)</span>
            </p>
          </div>
        ) : (
          <label className="flex max-w-lg flex-col gap-1">
            <span className="text-xs text-slate-400">Frozen split</span>
            <select className="field-input" value={values.splitId} onChange={(e) => set('splitId', e.target.value)}>
              {splits.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDateTime(s.createdAt)} · seed {s.seed} · {s.counts.train}/{s.counts.val}/{s.counts.test}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">Use the same split for Detection and Segmentation to keep partitions identical.</span>
          </label>
        )}
      </fieldset>

      <div>
        <Button type="submit" variant="primary" icon={PackageOpen} disabled={!canSubmit}>
          {busy ? 'Exporting…' : 'Export ZIP'}
        </Button>
      </div>
    </form>
  )
}
