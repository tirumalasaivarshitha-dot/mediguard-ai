import { useMemo, useState, type FormEvent } from 'react'
import { api } from '@/services/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { AssessmentResult } from '@/components/assessment/AssessmentResult'
import { Disclaimer } from '@/components/ui/Disclaimer'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { HistoricalSafetyAssessment, ManualAssessmentInput, RiskAssessment, UnifiedDatasetAssessment } from '@/types'
import { useQuery } from '@/hooks/useQuery'

export function AssessmentPage() {
  const equipment = useQuery(() => api.listEquipment({ operationalDataset: true }))
  const historicalEquipment = useQuery(() => api.listEquipment({ historicalOnly: true }))
  const [source, setSource] = useState<'manual' | 'equipment' | 'historical' | 'synthetic'>('manual')
  const [form, setForm] = useState<ManualAssessmentInput>({
    equipmentType: 'MRI Scanner',
    temperature: 51,
    vibration: 2.8,
    powerKw: 14.2,
    operatingHours: 8421,
    errorCount: 7,
    lastMaintenanceDaysAgo: 45,
    department: 'Radiology',
    equipmentId: 'MRI-042',
  })
  const [result, setResult] = useState<RiskAssessment | null>(null)
  const [datasetResult, setDatasetResult] = useState<UnifiedDatasetAssessment | null>(null)
  const [historicalResult, setHistoricalResult] = useState<HistoricalSafetyAssessment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const selectedEquipment = useMemo(
    () => (equipment.data ?? []).find((item) => item.id === form.equipmentId),
    [equipment.data, form.equipmentId],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      setHistoricalResult(null)
      setDatasetResult(null)
      if (source === 'historical' && form.equipmentId) {
        setHistoricalResult(await api.getHistoricalAssessment(form.equipmentId))
        setResult(null)
      } else if (source === 'equipment' && form.equipmentId) {
        if (!selectedEquipment?.sourceDatasetId) {
          throw new Error('Selected equipment is not associated with a supported operational dataset.')
        }
        setDatasetResult(await api.assessDatasetRow(
          selectedEquipment.sourceDatasetId,
          selectedEquipment.sourceRowIndex ?? 0,
          selectedEquipment.id,
        ))
        setResult(null)
      } else {
        setResult(await api.analyzeManual({ ...form, source: source === 'synthetic' ? 'synthetic' : 'manual' } as ManualAssessmentInput))
      }
      setSuccess(true)
    } catch (assessmentError) {
      setError(assessmentError instanceof Error ? assessmentError.message : 'Unable to complete the assessment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader title="AI Assistant" question="What does the current operational AI understand about this equipment?" />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardTitle>Assessment input</CardTitle>
          <CardHint>Use a live record, typed readings, or clearly labelled synthetic values.</CardHint>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <Field label="Assessment type">
              <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                <option value="manual">Manual equipment input</option>
                <option value="equipment">Existing equipment record / telemetry</option>
                <option value="historical">Historical Safety Assessment</option>
                <option value="synthetic">Synthetic telemetry</option>
              </Select>
            </Field>
            {source === 'historical' ? (
              <Field label="Kaggle historical device">
                <Select
                  value={form.equipmentId}
                  onChange={(e) => setForm((f) => ({ ...f, equipmentId: e.target.value }))}
                >
                  <option value="">Select historical device</option>
                  {(historicalEquipment.data ?? []).map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.id} · {eq.equipmentType} · {eq.manufacturer}</option>
                  ))}
                </Select>
              </Field>
            ) : source !== 'manual' ? (
              <Field label="Equipment">
                <Select
                  value={form.equipmentId}
                  onChange={(e) => {
                    const eq = (equipment.data ?? []).find((x) => x.id === e.target.value)
                    setForm((f) => ({
                      ...f,
                      equipmentId: e.target.value,
                      equipmentType: eq?.equipmentType ?? f.equipmentType,
                      department: eq?.department ?? f.department,
                    }))
                  }}
                >
                  {(equipment.data ?? []).map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.id} · {eq.equipmentType}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Equipment type">
                <Select value={form.equipmentType} onChange={(e) => setForm({ ...form, equipmentType: e.target.value })}>
                  <option>MRI Scanner</option>
                  <option>CT Scanner</option>
                  <option>Ventilator</option>
                  <option>Patient Monitor</option>
                  <option>Defibrillator</option>
                  <option>Anesthesia Machine</option>
                  <option>Dialysis Machine</option>
                  <option>Infusion Pump</option>
                </Select>
              </Field>
            )}
            {source === 'equipment' ? (
              <div className="rounded-md border border-info/20 bg-info-bg px-3 py-2 text-xs text-info">
                Readings and model features will be loaded from the selected equipment&apos;s mapped dataset row.
                {selectedEquipment?.sourceDatasetName ? ` Dataset: ${selectedEquipment.sourceDatasetName}.` : ''}
              </div>
            ) : null}
            {source !== 'historical' && source !== 'equipment' ? <Field label="Temperature (°C)">
              <Input type="number" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })} />
            </Field> : null}
            {source !== 'historical' && source !== 'equipment' ? <Field label="Vibration (mm/s)">
              <Input type="number" step="0.1" value={form.vibration} onChange={(e) => setForm({ ...form, vibration: Number(e.target.value) })} />
            </Field> : null}
            {source !== 'historical' && source !== 'equipment' ? <Field label="Power (kW)">
              <Input type="number" step="0.1" value={form.powerKw} onChange={(e) => setForm({ ...form, powerKw: Number(e.target.value) })} />
            </Field> : null}
            {source !== 'historical' && source !== 'equipment' ? <Field label="Operating hours">
              <Input type="number" value={form.operatingHours} onChange={(e) => setForm({ ...form, operatingHours: Number(e.target.value) })} />
            </Field> : null}
            {source !== 'historical' && source !== 'equipment' ? <Field label="Error count">
              <Input type="number" value={form.errorCount} onChange={(e) => setForm({ ...form, errorCount: Number(e.target.value) })} />
            </Field> : null}
            {source !== 'historical' && source !== 'equipment' ? <Field label="Last maintenance (days ago)">
              <Input
                type="number"
                value={form.lastMaintenanceDaysAgo}
                onChange={(e) => setForm({ ...form, lastMaintenanceDaysAgo: Number(e.target.value) })}
              />
            </Field> : null}
            {source !== 'historical' && source !== 'equipment' ? <Field label="Department">
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </Field> : null}
            {source === 'historical' ? <StatusBadge label="Historical safety data" tone="info" /> : null}
            {source === 'synthetic' ? <StatusBadge label="Synthetic data" tone="info" /> : null}
            <Button type="submit" disabled={loading || (source === 'historical' && !form.equipmentId) || (source === 'equipment' && !selectedEquipment?.sourceDatasetId)} className="w-full">
              {loading ? 'Analyzing…' : 'Analyze equipment'}
            </Button>
            {success ? <p className="text-sm text-healthy">Assessment complete.</p> : null}
            {error ? <p className="text-sm text-critical">{error}</p> : null}
          </form>
        </Card>
        <div className="lg:col-span-3">
          {historicalResult ? (
            <Card>
              <CardTitle>Historical Safety Intelligence</CardTitle>
              <CardHint>HISTORICAL SAFETY DATA · not live telemetry or an operational alert source</CardHint>
              <div className="mt-4 flex items-center gap-3">
                <StatusBadge label={historicalResult.prediction.riskLevel} tone={historicalResult.prediction.riskLevel === 'HIGH' ? 'critical' : historicalResult.prediction.riskLevel === 'MEDIUM' ? 'warning' : 'healthy'} />
                <span className="text-sm text-muted">{historicalResult.prediction.recurrenceProbability === null ? 'Risk unavailable' : `${Math.round(historicalResult.prediction.recurrenceProbability * 100)}% recurrence probability`}</span>
              </div>
              <p className="mt-4 text-sm"><strong>Target:</strong> {historicalResult.model.targetDefinition}</p>
              <p className="mt-2 text-sm"><strong>Model:</strong> {historicalResult.model.algorithm} · {historicalResult.model.version}</p>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">{historicalResult.prediction.explanation.map((item) => <li key={item}>{item}</li>)}</ul>
              <p className="mt-4 text-sm text-muted">{historicalResult.operationalAction}</p>
              <p className="mt-4 rounded-md border border-line bg-canvas px-3 py-2 text-xs text-muted">{historicalResult.disclaimer}</p>
            </Card>
          ) : datasetResult ? (
            <DatasetAssessmentResult result={datasetResult} />
          ) : result ? (
            <AssessmentResult result={result} />
          ) : (
            <Card>
              <CardTitle>Results</CardTitle>
              <p className="mt-3 text-sm text-muted">Run an analysis to see health, failure risk, anomalies, and recommended action.</p>
              <div className="mt-6">
                <Disclaimer />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function DatasetAssessmentResult({ result }: { result: UnifiedDatasetAssessment }) {
  const failureRisk = result.failureRisk
  const riskLabel = result.riskLevel === 'UNKNOWN' ? 'Unavailable' : result.riskLevel
  return (
    <Card>
      <CardTitle>Dataset-aware assessment</CardTitle>
      <CardHint>{result.dataLabel} · {result.aiMode.replaceAll('_', ' ')}</CardHint>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Equipment</p>
          <p className="mt-1 text-sm text-navy">{result.equipmentName} · {result.equipmentType}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Failure risk</p>
          <p className="mt-1 text-sm text-navy">{failureRisk === null ? 'Unavailable for this dataset' : `${failureRisk.toFixed(1)}%`}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Risk / condition</p>
          <StatusBadge label={`${riskLabel} · ${result.condition}`} tone={failureRisk === null ? 'info' : failureRisk >= 75 ? 'critical' : failureRisk >= 50 ? 'warning' : 'healthy'} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Selected model</p>
          <p className="mt-1 text-sm text-navy">
            {result.selectedModel ? `${result.selectedModel.name} · ${result.selectedModel.version}` : 'No compatible operational model'}
          </p>
          {result.selectedModel?.datasetName ? <p className="text-xs text-muted">Dataset: {result.selectedModel.datasetName}</p> : null}
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <InfoList title="Why this assessment?" items={result.reasons} />
        <InfoList title="Recommended action" items={result.recommendedActions} />
        {result.limitations.length ? <InfoList title="Limitations" items={result.limitations} muted /> : null}
      </div>
    </Card>
  )
}

function InfoList({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div>
      <p className="text-sm font-semibold text-navy">{title}</p>
      <ul className={`mt-1 list-disc space-y-1 pl-5 text-sm ${muted ? 'text-muted' : 'text-ink'}`}>
        {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>No information recorded.</li>}
      </ul>
    </div>
  )
}
