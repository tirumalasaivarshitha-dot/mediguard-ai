import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ClipboardCheck, Search, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime, riskInterpretation } from '@/utils/format'
import type { HistoryItem } from '@/types'

type HistoryFilter = 'ALL' | 'MAINTENANCE' | 'ALERT'

export function HistoryPage() {
  const { user } = useAuth()
  if (user?.role === 'hospital_admin') return <AdministratorHistoryPage />
  return user?.role === 'maintenance_technician' ? <TechnicianHistoryPage /> : <BiomedicalEngineerHistoryPage />
}

function AdministratorHistoryPage() {
  const historyQ = useQuery(() => api.listHistory())
  const [search, setSearch] = useState('')
  const acknowledgedAlerts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (historyQ.data || []).filter((item) => {
      if (item.type !== 'ALERT' || !item.acknowledgedAt) return false
      if (!query) return true
      return [
        item.problem,
        item.equipment?.name,
        item.equipment?.equipmentCode,
        item.equipment?.id,
        item.status,
        item.action,
        item.dataset?.name,
        item.model?.name,
      ].filter(Boolean).join(' ').toLowerCase().includes(query)
    })
  }, [historyQ.data, search])

  if (historyQ.loading) return <Skeleton className="h-96" />
  if (historyQ.error) return <ErrorState message="Failed to load alert history." onRetry={historyQ.reload} />

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="History" question="Acknowledged safety alerts and their later lifecycle status." />
      <SummaryCard label="Acknowledged alerts" value={acknowledgedAlerts.length} icon={<AlertTriangle className="h-5 w-5" />} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search alerts, equipment, datasets, or models" aria-label="Search acknowledged alert history" className="w-full rounded-md border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-navy outline-none transition focus:border-slate-blue focus:ring-2 focus:ring-slate-blue/15" />
      </div>
      {acknowledgedAlerts.length === 0 ? (
        <EmptyState title={historyQ.data?.length ? 'No matching acknowledged alerts' : 'No acknowledged alerts yet'} body="Acknowledged alerts will appear here while remaining preserved in the alert lifecycle." />
      ) : (
        <div className="space-y-4">
          {acknowledgedAlerts.map((item) => <AdministratorAlertRecord key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}

function AdministratorAlertRecord({ item }: { item: HistoryItem }) {
  const alert = item.alert as Record<string, unknown> | null | undefined
  const severity = alert?.severity ? String(alert.severity) : 'Not recorded'
  const acknowledgedBy = item.acknowledgedBy || 'Not recorded'
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-b border-line bg-surface/60 p-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label="Acknowledged alert" tone="info" />
            <StatusBadge label={item.status.replaceAll('_', ' ')} tone="healthy" />
            <StatusBadge label={severity} tone="warning" />
          </div>
          <h2 className="mt-2 font-serif text-lg font-semibold text-navy">{item.problem || 'Safety alert'}</h2>
          <p className="mt-1 text-sm text-muted">{item.equipment?.name || 'Equipment'} · {item.equipment?.equipmentCode || item.equipment?.id || 'Equipment ID not recorded'}</p>
        </div>
        <div className="text-left text-sm md:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Acknowledged</p>
          <p className="mt-1 font-medium text-navy">{item.acknowledgedAt ? formatDateTime(item.acknowledgedAt) : 'Date not recorded'}</p>
          <p className="mt-1 text-xs text-muted">Alert {item.id}</p>
        </div>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-2">
        <InfoBlock label="Why the alert was generated" value={item.action || 'No explanation recorded.'} />
        <InfoBlock label="Recommended action" value={item.action || 'No recommended action recorded.'} />
        <InfoBlock label="Acknowledged by" value={acknowledgedBy} />
        <InfoBlock label="Failure risk" value={item.failureRisk == null ? 'Not recorded' : `${item.failureRisk}%`} />
        <InfoBlock label="Related dataset" value={item.dataset?.name || item.model?.datasetName || 'Not recorded'} />
        <InfoBlock label="Related model" value={item.model ? `${item.model.name} ${item.model.version}` : 'Not recorded'} />
      </div>
    </Card>
  )
}

function BiomedicalEngineerHistoryPage() {
  const historyQ = useQuery(() => api.listHistory())
  const [filter, setFilter] = useState<HistoryFilter>('ALL')
  const [search, setSearch] = useState('')

  const items = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (historyQ.data || []).filter((item) => {
      if (filter !== 'ALL' && item.type !== filter) return false
      if (!query) return true
      const haystack = [
        item.equipment?.equipmentCode,
        item.equipment?.name,
        item.equipment?.equipmentType,
        item.equipment?.department,
        item.problem,
        item.action,
        item.status,
        item.assignedTechnician?.name,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [filter, historyQ.data, search])

  if (historyQ.loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="History" question="Completed equipment work and resolved safety intelligence you reviewed." />
        <Skeleton className="h-28" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (historyQ.error) {
    return <ErrorState message="Failed to load history." onRetry={historyQ.reload} />
  }

  const maintenanceCount = historyQ.data?.filter((item) => item.type === 'MAINTENANCE').length || 0
  const alertCount = historyQ.data?.filter((item) => item.type === 'ALERT').length || 0

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="History"
        question="Completed equipment work and resolved safety intelligence you reviewed."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'MAINTENANCE', 'ALERT'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  filter === value ? 'border-navy bg-navy text-white' : 'border-line bg-surface text-muted hover:border-slate-blue hover:text-navy'
                }`}
              >
                {value === 'ALL' ? 'All records' : value === 'MAINTENANCE' ? 'Maintenance' : 'Alerts'}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Historical records" value={historyQ.data?.length || 0} icon={<ClipboardCheck className="h-5 w-5" />} />
        <SummaryCard label="Maintenance completed" value={maintenanceCount} icon={<Wrench className="h-5 w-5" />} />
        <SummaryCard label="Alerts reviewed" value={alertCount} icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search equipment, work, alerts, or technicians"
          aria-label="Search history"
          className="w-full rounded-md border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-navy outline-none transition focus:border-slate-blue focus:ring-2 focus:ring-slate-blue/15"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={historyQ.data?.length ? 'No matching history' : 'No history available'}
          body={historyQ.data?.length ? 'Try a different search or record type.' : 'Completed work and resolved alerts will appear here when available.'}
        />
      ) : (
        <div className="space-y-4">
          {items.map((item) => <HistoryRecord key={`${item.type}-${item.id}`} item={item} />)}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <Card className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal/10 text-teal">{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-1 font-serif text-2xl font-semibold text-navy">{value}</p>
      </div>
    </Card>
  )
}

function HistoryRecord({ item }: { item: HistoryItem }) {
  const equipmentLabel = item.equipment?.equipmentCode || item.equipment?.name || item.equipment?.equipmentType || 'Equipment'
  const risk = item.failureRisk == null ? null : riskInterpretation(item.failureRisk)
  const date = item.completedAt || item.reviewedAt || item.activityAt
  const relatedId = item.type === 'MAINTENANCE'
    ? typeof item.maintenance?.workOrderCode === 'string' ? item.maintenance.workOrderCode : item.id
    : item.id

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-b border-line bg-surface/60 p-5 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${item.type === 'ALERT' ? 'bg-critical-bg text-critical' : 'bg-info-bg text-info'}`}>
            {item.type === 'ALERT' ? <AlertTriangle className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={item.type === 'ALERT' ? 'Alert' : 'Maintenance'} tone={item.type === 'ALERT' ? 'critical' : 'info'} />
              <StatusBadge label={item.status.replaceAll('_', ' ')} tone="healthy" />
              {risk ? <StatusBadge label={`${item.failureRisk}% ${risk.label}`} tone={risk.tone} /> : null}
            </div>
            <h2 className="mt-2 font-serif text-lg font-semibold text-navy">{item.problem || (item.type === 'ALERT' ? 'Resolved safety alert' : 'Completed maintenance')}</h2>
            <p className="mt-1 text-sm text-muted">{equipmentLabel} · {item.equipment?.department || 'Department not specified'}{item.equipment?.location ? ` · ${item.equipment.location}` : ''}</p>
          </div>
        </div>
        <div className="text-left text-sm md:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.type === 'ALERT' ? 'Reviewed / resolved' : 'Completed'}</p>
          <p className="mt-1 font-medium text-navy">{date ? formatDateTime(date) : 'Date not recorded'}</p>
          <p className="mt-1 text-xs text-muted">{relatedId}</p>
        </div>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-2">
        <InfoBlock label={item.type === 'ALERT' ? 'Alert description' : 'Action taken'} value={item.action || 'No additional action recorded.'} />
        <InfoBlock label={item.type === 'ALERT' ? 'Resolution notes' : 'Work summary'} value={item.type === 'ALERT' ? (item.action || 'No resolution notes recorded.') : (item.problem || 'No work summary recorded.')} />
        <InfoBlock label="Assigned technician" value={item.assignedTechnician?.name || item.assignedTechnician?.email || 'Not assigned'} />
        <InfoBlock label="Reviewed by" value={item.reviewedBy?.name || item.reviewedBy?.email || 'Biomedical engineering review'} />
      </div>
    </Card>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink">{value}</p>
    </div>
  )
}

function TechnicianHistoryPage() {
  const historyQ = useQuery(() => api.listHistory())
  const [search, setSearch] = useState('')

  const completedWork = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (historyQ.data || []).filter((item) => {
      if (item.type !== 'MAINTENANCE') return false
      if (!query) return true
      const haystack = [
        item.equipment?.equipmentCode,
        item.equipment?.name,
        item.equipment?.equipmentType,
        item.equipment?.department,
        item.equipment?.location,
        item.problem,
        item.action,
        item.status,
        item.maintenance?.workOrderCode,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [historyQ.data, search])

  if (historyQ.loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="History" question="Your completed maintenance work." />
        <Skeleton className="h-28" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (historyQ.error) {
    return <ErrorState message="Failed to load history." onRetry={historyQ.reload} />
  }

  const equipmentCount = new Set(completedWork.map((item) => item.equipment?.id).filter(Boolean)).size
  const recentCount = completedWork.filter((item) => {
    const date = item.completedAt || item.activityAt
    return date && Date.now() - new Date(date).getTime() <= 30 * 86400000
  }).length

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="History" question="Your completed maintenance work." />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Completed work" value={completedWork.length} icon={<ClipboardCheck className="h-5 w-5" />} />
        <SummaryCard label="Equipment serviced" value={equipmentCount} icon={<Wrench className="h-5 w-5" />} />
        <SummaryCard label="Recent completions" value={recentCount} icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search completed work or equipment"
          aria-label="Search completed maintenance history"
          className="w-full rounded-md border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-navy outline-none transition focus:border-slate-blue focus:ring-2 focus:ring-slate-blue/15"
        />
      </div>

      {completedWork.length === 0 ? (
        <EmptyState
          title={historyQ.data?.length ? 'No matching completed work' : 'No completed maintenance yet'}
          body={historyQ.data?.length ? 'Try a different search.' : 'Completed work will appear here after assigned maintenance is finished.'}
        />
      ) : (
        <div className="space-y-4">
          {completedWork.map((item) => <TechnicianHistoryRecord key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}

function TechnicianHistoryRecord({ item }: { item: HistoryItem }) {
  const equipmentLabel = item.equipment?.equipmentCode || item.equipment?.name || item.equipment?.equipmentType || 'Equipment'
  const risk = item.failureRisk == null ? null : riskInterpretation(item.failureRisk)
  const date = item.completedAt || item.activityAt
  const workOrderCode = typeof item.maintenance?.workOrderCode === 'string' ? item.maintenance.workOrderCode : item.id

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-b border-line bg-surface/60 p-5 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-info-bg text-info">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label="Maintenance" tone="info" />
              <StatusBadge label={item.status.replaceAll('_', ' ')} tone="healthy" />
              {risk ? <StatusBadge label={`${item.failureRisk}% ${risk.label}`} tone={risk.tone} /> : null}
            </div>
            <h2 className="mt-2 font-serif text-lg font-semibold text-navy">{item.problem || 'Completed maintenance'}</h2>
            <p className="mt-1 text-sm text-muted">
              {equipmentLabel}
              {item.equipment?.equipmentType ? ` · ${item.equipment.equipmentType}` : ''}
              {item.equipment?.department ? ` · ${item.equipment.department}` : ''}
              {item.equipment?.location ? ` · ${item.equipment.location}` : ''}
            </p>
          </div>
        </div>
        <div className="text-left text-sm md:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Completed</p>
          <p className="mt-1 font-medium text-navy">{date ? formatDateTime(date) : 'Date not recorded'}</p>
          <p className="mt-1 text-xs text-muted">Work order {workOrderCode}</p>
        </div>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-2">
        <InfoBlock label="Original problem / issue" value={item.problem || 'No issue description recorded.'} />
        <InfoBlock label="Action / work performed" value={item.action || 'No completion notes recorded.'} />
        <InfoBlock label="Related alert" value={item.alert?.title ? String(item.alert.title) : 'No related alert'} />
        <InfoBlock label="Verification / reassessment" value={item.maintenance?.completionNotes ? String(item.maintenance.completionNotes) : 'No additional verification recorded.'} />
      </div>
    </Card>
  )
}
