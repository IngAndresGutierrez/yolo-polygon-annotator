import { useCallback, useState } from 'react'
import { errorMessage } from '../services/apiClient'
import { imagesApi } from '../services/projectsApi'
import { useProjectStore } from '../stores/projectStore'
import { toast } from '../stores/toastStore'
import type { ImageBulkActionName } from '../types/project'

/** Why an image was excluded; shown in the UI and stored with the image. */
export type ExclusionReason = 'manual' | 'exact_duplicate' | 'near_duplicate' | 'invalid'

export const exclusionReasonLabel = (reason: string | null): string => {
  switch (reason) {
    case 'exact_duplicate':
      return 'Exact duplicate'
    case 'near_duplicate':
      return 'Near duplicate'
    case 'invalid':
      return 'Invalid annotations'
    default:
      return 'Excluded manually'
  }
}

const pastTense: Record<ImageBulkActionName, string> = {
  exclude: 'Excluded from the dataset',
  include: 'Included in the dataset',
  delete: 'Deleted',
}

/** Exclude / re-include / delete images, keeping the project store in sync. */
export function useImageActions() {
  const [busy, setBusy] = useState(false)

  const run = useCallback(
    async (imageIds: readonly string[], action: ImageBulkActionName, reason?: ExclusionReason): Promise<boolean> => {
      const { projectId, applyBulk } = useProjectStore.getState()
      if (!projectId || imageIds.length === 0) return false
      setBusy(true)
      try {
        const result = await imagesApi.bulk(projectId, imageIds, action, reason)
        applyBulk(result, reason)
        toast.success(`${pastTense[action]}: ${result.updated.length} image(s)`)
        return true
      } catch (error) {
        toast.error(errorMessage(error))
        return false
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  return { run, busy }
}
