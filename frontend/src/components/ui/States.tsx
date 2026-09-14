import { AlertCircle, Inbox, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function Skeleton({ className = 'h-24' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line/80 ${className}`} />
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <Inbox className="h-8 w-8 text-slate-blue" aria-hidden />
      <p className="mt-3 font-medium text-navy">{title}</p>
      {body ? <p className="mt-1 max-w-md text-sm text-muted">{body}</p> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-critical/20 bg-critical-bg px-6 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-critical" aria-hidden />
      <p className="mt-3 font-medium text-navy">{message}</p>
      {onRetry ? (
        <Button className="mt-4" onClick={onRetry} variant="outline">
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function OfflineBanner() {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-md border border-warning/25 bg-warning-bg px-3 py-2 text-sm text-navy"
    >
      <WifiOff className="h-4 w-4" aria-hidden />
      Connection lost. Showing last available data.
    </div>
  )
}
