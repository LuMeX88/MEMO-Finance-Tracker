import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoUrl from '@/assets/logo.png'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { TKey } from '@/lib/i18n'
import type { CategoryReport, ReportSummary, TimelineEntry } from '@/types'

type TFunc = (key: TKey, vars?: Record<string, string | number>) => string

export interface ReportExportData {
  summary?: ReportSummary
  byCategory: CategoryReport[]
  timeline: TimelineEntry[]
  startDate: string
  endDate: string
  periodLabel: string
  currency: string
  t: TFunc
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileBase(data: ReportExportData): string {
  return `MEMO_Report_${data.startDate}_${data.endDate}`
}

function summaryRows(data: ReportExportData): Array<[string, number | null]> {
  const { summary, t } = data
  if (!summary) return []
  return [
    [t('reports.totalIncome'), summary.total_income],
    [t('reports.totalExpenses'), summary.total_expenses],
    [t('reports.balance'), summary.total_income - summary.total_expenses],
    [t('reports.avgPerMonth'), summary.avg_per_month],
    [t('reports.avgPerTransaction'), summary.avg_per_transaction],
    [t('reports.biggestExpense'), summary.biggest_expense?.amount ?? null],
  ]
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

function csvRow(...cells: Array<string | number>): string {
  return cells.map(csvCell).join(',')
}

export function exportReportCsv(data: ReportExportData): void {
  const { t, currency } = data
  const num = (n: number) => n.toFixed(2)
  const amountHeader = `${t('reports.amount')} (${currency})`

  const lines: string[] = []
  lines.push(csvRow('MEMO – Finance Tracker'))
  lines.push(csvRow(`${t('reports.period')}: ${data.periodLabel}`))
  lines.push('')

  // Summary
  lines.push(csvRow(t('reports.summary')))
  for (const [label, value] of summaryRows(data)) {
    lines.push(csvRow(label, value === null ? '—' : num(value)))
  }
  lines.push('')

  // By category
  if (data.byCategory.length > 0) {
    lines.push(csvRow(t('reports.byCategory')))
    lines.push(csvRow(t('reports.category'), amountHeader, t('reports.count'), `${t('reports.share')} %`))
    for (const c of data.byCategory) {
      lines.push(csvRow(c.category.name, num(c.total), c.count, c.percentage.toFixed(1)))
    }
    lines.push('')
  }

  // Timeline
  if (data.timeline.length > 0) {
    lines.push(csvRow(t('reports.timeline')))
    lines.push(csvRow(t('reports.date'), `${t('reports.income')} (${currency})`, `${t('reports.expenses')} (${currency})`))
    for (const entry of data.timeline) {
      lines.push(csvRow(entry.date, num(entry.income), num(entry.expenses)))
    }
  }

  // Prepend a UTF-8 BOM so spreadsheet apps detect umlauts/€ correctly.
  const csv = '\uFEFF' + lines.join('\r\n')
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase(data)}.csv`)
}

// ── PDF export (A4, with logo) ──────────────────────────────────────────────────

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('logo load failed'))
    img.src = url
  })
}

const PRIMARY: [number, number, number] = [99, 102, 241]
const MARGIN = 14

export async function exportReportPdf(data: ReportExportData): Promise<void> {
  const { t, currency } = data
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header: logo + title
  let headerBottom = 24
  try {
    const img = await loadImage(logoUrl)
    const size = 20
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1
    const w = ratio >= 1 ? size : size * ratio
    const h = ratio >= 1 ? size / ratio : size
    doc.addImage(img, 'PNG', MARGIN, 12, w, h)
    headerBottom = Math.max(headerBottom, 12 + h)
  } catch {
    // Logo is optional — continue without it.
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(17, 24, 39)
  doc.text('MEMO – Finance Tracker', MARGIN + 24, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text(`${t('reports.report')} · ${data.periodLabel}`, MARGIN + 24, 27)

  doc.setDrawColor(229, 231, 235)
  doc.line(MARGIN, headerBottom + 4, pageWidth - MARGIN, headerBottom + 4)

  let cursorY = headerBottom + 10

  const tableTheme = {
    margin: { left: MARGIN, right: MARGIN },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' as const, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [55, 65, 81] as [number, number, number] },
    alternateRowStyles: { fillColor: [243, 244, 246] as [number, number, number] },
  }

  const advance = () => {
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    if (last) cursorY = last.finalY + 10
  }

  // Summary
  const rows = summaryRows(data)
  if (rows.length > 0) {
    autoTable(doc, {
      ...tableTheme,
      startY: cursorY,
      head: [[t('reports.summary'), `${t('reports.amount')} (${currency})`]],
      body: rows.map(([label, value]) => [
        label,
        value === null ? '—' : formatCurrency(value, currency),
      ]),
      columnStyles: { 1: { halign: 'right' } },
    })
    advance()
  }

  // By category
  if (data.byCategory.length > 0) {
    autoTable(doc, {
      ...tableTheme,
      startY: cursorY,
      head: [[t('reports.byCategory'), `${t('reports.amount')} (${currency})`, t('reports.count'), `${t('reports.share')} %`]],
      body: data.byCategory.map((c) => [
        c.category.name,
        formatCurrency(c.total, currency),
        String(c.count),
        `${c.percentage.toFixed(1)} %`,
      ]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    })
    advance()
  }

  // Timeline
  if (data.timeline.length > 0) {
    autoTable(doc, {
      ...tableTheme,
      startY: cursorY,
      head: [[t('reports.date'), `${t('reports.income')} (${currency})`, `${t('reports.expenses')} (${currency})`]],
      body: data.timeline.map((entry) => [
        formatDate(entry.date),
        formatCurrency(entry.income, currency),
        formatCurrency(entry.expenses, currency),
      ]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    })
    advance()
  }

  // Footer on every page: generation date (left) + page number (right)
  const generated = `${t('reports.generatedAt')}: ${formatDate(new Date().toISOString().split('T')[0])}`
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(156, 163, 175)
    doc.text(generated, MARGIN, pageHeight - 8)
    doc.text(`${t('reports.page')} ${i} / ${pageCount}`, pageWidth - MARGIN, pageHeight - 8, {
      align: 'right',
    })
  }

  doc.save(`${fileBase(data)}.pdf`)
}
