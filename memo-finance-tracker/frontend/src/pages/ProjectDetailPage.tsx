import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Star,
  Calendar,
  LayoutGrid,
  Receipt,
  AlertTriangle,
} from 'lucide-react'
import {
  getProjectBoard,
  updateProject,
  createProjectColumn,
  updateProjectColumn,
  deleteProjectColumn,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  type TaskInput,
} from '@/lib/api'
import type { ProjectBoard, ProjectColumn, ProjectTask } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { useT } from '@/lib/i18n'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

// ─── Cost stat card ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'forecast' | 'booked' | 'spent'
}) {
  const toneClass =
    tone === 'forecast'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'booked'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'spent'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-gray-900 dark:text-white'
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate">
        {label}
      </p>
      <p className={`text-base font-bold mt-0.5 ${toneClass}`}>{value}</p>
    </div>
  )
}

// ─── Task badge (forecast / booked) ────────────────────────────────────────────

function CostBadge({ booked }: { booked: boolean }) {
  const t = useT()
  return (
    <span
      className={
        'inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full ' +
        (booked
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300')
      }
    >
      {booked ? t('projects.booked') : t('projects.forecast')}
    </span>
  )
}

// ─── Task card (Kanban) ────────────────────────────────────────────────────────

function TaskCard({
  task,
  currency,
  columns,
  onEdit,
  onDelete,
  onMove,
  onDragStart,
}: {
  task: ProjectTask
  currency: string
  columns: ProjectColumn[]
  onEdit: () => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onDragStart: () => void
}) {
  const idx = columns.findIndex((c) => c.id === task.column_id)
  const canPrev = idx > 0
  const canNext = idx >= 0 && idx < columns.length - 1

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 shadow-sm cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-white break-words flex-1">
          {task.title}
        </p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onEdit}
            className="p-1 rounded text-gray-400 hover:text-blue-600"
            aria-label="edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded text-gray-400 hover:text-red-600"
            aria-label="delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-words">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between mt-2 gap-2">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {formatCurrency(task.cost, currency)}
        </span>
        <CostBadge booked={task.booked} />
      </div>

      {/* Move between columns (touch-friendly fallback for drag & drop) */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
        <button
          onClick={() => onMove(-1)}
          disabled={!canPrev}
          className="p-1 rounded text-gray-400 enabled:hover:text-primary-600 disabled:opacity-30"
          aria-label="move left"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={!canNext}
          className="p-1 rounded text-gray-400 enabled:hover:text-primary-600 disabled:opacity-30"
          aria-label="move right"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Task modal ────────────────────────────────────────────────────────────────

type TaskFormState = {
  title: string
  description: string
  cost: string
  column_id: string
  start_date: string
  end_date: string
}

function TaskModal({
  open,
  onClose,
  mode,
  columns,
  editing,
  defaultColumnId,
  onSubmit,
  loading,
}: {
  open: boolean
  onClose: () => void
  mode: 'kanban' | 'waterfall'
  columns: ProjectColumn[]
  editing: ProjectTask | null
  defaultColumnId: number | null
  onSubmit: (data: TaskInput, taskId?: number) => void
  loading: boolean
}) {
  const t = useT()
  const [form, setForm] = useState<TaskFormState>({
    title: '',
    description: '',
    cost: '',
    column_id: '',
    start_date: '',
    end_date: '',
  })

  useEffect(() => {
    if (open) {
      setForm({
        title: editing?.title ?? '',
        description: editing?.description ?? '',
        cost: editing?.cost != null ? String(editing.cost) : '',
        column_id: String(
          editing?.column_id ?? defaultColumnId ?? columns[0]?.id ?? '',
        ),
        start_date: editing?.start_date ?? '',
        end_date: editing?.end_date ?? '',
      })
    }
  }, [open, editing, defaultColumnId, columns])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const payload: TaskInput = {
      title: form.title,
      description: form.description || null,
      cost: form.cost ? parseFloat(form.cost) : 0,
    }
    if (mode === 'kanban') {
      payload.column_id = form.column_id ? parseInt(form.column_id) : null
    } else {
      payload.start_date = form.start_date || null
      payload.end_date = form.end_date || null
    }
    onSubmit(payload, editing?.id)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('projects.editTask') : t('projects.newTask')}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('projects.taskTitle')}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
          autoFocus
        />
        <Input
          label={t('projects.taskDescription')}
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
        />
        <Input
          label={t('projects.taskCost')}
          type="number"
          step="0.01"
          min="0"
          value={form.cost}
          onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
          placeholder="0.00"
        />

        {mode === 'kanban' ? (
          <Select
            label={t('projects.column')}
            value={form.column_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, column_id: e.target.value }))
            }
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('projects.startDate')}
              type="date"
              value={form.start_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, start_date: e.target.value }))
              }
            />
            <Input
              label={t('projects.endDate')}
              type="date"
              value={form.end_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, end_date: e.target.value }))
              }
            />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
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

