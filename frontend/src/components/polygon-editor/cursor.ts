import type { KonvaEventObject } from 'konva/lib/Node'

/** Set the stage container cursor imperatively (avoids re-rendering on hover). */
export function setStageCursor(event: KonvaEventObject<unknown>, cursor: string): void {
  const container = event.target.getStage()?.container()
  if (container) container.style.cursor = cursor
}
