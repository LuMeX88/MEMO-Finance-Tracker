import { Fragment, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line, ReferenceLine,
} from 'recharts'
import { Download, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import {
  getReportSummary, getReportByCategory, getReportTimeline, getReportComparison,
  getForecast,
} from '@/lib/api'
import { formatCurrency, formatDate, localeForLanguage } from '@/lib/utils'
import { exportReportCsv, exportReportPdf, type ReportExportData } from '@/lib/export'
import { useUIStore } from '@/store/useUIStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useT, type TKey } from '@/lib/i18n'
import type { ForecastItem, MonthForecast } from '@/types'

type DateRangePreset = 'this_month' | 'last_month' | 'this_year' | 'custom'

function getDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
): { start_date: string; end_date: string } {
  const now = new Date()
  if (preset === 'this_month') {
    return {
      start_date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
      end_date: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
    }
  }
  if (preset === 'last_month') {
    return {
      start_date: new Date(now.getFullYear(), now.getMonth() - 1, 1)
        .toISOString()
        .split('T')[0],
      end_date: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0],
    }
  }
  if (preset === 'this_year') {
    return {
      start_date: `${now.getFullYear()}-01-01`,
      end_date: `${now.getFullYear()}-12-31`,
    }
  }
  return {
    start_date:
      customStart ??
      new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    end_date: customEnd ?? now.toISOString().split('T')[0],
  }
}

const CHART_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
]

interface KpiCardProps {
  label: string
  value: string
  variant?: 'green' | 'red' | 'blue' | 'default'
}

