import { create } from 'zustand'
import type { Toast, ToastType } from '@/types'

interface UIState {
  quickAddOpen: boolean
  quickAddInitialType: 'expense' | 'income'
  quickAddScan: boolean
  activeTransactionId: number | null
  toasts: Toast[]
  openQuickAdd: () => void
  openQuickAddAs: (type: 'expense' | 'income') => void
  openQuickAddWithScan: () => void
  closeQuickAdd: () => void
  setActiveTransactionId: (id: number | null) => void
  addToast: (message: string, type: ToastType) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  quickAddOpen: false,
  quickAddInitialType: 'expense',
  quickAddScan: false,
  activeTransactionId: null,
  toasts: [],

  openQuickAdd: () => set({ quickAddOpen: true, quickAddInitialType: 'expense', quickAddScan: false }),
  openQuickAddAs: (type) => set({ quickAddOpen: true, quickAddInitialType: type, quickAddScan: false }),
  openQuickAddWithScan: () => set({ quickAddOpen: true, quickAddInitialType: 'expense', quickAddScan: true }),
  closeQuickAdd: () => set({ quickAddOpen: false, quickAddScan: false }),
  setActiveTransactionId: (id) => set({ activeTransactionId: id }),

  addToast: (message, type) => {
    const id = crypto.randomUUID()
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }))
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))
