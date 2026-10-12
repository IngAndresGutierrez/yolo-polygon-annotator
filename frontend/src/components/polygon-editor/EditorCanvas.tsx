import type { KonvaEventObject } from 'konva/lib/Node'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Image as KonvaImage, Layer, Stage } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useElementSize } from '../../hooks/useElementSize'
import { useEditorStore } from '../../stores/editorStore'
import { useViewportStore } from '../../stores/viewportStore'
import type { Point } from '../../types/annotation'
import type { IssuesById } from '../../utils/annotationValidation'
import { canvasToImage, wheelZoomFactor } from '../../utils/coordinates'
import { DraftPolygon } from './DraftPolygon'
import { PolygonShape } from './PolygonShape'

interface EditorCanvasProps {
  image: HTMLImageElement | null
  issues: IssuesById
}

/** Screen pixels within which a second click on the previous vertex is ignored. */
const DUPLICATE_CLICK_PX = 3
/** Pointer travel (screen px) below which a press-release on empty canvas counts as a click. */
const CLICK_TOLERANCE_PX = 4

interface PanGesture {
  startX: number
  startY: number
  lastX: number
  lastY: number
  moved: boolean
}

function useSpaceKey() {
  const [down, setDown] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.target instanceof HTMLInputElement) return
      if (event.type === 'keydown') event.preventDefault()
      setDown(event.type === 'keydown')
    }
    const onBlur = () => setDown(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  return down
}

export function EditorCanvas({ image, issues }: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(containerRef)
  const spaceDown = useSpaceKey()
  const [pan, setPan] = useState<PanGesture | null>(null)

  const { viewport, pointer, setContainer, setPointer, zoomAtPoint, panBy } = useViewportStore(
    useShallow((s) => ({
      viewport: s.viewport,
      pointer: s.pointer,
      setContainer: s.setContainer,
      setPointer: s.setPointer,
      zoomAtPoint: s.zoomAtPoint,
      panBy: s.pan,
    })),
  )
  const editor = useEditorStore(
    useShallow((s) => ({
      annotations: s.annotations,
      selectedId: s.selectedId,
      mode: s.mode,
      draft: s.draft,
      width: s.width,
      height: s.height,
    })),
  )
  const actions = useEditorStore(
    useShallow((s) => ({
      select: s.select,
      addDraftPoint: s.addDraftPoint,
      moveAnnotation: s.moveAnnotation,
      beginTransform: s.beginTransform,
      setVertex: s.setVertex,
      endTransform: s.endTransform,
    })),
  )

  useEffect(() => {
    if (size.width > 0 && size.height > 0) setContainer(size)
  }, [size, setContainer])

  const pointerInImage = useCallback(
    (e: KonvaEventObject<unknown>): Point | null => {
      const position = e.target.getStage()?.getPointerPosition()
      return position ? canvasToImage(position, viewport) : null
    },
    [viewport],
  )

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    const { button, clientX, clientY } = e.evt
    const startPan = () => setPan({ startX: clientX, startY: clientY, lastX: clientX, lastY: clientY, moved: false })
    if (button === 1 || (button === 0 && spaceDown)) {
      e.evt.preventDefault()
      startPan()
      return
    }
    if (button !== 0) return
    if (editor.mode === 'draw') {
      const point = pointerInImage(e)
      if (point) actions.addDraftPoint(point, DUPLICATE_CLICK_PX / viewport.scale)
      return
    }
    startPan() // empty-canvas drag pans; a plain click deselects (see pointer up)
  }

  const onPointerMove = (e: KonvaEventObject<PointerEvent>) => {
    setPointer(pointerInImage(e))
    if (!pan) return
    const { clientX, clientY } = e.evt
    panBy(clientX - pan.lastX, clientY - pan.lastY)
    const moved = pan.moved || Math.hypot(clientX - pan.startX, clientY - pan.startY) > CLICK_TOLERANCE_PX
    setPan({ ...pan, lastX: clientX, lastY: clientY, moved })
  }

  const endPan = useCallback(
    (wasClick: boolean) => {
      setPan(null)
      if (wasClick && useEditorStore.getState().mode === 'select') actions.select(null)
    },
    [actions],
  )

  // Finish a pan even if the pointer is released outside the canvas.
  useEffect(() => {
    if (!pan) return undefined
    const onUp = () => endPan(false)
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [pan, endPan])

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const anchor = e.target.getStage()?.getPointerPosition()
    if (anchor) zoomAtPoint(anchor, wheelZoomFactor(e.evt.deltaY))
  }

  const cursorClass = pan
    ? 'cursor-grabbing'
    : spaceDown
      ? 'cursor-grab'
      : editor.mode === 'draw'
        ? 'cursor-crosshair'
        : 'cursor-default'
  const interactive = editor.mode === 'select' && !spaceDown && !pan

  return (
    <div
      ref={containerRef}
      className={`relative min-h-0 flex-1 touch-none overflow-hidden bg-[radial-gradient(circle_at_center,#1a1f2b_0%,#0b0d12_80%)] ${cursorClass}`}
      onContextMenu={(e) => e.preventDefault()}
      onPointerLeave={() => setPointer(null)}
    >
      {size.width > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => pan && endPan(!pan.moved)}
          onWheel={onWheel}
        >
          <Layer
            listening={false}
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
            imageSmoothingEnabled={viewport.scale < 3}
          >
            {image && <KonvaImage image={image} width={editor.width} height={editor.height} />}
          </Layer>
          <Layer x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
            {editor.annotations.map((annotation, index) => (
              <PolygonShape
                key={annotation.id}
                annotation={annotation}
                index={index}
                selected={annotation.id === editor.selectedId}
                invalid={issues.has(annotation.id)}
                interactive={interactive}
                scale={viewport.scale}
                imageWidth={editor.width}
                imageHeight={editor.height}
                onSelect={actions.select}
                onMove={actions.moveAnnotation}
                onVertexDragStart={actions.beginTransform}
                onVertexDrag={actions.setVertex}
                onVertexDragEnd={actions.endTransform}
              />
            ))}
            {editor.mode === 'draw' && <DraftPolygon points={editor.draft} pointer={pointer} scale={viewport.scale} />}
          </Layer>
        </Stage>
      )}
    </div>
  )
}
