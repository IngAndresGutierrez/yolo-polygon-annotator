import { useEffect, useEffectEvent } from 'react'
import { isTypingTarget } from '../utils/format'

export interface Shortcut {
  /** `KeyboardEvent.key`, case-insensitive for letters (e.g. 'z', 'Delete', 'ArrowLeft'). */
  key: string
  mod?: boolean
  shift?: boolean
  handler: (event: KeyboardEvent) => void
  allowRepeat?: boolean
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export const modKeyLabel = isMac ? '⌘' : 'Ctrl'

function matches(shortcut: Shortcut, event: KeyboardEvent): boolean {
  const mod = isMac ? event.metaKey : event.ctrlKey
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    Boolean(shortcut.mod) === mod &&
    (shortcut.shift === undefined || shortcut.shift === event.shiftKey) &&
    !event.altKey
  )
}

/** Window-level shortcuts, ignored while typing in form fields. */
export function useKeyboardShortcuts(shortcuts: readonly Shortcut[], enabled = true): void {
  // Always sees the latest handlers without re-subscribing on every render.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return
    const shortcut = shortcuts.find((s) => matches(s, event))
    if (!shortcut || (event.repeat && !shortcut.allowRepeat)) return
    event.preventDefault()
    shortcut.handler(event)
  })

  useEffect(() => {
    if (!enabled) return undefined
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
