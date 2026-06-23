export interface Category {
  id: number
  name: string
  icon: string
  color: string
  archived: boolean
  created_at: string
}

export interface Project {
  id: number
  name: string
  budget: number | null
  end_date: string | null
  archived: boolean
  created_at: string
}

export interface Transaction {
  id: number
  date: string
  recipient: string
  category_id: number
  category?: Category
  amount: number
  type: 'income' | 'expense'
  project_id: number | null
  project?: Project
  payment_method: string | null
  note: string | null
  created_at: string
}

export interface Schedule {
  id: number
  name: string
  amount: number
  is_variable: boolean
  estimated_amount: number | null
  interval: 'weekly' | 'monthly' | 'yearly'
  next_due_date: string
  category_id: number
  category?: Category
  active: boolean
  created_at: string
}

export interface ReportSummary {
  total_income: number
  total_expenses: number
  avg_per_month: number
  avg_per_transaction: number
  this_month_income: number
  this_month_expenses: number
  balance_this_month: number
  biggest_expense: Transaction | null
}

export interface CategoryReport {
  category: Category
  total: number
  count: number
  percentage: number
}

export interface TimelineEntry {
  date: string
  income: number
  expenses: number
  balance: number
}

export interface ComparisonReport {
  current_month: {
    income: number
    expenses: number
    balance: number
  }
  previous_month: {
    income: number
    expenses: number
    balance: number
  }
  same_month_last_year: {
    income: number
    expenses: number
    balance: number
  }
}

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

export interface OcrResult {
  ocr_available: boolean
  amount: number | null
  date: string | null
  merchant: string | null
  category_name: string | null
  raw_text: string
  amount_found?: boolean
  date_found?: boolean
  recipient_found?: boolean
  used_ai?: boolean
  error?: string
}

export interface AiStatus {
  enabled: boolean
  state: 'disabled' | 'downloading' | 'loading' | 'ready' | 'error'
  ready: boolean
  detail: string
  model: string
}

export interface ScheduleSuggestion {
  id: number
  recipient: string
  amount: number
  interval: 'weekly' | 'monthly' | 'yearly'
  status: 'pending' | 'accepted' | 'rejected' | 'snoozed'
  match_count: number
  created_at: string
}

export interface MonthForecast {
  year: number
  month: number
  label: string
  scheduled_fixed: number
  scheduled_variable: number
  variable_avg: number
  total: number
  is_past: boolean
}

export interface ForecastResponse {
  months: MonthForecast[]
  variable_monthly_avg: number
}

export interface VersionInfo {
  version: string
  build_date: string
}
