import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { onRealtime } from '@/services/realtime'

export function DataAIOverviewPage() {
  const models = useQuery(() => api.listModels())
  const datasets = useQuery(() => api.listDatasets())
  const operationalDataset = (datasets.data ?? []).find((dataset) => dataset.isOperational)
  const active = operationalDataset
    ? (models.data ?? [])
      .filter((model) => model.datasetId === operationalDataset.id)
      .sort((a, b) =>
        Number(b.isOperational) - Number(a.isOperational) ||
        Number(b.isActive) - Number(a.isActive) ||
        Number(b.status === 'Active') - Number(a.status === 'Active') ||
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]
    : undefined

  useEffect(() => {
    const unsubscribe = onRealtime('dataset:activated', () => {
      void Promise.all([datasets.reload(), models.reload()])
    })
    return () => {
      unsubscribe()
    }
  }, [datasets.reload, models.reload])

  return (
    <div>
      <PageHeader title="Data & AI" question="How is the AI trained and managed?" />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardTitle>Model for active dataset</CardTitle>
          {active ? (
            <>
              <p className="mt-2 font-serif text-xl text-navy">
                {active.name} {active.version}
              </p>
              <p className="text-sm text-muted">Recall {active.evaluation?.recall}%</p>
              <p className="text-sm text-muted">Dataset {active.datasetName}</p>
              <p className="text-sm text-muted">Status {active.status}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No model is available for the active dataset.</p>
          )}
        </Card>
        <Card>
          <CardTitle>Datasets</CardTitle>
          <p className="mt-2 font-serif text-3xl text-navy">{datasets.data?.length ?? '—'}</p>
          <Link to="/data-ai/datasets" className="mt-2 inline-block text-sm text-slate-blue hover:underline">
            Manage datasets
          </Link>
        </Card>
        <Card>
          <CardTitle>Workflow</CardTitle>
          <CardHint>Upload → profile → configure → preprocess → train → evaluate → compare → activate.</CardHint>
          <p className="mt-3 text-sm text-muted">A new model does not replace the active model until a reviewer activates it.</p>
        </Card>
      </div>
      <Card className="mt-4">
        <CardTitle>Models</CardTitle>
        <ul className="mt-3 divide-y divide-line">
          {(models.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3 text-sm">
              <span>
                {m.name} {m.version}
              </span>
              <StatusBadge label={m.status} tone={m.status === 'Active' ? 'healthy' : 'neutral'} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
