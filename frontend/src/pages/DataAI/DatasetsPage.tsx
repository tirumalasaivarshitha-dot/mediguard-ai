import { useState } from 'react'
import { api } from '@/services/api'
import { useQuery } from '@/hooks/useQuery'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import type { ColumnMapping, Dataset, DatasetAICapabilities, DatasetCapabilities, DetectedColumnMapping, UnifiedDatasetAssessment } from '@/types'
import { useAuth } from '@/hooks/useAuth'

const mapFields: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'equipmentId', label: 'Equipment ID' },
  { key: 'equipmentName', label: 'Equipment name' },
  { key: 'equipmentType', label: 'Equipment type' },
  { key: 'model', label: 'Model' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'location', label: 'Location' },
  { key: 'department', label: 'Department' },
  { key: 'facility', label: 'Facility' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'vibration', label: 'Vibration' },
  { key: 'pressure', label: 'Pressure' },
  { key: 'power', label: 'Power' },
  { key: 'humidity', label: 'Humidity' },
  { key: 'operatingHours', label: 'Operating hours' },
  { key: 'errorCount', label: 'Error count' },
  { key: 'lastMaintenance', label: 'Last maintenance' },
  { key: 'maintenanceCount', label: 'Maintenance count' },
  { key: 'maintenanceStatus', label: 'Maintenance status' },
  { key: 'maintenance', label: 'Maintenance information' },
  { key: 'failureIndicator', label: 'Failure indicator' },
  { key: 'faultStatus', label: 'Fault status' },
  { key: 'failureType', label: 'Failure type' },
  { key: 'conditionStatus', label: 'Condition status' },
  { key: 'failureTarget', label: 'Failure target' },
  { key: 'timestamp', label: 'Timestamp' },
]

