import type { ExportFormat } from '../../types/export'

const OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'detection', label: 'Detection' },
  { value: 'segmentation', label: 'Segmentation' },
]

/** Compact Detection / Segmentation switch. */
export function FormatToggle({ value, onChange }: { value: ExportFormat; onChange: (format: ExportFormat) => void }) {
  return (
    <div role="radiogroup" aria-label="YOLO format" className="inline-flex rounded-md border border-surface-600 p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded px-2.5 py-1 text-xs font-medium ${
            value === option.value ? 'bg-surface-700 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
