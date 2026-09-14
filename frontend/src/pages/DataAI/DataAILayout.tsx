import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/utils/format'
import { useAuth } from '@/hooks/useAuth'

const links = [
  { to: '/data-ai', label: 'Overview', end: true },
  { to: '/data-ai/datasets', label: 'Datasets' },
  { to: '/data-ai/telemetry', label: 'Telemetry' },
  { to: '/data-ai/training', label: 'Model training' },
  { to: '/data-ai/evaluation', label: 'Model evaluation' },
]

export function DataAILayout() {
  const { user } = useAuth()
  const visibleLinks = links.filter((link) => user?.role === 'hospital_admin' || !['/data-ai/training', '/data-ai/evaluation'].includes(link.to))
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {visibleLinks.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              cn('px-3 py-2 text-sm font-medium', isActive ? 'border-b-2 border-teal text-navy' : 'text-muted hover:text-navy')
            }
          >
            {l.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
