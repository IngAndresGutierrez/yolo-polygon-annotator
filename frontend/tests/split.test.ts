import { describe, expect, it } from 'vitest'
import { parseHash, routeToHash } from '../src/app/router'
import { partitionFiles } from '../src/features/gallery/useImport'
import { validateAnnotations } from '../src/utils/annotationValidation'
import { targetCounts } from '../src/utils/split'

describe('split preview', () => {
  it('splits 50 images 35/10/5 like the backend', () => {
    expect(targetCounts(50, { train: 0.7, val: 0.2, test: 0.1 })).toEqual({ train: 35, val: 10, test: 5 })
  })

  it('resolves remainder ties train-first like the backend', () => {
    expect(targetCounts(45, { train: 0.7, val: 0.2, test: 0.1 })).toEqual({ train: 32, val: 9, test: 4 })
  })

  it('always sums to the total', () => {
    for (const total of [0, 1, 2, 3, 7, 33, 99, 101]) {
      const c = targetCounts(total, { train: 0.7, val: 0.2, test: 0.1 })
      expect(c.train + c.val + c.test).toBe(total)
    }
  })
})

describe('router', () => {
  it('parses and builds hashes', () => {
    expect(parseHash('')).toEqual({ name: 'gallery' })
    expect(parseHash('#/export')).toEqual({ name: 'export' })
    expect(parseHash('#/editor/cars%202')).toEqual({ name: 'editor', imageId: 'cars 2' })
    expect(routeToHash({ name: 'editor', imageId: 'cars2' })).toBe('#/editor/cars2')
  })
})

describe('import file partitioning', () => {
  it('separates images, XML and unsupported files', () => {
    const files = ['Cars2.PNG', 'a.jpeg', 'Cars2.xml', 'notes.txt'].map((name) => new File(['x'], name))
    const { images, xmls, ignored } = partitionFiles(files)
    expect(images.map((f) => f.name)).toEqual(['Cars2.PNG', 'a.jpeg'])
    expect(xmls.map((f) => f.name)).toEqual(['Cars2.xml'])
    expect(ignored.map((f) => f.filename)).toEqual(['notes.txt'])
  })
})

describe('annotation validation', () => {
  it('returns issues keyed by annotation id', () => {
    const issues = validateAnnotations(
      [
        { id: 'ok', classId: 0, className: 'licence', type: 'quadrilateral', points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }] },
        { id: 'bad', classId: 0, className: 'licence', type: 'quadrilateral', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }] },
      ],
      100,
      100,
      16,
    )
    expect([...issues.keys()]).toEqual(['bad'])
    expect(issues.get('bad')?.[0]?.code).toBe('area_too_small')
  })
})
