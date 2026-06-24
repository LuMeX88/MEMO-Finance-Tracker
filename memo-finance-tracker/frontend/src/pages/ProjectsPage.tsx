import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, AlertTriangle, Activity, Archive,
} from 'lucide-react'
import { subYears, eachDayOfInterval, format } from 'date-fns'
import {
  getProjects, createProject, updateProject, deleteProject, getTransactions,
  getProjectCostSummaries,
} from '@/lib/api'
import type { Project, ProjectCostSummaryItem } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useT } from '@/lib/i18n'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import IconPicker from '@/components/ui/IconPicker'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectWithIcon = Project & { icon?: string }

type ProjectFormData = {
  name: string
  icon: string
  budget: string
  end_date: string
  mode: 'kanban' | 'waterfall'
  archived: boolean
}

// ─── Project Modal ────────────────────────────────────────────────────────────

function ProjectModal({
  open,
  onClose,
  editing,
  onSave,
  onDelete,
  loading,
}: {
  open: boolean
  onClose: () => void
  editing: ProjectWithIcon | null
  onSave: (data: ProjectFormData) => void
  onDelete?: () => void
  loading: boolean
}) {
  const t = useT()
  const [form, setForm] = useState<ProjectFormData>({
    name: '',
    icon: '📁',
    budget: '',
    end_date: '',
    mode: 'kanban',
    archived: false,
  })

  useEffect(() => {
    if (open) {
      setForm({
        name: editing?.name ?? '',
        icon: editing?.icon ?? '📁',
        budget: editing?.budget?.toString() ?? '',
        end_date: editing?.end_date ?? '',
        mode: editing?.mode ?? 'kanban',
        archived: editing?.archived ?? false,
      })
    }
  }, [open, editing])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('projects.edit') : t('projects.new')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
        className="space-y-4"
      >
        <IconPicker
          value={form.icon}
          onChange={(emoji) => setForm((f) => ({ ...f, icon: emoji }))}
          label={t('projects.chooseIcon')}
        />

        <Input
          label={t('projects.name')}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="z.B. Renovation Küche"
          required
        />

        <Input
          label={t('projects.budget')}
          type="number"
          step="0.01"
          min="0"
          value={form.budget}
          onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
          placeholder="0.00"
        />

        <Input
          label={t('projects.endDate')}
          type="date"
          value={form.end_date}
          onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('projects.method')}
          </span>
          <div className="grid grid-cols-2 gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {(['kanban', 'waterfall'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setForm((f) => ({ ...f, mode: m }))}
                className={
                  'text-xs font-semibold rounded-md py-1.5 transition-colors ' +
                  (form.mode === m
                    ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400')
                }
              >
                {m === 'kanban' ? t('projects.kanban') : t('projects.waterfall')}
              </button>
            ))}
          </div>
        </div>

        {editing && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.archived}
              onClick={() => setForm((f) => ({ ...f, archived: !f.archived }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                form.archived ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  form.archived ? 'translate-x-5' : ''
                }`}
              />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('projects.archived')}
            </span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {editing && onDelete && (
            <Button type="button" variant="danger" size="sm" onClick={onDelete}>
              <Trash2 size={14} />
              {t('action.delete')}
            </Button>
          )}
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {editing ? t('action.save') : t('action.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Activity Heatmap ─────────────────────────────────────────────────────────

function ActivityHeatmap() {
  const currency = useSettingsStore((s) => s.currency)
  const t = useT()
  const navigate = useNavigate()
  const today = new Date()
  const yearAgo = subYears(today, 1)

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions-heatmap'],
    queryFn: () =>
      getTransactions({
        start_date: format(yearAgo, 'yyyy-MM-dd'),
        end_date: format(today, 'yyyy-MM-dd'),
        type: 'expense',
      }),
  })

  const dayMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const tx of transactions) {
      const key = tx.date.slice(0, 10)
      map[key] = (map[key] ?? 0) + tx.amount
    }
    return map
  }, [transactions])

  const maxVal = Math.max(...Object.values(dayMap), 1)
  const days = eachDayOfInterval({ start: yearAgo, end: today })

  // Monday-first grid: pad start
  const offset = (yearAgo.getDay() + 6) % 7
  const paddedDays: (Date | null)[] = []
  for (let i = 0; i < offset; i++) paddedDays.push(null)
  for (const d of days) paddedDays.push(d)

  const weeks: (Date | null)[][] = []
  for (let i = 0; i < paddedDays.length; i += 7) {
    weeks.push(paddedDays.slice(i, i + 7))
  }

  function getColor(amount: number): string {
    if (amount === 0) return 'bg-gray-100 dark:bg-gray-700'
    const intensity = amount / maxVal
    if (intensity < 0.25) return 'bg-blue-200 dark:bg-blue-900'
    if (intensity < 0.5) return 'bg-blue-400 dark:bg-blue-700'
    if (intensity < 0.75) return 'bg-blue-600 dark:bg-blue-500'
    return 'bg-blue-800 dark:bg-blue-400'
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={16} className="text-blue-600" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {t('projects.heatmap')}
        </h2>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        {t('projects.heatmapDesc')}
      </p>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-0.5 min-w-max">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="w-3 h-3" />
                const key = format(day, 'yyyy-MM-dd')
                const amount = dayMap[key] ?? 0
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => navigate(`/transactions?start=${key}&end=${key}`)}
                    title={`${format(day, 'dd.MM.yyyy')}: ${formatCurrency(amount, currency)}`}
                    className={`w-3 h-3 rounded-sm cursor-pointer transition-opacity hover:opacity-75 hover:ring-1 hover:ring-primary-400 ${getColor(amount)}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-400 dark:text-gray-500">
        <span>{t('projects.less')}</span>
        <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-700" />
        <div className="w-3 h-3 rounded-sm bg-blue-200 dark:bg-blue-900" />
        <div className="w-3 h-3 rounded-sm bg-blue-400 dark:bg-blue-700" />
        <div className="w-3 h-3 rounded-sm bg-blue-600 dark:bg-blue-500" />
        <div className="w-3 h-3 rounded-sm bg-blue-800 dark:bg-blue-400" />
        <span>{t('projects.more')}</span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const queryClient = useQueryClient()
  const addToast = useUIStore((s) => s.addToast)
  const currency = useSettingsStore((s) => s.currency)
  const t = useT()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectWithIcon | null>(null)
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null)

  // Auto-open create modal if ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditingProject(null)
      setModalOpen(true)
    }
  }, [searchParams])

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  })

  // Per-project cost rollup. Hitting this endpoint also reconciles booked task
  // costs into real expense transactions, so the "spent" here (and the bookings
  // list / reports it feeds) always reflects what has actually been booked.
  const { data: costSummaries = [] } = useQuery({
    queryKey: ['project-cost-summaries'],
    queryFn: getProjectCostSummaries,
  })

  const summaryByProject = useMemo(() => {
    const map: Record<number, ProjectCostSummaryItem> = {}
    for (const s of costSummaries) map[s.project_id] = s
    return map
  }, [costSummaries])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: any) => createProject(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project-cost-summaries'] })
      setModalOpen(false)
      addToast(t('projects.created'), 'success')
      // Open the freshly created project straight away so its board (Kanban
      // or Waterfall) is visible and usable immediately.
      if (created?.id != null) navigate(`/projects/${created.id}`)
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const updateMut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: ({ id, data }: { id: number; data: any }) => updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project-cost-summaries'] })
      setModalOpen(false)
      addToast(t('projects.updated'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project-cost-summaries'] })
      setDeleteProjectId(null)
      setModalOpen(false)
      addToast(t('projects.deleted'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSave(data: ProjectFormData) {
    const payload = {
      name: data.name,
      icon: data.icon,
      budget: data.budget ? parseFloat(data.budget) : null,
      end_date: data.end_date || null,
      mode: data.mode,
      archived: data.archived,
    }
    if (editingProject) {
      updateMut.mutate({ id: editingProject.id, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const activeProjects = (projects as ProjectWithIcon[]).filter((p) => !p.archived)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('projects.title')}
        </h1>
        <Button
          onClick={() => {
            setEditingProject(null)
            setModalOpen(true)
          }}
        >
          <Plus size={16} />
          {t('projects.new')}
        </Button>
      </div>

      {/* Project list */}
      {activeProjects.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={t('projects.empty')}
          description={t('projects.emptyDesc')}
          actionLabel={t('projects.new')}
          onAction={() => {
            setEditingProject(null)
            setModalOpen(true)
          }}
        />
      ) : (
        <div className="space-y-3">
          {activeProjects.map((proj) => {
            const summary = summaryByProject[proj.id]
            const spent = summary?.spent ?? 0
            const forecast = summary?.forecast_cost ?? 0
            const booked = summary?.booked_cost ?? 0
            const hasBudget = proj.budget !== null && proj.budget > 0
            const progress = hasBudget ? Math.min((spent / proj.budget!) * 100, 100) : 0
            const barColor =
              progress >= 90
                ? 'bg-red-500'
                : progress >= 75
                ? 'bg-yellow-500'
                : 'bg-green-500'

            return (
              <div
                key={proj.id}
                onClick={() => navigate(`/projects/${proj.id}`)}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:border-primary-300 dark:hover:border-primary-700 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {proj.icon && (
                      <span className="text-2xl flex-shrink-0 mt-0.5">{proj.icon}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                        {proj.name}
                      </p>
                      <span className="inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                        {proj.mode === 'waterfall' ? t('projects.waterfall') : t('projects.kanban')}
                      </span>
                      {proj.end_date && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Bis {formatDate(proj.end_date)}
                        </p>
                      )}
                      <div className="mt-3">
                        {hasBudget ? (
                          <>
                            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                              <span>
                                {formatCurrency(spent, currency)} /{' '}
                                {formatCurrency(proj.budget!, currency)}
                              </span>
                              <span>{progress.toFixed(0)}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                              <div
                                className={`h-full rounded-full transition-all ${barColor}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <span className="inline-block text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                            {t('projects.noBudget')}
                          </span>
                        )}
                        {(booked > 0 || forecast > 0) && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {booked > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                                {t('projects.booked')}: {formatCurrency(booked, currency)}
                              </span>
                            )}
                            {forecast > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                                {t('projects.forecast')}: {formatCurrency(forecast, currency)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingProject(proj)
                        setModalOpen(true)
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      aria-label={t('action.edit')}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteProjectId(proj.id)
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      aria-label={t('action.delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Activity Heatmap */}
      <ActivityHeatmap />

      {/* ── Project Modal ──────────────────────────────────────────────────── */}
      <ProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editingProject}
        onSave={handleSave}
        onDelete={editingProject ? () => setDeleteProjectId(editingProject.id) : undefined}
        loading={createMut.isPending || updateMut.isPending}
      />

      {/* ── Delete Confirm Modal ───────────────────────────────────────────── */}
      <Modal
        open={deleteProjectId !== null}
        onClose={() => setDeleteProjectId(null)}
        title={t('action.delete')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Möchtest du dieses Projekt wirklich löschen? Diese Aktion kann nicht rückgängig
              gemacht werden.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteProjectId(null)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => deleteProjectId !== null && deleteMut.mutate(deleteProjectId)}
            >
              {t('action.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
