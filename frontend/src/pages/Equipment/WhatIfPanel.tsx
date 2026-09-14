import { useState } from 'react'
import { api } from '@/services/api'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { SimulationResult } from '@/types'

export function WhatIfPanel({ equipmentId }: { equipmentId: string }) {
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    try {
      setResult(await api.simulateWhatIf(equipmentId))
    } catch {
      setError('Unable to run the maintenance simulation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardTitle>What-if maintenance simulator</CardTitle>
      <CardHint>Estimate the effect of preventive maintenance. This is not a guaranteed result.</CardHint>
      <div className="mt-3">
        <StatusBadge label="Simulation / estimate" tone="info" />
      </div>
      <Button className="mt-4" variant="secondary" disabled={loading} onClick={run}>
        {loading ? 'Estimating…' : 'Simulate preventive maintenance'}
      </Button>
      {error ? <p className="mt-3 text-sm text-critical">{error}</p> : null}
      {result ? (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted">Current health</p>
            <p className="font-serif text-2xl text-navy">{result.currentHealth}</p>
          </div>
          <div>
            <p className="text-muted">Estimated health</p>
            <p className="font-serif text-2xl text-navy">{result.estimatedHealth}</p>
          </div>
          <div>
            <p className="text-muted">Current failure risk</p>
            <p className="font-serif text-2xl text-navy">{result.currentRisk}%</p>
          </div>
          <div>
            <p className="text-muted">Estimated failure risk</p>
            <p className="font-serif text-2xl text-navy">{result.estimatedRisk}%</p>
          </div>
          <p className="col-span-2 text-muted">
            Risk reduction {result.riskReductionPoints} points · Health improvement {result.healthImprovementPoints} points · Potential downtime
            reduction {result.potentialDowntimeReductionHours} hours
          </p>
          {result.notes.map((n) => (
            <p key={n} className="col-span-2 text-xs text-muted">
              {n}
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
