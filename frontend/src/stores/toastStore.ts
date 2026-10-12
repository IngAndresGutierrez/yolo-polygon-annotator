import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (tone: ToastTone, message: string, timeoutMs?: number) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (tone, message, timeoutMs = tone === 'error' ? 8000 : 4000) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, tone, message }] }))
    window.setTimeout(() => get().dismiss(id), timeoutMs)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  info: (message: string) => useToastStore.getState().push('info', message),
  success: (message: string) => useToastStore.getState().push('success', message),
  warning: (message: string) => useToastStore.getState().push('warning', message),
  error: (message: string) => useToastStore.getState().push('error', message),
}
