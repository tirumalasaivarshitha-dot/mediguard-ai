import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar, TopBar } from '@/components/layout/Sidebar'
import { cn } from '@/utils/format'

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex min-h-svh bg-canvas">
      <div className="hidden lg:block">
        <div className="sticky top-0 h-svh">
          <Sidebar collapsed={collapsed} />
        </div>
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-navy/40" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full w-60">
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMobileOpen(true)} />
        <button
          type="button"
          className="hidden border-b border-line bg-surface px-4 py-1 text-left text-xs text-muted hover:text-navy lg:block"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? 'Expand navigation' : 'Collapse navigation'}
        </button>
        <main className={cn('page flex-1')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
