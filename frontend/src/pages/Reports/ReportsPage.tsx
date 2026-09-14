import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { formatCurrency, formatDate } from '@/utils/format'
import { API_ORIGIN } from '@/config/app'

type ReportType = 'health' | 'maintenance' | 'safety' | 'department' | 'cost'

export function ReportsPage() {
  const [type, setType] = useState<ReportType>('health')
  const [department, setDepartment] = useState('')
  const [exported, setExported] = useState<string | null>(null)

  const eqQ = useQuery(() => api.listEquipment())
  const woQ = useQuery(() => api.listWorkOrders())
  const alertsQ = useQuery(() => api.listAlerts())
  const historyQ = useQuery(() => api.getMaintenanceHistory())

  if (eqQ.loading || woQ.loading || alertsQ.loading || historyQ.loading) {
    return <Skeleton className="h-96" />
  }

  if (eqQ.error || woQ.error || alertsQ.error) {
    return <ErrorState message="Unable to load report data." onRetry={eqQ.reload} />
  }

  let equipment = eqQ.data ?? []
  if (department) {
    equipment = equipment.filter((e) => e.department === department)
  }

  const workOrders = woQ.data ?? []
  const alerts = alertsQ.data ?? []
  const history = historyQ.data ?? []
  const depts = [...new Set((eqQ.data ?? []).map((e) => e.department))]

  async function handleExport(format: 'CSV' | 'PDF') {
    const categoryMap: Record<ReportType, string> = {
      health: 'EQUIPMENT_HEALTH',
      maintenance: 'MAINTENANCE',
      safety: 'SAFETY_ALERTS',
      department: 'DEPARTMENT_SUMMARY',
      cost: 'DOWNTIME_COST',
    }
    const cat = categoryMap[type]
    const params = new URLSearchParams({ category: cat })
    if (department) params.set('department', department)

    const token = localStorage.getItem('mediguard.token')
    const response = await fetch(`${API_ORIGIN}/api/reports/export/${format === 'CSV' ? 'csv' : 'pdf'}?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) {
      setExported('Unable to export report.')
      return
    }
    const blobUrl = URL.createObjectURL(await response.blob())
    window.open(blobUrl, '_blank')
    setExported(format === 'CSV' ? `Exporting ${cat} report as CSV...` : `Opening printable PDF view for ${cat} report...`)
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    setTimeout(() => setExported(null), 4000)
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        question="What are our structured executive and operational summaries?"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport('CSV')}>
              Export CSV
            </Button>
            <Button variant="primary" onClick={() => handleExport('PDF')}>
              Generate PDF Report
            </Button>
          </div>
        }
      />

      {exported ? (
        <div className="mb-4 rounded-md border border-healthy/20 bg-healthy-bg px-4 py-3 text-sm text-navy">
          {exported}
        </div>
      ) : null}

      <Card className="mb-6 grid gap-4 p-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Report type
          </label>
          <Select value={type} onChange={(e) => setType(e.target.value as ReportType)} aria-label="Select Report Type">
            <option value="health">Equipment Health & Failure Risk</option>
            <option value="maintenance">Maintenance Performance & Downtime</option>
            <option value="safety">Safety Events & Alert History</option>
            <option value="department">Department Performance Breakdown</option>
            <option value="cost">Maintenance Cost & Resource Allocation</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Filter by Department
          </label>
          <Select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Select Department Filter">
            <option value="">All Hospital Departments</option>
            {depts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {type === 'health' && (
        <Card>
          <CardTitle>Equipment Health & Failure Risk Executive Report</CardTitle>
          <CardHint>Generated live on {new Date().toLocaleDateString()}</CardHint>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase text-muted">
                <tr>
                  <th className="py-2.5 px-3">Equipment ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Health Score</th>
                  <th className="py-2.5 px-3">Failure Risk</th>
                  <th className="py-2.5 px-3">Operational Status</th>
                  <th className="py-2.5 px-3">Safety State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {equipment.map((e) => (
                  <tr key={e.id} className="hover:bg-canvas/50">
                    <td className="py-3 px-3 font-medium text-navy">{e.id}</td>
                    <td className="py-3 px-3">{e.equipmentType}</td>
                    <td className="py-3 px-3">{e.department}</td>
                    <td className="py-3 px-3 font-semibold">{e.healthScore} / 100</td>
                    <td className="py-3 px-3">{e.failureRisk}%</td>
                    <td className="py-3 px-3">
                      <StatusBadge
                        label={e.operationalStatus}
                        tone={e.operationalStatus === 'operational' ? 'healthy' : 'warning'}
                      />
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge
                        label={e.safetyStatus}
                        tone={e.safetyStatus === 'Normal' ? 'healthy' : 'critical'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {type === 'maintenance' && (
        <Card>
          <CardTitle>Maintenance Performance & Downtime Report</CardTitle>
          <CardHint>Summary of work orders, completed maintenance, and downtime hours.</CardHint>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase text-muted">
                <tr>
                  <th className="py-2.5 px-3">Work Order</th>
                  <th className="py-2.5 px-3">Equipment ID</th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {workOrders.map((w) => (
                  <tr key={w.id} className="hover:bg-canvas/50">
                    <td className="py-3 px-3 font-medium text-navy">{w.id}</td>
                    <td className="py-3 px-3">{w.equipmentId}</td>
                    <td className="py-3 px-3">{w.title}</td>
                    <td className="py-3 px-3">
                      <StatusBadge
                        label={w.priorityLabel}
                        tone={w.priorityLabel === 'Urgent' ? 'critical' : 'warning'}
                      />
                    </td>
                    <td className="py-3 px-3">{w.status}</td>
                    <td className="py-3 px-3">{formatDate(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {type === 'safety' && (
        <Card>
          <CardTitle>Safety Events & Alert History Report</CardTitle>
          <CardHint>Comprehensive breakdown of equipment safety alerts and escalations.</CardHint>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase text-muted">
                <tr>
                  <th className="py-2.5 px-3">Alert ID</th>
                  <th className="py-2.5 px-3">Equipment ID</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Responsible Role</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {alerts.map((a) => (
                  <tr key={a.id} className="hover:bg-canvas/50">
                    <td className="py-3 px-3 font-medium text-navy">{a.id}</td>
                    <td className="py-3 px-3">{a.equipmentId}</td>
                    <td className="py-3 px-3">
                      <StatusBadge
                        label={a.severity}
                        tone={a.severity === 'Critical' ? 'critical' : 'high'}
                      />
                    </td>
                    <td className="py-3 px-3">{a.reason}</td>
                    <td className="py-3 px-3">{a.responsibleRole}</td>
                    <td className="py-3 px-3">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {type === 'department' && (
        <Card>
          <CardTitle>Department Equipment Health & Performance Report</CardTitle>
          <CardHint>Departmental equipment counts, average failure risk, and active maintenance.</CardHint>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase text-muted">
                <tr>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Total Assets</th>
                  <th className="py-2.5 px-3">Avg Failure Risk</th>
                  <th className="py-2.5 px-3">Attention / High Risk</th>
                  <th className="py-2.5 px-3">Under Maintenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {depts.map((d) => {
                  const deptEq = equipment.filter((e) => e.department === d)
                  const avgRisk = Math.round(
                    deptEq.reduce((acc, curr) => acc + curr.failureRisk, 0) / (deptEq.length || 1),
                  )
                  const highRiskCount = deptEq.filter((e) => e.failureRisk >= 50).length
                  const maintCount = deptEq.filter((e) => e.operationalStatus === 'maintenance').length
                  return (
                    <tr key={d} className="hover:bg-canvas/50">
                      <td className="py-3 px-3 font-medium text-navy">{d}</td>
                      <td className="py-3 px-3">{deptEq.length}</td>
                      <td className="py-3 px-3 font-semibold">{avgRisk}%</td>
                      <td className="py-3 px-3">{highRiskCount}</td>
                      <td className="py-3 px-3">{maintCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {type === 'cost' && (
        <Card>
          <CardTitle>Maintenance Cost & Resource Allocation Report</CardTitle>
          <CardHint>Historical maintenance costs, downtime, and technician labor records.</CardHint>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase text-muted">
                <tr>
                  <th className="py-2.5 px-3">Record ID</th>
                  <th className="py-2.5 px-3">Equipment ID</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Maintenance Type</th>
                  <th className="py-2.5 px-3">Downtime Hours</th>
                  <th className="py-2.5 px-3">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-canvas/50">
                    <td className="py-3 px-3 font-medium text-navy">{h.id}</td>
                    <td className="py-3 px-3">{h.equipmentId}</td>
                    <td className="py-3 px-3">{formatDate(h.date)}</td>
                    <td className="py-3 px-3">{h.type}</td>
                    <td className="py-3 px-3">{h.downtimeHours} hrs</td>
                    <td className="py-3 px-3 font-semibold text-navy">{formatCurrency(h.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
