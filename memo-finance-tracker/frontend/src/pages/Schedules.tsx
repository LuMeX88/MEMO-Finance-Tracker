import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Calendar, Pencil, Trash2, AlertTriangle, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  getSchedules, createSchedule, updateSchedule, deleteSchedule, getCategories,
} from '@/lib/api'
import type { Schedule } from '@/types'
import { formatCurrency, formatDate, getDaysUntil } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import EmptyState from '@/components/ui/EmptyState'
import { useT, type TKey } from '@/lib/i18n'

type ScheduleFormData = {
  name: string
  amount: string
  is_variable: boolean
  estimated_amount: string
  interval: Schedule['interval']
  next_due_date: string
  category_id: string
  active: boolean
}

const INTERVAL_BADGE: Record<Schedule['interval'], string> = {
  weekly: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  monthly: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  yearly: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

function getDueLabel(daysUntil: number, t: (key: TKey, vars?: Record<string, string | number>) => string): { text: string; className: string } {
  if (daysUntil < 0)
    return { text: t('schedules.overdue'), className: 'text-red-600 dark:text-red-400 font-semibold' }
  if (daysUntil === 0)
    return { text: t('schedules.dueToday'), className: 'text-orange-500 dark:text-orange-400 font-semibold' }
  if (daysUntil <= 3)
    return { text: t('schedules.dueInDays', { n: daysUntil }), className: 'text-yellow-600 dark:text-yellow-400' }
  return { text: t('schedules.dueInDays', { n: daysUntil }), className: 'text-gray-500 dark:text-gray-400' }
}

function getOccurrencesInRange(s: Schedule, start: Date, end: Date): number {
  let count = 0
  const cur = new Date(s.next_due_date)
  while (cur <= end) {
    if (cur >= start) count++
    if (s.interval === 'weekly') cur.setDate(cur.getDate() + 7)
    else if (s.interval === 'monthly') cur.setMonth(cur.getMonth() + 1)
    else cur.setFullYear(cur.getFullYear() + 1)
  }
  return count
}

function buildForecastData(
  schedules: Schedule[],
  months: number,
): { month: string; total: number }[] {
  const now = new Date()
  return Array.from({ length: months }, (_, i) => {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0)
    const label = monthStart.toLocaleString('de-CH', {
      month: 'short',
      ...(months > 3 ? { year: '2-digit' } : {}),
    })
    let total = 0
    for (const s of schedules) {
      if (!s.active) continue
      const amount = s.is_variable ? (s.estimated_amount ?? 0) : s.amount
      total += getOccurrencesInRange(s, monthStart, monthEnd) * amount
    }
    return { month: label, total }
  })
}

const FORECAST_TABS = [
  { label: '1 Monat', months: 1 },
  { label: '3 Monate', months: 3 },
  { label: '12 Monate', months: 12 },
] as const

