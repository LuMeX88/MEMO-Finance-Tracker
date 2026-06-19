import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart2, Calendar, Home, Settings, Tag, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import SpeedDial from '@/components/ui/SpeedDial'
import QuickAddModal from '@/components/transactions/QuickAddModal'

export default function AppLayout() {
  const t = useT()
  const { pathname } = useLocation()
  const showSpeedDial = pathname !== '/settings'

  const navItems = [
    { to: '/', label: t('nav.dashboard'), icon: Home, end: true },
    { to: '/schedules', label: t('nav.schedules'), icon: Calendar, end: false },
    { to: '/reports', label: t('nav.reports'), icon: BarChart2, end: false },
    { to: '/categories', label: t('nav.categories'), icon: Tag, end: false },
    { to: '/projects', label: t('nav.projects'), icon: FolderOpen, end: false },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ]

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar – desktop only */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center px-5 py-5 border-b border-gray-200 dark:border-gray-700">
          <img src="/logo.png" alt="HA Budgeting" className="h-48 w-48 object-contain rounded-xl" />
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <img src="/logo.png" alt="HA Budgeting" className="h-28 w-28 object-contain rounded-xl" />
        </header>
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Bottom nav – mobile only */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex z-30">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 flex-1 py-2 text-[10px] font-medium transition-colors',
                  isActive
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500 dark:text-gray-400',
                )
              }
            >
              <Icon size={19} />
              <span className="leading-tight">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* SpeedDial – rendered on all pages except Settings */}
      {showSpeedDial && <SpeedDial />}

      {/* Global QuickAdd modal */}
      <QuickAddModal />
    </div>
  )
}
