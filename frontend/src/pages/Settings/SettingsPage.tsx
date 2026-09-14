import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHint, CardTitle } from '@/components/ui/Card'
import { Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Disclaimer } from '@/components/ui/Disclaimer'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_LABEL } from '@/config/navigation'
import { HOSPITAL_NAME, PRODUCT_NAME, PRODUCT_TAGLINE } from '@/config/app'
import type { UserRole } from '@/types'

export function SettingsPage() {
  const { user, switchRole } = useAuth()
  const [selectedRole, setSelectedRole] = useState<UserRole>(user?.role ?? 'hospital_admin')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  function handleRoleSwitch(role: UserRole) {
    setSelectedRole(role)
    switchRole(role)
    setSavedMsg(`Active workspace role switched to ${ROLE_LABEL[role]}. Navigation updated.`)
    setTimeout(() => setSavedMsg(null), 3500)
  }

  return (
    <div>
      <PageHeader
        title="Settings & System Configuration"
        question="Manage workspace preferences, active persona, and system parameters."
      />

      {savedMsg ? (
        <div className="mb-4 rounded-md border border-healthy/20 bg-healthy-bg px-4 py-3 text-sm text-navy">
          {savedMsg}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Role-Based Persona Switcher</CardTitle>
          <CardHint>
            Test and evaluate the platform across all four hospital operational perspectives.
          </CardHint>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                Active User Persona
              </label>
              <Select
                value={selectedRole}
                onChange={(e) => handleRoleSwitch(e.target.value as UserRole)}
                aria-label="Select User Role Persona"
              >
                {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="rounded-md border border-line bg-canvas p-4 text-xs text-muted space-y-2">
              <p className="font-semibold text-navy">Role Privileges Summary:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong className="text-navy">Hospital Administrator:</strong> Full platform access, Data & AI management, executive analytics.
                </li>
                <li>
                  <strong className="text-navy">Biomedical Engineer:</strong> Equipment telemetry, AI assessment, safety center, live monitoring.
                </li>
                <li>
                  <strong className="text-navy">Maintenance Technician:</strong> My assigned equipment, task queue, work order updates.
                </li>
                <li>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Platform Environment & Health</CardTitle>
          <CardHint>System indicators and connected data channels.</CardHint>

          <dl className="mt-4 divide-y divide-line text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">Platform Name</dt>
              <dd className="font-medium text-navy">{PRODUCT_NAME}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">Tagline</dt>
              <dd className="text-ink">{PRODUCT_TAGLINE}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">Hospital Facility</dt>
              <dd className="font-medium text-navy">{HOSPITAL_NAME}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">Real-Time Telemetry Socket</dt>
              <dd>
                <StatusBadge label="Socket.IO Ready" tone="healthy" />
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">Synthetic Telemetry Generator</dt>
              <dd>
                <StatusBadge label="Active (Simulated)" tone="info" />
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">ML Model Pipeline</dt>
              <dd>
                <StatusBadge label="Random Forest v2.1 Active" tone="healthy" />
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Required Medical & Safety Disclaimer</CardTitle>
          <CardHint>
            Official compliance notice regarding AI-assisted equipment assessment.
          </CardHint>
          <div className="mt-4">
            <Disclaimer />
          </div>
        </Card>
      </div>
    </div>
  )
}
