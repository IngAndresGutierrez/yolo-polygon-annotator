import { describe, expect, it } from 'vitest'
import {
  MAX_SCALE,
  MIN_SCALE,
  type Viewport,
  canvasToImage,
  fitViewport,
  imageToCanvas,
  imageToYolo,
  panBy,
  screenToImage,
  yoloToImage,
  zoomAt,
} from '../src/utils/coordinates'

describe('coordinate transforms', () => {
  const vp: Viewport = { scale: 2, x: 100, y: 50 }

  it('round-trips image <-> canvas', () => {
    const image = { x: 229, y: 176 }
    const canvas = imageToCanvas(image, vp)
    expect(canvas).toEqual({ x: 558, y: 402 })
    expect(canvasToImage(canvas, vp)).toEqual(image)
  })

  it('converts screen coordinates using the stage offset', () => {
    expect(screenToImage({ x: 568, y: 482 }, { left: 10, top: 80 }, vp)).toEqual({ x: 229, y: 176 })
  })

  it('fits and centers the image in the container', () => {
    const fit = fitViewport({ width: 400, height: 200 }, { width: 848, height: 848 }, 24)
    expect(fit.scale).toBe(2)
    expect(fit).toEqual({ scale: 2, x: 24, y: 224 })
  })

  it('returns an identity viewport for empty sizes', () => {
    expect(fitViewport({ width: 0, height: 0 }, { width: 800, height: 600 })).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('zooms around an anchor without moving the image point under it', () => {
    const anchor = { x: 300, y: 260 }
    const before = canvasToImage(anchor, vp)
    const zoomed = zoomAt(vp, anchor, 1.5)
    expect(zoomed.scale).toBe(3)
    const after = canvasToImage(anchor, zoomed)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
  })

  it('clamps zoom', () => {
    expect(zoomAt(vp, { x: 0, y: 0 }, 1e6).scale).toBe(MAX_SCALE)
    expect(zoomAt(vp, { x: 0, y: 0 }, 1e-6).scale).toBe(MIN_SCALE)
  })

  it('pan and zoom never change image-space coordinates of annotations', () => {
    const annotationPoint = { x: 270, y: 193 }
    let view: Viewport = { scale: 1, x: 0, y: 0 }
    view = zoomAt(view, { x: 120, y: 80 }, 3.7)
    view = panBy(view, -45, 33)
    // The same image point maps to a new canvas position and back to itself.
    const onCanvas = imageToCanvas(annotationPoint, view)
    const back = canvasToImage(onCanvas, view)
    expect(back.x).toBeCloseTo(annotationPoint.x, 9)
    expect(back.y).toBeCloseTo(annotationPoint.y, 9)
  })

  it('normalizes to YOLO coordinates and back', () => {
    const size = { width: 400, height: 200 }
    expect(imageToYolo({ x: 200, y: 50 }, size)).toEqual({ x: 0.5, y: 0.25 })
    expect(imageToYolo({ x: -10, y: 500 }, size)).toEqual({ x: 0, y: 1 })
    expect(yoloToImage({ x: 0.5, y: 0.25 }, size)).toEqual({ x: 200, y: 50 })
  })
})
