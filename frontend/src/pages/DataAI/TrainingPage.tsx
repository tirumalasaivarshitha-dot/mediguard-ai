import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, Field } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'

export function TrainingPage() {
  const datasets = useQuery(() => api.listDatasets())
  const [datasetId, setDatasetId] = useState('')
  const [targetColumn, setTargetColumn] = useState('')
  const [algorithm, setAlgorithm] = useState('Random Forest')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const selected = (datasets.data ?? []).find((dataset) => dataset.id === datasetId) ?? (datasets.data ?? []).find((dataset) => dataset.status === 'Ready' || dataset.status === 'Configured')
  const isHistoricalSafety = selected?.datasetType === 'HISTORICAL_SAFETY'
  const columns = selected?.profile.columnNames ?? []

  return (
    <div>
      <PageHeader title="Model training" question="Train a candidate model without replacing the active model." />
      <Card>
        <CardTitle>Train from configured dataset</CardTitle>
        <CardHint>{isHistoricalSafety
          ? 'This trains a non-operational model on historical safety data using a chronological future-event target. It is not live telemetry or an operational failure model.'
          : 'Training uses the uploaded dataset contents and returns real held-out evaluation metrics. The active production model is unchanged.'}</CardHint>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Dataset">
            <Select value={datasetId || selected?.id || ''} onChange={(event) => { setDatasetId(event.target.value); setTargetColumn('') }}>
              <option value="">Select dataset</option>
              {(datasets.data ?? []).map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
            </Select>
          </Field>
          {!isHistoricalSafety ? <Field label="Target column">
            <Select value={targetColumn || selected?.profile.potentialTarget || ''} onChange={(event) => setTargetColumn(event.target.value)}>
              <option value="">Select target</option>
              {columns.map((column) => <option key={column}>{column}</option>)}
            </Select>
          </Field> : null}
          <Field label="Algorithm">
            <Select value={algorithm} onChange={(event) => setAlgorithm(event.target.value)}>
              <option>Random Forest</option>
              <option>Logistic Regression</option>
              <option>Gradient Boosting</option>
            </Select>
          </Field>
        </div>
        {selected ? <p className="mt-3 text-sm text-muted">{selected.profile.rows.toLocaleString()} rows · {selected.profile.columns} columns · {selected.profile.missingValuePercent}% missing</p> : null}
        {error ? <p className="mt-3 rounded-md border border-warning px-3 py-2 text-sm">{error}</p> : null}
        <Button className="mt-4" disabled={running || !selected || (!isHistoricalSafety && !(targetColumn || selected?.profile.potentialTarget))} onClick={async () => {
          if (!selected) return
          setRunning(true); setError(null); setResult(null)
          try {
            const trained = isHistoricalSafety
              ? await api.trainHistoricalSafety(selected.id)
              : await api.trainModel({ name: `${selected.name} ${algorithm}`, algorithm, datasetId: selected.id, targetColumn: targetColumn || selected.profile.potentialTarget! })
            setResult(trained)
          } catch (trainingError) {
            setError(trainingError instanceof Error ? trainingError.message : 'Training failed.')
          } finally {
            setRunning(false)
          }
        }}>
          {running ? 'Training model…' : isHistoricalSafety ? 'Train historical safety models' : 'Start training'}
        </Button>
        {running ? <p className="mt-4 text-sm text-muted">Training is running on the backend. No simulated progress is shown.</p> : null}
        {result ? <div className="mt-6 space-y-3">
          <StatusBadge label="Evaluated candidate" tone="healthy" />
          {isHistoricalSafety ? (
            <div className="space-y-2">
              <p className="text-sm">Historical safety models trained: {result.models?.length ?? 0}</p>
              {(result.models ?? []).map((model: any) => (
                <p key={model.id} className="text-sm">
                  {model.algorithm}: Accuracy {model.accuracy ?? '—'} · Precision {model.precision ?? '—'} · Recall {model.recall ?? '—'} · F1 {model.f1Score ?? '—'} · ROC-AUC {model.rocAuc ?? 'Not available'}
                </p>
              ))}
              <p className="text-sm text-muted">This model predicts recurrence of a qualifying historical safety event within 365 days after an event cutoff. It is not operational telemetry.</p>
            </div>
          ) : (
            <>
              <p className="text-sm">Accuracy {result.accuracy ?? '—'} · Precision {result.precision ?? '—'} · Recall {result.recall ?? '—'} · F1 {result.f1Score ?? '—'} · ROC-AUC {result.rocAuc ?? 'Not available'}</p>
              <p className="text-sm text-muted">Training samples {result.trainingSamples ?? '—'} · Evaluation samples {result.evaluationSamples ?? '—'} · Features {result.featureCount ?? '—'}</p>
              <p className="text-sm">Review and explicitly activate this candidate before using it. DEMO MODEL — NOT CLINICALLY VALIDATED.</p>
            </>
          )}
        </div> : null}
      </Card>
    </div>
  )
}
