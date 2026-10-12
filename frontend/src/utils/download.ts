/** Save a blob as a file through a temporary object URL, released right after the click. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next tick so the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export const saveText = (text: string, filename: string): void =>
  saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename)

/** Stem of a filename without its extension ("Cars2.png" -> "Cars2"). */
export const fileStem = (filename: string): string => filename.replace(/\.[^.]+$/, '')

/** Folder/file slug, mirroring `slugify` in backend/src/annotator/storage/paths.py. */
export function slugify(value: string, fallback = 'item', maxLength = 48): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, maxLength)
    .replace(/^[-_]+|[-_]+$/g, '')
  return slug || fallback
}
