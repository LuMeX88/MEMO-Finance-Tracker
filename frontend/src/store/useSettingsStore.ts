import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  currency: string
  language: string
  theme: 'light' | 'dark'
  defaultCategoryId: number | null
  setCurrency: (currency: string) => void
  setLanguage: (language: string) => void
  setTheme: (theme: 'light' | 'dark') => void
  setDefaultCategoryId: (id: number | null) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      currency: 'CHF',
      language: 'de',
      theme: 'light',
      defaultCategoryId: null,
      setCurrency: (currency) => set({ currency }),
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setDefaultCategoryId: (id) => set({ defaultCategoryId: id }),
    }),
    {
      name: 'ha-budgeting-settings',
    },
  ),
)
