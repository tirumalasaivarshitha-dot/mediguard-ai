import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { useTelemetryStream } from '@/hooks/useTelemetryStream'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { HealthScore } from '@/components/ui/HealthScore'
import { RiskMeter } from '@/components/ui/RiskMeter'
import { Button } from '@/components/ui/Button'
import { AssessmentResult } from '@/components/assessment/AssessmentResult'
import { Sparkline } from '@/components/charts/TrendChart'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { daysSince, formatDate, operationalLabel, relativeTime } from '@/utils/format'
import { WhatIfPanel } from '@/pages/Equipment/WhatIfPanel'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'live', label: 'Live Data' },
  { id: 'ai', label: 'AI Assessment' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'history', label: 'History' },
]

export function EquipmentDetailPage() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState('overview')
  const [simulate, setSimulate] = useState(false)
  const eqq = useQuery(() => api.getEquipment(id), [id])
  const assess = useQuery(() => eqq.data?.isHistorical ? Promise.resolve(null) : api.getAssessment(id), [id, eqq.data?.isHistorical])
  const historicalAssess = useQuery(() => eqq.data?.isHistorical ? api.getHistoricalAssessment(id) : Promise.resolve(null), [id, eqq.data?.isHistorical])
  const history = useQuery(() => api.getMaintenanceHistory(id), [id])
  const orders = useQuery(() => api.listWorkOrders(), [id])
  const techniciansQ = useQuery(() => api.listTechnicians())
  const historical = Boolean(eqq.data?.isHistorical)
  const { series, assessment: realtimeAssessment, loading: telLoading } = useTelemetryStream(id, simulate, !historical)

  if (eqq.loading) return <Skeleton className="h-96" />
  if (eqq.error || !eqq.data) return <ErrorState message="Unable to load this equipment record." onRetry={eqq.reload} />

  const eq = eqq.data
  const tech = techniciansQ.data?.find((t) => t.id === eq.assignedTechnicianId || t.userId === eq.assignedTechnicianId)
  const operationalStatus = realtimeAssessment?.operationalStatus ?? eq.operationalStatus
  const safetyStatus = realtimeAssessment?.safetyStatus ?? eq.safetyStatus

  return (
    <div>
      <PageHeader
        title={eq.historicalDetails?.deviceName || eq.name || eq.id}
        question={eq.equipmentType}
        actions={
          <div className="flex flex-wrap gap-2">
            {!historical ? <Link to="/assessment"><Button variant="secondary">Open AI Assessment</Button></Link> : null}
            <Link to="/maintenance">
              <Button variant="outline">Work orders</Button>
            </Link>
          </div>
        }
      />
      {historical ? <p className="mb-4 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-muted">Historical Kaggle safety record. This asset has no live telemetry, operational health signal, or future failure prediction.</p> : null}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusBadge
          label={operationalLabel(operationalStatus)}
          tone={operationalStatus === 'operational' ? 'healthy' : operationalStatus === 'degraded' ? 'critical' : 'warning'}
        />
        <StatusBadge label={`Criticality ${eq.criticality}`} tone={eq.criticality === 'Life-supporting' ? 'critical' : 'info'} />
        <StatusBadge
          label={`Safety ${safetyStatus}`}
          tone={safetyStatus === 'Normal' ? 'healthy' : safetyStatus === 'Safety Event' ? 'critical' : 'warning'}
        />
        {eq.telemetrySource === 'synthetic' ? <StatusBadge label="Simulated telemetry" tone="info" /> : null}
      </div>
      <Tabs tabs={historical ? tabs.filter((item) => item.id !== 'live') : tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <Card>
            <p className="text-sm text-muted">Health</p>
            <div className="mt-2">{historical ? <p className="text-sm text-muted">Not available for historical records</p> : <HealthScore score={realtimeAssessment?.healthScore ?? eq.healthScore} />}</div>
          </Card>
          <Card>
            <p className="text-sm text-muted">Failure risk</p>
            <div className="mt-2">{historical ? <p className="text-sm text-muted">Not available for historical records</p> : <RiskMeter risk={realtimeAssessment?.failureRisk ?? eq.failureRisk} />}</div>
          </Card>
          <Card>
            <p className="text-sm text-muted">Assigned technician</p>
            <p className="mt-2 font-serif text-xl text-navy">{tech?.name ?? 'Unassigned'}</p>
            <p className="text-sm text-muted">{tech?.role}</p>
            <p className="mt-3 text-sm text-muted">Last maintenance {formatDate(eq.lastMaintenance)}</p>
            <p className="text-sm text-muted">Next maintenance {formatDate(eq.nextMaintenance)}</p>
          </Card>
          <Card className="lg:col-span-2">
            <CardTitle>{historical ? 'Device overview' : 'Identity and location'}</CardTitle>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Item k="Manufacturer" v={eq.manufacturer} />
              <Item k="Model" v={eq.model} />
              {historical ? <Item k="Classification" v={eq.historicalDetails?.classification || 'Not provided'} /> : null}
              {historical ? <Item k="Device code" v={eq.historicalDetails?.deviceCode || 'Not provided'} /> : null}
              {historical ? <Item k="Risk class" v={eq.historicalDetails?.riskClass || 'Not provided'} /> : null}
              {historical ? <Item k="Country" v={eq.historicalDetails?.country || 'Not provided'} /> : null}
              {historical ? <Item k="Device number" v={eq.historicalDetails?.modelNumber || 'Not provided'} /> : null}
              <Item k="Department" v={eq.department} />
              <Item k="Location" v={eq.location} />
              <Item k="Installed" v={formatDate(eq.installationDate)} />
              <Item k="Warranty" v={formatDate(eq.warrantyExpiry)} />
              <Item k="Operating hours" v={String(eq.operatingHours)} />
              <Item k="Days since maintenance" v={String(daysSince(eq.lastMaintenance))} />
              {eq.isHistorical ? <Item k="Source dataset" v={eq.sourceDatasetName || 'Kaggle historical safety'} /> : null}
              {eq.isHistorical ? <Item k="Source identifier" v={eq.sourceIdentifier || 'Not provided'} /> : null}
            </dl>
          </Card>
          {historical ? <Card className="lg:col-span-3">
            <CardTitle>Historical event context</CardTitle>
            <CardHint>Historical safety records only. These events are not active alerts.</CardHint>
            {eq.historicalDetails?.lastEvent ? (
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-4">
                <Item k="Event type" v={eq.historicalDetails.lastEvent.eventType} />
                <Item k="Event date" v={eq.historicalDetails.lastEvent.eventDate ? formatDate(eq.historicalDetails.lastEvent.eventDate) : 'Date unavailable'} />
                <Item k="Country" v={eq.historicalDetails.lastEvent.country} />
                <Item k="Action" v={eq.historicalDetails.lastEvent.actionTaken || 'Not provided'} />
                <div className="md:col-span-4"><dt className="text-muted">Reason / description</dt><dd className="mt-1 text-ink">{eq.historicalDetails.lastEvent.description}</dd></div>
              </dl>
            ) : <p className="mt-3 text-sm text-muted">No historical events available for this device.</p>}
          </Card> : null}
          <Card>
            <CardTitle>Recent telemetry summary</CardTitle>
            {historical ? <p className="mt-3 text-sm text-muted">No live telemetry is present in the Kaggle historical safety dataset.</p> : series?.current ? (
              <ul className="mt-3 space-y-1 text-sm">
                <li>Temperature {series.current.temperature} {series.units.temperature}</li>
                <li>Vibration {series.current.vibration} {series.units.vibration}</li>
                <li>Power {series.current.powerKw} {series.units.powerKw}</li>
                <li>Error count {series.current.errorCount}</li>
                <li className="text-muted">Updated {relativeTime(series.lastUpdate)}</li>
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No telemetry loaded yet.</p>
            )}
          </Card>
        </div>
      )}

      {tab === 'live' && (
        <div className="mt-5 space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-navy">Telemetry source</p>
              <p className="text-sm text-muted">
                {eq.telemetrySource === 'synthetic' ? 'Synthetic generator' : eq.telemetrySource} · last update{' '}
                {series?.lastUpdate ? relativeTime(series.lastUpdate) : 'n/a'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {simulate ? <StatusBadge label="Simulated telemetry" tone="info" /> : <StatusBadge label="Playback" tone="neutral" />}
              <Button variant="outline" onClick={() => setSimulate((v) => !v)}>
                {simulate ? 'Stop simulation' : 'Run simulated stream'}
              </Button>
            </div>
          </Card>
          {telLoading || !series ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardTitle>Temperature</CardTitle>
                <Sparkline data={series.points.map((p) => ({ t: p.timestamp, v: p.temperature }))} />
              </Card>
              <Card>
                <CardTitle>Vibration</CardTitle>
                <Sparkline data={series.points.map((p) => ({ t: p.timestamp, v: p.vibration }))} color="#C45C12" />
              </Card>
              <Card>
                <CardTitle>Power consumption</CardTitle>
                <Sparkline data={series.points.map((p) => ({ t: p.timestamp, v: p.powerKw }))} color="#397C9D" />
              </Card>
              <Card>
                <CardTitle>Error count</CardTitle>
                <Sparkline data={series.points.map((p) => ({ t: p.timestamp, v: p.errorCount }))} color="#B42318" />
              </Card>
            </div>
          )}
        </div>
      )}

      {tab === 'ai' && (
        <div className="mt-5">
          {historical ? (
            historicalAssess.loading ? <Skeleton className="h-80" /> : historicalAssess.error || !historicalAssess.data ? (
              <ErrorState message={historicalAssess.error || 'Unable to load historical safety assessment.'} onRetry={historicalAssess.reload} />
            ) : (
              <HistoricalAssessmentCard assessment={historicalAssess.data} />
            )
          ) : assess.loading ? <Skeleton className="h-80" /> : realtimeAssessment ?? assess.data ? <AssessmentResult result={realtimeAssessment ?? assess.data!} /> : <ErrorState message="Unable to load assessment." onRetry={assess.reload} />}
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between">
              <CardTitle>Work orders</CardTitle>
              <Link to={`/maintenance?create=true&equipmentId=${eq.id}`}>
                <Button variant="outline">
                  + Create Work Order
                </Button>
              </Link>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {(orders.data ?? [])
                .filter((w) => w.equipmentId === eq.id)
                .map((w) => (
                  <li key={w.id} className="flex items-center justify-between rounded-md border border-line p-3">
                    <div>
                      <p className="font-medium text-navy">
                        {w.workOrderCode || w.id} · {w.title}
                      </p>
                      <p className="text-xs text-muted">
                        Type: {w.type} · Scheduled: {w.scheduledDate ? formatDate(w.scheduledDate) : 'Unscheduled'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={w.priorityLabel} tone={w.priorityLabel === 'Urgent' ? 'critical' : 'info'} />
                      <StatusBadge label={w.status} tone={w.status === 'Completed' ? 'healthy' : 'neutral'} />
                    </div>
                  </li>
                ))}
              {!(orders.data ?? []).filter((w) => w.equipmentId === eq.id).length ? (
                <p className="mt-3 text-sm text-muted">No active or past work orders recorded for this asset.</p>
              ) : null}
            </ul>
          </Card>
          {historical ? <Card><CardTitle>Historical context only</CardTitle><CardHint>Maintenance simulations and operational automation are unavailable for archival safety records.</CardHint></Card> : <WhatIfPanel equipmentId={eq.id} />}
        </div>
      )}

      {tab === 'history' && (
        <Card className="mt-5">
          <CardTitle>Maintenance history</CardTitle>
          <CardHint>Completed work on this asset.</CardHint>
          <ul className="mt-4 space-y-3">
            {(history.data ?? []).map((h) => (
              <li key={h.id} className="border-b border-line pb-3 text-sm last:border-0">
                <p className="font-medium text-navy">
                  {formatDate(h.date)} · {h.type}
                </p>
                <p className="text-muted">{h.summary}</p>
              </li>
            ))}
            {!(history.data ?? []).length ? <p className="text-sm text-muted">No history recorded yet.</p> : null}
          </ul>
        </Card>
      )}
    </div>
  )
}

