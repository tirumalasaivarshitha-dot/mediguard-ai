import { useConnection } from '@/hooks/useConnection'
import { cn } from '@/utils/format'

export function ConnectionStatus({ className }: { className?: string }) {
  const state = useConnection()
  const map = {
    connected: { label: 'Connected', dot: 'bg-healthy' },
    reconnecting: { label: 'Reconnecting', dot: 'bg-warning' },
    offline: { label: 'Offline', dot: 'bg-muted' },
  }
  const m = map[state]
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-muted', className)} title="Live telemetry socket">
      <span className={cn('h-2 w-2 rounded-full', m.dot)} aria-hidden />
      {m.label}
    </span>
  )
}
