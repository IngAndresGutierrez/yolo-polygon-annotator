import { useSyncExternalStore } from 'react'

/** A handful of screens does not justify a router dependency; a typed hash router suffices. */
export type Route =
  | { name: 'gallery' }
  | { name: 'editor'; imageId: string }
  | { name: 'quality' }
  | { name: 'export' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [section, param] = path.split('/')
  if (section === 'editor' && param) return { name: 'editor', imageId: decodeURIComponent(param) }
  if (section === 'export') return { name: 'export' }
  if (section === 'quality') return { name: 'quality' }
  return { name: 'gallery' }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'editor':
      return `#/editor/${encodeURIComponent(route.imageId)}`
    case 'quality':
      return '#/quality'
    case 'export':
      return '#/export'
    case 'gallery':
      return '#/'
  }
}

export function navigate(route: Route): void {
  const hash = routeToHash(route)
  if (window.location.hash !== hash) window.location.hash = hash
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parseHash(hash)
}
