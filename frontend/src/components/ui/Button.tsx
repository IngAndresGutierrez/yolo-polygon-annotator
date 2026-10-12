import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-500 disabled:bg-accent-600/40',
  secondary: 'border border-surface-600 bg-surface-800 text-slate-200 hover:bg-surface-700',
  ghost: 'text-slate-300 hover:bg-surface-700 hover:text-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-600/40',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: ButtonSize
  icon?: LucideIcon
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  shortcut?: string
  active?: boolean
}

/** Square icon-only button; `label` is used for both the tooltip and screen readers. */
export function IconButton({ icon: Icon, label, shortcut, active = false, className = '', ...props }: IconButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      aria-pressed={active || undefined}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? 'bg-accent-600 text-white' : 'text-slate-300 hover:bg-surface-700 hover:text-white'
      } ${className}`}
      {...props}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  )
}
