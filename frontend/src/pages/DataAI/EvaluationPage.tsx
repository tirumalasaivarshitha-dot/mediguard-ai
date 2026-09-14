import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { BarMetricChart } from '@/components/charts/TrendChart'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { useState } from 'react'

export function EvaluationPage() {
  const models = useQuery(() => api.listModels())
  const [msg, setMsg] = useState<string | null>(null)
  const candidate = (models.data ?? []).find((m) => m.id === 'rf-v2.1') ?? models.data?.[0]
  if (!candidate?.evaluation) return <p className="text-sm text-muted">Loading evaluation…</p>
  const ev = candidate.evaluation
  const cm = ev.confusionMatrix

  return (
    <div>
      <PageHeader title="Model evaluation" question="Is this candidate safe to activate for equipment assessment?" />
      {msg ? <p className="mb-4 rounded-md bg-canvas px-3 py-2 text-sm">{msg}</p> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              {candidate.name} {candidate.version}
            </CardTitle>
            <CardHint>Recall is emphasized because missed failure risk is a safety concern.</CardHint>
          </div>
          <StatusBadge label={candidate.status === 'Active' ? 'Active' : 'Recommended for review'} tone={candidate.status === 'Active' ? 'healthy' : 'info'} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="Accuracy" value={`${ev.accuracy}%`} />
          <Metric label="Precision" value={`${ev.precision}%`} />
          <Metric label="Recall" value={`${ev.recall}%`} emphasize />
          <Metric label="F1" value={`${ev.f1}%`} />
          <Metric label="ROC-AUC" value={`${ev.rocAuc}%`} />
        </div>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Confusion matrix</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-md bg-healthy-bg p-4">
              True positive
              <div className="font-serif text-2xl text-navy">{cm.truePositive}</div>
            </div>
            <div className="rounded-md bg-warning-bg p-4">
              False positive
              <div className="font-serif text-2xl text-navy">{cm.falsePositive}</div>
            </div>
            <div className="rounded-md bg-critical-bg p-4">
              False negative
              <div className="font-serif text-2xl text-navy">{cm.falseNegative}</div>
            </div>
            <div className="rounded-md bg-info-bg p-4">
              True negative
              <div className="font-serif text-2xl text-navy">{cm.trueNegative}</div>
            </div>
          </div>
        </Card>
        <Card>
          <CardTitle>Feature importance</CardTitle>
          <CardHint>From the trained model evaluation payload.</CardHint>
          <BarMetricChart
            data={ev.featureImportance.map((featureItem: { feature: string; importance: number }) => ({
              feature: featureItem.feature,
              importance: Number((featureItem.importance * 100).toFixed(1)),
            }))}
            xKey="feature"
            yKey="importance"
          />
        </Card>
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          onClick={async () => {
            try {
              await api.activateModel(candidate.id)
              setMsg('Model activated. Equipment assessment now uses this version.')
              models.reload()
            } catch (e) {
              setMsg(e instanceof Error ? e.message : 'Activation declined.')
            }
          }}
        >
          Activate model
        </Button>
        <p className="self-center text-sm text-muted">Activation is a deliberate step. Poor recall models are rejected.</p>
      </div>
    </div>
  )
}

function Metric({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${emphasize ? 'border-teal bg-info-bg' : 'border-line'}`}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl text-navy">{value}</p>
    </div>
  )
}
