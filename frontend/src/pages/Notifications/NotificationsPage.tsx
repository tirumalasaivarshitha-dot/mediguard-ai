import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { relativeTime } from '@/utils/format'
import type { NotificationSeverity } from '@/types'
import type { AppNotification } from '@/types'
import { onRealtime } from '@/services/realtime'
import { useAuth } from '@/hooks/useAuth'

export function NotificationsPage() {
  const { user } = useAuth()
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL')
  const [liveNotifications, setLiveNotifications] = useState<AppNotification[] | null>(null)
  const notificationsQ = useQuery(() => api.listNotifications())

  useEffect(() => {
    if (notificationsQ.data) setLiveNotifications(notificationsQ.data)
  }, [notificationsQ.data])

  useEffect(() => {
    const unsubscribe = onRealtime('notification:created', (payload: any) => {
      if (!payload || (payload.userId && payload.userId !== user?.id)) return
      const notification: AppNotification = {
        id: payload.notificationId || payload.id,
        severity: payload.severity === 'CRITICAL' ? 'Critical' : payload.severity === 'HIGH' ? 'High' : payload.severity === 'WARNING' ? 'Warning' : 'Info',
        title: payload.title || 'Notification',
        body: payload.message || '',
        createdAt: payload.createdAt || new Date().toISOString(),
        read: false,
        href: payload.relatedAlertId ? '/safety' : payload.relatedEquipmentId ? `/equipment/${payload.relatedEquipmentId}` : '/dashboard',
      }
      setLiveNotifications((current) => current?.some((item) => item.id === notification.id) ? current : [notification, ...(current || [])])
    })
    return () => { unsubscribe() }
  }, [user?.id])

  if (notificationsQ.loading) return <Skeleton className="h-80" />
  if (notificationsQ.error) {
    return <ErrorState message="Unable to load notifications." onRetry={notificationsQ.reload} />
  }

  const list = liveNotifications ?? notificationsQ.data ?? []

  const filtered = filterSeverity === 'ALL'
    ? list
    : list.filter((n) => n.severity === filterSeverity)

  async function handleMarkRead(id: string) {
    await api.markNotificationRead(id)
    notificationsQ.reload()
  }

  function getTone(sev: NotificationSeverity) {
    switch (sev) {
      case 'Critical':
        return 'critical'
      case 'High':
        return 'high'
      case 'Warning':
        return 'warning'
      case 'Info':
      default:
        return 'info'
    }
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        question="What operational and intelligence alerts require attention?"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await api.markAllNotificationsRead()
                notificationsQ.reload()
              }}
            >
              Mark all as read
            </Button>
            {['ALL', 'Critical', 'High', 'Warning', 'Info'].map((sev) => (
              <Button
                key={sev}
                variant={filterSeverity === sev ? 'primary' : 'outline'}
                onClick={() => setFilterSeverity(sev)}
              >
                {sev}
              </Button>
            ))}
          </div>
        }
      />

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="border-dashed p-10 text-center text-muted">
            No notifications match the selected filter.
          </Card>
        ) : (
          filtered.map((n) => (
            <Card
              key={n.id}
              className={`flex flex-wrap items-start justify-between gap-4 p-4 transition-colors ${
                !n.read ? 'border-l-4 border-l-teal bg-surface' : 'bg-surface/60 opacity-80'
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <StatusBadge label={n.severity} tone={getTone(n.severity)} />
                  <span className="text-xs text-muted">{relativeTime(n.createdAt)}</span>
                  {!n.read ? (
                    <span className="rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal">
                      New
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 font-serif text-lg font-medium text-navy">{n.title}</h3>
                <p className="mt-1 text-sm text-ink">{n.body}</p>
                {n.href ? (
                  <Link
                    to={n.href}
                    className="mt-2 inline-block text-xs font-semibold text-slate-blue hover:underline"
                  >
                    View related details →
                  </Link>
                ) : null}
              </div>

              {!n.read ? (
                <Button variant="ghost" onClick={() => handleMarkRead(n.id)}>
                  Mark as read
                </Button>
              ) : (
                <span className="text-xs text-muted">Read</span>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
