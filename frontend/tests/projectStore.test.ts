import { beforeEach, describe, expect, it } from 'vitest'
import { parseHash, routeToHash } from '../src/app/router'
import { useProjectStore } from '../src/stores/projectStore'
import type { ImageRecord } from '../src/types/project'

const image = (id: string, overrides: Partial<ImageRecord> = {}): ImageRecord => ({
  id,
  filename: `${id}.png`,
  storedName: `${id}.png`,
  format: 'png',
  width: 100,
  height: 100,
  sizeBytes: 1,
  sha256: id,
  dhash: '0'.repeat(16),
  createdAt: '2026-01-01T00:00:00Z',
  annotationCount: 0,
  status: 'pending',
  revision: 0,
  excluded: false,
  excludedReason: null,
  ...overrides,
})

const store = () => useProjectStore.getState()

describe('project store bulk actions', () => {
  beforeEach(() => useProjectStore.setState({ images: [image('a'), image('b'), image('c')] }))

  it('marks excluded images with a reason', () => {
    store().applyBulk({ action: 'exclude', updated: ['a', 'b'], notFound: [] }, 'exact_duplicate')
    expect(store().images.map((i) => [i.id, i.excluded, i.excludedReason])).toEqual([
      ['a', true, 'exact_duplicate'],
      ['b', true, 'exact_duplicate'],
      ['c', false, null],
    ])
  })

  it('re-includes images and clears the reason', () => {
    store().applyBulk({ action: 'exclude', updated: ['a'], notFound: [] })
    expect(store().images[0]?.excludedReason).toBe('manual')
    store().applyBulk({ action: 'include', updated: ['a'], notFound: [] })
    expect(store().images[0]).toMatchObject({ excluded: false, excludedReason: null })
  })

  it('removes deleted images only for ids the server confirmed', () => {
    store().applyBulk({ action: 'delete', updated: ['b'], notFound: ['zzz'] })
    expect(store().images.map((i) => i.id)).toEqual(['a', 'c'])
  })
})

describe('quality route', () => {
  it('round-trips', () => {
    expect(parseHash('#/quality')).toEqual({ name: 'quality' })
    expect(routeToHash({ name: 'quality' })).toBe('#/quality')
  })
})
