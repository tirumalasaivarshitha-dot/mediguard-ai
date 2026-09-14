import type { FeatureContribution } from '@/types'

export function ContributionBars({ items }: { items: FeatureContribution[] }) {
  const max = Math.max(...items.map((i) => i.contribution), 1)
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.feature}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-navy">{item.feature}</span>
            <span className="text-muted">{item.note}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-slate-blue transition-all duration-500"
              style={{ width: `${(item.contribution / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
