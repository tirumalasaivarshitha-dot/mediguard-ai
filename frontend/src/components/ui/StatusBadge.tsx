import { cn, toneClasses } from '@/utils/format'
import type { Tone } from '@/types'

export function StatusBadge({
  label,
  tone = 'neutral',
  className,
}: {
  label: string
  tone?: Tone
  className?: string
}) {
  const t = toneClasses(tone)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
        t.bg,
        t.text,
        t.border,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} aria-hidden />
      {label}
    </span>
  )
}
