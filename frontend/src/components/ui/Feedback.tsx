import { CircleAlert, CircleCheck, Info, LoaderCircle, type LucideIcon, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ImageStatus } from '../../types/project'
import { type ToastTone, useToastStore } from '../../stores/toastStore'

export function Spinner({ className = 'size-4', label = 'Loading' }: { className?: string; label?: string }) {
  return <LoaderCircle className={`animate-spin text-accent-400 ${className}`} role="status" aria-label={label} />
}

const statusStyles: Record<ImageStatus, { label: string; className: string }> = {
  annotated: { label: 'Annotated', className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  negative: { label: 'No objects', className: 'bg-violet-500/15 text-violet-300 ring-violet-500/30' },
  pending: { label: 'Pending', className: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
}

export function StatusBadge({ status }: { status: ImageStatus }) {
  const style = statusStyles[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${style.className}`}>
      {style.label}
    </span>
  )
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Icon className="size-10 text-slate-600" aria-hidden />
      <h3 className="text-base font-medium text-slate-200">{title}</h3>
      {children && <div className="max-w-md text-sm text-slate-400">{children}</div>}
    </div>
  )
}

const toneIcons: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
}

const toneStyles: Record<ToastTone, string> = {
  info: 'border-sky-500/40 text-sky-200',
  success: 'border-emerald-500/40 text-emerald-200',
  warning: 'border-amber-500/40 text-amber-200',
  error: 'border-rose-500/40 text-rose-200',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed right-4 bottom-12 z-50 flex w-[min(92vw,24rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = toneIcons[t.tone]
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface-800/95 p-3 shadow-xl backdrop-blur ${toneStyles[t.tone]}`}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="flex-1 text-sm">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-slate-400 hover:text-white">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function Alert({ tone, title, children }: { tone: ToastTone; title?: string; children: ReactNode }) {
  const Icon = toneIcons[tone]
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={`flex gap-2 rounded-lg border bg-surface-900 p-3 ${toneStyles[tone]}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1 text-sm">
        {title && <p className="font-medium">{title}</p>}
        <div className="text-slate-300">{children}</div>
      </div>
    </div>
  )
}
