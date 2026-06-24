import { HashRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import Transactions from '@/pages/Transactions'
import Schedules from '@/pages/Schedules'
import Reports from '@/pages/Reports'
import CategoriesPage from '@/pages/CategoriesPage'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import SettingsPage from '@/pages/SettingsPage'
import ToastContainer from '@/components/ui/Toast'
import { useSettingsStore } from '@/store/useSettingsStore'
import { getSettings } from '@/lib/api'
import { useEffect } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

// Load the server-side settings once on startup so language/currency/theme are
// identical across the web browser and the Home Assistant Companion app (which
// otherwise have isolated localStorage). Falls back to the cached local values.
function SettingsBootstrap({ children }: { children: React.ReactNode }) {
  const applyServerSettings = useSettingsStore((s) => s.applyServerSettings)

  useEffect(() => {
    getSettings()
      .then((s) =>
        applyServerSettings({
          currency: s.currency,
          language: s.language,
          theme: s.theme === 'dark' ? 'dark' : 'light',
          defaultCategoryId: s.default_category_id ?? null,
        }),
      )
      .catch(() => {
        /* backend not reachable yet — keep the locally cached settings */
      })
  }, [applyServerSettings])

  return <>{children}</>
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsBootstrap>
        <ThemeProvider>
          <HashRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="schedules" element={<Schedules />} />
                <Route path="reports" element={<Reports />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="projects/:id" element={<ProjectDetailPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Routes>
            <ToastContainer />
          </HashRouter>
        </ThemeProvider>
      </SettingsBootstrap>
    </QueryClientProvider>
  )
}
