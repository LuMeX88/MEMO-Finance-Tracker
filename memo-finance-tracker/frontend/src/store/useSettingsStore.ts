import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { updateSettings } from '@/lib/api'
import type { AppSettings } from '@/types'

interface SettingsState {
  currency: string
  language: string
  theme: 'light' | 'dark'
  defaultCategoryId: number | null
  hydrated: boolean
  setCurrency: (currency: string) => void
  setLanguage: (language: string) => void
  setTheme: (theme: 'light' | 'dark') => void
  setDefaultCategoryId: (id: number | null) => void
  applyServerSettings: (
    settings: Partial<
      Pick<SettingsState, 'currency' | 'language' | 'theme' | 'defaultCategoryId'>
    >,
  ) => void
}

// Fire-and-forget write-through to the backend. Local state is updated first
// for instant UX; if the server write fails we keep the localStorage cache so
// the app still works offline.
function persistToServer(data: Partial<Omit<AppSettings, 'updated_at'>>) {
  void updateSettings(data).catch(() => {
    /* offline / backend not ready — local cache remains the source of truth */
  })
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      currency: 'CHF',
      language: 'de',
      theme: 'light',
      defaultCategoryId: null,
      hydrated: false,
      setCurrency: (currency) => {
        set({ currency })
        persistToServer({ currency })
      },
      setLanguage: (language) => {
        set({ language })
        persistToServer({ language })
      },
      setTheme: (theme) => {
        set({ theme })
        persistToServer({ theme })
      },
      setDefaultCategoryId: (id) => {
        set({ defaultCategoryId: id })
        persistToServer({ default_category_id: id })
      },
      applyServerSettings: (settings) => set({ ...settings, hydrated: true }),
    }),
    {
      name: 'ha-budgeting-settings',
      // Don't persist `hydrated`, so every reload re-syncs from the server.
      partialize: (state) => ({
        currency: state.currency,
        language: state.language,
        theme: state.theme,
        defaultCategoryId: state.defaultCategoryId,
      }),
    },
  ),
)
