import { Download } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import type { ExportFormat } from '../../types/export'
import type { ImageRecord } from '../../types/project'
import { slugify } from '../../utils/download'
import { FormatToggle } from '../export/FormatToggle'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

interface ExportSelectionDialogProps {
  open: boolean
  images: ImageRecord[]
  busy: boolean
  onExport: (format: ExportFormat, datasetName: string) => void
  onClose: () => void
}

/** Choose format and folder name for a flat YOLO ZIP of the selected images. */
export function ExportSelectionDialog({ open, images, busy, onExport, onClose }: ExportSelectionDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('detection')
  const [name, setName] = useState('selection')
  const pending = images.filter((img) => img.status === 'pending').length
  const excluded = images.filter((img) => img.excluded).length

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim()) onExport(format, name.trim())
  }

  return (
    <Dialog open={open} title={`Export ${images.length} image(s) in YOLO format`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormatToggle value={format} onChange={setFormat} />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-400">Folder name</span>
          <input className="field-input" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="font-mono text-xs text-slate-400">
          {slugify(name, 'selection')}/images/ · labels/ · classes.txt
        </p>
        {(pending > 0 || excluded > 0) && (
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-300">
            {pending > 0 && <li>{pending} pending image(s) will get an empty label file.</li>}
            {excluded > 0 && <li>{excluded} image(s) are excluded from the dataset but are included here because you selected them.</li>}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          No train/val/test split. For a training-ready dataset with data.yaml use the Export screen.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" icon={Download} disabled={busy || !name.trim()}>
            {busy ? 'Preparing…' : 'Download ZIP'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
