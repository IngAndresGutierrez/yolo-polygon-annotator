import { describe, expect, it } from 'vitest'
import { exportErrorMessage } from '../src/hooks/useYoloExport'
import { ApiError, type FetchLike, filenameFromDisposition, requestFile } from '../src/services/apiClient'
import { fileStem, slugify } from '../src/utils/download'

describe('file downloads', () => {
  it('parses Content-Disposition filenames', () => {
    expect(filenameFromDisposition('attachment; filename="my-picks-detection.zip"')).toBe('my-picks-detection.zip')
    expect(filenameFromDisposition("attachment; filename*=UTF-8''matr%C3%ADcula.zip")).toBe('matrícula.zip')
    expect(filenameFromDisposition('attachment; filename=plain.zip')).toBe('plain.zip')
    expect(filenameFromDisposition(null)).toBeNull()
  })

  it('returns the blob and filename of a successful download', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(new Uint8Array([80, 75, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="s-detection.zip"' },
      })
    const file = await requestFile('/api/x', { method: 'POST' }, fetchImpl)
    expect(file.filename).toBe('s-detection.zip')
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]))
  })

  it('maps error envelopes to ApiError like JSON requests', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Images not found: ghost', details: null } }), {
        status: 404,
      })
    await expect(requestFile('/api/x', {}, fetchImpl)).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('slugifies folder names like the backend', () => {
    expect(slugify('revision plates', 'selection')).toBe('revision-plates')
    expect(slugify('Cars 2 (copy).PNG')).toBe('cars-2-copy-png')
    expect(slugify('Matrícula ñandú')).toBe('matricula-nandu')
    expect(slugify('***', 'selection')).toBe('selection')
  })

  it('derives file stems', () => {
    expect(fileStem('Cars2.png')).toBe('Cars2')
    expect(fileStem('archive.tar.gz')).toBe('archive.tar')
    expect(fileStem('noext')).toBe('noext')
  })
})

describe('export error messages', () => {
  it('lists the images with invalid polygons', () => {
    const error = new ApiError(422, 'invalid_input', '2 image(s) have invalid polygons; fix or deselect them', {
      images: [
        { imageId: 'a', filename: 'a.png', issues: ['Polygon must be convex'] },
        { imageId: 'b', filename: 'b.png', issues: ['Polygon edges cross each other'] },
      ],
    })
    expect(exportErrorMessage(error)).toBe('2 image(s) have invalid polygons; fix or deselect them: a.png, b.png')
  })

  it('falls back to the plain message', () => {
    expect(exportErrorMessage(new ApiError(500, 'x', 'boom'))).toBe('boom')
  })
})
