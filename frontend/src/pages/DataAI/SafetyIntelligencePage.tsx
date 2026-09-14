import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Input, Select } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { BarMetricChart } from '@/components/charts/TrendChart'

type HistoricalList<T> = { devices?: T[]; manufacturers?: T[]; countries?: T[]; eventTypes?: T[]; trends?: T[]; pagination?: { total?: number } }
const eventTypes = ['RECALL', 'FIELD_SAFETY_NOTICE', 'SAFETY_ALERT', 'MIXED', 'UNKNOWN']

export function SafetyIntelligencePage() {
  const [eventType, setEventType] = useState('')
  const [country, setCountry] = useState('')
  const [deviceSearch, setDeviceSearch] = useState('')
  const [manufacturerSearch, setManufacturerSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const filters = useMemo(() => ({ eventType, country, deviceSearch, manufacturerSearch, from, to }), [eventType, country, deviceSearch, manufacturerSearch, from, to])
  const overview = useQuery(() => api.getHistoricalSafetyOverview(filters), [filters])
  const trends = useQuery(() => api.getHistoricalSafetyEventTrends(filters), [filters])
  const types = useQuery(() => api.getHistoricalSafetyEventTypes(filters), [filters])
  const countries = useQuery(() => api.listHistoricalSafetyCountries(), [])
  const devices = useQuery(() => api.listHistoricalSafetyDevices({ ...filters, search: deviceSearch, page, limit: 20 }), [filters, page])
  const manufacturers = useQuery(() => api.listHistoricalSafetyManufacturers({ ...filters, search: manufacturerSearch, page: 1, limit: 20 }), [filters])

  const overviewData = (overview.data ?? {}) as Record<string, any>
  const trendRows = ((trends.data ?? {}) as HistoricalList<any>).trends ?? []
  const typeRows = ((types.data ?? {}) as HistoricalList<any>).eventTypes ?? []
  const deviceRows = ((devices.data ?? {}) as HistoricalList<any>).devices ?? []
  const manufacturerRows = ((manufacturers.data ?? {}) as HistoricalList<any>).manufacturers ?? []
  const countryRows = ((countries.data ?? {}) as HistoricalList<any>).countries ?? []
  const total = Number((devices.data as any)?.pagination?.total ?? overviewData.totalRecords ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / 20))
  const chartData = trendRows.map((row: any) => ({ period: row.year ?? 'Unknown', events: row.count ?? 0 }))
  const activeFilters = [
    eventType && `Event type: ${eventType}`,
    country && `Country: ${country}`,
    deviceSearch && `Device: ${deviceSearch}`,
    manufacturerSearch && `Manufacturer: ${manufacturerSearch}`,
    from && `From: ${from}`,
    to && `To: ${to}`,
  ].filter(Boolean) as string[]
  const clearFilters = () => { setEventType(''); setCountry(''); setDeviceSearch(''); setManufacturerSearch(''); setFrom(''); setTo(''); setPage(1) }
  const retry = () => { overview.reload(); trends.reload(); types.reload(); countries.reload(); devices.reload(); manufacturers.reload() }

  if (overview.error || trends.error || types.error || countries.error || devices.error || manufacturers.error) {
    return <div className="space-y-6"><PageHeader title="Historical Safety Intelligence" question="What does the historical safety archive show?" /><ErrorState message="Historical safety data is currently unavailable. No operational data was substituted." onRetry={retry} /></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Historical Safety Intelligence" question="What does the historical medical-device safety archive show?" />
      <div className="rounded-lg border border-info/20 bg-info-bg p-4 text-sm text-navy">
        <div className="flex items-center gap-2 font-semibold"><StatusBadge label="HISTORICAL SAFETY DATA" tone="info" /><span>Historical context only</span></div>
        <p className="mt-2 text-muted">Historical regulatory safety records. This information is not live equipment telemetry, a current device safety assessment, or an operational alert source.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Historical Safety Filters</CardTitle>{activeFilters.length > 0 && <button type="button" className="text-sm text-slate-blue hover:underline" onClick={clearFilters}>Clear All Filters</button>}</div>
        <CardHint>All filters query the historical database; pagination and summaries update with the matching records.</CardHint>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Select value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1) }} aria-label="Event type">
            <option value="">All event types</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </Select>
          <Select value={country} onChange={(e) => { setCountry(e.target.value); setPage(1) }} aria-label="Country">
            <option value="">All countries</option>{countryRows.map((row: any) => <option key={row.country} value={row.country}>{row.country}</option>)}
          </Select>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden /><Input className="pl-9" placeholder="Search device ID or name" value={deviceSearch} onChange={(e) => { setDeviceSearch(e.target.value); setPage(1) }} aria-label="Search device" /></div>
          <Input list="historical-manufacturers" placeholder="Search manufacturer" value={manufacturerSearch} onChange={(e) => { setManufacturerSearch(e.target.value); setPage(1) }} aria-label="Search manufacturer" />
          <datalist id="historical-manufacturers">{manufacturerRows.map((row: any) => <option key={row.id} value={row.name} />)}</datalist>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} aria-label="Historical date from" />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} aria-label="Historical date to" />
        </div>
        {activeFilters.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{activeFilters.map((filter) => <span key={filter} className="inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-xs text-navy">{filter}<X className="h-3 w-3" aria-hidden /></span>)}</div>}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Matching Records', overviewData.totalRecords ?? 0],
          ['Manufacturers', overviewData.manufacturerCount ?? 0],
          ['Recalls', overviewData.recallCount ?? 0],
          ['Field Safety Notices', overviewData.fieldSafetyNoticeCount ?? 0],
          ['Safety Alerts', overviewData.safetyAlertCount ?? 0],
        ].map(([label, value]) => <Card key={String(label)} className="p-4"><p className="text-xs font-medium uppercase text-muted">{label}</p><p className="mt-1 font-serif text-2xl text-navy">{overview.loading ? '—' : Number(value).toLocaleString()}</p></Card>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle>Historical Event Trends</CardTitle><CardHint>Recorded events by valid historical event date.</CardHint>{trends.loading ? <Skeleton className="mt-4 h-56" /> : chartData.length ? <BarMetricChart data={chartData} xKey="period" yKey="events" color="#397C9D" /> : <EmptyState title="No dated historical events match these filters" />}</Card>
        <Card><CardTitle>Event Type Distribution</CardTitle><CardHint>Actual normalized event categories from the historical database.</CardHint><div className="mt-4 space-y-3">{types.loading ? <Skeleton className="h-40" /> : typeRows.length ? typeRows.map((row: any) => <div key={row.eventType} className="flex items-center justify-between border-b border-line pb-2 text-sm"><span className="text-navy">{row.eventType}</span><span className="font-medium text-muted">{Number(row.count).toLocaleString()}</span></div>) : <EmptyState title="No event categories match these filters" />}</div></Card>
      </div>

      <Card><CardTitle>Historical Device Explorer</CardTitle><CardHint>{total.toLocaleString()} matching historical records</CardHint>{devices.loading ? <Skeleton className="mt-4 h-64" /> : deviceRows.length ? <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="px-3 py-2">Device</th><th className="px-3 py-2">Manufacturer</th><th className="px-3 py-2">Historical events</th></tr></thead><tbody>{deviceRows.map((row: any) => <tr key={row.id} className="border-b border-line last:border-0"><td className="px-3 py-3 font-medium text-navy">{row.name}</td><td className="px-3 py-3 text-muted">{row.manufacturer?.name ?? 'Unknown'}</td><td className="px-3 py-3 text-muted">{row.eventCount ?? 0}</td></tr>)}</tbody></table></div><div className="mt-4 flex justify-between text-sm text-muted"><span>Page {page} of {totalPages}</span><div className="flex gap-2"><button type="button" className="rounded border border-line-strong px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button type="button" className="rounded border border-line-strong px-3 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button></div></div></> : <div className="mt-4"><EmptyState title="No historical devices match these filters" /></div>}</Card>

      <Card><CardTitle>Historical Manufacturer Explorer</CardTitle><CardHint>Manufacturers associated with the filtered historical event set.</CardHint>{manufacturerRows.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">{manufacturerRows.map((row: any) => <div key={row.id} className="rounded border border-line p-3 text-sm"><p className="font-medium text-navy">{row.name}</p><p className="mt-1 text-muted">{Number(row.eventCount ?? 0).toLocaleString()} events · {Number(row.deviceCount ?? 0).toLocaleString()} devices</p></div>)}</div> : <EmptyState title="No manufacturers match these filters" />}</Card>
    </div>
  )
}
