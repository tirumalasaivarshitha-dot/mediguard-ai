import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DonutChart } from '@/components/charts/DonutChart'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { formatDate, healthInterpretation, operationalLabel, riskInterpretation } from '@/utils/format'
import type { DashboardSnapshot, Equipment, SafetyAlert, WorkOrder } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { useEffect } from 'react'
import { onRealtime } from '@/services/realtime'

export function DashboardPage() {
  const { user } = useAuth()
  const snap = useQuery(() => api.getDashboard())
  const eq = useQuery(() => api.listEquipment({ operationalDataset: true }))
  const alerts = useQuery(() => api.listAlerts())
  const wo = useQuery(() => api.listWorkOrders())
  const historicalOverview = useQuery(() => api.getHistoricalSafetyOverview())
  const historicalTypes = useQuery(() => api.getHistoricalSafetyEventTypes())
  const models = useQuery(() => api.listModels())
  const datasets = useQuery(() => api.listDatasets())

  useEffect(() => {
    const refreshTimer = { current: null as ReturnType<typeof setTimeout> | null }
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null
        void snap.reload()
        void eq.reload()
        void alerts.reload()
        void wo.reload()
        void historicalOverview.reload()
        void historicalTypes.reload()
        void models.reload()
        void datasets.reload()
      }, 250)
    }
    const events = [
      'prediction:update',
      'risk:changed',
      'safety:created',
      'safety:acknowledged',
      'safety:assigned',
      'safety:escalated',
      'safety:resolved',
      'safety:dismissed',
      'notification:created',
      'maintenance:created',
      'maintenance:assigned',
      'maintenance:scheduled',
      'maintenance:started',
      'maintenance:updated',
      'maintenance:completed',
      'maintenance:cancelled',
      'equipment:status_changed',
      'dataset:activated',
    ]
    const unsubscribe = events.map((event) => onRealtime(event, scheduleRefresh))
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      unsubscribe.forEach((remove) => remove())
    }
  }, [snap.reload, eq.reload, alerts.reload, wo.reload, historicalOverview.reload, historicalTypes.reload, models.reload, datasets.reload])

  if (snap.error) return <ErrorState message="Unable to load the command center." onRetry={snap.reload} />
  if (snap.loading || !snap.data) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }

  const s = snap.data
  const list = eq.data ?? []
  const recentAlerts = alerts.data ?? []
  const dueWo = (wo.data ?? []).filter((w) => w.status !== 'Completed' && w.status !== 'Cancelled')
  const degradedSources = [
    eq.error ? 'equipment intelligence' : null,
    alerts.error ? 'safety alerts' : null,
    wo.error ? 'maintenance workload' : null,
    datasets.error ? 'operational dataset' : null,
  ].filter(Boolean) as string[]

  if (s.dataMode === 'HISTORICAL SAFETY DATA') {
    return <HistoricalSafetyDashboard snapshot={s} overview={historicalOverview.data} overviewError={historicalOverview.error} eventTypes={historicalTypes.data} eventTypesError={historicalTypes.error} models={models.data ?? []} modelsError={models.error} />
  }
  if (user?.role === 'hospital_admin') {
    return <><DegradedDataBanner sources={degradedSources} /><AdminDashboard snapshot={s} equipment={list} alerts={recentAlerts} workOrders={dueWo} userName={user.name} datasets={datasets.data ?? []} datasetError={datasets.error} /></>
  }

  function HistoricalSafetyDashboard({ snapshot, overview, overviewError, eventTypes, eventTypesError, models, modelsError }: { snapshot: DashboardSnapshot; overview: any; overviewError: string | null; eventTypes: any; eventTypesError: string | null; models: any[]; modelsError: string | null }) {
      const historicalModel = models.find((model) => model.trainingDataType === 'HISTORICAL_SAFETY' && model.algorithm === 'Logistic Regression')
      const types = eventTypes?.eventTypes ?? []
      return (
      <div>
        <PageHeader title="Historical safety archive" question="What does the Kaggle historical archive contain?" />
        <p className="mb-5 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-muted">
          {snapshot.disclaimer || 'Historical safety records are analytical context only; no live telemetry or future failure prediction is available.'}
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardTitle>Historical devices</CardTitle>
            <CardHint>{snapshot.activeDatasetName || 'Active Kaggle dataset'}</CardHint>
            <p className="mt-3 font-serif text-3xl text-navy">{snapshot.total.toLocaleString()}</p>
          </Card>
          <Card>
            <CardTitle>Safety events</CardTitle>
            <CardHint>Historical records</CardHint>
            <p className="mt-3 font-serif text-3xl text-navy">{overviewError ? '—' : (overview?.totalRecords ?? 0).toLocaleString()}</p>
          </Card>
          <Card>
            <CardTitle>Manufacturers</CardTitle>
            <CardHint>Represented in events</CardHint>
            <p className="mt-3 font-serif text-3xl text-navy">{overviewError ? '—' : (overview?.manufacturerCount ?? 0).toLocaleString()}</p>
          </Card>
          <Card>
            <CardTitle>Countries</CardTitle>
            <CardHint>Historical event coverage</CardHint>
            <p className="mt-3 font-serif text-3xl text-navy">{overviewError ? '—' : (overview?.countryCount ?? 0).toLocaleString()}</p>
          </Card>
          <Card>
            <CardTitle>Historical Safety AI</CardTitle>
            <CardHint>{historicalModel ? historicalModel.algorithm : 'Model unavailable'}</CardHint>
            <p className="mt-3 text-sm text-muted">{modelsError ? 'Status unavailable.' : historicalModel ? 'Available · non-operational' : 'No completed model available.'}</p>
          </Card>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>Event types</CardTitle>
            <CardHint>Qualifying historical safety records</CardHint>
            <ul className="mt-4 space-y-2 text-sm">
              {types.map((item: any) => <li key={item.type} className="flex justify-between"><span>{item.type}</span><span className="font-medium text-navy">{item.count.toLocaleString()}</span></li>)}
              {!types.length ? <li className="text-muted">{eventTypesError ? 'Historical event categories are temporarily unavailable.' : 'No historical event categories available.'}</li> : null}
            </ul>
          </Card>
          <Card>
            <CardTitle>Historical model context</CardTitle>
            <CardHint>Decision support from retrospective safety data</CardHint>
            <p className="mt-4 text-sm text-muted">Historical Safety AI estimates the likelihood of another qualifying safety event within 365 days after an event cutoff. It is not live telemetry, a physical-failure prediction, or an operational alert source.</p>
            {historicalModel ? <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted">Target</p><p className="text-navy">{historicalModel.targetColumn}</p></div><div><p className="text-muted">Status</p><p className="text-navy">Completed / Non-operational</p></div></div> : null}
          </Card>
        </div>
        <Card className="mt-4">
          <CardTitle>Historical event trend</CardTitle>
          <CardHint>Records by source event year</CardHint>
          {overviewError ? <p className="mt-4 text-sm text-muted">Historical trend data is temporarily unavailable.</p> : (
            <div className="mt-4 flex h-36 items-end gap-2 overflow-x-auto">
              {((overview?.byYear ?? []) as Array<{ year: number; count: number }>).map((item) => {
                const max = Math.max(...((overview?.byYear ?? []) as Array<{ year: number; count: number }>).map((entry) => entry.count), 1)
                return <div key={item.year} className="flex min-w-8 flex-col items-center gap-1 text-[10px] text-muted"><div className="w-6 rounded-t bg-slate-blue" style={{ height: `${Math.max(4, (item.count / max) * 110)}px` }} title={`${item.year}: ${item.count.toLocaleString()}`} /><span>{item.year}</span></div>
              })}
              {!overview?.byYear?.length ? <p className="text-sm text-muted">No historical trend data available.</p> : null}
            </div>
          )}
        </Card>
        <Link to="/equipment" className="mt-5 inline-block text-sm text-slate-blue hover:underline">Browse provenance-linked historical equipment</Link>
        <Link to="/data-ai" className="ml-5 inline-block text-sm text-slate-blue hover:underline">Open Data & AI</Link>
      </div>
    )
  }
  if (user?.role === 'biomedical_engineer') {
    return <><DegradedDataBanner sources={degradedSources} /><BiomedicalDashboard snapshot={s} equipment={list} alerts={recentAlerts} workOrders={dueWo} /></>
  }
  if (user?.role === 'maintenance_technician') {
    return <><DegradedDataBanner sources={degradedSources} /><TechnicianDashboard snapshot={s} equipment={list} alerts={recentAlerts} workOrders={dueWo} userName={user.name} /></>
  }
  return <ErrorState message="Your account has no supported dashboard role." />
}

