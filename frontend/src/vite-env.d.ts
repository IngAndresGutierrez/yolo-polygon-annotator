/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API origin. Empty = same origin through the dev/nginx proxy. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
