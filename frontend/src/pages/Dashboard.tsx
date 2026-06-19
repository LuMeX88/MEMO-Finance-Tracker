import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingDown, TrendingUp, Minus, BarChart2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { format, subDays, parseISO } from 'date-fns'
import {
  getTransactions,
  getReportSummary,
  getReportByCategory,
  getReportTimeline,
  deleteTransaction,
} from '@/lib/api'
import { useUIStore } from '@/store/useUIStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { formatCurrency } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import TransactionForm from '@/components/transactions/TransactionForm'
import TransactionList from '@/components/transactions/TransactionList'
import SuggestionBanner from '@/components/suggestions/SuggestionBanner'
import type { Transaction } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  colorClass: string
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
}

function KpiCard({ label, value, colorClass, icon, trend }: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {label}
        </span>
        <span
          className={`flex items-center justify-center w-7 h-7 rounded-lg ${colorClass}`}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-xl font-bold text-gray-900 dark:text-white leading-tight tabular-nums">
          {value}
        </span>
        {trend && (
          <span
            className={`text-xs font-medium ${
              trend === 'up'
                ? 'text-emerald-500'
                : trend === 'down'
                  ? 'text-red-400'
                  : 'text-gray-400'
            }`}
          >
            {trend === 'up' ? (
              <TrendingUp size={14} />
            ) : trend === 'down' ? (
              <TrendingDown size={14} />
            ) : (
              <Minus size={14} />
            )}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  currency = 'CHF',
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  currency?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {currency} {p.value.toFixed(2)}
        </p>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const queryClient = useQueryClient()
  const currency = useSettingsStore((s) => s.currency)
  const addToast = useUIStore((s) => s.addToast)
  const t = useT()

  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null)

  const today = new Date()
  const fourteenDaysAgo = subDays(today, 13)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: summary } = useQuery({
    queryKey: ['report-summary'],
    queryFn: () => getReportSummary(),
  })

  const { data: categoryReport = [] } = useQuery({
    queryKey: ['report-by-category'],
    queryFn: () => getReportByCategory(),
  })

  const { data: recentTransactions = [] } = useQuery({
    queryKey: ['transactions', { limit: 5 }],
    queryFn: () => getTransactions({ limit: 5 }),
  })

  const { data: timeline = [] } = useQuery({
    queryKey: ['report-timeline', '14d'],
    queryFn: () =>
      getReportTimeline({
        start_date: isoDate(fourteenDaysAgo),
        end_date: isoDate(today),
      }),
  })

  // ── Delete mutation ───────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] })
      const previous = queryClient.getQueryData<Transaction[]>([
        'transactions',
        { limit: 5 },
      ])
      queryClient.setQueryData<Transaction[]>(
        ['transactions', { limit: 5 }],
        (old) => old?.filter((t) => t.id !== id) ?? [],
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['transactions', { limit: 5 }],
          context.previous,
        )
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

  // ── Chart data: split 14 days into zwei Wochen ────────────────────────────

  const sevenDaysAgo = subDays(today, 6)

  const thisWeekData = timeline.filter(
    (e) => parseISO(e.date) >= sevenDaysAgo,
  )
  const lastWeekData = timeline.filter(
    (e) => parseISO(e.date) < sevenDaysAgo,
  )

  const chartData = Array.from({ length: 7 }, (_, i) => {
    const thisEntry = thisWeekData[i]
    const lastEntry = lastWeekData[i]
    return {
      day: thisEntry
        ? format(parseISO(thisEntry.date), 'EEE')
        : `T${i + 1}`,
      dieseWoche: thisEntry?.expenses ?? 0,
      letzteWoche: lastEntry?.expenses ?? 0,
    }
  })

  // ── Top 5 categories ───────────────────────────────────────────────────────

  const topCategories = [...categoryReport]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  const maxCategoryTotal =
    topCategories.length > 0 ? topCategories[0].total : 1

  // ── KPI values ────────────────────────────────────────────────────────────

  const thisMonthExpenses = summary?.this_month_expenses ?? 0
  const thisMonthIncome = summary?.this_month_income ?? 0
  const balance = summary?.balance_this_month ?? 0
  const avgPerTx = summary?.avg_per_transaction ?? 0

  return (
    <div className="flex flex-col gap-5 p-4 pb-28 max-w-2xl mx-auto">
      {/* ── KPI Grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label={t('dashboard.thisMonth')}
          value={formatCurrency(thisMonthExpenses, currency)}
          colorClass="bg-red-100 dark:bg-red-900/30 text-red-500"
          icon={<TrendingDown size={15} />}
        />
        <KpiCard
          label={t('dashboard.income')}
          value={formatCurrency(thisMonthIncome, currency)}
          colorClass="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500"
          icon={<TrendingUp size={15} />}
        />
        <KpiCard
          label={t('dashboard.balance')}
          value={formatCurrency(balance, currency)}
          colorClass={
            balance >= 0
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-500'
              : 'bg-orange-100 dark:bg-orange-900/30 text-orange-500'
          }
          icon={<Minus size={15} />}
          trend={balance >= 0 ? 'up' : 'down'}
        />
        <KpiCard
          label={t('dashboard.avgPerTransaction')}
          value={formatCurrency(avgPerTx, currency)}
          colorClass="bg-purple-100 dark:bg-purple-900/30 text-purple-500"
          icon={<BarChart2 size={15} />}
        />
      </div>

      {/* ── Suggestion Banner ──────────────────────────────────────────────── */}
      <SuggestionBanner />

      {/* ── Trend Chart ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
          {t('dashboard.weekVsWeek')}
        </h2>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorDiese" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorLetzte" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={(props) => <ChartTooltip {...props} currency={currency} />} />
            <Area
              type="monotone"
              dataKey="letzteWoche"
              name={t('dashboard.lastWeek')}
              stroke="#94a3b8"
              strokeWidth={1.5}
              fill="url(#colorLetzte)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="dieseWoche"
              name={t('dashboard.thisWeek')}
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorDiese)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Category Bars ───────────────────────────────────────────────────── */}
      {topCategories.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
            {t('dashboard.categories')}
          </h2>
          <div className="flex flex-col gap-3">
            {topCategories.map((cr) => (
              <div key={cr.category.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span>{cr.category.icon}</span>
                    <span className="truncate max-w-[140px]">
                      {cr.category.name}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 tabular-nums">
                    {formatCurrency(cr.total, currency)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(cr.total / maxCategoryTotal) * 100}%`,
                      backgroundColor: cr.category.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Transactions ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {t('dashboard.recentTransactions')}
          </h2>
          <Link
            to="/transactions"
            className="text-xs font-medium text-blue-500 hover:text-blue-600 dark:hover:text-blue-400"
          >
            {t('dashboard.all')}
          </Link>
        </div>

        {recentTransactions.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            Noch keine Transaktionen
          </p>
        ) : (
          <TransactionList
            transactions={recentTransactions}
            onEdit={setEditingTransaction}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        )}
      </div>

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      <Modal
        open={editingTransaction !== null}
        onClose={() => setEditingTransaction(null)}
        title="Transaktion bearbeiten"
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
