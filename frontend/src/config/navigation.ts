export type UserRole =
  | 'hospital_admin'
  | 'biomedical_engineer'
  | 'maintenance_technician'

export type NavItem = {
  to: string
  label: string
  section: 'main' | 'management' | 'bottom'
  roles: UserRole[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    section: 'main',
    roles: ['hospital_admin', 'biomedical_engineer', 'maintenance_technician'],
  },
  {
    to: '/safety',
    label: 'Safety Center',
    section: 'main',
    roles: ['hospital_admin', 'biomedical_engineer'],
  },
  {
    to: '/analytics',
    label: 'Analytics & Reports',
    section: 'main',
    roles: ['hospital_admin', 'biomedical_engineer'],
  },
  {
    to: '/history',
    label: 'History',
    section: 'main',
    roles: ['hospital_admin', 'biomedical_engineer', 'maintenance_technician'],
  },
  {
    to: '/data-ai',
    label: 'Data & AI',
    section: 'management',
    roles: ['hospital_admin', 'biomedical_engineer'],
  },
  {
    to: '/equipment',
    label: 'Equipment',
    section: 'management',
    roles: ['hospital_admin', 'biomedical_engineer'],
  },
  {
    to: '/equipment/assigned',
    label: 'Equipment',
    section: 'management',
    roles: ['maintenance_technician'],
  },
  {
    to: '/assessment',
    label: 'AI Assistant',
    section: 'management',
    roles: ['hospital_admin', 'biomedical_engineer'],
  },
  {
    to: '/alerts',
    label: 'Alerts',
    section: 'management',
    roles: ['hospital_admin', 'biomedical_engineer', 'maintenance_technician'],
  },
  {
    to: '/maintenance',
    label: 'Maintenance',
    section: 'management',
    roles: ['hospital_admin', 'biomedical_engineer'],
  },
  {
    to: '/maintenance/my-tasks',
    label: 'Maintenance',
    section: 'management',
    roles: ['maintenance_technician'],
  },
  {
    to: '/notifications',
    label: 'Notifications',
    section: 'bottom',
    roles: ['hospital_admin', 'biomedical_engineer', 'maintenance_technician'],
  },
  {
    to: '/settings',
    label: 'Settings',
    section: 'bottom',
    roles: ['hospital_admin', 'biomedical_engineer'],
  },
]

export const ROLE_LABEL: Record<UserRole, string> = {
  hospital_admin: 'Hospital Administrator',
  biomedical_engineer: 'Biomedical Engineer',
  maintenance_technician: 'Maintenance Technician',
}

export function normalizeUserRole(role: string): UserRole | null {
  const normalized = role.trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'hospital_admin') return 'hospital_admin'
  if (normalized === 'biomedical_engineer') return 'biomedical_engineer'
  if (normalized === 'maintenance_technician' || normalized === 'technician') return 'maintenance_technician'
  return null
}
