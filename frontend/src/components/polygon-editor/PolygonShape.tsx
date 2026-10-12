import type { KonvaEventObject } from 'konva/lib/Node'
import { memo } from 'react'
import { Circle, Group, Label, Line, Tag, Text } from 'react-konva'
import type { Annotation, Point } from '../../types/annotation'
import { clampPoint, clampTranslation } from '../../utils/geometry'
import { setStageCursor } from './cursor'
import { shapeColors } from './theme'

interface PolygonShapeProps {
  annotation: Annotation
  index: number
  selected: boolean
  invalid: boolean
  /** False while drawing, so clicks pass through to the stage. */
  interactive: boolean
  /** Current zoom; strokes and handles are divided by it to keep a constant screen size. */
  scale: number
  imageWidth: number
  imageHeight: number
  onSelect: (id: string) => void
  onMove: (id: string, dx: number, dy: number) => void
  onVertexDragStart: () => void
  onVertexDrag: (id: string, index: number, point: Point) => void
  onVertexDragEnd: (id: string) => void
}

const HANDLE_RADIUS = 5
const HANDLE_HIT = 14
const STROKE = 2

/**
 * One quadrilateral. Konva positions are in IMAGE pixels because the parent
 * layer carries the viewport transform; nothing here knows about the screen.
 */
export const PolygonShape = memo(function PolygonShape({
  annotation,
  index,
  selected,
  invalid,
  interactive,
  scale,
  imageWidth,
  imageHeight,
  onSelect,
  onMove,
  onVertexDragStart,
  onVertexDrag,
  onVertexDragEnd,
}: PolygonShapeProps) {
  const colors = invalid ? shapeColors.invalid : selected ? shapeColors.selected : shapeColors.normal
  const flat = annotation.points.flatMap((p) => [p.x, p.y])
  const first = annotation.points[0] ?? { x: 0, y: 0 }

  const isOwnEvent = (e: KonvaEventObject<DragEvent>) => e.target === e.currentTarget

  return (
    <Group
      listening={interactive}
      draggable={interactive && selected}
      onPointerDown={(e) => {
        if (e.evt.button !== 0) return
        e.cancelBubble = true
        onSelect(annotation.id)
      }}
      onDragMove={(e) => {
        if (!isOwnEvent(e)) return
        const node = e.target
        node.position(clampTranslation(annotation.points, node.x(), node.y(), imageWidth, imageHeight))
      }}
      onDragEnd={(e) => {
        if (!isOwnEvent(e)) return
        const { x, y } = e.target.position()
        e.target.position({ x: 0, y: 0 })
        onMove(annotation.id, x, y)
      }}
      onMouseEnter={(e) => setStageCursor(e, selected ? 'move' : 'pointer')}
      onMouseLeave={(e) => setStageCursor(e, '')}
    >
      <Line
        points={flat}
        closed
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={(selected ? STROKE * 1.25 : STROKE) / scale}
        dash={invalid ? [6 / scale, 4 / scale] : undefined}
        hitStrokeWidth={10 / scale}
        perfectDrawEnabled={false}
      />
      <Label x={first.x} y={first.y} scaleX={1 / scale} scaleY={1 / scale} offsetY={22} listening={false}>
        <Tag fill={colors.stroke} cornerRadius={3} />
        <Text
          text={`#${index + 1} ${annotation.className} · ${annotation.classId}`}
          fontSize={11}
          fontStyle="bold"
          padding={4}
          fill={colors.label}
        />
      </Label>
      {selected &&
        interactive &&
        annotation.points.map((point, vertexIndex) => (
          <Circle
            // Vertex order is canonical, so the index is a stable identity during a drag.
            key={vertexIndex}
            x={point.x}
            y={point.y}
            radius={HANDLE_RADIUS / scale}
            fill={vertexIndex === 0 ? '#ffffff' : colors.stroke}
            stroke="#0b0d12"
            strokeWidth={1.5 / scale}
            hitStrokeWidth={HANDLE_HIT / scale}
            draggable
            perfectDrawEnabled={false}
            onMouseEnter={(e) => {
              e.cancelBubble = true
              setStageCursor(e, 'crosshair')
            }}
            onMouseLeave={(e) => {
              e.cancelBubble = true
              setStageCursor(e, 'move')
            }}
            onDragStart={(e) => {
              e.cancelBubble = true
              onVertexDragStart()
            }}
            onDragMove={(e) => {
              e.cancelBubble = true
              const clamped = clampPoint({ x: e.target.x(), y: e.target.y() }, imageWidth, imageHeight)
              e.target.position(clamped)
              onVertexDrag(annotation.id, vertexIndex, clamped)
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true
              onVertexDragEnd(annotation.id)
            }}
          />
        ))}
    </Group>
  )
})
