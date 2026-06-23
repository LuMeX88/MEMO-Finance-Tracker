import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Receipt, Filter } from 'lucide-react'
import { format } from 'date-fns'
import {
  getTransactions,
  getCategories,
  deleteTransaction,
} from '@/lib/api'
import { useUIStore } from '@/store/useUIStore'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import TransactionForm from '@/components/transactions/TransactionForm'
import TransactionList from '@/components/transactions/TransactionList'
import type { Transaction } from '@/types'
import { useT } from '@/lib/i18n'

const PAGE_SIZE = 20

function monthStart(date: Date): string {
  return format(date, 'yyyy-MM-01')
}

function monthEnd(date: Date): string {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${last}`
}

function monthLabel(dateStr: string): string {
  const [year, month] = dateStr.split('-')
  const d = new Date(parseInt(year), parseInt(month) - 1, 1)
  return format(d, 'MMMM yyyy')
}

function prevMonth(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 2, 1)
  return format(d, 'yyyy-MM-dd')
}

function nextMonth(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number)
  const d = new Date(year, month, 1)
  return format(d, 'yyyy-MM-dd')
}

export default function Transactions() {
  const t = useT()
  const queryClient = useQueryClient()
  const addToast = useUIStore((s) => s.addToast)
  const openQuickAdd = useUIStore((s) => s.openQuickAdd)

  const today = new Date()
  const [searchParams] = useSearchParams()
  const initialCategory = searchParams.get('category') ?? ''
  const [monthBase, setMonthBase] = useState(monthStart(today))
  const [typeFilter, setTypeFilter] = useState<'' | 'income' | 'expense'>('')
  const [categoryFilter, setCategoryFilter] = useState(initialCategory)
  const [page, setPage] = useState(0)
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(Boolean(initialCategory))

  const start = monthBase
  const end = monthEnd(new Date(monthBase))

  const queryParams = {
    start_date: start,
    end_date: end,
    ...(typeFilter ? { type: typeFilter as 'income' | 'expense' } : {}),
    ...(categoryFilter ? { category_id: parseInt(categoryFilter) } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => getTransactions(queryParams),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] })
      const previous = queryClient.getQueryData<Transaction[]>([
        'transactions',
        queryParams,
      ])
      queryClient.setQueryData<Transaction[]>(
        ['transactions', queryParams],
        (old) => old?.filter((t) => t.id !== id) ?? [],
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['transactions', queryParams], context.previous)
      }
      addToast(t('transaction.deleteError'), 'error')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['report-summary'] })
      queryClient.invalidateQueries({ queryKey: ['report-by-category'] })
      addToast(t('transaction.deleted'), 'success')
    },
  })

  const hasPrev = page > 0
  const hasNext = transactions.length === PAGE_SIZE

  function resetPage() {
    setPage(0)
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 max-w-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('transaction.all')}
        </h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFiltersOpen((v) => !v)}
          className="gap-1.5"
        >
          <Filter size={15} />
          {t('transaction.filters')}
        </Button>
      </div>

      {/* ── Month Selector ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-4 py-2.5 border border-gray-100 dark:border-gray-700">
        <button
          type="button"
          onClick={() => {
            setMonthBase((m) => prevMonth(m))
            resetPage()
          }}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Vorheriger Monat"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {monthLabel(monthBase)}
        </span>
        <button
          type="button"
          onClick={() => {
            setMonthBase((m) => nextMonth(m))
            resetPage()
          }}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Nächster Monat"
        >
          ›
        </button>
      </div>

      {/* ── Filters panel ──────────────────────────────────────────────────── */}
      {filtersOpen && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Type filter */}
            <Select
              label="Typ"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as '' | 'income' | 'expense')
                resetPage()
              }}
            >
              <option value="">{t('transaction.all')}</option>
              <option value="expense">{t('transaction.expense')}</option>
              <option value="income">{t('transaction.income')}</option>
            </Select>

            {/* Category filter */}
            <Select
              label="Kategorie"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value)
                resetPage()
              }}
            >
              <option value="">Alle</option>
              {categories
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </Select>
          </div>

          {(typeFilter || categoryFilter) && (
            <button
              type="button"
              className="text-xs text-blue-500 hover:text-blue-600 text-left"
              onClick={() => {
                setTypeFilter('')
                setCategoryFilter('')
                resetPage()
              }}
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      )}

      {/* ── Transaction List ────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('transaction.empty')}
          description={t('transaction.emptyDesc')}
          actionLabel={t('transaction.new')}
          onAction={openQuickAdd}
        />
      ) : (
        <TransactionList
          transactions={transactions}
          onEdit={setEditingTransaction}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Zurück
          </Button>
          <span className="text-xs text-gray-400">
            Seite {page + 1}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Weiter →
          </Button>
        </div>
      )}

      {/* ── FAB ────────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={openQuickAdd}
        aria-label="Transaktion hinzufügen"
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95
          text-white shadow-lg shadow-blue-500/40 flex items-center justify-center
          transition-all duration-150 hover:scale-105 active:shadow-none"
      >
        <span className="text-2xl font-light leading-none">+</span>
      </button>

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      <Modal
        open={editingTransaction !== null}
        onClose={() => setEditingTransaction(null)}
        title={t('transaction.edit')}
      >
        {editingTransaction && (
          <TransactionForm
            transaction={editingTransaction}
            onSuccess={() => setEditingTransaction(null)}
            onCancel={() => setEditingTransaction(null)}
          />
        )}
      </Modal>
    </div>
  )
}
