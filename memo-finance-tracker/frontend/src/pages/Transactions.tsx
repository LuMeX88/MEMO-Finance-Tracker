import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Receipt, Filter } from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addMonths,
  addQuarters,
  addYears,
} from 'date-fns'
import {
  getTransactions,
  getCategories,
  getProjects,
  deleteTransaction,
} from '@/lib/api'
import { useUIStore } from '@/store/useUIStore'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import TransactionForm from '@/components/transactions/TransactionForm'
import TransactionList from '@/components/transactions/TransactionList'
import type { Transaction } from '@/types'
import { useT } from '@/lib/i18n'

const PAGE_SIZE = 20

type Period = 'month' | 'quarter' | 'year' | 'custom'

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

function rangeFor(
  period: Period,
  anchorStr: string,
  customStart: string,
  customEnd: string,
): { start: string; end: string } {
  if (period === 'custom') return { start: customStart, end: customEnd }
  const anchor = new Date(anchorStr)
  if (period === 'month')
    return { start: fmt(startOfMonth(anchor)), end: fmt(endOfMonth(anchor)) }
  if (period === 'quarter')
    return { start: fmt(startOfQuarter(anchor)), end: fmt(endOfQuarter(anchor)) }
  return { start: fmt(startOfYear(anchor)), end: fmt(endOfYear(anchor)) }
}

function periodLabel(period: Period, anchorStr: string): string {
  const anchor = new Date(anchorStr)
  if (period === 'month') return format(anchor, 'MMMM yyyy')
  if (period === 'quarter')
    return `Q${Math.floor(anchor.getMonth() / 3) + 1} ${anchor.getFullYear()}`
  return `${anchor.getFullYear()}`
}

function shiftAnchor(period: Period, anchorStr: string, dir: 1 | -1): string {
  const anchor = new Date(anchorStr)
  if (period === 'month') return fmt(addMonths(anchor, dir))
  if (period === 'quarter') return fmt(addQuarters(anchor, dir))
  if (period === 'year') return fmt(addYears(anchor, dir))
  return anchorStr
}

