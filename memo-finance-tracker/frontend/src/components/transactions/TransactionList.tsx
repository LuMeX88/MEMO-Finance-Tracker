import { useState, useRef } from 'react'
import { Trash2, Briefcase } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useT } from '@/lib/i18n'
import type { Transaction } from '@/types'

interface TransactionListProps {
  transactions: Transaction[]
  onEdit: (t: Transaction) => void
  onDelete: (id: number) => void
}

interface RowProps {
  transaction: Transaction
  onEdit: (t: Transaction) => void
  onDelete: (id: number) => void
  currency: string
}

const SWIPE_THRESHOLD = 60

function TransactionRow({ transaction, onEdit, onDelete, currency }: RowProps) {
  const t = useT()
  const [offsetX, setOffsetX] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [hovered, setHovered] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const isDragging = useRef(false)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    isDragging.current = false
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.touches[0].clientX
    if (diff > 5) isDragging.current = true
    const clamped = Math.max(0, Math.min(diff, 90))
    setOffsetX(clamped)
  }

  function handleTouchEnd() {
    if (offsetX >= SWIPE_THRESHOLD) {
      setOffsetX(80)
    } else {
      setOffsetX(0)
    }
    touchStartX.current = null
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    triggerDelete()
  }

  function triggerDelete() {
    setDeleting(true)
    setTimeout(() => onDelete(transaction.id), 280)
  }

  function handleRowClick() {
    if (isDragging.current) return
    onEdit(transaction)
  }

  const category = transaction.category
  const isIncome = transaction.type === 'income'

  return (
    <div
      className={cn(
        'relative overflow-hidden transition-all duration-300',
        deleting && 'opacity-0 max-h-0 scale-y-0',
        !deleting && 'opacity-100 max-h-20',
      )}
      style={{ transitionProperty: 'opacity, max-height, transform' }}
    >
      {/* Red delete background */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 px-5 rounded-r-xl"
        style={{ width: '80px' }}
      >
        <Trash2 size={18} className="text-white" />
      </div>

      {/* Row */}
      <div
        className={cn(
          'relative flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800',
          'cursor-pointer select-none',
          'hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors',
        )}
        style={{
          transform: `translateX(-${offsetX}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.2s ease',
        }}
        onClick={handleRowClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Category color dot */}
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: category?.color ?? '#94a3b8' }}
        />

        {/* Icon + details */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {category?.icon && (
            <span className="text-base leading-none">{category.icon}</span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {transaction.recipient}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
              {category?.name ?? '—'} · {formatDate(transaction.date)}
            </p>
            {transaction.project_name && (
              <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 max-w-full">
                <Briefcase size={10} className="shrink-0" />
                <span className="truncate">{t('transaction.fromProject')}: {transaction.project_name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Amount + delete icon */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              isIncome
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-500 dark:text-red-400',
            )}
          >
            {isIncome ? '+' : '-'}
            {formatCurrency(transaction.amount, currency)}
          </span>

          {/* Desktop trash icon */}
          <button
            type="button"
            aria-label={t('action.delete')}
            onClick={handleDeleteClick}
            className={cn(
              'p-1 rounded text-gray-300 hover:text-red-500 transition-colors hidden md:flex items-center',
              hovered ? 'opacity-100' : 'opacity-0',
            )}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TransactionList({
  transactions,
  onEdit,
  onDelete,
}: TransactionListProps) {
  const currency = useSettingsStore((s) => s.currency)

  if (transactions.length === 0) return null

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
      {transactions.map((t) => (
        <TransactionRow
          key={t.id}
          transaction={t}
          onEdit={onEdit}
          onDelete={onDelete}
          currency={currency}
        />
      ))}
    </div>
  )
}
