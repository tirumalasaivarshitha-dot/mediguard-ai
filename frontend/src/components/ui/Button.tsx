import { cn } from '@/utils/format'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-navy text-white hover:bg-navy-deep',
    secondary: 'bg-teal text-white hover:bg-teal-dark',
    ghost: 'bg-transparent text-navy hover:bg-canvas',
    danger: 'bg-critical text-white hover:bg-critical/90',
    outline: 'bg-surface text-navy border border-line-strong hover:bg-canvas',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        className,
      )}
      {...props}
    />
  )
}
