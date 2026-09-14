import { DISCLAIMER } from '@/config/app'

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`text-muted ${compact ? 'text-xs leading-relaxed' : 'text-sm leading-relaxed'}`}>{DISCLAIMER}</p>
  )
}