export default function Schedules() {
  const t = useT()
  const queryClient = useQueryClient()
  const addToast = useUIStore((s) => s.addToast)
  const currency = useSettingsStore((s) => s.currency)

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: getSchedules,
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [forecastMonths, setForecastMonths] = useState<1 | 3 | 12>(1)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [form, setForm] = useState<ScheduleFormData>({
    name: '',
    amount: '',
    is_variable: false,
    estimated_amount: '',
    interval: 'monthly',
    next_due_date: new Date().toISOString().split('T')[0],
    category_id: '',
    active: true,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['schedules'] })

  const createMut = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      invalidate()
      setModalOpen(false)
      addToast(t('schedules.created'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateSchedule>[1] }) =>
      updateSchedule(id, data),
    onSuccess: () => {
      invalidate()
      setModalOpen(false)
      addToast(t('schedules.updated'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      invalidate()
      setDeleteId(null)
      addToast(t('schedules.deleted'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  function openCreate() {
    setEditingSchedule(null)
    setForm({
      name: '',
      amount: '',
      is_variable: false,
      estimated_amount: '',
      interval: 'monthly',
      next_due_date: new Date().toISOString().split('T')[0],
      category_id: categories.find((c) => !c.archived)?.id.toString() ?? '',
      active: true,
    })
    setModalOpen(true)
  }

  function openEdit(s: Schedule) {
    setEditingSchedule(s)
    setForm({
      name: s.name,
      amount: s.amount.toString(),
      is_variable: s.is_variable,
      estimated_amount: s.estimated_amount?.toString() ?? '',
      interval: s.interval,
      next_due_date: s.next_due_date,
      category_id: s.category_id.toString(),
      active: s.active,
    })
    setModalOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: form.name,
      amount: parseFloat(form.amount) || 0,
      is_variable: form.is_variable,
      estimated_amount: form.is_variable ? (parseFloat(form.estimated_amount) || null) : null,
      interval: form.interval,
      next_due_date: form.next_due_date,
      category_id: parseInt(form.category_id),
      active: form.active,
    }
    if (editingSchedule) {
      updateMut.mutate({ id: editingSchedule.id, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const forecastData = buildForecastData(schedules, forecastMonths)
  const forecastTotal = forecastData.reduce((acc, d) => acc + d.total, 0)

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('schedules.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {schedules.filter((s) => s.active).length} aktiv
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          {t('schedules.new')}
        </Button>
      </div>

      {/* Schedule List */}
      {schedules.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={t('schedules.empty')}
          description={t('schedules.emptyDesc')}
          actionLabel={t('schedules.new')}
          onAction={openCreate}
        />
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => {
            const daysUntil = getDaysUntil(s.next_due_date)
            const due = getDueLabel(daysUntil, t)
            const cat = categories.find((c) => c.id === s.category_id)
            return (
              <div
                key={s.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4"
              >
                {/* Category icon */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                  style={{ backgroundColor: cat?.color ? `${cat.color}26` : '#f3f4f6' }}
                >
                  {cat?.icon ?? '📦'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {s.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${INTERVAL_BADGE[s.interval]}`}
                    >
                      {s.interval === 'weekly' ? t('schedules.weekly') : s.interval === 'monthly' ? t('schedules.monthly') : t('schedules.yearly')}
                    </span>
                    {!s.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        Inaktiv
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Clock size={11} />
                      {formatDate(s.next_due_date)}
                    </span>
                    <span className={`text-xs ${due.className}`}>{due.text}</span>
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">
                    {s.is_variable
                      ? `variabel ~${formatCurrency(s.estimated_amount ?? 0, currency)}`
                      : formatCurrency(s.amount, currency)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(s)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    aria-label="Bearbeiten"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteId(s.id)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label="Löschen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Forecast Section */}
      {schedules.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Prognose</h2>

          {/* Period Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1 w-fit">
            {FORECAST_TABS.map((tab) => (
              <button
                key={tab.months}
                onClick={() => setForecastMonths(tab.months)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  forecastMonths === tab.months
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {tab.months === 1 ? t('schedules.month1') : tab.months === 3 ? t('schedules.month3') : t('schedules.month12')}
              </button>
            ))}
          </div>

          {/* Total */}
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t('schedules.total')}{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatCurrency(forecastTotal, currency)}
            </span>
          </p>

          {/* Bar Chart */}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={forecastData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value, currency), 'Ausgaben']}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title={t('action.delete')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('schedules.deleteConfirm')}
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => deleteId !== null && deleteMut.mutate(deleteId)}
            >
              {t('action.delete')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSchedule ? t('schedules.edit') : t('schedules.new')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('schedules.name')}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="z.B. Netflix Abo"
            required
          />

          {/* Variable toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.is_variable}
              onClick={() => setForm((f) => ({ ...f, is_variable: !f.is_variable }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                form.is_variable ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  form.is_variable ? 'translate-x-5' : ''
                }`}
              />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('schedules.variable')}
            </span>
          </div>

          {form.is_variable ? (
            <Input
              label={t('schedules.estimatedAmount')}
              type="number"
              step="0.01"
              min="0"
              value={form.estimated_amount}
              onChange={(e) => setForm((f) => ({ ...f, estimated_amount: e.target.value }))}
              placeholder="0.00"
            />
          ) : (
            <Input
              label={t('schedules.amount')}
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              required
            />
          )}

          <Select
            label={t('schedules.interval')}
            value={form.interval}
            onChange={(e) =>
              setForm((f) => ({ ...f, interval: e.target.value as Schedule['interval'] }))
            }
          >
            <option value="weekly">{t('schedules.weekly')}</option>
            <option value="monthly">{t('schedules.monthly')}</option>
            <option value="yearly">{t('schedules.yearly')}</option>
          </Select>

          <Input
            label={t('schedules.nextDue')}
            type="date"
            value={form.next_due_date}
            onChange={(e) => setForm((f) => ({ ...f, next_due_date: e.target.value }))}
            required
          />

          <Select
            label="Kategorie"
            value={form.category_id}
            onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
          >
            <option value="">Kategorie wählen</option>
            {categories
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
          </Select>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                form.active ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  form.active ? 'translate-x-5' : ''
                }`}
              />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('schedules.active')}</span>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setModalOpen(false)}
            >
              {t('action.cancel')}
            </Button>
            <Button
              type="submit"
              className="flex-1"
              loading={createMut.isPending || updateMut.isPending}
            >
              {editingSchedule ? t('action.save') : t('action.create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
