import { healthInterpretation } from '@/utils/format'
import { StatusBadge } from '@/components/ui/StatusBadge'

export function HealthScore({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const { label, tone } = healthInterpretation(score)
  const num = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-xl' : 'text-3xl'
  return (
    <div>
      <div className="flex items-end gap-2">
        <span className={`font-serif font-semibold leading-none text-navy ${num}`}>{score}</span>
        <span className="text-sm text-muted">/ 100</span>
      </div>
      <div className="mt-2">
        <StatusBadge label={label} tone={tone} />
      </div>
    </div>
  )
}
