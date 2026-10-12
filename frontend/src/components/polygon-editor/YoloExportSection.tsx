import { Clipboard, FileArchive, FileText } from 'lucide-react'
import { useState } from 'react'
import { useYoloExport } from '../../hooks/useYoloExport'
import type { ExportFormat } from '../../types/export'
import { fileStem } from '../../utils/download'
import { FormatToggle } from '../export/FormatToggle'
import { Button } from '../ui/Button'

interface YoloExportSectionProps {
  imageId: string
  filename: string
  /** True when the open image has invalid polygons (the server would refuse the export). */
  invalid: boolean
  /** Persist pending edits first so the label matches what is on screen. */
  onBeforeExport: () => Promise<boolean>
}

/** Copy or download the YOLO label of the open image, or the image + label as a ZIP. */
export function YoloExportSection({ imageId, filename, invalid, onBeforeExport }: YoloExportSectionProps) {
  const [format, setFormat] = useState<ExportFormat>('detection')
  const { busy, copyLabel, downloadLabel, downloadSelection } = useYoloExport()

  const withSave = (action: () => Promise<unknown>) => async () => {
    if (await onBeforeExport()) await action()
  }

  return (
    <section className="border-b border-surface-700 p-3">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">YOLO export (this image)</h2>
      <FormatToggle value={format} onChange={setFormat} />
      {invalid && <p className="mt-2 text-xs text-rose-300">Fix the invalid polygons before exporting.</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" icon={Clipboard} disabled={busy || invalid} onClick={withSave(() => copyLabel(imageId, format))}>
          Copy label
        </Button>
        <Button size="sm" icon={FileText} disabled={busy || invalid} onClick={withSave(() => downloadLabel(imageId, format))}>
          .txt
        </Button>
        <Button
          size="sm"
          icon={FileArchive}
          disabled={busy || invalid}
          onClick={withSave(() => downloadSelection([imageId], format, fileStem(filename)))}
        >
          Image + label
        </Button>
      </div>
    </section>
  )
}
