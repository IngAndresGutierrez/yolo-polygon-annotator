import { useCallback, useState } from 'react'
import { ApiError, errorMessage } from '../services/apiClient'
import { exportApi } from '../services/exportApi'
import { useProjectStore } from '../stores/projectStore'
import { toast } from '../stores/toastStore'
import type { ExportFormat, YoloLabel } from '../types/export'
import { fileStem, saveBlob, saveText } from '../utils/download'

interface InvalidImageDetail {
  filename: string
  issues: string[]
}

/** Readable message for export errors, listing the images with invalid polygons. */
export function exportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 422 && typeof error.details === 'object' && error.details) {
    const images = (error.details as { images?: InvalidImageDetail[] }).images
    if (Array.isArray(images) && images.length > 0) {
      const names = images.slice(0, 5).map((img) => img.filename).join(', ')
      return `${error.message}: ${names}${images.length > 5 ? '…' : ''}`
    }
  }
  return errorMessage(error)
}

/** Exports outside the dataset wizard: one image's label, or a flat ZIP of chosen images. */
export function useYoloExport() {
  const [busy, setBusy] = useState(false)

  const guarded = useCallback(async <T,>(work: (projectId: string) => Promise<T>): Promise<T | null> => {
    const { projectId } = useProjectStore.getState()
    if (!projectId) return null
    setBusy(true)
    try {
      return await work(projectId)
    } catch (error) {
      toast.error(exportErrorMessage(error))
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const downloadSelection = useCallback(
    (imageIds: readonly string[], format: ExportFormat, datasetName: string) =>
      guarded(async (projectId) => {
        const file = await exportApi.exportSelection(projectId, imageIds, format, datasetName)
        saveBlob(file.blob, file.filename ?? `${datasetName}-${format}.zip`)
        toast.success(`Downloaded ${imageIds.length} image(s) with ${format} labels`)
        return true
      }),
    [guarded],
  )

  const fetchLabel = useCallback(
    (imageId: string, format: ExportFormat): Promise<YoloLabel | null> =>
      guarded((projectId) => exportApi.imageLabel(projectId, imageId, format)),
    [guarded],
  )

  const copyLabel = useCallback(
    async (imageId: string, format: ExportFormat) => {
      const label = await fetchLabel(imageId, format)
      if (!label) return
      try {
        await navigator.clipboard.writeText(label.text)
        toast.success(label.objectCount ? `Copied ${label.objectCount} label line(s)` : 'Copied (empty label: no objects)')
      } catch {
        toast.error('The browser blocked clipboard access; use “Download .txt” instead')
      }
    },
    [fetchLabel],
  )

  const downloadLabel = useCallback(
    async (imageId: string, format: ExportFormat) => {
      const label = await fetchLabel(imageId, format)
      if (label) saveText(label.text, `${fileStem(label.filename)}.txt`)
    },
    [fetchLabel],
  )

  return { busy, downloadSelection, fetchLabel, copyLabel, downloadLabel }
}
