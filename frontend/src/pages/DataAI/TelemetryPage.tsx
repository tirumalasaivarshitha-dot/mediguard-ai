import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'

export function TelemetrySourcesPage() {
  const eq = useQuery(() => api.listEquipment())
  return (
    <div>
      <PageHeader title="Telemetry sources" question="Where equipment measurements come from." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Supported sources</CardTitle>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
            <li>Uploaded CSV</li>
            <li>Uploaded Excel</li>
            <li>API / device source</li>
            <li>Real-time socket (when connected)</li>
            <li>Synthetic generator for testing and demonstration</li>
          </ul>
          <CardHint className="mt-3">Synthetic streams are always labelled Simulated telemetry and are never presented as hospital device data.</CardHint>
        </Card>
        <Card>
          <CardTitle>Current fleet sources</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">
            {(eq.data ?? []).slice(0, 8).map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>{e.id}</span>
                <StatusBadge label={e.telemetrySource === 'synthetic' ? 'Simulated telemetry' : e.telemetrySource} tone="info" />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
