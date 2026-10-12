import { ImageOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { navigate } from '../../app/router'
import { AnnotationPanel } from '../../components/polygon-editor/AnnotationPanel'
import { EditorCanvas } from '../../components/polygon-editor/EditorCanvas'
import { EditorStatusBar } from '../../components/polygon-editor/EditorStatusBar'
import { EditorToolbar } from '../../components/polygon-editor/EditorToolbar'
import { ImageSidebar } from '../../components/polygon-editor/ImageSidebar'
import { Button } from '../../components/ui/Button'
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback'
import { useAutosave } from '../../hooks/useAutosave'
import { preloadImages, useHtmlImage } from '../../hooks/useHtmlImage'
import { annotationsApi } from '../../services/annotationsApi'
import { errorMessage } from '../../services/apiClient'
import { imageFileUrl, thumbnailUrl } from '../../services/projectsApi'
import { useConfigStore } from '../../stores/configStore'
import { selectIsDirty, useEditorStore } from '../../stores/editorStore'
import { useProjectStore } from '../../stores/projectStore'
import { toast } from '../../stores/toastStore'
import { useViewportStore } from '../../stores/viewportStore'
import type { ImageRecord } from '../../types/project'
import { validateAnnotations } from '../../utils/annotationValidation'
import { useEditorShortcuts } from './useEditorShortcuts'

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

export function EditorPage({ imageId }: { imageId: string }) {
  const projectId = useProjectStore((s) => s.projectId)
  const images = useProjectStore((s) => s.images)
  const imagesLoading = useProjectStore((s) => s.loading)
  const minArea = useConfigStore((s) => s.minPolygonArea)
  const { flush } = useAutosave(projectId)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const index = images.findIndex((img) => img.id === imageId)
  const record: ImageRecord | undefined = images[index]
  const previous = index > 0 ? images[index - 1] : undefined
  const next = index >= 0 && index < images.length - 1 ? images[index + 1] : undefined

  const fileUrl = projectId && record ? imageFileUrl(projectId, record) : null
  const { image, status: imageStatus } = useHtmlImage(fileUrl)

  const { annotations, width, height } = useEditorStore(
    useShallow((s) => ({ annotations: s.annotations, width: s.width, height: s.height })),
  )
  const issues = useMemo(() => validateAnnotations(annotations, width, height, minArea), [annotations, width, height, minArea])

  const loadDocument = useCallback(
    async (targetId: string) => {
      if (!projectId) return
      setLoadState({ status: 'loading' })
      try {
        const { document } = await annotationsApi.get(projectId, targetId)
        useEditorStore.getState().load(document)
        useViewportStore.getState().setImage({ width: document.width, height: document.height })
        setLoadState({ status: 'ready' })
      } catch (error) {
        setLoadState({ status: 'error', message: errorMessage(error) })
      }
    },
    [projectId],
  )

  // Switching images: save the previous image first, never silently drop edits.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const editor = useEditorStore.getState()
      if (editor.imageId === imageId && selectIsDirty(editor)) {
        setLoadState({ status: 'ready' }) // came back to an image with unsaved local edits
        return
      }
      const saved = await flush()
      if (cancelled) return
      const leaving = useEditorStore.getState().imageId
      if (!saved && leaving && leaving !== imageId) {
        const discard = window.confirm('The changes to the previous image could not be saved. Discard them and continue?')
        if (!discard) {
          navigate({ name: 'editor', imageId: leaving })
          return
        }
      }
      await loadDocument(imageId)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [imageId, flush, loadDocument])

  // Leaving the editor: push pending edits to the server.
  useEffect(() => () => void flush(), [flush])

  // Surface save failures once per failure.
  useEffect(
    () =>
      useEditorStore.subscribe((state, prev) => {
        if (state.saveStatus === prev.saveStatus) return
        if (state.saveStatus === 'error') toast.error(`Autosave failed: ${state.saveError ?? 'unknown error'}`)
        if (state.saveStatus === 'conflict') toast.error('This image was modified elsewhere. Reload it to continue.')
      }),
    [],
  )

  useEffect(() => {
    if (!projectId) return
    preloadImages([previous, next].filter((img): img is ImageRecord => !!img).map((img) => imageFileUrl(projectId, img)))
  }, [projectId, previous, next])

  const open = useCallback((targetId: string) => {
    setSidebarOpen(false)
    navigate({ name: 'editor', imageId: targetId })
  }, [])

  const saveNow = useCallback(async () => {
    if (await flush()) toast.success('Saved')
  }, [flush])

  const reload = useCallback(() => {
    useEditorStore.getState().reset()
    void loadDocument(imageId)
  }, [imageId, loadDocument])

  useEditorShortcuts({
    onPrevious: () => previous && open(previous.id),
    onNext: () => next && open(next.id),
    onSave: () => void saveNow(),
  })

  const thumb = useCallback((img: ImageRecord) => (projectId ? thumbnailUrl(projectId, img) : ''), [projectId])

  if (!record) {
    if (imagesLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner className="size-6" />
        </div>
      )
    }
    return (
      <EmptyState icon={ImageOff} title="Image not found">
        <p className="mb-4">It may have been deleted or belongs to another project.</p>
        <Button onClick={() => navigate({ name: 'gallery' })}>Back to images</Button>
      </EmptyState>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1">
        <ImageSidebar
          images={images}
          currentId={imageId}
          thumbnailUrl={thumb}
          onOpen={open}
          className={`${sidebarOpen ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-20 w-64 shadow-2xl lg:static lg:flex lg:w-60 lg:shadow-none`}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <EditorToolbar
            hasPrevious={!!previous}
            hasNext={!!next}
            onPrevious={() => previous && open(previous.id)}
            onNext={() => next && open(next.id)}
            onSave={() => void saveNow()}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
          />
          {loadState.status === 'error' || imageStatus === 'error' ? (
            <div className="p-6">
              <Alert tone="error" title="Could not open this image">
                {loadState.status === 'error' ? loadState.message : 'The image file failed to load.'}{' '}
                <button type="button" className="underline" onClick={reload}>
                  Retry
                </button>
              </Alert>
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1">
              <EditorCanvas image={loadState.status === 'ready' ? image : null} issues={issues} />
              {(loadState.status === 'loading' || imageStatus === 'loading') && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Spinner className="size-6" label="Loading image" />
                </div>
              )}
            </div>
          )}
        </div>
        <AnnotationPanel issues={issues} onBeforeExport={flush} className="hidden w-72 shrink-0 md:flex" />
      </div>
      <EditorStatusBar
        filename={record.filename}
        position={index + 1}
        total={images.length}
        invalidCount={issues.size}
        onRetrySave={() => void saveNow()}
        onReload={reload}
      />
    </div>
  )
}
