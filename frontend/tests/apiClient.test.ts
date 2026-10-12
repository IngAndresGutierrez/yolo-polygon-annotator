import { describe, expect, it, vi } from 'vitest'
import { ApiError, type FetchLike, request } from '../src/services/apiClient'

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('api client', () => {
  it('returns parsed JSON on success', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { id: 'default-project' }))
    await expect(request('/api/projects/default-project', {}, fetchImpl)).resolves.toEqual({ id: 'default-project' })
    expect(fetchImpl).toHaveBeenCalledWith('/api/projects/default-project', {})
  })

  it('returns undefined for 204 No Content', async () => {
    const fetchImpl: FetchLike = async () => new Response(null, { status: 204 })
    await expect(request('/api/x', { method: 'DELETE' }, fetchImpl)).resolves.toBeUndefined()
  })

  it('maps the backend error envelope to ApiError', async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse(409, { error: { code: 'conflict', message: 'Modified elsewhere', details: { currentRevision: 7 } } })
    const error = await request('/api/x', {}, fetchImpl).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(409)
    expect(apiError.code).toBe('conflict')
    expect(apiError.message).toBe('Modified elsewhere')
    expect(apiError.details).toEqual({ currentRevision: 7 })
    expect(apiError.isConflict).toBe(true)
  })

  it('maps validation errors with details', async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse(422, { error: { code: 'invalid_input', message: 'Project has 1 validation error(s)', details: { errorCount: 1 } } })
    await expect(request('/api/x', {}, fetchImpl)).rejects.toMatchObject({ status: 422, code: 'invalid_input' })
  })

  it('falls back gracefully for non-JSON errors', async () => {
    const fetchImpl: FetchLike = async () => new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' })
    await expect(request('/api/x', {}, fetchImpl)).rejects.toMatchObject({ status: 502, code: 'http_502', message: 'Bad Gateway' })
  })

  it('reports network failures as status 0', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Failed to fetch')
    }
    const error = (await request('/api/x', {}, fetchImpl).catch((e: unknown) => e)) as ApiError
    expect(error.isNetworkError).toBe(true)
    expect(error.code).toBe('network_error')
  })
})
