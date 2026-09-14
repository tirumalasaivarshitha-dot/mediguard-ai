import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { useTelemetryStream } from '@/hooks/useTelemetryStream'
import { useConnection } from '@/hooks/useConnection'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardTitle } from '@/components/ui/Card'
import { Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Sparkline } from '@/components/charts/TrendChart'
import { ErrorState, OfflineBanner, Skeleton } from '@/components/ui/States'
import { relativeTime } from '@/utils/format'

export function MonitoringPage() {
  const list = useQuery(() => api.listEquipment())
  const [selected, setSelected] = useState('')
  const [simulate, setSimulate] = useState(true)
  const connection = useConnection()
  const activeEquipmentId = selected || list.data?.[0]?.id
  const { series, liveTelemetry, loading, error } = useTelemetryStream(activeEquipmentId, simulate)

  useEffect(() => {
    if (!selected && list.data?.length) setSelected(list.data[0].id)
  }, [selected, list.data])

  return (
    <div>
      <PageHeader title="Live monitoring" question="What is happening to the equipment right now?" />
      {connection === 'offline' ? <OfflineBanner /> : null}
      <Card className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={activeEquipmentId || ''} onChange={(e) => setSelected(e.target.value)} aria-label="Select equipment" className="max-w-xs">
          {(list.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.id} · {e.equipmentType}
            </option>
          ))}
        </Select>
        <StatusBadge
          label={liveTelemetry && connection === 'connected' ? (series?.simulated ? 'SIMULATED TELEMETRY' : 'LIVE TELEMETRY') : connection === 'reconnecting' ? 'Reconnecting' : connection === 'connected' ? 'Connected' : 'Offline'}
          tone={connection === 'connected' ? 'healthy' : connection === 'reconnecting' ? 'warning' : 'neutral'}
        />
        <Button variant="outline" onClick={() => setSimulate((v) => !v)}>
          {simulate ? 'Pause simulation' : 'Start simulated stream'}
        </Button>
        <Link to={activeEquipmentId ? `/equipment/${activeEquipmentId}` : '/equipment'} className="text-sm text-slate-blue hover:underline">
          Open equipment record
        </Link>
      </Card>
      {error ? <ErrorState message={error} /> : null}
      {loading || !series ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            Source: {series.simulated || series.source === 'SIMULATED_TELEMETRY' ? 'SIMULATED TELEMETRY' : liveTelemetry ? 'LIVE TELEMETRY' : 'Persisted telemetry'} · Last update{' '}
            {relativeTime(series.lastUpdate)}
            {!liveTelemetry || connection !== 'connected' ? ' · Waiting for backend Socket.IO telemetry.' : null}
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Metric title="Temperature" unit={series.units.temperature} value={series.current.temperature} data={series.points.map((p) => ({ t: p.timestamp, v: p.temperature }))} />
            <Metric title="Vibration" unit={series.units.vibration} value={series.current.vibration} data={series.points.map((p) => ({ t: p.timestamp, v: p.vibration }))} />
            <Metric title="Power" unit={series.units.powerKw} value={series.current.powerKw} data={series.points.map((p) => ({ t: p.timestamp, v: p.powerKw }))} />
            <Metric title="Pressure" unit={series.units.pressure} value={series.current.pressure} data={series.points.map((p) => ({ t: p.timestamp, v: p.pressure }))} />
            <Metric title="Voltage" unit={series.units.voltage} value={series.current.voltage} data={series.points.map((p) => ({ t: p.timestamp, v: p.voltage }))} />
            <Metric title="Error count" unit="" value={series.current.errorCount} data={series.points.map((p) => ({ t: p.timestamp, v: p.errorCount }))} />
          </div>
        </>
      )}
    </div>
  )
}

function Metric({
  title,
  unit,
  value,
  data,
}: {
  title: string
  unit: string
  value: number
  data: { t: string; v: number }[]
}) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="mt-1 font-serif text-2xl text-navy">
        {value} <span className="text-sm text-muted">{unit}</span>
      </p>
      <Sparkline data={data} />
    </Card>
  )
}