function AdminDashboard({ snapshot, equipment, alerts, workOrders, userName, datasets, datasetError }: RoleDashboardProps & { userName: string; datasets: import('@/types').Dataset[]; datasetError: string | null }) {
  const healthDonut = [
    { name: 'Healthy', value: snapshot.healthy },
    { name: 'Attention', value: snapshot.attention },
    { name: 'High risk', value: snapshot.highRisk },
    { name: 'Critical', value: snapshot.critical },
  ]
  const highRisk = [...equipment].sort((a, b) => b.failureRisk - a.failureRisk).slice(0, 5)
  const due = equipment.filter((item) => item.maintenanceState === 'due' || item.maintenanceState === 'overdue')
  const criticalUnacknowledged = alerts.filter((item) => item.severity === 'Critical' && item.status === 'Unacknowledged').length
  const openMaintenance = workOrders.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).length
  const overdueMaintenance = workOrders.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < Date.now() && !['Completed', 'Cancelled'].includes(item.status)).length
  return (
    <div>
      <PageHeader title="Hospital command center" question={`What requires ${userName.split(' ')[0]}'s hospital-wide attention?`} />
      {snapshot.activeDatasetName ? <p className="mb-4 text-xs uppercase tracking-wide text-muted">Operational dataset: {snapshot.activeDatasetName} · DATASET-DERIVED PREDICTION</p> : null}
      <CurrentDatasetCard dataset={datasets.find((item) => item.isOperational && item.datasetType !== 'HISTORICAL_SAFETY')} error={datasetError} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Total equipment" value={snapshot.total} to="/equipment" />
        <Stat label="Healthy" value={snapshot.healthy} tone="healthy" to="/equipment" />
        <Stat label="Attention required" value={snapshot.attention} tone="warning" to="/equipment" />
        <Stat label="High risk" value={snapshot.highRisk} tone="high" to="/equipment" />
        <Stat label="Critical" value={snapshot.critical} tone="critical" to="/equipment" />
        <Stat label="Under maintenance" value={snapshot.underMaintenance} to="/maintenance" />
        <Stat label="Active safety alerts" value={snapshot.activeSafetyAlerts} tone="critical" to="/safety" />
        <Stat label="Maintenance due" value={snapshot.maintenanceDue} tone="warning" to="/maintenance" />
        <Stat label="Critical unacknowledged" value={criticalUnacknowledged} tone="critical" to="/safety" />
        <Stat label="Open maintenance" value={openMaintenance} tone="warning" to="/maintenance" />
        <Stat label="Overdue maintenance" value={overdueMaintenance} tone="critical" to="/maintenance" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>Hospital-wide health and risk</CardTitle>
          <CardHint>Current operational distribution across authorized hospital equipment.</CardHint>
          <DonutChart data={healthDonut} colors={['#2F7D4A', '#C4841D', '#C45C12', '#B42318']} />
          <ul className="mt-2 space-y-1 text-sm text-muted">{healthDonut.map((item) => <li key={item.name} className="flex justify-between"><span>{item.name}</span><span className="text-ink">{item.value}</span></li>)}</ul>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>Management attention queue</CardTitle>
          <CardHint>Highest-risk equipment requiring hospital-level coordination.</CardHint>
          <div className="mt-4 divide-y divide-line">{highRisk.map((item) => <EquipmentRow key={item.id} e={item} />)}</div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card><CardTitle>Recent safety activity</CardTitle><ul className="mt-4 space-y-3">{alerts.slice(0, 4).map((alert) => <AlertRow key={alert.id} a={alert} />)}</ul><Link to="/safety" className="mt-4 inline-block text-sm text-slate-blue hover:underline">Open Safety Center</Link></Card>
        <Card><CardTitle>Maintenance due</CardTitle><ul className="mt-4 space-y-3">{due.slice(0, 5).map((item) => <li key={item.id} className="flex items-center justify-between text-sm"><Link to={`/equipment/${item.id}`} className="font-medium text-navy hover:underline">{item.id}</Link><StatusBadge label={item.maintenanceState.replace('_', ' ')} tone={item.maintenanceState === 'overdue' ? 'critical' : 'warning'} /></li>)}</ul></Card>
        <Card><CardTitle>Recent maintenance activity</CardTitle><ul className="mt-4 space-y-3">{workOrders.slice(0, 4).map((workOrder) => <WorkRow key={workOrder.id} w={workOrder} />)}</ul><Link to="/reports" className="mt-4 inline-block text-sm text-slate-blue hover:underline">Open reports</Link></Card>
      </div>
      <OperationalContext snapshot={snapshot} alerts={alerts} workOrders={workOrders} />
    </div>
  )
}

