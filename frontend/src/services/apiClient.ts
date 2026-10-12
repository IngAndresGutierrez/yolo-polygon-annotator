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

/** Perform a request; network failures and non-2xx responses become `ApiError`. */
async function send(path: string, init: RequestInit, fetchImpl: FetchLike): Promise<Response> {
  let response: Response
  try {
    response = await fetchImpl(`${API_BASE_URL}${path}`, init)
  } catch (cause) {
    throw new ApiError(0, 'network_error', 'Cannot reach the API. Is the backend running?', cause)
  }
  if (!response.ok) throw await parseErrorResponse(response)
  return response
}

export async function request<T>(path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch): Promise<T> {
  const response = await send(path, init, fetchImpl)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export interface DownloadedFile {
  blob: Blob
  filename: string | null
}

/** `filename="x.zip"` (or RFC 5987 `filename*=UTF-8''x.zip`) from a Content-Disposition header. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (extended?.[1]) return decodeURIComponent(extended[1])
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain?.[1] ?? null
}

/** Like `request`, but for binary responses (e.g. ZIP downloads produced by a POST). */
export async function requestFile(path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch): Promise<DownloadedFile> {
  const response = await send(path, init, fetchImpl)
  return { blob: await response.blob(), filename: filenameFromDisposition(response.headers.get('Content-Disposition')) }
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
  postForFile: (path: string, body: unknown) => requestFile(path, jsonInit('POST', body)),
  upload: <T>(path: string, files: readonly File[]) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file, file.name))
    return request<T>(path, { method: 'POST', body: form })
  },
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unexpected error'
