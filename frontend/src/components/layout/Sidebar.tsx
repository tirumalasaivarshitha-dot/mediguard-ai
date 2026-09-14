import { Hospital, Menu, ShieldPlus } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS, normalizeUserRole } from '@/config/navigation'
import { HOSPITAL_NAME, PRODUCT_NAME, PRODUCT_TAGLINE } from '@/config/app'
import { useAuth } from '@/hooks/useAuth'
import { ConnectionStatus } from '@/components/ui/ConnectionStatus'
import { cn } from '@/utils/format'
import type { ReactNode } from 'react'

export function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { user } = useAuth()
  const role = user ? normalizeUserRole(user.role) : null
  const items = NAV_ITEMS.filter((i) => role && i.roles.includes(role))
  const dashboardByRole = role ? {
    hospital_admin: '/dashboard/admin',
    biomedical_engineer: '/dashboard/biomedical',
    maintenance_technician: '/dashboard/technician',
  } : null
  const dashboardPath = role && dashboardByRole ? dashboardByRole[role] : '/'
  const main = items.filter((i) => i.section === 'main')
  const mgmt = items.filter((i) => i.section === 'management')
  const bottom = items.filter((i) => i.section === 'bottom')

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center rounded-md border-l-2 px-3 py-2 text-sm transition-colors',
      isActive ? 'border-teal bg-white/10 font-semibold text-white' : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white',
    )

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-navy text-white transition-all duration-200',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      <div className={cn('flex items-center gap-3 border-b border-white/10 px-4 py-5', collapsed && 'justify-center px-2')}>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal" aria-hidden>
          <ShieldPlus className="h-5 w-5" />
        </div>
        {!collapsed ? (
          <div>
            <p className="font-serif text-lg leading-tight">{PRODUCT_NAME}</p>
            <p className="text-[11px] tracking-wide text-white/60">{PRODUCT_TAGLINE}</p>
          </div>
        ) : null}
      </div>
      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Primary">
        <NavGroup label="Main" collapsed={collapsed}>
          {main.map((i) => (
            <NavLink key={i.to} to={i.to === '/' ? dashboardPath : i.to} end={i.to === '/'} className={linkClass} onClick={onNavigate} title={i.label}>
              {collapsed ? <span className="mx-auto text-xs">{i.label.slice(0, 2)}</span> : i.label}
            </NavLink>
          ))}
        </NavGroup>
        {mgmt.length ? (
          <NavGroup label="Management" collapsed={collapsed}>
            {mgmt.map((i) => (
              <NavLink key={i.to} to={i.to} className={linkClass} onClick={onNavigate} title={i.label}>
                {collapsed ? <span className="mx-auto text-xs">{i.label.slice(0, 2)}</span> : i.label}
              </NavLink>
            ))}
          </NavGroup>
        ) : null}
      </nav>
      <div className="border-t border-white/10 px-3 py-3">
        {bottom.map((i) => (
          <NavLink key={i.to} to={i.to} className={linkClass} onClick={onNavigate} title={i.label}>
            {collapsed ? <span className="mx-auto text-xs">{i.label.slice(0, 2)}</span> : i.label}
          </NavLink>
        ))}
        {!collapsed ? (
          <p className="mt-3 px-3 text-[11px] leading-snug text-white/45">{HOSPITAL_NAME}</p>
        ) : null}
      </div>
    </aside>
  )
}

function NavGroup({ label, collapsed, children }: { label: string; collapsed: boolean; children: ReactNode }) {
  return (
    <div>
      {!collapsed ? <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</p> : null}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth()
  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <button type="button" className="rounded-md p-2 text-navy hover:bg-canvas lg:hidden" onClick={onMenu} aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden items-center gap-2 text-sm text-muted md:flex">
          <Hospital className="h-4 w-4" aria-hidden />
          {HOSPITAL_NAME}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ConnectionStatus />
        <div className="text-right">
          <p className="text-sm font-medium text-navy">{user?.name}</p>
          <p className="text-xs text-muted">{user?.role.replaceAll('_', ' ')}</p>
        </div>
        <button type="button" className="text-sm text-slate-blue hover:underline" onClick={logout}>
          Sign out
        </button>
      </div>
    </header>
  )
}