function KpiCard({ label, value, variant = 'default' }: KpiCardProps) {
  const colorMap = {
    green: 'text-green-600 dark:text-green-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400',
    default: 'text-gray-900 dark:text-white',
  }
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colorMap[variant]}`}>{value}</p>
    </div>
  )
}

function DiffBadge({
  current,
  previous,
  positiveIsGood = true,
}: {
  current: number
  previous: number
  positiveIsGood?: boolean
}) {
  if (previous === 0) return null
  const diff = current - previous
  const pct = Math.abs((diff / Math.abs(previous)) * 100)
  const isUp = diff > 0
  const isGood = (isUp && positiveIsGood) || (!isUp && !positiveIsGood)
  return (
    <span className={`text-xs font-medium ${isGood ? 'text-green-500' : 'text-red-500'}`}>
      {isUp ? '↑' : '↓'} {pct.toFixed(1)}%
    </span>
  )
}

function forecastItemSub(
  it: ForecastItem,
  t: (key: TKey, vars?: Record<string, string | number>) => string,
): string {
  if (it.kind === 'project') {
    const parts = [t('forecast.itemProject')]
    if (it.project_name) parts.push(it.project_name)
    if (it.due_date) parts.push(formatDate(it.due_date))
    return parts.join(' · ')
  }
  if (it.kind === 'fixed' || it.kind === 'variable') {
    const parts: string[] = []
    if (it.interval) parts.push(t(`schedules.${it.interval}` as TKey))
    if (it.occurrences && it.occurrences > 1) parts.push(`×${it.occurrences}`)
    return parts.join(' · ')
  }
  return ''
}

function ForecastTooltip({
  active,
  payload,
  currency,
  t,
}: {
  active?: boolean
  payload?: Array<{ payload: MonthForecast & { chartLabel: string } }>
  currency: string
  t: (key: TKey, vars?: Record<string, string | number>) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  const m = payload[0].payload
  const rows: Array<[string, number]> = []
  if (m.scheduled_fixed > 0) rows.push([t('forecast.scheduledFixed'), m.scheduled_fixed])
  if (m.scheduled_variable > 0) rows.push([t('forecast.scheduledVariable'), m.scheduled_variable])
  if (m.variable_avg > 0) rows.push([t('forecast.variableBase'), m.variable_avg])
  if (m.scheduled_project > 0) rows.push([t('forecast.scheduledProjects'), m.scheduled_project])
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-gray-900 dark:text-white mb-1">{m.chartLabel}</div>
      <div className="space-y-0.5">
        {rows.map(([label, val]) => (
          <div key={label} className="flex justify-between gap-4 text-gray-600 dark:text-gray-400">
            <span>{label}</span>
            <span className="tabular-nums">{formatCurrency(val, currency)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-gray-100 dark:border-gray-700 pt-1 mt-0.5 font-semibold text-gray-900 dark:text-white">
          <span>{t('forecast.totalForecast')}</span>
          <span className="tabular-nums">{formatCurrency(m.total, currency)}</span>
        </div>
      </div>
    </div>
  )
}

export default function Reports() {
  const t = useT()
  const navigate = useNavigate()
  const goToCategory = (categoryId: number) =>
    navigate(`/transactions?category=${categoryId}`)
  const PRESET_LABELS: Record<DateRangePreset, string> = {
    this_month: t('reports.thisMonth'),
    last_month: t('reports.lastMonth'),
    this_year: t('reports.thisYear'),
    custom: t('reports.custom'),
  }
  const addToast = useUIStore((s) => s.addToast)
  const currency = useSettingsStore((s) => s.currency)
  const language = useSettingsStore((s) => s.language)
  const forecastLocale = localeForLanguage(language)

  const [preset, setPreset] = useState<DateRangePreset>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [forecastMonths, setForecastMonths] = useState<1 | 3 | 6 | 12>(6)
  const [expandedForecast, setExpandedForecast] = useState<Set<string>>(new Set())
  const toggleForecast = (key: string) =>
    setExpandedForecast((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const params = useMemo(
    () => getDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  )

  const { data: summary } = useQuery({
    queryKey: ['report-summary', params],
    queryFn: () => getReportSummary(params),
  })
  const { data: byCategory = [] } = useQuery({
    queryKey: ['report-category', params],
    queryFn: () => getReportByCategory(params),
  })
  const { data: timeline = [] } = useQuery({
    queryKey: ['report-timeline', params],
    queryFn: () => getReportTimeline(params),
  })
  const { data: comparison } = useQuery({
    queryKey: ['report-comparison'],
    queryFn: getReportComparison,
  })

  const { data: forecastData } = useQuery({
    queryKey: ['forecast', forecastMonths],
    queryFn: () => getForecast(forecastMonths),
  })

  const forecastChart = useMemo(
    () =>
      (forecastData?.months ?? []).map((m) => ({
        ...m,
        chartLabel: new Date(m.year, m.month - 1, 1).toLocaleDateString(forecastLocale, {
          month: 'short',
          year: '2-digit',
        }),
      })),
    [forecastData, forecastLocale],
  )

  const pieData = byCategory.map((c, i) => ({
    id: c.category.id,
    name: `${c.category.icon} ${c.category.name}`,
    value: c.total,
    color: c.category.color || CHART_COLORS[i % CHART_COLORS.length],
    percentage: c.percentage,
  }))

  const buildExportData = (): ReportExportData => ({
    summary,
    byCategory,
    timeline,
    startDate: params.start_date,
    endDate: params.end_date,
    periodLabel: `${PRESET_LABELS[preset]} (${formatDate(params.start_date)} – ${formatDate(params.end_date)})`,
    currency,
    t,
  })

  const hasExportData = Boolean(summary) || byCategory.length > 0 || timeline.length > 0

  const handleExportCsv = () => {
    if (!hasExportData) {
      addToast(t('reports.exportNoData'), 'error')
      return
    }
    try {
      exportReportCsv(buildExportData())
      addToast(t('reports.exportSuccess'), 'success')
    } catch {
      addToast(t('reports.exportError'), 'error')
    }
  }

  const handleExportPdf = async () => {
    if (!hasExportData) {
      addToast(t('reports.exportNoData'), 'error')
      return
    }
    try {
      await exportReportPdf(buildExportData())
      addToast(t('reports.exportSuccess'), 'success')
    } catch {
      addToast(t('reports.exportError'), 'error')
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header + Date Range */}
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('reports.title')}</h1>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRESET_LABELS) as DateRangePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                preset === p
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex gap-3 flex-wrap">
            <Input
              type="date"
              label={t('reports.from')}
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <Input
              type="date"
              label={t('reports.to')}
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* KPI Grid */}
      {summary && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">
            {t('reports.summary')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard
              label={t('reports.totalIncome')}
              value={formatCurrency(summary.total_income, currency)}
              variant="green"
            />
            <KpiCard
              label={t('reports.totalExpenses')}
              value={formatCurrency(summary.total_expenses, currency)}
              variant="red"
            />
            <KpiCard
              label={t('reports.balance')}
              value={formatCurrency(summary.total_income - summary.total_expenses, currency)}
              variant="blue"
            />
            <KpiCard
              label={t('reports.avgPerMonth')}
              value={formatCurrency(summary.avg_per_month, currency)}
            />
            <KpiCard
              label={t('reports.avgPerTransaction')}
              value={formatCurrency(summary.avg_per_transaction, currency)}
            />
            <KpiCard
              label={t('reports.biggestExpense')}
              value={
                summary.biggest_expense
                  ? formatCurrency(summary.biggest_expense.amount, currency)
                  : '—'
              }
            />
          </div>
        </section>
      )}

      {/* By Category – Donut + Legend */}
      {byCategory.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            {t('reports.byCategory')}
          </h2>
          <div className="flex flex-col md:flex-row gap-6 items-center">
            {/* Donut chart */}
            <div className="flex-shrink-0">
              <PieChart width={200} height={200}>
                <Pie
                  data={pieData}
                  cx={100}
                  cy={100}
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  className="cursor-pointer focus:outline-none"
                  onClick={(data) => {
                    const d = data as unknown as { id?: number; payload?: { id?: number } }
                    const id = d?.id ?? d?.payload?.id
                    if (typeof id === 'number') goToCategory(id)
                  }}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatCurrency(v, currency)}
                  contentStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </div>

            {/* Legend list */}
            <div className="flex-1 space-y-2 w-full">
              {byCategory.map((c, i) => (
                <button
                  type="button"
                  key={c.category.id}
                  onClick={() => goToCategory(c.category.id)}
                  title={t('reports.viewTransactions')}
                  className="block w-full text-left space-y-1 rounded-lg px-1.5 -mx-1.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor:
                            c.category.color || CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                      <span className="text-gray-700 dark:text-gray-300 truncate">
                        {c.category.icon} {c.category.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(c.total, currency)}
                      </span>
                      <span className="text-gray-400 text-xs w-10 text-right">
                        {c.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${c.percentage}%`,
                        backgroundColor:
                          c.category.color || CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timeline – Grouped BarChart */}
      {timeline.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            {t('reports.timeline')}
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={timeline} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, name: string) => [
                  formatCurrency(v, currency),
                  name === 'income' ? t('reports.income') : t('reports.expenses'),
                ]}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="income" name="income" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />
              {t('reports.income')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />
              {t('reports.expenses')}
            </span>
          </div>
        </div>
      )}

      {/* Comparison Table */}
      {comparison && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            {t('reports.comparison')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 text-xs">
                  <th className="pb-3 font-medium w-28"></th>
                  <th className="pb-3 font-medium">{t('reports.currentMonth')}</th>
                  <th className="pb-3 font-medium">{t('reports.previousMonth')}</th>
                  <th className="pb-3 font-medium">{t('reports.sameMonthLastYear')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {(
                  [
                    { key: 'income', label: t('reports.income'), positiveIsGood: true, color: 'text-green-600 dark:text-green-400' },
                    { key: 'expenses', label: t('reports.expenses'), positiveIsGood: false, color: 'text-red-600 dark:text-red-400' },
                    { key: 'balance', label: t('reports.balance'), positiveIsGood: true, color: 'text-blue-600 dark:text-blue-400' },
                  ] as const
                ).map(({ key, label, positiveIsGood, color }) => (
                  <tr key={key}>
                    <td className="py-3 text-gray-600 dark:text-gray-400 font-medium">{label}</td>
                    <td className={`py-3 font-semibold ${color}`}>
                      {formatCurrency(comparison.current_month[key], currency)}
                    </td>
                    <td className="py-3 text-gray-700 dark:text-gray-300">
                      <div className="flex items-center gap-2">
                        {formatCurrency(comparison.previous_month[key], currency)}
                        <DiffBadge
                          current={comparison.current_month[key]}
                          previous={comparison.previous_month[key]}
                          positiveIsGood={positiveIsGood}
                        />
                      </div>
                    </td>
                    <td className="py-3 text-gray-700 dark:text-gray-300">
                      {formatCurrency(comparison.same_month_last_year[key], currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Export</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={handleExportCsv}
          >
            <FileText size={15} />
            {t('reports.exportCsv')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportPdf}
          >
            <Download size={15} />
            {t('reports.exportPdf')}
          </Button>
        </div>
      </div>

      {/* Forecast */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            📈 {t('forecast.title')}
          </h2>
          <div className="flex gap-1">
            {([1, 3, 6, 12] as const).map((m) => (
              <button
                key={m}
                onClick={() => setForecastMonths(m)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  forecastMonths === m
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {m === 1 ? t('forecast.nextMonth') : t('forecast.nMonths', { n: m })}
              </button>
            ))}
          </div>
        </div>

        {forecastData && forecastChart.length > 0 && (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart
                data={forecastChart}
                margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="chartLabel"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={45}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={(props) => (
                    <ForecastTooltip
                      active={props.active}
                      payload={props.payload as never}
                      currency={currency}
                      t={t}
                    />
                  )}
                />
                {/* Forecast total – current month solid, future months dashed */}
                <Bar
                  dataKey="total"
                  name={t('forecast.seriesTotal')}
                  radius={[3, 3, 0, 0]}
                  shape={(props: unknown) => {
                    const { x, y, width, height, payload } = props as {
                      x: number; y: number; width: number; height: number
                      payload?: { is_current?: boolean }
                    }
                    const isCurrent = payload?.is_current ?? false
                    return (
                      <rect
                        x={x} y={y} width={width} height={height}
                        fill={isCurrent ? '#3b82f6' : '#e0f2fe'}
                        stroke={isCurrent ? undefined : '#38bdf8'}
                        strokeDasharray={isCurrent ? undefined : '4 2'}
                        rx={3}
                      />
                    )
                  }}
                />
                {/* Variable average reference line */}
                <Line
                  type="monotone"
                  dataKey="variable_avg"
                  name={t('forecast.legendAvg')}
                  stroke="#94a3b8"
                  strokeDasharray="5 3"
                  dot={false}
                  strokeWidth={1.5}
                />
                {/* Today reference line */}
                {(() => {
                  const cur = forecastChart.find((m) => m.is_current)
                  return cur ? (
                    <ReferenceLine
                      x={cur.chartLabel}
                      stroke="#f59e0b"
                      strokeDasharray="4 2"
                      label={{ value: t('forecast.today'), position: 'top', fontSize: 10, fill: '#f59e0b' }}
                    />
                  ) : null
                })()}
              </ComposedChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
                {t('forecast.legendCurrent')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm border border-sky-400 bg-sky-100 inline-block" />
                {t('forecast.legendPlanned')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-slate-400 inline-block" />
                {t('forecast.legendAvg')}
              </span>
            </div>

            {/* Adaptive per-month breakdown – every month in the chosen horizon */}
            <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {t('forecast.includedItems')}
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 dark:text-gray-500">
                    <th className="pb-2 font-medium">{t('forecast.month')}</th>
                    <th className="pb-2 font-medium text-right">{t('forecast.total')}</th>
                    <th className="pb-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {forecastChart.map((m) => {
                    const key = `${m.year}-${m.month}`
                    const open = expandedForecast.has(key)
                    return (
                      <Fragment key={key}>
                        <tr
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40"
                          onClick={() => toggleForecast(key)}
                        >
                          <td className="py-2 font-medium text-gray-900 dark:text-white">
                            {m.chartLabel}
                            {m.is_current && (
                              <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                                ({t('forecast.today')})
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                            {formatCurrency(m.total, currency)}
                          </td>
                          <td className="py-2 text-right text-gray-400">
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={3} className="pb-3 pt-0">
                              {m.items.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                                  {t('forecast.noItems')}
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {m.items.map((it, idx) => {
                                    const sub = forecastItemSub(it, t)
                                    return (
                                      <li
                                        key={idx}
                                        className="flex items-start justify-between gap-3 rounded-md bg-gray-50 dark:bg-gray-700/30 px-2 py-1.5"
                                      >
                                        <div className="min-w-0">
                                          <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
                                            {it.kind === 'average' ? t('forecast.variableAvgItem') : it.name}
                                          </div>
                                          {sub && (
                                            <div className="text-xs text-gray-400 dark:text-gray-500">{sub}</div>
                                          )}
                                        </div>
                                        <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white whitespace-nowrap">
                                          {formatCurrency(it.amount, currency)}
                                        </span>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
