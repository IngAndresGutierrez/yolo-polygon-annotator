import { ServerCrash } from 'lucide-react'
import { Suspense, lazy, useEffect } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { EmptyState, Spinner, Toaster } from '../components/ui/Feedback'
import { ExportPage } from '../features/export/ExportPage'
import { GalleryPage } from '../features/gallery/GalleryPage'
import { QualityPage } from '../features/quality/QualityPage'
import { useConfigStore } from '../stores/configStore'
import { useProjectStore } from '../stores/projectStore'
import { useHashRoute } from './router'

// Konva is only needed by the editor; keep it out of the initial bundle.
const EditorPage = lazy(() => import('../features/editor/EditorPage').then((m) => ({ default: m.EditorPage })))

const pageFallback = (
  <div className="flex h-full items-center justify-center">
    <Spinner className="size-6" />
  </div>
)

export function App() {
  const route = useHashRoute()
  const projectId = useProjectStore((s) => s.projectId)
  const error = useProjectStore((s) => s.error)
  const loadProjects = useProjectStore((s) => s.loadProjects)

  useEffect(() => {
    // Restores the last opened project (id remembered locally, data on the server).
    void loadProjects()
    useConfigStore.getState().load().catch(() => undefined)
  }, [loadProjects])

  let page
  if (!projectId) {
    page = error ? (
      <EmptyState icon={ServerCrash} title="Cannot reach the annotator API">
        <p className="mb-4">{error}</p>
        <Button onClick={() => void loadProjects()}>Retry</Button>
      </EmptyState>
    ) : (
      pageFallback
    )
  } else if (route.name === 'editor') {
    page = (
      <Suspense fallback={pageFallback}>
        <EditorPage imageId={route.imageId} />
      </Suspense>
    )
  } else if (route.name === 'quality') {
    page = <QualityPage />
  } else if (route.name === 'export') {
    page = <ExportPage />
  } else {
    page = <GalleryPage />
  }

  return (
    <>
      <AppShell route={route}>{page}</AppShell>
      <Toaster />
    </>
  )
}
