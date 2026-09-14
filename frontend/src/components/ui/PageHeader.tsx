import { cn } from '@/utils/format'
import type { ReactNode } from 'react'

export function PageHeader({
  title,
  question,
  actions,
  className,
}: {
  title: string
  question?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-line/70 pb-5', className)}>
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-navy md:text-3xl">{title}</h1>
        {question ? <p className="mt-1 text-sm text-muted">{question}</p> : null}
      </div>
      {actions}
    </div>
  )
}
