/**
 * Thin fetch wrapper. All API failures surface as `ApiError` with the backend's
 * `{ error: { code, message, details } }` envelope, so UI code handles a single
 * error shape.
 */

// Empty by default: requests go to `/api/...` on the same origin (Vite/nginx proxy).
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  get isConflict(): boolean {
    return this.status === 409
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown; details?: unknown }
  detail?: unknown
}

export async function parseErrorResponse(response: Response): Promise<ApiError> {
  let body: ErrorEnvelope | null = null
  try {
    body = (await response.json()) as ErrorEnvelope
  } catch {
    body = null
  }
  const envelope = body?.error
  if (envelope && typeof envelope.message === 'string') {
    const code = typeof envelope.code === 'string' ? envelope.code : 'error'
    return new ApiError(response.status, code, envelope.message, envelope.details ?? null)
  }
  const fallback = typeof body?.detail === 'string' ? body.detail : response.statusText || 'Request failed'
  return new ApiError(response.status, `http_${response.status}`, fallback)
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export async function request<T>(path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch): Promise<T> {
  let response: Response
  try {
    response = await fetchImpl(`${API_BASE_URL}${path}`, init)
  } catch (cause) {
    throw new ApiError(0, 'network_error', 'Cannot reach the API. Is the backend running?', cause)
  }
  if (!response.ok) throw await parseErrorResponse(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, jsonInit('POST', body)),
  put: <T>(path: string, body: unknown) => request<T>(path, jsonInit('PUT', body)),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, files: readonly File[]) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file, file.name))
    return request<T>(path, { method: 'POST', body: form })
  },
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unexpected error'
