/**
 * Coordinate spaces used by the editor:
 *
 *   screen  — browser client pixels (MouseEvent.clientX/Y)
 *   canvas  — pixels relative to the Konva stage's top-left corner
 *   image   — pixels of the ORIGINAL image; the only space that is persisted
 *   yolo    — image coordinates normalized to [0, 1] by width/height
 *
 * The viewport maps image -> canvas:  canvas = image * scale + offset.
 * Zoom, pan and window resizing only change the viewport, never annotations.
 */
import type { Point } from '../types/annotation'

export interface Viewport {
  scale: number
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect {
  left: number
  top: number
}

export const MIN_SCALE = 0.02
export const MAX_SCALE = 40

export const clampScale = (scale: number): number => Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE)

export const screenToCanvas = (screen: Point, stageRect: Rect): Point => ({
  x: screen.x - stageRect.left,
  y: screen.y - stageRect.top,
})

export const canvasToImage = (canvas: Point, vp: Viewport): Point => ({
  x: (canvas.x - vp.x) / vp.scale,
  y: (canvas.y - vp.y) / vp.scale,
})

export const imageToCanvas = (image: Point, vp: Viewport): Point => ({
  x: image.x * vp.scale + vp.x,
  y: image.y * vp.scale + vp.y,
})

export const screenToImage = (screen: Point, stageRect: Rect, vp: Viewport): Point =>
  canvasToImage(screenToCanvas(screen, stageRect), vp)

/** Normalize an image point to YOLO [0, 1] coordinates (clamped). */
export function imageToYolo(point: Point, image: Size): Point {
  const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
  return { x: clamp01(point.x / image.width), y: clamp01(point.y / image.height) }
}

export const yoloToImage = (point: Point, image: Size): Point => ({
  x: point.x * image.width,
  y: point.y * image.height,
})

/** Viewport that shows the whole image centered in the container. */
export function fitViewport(image: Size, container: Size, padding = 24): Viewport {
  if (image.width <= 0 || image.height <= 0 || container.width <= 0 || container.height <= 0) {
    return { scale: 1, x: 0, y: 0 }
  }
  const availableW = Math.max(container.width - padding * 2, 1)
  const availableH = Math.max(container.height - padding * 2, 1)
  const scale = clampScale(Math.min(availableW / image.width, availableH / image.height))
  return {
    scale,
    x: (container.width - image.width * scale) / 2,
    y: (container.height - image.height * scale) / 2,
  }
}

/** Zoom by `factor` keeping the image point under `anchor` (canvas coords) fixed. */
export function zoomAt(vp: Viewport, anchor: Point, factor: number): Viewport {
  const scale = clampScale(vp.scale * factor)
  const imagePoint = canvasToImage(anchor, vp)
  return { scale, x: anchor.x - imagePoint.x * scale, y: anchor.y - imagePoint.y * scale }
}

export const panBy = (vp: Viewport, dx: number, dy: number): Viewport => ({
  ...vp,
  x: vp.x + dx,
  y: vp.y + dy,
})

/** Smooth zoom factor from a wheel delta (works for mouse wheels and trackpads). */
export const wheelZoomFactor = (deltaY: number): number => Math.exp(-deltaY * 0.0015)