export function DatasetsPage() {
  const q = useQuery(() => api.listDatasets())
  const modelsQ = useQuery(() => api.listModels())
  const { user } = useAuth()
  const canManage = user?.role === 'hospital_admin'
  const [busy, setBusy] = useState(false)
  const [activationBusy, setActivationBusy] = useState<string | null>(null)
  const [configure, setConfigure] = useState<Dataset | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [aiCapability, setAiCapability] = useState<DatasetAICapabilities | null>(null)
  const [assessment, setAssessment] = useState<UnifiedDatasetAssessment | null>(null)
  const [analysisBusy, setAnalysisBusy] = useState<string | null>(null)
  const [analysisSummary, setAnalysisSummary] = useState<Record<string, {
    modelName: string
    predictions: number
    assessmentsCreated: number
    assessmentsSkipped: number
    alertsCreated: number
    alertsSkipped: number
    errors: number
  }>>({})

  if (q.error) return <ErrorState message="Unable to load datasets." onRetry={q.reload} />
  if (q.loading || !q.data) return <Skeleton className="h-72" />

  async function analyzeDataset(dataset: Dataset) {
    if (!canManage) return
    const targetColumn = dataset.profile.potentialTarget
    if (!targetColumn) {
      setToast('This dataset has no failure target. Review its detected anomaly, condition, or maintenance capability instead of claiming supervised failure prediction.')
      try {
        setAiCapability(await api.getDatasetAICapabilities(dataset.id))
        setAssessment(await api.assessDatasetRow(dataset.id))
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Dataset analysis could not be completed.')
      }
      return
    }
    if (dataset.datasetType === 'HISTORICAL_SAFETY') {
      setToast('Historical safety data remains analytical context and cannot be analyzed as operational failure telemetry.')
      return
    }

    setAnalysisBusy(dataset.id)
    setToast(null)
    try {
      const existing = (modelsQ.data ?? []).find((model) =>
        model.datasetId === dataset.id &&
        model.targetColumn === targetColumn &&
        model.status !== 'Rejected',
      )
      const model = existing ?? await api.trainModel({
        name: `${dataset.name} operational analysis`,
        algorithm: 'Random Forest',
        datasetId: dataset.id,
        targetColumn,
      })
      const predictions = await api.predictDataset(model.id, dataset.id)
      const processed = await api.processDatasetPredictions(model.id, dataset.id)
      setAnalysisSummary((current) => ({
        ...current,
        [dataset.id]: {
          modelName: `${model.name} ${model.version}`,
          predictions: predictions.successfulPredictions,
          assessmentsCreated: processed.assessmentsCreated,
          assessmentsSkipped: processed.assessmentsSkipped,
          alertsCreated: processed.safetyAlertsCreated,
          alertsSkipped: processed.safetyAlertsSkipped,
          errors: processed.errors?.length ?? 0,
        },
      }))
      setToast(`Analyzed ${processed.eligibleRows} equipment rows from ${dataset.name}. Equipment assessments and qualifying alerts are now available to biomedical engineering.`)
      await Promise.all([q.reload(), modelsQ.reload()])
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Dataset analysis failed.')
    } finally {
      setAnalysisBusy(null)
    }
  }

  async function activateDataset(dataset: Dataset) {
    const current = (q.data ?? []).find((item) => item.isOperational)
    if (current && !window.confirm(`Switch active dataset?\n\nCurrent dataset:\n${current.name}\n\nNew dataset:\n${dataset.name}\n\nThe application will switch the current operational view to the selected dataset.`)) return
    setActivationBusy(dataset.id)
    try {
      await api.activateDataset(dataset.id)
      setToast(`${dataset.name} is now the active dataset.`)
      await q.reload()
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Dataset activation failed.')
    } finally {
      setActivationBusy(null)
    }
  }

  async function deleteDataset(dataset: Dataset) {
    if (!window.confirm(`Delete dataset?\n\nThis will remove "${dataset.name}" and its stored dataset-specific processing data. This action cannot be undone. Active or processed datasets are protected and may be rejected by the server.`)) return
    setBusy(true)
    try {
      await api.deleteDataset(dataset.id)
      setToast(`${dataset.name} was deleted.`)
      await q.reload()
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Dataset deletion failed.')
    } finally {
      setBusy(false)
    }
  }

  async function onFiles(selected: FileList | null) {
    const files = selected ? Array.from(selected) : []
    if (!files.length) return
    const isKaggle = files.length === 3 && files.every((file) => /^(manufacturers|devices|events).*\.csv$/i.test(file.name))
    const file = files[0]
    const ok = isKaggle || file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    if (!ok) {
      setToast('Only CSV and Excel files compatible with the equipment predictive-maintenance schema are accepted.')
      return
    }

    setBusy(true)
    try {
      if (isKaggle) {
        await api.profileKaggleUpload(files)
        setToast('Kaggle historical dataset validated, activated, and synchronized from the three CSV files.')
      } else {
        await api.profileUpload(file)
        setToast('Dataset uploaded and profiled from the actual file contents.')
      }

      await q.reload()
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Dataset upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Datasets" question="Upload and profile equipment datasets before training." />
      {!canManage ? <p className="mb-4 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-muted">Read-only dataset access. Dataset administration is restricted to Hospital Administrators.</p> : null}
      {toast ? <p className="mb-4 rounded-md border border-line bg-canvas px-3 py-2 text-sm">{toast}</p> : null}
      <Card className="mb-4">
        <CardTitle>Upload dataset</CardTitle>
        <CardHint>Accepted formats: CSV, Excel. For the historical safety archive, select exactly manufacturers*.csv, devices*.csv, and events*.csv together.</CardHint>
        {canManage ? <label className="mt-3 block">
          <span className="sr-only">Choose file</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
          />
        </label> : <p className="mt-3 text-sm text-muted">Dataset administration is restricted to Hospital Administrators. You can review available dataset intelligence here.</p>}
        {busy ? <p className="mt-2 text-sm text-muted">Profiling dataset…</p> : null}
      </Card>
      {!q.data.length ? <EmptyState title="No datasets uploaded yet." /> : null}
      <div className="space-y-4">
        {q.data.map((d) => (
          <Card key={d.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-lg text-navy">{d.name}</h2>
                <p className="text-sm text-muted">{d.format.toUpperCase()}</p>
                <p className="mt-1 text-sm font-medium">{d.isOperational ? 'ACTIVE' : 'AVAILABLE'}</p>
              </div>
              {d.datasetType === 'HISTORICAL_SAFETY' ? <p className="mt-3 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-muted">Historical safety archive · analytical context only · blocked from future telemetry failure-prediction training.</p> : null}
              <StatusBadge label={d.status} tone={d.status === 'Ready' || d.status === 'Configured' ? 'healthy' : 'info'} />
            </div>
            <p className="mt-3 text-sm">
              Dataset detected · {d.profile.rows.toLocaleString()} records · {d.profile.columns} columns
            </p>
            <DatasetIntelligence profile={d.profile} />
            {aiCapability?.datasetId === d.id ? <AICapabilitySummary result={aiCapability} /> : null}
            {assessment?.equipmentId.startsWith(`dataset:${d.id}`) ? <UnifiedAssessmentSummary result={assessment} /> : null}
            {canManage ? <Button
              className="mt-4"
              variant="outline"
              onClick={async () => {
                try {
                  setAiCapability(await api.getDatasetAICapabilities(d.id))
                } catch (error) {
                  setToast(error instanceof Error ? error.message : 'AI capability assessment failed.')
                }
              }}
            >
              Review AI capability
            </Button> : null}
            {canManage && d.datasetType !== 'HISTORICAL_SAFETY' ? <Button
              className="mt-2"
              disabled={analysisBusy !== null}
              onClick={() => void analyzeDataset(d)}
            >
              {analysisBusy === d.id ? 'Training & analyzing…' : d.profile.potentialTarget ? 'Train & analyze dataset' : 'Analyze dataset capability'}
            </Button> : null}
            {analysisSummary[d.id] ? (
              <div className="mt-3 rounded-md border border-healthy/30 bg-healthy-bg px-3 py-2 text-sm">
                <p className="font-medium text-navy">Dataset analysis complete</p>
                <p className="mt-1 text-muted">
                  Model: {analysisSummary[d.id].modelName} · {analysisSummary[d.id].predictions.toLocaleString()} predictions · {analysisSummary[d.id].assessmentsCreated.toLocaleString()} new assessments · {analysisSummary[d.id].alertsCreated.toLocaleString()} new alerts
                </p>
                {analysisSummary[d.id].assessmentsSkipped || analysisSummary[d.id].alertsSkipped ? (
                  <p className="mt-1 text-muted">Repeat-safe reconciliation skipped {analysisSummary[d.id].assessmentsSkipped} existing assessments and {analysisSummary[d.id].alertsSkipped} existing alerts.</p>
                ) : null}
                {analysisSummary[d.id].errors ? <p className="mt-1 text-warning">{analysisSummary[d.id].errors} rows could not be converted into operational assessments.</p> : null}
              </div>
            ) : null}
            {canManage ? <Button
              className="mt-2"
              variant="outline"
              onClick={async () => {
                try {
                  setAssessment(await api.assessDatasetRow(d.id))
                } catch (error) {
                  setToast(error instanceof Error ? error.message : 'Dataset-aware assessment failed.')
                }
              }}
            >
              Assess first dataset row
            </Button> : null}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <KV k="Numerical columns" v={String(d.profile.numericalColumns)} />
              <KV k="Categorical columns" v={String(d.profile.categoricalColumns)} />
              <KV k="Missing values" v={`${d.profile.missingValuePercent}%`} />
              <KV k="Duplicates" v={String(d.profile.duplicates)} />
            </dl>
            <p className="mt-3 text-sm">
              Potential target: <span className="font-medium">{d.profile.potentialTarget ?? 'Not detected'}</span>
            </p>
            {d.profile.columnDetails?.length ? (
              <div className="mt-3 text-sm">
                <p className="font-medium">Detected columns</p>
                <p className="text-muted">
                  {d.profile.columnDetails.map((column) => `${column.name} (${column.type}, ${column.uniqueCount} unique)`).join(' · ')}
                </p>
              </div>
            ) : null}
            {d.profile.detectedMapping?.length ? (
              <MappingSummary mapping={d.profile.detectedMapping} />
            ) : null}
            {d.profile.previewRows?.length ? (
              <div className="mt-3 overflow-auto text-xs">
                <p className="mb-1 text-sm font-medium">Preview</p>
                <pre className="rounded-md bg-canvas p-2">{JSON.stringify(d.profile.previewRows.slice(0, 3), null, 2)}</pre>
              </div>
            ) : null}
            {d.profile.warnings.map((warning: string) => (
              <p key={warning} className="mt-1 text-sm text-warning">
                {warning}
              </p>
            ))}
            {canManage ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {!d.isOperational ? <Button variant="outline" disabled={activationBusy !== null} onClick={() => void activateDataset(d)}>{activationBusy === d.id ? 'Activating…' : 'Activate dataset'}</Button> : null}
                {d.datasetType !== 'HISTORICAL_SAFETY' ? <Button variant="outline" onClick={() => setConfigure(d)}>Configure dataset</Button> : null}
                <Button variant="outline" onClick={() => void deleteDataset(d)}>Delete dataset</Button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      {configure ? (
        <ConfigurePanel
          dataset={configure}
          onClose={() => setConfigure(null)}
          onSaved={() => {
            setConfigure(null)
            setToast('Column mapping saved. Dataset is ready for preprocessing.')
            q.reload()
          }}
        />
      ) : null}
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

function DatasetIntelligence({ profile }: { profile: Dataset['profile'] }) {
  const capabilities = profile.capabilities
  const labels: Array<[keyof DatasetCapabilities, string]> = [
    ['equipmentIdentification', 'Equipment identification'],
    ['telemetryAnalysis', 'Telemetry analysis'],
    ['anomalyDetection', 'Anomaly detection'],
    ['conditionAssessment', 'Condition assessment'],
    ['failurePrediction', 'Supervised failure prediction'],
    ['maintenanceAnalysis', 'Maintenance analysis'],
    ['historicalSafetyIntelligence', 'Historical safety intelligence'],
  ]
  if (!capabilities && !profile.compatibility) return null
  const compatibilityLabel = profile.compatibility === 'REJECTED'
    ? 'Rejected'
    : profile.compatibility === 'COMPATIBLE_WITH_LIMITATIONS'
      ? 'Compatible with limitations'
      : 'Compatible'
  return (
    <div className="mt-4 rounded-md border border-line bg-canvas p-3">
      <p className="text-sm font-semibold text-navy">Dataset intelligence</p>
      <p className="mt-1 text-sm">
        Compatibility: <span className="font-medium">{compatibilityLabel}</span>
      </p>
      {capabilities ? (
        <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
          {labels.map(([key, label]) => (
            <span key={key} className={capabilities[key] ? 'text-success' : 'text-muted'}>
              {capabilities[key] ? '✓' : '—'} {label}
            </span>
          ))}
        </div>
      ) : null}
      {profile.suspiciousColumns?.length ? (
        <p className="mt-2 text-sm text-warning">Sensitive-looking columns require review: {profile.suspiciousColumns.join(', ')}</p>
      ) : null}
    </div>
  )
}

function MappingSummary({ mapping }: { mapping: DetectedColumnMapping[] }) {
  const label = (field?: string) => field ? field.replaceAll('_', ' ') : 'Unknown'
  return (
    <div className="mt-4 overflow-auto">
      <p className="mb-2 text-sm font-medium">Detected column mapping</p>
      <table className="min-w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="px-2 py-1">Source column</th>
            <th className="px-2 py-1">Detected type</th>
            <th className="px-2 py-1">MediGuard meaning</th>
            <th className="px-2 py-1">Confidence</th>
            <th className="px-2 py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {mapping.map((item) => (
            <tr key={item.sourceColumn} className="border-t border-line">
              <td className="px-2 py-1">{item.sourceColumn}</td>
              <td className="px-2 py-1">{item.detectedType}</td>
              <td className="px-2 py-1 capitalize">{label(item.canonicalField)}</td>
              <td className="px-2 py-1">{item.confidence === null ? '—' : `${Math.round(item.confidence * 100)}%`}</td>
              <td className="px-2 py-1">
                <span className={item.status === 'MAPPED' ? 'text-success' : 'text-muted'}>
                  {item.status === 'MAPPED' ? 'Mapped' : 'Unmapped'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AICapabilitySummary({ result }: { result: DatasetAICapabilities }) {
  return (
    <div className="mt-4 rounded-md border border-line bg-canvas p-3">
      <p className="text-sm font-semibold text-navy">AI capability assessment</p>
      <p className="mt-1 text-sm">Recommended mode: <span className="font-medium">{result.recommendedMode.replaceAll('_', ' ')}</span></p>
      <p className="mt-1 text-sm text-muted">{result.reason}</p>
      {result.selectedModel ? (
        <p className="mt-2 text-sm">
          Selected model: <span className="font-medium">{result.selectedModel.name} {result.selectedModel.version}</span>
          {' '}({result.selectedModel.trainingDataType || 'unspecified training data'}, {result.selectedModel.isOperational ? 'operational' : 'historical/non-operational'})
        </p>
      ) : null}
      {result.limitations.map((limitation) => <p key={limitation} className="mt-1 text-sm text-warning">{limitation}</p>)}
    </div>
  )
}

function UnifiedAssessmentSummary({ result }: { result: UnifiedDatasetAssessment }) {
  return (
    <div className="mt-4 rounded-md border border-line bg-canvas p-3">
      <p className="text-sm font-semibold text-navy">Unified AI assessment</p>
      <p className="mt-1 text-sm">AI mode: <span className="font-medium">{result.aiMode.replaceAll('_', ' ')}</span></p>
      <p className="text-sm">Equipment: {result.equipmentName} · {result.equipmentType}</p>
      <p className="text-sm">Condition: {result.condition} · Health score: {result.healthScore ?? 'Unavailable'}</p>
      <p className="text-sm">Failure risk: {result.failureRisk === null ? 'Unavailable' : `${result.failureRisk.toFixed(1)}%`} · Anomaly: {result.anomalyDetected ? 'Detected' : 'Not detected'}</p>
      <p className="text-sm">Maintenance priority: {result.maintenancePriority} · {result.priorityReason}</p>
      {result.selectedModel ? <p className="text-sm">Model: {result.selectedModel.name} {result.selectedModel.version} · {result.selectedModel.algorithm} · {result.selectedModel.isValidated ? 'Validated artifact' : 'Not validated'}</p> : null}
      <p className="mt-1 text-xs text-muted">{result.dataLabel}</p>
      {result.reasons.map((reason) => <p key={reason} className="mt-1 text-sm">• {reason}</p>)}
      {result.limitations.map((limitation) => <p key={limitation} className="mt-1 text-sm text-warning">{limitation}</p>)}
    </div>
  )
}

function ConfigurePanel({ dataset, onClose, onSaved }: { dataset: Dataset; onClose: () => void; onSaved: () => void }) {
  const [mapping, setMapping] = useState<ColumnMapping>(dataset.mapping ?? {})
  return (
    <Card className="mt-4">
      <CardTitle>Configure {dataset.name}</CardTitle>
      <CardHint>Map source columns to the required predictive-maintenance schema. Arbitrary unrelated datasets are not supported.</CardHint>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {mapFields.map((f) => (
          <Field key={f.key} label={f.label}>
            <Select
              value={mapping[f.key] ?? ''}
              onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}
            >
              <option value="">Not mapped</option>
              {dataset.profile.columnNames.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          onClick={async () => {
            await api.configureDataset(dataset.id, mapping)
            onSaved()
          }}
        >
          Save mapping
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}