type RoleDashboardProps = {
  snapshot: DashboardSnapshot
  equipment: Equipment[]
  alerts: SafetyAlert[]
  workOrders: WorkOrder[]
}

function BiomedicalDashboard({ snapshot, equipment, alerts, workOrders }: RoleDashboardProps) {
  const highRisk = [...equipment].sort((a, b) => b.failureRisk - a.failureRisk).slice(0, 4)
  const reviewAlerts = alerts.filter((item) => item.status === 'Unacknowledged' || item.status === 'Acknowledged')
  const reassessmentRequired = workOrders.filter((item) => item.status === 'Completed' && item.relatedAlertId).length
  return (
    <div>
      <PageHeader title="Clinical engineering intelligence" question="Which equipment needs technical review?" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Equipment monitored" value={snapshot.total} to="/equipment" />
        <Stat label="High-risk assets" value={snapshot.highRisk} tone="high" to="/equipment" />
        <Stat label="Critical assets" value={snapshot.critical} tone="critical" to="/equipment" />
        <Stat label="Active safety events" value={snapshot.activeSafetyAlerts} tone="critical" to="/safety" />
        <Stat label="Alerts awaiting review" value={reviewAlerts.length} tone="warning" to="/safety" />
        <Stat label="Reassessment required" value={reassessmentRequired} tone="high" to="/maintenance" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Alerts awaiting review</CardTitle>
          <CardHint>Open and acknowledged operational alerts.</CardHint>
          <ul className="mt-4 space-y-3">{reviewAlerts.slice(0, 4).map((alert) => <AlertRow key={alert.id} a={alert} />)}</ul>
          {!reviewAlerts.length ? <p className="mt-4 text-sm text-muted">No operational alerts currently require review.</p> : null}
          <Link to="/safety" className="mt-4 inline-block text-sm text-slate-blue hover:underline">Open Safety Center</Link>
        </Card>
        <Card>
          <CardTitle>Technical review queue</CardTitle>
          <CardHint>Highest current failure-risk assessments from authorized equipment.</CardHint>
          <div className="mt-4 divide-y divide-line">{highRisk.map((item) => <EquipmentRow key={item.id} e={item} />)}</div>
        </Card>
        <Card>
          <CardTitle>Engineering activity</CardTitle>
          <CardHint>Recent safety and maintenance work requiring technical attention.</CardHint>
          <ul className="mt-4 space-y-3">{alerts.slice(0, 3).map((alert) => <AlertRow key={alert.id} a={alert} />)}{workOrders.slice(0, 3).map((workOrder) => <WorkRow key={workOrder.id} w={workOrder} />)}</ul>
        </Card>
      </div>
      <OperationalContext snapshot={snapshot} alerts={alerts} workOrders={workOrders} />
    </div>
  )
}

