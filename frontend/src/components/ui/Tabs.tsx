import type { ReactNode } from 'react'
import { cn } from '@/utils/format'

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={cn(
            'rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
            value === t.id ? 'border-b-2 border-teal text-navy' : 'text-muted hover:text-navy',
          )}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-navy/40" aria-label="Close dialog" onClick={onClose} />
      <div role="dialog" aria-modal className="relative z-10 w-full max-w-lg rounded-lg border border-line bg-surface p-5 shadow-lg">
        <h2 className="font-serif text-xl text-navy">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      {label ? <div className="mb-1 flex justify-between text-sm text-muted"><span>{label}</span><span>{value}%</span></div> : null}
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-teal transition-all duration-300" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}
