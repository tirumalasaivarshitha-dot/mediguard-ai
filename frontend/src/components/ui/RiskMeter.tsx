import { riskInterpretation, formatPercent } from '@/utils/format'
import { StatusBadge } from '@/components/ui/StatusBadge'

export function RiskMeter({ risk }: { risk: number }) {
  const { label, tone } = riskInterpretation(risk)
  return (
    <div>
      <div className="flex items-end gap-2">
        <span className="font-serif text-3xl font-semibold leading-none text-navy">{formatPercent(risk)}</span>
      </div>
      <div className="mt-2">
        <StatusBadge label={`${label} risk`} tone={tone} />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className="h-full rounded-full bg-navy transition-all duration-500"
          style={{ width: `${Math.min(100, risk)}%` }}
        />
      </div>
    </div>
  )
}