function TechnicianDashboard({ snapshot, equipment, alerts, workOrders, userName }: RoleDashboardProps & { userName: string }) {
  const urgent = equipment.filter((item) => item.failureRisk >= 50 || item.maintenanceState === 'overdue')
  const criticalJobs = workOrders.filter((item) => item.priorityLabel === 'Urgent' && !['Completed', 'Cancelled'].includes(item.status)).length
  const highJobs = workOrders.filter((item) => item.priorityLabel === 'Elevated' && !['Completed', 'Cancelled'].includes(item.status)).length
  const overdueJobs = workOrders.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < Date.now() && !['Completed', 'Cancelled'].includes(item.status)).length
  const reassessmentRequired = workOrders.filter((item) => item.status === 'Completed' && item.relatedAlertId).length
  return (
    <div>
      <PageHeader title={`${userName.split(' ')[0]}'s maintenance operations`} question="What needs action on my assigned equipment?" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="My equipment" value={snapshot.total} to="/equipment/assigned" />
        <Stat label="Open tasks" value={workOrders.length} tone="warning" to="/maintenance/my-tasks" />
        <Stat label="Urgent attention" value={urgent.length} tone="critical" to="/equipment/assigned" />
        <Stat label="Safety notifications" value={alerts.length} tone="high" to="/safety" />
        <Stat label="Critical jobs" value={criticalJobs} tone="critical" to="/maintenance/my-tasks" />
        <Stat label="High-priority jobs" value={highJobs} tone="high" to="/maintenance/my-tasks" />
        <Stat label="Overdue" value={overdueJobs} tone="critical" to="/maintenance/my-tasks" />
        <Stat label="Reassessment required" value={reassessmentRequired} tone="warning" to="/maintenance/my-tasks" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Immediate attention</CardTitle>
          <CardHint>Assigned equipment with elevated risk or overdue maintenance.</CardHint>
          <div className="mt-4 divide-y divide-line">{urgent.slice(0, 6).map((item) => <EquipmentRow key={item.id} e={item} />)}</div>
        </Card>
        <Card>
          <CardTitle>My open work orders</CardTitle>
          <CardHint>Update progress and complete work from My Tasks.</CardHint>
          <ul className="mt-4 space-y-3">{workOrders.slice(0, 6).map((workOrder) => <WorkRow key={workOrder.id} w={workOrder} />)}</ul>
          <Link to="/maintenance/my-tasks" className="mt-4 inline-block text-sm text-slate-blue hover:underline">Open My Tasks</Link>
        </Card>
      </div>
      <OperationalContext snapshot={snapshot} alerts={alerts} workOrders={workOrders} />
    </div>
  )
}

