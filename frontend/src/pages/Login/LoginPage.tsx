import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldPlus } from 'lucide-react'
import { PRODUCT_NAME, PRODUCT_TAGLINE, HOSPITAL_NAME } from '@/config/app'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Disclaimer } from '@/components/ui/Disclaimer'
import type { UserRole } from '@/types'
import { ROLE_LABEL } from '@/config/navigation'

export function LoginPage() {
  const { user, login } = useAuth()
  const [role, setRole] = useState<UserRole | ''>('')
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    if (!role) {
      setLoading(false)
      setErrorMsg('Select your employee role to continue.')
      return
    }
    const result = await login(employeeId, password, role)
    setLoading(false)
    if (!result.success && result.error) {
      setErrorMsg(result.error)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-canvas px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-line bg-surface shadow-[0_12px_40px_rgba(23,63,95,0.10)] md:grid-cols-2">
        <div className="bg-navy px-8 py-10 text-white md:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal">
              <ShieldPlus className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-2xl">{PRODUCT_NAME}</p>
              <p className="text-sm text-white/70">{PRODUCT_TAGLINE}</p>
            </div>
          </div>
          <p className="mt-8 font-serif text-2xl leading-snug">
            Know the condition of your equipment, understand the risk, and act before patients are affected.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            <li>Monitor equipment health and telemetry</li>
            <li>Assess abnormal behavior and failure risk</li>
            <li>Assign the right biomedical engineer</li>
            <li>Track maintenance until equipment is safe to return</li>
          </ul>
          <p className="mt-10 text-xs text-white/50">{HOSPITAL_NAME}</p>
        </div>
        <form className="px-8 py-10" onSubmit={onSubmit}>
          <h1 className="font-serif text-2xl font-semibold text-navy">Sign in to MediGuard AI</h1>
          <p className="mt-1 text-sm text-muted">Use a hospital directory account. Role determines which modules you can access.</p>
          {errorMsg ? (
            <div className="mt-4 rounded-md border border-critical/20 bg-critical-bg px-3 py-2 text-sm text-critical">
              {errorMsg}
            </div>
          ) : null}
          <div className="mt-6 space-y-4">
            <Field label="Employee Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as UserRole | '')} required aria-label="Employee role">
                <option value="" disabled>Select your role</option>
                {(Object.keys(ROLE_LABEL) as UserRole[]).map((item) => (
                  <option key={item} value={item}>{ROLE_LABEL[item]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Employee ID">
              <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value.toUpperCase())} required autoComplete="username" />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
          </div>
          <Button type="submit" disabled={loading} className="mt-6 w-full">
            {loading ? 'Authenticating…' : 'Continue'}
          </Button>
          <p className="mt-6 text-xs text-muted">Access is provisioned by a hospital administrator. Contact your administrator if you need an account.</p>
          <div className="mt-6">
            <Disclaimer compact />
          </div>
        </form>
      </div>
    </div>
  )
}
