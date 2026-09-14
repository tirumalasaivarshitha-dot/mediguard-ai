import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Field, Input, Select } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { formatCurrency, formatDate } from '@/utils/format'
import { Modal } from '@/components/ui/Tabs'
import { onRealtime } from '@/services/realtime'
import type { Equipment, Technician, WorkOrder, WorkOrderStatus, WorkOrderType } from '@/types'
import {
  Wrench,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  DollarSign,
  Search,
  Sparkles,
  UserPlus,
} from 'lucide-react'

const statuses: WorkOrderStatus[] = ['Pending', 'Assigned', 'Scheduled', 'In Progress', 'Completed', 'Cancelled']
const priorities = ['Low', 'Routine', 'Elevated', 'Urgent']
const types: WorkOrderType[] = ['Preventive', 'Corrective', 'Inspection', 'Calibration']

export function MaintenancePage() {
  const { user } = useAuth()
  const location = useLocation()
  const mine = location.pathname.endsWith('/my-tasks') || user?.role === 'maintenance_technician'
  const searchParams = new URLSearchParams(location.search)

  const eq = useQuery(() => api.listEquipment({ operationalDataset: true }))
  const activeDatasetQ = useQuery(() => api.getEquipmentFilterOptions(true))
  const techniciansQ = useQuery(() => api.listTechnicians())
  const technicians = techniciansQ.data ?? []

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const assignedTechnicianId = mine && user
    ? technicians.find((t) => t.name === user.name)?.id || user.id
    : undefined
  const q = useQuery(
    () => api.listWorkOrders({
      search: search.trim() || undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      type: typeFilter || undefined,
      technicianId: assignedTechnicianId,
      limit: 100,
    }),
    [search, statusFilter, priorityFilter, typeFilter, assignedTechnicianId],
  )

  useEffect(() => {
    const events = ['maintenance:created', 'maintenance:assigned', 'maintenance:scheduled', 'maintenance:started', 'maintenance:updated', 'maintenance:completed', 'maintenance:cancelled']
    const unsubscribe = events.map((event) => onRealtime(event, () => {
      void q.reload()
      void eq.reload()
    }))
    const unsubscribeDataset = onRealtime('dataset:activated', () => {
      q.clear()
      eq.clear()
      activeDatasetQ.clear()
      void q.reload()
      void eq.reload()
      void activeDatasetQ.reload()
    })
    return () => {
      unsubscribe.forEach((remove) => remove())
      unsubscribeDataset()
    }
  }, [q.reload, q.clear, eq.reload, eq.clear, activeDatasetQ.reload, activeDatasetQ.clear])

  // Modals state
  const [createOpen, setCreateOpen] = useState(false)
  const [createPrefill, setCreatePrefill] = useState<{
    equipmentId?: string
    priorityLabel?: 'Low' | 'Routine' | 'Elevated' | 'Urgent'
    notes?: string
    assessmentId?: string
  }>({})

  const [assignWo, setAssignWo] = useState<WorkOrder | null>(null)
  const [scheduleWo, setScheduleWo] = useState<WorkOrder | null>(null)
  const [completeWo, setCompleteWo] = useState<WorkOrder | null>(null)
  const [detailWo, setDetailWo] = useState<WorkOrder | null>(null)

  // Parse prefill parameters from URL
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setCreatePrefill({
        equipmentId: searchParams.get('equipmentId') || undefined,
        priorityLabel: (searchParams.get('priority') as any) || undefined,
        notes: searchParams.get('notes') ? decodeURIComponent(searchParams.get('notes')!) : undefined,
        assessmentId: searchParams.get('assessmentId') || undefined,
      })
      setCreateOpen(true)
    }
  }, [location.search])

  const allWorkOrders = q.data ?? []
  const allEquipment = eq.data ?? []

  // Metrics
  const metrics = useMemo(() => {
    const total = allWorkOrders.length
    const assigned = allWorkOrders.filter((w) => w.status === 'Assigned').length
    const scheduled = allWorkOrders.filter((w) => w.status === 'Scheduled').length
    const inProgress = allWorkOrders.filter((w) => w.status === 'In Progress').length
    const completed = allWorkOrders.filter((w) => w.status === 'Completed').length
    const now = Date.now()
    const overdue = allWorkOrders.filter((w) => w.dueAt && new Date(w.dueAt).getTime() < now && !['Completed', 'Cancelled'].includes(w.status)).length
    return { total, pending: allWorkOrders.filter((w) => w.status === 'Pending').length, assigned, scheduled, inProgress, completed, overdue }
  }, [allWorkOrders])

  // Filtered rows
  const rows = useMemo(() => {
    let list = [...allWorkOrders]
    if (mine && user) {
      const tech = technicians.find((t) => t.name === user.name)
      if (tech) {
        list = list.filter((w) => w.assignedTechnicianId === tech.id || w.assignedTechnicianId === tech.name)
      } else {
        list = list.filter((w) => w.assignedTechnicianId === user.id || w.assignedTechnicianId === user.name)
      }
    }
    if (statusFilter) list = list.filter((w) => w.status === statusFilter)
    if (priorityFilter) list = list.filter((w) => w.priorityLabel === priorityFilter)
    if (typeFilter) list = list.filter((w) => w.type === typeFilter)
    if (search.trim()) {
      const query = search.toLowerCase()
      list = list.filter(
        (w) =>
          w.id.toLowerCase().includes(query) ||
          (w.workOrderCode && w.workOrderCode.toLowerCase().includes(query)) ||
          w.equipmentId.toLowerCase().includes(query) ||
          w.title.toLowerCase().includes(query) ||
          (w.notes && w.notes.toLowerCase().includes(query)),
      )
    }
    return list
  }, [allWorkOrders, mine, user, statusFilter, priorityFilter, typeFilter, search])

  if (q.error) return <ErrorState message="Unable to load maintenance work orders." onRetry={q.reload} />
  if (activeDatasetQ.error) return <ErrorState message="Unable to determine the active operational dataset." onRetry={activeDatasetQ.reload} />
  if (q.loading || eq.loading || techniciansQ.loading || activeDatasetQ.loading) return <Skeleton className="h-96" />

  const canAssign = user?.role === 'biomedical_engineer'
  const canCreate = canAssign

  if (!activeDatasetQ.data?.activeDataset) {
    return (
      <div>
        <PageHeader title={mine ? 'My maintenance tasks' : 'Maintenance Management & Work Orders'} question="Review current operational maintenance work." />
        <EmptyState title="No active operational dataset" body="Activate an operational dataset in Data & AI to view current maintenance work." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={mine ? 'My maintenance tasks' : 'Maintenance Management & Work Orders'}
        question="Manage biomedical work orders, technician assignments, and repair workflows."
        actions={
          <div className="flex flex-wrap gap-2">
            {!mine && canCreate && (
              <Button onClick={() => { setCreatePrefill({}); setCreateOpen(true) }}>
                + New work order
              </Button>
            )}
          </div>
        }
      />

      {toast ? (
        <div className="mb-4 flex items-center justify-between rounded-md border border-healthy/30 bg-healthy-bg p-3 text-sm text-healthy">
          <span>{toast}</span>
          <button className="text-xs font-semibold underline" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="mb-5 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-muted">
        Current operational dataset: <strong className="text-navy">{activeDatasetQ.data.activeDataset.name}</strong>
      </div>

      {/* Metrics Row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-navy/10 p-3 text-navy">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted">Pending</p>
            <p className="font-serif text-2xl font-semibold text-navy">{metrics.pending}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-critical-bg p-3 text-critical"><AlertTriangle className="h-6 w-6" /></div>
          <div><p className="text-xs text-muted">Assigned</p><p className="font-serif text-2xl font-semibold text-critical">{metrics.assigned}</p></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-warning-bg p-3 text-warning">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted">Scheduled</p>
            <p className="font-serif text-2xl font-semibold text-warning">{metrics.scheduled}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-info-bg p-3 text-info">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted">In Progress</p>
            <p className="font-serif text-2xl font-semibold text-info">{metrics.inProgress}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-healthy-bg p-3 text-healthy">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted">Completed</p>
            <p className="font-serif text-2xl font-semibold text-healthy">{metrics.completed}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-critical-bg p-3 text-critical"><AlertTriangle className="h-6 w-6" /></div>
          <div><p className="text-xs text-muted">Overdue</p><p className="font-serif text-2xl font-semibold text-critical">{metrics.overdue}</p></div>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <Input
              className="pl-9 text-sm"
              placeholder="Search WO code, equipment ID, title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="w-36 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>

            <Select
              className="w-36 text-sm"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filter by priority"
            >
              <option value="">All priorities</option>
              {priorities.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>

            <Select
              className="w-36 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Work Orders List */}
      {!rows.length ? (
        <EmptyState title="No maintenance work orders match your search criteria." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-canvas">
          <div className="hidden min-w-[900px] grid-cols-[1.2fr_1.5fr_0.7fr_0.8fr_1fr_0.8fr_0.9fr] gap-3 border-b border-line bg-stone-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted lg:grid">
            <span>Equipment</span><span>Problem / Alert</span><span>Priority</span><span>Failure risk</span><span>Assigned to</span><span>Status</span><span>Updated</span>
          </div>
          <div className="grid gap-3 p-3">
          {rows.map((w) => {
            const assignedTech = technicians.find(
              (t) => t.id === w.assignedTechnicianId || t.name === w.assignedTechnicianId,
            )
            const isCompleted = w.status === 'Completed'
            const isCancelled = w.status === 'Cancelled'

            return (
              <Card key={w.id} className="flex flex-col gap-4 justify-between sm:flex-row sm:items-start lg:grid lg:grid-cols-[1.2fr_1.5fr_0.7fr_0.8fr_1fr_0.8fr_0.9fr] lg:items-start lg:gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-blue bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {w.workOrderCode || w.id}
                    </span>
                    {w.source?.startsWith('AI_') && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                        <Sparkles className="h-3 w-3" /> AI Triggered
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      Created {formatDate(w.createdAt)}
                    </span>
                  </div>

                  <h2
                    className="font-serif text-lg font-semibold text-navy hover:text-slate-blue cursor-pointer"
                    onClick={() => setDetailWo(w)}
                  >
                    {w.title}
                  </h2>

                  <p className="text-sm text-muted">
                    Equipment:{' '}
                    <Link className="font-medium text-slate-blue hover:underline" to={`/equipment/${w.equipmentId}`}>
                      {w.equipmentName || w.equipmentCode || w.equipmentId}
                    </Link>
                    {' · '}
                    <span className="font-medium text-ink">{w.equipmentType || w.type}</span>
                  </p>
                  <p className="text-xs text-muted">
                    Failure risk: <strong className={w.failureRisk != null && w.failureRisk >= 75 ? 'text-critical' : 'text-navy'}>{w.failureRisk != null ? `${w.failureRisk}%` : 'Not available'}</strong>
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted pt-1">
                    <span className="flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-navy" />
                      Assigned:{' '}
                      <strong className="text-navy">{assignedTech?.name || w.assignedTechnicianId || 'Unassigned'}</strong>
                    </span>
                    {w.scheduledDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-info" />
                        Scheduled: <strong className="text-navy">{formatDate(w.scheduledDate)}</strong>
                      </span>
                    )}
                    {w.dueDate && (
                      <span className={`flex items-center gap-1 ${w.dueAt && new Date(w.dueAt).getTime() < Date.now() && !['Completed', 'Cancelled'].includes(w.status) ? 'text-critical' : ''}`}>
                        Due: <strong className="text-navy">{formatDate(w.dueDate)}</strong>
                      </span>
                    )}
                    {w.estimatedCost != null && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5 text-healthy" />
                        Est. Cost: <strong className="text-navy">{formatCurrency(w.estimatedCost)}</strong>
                      </span>
                    )}
                  </div>

                  {w.notes && <p className="text-sm text-ink line-clamp-2 pt-1">{w.notes}</p>}
                  {w.relatedAlertId ? (
                    <div className="rounded-md border border-critical/20 bg-critical-bg/10 p-3 text-sm">
                      <p className="font-semibold text-navy">Related alert: <Link className="text-slate-blue hover:underline" to="/alerts">{w.relatedAlertTitle || w.relatedAlertId}</Link></p>
                      <p className="mt-1 text-ink"><strong>Why:</strong> {w.relatedAlertReason || 'Not available'}</p>
                      <p className="mt-1 text-ink"><strong>Failure risk:</strong> {w.failureRisk != null ? `${w.failureRisk}%` : 'Not available'}</p>
                      <p className="mt-1 text-ink"><strong>Recommended action:</strong> {w.relatedAlertRecommendedAction || 'Not available'}</p>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3 text-xs text-muted">
                    <span>Source: <strong className="text-navy">{w.source?.startsWith('AI_') ? 'Operational AI assessment' : 'Manual request'}</strong></span>
                    {w.relatedAlertId ? <span>Alert status: <strong className="text-navy">{w.relatedAlertStatus || 'Not available'}</strong></span> : null}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2.5 min-w-[170px]">
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={w.priorityLabel}
                      tone={
                        w.priorityLabel === 'Urgent'
                          ? 'critical'
                          : w.priorityLabel === 'Elevated'
                          ? 'warning'
                          : 'info'
                      }
                    />
                    <StatusBadge
                      label={w.status}
                      tone={
                        w.status === 'Completed'
                          ? 'healthy'
                          : w.status === 'In Progress'
                          ? 'warning'
                          : w.status === 'Scheduled'
                          ? 'info'
                          : 'neutral'
                      }
                    />
                  </div>

                  {/* Actions depending on state & role */}
                  <div className="flex flex-wrap justify-end gap-1.5 pt-1">
                    {!isCompleted && !isCancelled && (
                      <>
                        {canAssign && (
                          <Button
                            variant="outline"
                            onClick={() => setAssignWo(w)}
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" />
                            {w.assignedTechnicianId ? 'Reassign' : 'Assign'}
                          </Button>
                        )}

                        {canAssign && w.status !== 'Scheduled' && w.status !== 'In Progress' && (
                          <Button
                            variant="outline"
                            onClick={() => setScheduleWo(w)}
                          >
                            <Calendar className="h-3.5 w-3.5 mr-1" />
                            Schedule
                          </Button>
                        )}

                        {w.status === 'Scheduled' || w.status === 'Assigned' ? (
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              await api.updateWorkOrderStatus(w.id, 'In Progress')
                              setToast(`Work Order ${w.workOrderCode || w.id} marked as In Progress.`)
                              q.reload()
                            }}
                          >
                            Start Work
                          </Button>
                        ) : null}

                        {w.status === 'In Progress' && <Button
                          variant="primary"
                          onClick={() => setCompleteWo(w)}
                        >
                          Complete
                        </Button>}
                      </>
                    )}

                    {canAssign && isCompleted && (
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            const result = await api.reassessMaintenanceWorkOrder(w.id)
                            setToast(`Equipment reassessed. Current health: ${result.healthScore ?? 'Unavailable'}; failure risk: ${result.failureRisk ?? 'Unavailable'}.`)
                            q.reload()
                            eq.reload()
                          } catch (error) {
                            setToast(error instanceof Error ? error.message : 'Unable to reassess equipment.')
                          }
                        }}
                      >
                        Reassess equipment
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      onClick={() => setDetailWo(w)}
                    >
                      Details
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
          </div>
        </div>
      )}

      {/* Create Modal */}
      <CreateWorkOrderModal
        open={createOpen}
        equipmentList={allEquipment}
        prefill={createPrefill}
        onClose={() => setCreateOpen(false)}
        onCreated={(wo) => {
          setCreateOpen(false)
          setToast(`Work order ${wo.workOrderCode || wo.id} created successfully.`)
          q.reload()
        }}
      />

      {/* Assign Modal */}
      {assignWo && (
        <AssignModal
          open={!!assignWo}
          workOrder={assignWo}
          equipmentList={allEquipment}
          technicians={technicians}
          onClose={() => setAssignWo(null)}
          onAssigned={() => {
            setAssignWo(null)
            setToast(`Technician assigned to ${assignWo.workOrderCode || assignWo.id}.`)
            q.reload()
          }}
        />
      )}

      {/* Schedule Modal */}
      {scheduleWo && (
        <ScheduleModal
          open={!!scheduleWo}
          workOrder={scheduleWo}
          onClose={() => setScheduleWo(null)}
          onScheduled={() => {
            setScheduleWo(null)
            setToast(`Work order ${scheduleWo.workOrderCode || scheduleWo.id} scheduled.`)
            q.reload()
          }}
        />
      )}

      {/* Complete Modal */}
      {completeWo && (
        <CompleteModal
          open={!!completeWo}
          workOrder={completeWo}
          onClose={() => setCompleteWo(null)}
          onCompleted={() => {
            setCompleteWo(null)
            setToast(`Work order ${completeWo.workOrderCode || completeWo.id} completed.`)
            q.reload()
          }}
        />
      )}

      {/* Details Modal */}
      {detailWo && (
        <DetailsModal
          open={!!detailWo}
          workOrder={detailWo}
          equipmentList={allEquipment}
          technicians={technicians}
          onClose={() => setDetailWo(null)}
        />
      )}
    </div>
  )
}

/* ==================================================================== */
/* CREATE WORK ORDER MODAL WITH DUPLICATE ACTIVE WO CHECK               */
/* ==================================================================== */
function CreateWorkOrderModal({
  open,
  equipmentList,
  prefill,
  onClose,
  onCreated,
}: {
  open: boolean
  equipmentList: Equipment[]
  prefill: {
    equipmentId?: string
    priorityLabel?: 'Low' | 'Routine' | 'Elevated' | 'Urgent'
    notes?: string
    assessmentId?: string
  }
  onClose: () => void
  onCreated: (wo: WorkOrder) => void
}) {
  const [equipmentId, setEquipmentId] = useState('')
  const [title, setTitle] = useState('Preventive Maintenance & Inspection')
  const [type, setType] = useState<WorkOrderType>('Preventive')
  const [priorityLabel, setPriorityLabel] = useState<'Low' | 'Routine' | 'Elevated' | 'Urgent'>('Routine')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [activeWoWarning, setActiveWoWarning] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const eqId = prefill.equipmentId || (equipmentList[0]?.id ?? '')
      setEquipmentId(eqId)
      setPriorityLabel(prefill.priorityLabel || 'Routine')
      setNotes(prefill.notes || '')
      setTitle(
        prefill.notes
          ? `Corrective Maintenance: ${prefill.notes.slice(0, 45)}...`
          : 'Preventive Maintenance & Inspection',
      )
      setType(prefill.priorityLabel === 'Urgent' ? 'Corrective' : 'Preventive')
      setError(null)
    }
  }, [open, prefill, equipmentList])

  // Check duplicate active work order when equipmentId changes
  useEffect(() => {
    if (!equipmentId) {
      setActiveWoWarning(null)
      return
    }
    api.listWorkOrders({ equipmentId }).then((wos) => {
      const active = wos.find(
        (w) => w.status === 'Pending' || w.status === 'Assigned' || w.status === 'Scheduled' || w.status === 'In Progress',
      )
      if (active) {
        setActiveWoWarning(
          `Warning: Equipment ${equipmentId} already has active work order (${active.workOrderCode || active.id}) in status "${active.status}".`,
        )
      } else {
        setActiveWoWarning(null)
      }
    })
  }, [equipmentId])

  async function handleSubmit() {
    if (!equipmentId) {
      setError('Please select an equipment item.')
      return
    }
    if (!title.trim()) {
      setError('Title is required.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const created = await api.createWorkOrder({
        equipmentId,
        title,
        type,
        priorityLabel,
        notes,
        dueAt: dueDate ? new Date(dueDate).toISOString() : undefined,
        assessmentId: prefill.assessmentId,
        source: prefill.assessmentId ? 'AI_ASSESSMENT' : 'MANUAL',
      })
      onCreated(created)
    } catch (err: any) {
      setError(err?.message || 'Failed to create work order.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title="Create Maintenance Work Order" onClose={onClose}>
      <div className="space-y-4">
        {activeWoWarning && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{activeWoWarning}</span>
          </div>
        )}

        {prefill.assessmentId && (
          <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50 p-2.5 text-xs text-purple-800">
            <Sparkles className="h-4 w-4 shrink-0 text-purple-600" />
            <span>Pre-filled from AI Assessment (#{prefill.assessmentId})</span>
          </div>
        )}

        <Field label="Equipment Item">
          <Select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            {equipmentList.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.id} · {eq.equipmentType} ({eq.department})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Work Order Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Annual Preventive Calibration" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Work Order Type">
            <Select value={type} onChange={(e) => setType(e.target.value as WorkOrderType)}>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>

          <Field label="Priority Level">
            <Select
              value={priorityLabel}
              onChange={(e) => setPriorityLabel(e.target.value as any)}
            >
              {priorities.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Due Date (Optional)">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>

        <Field label="Description / Technician Notes">
          <textarea
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm focus:border-navy focus:outline-none"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detailed description of issue or maintenance procedures required..."
          />
        </Field>

        {error && <p className="text-xs text-critical font-medium">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Work Order'}
        </Button>
      </div>
    </Modal>
  )
}

/* ==================================================================== */
/* ASSIGN TECHNICIAN MODAL                                             */
/* ==================================================================== */
function AssignModal({
  open,
  workOrder,
  equipmentList,
  technicians,
  onClose,
  onAssigned,
}: {
  open: boolean
  workOrder: WorkOrder
  equipmentList: Equipment[]
  technicians: Technician[]
  onClose: () => void
  onAssigned: () => void
}) {
  const eq = equipmentList.find((e) => e.id === workOrder.equipmentId)
  const recommendedTech = eq ? api.recommendTechnician(eq, technicians) : technicians[0]
  const [selectedTechId, setSelectedTechId] = useState(workOrder.assignedTechnicianId || recommendedTech?.id || technicians[0]?.id || '')
  const [submitting, setSubmitting] = useState(false)

  async function handleAssign() {
    setSubmitting(true)
    try {
      await api.assignTechnician(workOrder.id, selectedTechId)
      onAssigned()
    } catch {
      // The API error is surfaced by the parent query refresh.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={`Assign Technician to ${workOrder.workOrderCode || workOrder.id}`} onClose={onClose}>
      <div className="space-y-4">
        {recommendedTech && (
          <div className="flex items-center gap-3 rounded-md border border-teal/20 bg-teal/5 p-3 text-xs text-navy">
            <Sparkles className="h-5 w-5 text-teal shrink-0" />
            <div>
              <p className="font-semibold text-teal">Recommended Technician: {recommendedTech.name}</p>
              <p className="text-muted">Specialty: {recommendedTech.expertise.join(', ')} · Workload: {recommendedTech.currentWorkload} active tasks</p>
            </div>
          </div>
        )}

        <Field label="Select Biomedical Technician">
          <Select value={selectedTechId} onChange={(e) => setSelectedTechId(e.target.value)}>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.role}) — Workload: {t.currentWorkload} tasks
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleAssign} disabled={submitting}>
          {submitting ? 'Assigning...' : 'Assign Technician'}
        </Button>
      </div>
    </Modal>
  )
}

/* ==================================================================== */
/* SCHEDULE WORK ORDER MODAL                                           */
/* ==================================================================== */
function ScheduleModal({
  open,
  workOrder,
  onClose,
  onScheduled,
}: {
  open: boolean
  workOrder: WorkOrder
  onClose: () => void
  onScheduled: () => void
}) {
  const [scheduledAt, setScheduledAt] = useState(
    workOrder.scheduledDate || new Date().toISOString().split('T')[0],
  )
  const [submitting, setSubmitting] = useState(false)

  async function handleSchedule() {
    setSubmitting(true)
    try {
      await api.scheduleWorkOrder(workOrder.id, new Date(scheduledAt).toISOString())
      onScheduled()
    } catch {
      // Fallback handled
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={`Schedule Maintenance for ${workOrder.workOrderCode || workOrder.id}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Target Maintenance Date">
          <Input type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSchedule} disabled={submitting}>
          {submitting ? 'Scheduling...' : 'Confirm Schedule'}
        </Button>
      </div>
    </Modal>
  )
}

/* ==================================================================== */
/* COMPLETE WORK ORDER MODAL                                           */
/* ==================================================================== */
function CompleteModal({
  open,
  workOrder,
  onClose,
  onCompleted,
}: {
  open: boolean
  workOrder: WorkOrder
  onClose: () => void
  onCompleted: () => void
}) {
  const [completionNotes, setCompletionNotes] = useState('')
  const [downtimeHours, setDowntimeHours] = useState('1.5')
  const [partsUsed, setPartsUsed] = useState('O-Ring Seals, Calibration Sensor Kit')
  const [maintenanceCost, setMaintenanceCost] = useState('250')
  const [submitting, setSubmitting] = useState(false)

  async function handleComplete() {
    setSubmitting(true)
    try {
      const partsArray = partsUsed
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)

      await api.completeWorkOrder(workOrder.id, {
        completionNotes,
        downtimeHours: Number(downtimeHours) || 0,
        partsUsed: partsArray,
        maintenanceCost: Number(maintenanceCost) || 0,
      })
      onCompleted()
    } catch {
      // Handled
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={`Complete Work Order ${workOrder.workOrderCode || workOrder.id}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Completion Summary & Technician Notes">
          <textarea
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm focus:border-navy focus:outline-none"
            rows={3}
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder="Describe procedures completed, testing results, safety checks performed..."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Downtime Hours">
            <Input type="number" step="0.5" value={downtimeHours} onChange={(e) => setDowntimeHours(e.target.value)} />
          </Field>

          <Field label="Maintenance Cost ($)">
            <Input type="number" step="10" value={maintenanceCost} onChange={(e) => setMaintenanceCost(e.target.value)} />
          </Field>
        </div>

        <Field label="Parts Replaced / Used (comma separated)">
          <Input value={partsUsed} onChange={(e) => setPartsUsed(e.target.value)} placeholder="e.g. Filters, Seals, Tubing" />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleComplete} disabled={submitting}>
          {submitting ? 'Completing...' : 'Mark as Completed'}
        </Button>
      </div>
    </Modal>
  )
}

/* ==================================================================== */
/* DETAILS MODAL                                                       */
/* ==================================================================== */
function DetailsModal({
  open,
  workOrder,
  equipmentList,
  technicians,
  onClose,
}: {
  open: boolean
  workOrder: WorkOrder
  equipmentList: Equipment[]
  technicians: Technician[]
  onClose: () => void
}) {
  const eq = equipmentList.find((e) => e.id === workOrder.equipmentId)
  const tech = technicians.find(
    (t) => t.id === workOrder.assignedTechnicianId || t.name === workOrder.assignedTechnicianId,
  )

  return (
    <Modal open={open} title={`Work Order ${workOrder.workOrderCode || workOrder.id}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div>
            <h3 className="font-serif text-lg font-bold text-navy">{workOrder.title}</h3>
            <p className="text-muted">
              Equipment:{' '}
              <Link to={`/equipment/${workOrder.equipmentId}`} className="text-slate-blue font-medium hover:underline">
                {workOrder.equipmentId} ({eq?.equipmentType || 'Medical Asset'})
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge label={workOrder.priorityLabel} tone={workOrder.priorityLabel === 'Urgent' ? 'critical' : 'info'} />
            <StatusBadge label={workOrder.status} tone={workOrder.status === 'Completed' ? 'healthy' : 'neutral'} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted">Assigned Technician</dt>
            <dd className="font-medium text-navy">{tech?.name || workOrder.assignedTechnicianId || 'Unassigned'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Work Order Type</dt>
            <dd className="font-medium text-navy">{workOrder.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Current Condition</dt>
            <dd className="font-medium text-navy">{eq?.operationalStatus || 'Not available'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Failure Risk</dt>
            <dd className="font-medium text-navy">{workOrder.failureRisk != null ? `${workOrder.failureRisk}%` : 'Not available'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Created At</dt>
            <dd className="text-navy">{formatDate(workOrder.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Scheduled Date</dt>
            <dd className="text-navy">{workOrder.scheduledDate ? formatDate(workOrder.scheduledDate) : 'Not scheduled'}</dd>
          </div>
          {workOrder.completedAt && (
            <div>
              <dt className="text-xs text-muted">Completed At</dt>
              <dd className="text-navy">{formatDate(workOrder.completedAt)}</dd>
            </div>
          )}
          {workOrder.downtimeHours != null && (
            <div>
              <dt className="text-xs text-muted">Equipment Downtime</dt>
              <dd className="text-navy">{workOrder.downtimeHours} hours</dd>
            </div>
          )}
          {workOrder.estimatedCost != null && (
            <div>
              <dt className="text-xs text-muted">Total Cost</dt>
              <dd className="font-medium text-healthy">{formatCurrency(workOrder.estimatedCost)}</dd>
            </div>
          )}
          {workOrder.source && (
            <div>
              <dt className="text-xs text-muted">Creation Source</dt>
              <dd className="text-navy font-semibold">{workOrder.source}</dd>
            </div>
          )}
        </div>

        {workOrder.notes && (
          <div className="border-t border-line pt-3">
            <h4 className="font-medium text-navy">Description / Notes</h4>
            <p className="mt-1 text-ink bg-stone-50 p-2.5 rounded border border-line">{workOrder.notes}</p>
          </div>
        )}

        {workOrder.relatedAlertId && (
          <div className="border-t border-line pt-3">
            <h4 className="font-medium text-navy">Related Alert</h4>
            <p className="mt-1 text-sm text-ink">
              <Link to="/alerts" className="text-slate-blue hover:underline">{workOrder.relatedAlertTitle || workOrder.relatedAlertId}</Link>
              {' · '}
              {workOrder.relatedAlertStatus || 'Status not available'}
            </p>
            <div className="mt-2 space-y-2 rounded border border-critical/20 bg-critical-bg/10 p-3">
              <p><strong className="text-navy">Why this alert was generated:</strong> {workOrder.relatedAlertReason || 'Not available'}</p>
              <p><strong className="text-navy">Recommended action:</strong> {workOrder.relatedAlertRecommendedAction || 'Not available'}</p>
            </div>
          </div>
        )}

        {workOrder.completionNotes && (
          <div className="border-t border-line pt-3">
            <h4 className="font-medium text-navy">Completion Report</h4>
            <p className="mt-1 text-ink bg-healthy-bg/30 p-2.5 rounded border border-healthy/20">{workOrder.completionNotes}</p>
          </div>
        )}

        {workOrder.parts && workOrder.parts.length > 0 && (
          <div className="border-t border-line pt-3">
            <h4 className="font-medium text-navy">Parts Used / Replaced</h4>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {workOrder.parts.map((p, idx) => (
                <span key={idx} className="bg-slate-100 text-navy text-xs px-2 py-1 rounded border border-slate-200">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