function OperationalContext({ snapshot, alerts, workOrders }: Pick<RoleDashboardProps, 'snapshot' | 'alerts' | 'workOrders'>) {
  const statusCounts = {
    OPEN: alerts.filter((item) => item.status === 'Unacknowledged').length,
    ACKNOWLEDGED: alerts.filter((item) => item.status === 'Acknowledged').length,
    ASSIGNED: alerts.filter((item) => item.status === 'Assigned').length,
    ESCALATED: alerts.filter((item) => item.status === 'Escalated').length,
  }
  const workCounts = {
    open: workOrders.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).length,
    inProgress: workOrders.filter((item) => item.status === 'In Progress').length,
    completed: workOrders.filter((item) => item.status === 'Completed').length,
  }
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>Operational intelligence</CardTitle>
        <CardHint>Live operational model and current hospital workflow signals.</CardHint>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-muted">Operational AI</p><StatusBadge label="Available" tone="healthy" /></div>
          <div><p className="text-muted">Active alerts</p><p className="font-medium text-navy">{snapshot.activeSafetyAlerts}</p></div>
          <div><p className="text-muted">Open alerts</p><p className="text-navy">{statusCounts.OPEN}</p></div>
          <div><p className="text-muted">Escalated</p><p className="text-navy">{statusCounts.ESCALATED}</p></div>
        </div>
      </Card>
      <Card>
        <CardTitle>Maintenance workload</CardTitle>
        <CardHint>Current work-order data only.</CardHint>
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div><p className="text-muted">Due</p><p className="font-medium text-warning">{snapshot.maintenanceDue}</p></div>
          <div><p className="text-muted">Open</p><p className="font-medium text-navy">{workCounts.open}</p></div>
          <div><p className="text-muted">In progress</p><p className="font-medium text-navy">{workCounts.inProgress}</p></div>
        </div>
        <Link to="/maintenance" className="mt-4 inline-block text-sm text-slate-blue hover:underline">View Maintenance</Link>
      </Card>
    </div>
  )
}

