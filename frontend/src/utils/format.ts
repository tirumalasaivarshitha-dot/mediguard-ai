import { bandFor, healthBands, priorityBands, riskBands } from '@/config/thresholds'
import type { HealthStatusLabel, RiskLevel, Tone } from '@/types'

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatPercent(n: number, digits = 0) {
  return `${n.toFixed(digits)}%`
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function daysSince(isoDate: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000))
}

export function relativeTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(delta / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function healthInterpretation(score: number): { label: HealthStatusLabel; tone: Tone } {
  const band = bandFor(score, healthBands)
  return { label: band.label as HealthStatusLabel, tone: band.tone }
}

export function riskInterpretation(risk: number): { label: RiskLevel; tone: Tone } {
  const band = bandFor(risk, riskBands)
  return { label: band.label as RiskLevel, tone: band.tone }
}

export function priorityInterpretation(score: number) {
  const band = bandFor(score, priorityBands)
  return { label: band.label as 'Low' | 'Routine' | 'Elevated' | 'Urgent', tone: band.tone }
}

export function toneClasses(tone: Tone) {
  switch (tone) {
    case 'healthy':
      return { text: 'text-healthy', bg: 'bg-healthy-bg', border: 'border-healthy/20', dot: 'bg-healthy' }
    case 'warning':
      return { text: 'text-warning', bg: 'bg-warning-bg', border: 'border-warning/25', dot: 'bg-warning' }
    case 'high':
      return { text: 'text-high', bg: 'bg-high-bg', border: 'border-high/25', dot: 'bg-high' }
    case 'critical':
      return { text: 'text-critical', bg: 'bg-critical-bg', border: 'border-critical/25', dot: 'bg-critical' }
    case 'info':
      return { text: 'text-info', bg: 'bg-info-bg', border: 'border-info/20', dot: 'bg-info' }
    default:
      return { text: 'text-muted', bg: 'bg-canvas', border: 'border-line', dot: 'bg-muted' }
  }
}

export function operationalLabel(status: string) {
  switch (status) {
    case 'operational':
      return 'Operational'
    case 'attention':
      return 'Attention required'
    case 'degraded':
      return 'Degraded'
    case 'offline':
      return 'Offline'
    case 'maintenance':
      return 'Under maintenance'
    default:
      return status
  }
}
