import { useEffect, useState } from 'react'

export type ImageLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

interface LoadedImage {
  url: string | null
  element: HTMLImageElement | null
  status: ImageLoadStatus
}

/**
 * Load an image element from a URL for Konva. Only the URL is kept in app state;
 * the decoded element lives in this hook and is released when the URL changes.
 */
export function useHtmlImage(url: string | null): { image: HTMLImageElement | null; status: ImageLoadStatus } {
  const [state, setState] = useState<LoadedImage>({ url: null, element: null, status: 'idle' })

  useEffect(() => {
    if (!url) return undefined
    const element = new Image()
    element.decoding = 'async'
    element.onload = () => setState({ url, element, status: 'loaded' })
    element.onerror = () => setState({ url, element: null, status: 'error' })
    element.src = url
    return () => {
      element.onload = null
      element.onerror = null
      element.src = ''
    }
  }, [url])

  if (!url) return { image: null, status: 'idle' }
  if (state.url !== url) return { image: null, status: 'loading' }
  return { image: state.element, status: state.status }
}

/** Warm the browser cache for images the user is likely to open next. */
export function preloadImages(urls: readonly string[]): void {
  urls.forEach((url) => {
    const element = new Image()
    element.decoding = 'async'
    element.src = url
  })
}
