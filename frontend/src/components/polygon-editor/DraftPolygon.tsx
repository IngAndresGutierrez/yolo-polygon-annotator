import { Circle, Group, Line } from 'react-konva'
import type { Point } from '../../types/annotation'
import { shapeColors } from './theme'

interface DraftPolygonProps {
  points: Point[]
  pointer: Point | null
  scale: number
}

/** The polygon being drawn: placed vertices, a rubber band to the pointer and the closing edge preview. */
export function DraftPolygon({ points, pointer, scale }: DraftPolygonProps) {
  if (points.length === 0) return null
  const path = pointer ? [...points, pointer] : points
  const first = points[0] as Point
  const closing = pointer && points.length === 3 ? [pointer.x, pointer.y, first.x, first.y] : null
  return (
    <Group listening={false}>
      <Line
        points={path.flatMap((p) => [p.x, p.y])}
        stroke={shapeColors.draft.stroke}
        strokeWidth={2 / scale}
        fill={points.length >= 2 ? shapeColors.draft.fill : undefined}
        closed={points.length >= 3 && pointer === null}
      />
      {closing && <Line points={closing} stroke={shapeColors.draft.stroke} strokeWidth={1.5 / scale} dash={[5 / scale, 4 / scale]} />}
      {points.map((p, i) => (
        <Circle
          key={i}
          x={p.x}
          y={p.y}
          radius={4.5 / scale}
          fill={i === 0 ? '#ffffff' : shapeColors.draft.stroke}
          stroke="#0b0d12"
          strokeWidth={1.5 / scale}
        />
      ))}
    </Group>
  )
}