export default function Transactions() {
  const t = useT()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const addToast = useUIStore((s) => s.addToast)
  const openQuickAdd = useUIStore((s) => s.openQuickAdd)

  const today = new Date()
  const [searchParams] = useSearchParams()
  const initialCategory = searchParams.get('category') ?? ''
  const initialProject = searchParams.get('project') ?? ''
  const initialStart = searchParams.get('start') ?? ''
  const initialEnd = searchParams.get('end') ?? ''
  const hasInitialRange = Boolean(initialStart && initialEnd)
  const hasInitialFilter = Boolean(
    initialCategory || initialProject || hasInitialRange,
  )

  const [period, setPeriod] = useState<Period>(hasInitialRange ? 'custom' : 'month')
  const [anchor, setAnchor] = useState(fmt(today))
  const [customStart, setCustomStart] = useState(
    initialStart || fmt(startOfMonth(today)),
  )
  const [customEnd, setCustomEnd] = useState(initialEnd || fmt(endOfMonth(today)))
  const [typeFilter, setTypeFilter] = useState<'' | 'income' | 'expense'>('')
  const [categoryFilter, setCategoryFilter] = useState(initialCategory)
  const [projectFilter, setProjectFilter] = useState(initialProject)
  const [recipientInput, setRecipientInput] = useState('')
  const [recipientFilter, setRecipientFilter] = useState('')
  const [page, setPage] = useState(0)
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null)
  const [projectLinkedTx, setProjectLinkedTx] = useState<Transaction | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(hasInitialFilter)

  // Project-task mirrors are kept in sync with the project, so editing them here
  // would be silently reverted — intercept and point the user to the project.
  function handleEdit(tx: Transaction) {
    if (tx.is_project_task) {
      setProjectLinkedTx(tx)
    } else {
      setEditingTransaction(tx)
    }
  }

  // Debounce the recipient/merchant search so typing doesn't refetch every key.
  useEffect(() => {
    const id = setTimeout(() => {
      setRecipientFilter(recipientInput.trim())
      setPage(0)
    }, 350)
    return () => clearTimeout(id)
  }, [recipientInput])

  const { start, end } = rangeFor(period, anchor, customStart, customEnd)

  const queryParams = {
    ...(start ? { start_date: start } : {}),
    ...(end ? { end_date: end } : {}),
    ...(typeFilter ? { type: typeFilter as 'income' | 'expense' } : {}),
    ...(categoryFilter ? { category_id: parseInt(categoryFilter) } : {}),
    ...(projectFilter ? { project_id: parseInt(projectFilter) } : {}),
    ...(recipientFilter ? { recipient: recipientFilter } : {}),
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

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
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

  function changePeriod(next: Period) {
    if (next === 'custom') {
      const base = period === 'custom' ? 'month' : period
      const r = rangeFor(base, anchor, customStart, customEnd)
      setCustomStart(r.start)
      setCustomEnd(r.end)
    }
    setPeriod(next)
    resetPage()
  }

  const activeProjects = projects.filter((p) => !p.archived)
  const hasActiveFilters =
    typeFilter || categoryFilter || projectFilter || recipientFilter

  const periodOptions: { value: Period; label: string }[] = [
    { value: 'month', label: t('transaction.periodMonth') },
    { value: 'quarter', label: t('transaction.periodQuarter') },
    { value: 'year', label: t('transaction.periodYear') },
    { value: 'custom', label: t('transaction.periodCustom') },
  ]

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

      {/* ── Period type selector ───────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {periodOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => changePeriod(opt.value)}
            className={
              'text-xs font-semibold rounded-lg py-1.5 transition-colors ' +
              (period === opt.value
                ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Period navigation / custom range ───────────────────────────────── */}
      {period === 'custom' ? (
        <div className="grid grid-cols-2 gap-3 bg-white dark:bg-gray-800 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700">
          <Input
            label={t('common.from')}
            type="date"
            value={customStart}
            onChange={(e) => {
              setCustomStart(e.target.value)
              resetPage()
            }}
          />
          <Input
            label={t('common.to')}
            type="date"
            value={customEnd}
            onChange={(e) => {
              setCustomEnd(e.target.value)
              resetPage()
            }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-4 py-2.5 border border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={() => {
              setAnchor((a) => shiftAnchor(period, a, -1))
              resetPage()
            }}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={t('transaction.prevPeriod')}
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {periodLabel(period, anchor)}
          </span>
          <button
            type="button"
            onClick={() => {
              setAnchor((a) => shiftAnchor(period, a, 1))
              resetPage()
            }}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={t('transaction.nextPeriod')}
          >
            ›
          </button>
        </div>
      )}

      {/* ── Filters panel ──────────────────────────────────────────────────── */}
      {filtersOpen && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Type filter */}
            <Select
              label={t('transaction.type')}
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
              label={t('transaction.category')}
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value)
                resetPage()
              }}
            >
              <option value="">{t('transaction.all')}</option>
              {categories
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </Select>

            {/* Project filter */}
            <Select
              label={t('transaction.project')}
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value)
                resetPage()
              }}
            >
              <option value="">{t('transaction.all')}</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon ? `${p.icon} ` : ''}
                  {p.name}
                </option>
              ))}
            </Select>

            {/* Recipient / merchant search */}
            <Input
              label={t('transaction.recipient')}
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              placeholder={t('action.search')}
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="text-xs text-blue-500 hover:text-blue-600 text-left"
              onClick={() => {
                setTypeFilter('')
                setCategoryFilter('')
                setProjectFilter('')
                setRecipientInput('')
                setRecipientFilter('')
                resetPage()
              }}
            >
              {t('transaction.resetFilters')}
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
          onEdit={handleEdit}
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
            ← {t('action.showLess')}
          </Button>
          <span className="text-xs text-gray-400">
            {t('reports.page')} {page + 1}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('action.showMore')} →
          </Button>
        </div>
      )}

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
      {/* ── Project-linked booking notice ─────────────────────────────── */}
      <Modal
        open={projectLinkedTx !== null}
        onClose={() => setProjectLinkedTx(null)}
        title={t('transaction.linkedTitle')}
      >
        {projectLinkedTx && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('transaction.linkedDesc')}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setProjectLinkedTx(null)}>
                {t('action.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={projectLinkedTx.project_id == null}
                onClick={() => {
                  const pid = projectLinkedTx.project_id
                  setProjectLinkedTx(null)
                  if (pid != null) navigate(`/projects/${pid}`)
                }}
              >
                {t('transaction.goToProject')}
              </Button>
            </div>
          </div>
        )}
      </Modal>    </div>
  )
}
