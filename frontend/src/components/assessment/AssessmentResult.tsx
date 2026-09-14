import { Check } from 'lucide-react'
import type { RiskAssessment } from '@/types'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { HealthScore } from '@/components/ui/HealthScore'
import { RiskMeter } from '@/components/ui/RiskMeter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ContributionBars } from '@/components/charts/ContributionBars'
import { Disclaimer } from '@/components/ui/Disclaimer'
import { operationalLabel, priorityInterpretation } from '@/utils/format'

export function AssessmentResult({ result }: { result: RiskAssessment }) {
  const p = priorityInterpretation(result.maintenancePriority)
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">Equipment health</p>
          <div className="mt-2">
            <HealthScore score={result.healthScore} />
          </div>
        </Card>
        <Card>
          <p className="text-sm text-muted">Failure risk</p>
          <div className="mt-2">
            <RiskMeter risk={result.failureRisk} />
          </div>
          <p className="mt-3 text-sm text-muted">
            {result.failureRisk >= 50 ? 'Elevated failure risk detected.' : 'Failure risk is within the lower configured bands.'}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Operational status</p>
          <div className="mt-3">
            <StatusBadge
              label={operationalLabel(result.operationalStatus)}
              tone={result.operationalStatus === 'operational' ? 'healthy' : result.operationalStatus === 'degraded' ? 'critical' : 'warning'}
            />
          </div>
          <p className="mt-4 text-sm text-muted">Safety status</p>
          <div className="mt-2">
            <StatusBadge
              label={result.safetyStatus}
              tone={result.safetyStatus === 'Normal' ? 'healthy' : result.safetyStatus === 'Safety Event' ? 'critical' : 'warning'}
            />
          </div>
        </Card>
        <Card>
          <p className="text-sm text-muted">Maintenance priority</p>
          <p className="mt-2 font-serif text-3xl text-navy">{result.maintenancePriority}<span className="text-base text-muted"> / 100</span></p>
          <div className="mt-2">
            <StatusBadge label={p.label} tone={p.tone} />
          </div>
          <p className="mt-3 text-sm text-ink">{result.recommendedAction}</p>
        </Card>
      </div>

      {(result.failureRisk >= 40 || result.maintenancePriority >= 40) && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-warning bg-warning-bg/40 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-warning/20 p-2 text-warning">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-navy">Elevated Failure Risk Detected ({result.failureRisk}%)</p>
              <p className="text-xs text-muted">
                {result.recommendedAction || 'Biomedical engineering intervention is recommended to prevent unexpected equipment downtime.'}
              </p>
            </div>
          </div>
          <a
            href={`/maintenance?create=true&equipmentId=${encodeURIComponent(result.equipmentId)}&priority=${result.failureRisk >= 75 ? 'Urgent' : 'Elevated'}&notes=${encodeURIComponent(result.recommendedAction)}`}
            className="inline-flex items-center justify-center rounded-md bg-navy px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-blue transition-colors"
          >
            Create Work Order
          </a>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Why this assessment?</CardTitle>
          <CardHint>Statements are derived from the current readings against configured expected ranges.</CardHint>
          <ul className="mt-4 space-y-2">
            {result.explanations.map((e) => (
              <li key={e} className="flex gap-2 text-sm text-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-navy">Anomaly status</p>
            <StatusBadge
              label={result.anomalyLevel}
              tone={result.anomalyLevel === 'Normal' ? 'healthy' : result.anomalyLevel === 'Severe Anomaly' ? 'critical' : 'warning'}
            />
            {result.anomalies.length ? (
              <ul className="mt-3 space-y-2 text-sm text-ink">
                {result.anomalies.map((a) => (
                  <li key={a.metric}>
                    <span className="font-medium">{a.metric}:</span> {a.summary}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No abnormal behavior detected relative to the expected ranges.</p>
            )}
          </div>
        </Card>
        <Card>
          <CardTitle>Why is the risk at this level?</CardTitle>
          <CardHint>Contribution is based on current readings versus expected ranges for this equipment type. Values are not fabricated SHAP scores.</CardHint>
          <div className="mt-4">
            <ContributionBars items={result.contributions} />
          </div>
        </Card>
      </div>
      <Disclaimer compact />
      <Card>
        <p className="text-sm font-medium text-navy">Prediction model</p>
        <p className="mt-1 text-sm">{result.modelVersion || result.modelId}</p>
        <p className="text-sm text-muted">{result.modelDataset ? `Dataset: ${result.modelDataset}` : 'Demo operational model'}</p>
        {result.modelTrainingDataType ? <p className="text-sm text-muted">Training data: {result.modelTrainingDataType}</p> : null}
        <p className="mt-1 text-xs text-muted">{result.modelDisclaimer || 'DEMO MODEL — NOT CLINICALLY VALIDATED'}</p>
      </Card>
    </div>
  )
}