function HistoricalAssessmentCard({ assessment }: { assessment: import('@/types').HistoricalSafetyAssessment }) {
  const probability = assessment.prediction.recurrenceProbability
  const riskTone = assessment.prediction.riskLevel === 'HIGH' ? 'critical' : assessment.prediction.riskLevel === 'MEDIUM' ? 'warning' : 'healthy'
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Historical Safety Intelligence</CardTitle>
          <CardHint>HISTORICAL SAFETY DATA · retrospective decision support only</CardHint>
        </div>
        <StatusBadge label={assessment.prediction.riskLevel} tone={riskTone} />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <p className="text-sm text-muted">Historical Safety Recurrence Risk</p>
          <p className="mt-1 font-serif text-3xl text-navy">{probability === null ? 'Unavailable' : `${Math.round(probability * 100)}%`}</p>
          <p className="text-sm text-muted">Predicted likelihood of another qualifying safety event</p>
        </div>
        <div className="text-sm">
          <p className="text-muted">Model</p><p className="text-navy">{assessment.model.algorithm}</p>
          <p className="mt-2 text-muted">Version</p><p className="text-navy">{assessment.model.version}</p>
        </div>
        <div className="text-sm">
          <p className="text-muted">Target</p><p className="text-navy">{assessment.model.target}</p>
          <p className="mt-2 text-muted">Historical cutoff</p><p className="text-navy">{formatDate(assessment.cutoffDate)}</p>
        </div>
      </div>
      <div className="mt-5">
        <p className="font-medium text-navy">Key contributing factors</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {assessment.prediction.explanation.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
      <p className="mt-5 text-sm text-muted">{assessment.operationalAction}</p>
      <p className="mt-3 rounded-md border border-line bg-canvas px-3 py-2 text-xs text-muted">{assessment.disclaimer}</p>
    </Card>
  )
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  )
}
