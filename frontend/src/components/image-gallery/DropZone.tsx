import { FileCode2, ImagePlus, UploadCloud } from 'lucide-react'
import { type DragEvent, type ReactNode, useRef, useState } from 'react'
import { Button } from '../ui/Button'

interface DropZoneProps {
  disabled?: boolean
  onFiles: (files: File[]) => void
  children?: ReactNode
}

/** Drop target for images and PASCAL VOC XML files, plus explicit file pickers. */
export function DropZone({ disabled = false, onFiles, children }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const xmlInput = useRef<HTMLInputElement>(null)

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }

  const pick = (input: HTMLInputElement | null) => {
    if (!input?.files) return
    const files = Array.from(input.files)
    input.value = ''
    if (files.length > 0) onFiles(files)
  }

  return (
    <section
      aria-label="Import files"
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors ${
        dragging ? 'border-accent-400 bg-accent-500/10' : 'border-surface-600 bg-surface-900/60'
      }`}
    >
      <UploadCloud className={`size-8 ${dragging ? 'text-accent-400' : 'text-slate-500'}`} aria-hidden />
      <div>
        <p className="font-medium text-slate-200">Drop images and PASCAL VOC XML files here</p>
        <p className="text-xs text-slate-500">JPG, JPEG, PNG · XML annotations are matched to images by filename</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button icon={ImagePlus} variant="primary" size="sm" disabled={disabled} onClick={() => imageInput.current?.click()}>
          Add images
        </Button>
        <Button icon={FileCode2} size="sm" disabled={disabled} onClick={() => xmlInput.current?.click()}>
          Import VOC XML
        </Button>
        {children}
      </div>
      <input
        ref={imageInput}
        type="file"
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        multiple
        hidden
        onChange={(e) => pick(e.currentTarget)}
      />
      <input ref={xmlInput} type="file" accept=".xml,application/xml,text/xml" multiple hidden onChange={(e) => pick(e.currentTarget)} />
    </section>
  )
}
