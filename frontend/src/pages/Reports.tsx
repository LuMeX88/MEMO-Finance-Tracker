import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line, ReferenceLine,
} from 'recharts'
import { Download, FileText } from 'lucide-react'
import {
  getReportSummary, getReportByCategory, getReportTimeline, getReportComparison,
  getForecast,
} from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useT } from '@/lib/i18n'

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

export default function Reports() {
  const t = useT()
  const PRESET_LABELS: Record<DateRangePreset, string> = {
    this_month: t('reports.thisMonth'),
    last_month: t('reports.lastMonth'),
    this_year: t('reports.thisYear'),
    custom: t('reports.custom'),
  }
  const addToast = useUIStore((s) => s.addToast)
  const currency = useSettingsStore((s) => s.currency)

  const [preset, setPreset] = useState<DateRangePreset>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [forecastMonths, setForecastMonths] = useState<3 | 6 | 12>(6)

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

  const pieData = byCategory.map((c, i) => ({
    name: `${c.category.icon} ${c.category.name}`,
    value: c.total,
    color: c.category.color || CHART_COLORS[i % CHART_COLORS.length],
    percentage: c.percentage,
  }))

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
            Übersicht
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
                <div key={c.category.id} className="space-y-1">
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
                </div>
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
                  name === 'income' ? 'Einnahmen' : 'Ausgaben',
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
              Einnahmen
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />
              Ausgaben
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
                    { key: 'income', label: 'Einnahmen', positiveIsGood: true, color: 'text-green-600 dark:text-green-400' },
                    { key: 'expenses', label: 'Ausgaben', positiveIsGood: false, color: 'text-red-600 dark:text-red-400' },
                    { key: 'balance', label: 'Saldo', positiveIsGood: true, color: 'text-blue-600 dark:text-blue-400' },
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
            onClick={() => addToast(t('reports.exportPreparing'), 'info')}
          >
            <FileText size={15} />
            {t('reports.exportCsv')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => addToast(t('reports.exportPreparing'), 'info')}
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
            📈 Ausgaben-Forecast
          </h2>
          <div className="flex gap-1">
            {([3, 6, 12] as const).map((m) => (
              <button
                key={m}
                onClick={() => setForecastMonths(m)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  forecastMonths === m
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {m} Monate
              </button>
            ))}
          </div>
        </div>

        {forecastData && (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart
                data={forecastData.months}
                margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
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
                  formatter={(v: number, name: string) => [
                    formatCurrency(v, currency),
                    name,
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                {/* Past months – solid blue */}
                <Bar
                  dataKey="total"
                  name="Geplant"
                  radius={[3, 3, 0, 0]}
                  shape={(props: Record<string, unknown>) => {
                    const { x, y, width, height, total: _t, ...rest } = props as {
                      x: number; y: number; width: number; height: number; total: unknown
                      payload?: { is_past?: boolean }; [key: string]: unknown
                    }
                    const isPast = (rest.payload as { is_past?: boolean } | undefined)?.is_past ?? false
                    return (
                      <rect
                        x={x} y={y} width={width} height={height}
                        fill={isPast ? '#3b82f6' : '#e0f2fe'}
                        stroke={isPast ? undefined : '#38bdf8'}
                        strokeDasharray={isPast ? undefined : '4 2'}
                        rx={3}
                      />
                    )
                  }}
                />
                {/* Variable average reference line */}
                <Line
                  type="monotone"
                  dataKey="variable_avg"
                  name="Ø Variable"
                  stroke="#94a3b8"
                  strokeDasharray="5 3"
                  dot={false}
                  strokeWidth={1.5}
                />
                {/* Today reference line */}
                {(() => {
                  const now = new Date()
                  const todayLabel = now.toLocaleString('de-CH', { month: 'short', year: '2-digit' })
                  const match = forecastData.months.find((m) => m.label === todayLabel)
                  return match ? (
                    <ReferenceLine
                      x={match.label}
                      stroke="#f59e0b"
                      strokeDasharray="4 2"
                      label={{ value: 'Heute', position: 'top', fontSize: 10, fill: '#f59e0b' }}
                    />
                  ) : null
                })()}
              </ComposedChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
                Vergangenheit
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm border border-sky-400 bg-sky-100 inline-block" />
                Geplant (Zukunft)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-slate-400 inline-block" />
                Ø Variabel
              </span>
            </div>

            {/* Next-month breakdown table */}
            {(() => {
              const next = forecastData.months.find((m) => !m.is_past)
              if (!next) return null
              return (
                <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Nächster Monat: {next.label}
                  </h3>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      <tr>
                        <td className="py-2 text-gray-500 dark:text-gray-400">Geplant fix</td>
                        <td className="py-2 text-right font-medium text-gray-900 dark:text-white tabular-nums">
                          {formatCurrency(next.scheduled_fixed, currency)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-gray-500 dark:text-gray-400">Geplant variabel</td>
                        <td className="py-2 text-right font-medium text-gray-900 dark:text-white tabular-nums">
                          {formatCurrency(next.scheduled_variable, currency)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-gray-500 dark:text-gray-400">Ø Variabel (Basis)</td>
                        <td className="py-2 text-right font-medium text-gray-900 dark:text-white tabular-nums">
                          {formatCurrency(next.variable_avg, currency)}
                        </td>
                      </tr>
                      <tr className="font-semibold">
                        <td className="py-2 text-gray-900 dark:text-white">Total Prognose</td>
                        <td className="py-2 text-right text-blue-600 dark:text-blue-400 tabular-nums">
                          {formatCurrency(next.total, currency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
