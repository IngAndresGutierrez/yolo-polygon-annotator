import { useCallback, useState } from 'react'
import { errorMessage } from '../../services/apiClient'
import { imagesApi } from '../../services/projectsApi'
import { useProjectStore } from '../../stores/projectStore'
import { toast } from '../../stores/toastStore'
import type { ImportIssue } from '../../types/project'

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png']
export const XML_EXTENSIONS = ['.xml']
const IMAGE_BATCH_SIZE = 20
const XML_BATCH_SIZE = 100

export interface ImportReport {
  imagesImported: number
  annotationsImported: number
  xmlMatched: number
  skippedExisting: string[]
  rejected: ImportIssue[]
  warnings: ImportIssue[]
  unmatched: ImportIssue[]
}

export interface ImportProgress {
  done: number
  total: number
  phase: 'images' | 'annotations'
}

const extensionOf = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase()

export function partitionFiles(files: readonly File[]) {
  const images: File[] = []
  const xmls: File[] = []
  const ignored: ImportIssue[] = []
  files.forEach((file) => {
    const ext = extensionOf(file.name)
    if (IMAGE_EXTENSIONS.includes(ext)) images.push(file)
    else if (XML_EXTENSIONS.includes(ext)) xmls.push(file)
    else ignored.push({ filename: file.name, code: 'unsupported_type', message: 'Not a JPG, PNG or XML file' })
  })
  return { images, xmls, ignored }
}

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))

/**
 * Upload images first, then PASCAL VOC XML files (which are matched to images by
 * filename), in small batches so large selections report progress.
 */
export function useImport() {
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)

  const importFiles = useCallback(async (files: readonly File[], overwriteAnnotations: boolean) => {
    const { projectId, addImages, refreshImages } = useProjectStore.getState()
    if (!projectId || files.length === 0) return
    const { images, xmls, ignored } = partitionFiles(files)
    const result: ImportReport = {
      imagesImported: 0,
      annotationsImported: 0,
      xmlMatched: 0,
      skippedExisting: [],
      rejected: [...ignored],
      warnings: [],
      unmatched: [],
    }
    try {
      let done = 0
      for (const batch of chunk(images, IMAGE_BATCH_SIZE)) {
        setProgress({ done, total: images.length, phase: 'images' })
        const response = await imagesApi.upload(projectId, batch)
        addImages(response.imported)
        result.imagesImported += response.imported.length
        result.rejected.push(...response.rejected)
        result.warnings.push(...response.warnings)
        done += batch.length
      }
      done = 0
      for (const batch of chunk(xmls, XML_BATCH_SIZE)) {
        setProgress({ done, total: xmls.length, phase: 'annotations' })
        const response = await imagesApi.importVoc(projectId, batch, overwriteAnnotations)
        result.xmlMatched += response.matched.length
        result.annotationsImported += response.annotationsImported
        result.skippedExisting.push(...response.skippedExisting)
        result.unmatched.push(...response.unmatched)
        result.rejected.push(...response.rejected)
        result.warnings.push(...response.warnings)
        done += batch.length
      }
      if (xmls.length > 0) await refreshImages()
      const summary = [
        images.length ? `${result.imagesImported} image(s) imported` : null,
        xmls.length ? `${result.annotationsImported} annotation(s) from ${result.xmlMatched} XML file(s)` : null,
      ]
        .filter(Boolean)
        .join(', ')
      const problems = result.rejected.length + result.unmatched.length
      if (problems > 0) toast.warning(`${summary || 'Import finished'}; ${problems} file(s) need attention`)
      else if (summary) toast.success(summary)
    } catch (error) {
      toast.error(`Import failed: ${errorMessage(error)}`)
      await refreshImages()
    } finally {
      setProgress(null)
      setReport(result)
    }
  }, [])

  return { importFiles, progress, report, clearReport: () => setReport(null) }
}
