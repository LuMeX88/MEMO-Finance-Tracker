import type {
  Category,
  CategoryReport,
  ComparisonReport,
  ForecastResponse,
  OcrResult,
  Project,
  ProjectBoard,
  ProjectColumn,
  ProjectCostSummaryItem,
  ProjectTask,
  ReportSummary,
  Schedule,
  ScheduleSuggestion,
  TimelineEntry,
  Transaction,
  VersionInfo,
  AiStatus,
} from '@/types'

// Resolve the API base URL so it works in every deployment scenario:
//  - Vite dev server (proxies /api -> :8000)
//  - single-container add-on (FastAPI serves the SPA at site root)
//  - behind Home Assistant ingress (served under /api/hassio_ingress/<token>/)
// An explicit VITE_API_URL still overrides everything (e.g. a separate host).
function resolveBaseUrl(): string {
  const override = import.meta.env.VITE_API_URL as string | undefined
  if (override) return override
  if (typeof window !== 'undefined') {
    const base = window.location.pathname.replace(/\/+$/, '')
    return `${base}/api/v1`
  }
  return '/api/v1'
}

const BASE_URL = resolveBaseUrl()

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText)
    throw new Error(`API error ${response.status}: ${message}`)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  return response.json() as Promise<T>
}

function toQueryString(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return ''
  const entries = Object.entries(params).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return ''
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

// ── Transactions ──────────────────────────────────────────────────────────────

export type TransactionParams = {
  start_date?: string
  end_date?: string
  category_id?: number
  project_id?: number
  type?: 'income' | 'expense'
  recipient?: string
  limit?: number
  offset?: number
}

export function getTransactions(params?: TransactionParams): Promise<Transaction[]> {
  return request<Transaction[]>(`/transactions${toQueryString(params)}`)
}

export function createTransaction(
  data: Omit<Transaction, 'id' | 'created_at' | 'category' | 'project'>,
): Promise<Transaction> {
  return request<Transaction>('/transactions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateTransaction(
  id: number,
  data: Partial<Omit<Transaction, 'id' | 'created_at' | 'category' | 'project'>>,
): Promise<Transaction> {
  return request<Transaction>(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteTransaction(id: number): Promise<void> {
  return request<void>(`/transactions/${id}`, { method: 'DELETE' })
}

// ── Categories ────────────────────────────────────────────────────────────────

export function getCategories(): Promise<Category[]> {
  return request<Category[]>('/categories')
}

export function createCategory(
  data: Omit<Category, 'id' | 'created_at'>,
): Promise<Category> {
  return request<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateCategory(
  id: number,
  data: Partial<Omit<Category, 'id' | 'created_at'>>,
): Promise<Category> {
  return request<Category>(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteCategory(id: number): Promise<void> {
  return request<void>(`/categories/${id}`, { method: 'DELETE' })
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function getProjects(): Promise<Project[]> {
  return request<Project[]>('/projects')
}

export function createProject(
  data: Omit<Project, 'id' | 'created_at'>,
): Promise<Project> {
  return request<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateProject(
  id: number,
  data: Partial<Omit<Project, 'id' | 'created_at'>>,
): Promise<Project> {
  return request<Project>(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteProject(id: number): Promise<void> {
  return request<void>(`/projects/${id}`, { method: 'DELETE' })
}

export function getProjectCostSummaries(): Promise<ProjectCostSummaryItem[]> {
  return request<ProjectCostSummaryItem[]>('/projects/cost-summary')
}

// ── Project board (Kanban / Waterfall) ─────────────────────────────────────────

export function getProjectBoard(projectId: number): Promise<ProjectBoard> {
  return request<ProjectBoard>(`/projects/${projectId}/board`)
}

export function createProjectColumn(
  projectId: number,
  data: { name: string; is_done?: boolean },
): Promise<ProjectColumn> {
  return request<ProjectColumn>(`/projects/${projectId}/columns`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateProjectColumn(
  projectId: number,
  columnId: number,
  data: Partial<{ name: string; position: number; is_done: boolean }>,
): Promise<ProjectColumn> {
  return request<ProjectColumn>(`/projects/${projectId}/columns/${columnId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteProjectColumn(
  projectId: number,
  columnId: number,
): Promise<void> {
  return request<void>(`/projects/${projectId}/columns/${columnId}`, {
    method: 'DELETE',
  })
}

export type TaskInput = {
  title: string
  description?: string | null
  cost?: number
  category_id?: number | null
  column_id?: number | null
  start_date?: string | null
  end_date?: string | null
  position?: number
}

export function createProjectTask(
  projectId: number,
  data: TaskInput,
): Promise<ProjectTask> {
  return request<ProjectTask>(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateProjectTask(
  projectId: number,
  taskId: number,
  data: Partial<TaskInput>,
): Promise<ProjectTask> {
  return request<ProjectTask>(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteProjectTask(
  projectId: number,
  taskId: number,
): Promise<void> {
  return request<void>(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'DELETE',
  })
}

// ── Schedules ─────────────────────────────────────────────────────────────────

export function getSchedules(): Promise<Schedule[]> {
  return request<Schedule[]>('/schedules')
}

export function createSchedule(
  data: Omit<Schedule, 'id' | 'created_at' | 'category'>,
): Promise<Schedule> {
  return request<Schedule>('/schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateSchedule(
  id: number,
  data: Partial<Omit<Schedule, 'id' | 'created_at' | 'category'>>,
): Promise<Schedule> {
  return request<Schedule>(`/schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteSchedule(id: number): Promise<void> {
  return request<void>(`/schedules/${id}`, { method: 'DELETE' })
}

// ── Reports ───────────────────────────────────────────────────────────────────

export type ReportParams = {
  start_date?: string
  end_date?: string
}

export function getReportSummary(params?: ReportParams): Promise<ReportSummary> {
  return request<ReportSummary>(`/reports/summary${toQueryString(params)}`)
}

// The backend returns category totals as flat fields; the UI expects a nested
// `category` object plus a computed `percentage`. Map it here so every consumer
// (Dashboard + Reports) gets a consistent shape.
interface RawCategoryTotal {
  category_id: number
  category_name: string
  category_icon: string
  category_color: string
  total: number
  count: number
}

export async function getReportByCategory(params?: ReportParams): Promise<CategoryReport[]> {
  const raw = await request<RawCategoryTotal[]>(`/reports/by-category${toQueryString(params)}`)
  const grandTotal = raw.reduce((sum, r) => sum + r.total, 0)
  return raw.map((r) => ({
    category: {
      id: r.category_id,
      name: r.category_name,
      icon: r.category_icon,
      color: r.category_color,
      archived: false,
      created_at: '',
    },
    total: r.total,
    count: r.count,
    percentage: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0,
  }))
}

export function getReportTimeline(params?: ReportParams): Promise<TimelineEntry[]> {
  return request<TimelineEntry[]>(`/reports/timeline${toQueryString(params)}`)
}

export function getReportComparison(): Promise<ComparisonReport> {
  return request<ComparisonReport>('/reports/comparison')
}

// ── Receipts ──────────────────────────────────────────────────────────────────

export async function scanReceipt(file: File): Promise<OcrResult> {
  const form = new FormData()
  form.append('file', file)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${BASE_URL}/receipts/scan`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json() as Promise<OcrResult>
  } finally {
    clearTimeout(timeout)
  }
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export async function getSuggestions(): Promise<ScheduleSuggestion[]> {
  const res = await fetch(`${BASE_URL}/suggestions`)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<ScheduleSuggestion[]>
}

export async function respondSuggestion(
  id: number,
  action: 'accept' | 'reject' | 'snooze',
): Promise<void> {
  await fetch(`${BASE_URL}/suggestions/${id}/${action}`, { method: 'POST' })
}

export async function detectPatterns(): Promise<{ new_suggestions: number }> {
  const res = await fetch(`${BASE_URL}/suggestions/detect`, { method: 'POST' })
  return res.json() as Promise<{ new_suggestions: number }>
}

// ── Forecast ──────────────────────────────────────────────────────────────────

export async function getForecast(months?: number): Promise<ForecastResponse> {
  const params = months ? `?months=${months}` : ''
  const res = await fetch(`${BASE_URL}/forecast${params}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<ForecastResponse>
}

// ── Version ─────────────────────────────────────────────────────────

export function getVersion(): Promise<VersionInfo> {
  return request<VersionInfo>('/version')
}

// ── AI ────────────────────────────────────────────────────────────────

export function getAiStatus(): Promise<AiStatus> {
  return request<AiStatus>('/ai/status')
}

export function setAiEnabled(enabled: boolean): Promise<AiStatus> {
  return request<AiStatus>('/ai/enabled', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  })
}

// ── Demo data ─────────────────────────────────────────────────────────

export type DemoResult = {
  transactions: number
  projects: number
  schedules: number
}

export function loadDemoData(): Promise<DemoResult> {
  return request<DemoResult>('/demo/load', { method: 'POST' })
}

export function eraseDemoData(): Promise<DemoResult> {
  return request<DemoResult>('/demo/erase', { method: 'POST' })
}

// ── Suggested categories ──────────────────────────────────────────────

export function addSuggestedCategories(): Promise<{ created: number; skipped: number }> {
  return request<{ created: number; skipped: number }>('/categories/suggested', {
    method: 'POST',
  })
}

export function eraseSuggestedCategories(): Promise<{ deleted: number; skipped: number }> {
  return request<{ deleted: number; skipped: number }>('/categories/suggested', {
    method: 'DELETE',
  })
}

export async function getAiInsight(currency: string): Promise<string> {
  const res = await request<{ insight: string }>(
    `/ai/insight${toQueryString({ currency })}`,
    { method: 'POST' },
  )
  return res.insight
}
