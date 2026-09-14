import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { healthInterpretation, operationalLabel, riskInterpretation } from '@/utils/format'
import type { Equipment } from '@/types'
import { Button } from '@/components/ui/Button'
import { onRealtime } from '@/services/realtime'

export function EquipmentPage() {
  const { user } = useAuth()
  const location = useLocation()
  const assignedOnly = location.pathname.endsWith('/assigned')
  const [q, setQ] = useState('')
  const [department, setDepartment] = useState('')
  const [type, setType] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [riskClass, setRiskClass] = useState('')
  const [country, setCountry] = useState('')
  const [status, setStatus] = useState('')
  const [view, setView] = useState<'list' | 'hospital'>('list')
  const query = useQuery(() => api.listEquipment({ q, department, type, manufacturer, riskClass, country, status, operationalDataset: true }), [q, department, type, manufacturer, riskClass, country, status])
  const filterOptions = useQuery(() => api.getEquipmentFilterOptions(true))
  const techs = useQuery(() => api.listTechnicians())

  useEffect(() => {
    const refresh = () => {
      void query.reload()
      void filterOptions.reload()
    }
    const unsubscribe = onRealtime('dataset:activated', refresh)
    return () => { unsubscribe() }
  }, [query.reload, filterOptions.reload])

  const rows = useMemo(() => {
    let list = query.data ?? []
    if (assignedOnly && user?.name) {
      const tech = (techs.data ?? []).find((t) => t.name === user.name)
      if (tech) list = list.filter((e) => e.assignedTechnicianId === tech.id)
    }
    return list
  }, [query.data, assignedOnly, user, techs.data])

  if (query.error || filterOptions.error) return <ErrorState message="Unable to load equipment data." onRetry={() => { void query.reload(); void filterOptions.reload() }} />

  const types = filterOptions.data?.types ?? []
  const depts = filterOptions.data?.departments ?? []
  const manufacturers = filterOptions.data?.manufacturers ?? []
  const riskClasses = filterOptions.data?.historicalRiskClasses ?? []
  const countries = filterOptions.data?.historicalCountries ?? []

  return (
    <div>
      <PageHeader
        title={assignedOnly ? 'Assigned equipment' : 'Equipment'}
        question="What equipment do we have?"
        actions={
          <div className="flex gap-2">
            <Button variant={view === 'list' ? 'primary' : 'outline'} onClick={() => setView('list')}>
              List
            </Button>
            <Button variant={view === 'hospital' ? 'primary' : 'outline'} onClick={() => setView('hospital')}>
              Hospital view
            </Button>
          </div>
        }
      />
      {filterOptions.data?.activeDataset?.datasetType === 'HISTORICAL_SAFETY' ? <p className="mb-4 rounded-md border border-info/30 bg-info-bg px-3 py-2 text-sm text-navy"><strong>HISTORICAL SAFETY DATA</strong> · Showing the active Kaggle archive. These records are retrospective context, not live telemetry or future failure predictions.</p> : null}
      <Card className="mb-5 grid gap-3 border-line-strong/70 p-4 md:grid-cols-4 lg:grid-cols-7">
        <Input placeholder="Search device, code, manufacturer…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search equipment" />
        <Select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {depts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Equipment type">
          <option value="">All types</option>
          {types.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
        <Select value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} aria-label="Manufacturer">
          <option value="">All manufacturers</option>
          {manufacturers.map((item) => <option key={item}>{item}</option>)}
        </Select>
        {riskClasses.length ? <Select value={riskClass} onChange={(e) => setRiskClass(e.target.value)} aria-label="Risk class">
          <option value="">All risk classes</option>
          {riskClasses.map((item) => <option key={item}>{item}</option>)}
        </Select> : null}
        {countries.length ? <Select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          <option value="">All countries</option>
          {countries.map((item) => <option key={item}>{item}</option>)}
        </Select> : null}
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="operational">Operational</option>
          <option value="attention">Attention</option>
          <option value="degraded">Degraded</option>
          <option value="maintenance">Under maintenance</option>
          <option value="offline">Offline</option>
        </Select>
        <Button variant="outline" onClick={() => { setQ(''); setDepartment(''); setType(''); setManufacturer(''); setRiskClass(''); setCountry(''); setStatus('') }}>
          Clear filters
        </Button>
      </Card>

      {query.loading ? (
        <Skeleton className="h-80" />
      ) : !rows.length ? (
        <EmptyState title="No equipment matches the selected filters." body="Adjust the filters to view equipment." />
      ) : view === 'hospital' ? (
        <HospitalView rows={rows} />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Equipment</th>
                <th className="px-3 py-2 font-medium">Classification / risk</th>
                <th className="px-3 py-2 font-medium">Manufacturer</th>
                <th className="px-3 py-2 font-medium">Source / status</th>
                <th className="px-3 py-2 font-medium">Safety context</th>
                <th className="px-3 py-2 font-medium">Maintenance</th>
                <th className="px-3 py-2 font-medium">Assignment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0 odd:bg-surface even:bg-canvas/30 hover:bg-info-bg/40">
                  <td className="px-3 py-3">
                    <Link to={`/equipment/${e.id}`} className="font-medium text-navy hover:underline">
                      {e.historicalDetails?.deviceName || e.equipmentType}
                    </Link>
                    <div className="text-muted">{e.historicalDetails?.deviceCode || e.sourceIdentifier || e.equipmentCode || e.id}</div>
                    {e.isHistorical ? <div className="text-xs uppercase tracking-wide text-muted">HISTORICAL SAFETY DATA</div> : <div className="text-muted">{e.equipmentType}</div>}
                  </td>
                  <td className="px-3 py-3">
                    {e.historicalDetails?.classification || e.equipmentType}
                    <div className="text-muted">{e.historicalDetails?.riskClass ? `Risk class ${e.historicalDetails.riskClass}` : e.criticality}</div>
                  </td>
                  <td className="px-3 py-3">
                    {e.manufacturer}
                    <div className="text-muted">{e.historicalDetails?.country || e.model}</div>
                  </td>
                  <td className="px-3 py-3">
                    {e.isHistorical ? <StatusBadge label="Historical safety data" tone="info" /> : <StatusBadge label={operationalLabel(e.operationalStatus)} tone={e.operationalStatus === 'operational' ? 'healthy' : e.operationalStatus === 'degraded' ? 'critical' : 'warning'} />}
                  </td>
                  <td className="px-3 py-3">
                    {e.isHistorical ? <><StatusBadge label="Historical Safety AI · Open detail" tone="info" /><div className="mt-1">{e.historicalDetails?.eventCount ?? 0} historical event{e.historicalDetails?.eventCount === 1 ? '' : 's'}</div><div className="text-muted">{e.historicalDetails?.lastEvent?.eventType || 'No event context'}</div></> : <><StatusBadge label={`${e.healthScore} ${healthInterpretation(e.healthScore).label}`} tone={healthInterpretation(e.healthScore).tone} /><div className="mt-1"><StatusBadge label={`${e.failureRisk}% ${riskInterpretation(e.failureRisk).label}`} tone={riskInterpretation(e.failureRisk).tone} /></div></>}
                  </td>
                  <td className="px-3 py-3 capitalize">{e.maintenanceState.replace('_', ' ')}</td>
                  <td className="px-3 py-3 text-muted">{e.isHistorical ? 'Open detail for Historical Safety AI' : (techs.data ?? []).find((t) => t.id === e.assignedTechnicianId)?.name ?? 'Unassigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HospitalView({ rows }: { rows: Equipment[] }) {
  const groups = rows.reduce<Record<string, Equipment[]>>((acc, e) => {
    acc[e.department] = acc[e.department] ? [...acc[e.department], e] : [e]
    return acc
  }, {})
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(groups).map(([dept, items]) => (
        <Card key={dept}>
          <h2 className="font-serif text-lg text-navy">{dept}</h2>
          <ul className="mt-3 space-y-2">
            {items.map((e) => {
              const tone =
                e.failureRisk >= 75 || e.healthScore < 40 ? 'critical' : e.failureRisk >= 50 || e.healthScore < 75 ? 'warning' : 'healthy'
              return (
                <li key={e.id}>
                  <Link to={`/equipment/${e.id}`} className="flex items-center justify-between rounded-md border border-line px-3 py-2 hover:bg-canvas">
                    <span className="font-medium text-navy">{e.id}</span>
                    <StatusBadge label={operationalLabel(e.operationalStatus)} tone={tone} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </div>
  )
}
