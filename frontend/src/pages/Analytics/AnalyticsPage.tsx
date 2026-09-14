import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { TrendChart, BarMetricChart } from '@/components/charts/TrendChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { ErrorState, Skeleton } from '@/components/ui/States'

export function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d' | '1y'>('30d')
  const q = useQuery(() => api.getAnalytics(timeframe), [timeframe])

  if (q.error) return <ErrorState message="Unable to load analytics." onRetry={q.reload} />
  if (q.loading || !q.data) return <Skeleton className="h-96" />

  const { health, maintenance, safety, cost, downtime, trend, riskByDepartment, riskByManufacturer, technicianWorkload } = q.data

  const healthDistData = health?.healthDistribution || [
    { name: 'Excellent (90-100)', count: health?.categories?.EXCELLENT ?? 0 },
    { name: 'Good (75-89)', count: health?.categories?.GOOD ?? 0 },
    { name: 'Attention (55-74)', count: health?.categories?.ATTENTION_REQUIRED ?? 0 },
    { name: 'Poor (40-54)', count: health?.categories?.POOR ?? 0 },
    { name: 'Critical (<40)', count: health?.categories?.CRITICAL ?? 0 },
  ]

  const maintStatusData = maintenance?.statusCounts
    ? [
        { name: 'Pending', count: maintenance.statusCounts.PENDING },
        { name: 'Assigned', count: maintenance.statusCounts.ASSIGNED },
        { name: 'Scheduled', count: maintenance.statusCounts.SCHEDULED },
        { name: 'In Progress', count: maintenance.statusCounts.IN_PROGRESS },
        { name: 'Completed', count: maintenance.statusCounts.COMPLETED },
        { name: 'Cancelled', count: maintenance.statusCounts.CANCELLED },
      ]
    : []

  const safetySeverityData = safety?.severityCounts
    ? [
        { name: 'Critical', count: safety.severityCounts.CRITICAL },
        { name: 'High', count: safety.severityCounts.HIGH },
        { name: 'Warning', count: safety.severityCounts.WARNING },
      ]
    : []

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Analytics & Reports" question="Operational trends, equipment health, failure risks, maintenance workload, and reports" actions={<Link to="/reports" className="text-sm font-medium text-slate-blue hover:underline">Open reports</Link>} />
        <div className="flex items-center gap-1 rounded-lg bg-surface border border-line p-1 text-sm font-medium">
          {(['7d', '30d', '90d', '1y'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-3 py-1 rounded-md transition-colors ${timeframe === t ? 'bg-navy text-white shadow-xs' : 'text-muted hover:text-navy'}`}
            >
              {t === '7d' ? '7 Days' : t === '30d' ? '30 Days' : t === '90d' ? '90 Days' : '1 Year'}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: EQUIPMENT INTELLIGENCE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h2 className="text-lg font-semibold text-navy">Equipment Intelligence</h2>
          <span className="text-xs font-mono text-muted uppercase">OPERATIONAL DATA</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle>Health & Failure-Risk Trends</CardTitle>
            <CardHint>Average fleet health score vs. calculated AI failure risk over time.</CardHint>
            <TrendChart
              data={trend}
              lines={[
                { key: 'health', color: '#2F7D4A', label: 'Avg Health Score' },
                { key: 'risk', color: '#C45C12', label: 'Avg Failure Risk %' },
              ]}
            />
          </Card>
          <Card>
            <CardTitle>Health Category Distribution</CardTitle>
            <CardHint>Equipment breakdown by current clinical health band.</CardHint>
            <DonutChart
              data={healthDistData.map((h: any) => ({ name: h.name, value: h.count }))}
              colors={['#2F7D4A', '#529F6C', '#C4841D', '#C45C12', '#B42318']}
            />
            <div className="mt-4 text-center">
              <span className="text-sm font-medium text-navy">Average Fleet Health: </span>
              <span className="font-serif text-xl font-bold text-navy">{health?.avgHealthScore ?? 0}/100</span>
            </div>
          </Card>
        </div>
      </section>

      {/* SECTION 2: RISK INTELLIGENCE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h2 className="text-lg font-semibold text-navy">Risk Intelligence</h2>
          <span className="text-xs font-medium text-muted">AI-GENERATED PREDICTION — DEMO MODEL</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>Failure Risk by Department</CardTitle>
            <CardHint>Average AI failure probability across clinical departments.</CardHint>
            {riskByDepartment.length > 0 ? (
              <BarMetricChart data={riskByDepartment} xKey="department" yKey="avgRisk" color="#C45C12" />
            ) : (
              <div className="py-12 text-center text-sm text-muted">Insufficient assessment history to aggregate by department.</div>
            )}
          </Card>
          <Card>
            <CardTitle>High-Risk Count by Manufacturer</CardTitle>
            <CardHint>Number of equipment with failure risk ≥ 50% grouped by manufacturer.</CardHint>
            {riskByManufacturer.length > 0 ? (
              <BarMetricChart data={riskByManufacturer} xKey="manufacturer" yKey="highRisk" color="#173F5F" />
            ) : (
              <div className="py-12 text-center text-sm text-muted">No high-risk equipment identified across manufacturers.</div>
            )}
          </Card>
        </div>
      </section>

      {/* SECTION 3: MAINTENANCE INTELLIGENCE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h2 className="text-lg font-semibold text-navy">Maintenance Intelligence</h2>
          <span className="text-xs font-mono text-muted uppercase">WORK ORDERS & WORKLOAD</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardTitle>Work Order Status Breakdown</CardTitle>
            <CardHint>Current status of work orders in selected timeframe.</CardHint>
            {maintStatusData.length > 0 ? (
              <ul className="mt-4 space-y-2 text-sm">
                {maintStatusData.map((st) => (
                  <li key={st.name} className="flex justify-between items-center py-1 border-b border-line/50">
                    <span className="text-muted">{st.name}</span>
                    <span className="font-semibold text-navy">{st.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center text-sm text-muted">No work orders recorded in this timeframe.</div>
            )}
          </Card>
          <Card className="lg:col-span-2">
            <CardTitle>Technician Active Workload</CardTitle>
            <CardHint>Assigned active work orders per biomedical technician.</CardHint>
            {technicianWorkload.length > 0 ? (
              <BarMetricChart data={technicianWorkload} xKey="name" yKey="workload" color="#168B8B" />
            ) : (
              <div className="py-12 text-center text-sm text-muted">No active work assigned to technicians.</div>
            )}
          </Card>
        </div>
      </section>

      {/* SECTION 4: SAFETY INTELLIGENCE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h2 className="text-lg font-semibold text-navy">Safety Intelligence</h2>
          <span className="text-xs font-mono text-muted uppercase">OPERATIONAL SAFETY ALERTS</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>Safety Alert Severity Distribution</CardTitle>
            <CardHint>Active and historical safety alert counts by severity level.</CardHint>
            {safetySeverityData.length > 0 ? (
              <div className="mt-4 space-y-3">
                {safetySeverityData.map((sv) => (
                  <div key={sv.name} className="flex items-center justify-between p-3 rounded-md bg-canvas">
                    <span className="font-medium text-navy">{sv.name} Severity</span>
                    <StatusBadge
                      label={`${sv.count} Alerts`}
                      tone={sv.name === 'Critical' ? 'critical' : sv.name === 'High' ? 'high' : 'warning'}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted">No safety alerts reported in this timeframe.</div>
            )}
          </Card>
          <Card>
            <CardTitle>Resolution Metrics</CardTitle>
            <CardHint>Key safety resolution performance indicators.</CardHint>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-canvas text-center">
                <p className="text-xs uppercase text-muted font-medium">Resolution Rate</p>
                <p className="mt-1 font-serif text-3xl text-healthy">{safety?.resolutionRate ?? 0}%</p>
              </div>
              <div className="p-4 rounded-lg bg-canvas text-center">
                <p className="text-xs uppercase text-muted font-medium">Unresolved Critical</p>
                <p className="mt-1 font-serif text-3xl text-critical">{safety?.unresolvedCritical ?? 0}</p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* SECTION 5: OPERATIONAL INTELLIGENCE (COST & DOWNTIME) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h2 className="text-lg font-semibold text-navy">Operational Intelligence (Cost & Downtime)</h2>
          <span className="text-xs font-mono text-muted uppercase">REAL FINANCIAL & DOWNTIME METRICS</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>Maintenance Cost Summary</CardTitle>
            <CardHint>Measured maintenance expenses from completed work orders.</CardHint>
            {cost?.hasData ? (
              <div className="mt-4 space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-canvas">
                  <span className="text-sm font-medium text-muted">Total Expense</span>
                  <span className="font-serif text-2xl text-navy">${cost.totalCost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-canvas">
                  <span className="text-sm font-medium text-muted">Average Cost / Work Order</span>
                  <span className="font-serif text-xl text-navy">${cost.avgCost.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-muted font-medium">No cost data available</div>
            )}
          </Card>
          <Card>
            <CardTitle>Equipment Downtime Summary</CardTitle>
            <CardHint>Total measured equipment downtime in operating hours.</CardHint>
            {downtime?.hasData ? (
              <div className="mt-4 space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-canvas">
                  <span className="text-sm font-medium text-muted">Total Downtime</span>
                  <span className="font-serif text-2xl text-navy">{downtime.totalDowntimeHours} hrs</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-canvas">
                  <span className="text-sm font-medium text-muted">Average Downtime / Event</span>
                  <span className="font-serif text-xl text-navy">{downtime.avgDowntimeHours} hrs</span>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-muted font-medium">No downtime data available</div>
            )}
          </Card>
        </div>
      </section>
    </div>
  )
}