function Stat({ label, value, tone, to }: { label: string; value: number; tone?: 'healthy' | 'warning' | 'high' | 'critical'; to?: string }) {
  const content = (
    <Card className="p-4 transition-all hover:border-slate-blue/40">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 font-serif text-3xl ${tone === 'critical' ? 'text-critical' : tone === 'high' ? 'text-high' : tone === 'warning' ? 'text-warning' : tone === 'healthy' ? 'text-healthy' : 'text-navy'}`}>
        {value}
      </p>
    </Card>
  )
  return to ? <Link to={to}>{content}</Link> : content
}

function EquipmentRow({ e }: { e: Equipment }) {
  const h = healthInterpretation(e.healthScore)
  const r = riskInterpretation(e.failureRisk)
  return (
    <Link to={`/equipment/${e.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-canvas/80">
      <div>
        <p className="font-medium text-navy">{e.id}</p>
        <p className="text-sm text-muted">
          {e.equipmentType} · {e.department}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={operationalLabel(e.operationalStatus)} tone={e.operationalStatus === 'operational' ? 'healthy' : 'warning'} />
        <StatusBadge label={`Health ${e.healthScore}`} tone={h.tone} />
        <StatusBadge label={`${e.failureRisk}% ${r.label}`} tone={r.tone} />
      </div>
    </Link>
  )
}

function AlertRow({ a }: { a: SafetyAlert }) {
  return (
    <li className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <Link to={`/equipment/${a.equipmentId}`} className="font-medium text-navy hover:underline">
          {a.equipmentId}
        </Link>
        <StatusBadge label={a.severity} tone={a.severity === 'Critical' ? 'critical' : 'high'} />
      </div>
      <p className="mt-1 text-muted">{a.reason}</p>
    </li>
  )
}

function WorkRow({ w }: { w: WorkOrder }) {
  return (
    <li className="flex justify-between gap-2">
      <span>
        <span className="font-medium text-navy">{w.id}</span>
        <span className="text-muted"> · {w.title}</span>
      </span>
      <span className="text-muted">{formatDate(w.createdAt)}</span>
    </li>
  )
}

function DegradedDataBanner({ sources }: { sources: string[] }) {
  if (!sources.length) return null
  return (
    <div className="mb-4 rounded-md border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning">
      Temporarily unavailable: {sources.join(', ')}. These areas are not represented as zero.
    </div>
  )
}

function CurrentDatasetCard({ dataset, error }: { dataset?: import('@/types').Dataset; error: string | null }) {
  if (error) {
    return <Card className="mb-4 border-warning"><CardTitle>Current dataset unavailable</CardTitle><p className="mt-2 text-sm text-muted">The operational dataset could not be loaded. Retry after the backend recovers.</p></Card>
  }
  if (!dataset) {
    return (
      <Card className="mb-4 border-dashed">
        <CardTitle>Current dataset</CardTitle>
        <p className="mt-2 text-sm text-muted">No equipment dataset has been uploaded yet.</p>
        <Link to="/data-ai/datasets" className="mt-3 inline-block text-sm font-medium text-slate-blue hover:underline">Upload Dataset</Link>
      </Card>
    )
  }
  const capabilities = dataset.profile.capabilities
  const capability = capabilities
    ? capabilities.failurePrediction
      ? 'Failure prediction'
      : capabilities.anomalyDetection
        ? 'Anomaly detection'
        : capabilities.conditionAssessment
          ? 'Condition assessment'
          : capabilities.maintenanceAnalysis
            ? 'Maintenance analysis'
            : 'Dataset profiling'
    : (dataset.profile.potentialTarget ? 'Failure labels detected' : 'Dataset profiling available')
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Current dataset</CardTitle>
          <p className="mt-1 font-medium text-navy">{dataset.name}</p>
          <p className="mt-1 text-sm text-muted">{dataset.profile.rows.toLocaleString()} records · {dataset.profile.columns} features</p>
        </div>
        <StatusBadge label={dataset.status} tone={dataset.status === 'Ready' || dataset.status === 'Configured' ? 'healthy' : 'info'} />
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><p className="text-muted">AI capability</p><p className="font-medium text-navy">{capability}</p></div>
        <div><p className="text-muted">Failure labels</p><p className="font-medium text-navy">{dataset.profile.potentialTarget ? 'Detected' : 'Not detected'}</p></div>
        <div><p className="text-muted">Data quality</p><p className="font-medium text-navy">{dataset.profile.errors?.length ? 'Needs review' : 'Profiled'}</p></div>
      </div>
      <Link to="/data-ai/datasets" className="mt-4 inline-block text-sm font-medium text-slate-blue hover:underline">Review dataset analysis</Link>
    </Card>
  )
}
