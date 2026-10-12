import { beforeEach, describe, expect, it } from 'vitest'
import { selectCanRedo, selectCanUndo, selectIsDirty, useEditorStore } from '../src/stores/editorStore'
import type { ImageAnnotations } from '../src/types/annotation'

const store = () => useEditorStore.getState()

const plate = {
  id: 'a-plate',
  classId: 0,
  className: 'licence',
  type: 'quadrilateral' as const,
  points: [
    { x: 229, y: 176 },
    { x: 270, y: 176 },
    { x: 270, y: 193 },
    { x: 229, y: 193 },
  ],
}

const doc = (overrides: Partial<ImageAnnotations> = {}): ImageAnnotations => ({
  schemaVersion: 1,
  imageId: 'cars2',
  filename: 'Cars2.png',
  width: 400,
  height: 400,
  negative: false,
  revision: 3,
  updatedAt: null,
  annotations: [plate],
  ...overrides,
})

function drawQuad(points: [number, number][]) {
  store().setMode('draw')
  points.forEach(([x, y]) => store().addDraftPoint({ x, y }))
}

describe('editor store', () => {
  beforeEach(() => store().load(doc()))

  it('loads a document clean, with no history', () => {
    expect(store().annotations).toHaveLength(1)
    expect(store().revision).toBe(3)
    expect(selectIsDirty(store())).toBe(false)
    expect(selectCanUndo(store())).toBe(false)
  })

  describe('selection', () => {
    it('selects, cycles and clears', () => {
      store().load(doc({ annotations: [plate, { ...plate, id: 'a-two' }] }))
      store().select('a-plate')
      expect(store().selectedId).toBe('a-plate')
      store().selectNext(1)
      expect(store().selectedId).toBe('a-two')
      store().selectNext(1)
      expect(store().selectedId).toBe('a-plate')
      store().select(null)
      expect(store().selectedId).toBeNull()
    })

    it('entering draw mode clears the selection', () => {
      store().select('a-plate')
      store().setMode('draw')
      expect(store().selectedId).toBeNull()
    })
  })

  describe('creating polygons', () => {
    it('closes the polygon after the 4th click, in canonical order, and selects it', () => {
      drawQuad([[60, 80], [10, 10], [60, 10], [10, 80]]) // scrambled click order
      const created = store().annotations[1]!
      expect(created.points).toEqual([
        { x: 10, y: 10 },
        { x: 60, y: 10 },
        { x: 60, y: 80 },
        { x: 10, y: 80 },
      ])
      expect(created.classId).toBe(0)
      expect(created.className).toBe('licence')
      expect(store().mode).toBe('select')
      expect(store().selectedId).toBe(created.id)
      expect(store().draft).toEqual([])
      expect(selectIsDirty(store())).toBe(true)
    })

    it('clamps clicks outside the image and ignores duplicate clicks', () => {
      store().setMode('draw')
      store().addDraftPoint({ x: -20, y: 500 })
      store().addDraftPoint({ x: 0.5, y: 399.5 }, 2) // within 2px of previous -> ignored
      expect(store().draft).toEqual([{ x: 0, y: 400 }])
    })

    it('cancels and removes draft points', () => {
      store().setMode('draw')
      store().addDraftPoint({ x: 1, y: 1 })
      store().addDraftPoint({ x: 50, y: 1 })
      store().removeLastDraftPoint()
      expect(store().draft).toHaveLength(1)
      store().cancelDraft()
      expect(store().draft).toEqual([])
      expect(store().annotations).toHaveLength(1)
    })
  })

  describe('modifying polygons', () => {
    it('drags a vertex as one undoable step and re-canonicalizes on release', () => {
      store().beginTransform()
      store().setVertex('a-plate', 0, { x: 280, y: 170 }) // TL dragged past TR
      store().setVertex('a-plate', 0, { x: 290, y: 160 })
      store().endTransform('a-plate')
      const points = store().annotations[0]!.points
      expect(points[0]).toEqual({ x: 229, y: 193 }) // new top-left by x+y rule
      expect(points).toContainEqual({ x: 290, y: 160 })
      expect(store().past).toHaveLength(1)
    })

    it('does not record history when a drag ends where it started', () => {
      store().beginTransform()
      store().setVertex('a-plate', 1, { x: 271, y: 176 })
      store().setVertex('a-plate', 1, { x: 270, y: 176 })
      store().endTransform('a-plate')
      expect(store().past).toHaveLength(0)
    })

    it('clamps vertices to the image bounds', () => {
      store().setVertex('a-plate', 2, { x: 999, y: -4 })
      expect(store().annotations[0]!.points[2]).toEqual({ x: 400, y: 0 })
    })

    it('moves a whole polygon but keeps it inside the image', () => {
      store().moveAnnotation('a-plate', 1000, 0)
      const xs = store().annotations[0]!.points.map((p) => p.x)
      expect(Math.max(...xs)).toBe(400)
      expect(Math.min(...xs)).toBe(359)
    })

    it('deletes the selected annotation', () => {
      store().select('a-plate')
      store().deleteSelected()
      expect(store().annotations).toEqual([])
      expect(store().selectedId).toBeNull()
    })

    it('marks negative only when there are no objects', () => {
      store().setNegative(true)
      expect(store().negative).toBe(false)
      store().deleteAnnotation('a-plate')
      store().setNegative(true)
      expect(store().negative).toBe(true)
      drawQuad([[10, 10], [60, 10], [60, 80], [10, 80]])
      expect(store().negative).toBe(false)
    })
  })

  describe('undo / redo', () => {
    it('undoes and redoes create, move and delete', () => {
      const original = store().annotations
      drawQuad([[10, 10], [60, 10], [60, 80], [10, 80]])
      store().moveAnnotation('a-plate', 5, 5)
      store().deleteAnnotation('a-plate')
      expect(store().annotations).toHaveLength(1)

      store().undo() // delete
      expect(store().annotations).toHaveLength(2)
      store().undo() // move
      expect(store().annotations[0]!.points[0]).toEqual({ x: 229, y: 176 })
      store().undo() // create
      expect(store().annotations).toEqual(original)
      expect(selectCanUndo(store())).toBe(false)

      store().redo()
      store().redo()
      expect(store().annotations).toHaveLength(2)
      expect(store().annotations[0]!.points[0]).toEqual({ x: 234, y: 181 })
      expect(selectCanRedo(store())).toBe(true)
    })

    it('a new edit clears the redo stack', () => {
      store().moveAnnotation('a-plate', 1, 0)
      store().undo()
      store().moveAnnotation('a-plate', 0, 1)
      expect(selectCanRedo(store())).toBe(false)
    })

    it('drops the selection when undo removes the selected annotation', () => {
      drawQuad([[10, 10], [60, 10], [60, 80], [10, 80]])
      expect(store().selectedId).not.toBeNull()
      store().undo()
      expect(store().selectedId).toBeNull()
    })
  })

  describe('save tracking', () => {
    it('stays dirty when edits happen while a save is in flight', () => {
      store().moveAnnotation('a-plate', 1, 0)
      const counter = store().changeCounter
      store().markSaving()
      store().moveAnnotation('a-plate', 1, 0) // edit during the request
      store().markSaved('cars2', counter, 4)
      expect(store().revision).toBe(4)
      expect(selectIsDirty(store())).toBe(true)
      expect(store().saveStatus).toBe('idle')
    })

    it('ignores save results for another image', () => {
      store().moveAnnotation('a-plate', 1, 0)
      store().markSaved('other-image', store().changeCounter, 99)
      expect(store().revision).toBe(3)
      expect(selectIsDirty(store())).toBe(true)
    })

    it('records conflicts', () => {
      store().markSaveError('cars2', 'modified elsewhere', true)
      expect(store().saveStatus).toBe('conflict')
    })
  })
})