// ─── Column modal ──────────────────────────────────────────────────────────────

function ColumnModal({
  open,
  onClose,
  editing,
  onSubmit,
  onDelete,
  loading,
}: {
  open: boolean
  onClose: () => void
  editing: ProjectColumn | null
  onSubmit: (name: string, isDone: boolean, columnId?: number) => void
  onDelete?: () => void
  loading: boolean
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setIsDone(editing?.is_done ?? false)
    }
  }, [open, editing])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('projects.editColumn') : t('projects.newColumn')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(name, isDone, editing?.id)
        }}
        className="space-y-4"
      >
        <Input
          label={t('projects.columnName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
        <button
          type="button"
          onClick={() => setIsDone((v) => !v)}
          className="flex items-center gap-3 w-full text-left"
        >
          <span
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              isDone ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                isDone ? 'translate-x-5' : ''
              }`}
            />
          </span>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {t('projects.doneColumn')}
          </span>
        </button>
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
          {t('projects.doneColumnHint')}
        </p>

        <div className="flex gap-3 pt-2">
          {editing && onDelete && (
            <Button type="button" variant="danger" size="sm" onClick={onDelete}>
              <Trash2 size={14} />
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currency = useSettingsStore((s) => s.currency)
  const addToast = useUIStore((s) => s.addToast)
  const t = useT()

  const boardKey = ['project-board', projectId] as const

  const [taskModal, setTaskModal] = useState<{
    open: boolean
    editing: ProjectTask | null
    columnId: number | null
  }>({ open: false, editing: null, columnId: null })
  const [columnModal, setColumnModal] = useState<{
    open: boolean
    editing: ProjectColumn | null
  }>({ open: false, editing: null })
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null)

  const { data: board, isLoading } = useQuery({
    queryKey: boardKey,
    queryFn: () => getProjectBoard(projectId),
    enabled: Number.isFinite(projectId),
  })

  // Booking a task creates/updates/removes a real expense transaction, so a
  // board change must also refresh everything that reads transactions: the
  // bookings list, reports, the activity heatmap and the projects overview.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: boardKey })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['transactions-heatmap'] })
    queryClient.invalidateQueries({ queryKey: ['project-cost-summaries'] })
    queryClient.invalidateQueries({ queryKey: ['report-summary'] })
    queryClient.invalidateQueries({ queryKey: ['report-by-category'] })
    queryClient.invalidateQueries({ queryKey: ['report-category'] })
    queryClient.invalidateQueries({ queryKey: ['report-timeline'] })
    queryClient.invalidateQueries({ queryKey: ['report-comparison'] })
    queryClient.invalidateQueries({ queryKey: ['forecast'] })
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  const modeMut = useMutation({
    mutationFn: (mode: 'kanban' | 'waterfall') =>
      updateProject(projectId, { mode }),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const createTaskMut = useMutation({
    mutationFn: (data: TaskInput) => createProjectTask(projectId, data),
    onSuccess: () => {
      invalidate()
      setTaskModal({ open: false, editing: null, columnId: null })
      addToast(t('projects.taskSaved'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const updateTaskMut = useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data: Partial<TaskInput> }) =>
      updateProjectTask(projectId, taskId, data),
    onSuccess: () => {
      invalidate()
      setTaskModal({ open: false, editing: null, columnId: null })
      addToast(t('projects.taskSaved'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const moveTaskMut = useMutation({
    mutationFn: ({ taskId, columnId }: { taskId: number; columnId: number }) =>
      updateProjectTask(projectId, taskId, { column_id: columnId }),
    onMutate: async ({ taskId, columnId }) => {
      await queryClient.cancelQueries({ queryKey: boardKey })
      const prev = queryClient.getQueryData<ProjectBoard>(boardKey)
      if (prev) {
        const targetDone =
          prev.columns.find((c) => c.id === columnId)?.is_done ?? false
        queryClient.setQueryData<ProjectBoard>(boardKey, {
          ...prev,
          tasks: prev.tasks.map((tk) =>
            tk.id === taskId
              ? { ...tk, column_id: columnId, booked: targetDone }
              : tk,
          ),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(boardKey, ctx.prev)
      addToast(t('common.error'), 'error')
    },
    onSettled: () => invalidate(),
  })

  const deleteTaskMut = useMutation({
    mutationFn: (taskId: number) => deleteProjectTask(projectId, taskId),
    onSuccess: () => {
      invalidate()
      setDeleteTaskId(null)
      addToast(t('projects.taskDeleted'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const createColumnMut = useMutation({
    mutationFn: ({ name, isDone }: { name: string; isDone: boolean }) =>
      createProjectColumn(projectId, { name, is_done: isDone }),
    onSuccess: () => {
      invalidate()
      setColumnModal({ open: false, editing: null })
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const updateColumnMut = useMutation({
    mutationFn: ({
      columnId,
      name,
      isDone,
    }: {
      columnId: number
      name: string
      isDone: boolean
    }) => updateProjectColumn(projectId, columnId, { name, is_done: isDone }),
    onSuccess: () => {
      invalidate()
      setColumnModal({ open: false, editing: null })
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const deleteColumnMut = useMutation({
    mutationFn: (columnId: number) =>
      deleteProjectColumn(projectId, columnId),
    onSuccess: () => {
      invalidate()
      setColumnModal({ open: false, editing: null })
    },
    onError: () =>
      addToast(t('projects.columnDeleteError'), 'error'),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleTaskSubmit(data: TaskInput, taskId?: number) {
    if (taskId) updateTaskMut.mutate({ taskId, data })
    else createTaskMut.mutate(data)
  }

  function handleColumnSubmit(name: string, isDone: boolean, columnId?: number) {
    if (columnId) updateColumnMut.mutate({ columnId, name, isDone })
    else createColumnMut.mutate({ name, isDone })
  }

  function moveTaskRelative(task: ProjectTask, dir: -1 | 1) {
    if (!board) return
    const idx = board.columns.findIndex((c) => c.id === task.column_id)
    const target = board.columns[idx + dir]
    if (target) moveTaskMut.mutate({ taskId: task.id, columnId: target.id })
  }

  function dropOnColumn(columnId: number) {
    setDragOverColumn(null)
    const taskId = draggingId
    setDraggingId(null)
    if (taskId == null) return
    const task = board?.tasks.find((tk) => tk.id === taskId)
    if (task && task.column_id !== columnId) {
      moveTaskMut.mutate({ taskId, columnId })
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!Number.isFinite(projectId)) {
    return <div className="p-6 text-gray-500">{t('common.error')}</div>
  }

  if (isLoading || !board) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-48 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    )
  }

  const { project, columns, tasks, summary } = board
  const budget = summary.budget
  const overBudget = budget != null && budget > 0 && summary.planned_cost > budget
  const budgetPct =
    budget && budget > 0
      ? Math.min((summary.planned_cost / budget) * 100, 100)
      : 0

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/projects')}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label={t('action.cancel')}
        >
          <ArrowLeft size={20} />
        </button>
        {project.icon && <span className="text-2xl">{project.icon}</span>}
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white truncate flex-1">
          {project.name}
        </h1>
        <button
          onClick={() => navigate(`/transactions?project=${project.id}`)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
        >
          <Receipt size={14} />
          {t('reports.viewTransactions')}
        </button>
      </div>

      {/* ── Mode toggle ────────────────────────────────────────────────────── */}
      <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
        <button
          onClick={() => project.mode !== 'kanban' && modeMut.mutate('kanban')}
          className={
            'inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-1.5 transition-colors ' +
            (project.mode === 'kanban'
              ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400')
          }
        >
          <LayoutGrid size={15} />
          {t('projects.kanban')}
        </button>
        <button
          onClick={() =>
            project.mode !== 'waterfall' && modeMut.mutate('waterfall')
          }
          className={
            'inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-1.5 transition-colors ' +
            (project.mode === 'waterfall'
              ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400')
          }
        >
          <Calendar size={15} />
          {t('projects.waterfall')}
        </button>
      </div>

      {/* ── Cost summary ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label={t('projects.forecast')}
          value={formatCurrency(summary.forecast_cost, currency)}
          tone="forecast"
        />
        <StatCard
          label={t('projects.booked')}
          value={formatCurrency(summary.booked_cost, currency)}
          tone="booked"
        />
        <StatCard
          label={t('projects.plannedTotal')}
          value={formatCurrency(summary.planned_cost, currency)}
        />
        <StatCard
          label={t('projects.spentReal')}
          value={formatCurrency(summary.spent, currency)}
          tone="spent"
        />
      </div>

      {/* ── Budget bar ─────────────────────────────────────────────────────── */}
      {budget != null && budget > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <span>
              {t('projects.plannedTotal')}:{' '}
              {formatCurrency(summary.planned_cost, currency)} /{' '}
              {formatCurrency(budget, currency)}
            </span>
            <span className={overBudget ? 'text-red-500 font-semibold' : ''}>
              {budget > 0
                ? `${((summary.planned_cost / budget) * 100).toFixed(0)}%`
                : ''}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700">
            <div
              className={`h-full rounded-full transition-all ${
                overBudget
                  ? 'bg-red-500'
                  : budgetPct >= 75
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Board ──────────────────────────────────────────────────────────── */}
      {project.mode === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 items-start">
          {columns.map((col) => {
            const colTasks = tasks.filter((tk) => tk.column_id === col.id)
            const colSum = colTasks.reduce((s, tk) => s + tk.cost, 0)
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverColumn(col.id)
                }}
                onDragLeave={() => setDragOverColumn((c) => (c === col.id ? null : c))}
                onDrop={() => dropOnColumn(col.id)}
                className={
                  'w-64 shrink-0 rounded-xl border p-2.5 flex flex-col gap-2 transition-colors ' +
                  (dragOverColumn === col.id
                    ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50')
                }
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {col.is_done && (
                      <Star
                        size={13}
                        className="text-emerald-500 fill-emerald-500 shrink-0"
                      />
                    )}
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {col.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      setColumnModal({ open: true, editing: col })
                    }
                    className="p-1 rounded text-gray-400 hover:text-blue-600 shrink-0"
                    aria-label={t('projects.editColumn')}
                  >
                    <Pencil size={13} />
                  </button>
                </div>

                {colSum > 0 && (
                  <span className="text-[11px] text-gray-400 px-1 -mt-1">
                    {formatCurrency(colSum, currency)}
                  </span>
                )}

                {colTasks.map((tk) => (
                  <TaskCard
                    key={tk.id}
                    task={tk}
                    currency={currency}
                    columns={columns}
                    onEdit={() =>
                      setTaskModal({
                        open: true,
                        editing: tk,
                        columnId: col.id,
                      })
                    }
                    onDelete={() => setDeleteTaskId(tk.id)}
                    onMove={(dir) => moveTaskRelative(tk, dir)}
                    onDragStart={() => setDraggingId(tk.id)}
                  />
                ))}

                <button
                  onClick={() =>
                    setTaskModal({
                      open: true,
                      editing: null,
                      columnId: col.id,
                    })
                  }
                  className="flex items-center justify-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 py-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700/50 transition-colors"
                >
                  <Plus size={14} />
                  {t('projects.addTask')}
                </button>
              </div>
            )
          })}

          {/* Add column */}
          <button
            onClick={() => setColumnModal({ open: true, editing: null })}
            className="w-44 shrink-0 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 hover:text-primary-600 hover:border-primary-400 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            {t('projects.addColumn')}
          </button>
        </div>
      ) : (
        <WaterfallView
          tasks={tasks}
          currency={currency}
          onEdit={(tk) =>
            setTaskModal({ open: true, editing: tk, columnId: null })
          }
          onDelete={(taskId) => setDeleteTaskId(taskId)}
          onAdd={() =>
            setTaskModal({ open: true, editing: null, columnId: null })
          }
        />
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <TaskModal
        open={taskModal.open}
        onClose={() =>
          setTaskModal({ open: false, editing: null, columnId: null })
        }
        mode={project.mode}
        columns={columns}
        editing={taskModal.editing}
        defaultColumnId={taskModal.columnId}
        onSubmit={handleTaskSubmit}
        loading={createTaskMut.isPending || updateTaskMut.isPending}
      />

      <ColumnModal
        open={columnModal.open}
        onClose={() => setColumnModal({ open: false, editing: null })}
        editing={columnModal.editing}
        onSubmit={handleColumnSubmit}
        onDelete={
          columnModal.editing
            ? () => deleteColumnMut.mutate(columnModal.editing!.id)
            : undefined
        }
        loading={createColumnMut.isPending || updateColumnMut.isPending}
      />

      <Modal
        open={deleteTaskId !== null}
        onClose={() => setDeleteTaskId(null)}
        title={t('projects.deleteTask')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="text-red-500 flex-shrink-0 mt-0.5"
              size={20}
            />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('projects.deleteTaskConfirm')}
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTaskId(null)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deleteTaskMut.isPending}
              onClick={() =>
                deleteTaskId !== null && deleteTaskMut.mutate(deleteTaskId)
              }
            >
              {t('action.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Waterfall view ────────────────────────────────────────────────────────────

function WaterfallView({
  tasks,
  currency,
  onEdit,
  onDelete,
  onAdd,
}: {
  tasks: ProjectTask[]
  currency: string
  onEdit: (task: ProjectTask) => void
  onDelete: (taskId: number) => void
  onAdd: () => void
}) {
  const t = useT()

  const sorted = [...tasks].sort((a, b) => {
    if (a.start_date && b.start_date) return a.start_date.localeCompare(b.start_date)
    if (a.start_date) return -1
    if (b.start_date) return 1
    return a.position - b.position
  })

  // Timeline bounds across all dated tasks
  const dated = sorted.filter((tk) => tk.start_date || tk.end_date)
  const times = dated.flatMap((tk) =>
    [tk.start_date, tk.end_date].filter(Boolean).map((d) => new Date(d as string).getTime()),
  )
  const min = times.length ? Math.min(...times) : 0
  const max = times.length ? Math.max(...times) : 0
  const span = max - min || 1

  function barStyle(tk: ProjectTask): React.CSSProperties {
    const s = tk.start_date ? new Date(tk.start_date).getTime() : min
    const e = tk.end_date ? new Date(tk.end_date).getTime() : s
    const left = ((s - min) / span) * 100
    const width = Math.max(((e - s) / span) * 100, 2)
    return { marginLeft: `${left}%`, width: `${width}%` }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onAdd}>
          <Plus size={15} />
          {t('projects.addTask')}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-400">
          {t('projects.noTasks')}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((tk) => (
            <div
              key={tk.id}
              className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {tk.title}
                    </span>
                    <CostBadge booked={tk.booked} />
                  </div>
                  {tk.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {tk.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {tk.start_date ? formatDate(tk.start_date) : '—'}
                    {' → '}
                    {tk.end_date ? formatDate(tk.end_date) : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {formatCurrency(tk.cost, currency)}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(tk)}
                      className="p-1 rounded text-gray-400 hover:text-blue-600"
                      aria-label="edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(tk.id)}
                      className="p-1 rounded text-gray-400 hover:text-red-600"
                      aria-label="delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Mini timeline bar */}
              {(tk.start_date || tk.end_date) && (
                <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700">
                  <div
                    className={`h-full rounded-full ${
                      tk.booked ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}
                    style={barStyle(tk)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
