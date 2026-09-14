import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Tabs'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { recommendTechnician } from '@/services/matching'
import { onRealtime } from '@/services/realtime'
import type { Equipment, SafetyAlert, Technician } from '@/types'
import {
  ShieldAlert,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  Clock,
  Search,
  Sparkles,
  UserPlus,
  ArrowUpRight,
  Wrench,
  XCircle,
} from 'lucide-react'

const statuses = ['All', 'Unacknowledged', 'Acknowledged', 'Assigned', 'Escalated', 'Resolved', 'Dismissed']
const severities = ['All', 'Critical', 'High', 'Warning']

export function SafetyPage({ alertsOnly = false }: { alertsOnly?: boolean }) {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [severityFilter, setSeverityFilter] = useState('All')
  const [message, setMessage] = useState<string | null>(null)
  const alertsQ = useQuery(
    () => api.listAlerts({
      status: statusFilter === 'All' ? undefined : statusFilter,
      severity: severityFilter === 'All' ? undefined : severityFilter,
      limit: 100,
    }),
    [statusFilter, severityFilter],
  )
  const eqQ = useQuery(() => api.listEquipment({ operationalDataset: true }))
  const activeDatasetQ = useQuery(() => api.getEquipmentFilterOptions(true))
  const techniciansQ = useQuery(() => api.listTechnicians())

  useEffect(() => {
    const events = ['safety:created', 'safety:acknowledged', 'safety:assigned', 'safety:escalated', 'safety:resolved', 'safety:dismissed']
    const unsubscribe = events.map((event) => onRealtime(event, () => { void alertsQ.reload() }))
    const unsubscribeDataset = onRealtime('dataset:activated', () => {
      alertsQ.clear()
      eqQ.clear()
      activeDatasetQ.clear()
      void alertsQ.reload()
      void eqQ.reload()
      void activeDatasetQ.reload()
    })
    return () => {
      unsubscribe.forEach((remove) => remove())
      unsubscribeDataset()
    }
  }, [alertsQ.reload, alertsQ.clear, eqQ.reload, eqQ.clear, activeDatasetQ.reload, activeDatasetQ.clear])

  // Modals
  const [assignFor, setAssignFor] = useState<SafetyAlert | null>(null)
  const [escalateFor, setEscalateFor] = useState<SafetyAlert | null>(null)
  const [resolveFor, setResolveFor] = useState<SafetyAlert | null>(null)

  const eqById = useMemo(() => {
    return Object.fromEntries((eqQ.data ?? []).map((e) => [e.id, e]))
  }, [eqQ.data])

  const alerts = alertsQ.data ?? []

  // Metrics calculation
  const metrics = useMemo(() => {
    const active = alerts.filter((a) => !['Resolved', 'Dismissed'].includes(a.status))
    const critical = active.filter((a) => a.severity === 'Critical')
    const high = active.filter((a) => a.severity === 'High')
    const unack = active.filter((a) => a.status === 'Unacknowledged')
    const awaitingAssignment = active.filter((a) => a.status === 'Acknowledged' && !a.assignedTechnicianId)
    const underMaintenance = active.filter((a) => a.workOrderStatus === 'In Progress' || a.workOrderStatus === 'Scheduled')
    const escalated = alerts.filter((a) => a.status === 'Escalated')
    const resolved = alerts.filter((a) => a.status === 'Resolved')
    return {
      total: active.length,
      critical: critical.length,
      high: high.length,
      unack: unack.length,
      awaitingAssignment: awaitingAssignment.length,
      underMaintenance: underMaintenance.length,
      escalated: escalated.length,
      resolved: resolved.length,
    }
  }, [alerts])

  // Filtered alert list
  const filteredAlerts = useMemo(() => {
    let list = [...alerts]
    if (statusFilter !== 'All') {
      list = list.filter((a) => a.status === statusFilter)
    }
    if (severityFilter !== 'All') {
      list = list.filter((a) => a.severity === severityFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.equipmentId.toLowerCase().includes(q) ||
          a.reason.toLowerCase().includes(q) ||
          (a.recommendedAction && a.recommendedAction.toLowerCase().includes(q)),
      )
    }
    return list
  }, [alerts, statusFilter, severityFilter, search])

  if (alertsQ.error) return <ErrorState message="Unable to load safety alerts." onRetry={alertsQ.reload} />
  if (activeDatasetQ.error) return <ErrorState message="Unable to determine the active operational dataset." onRetry={activeDatasetQ.reload} />
  if (alertsQ.loading || eqQ.loading || activeDatasetQ.loading) return <Skeleton className="h-96" />

  if (alertsOnly && !activeDatasetQ.data?.activeDataset) {
    return (
      <div>
        <PageHeader title="Alerts" question="Review active operational equipment issues and their recommended next steps." />
        <EmptyState title="No active operational dataset" body="Activate an operational dataset in Data & AI to view equipment alerts." />
      </div>
    )
  }

  const canManage = user?.role === 'hospital_admin' || user?.role === 'biomedical_engineer'
  const canManageAlerts = canManage && (!alertsOnly || user?.role === 'biomedical_engineer')

  async function handleAcknowledge(id: string) {
    try {
      await api.acknowledgeAlert(id)
      setMessage('Safety alert acknowledged.')
      alertsQ.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to acknowledge safety alert.')
    }
  }

  async function handleDismiss(id: string) {
    await api.dismissAlert(id, 'Dismissed by user after review.')
    setMessage('Safety alert dismissed.')
    alertsQ.reload()
  }

  async function handleCreateWo(a: SafetyAlert) {
    try {
      const workOrder = await api.createWorkOrderFromAlert(a.id)
      setMessage(`Maintenance work order ${workOrder.workOrderCode || workOrder.id} created from this alert.`)
      alertsQ.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create maintenance work order.')
    }
  }

  return (
    <div>
      <PageHeader
        title={alertsOnly ? 'Alerts' : 'Safety Center & Command Dashboard'}
        question={alertsOnly ? 'Review active operational equipment issues, their causes, and recommended next steps.' : 'Monitor equipment safety alerts, assign responsible personnel, and handle safety escalations.'}
      />

      {alertsOnly ? <p className="mb-5 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-muted">Showing alerts from the current operational dataset: <strong className="text-navy">{activeDatasetQ.data?.activeDataset?.name || 'Not available'}</strong>. Historical safety data is excluded.</p> : null}

      {message ? (
        <div className="mb-4 flex items-center justify-between rounded-md border border-healthy/30 bg-healthy-bg p-3 text-sm text-healthy">
          <span>{message}</span>
          <button className="text-xs font-semibold underline" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Metrics Row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-navy/10 p-3 text-navy"><ShieldAlert className="h-6 w-6" /></div>
          <div><p className="text-xs text-muted">Active Alerts</p><p className="font-serif text-2xl font-semibold text-navy">{metrics.total}</p></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-critical-bg p-3 text-critical">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted">{alertsOnly ? 'Critical' : 'Critical Safety Reviews'}</p>
            <p className="font-serif text-2xl font-semibold text-critical">{metrics.critical}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-warning-bg p-3 text-warning"><UserPlus className="h-6 w-6" /></div>
          <div><p className="text-xs text-muted">{alertsOnly ? 'Unassigned' : 'Awaiting Assignment'}</p><p className="font-serif text-2xl font-semibold text-warning">{metrics.awaitingAssignment}</p></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-warning-bg p-3 text-warning">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted">{alertsOnly ? 'High Risk' : 'High-Risk Alerts'}</p>
            <p className="font-serif text-2xl font-semibold text-warning">{metrics.high}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-info-bg p-3 text-info">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted">{alertsOnly ? 'Under Maintenance' : 'Awaiting Acknowledgement'}</p>
            <p className="font-serif text-2xl font-semibold text-info">{alertsOnly ? metrics.underMaintenance : metrics.unack}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-purple-100 p-3 text-purple-700">
            <ArrowUpRight className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted">Open Escalations</p>
            <p className="font-serif text-2xl font-semibold text-purple-700">{metrics.escalated}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="rounded-lg bg-healthy-bg p-3 text-healthy"><CheckCircle2 className="h-6 w-6" /></div>
          <div><p className="text-xs text-muted">Recently Resolved</p><p className="font-serif text-2xl font-semibold text-healthy">{metrics.resolved}</p></div>
        </Card>
      </div>

      {/* Search & Filter Toolbar */}
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <Input
              className="pl-9 text-sm"
              placeholder="Search alert ID, equipment, issue..."
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
              {statuses.map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
              ))}
            </Select>

            <Select
              className="w-36 text-sm"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              aria-label="Filter by severity"
            >
              {severities.map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All Severities' : s}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Safety Alerts List */}
      {!filteredAlerts.length ? (
        <EmptyState
          title={alertsOnly ? 'No active equipment alerts' : 'No safety alerts match your filters.'}
          body={alertsOnly ? 'Equipment in the current operational dataset is not currently generating actionable failure-risk alerts.' : undefined}
        />
      ) : (
        <div className="grid gap-4">
          {filteredAlerts.map((a) => {
            const eq = eqById[a.equipmentId]
            const rec = eq ? recommendTechnician(eq, techniciansQ.data ?? []) : null
            const isResolved = a.status === 'Resolved'

            return (
              <Card key={a.id} className={`flex flex-col gap-4 justify-between ${a.severity === 'Critical' && !isResolved ? 'border-l-4 border-l-critical bg-critical-bg/10' : ''}`}>
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        label={a.severity}
                        tone={a.severity === 'Critical' ? 'critical' : 'warning'}
                      />
                      <span className="font-mono text-xs text-muted">{a.id}</span>
                      <span className="text-xs text-muted">· {new Date(a.createdAt).toLocaleString()}</span>
                    </div>

                    <StatusBadge
                      label={a.status}
                      tone={
                        a.status === 'Resolved'
                          ? 'healthy'
                          : a.status === 'Escalated'
                          ? 'critical'
                          : a.status === 'Unacknowledged' || (a.status as any) === 'Open'
                          ? 'warning'
                          : 'info'
                      }
                    />
                  </div>

                  <h2 className="font-serif text-xl font-semibold text-navy">
                    <Link to={`/equipment/${a.equipmentId}`} className="hover:text-slate-blue hover:underline">
                      {a.equipmentName || eq?.name || a.equipmentCode || a.equipmentId} {a.equipmentType || eq?.equipmentType ? `(${a.equipmentType || eq?.equipmentType})` : ''}
                    </Link>
                  </h2>

                  <p className="text-sm text-muted">
                    Department: <strong className="text-navy">{eq?.department || 'General'}</strong> · Location: <strong className="text-navy">{eq?.location || 'Central Room'}</strong>
                    <span className="ml-3 font-medium text-ink">
                      Failure Risk: <span className={a.riskScore == null ? 'text-muted' : a.riskScore >= 75 ? 'text-critical font-bold' : a.riskScore >= 50 ? 'text-warning font-bold' : 'text-healthy'}>{a.riskScore == null ? 'Not available' : `${a.riskScore}%`}</span>
                      {' · '}
                      Health Score: <span className="font-bold">{a.healthScore ?? eq?.healthScore ?? '—'}{a.healthScore != null || eq ? '/100' : ''}</span>
                    </span>
                  </p>

                  <div className="rounded-md border border-line bg-stone-50/50 p-3 text-sm space-y-1">
                    <p>
                      <span className="font-semibold text-navy">{alertsOnly ? 'Why this alert was generated: ' : 'Reason / Issue: '}</span>
                      <span className="text-ink">{a.title ? `${a.title}: ` : ''}{a.reason}</span>
                    </p>
                    <p>
                      <span className="font-semibold text-navy">Recommended action: </span>
                      <span className="text-ink">{a.recommendedAction}</span>
                    </p>
                  </div>

                  {alertsOnly ? (
                    <div className="grid gap-3 rounded-md border border-line bg-canvas p-3 text-sm sm:grid-cols-2">
                      <div><p className="text-xs uppercase tracking-wide text-muted">Current condition</p><p className="mt-1 font-medium text-navy">{a.equipmentStatus || eq?.operationalStatus || 'Not available'}</p></div>
                      <div><p className="text-xs uppercase tracking-wide text-muted">Equipment</p><p className="mt-1 font-medium text-navy">{a.equipmentCode || a.equipmentId} · {a.equipmentName || 'Name not available'}</p></div>
                      <div><p className="text-xs uppercase tracking-wide text-muted">Assignment</p><p className="mt-1 text-navy">{a.assignedTechnicianName || 'Not assigned'}</p></div>
                      <div><p className="text-xs uppercase tracking-wide text-muted">Maintenance</p><p className="mt-1 text-navy">{a.workOrderStatus || 'Not created'}</p></div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted pt-1">
                    <span className="flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-navy" />
                      Responsible Person:{' '}
                      <strong className="text-navy">
                        {a.assignedTechnicianName || techniciansQ.data?.find((t) => t.id === a.assignedTechnicianId)?.name || a.responsibleRole || 'Unassigned'}
                      </strong>
                    </span>
                    <span>Priority: <strong className={a.severity === 'Critical' ? 'text-critical' : 'text-warning'}>{a.severity}</strong></span>
                    <span>Lifecycle: <strong className="text-navy">{a.status}</strong></span>
                  </div>
                  <div className="rounded-md border border-line bg-canvas px-3 py-2 text-xs">
                    <span className="font-semibold text-navy">Maintenance:</span>{' '}
                    {a.workOrderId
                      ? <Link className="text-slate-blue hover:underline" to="/maintenance">{a.workOrderCode || a.workOrderId} · {a.workOrderStatus || 'Linked'}</Link>
                      : <span className="text-muted">No maintenance work order linked</span>}
                  </div>

                  {/* Recommendation Card */}
                  {rec && !a.assignedTechnicianId && !isResolved && (
                    <div className="flex items-center justify-between rounded-md border border-teal/20 bg-teal/5 p-3 text-xs text-navy">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-teal shrink-0" />
                        <span>
                          <strong>Recommended Assignment:</strong> {rec.name} ({rec.role}) — Workload: {rec.currentWorkload} tasks
                        </span>
                      </div>
                      <Button variant="outline" onClick={() => setAssignFor(a)}>
                        Assign {rec.name.split(' ')[0]}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                  {!isResolved && user?.role !== 'maintenance_technician' && (
                    <>
                      {a.status === 'Unacknowledged' && (
                        <Button variant="outline" onClick={() => handleAcknowledge(a.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-healthy" />
                          Acknowledge
                        </Button>
                      )}

                      {canManageAlerts && (a.status === 'Acknowledged' || a.status === 'Assigned' || a.status === 'Escalated') && (
                        <Button variant="outline" onClick={() => setAssignFor(a)}>
                          <UserPlus className="h-3.5 w-3.5 mr-1" />
                          {a.assignedTechnicianId ? 'Reassign' : 'Assign'}
                        </Button>
                      )}

                      {a.status === 'Assigned' && (
                        <Button variant="outline" onClick={() => setEscalateFor(a)}>
                          <ArrowUpRight className="h-3.5 w-3.5 mr-1 text-critical" />
                          Escalate
                        </Button>
                      )}

                      {canManageAlerts && !a.workOrderId && (a.status === 'Assigned' || a.status === 'Escalated') && <Button variant="secondary" onClick={() => handleCreateWo(a)}>
                        <Wrench className="h-3.5 w-3.5 mr-1" />
                        Create Work Order
                      </Button>}

                      {canManageAlerts && (a.status === 'Assigned' || a.status === 'Escalated') && <Button variant="primary" onClick={() => setResolveFor(a)}>
                        Resolve Alert
                      </Button>}

                      {canManageAlerts && (
                        <Button variant="ghost" onClick={() => handleDismiss(a.id)}>
                          <XCircle className="h-3.5 w-3.5 mr-1 text-muted" />
                          Dismiss
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Assign Modal */}
      {assignFor && (
        <AssignModal
          open={!!assignFor}
          alert={assignFor}
          equipment={eqById[assignFor.equipmentId]}
          technicians={techniciansQ.data ?? []}
          onClose={() => setAssignFor(null)}
          onAssigned={() => {
            setAssignFor(null)
            setMessage('Responsible technician assigned to safety alert.')
            alertsQ.reload()
          }}
        />
      )}

      {/* Escalate Modal */}
      {escalateFor && (
        <EscalateModal
          open={!!escalateFor}
          alert={escalateFor}
          onClose={() => setEscalateFor(null)}
          onEscalated={() => {
            setEscalateFor(null)
            setMessage('Safety alert escalated to biomedical engineering lead.')
            alertsQ.reload()
          }}
        />
      )}

      {/* Resolve Modal */}
      {resolveFor && (
        <ResolveModal
          open={!!resolveFor}
          alert={resolveFor}
          onClose={() => setResolveFor(null)}
          onResolved={() => {
            setResolveFor(null)
            setMessage('Safety alert resolved successfully.')
            alertsQ.reload()
          }}
        />
      )}
    </div>
  )
}

/* ==================================================================== */
/* ASSIGN TECHNICIAN MODAL                                             */
/* ==================================================================== */
function AssignModal({
  open,
  alert,
  equipment,
  technicians,
  onClose,
  onAssigned,
}: {
  open: boolean
  alert: SafetyAlert
  equipment?: Equipment
  technicians: Technician[]
  onClose: () => void
  onAssigned: () => void
}) {
  const rec = equipment ? recommendTechnician(equipment, technicians) : null
  const [techId, setTechId] = useState(rec?.id ?? technicians[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleAssign() {
    setSubmitting(true)
    try {
      await api.assignAlertTechnician(alert.id, techId)
      onAssigned()
    } catch {
      // Handled
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={`Assign Responsible Person for Alert #${alert.id}`} onClose={onClose}>
      <div className="space-y-4">
        {rec && (
          <div className="flex items-center gap-3 rounded-md border border-teal/20 bg-teal/5 p-3 text-xs text-navy">
            <Sparkles className="h-5 w-5 text-teal shrink-0" />
            <div>
              <p className="font-semibold text-teal">Recommended Match: {rec.name}</p>
              <p className="text-muted">Specialty: {rec.expertise.join(', ')} · Workload: {rec.currentWorkload} tasks</p>
            </div>
          </div>
        )}

        <Field label="Select Biomedical Technician / Supervisor">
          <Select value={techId} onChange={(e) => setTechId(e.target.value)}>
            {technicians.map((t: Technician) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.role}) — {t.availability} · Workload: {t.currentWorkload} tasks
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
          {submitting ? 'Assigning...' : 'Confirm Assignment'}
        </Button>
      </div>
    </Modal>
  )
}

/* ==================================================================== */
/* ESCALATE MODAL                                                      */
/* ==================================================================== */
function EscalateModal({
  open,
  alert,
  onClose,
  onEscalated,
}: {
  open: boolean
  alert: SafetyAlert
  onClose: () => void
  onEscalated: () => void
}) {
  const [reason, setReason] = useState('Requires immediate biomedical engineering review and supervisor intervention.')
  const [submitting, setSubmitting] = useState(false)

  async function handleEscalate() {
    setSubmitting(true)
    try {
      await api.escalateAlert(alert.id, reason)
      onEscalated()
    } catch {
      // Handled
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={`Escalate Safety Alert #${alert.id}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-bg/40 p-3 text-xs text-critical">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Escalating this alert will notify the Biomedical Engineering Lead immediately.</span>
        </div>

        <Field label="Reason for Escalation">
          <textarea
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm focus:border-navy focus:outline-none"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="State why this safety issue requires senior escalation..."
          />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleEscalate} disabled={submitting}>
          {submitting ? 'Escalating...' : 'Confirm Escalation'}
        </Button>
      </div>
    </Modal>
  )
}

/* ==================================================================== */
/* RESOLVE MODAL                                                       */
/* ==================================================================== */
function ResolveModal({
  open,
  alert,
  onClose,
  onResolved,
}: {
  open: boolean
  alert: SafetyAlert
  onClose: () => void
  onResolved: () => void
}) {
  const [notes, setNotes] = useState('Safety review completed. Corrective maintenance performed and safety tests passed.')
  const [submitting, setSubmitting] = useState(false)

  async function handleResolve() {
    setSubmitting(true)
    try {
      await api.resolveAlert(alert.id, notes)
      onResolved()
    } catch {
      // Handled
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={`Resolve Safety Alert #${alert.id}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Resolution Notes & Inspection Summary">
          <textarea
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm focus:border-navy focus:outline-none"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe inspection results and corrective measures taken..."
          />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleResolve} disabled={submitting}>
          {submitting ? 'Resolving...' : 'Mark as Resolved'}
        </Button>
      </div>
    </Modal>
  )
}
