import { formatCurrency } from '@/lib/utils'
import { useT, type TKey } from '@/lib/i18n'
import { useSettingsStore } from '@/store/useSettingsStore'
import type { ScheduleSuggestion } from '@/types'

const INTERVAL_KEYS: Record<ScheduleSuggestion['interval'], TKey> = {
  weekly: 'suggestions.weekly',
  monthly: 'suggestions.monthly',
  yearly: 'suggestions.yearly',
}

interface SuggestionCardProps {
  suggestion: ScheduleSuggestion
  onRespond: (id: number, action: 'accept' | 'reject' | 'snooze') => void
}

export default function SuggestionCard({ suggestion, onRespond }: SuggestionCardProps) {
  const t = useT()
  const currency = useSettingsStore((s) => s.currency)
  return (
    <div className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Left accent */}
      <div className="absolute inset-y-0 left-0 w-1 bg-blue-500 rounded-l-xl" />

      <div className="pl-4 pr-4 py-4 flex flex-col gap-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
          {t('suggestions.patternDetected')}
        </p>

        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-bold text-gray-900 dark:text-white truncate">
            {suggestion.recipient}
          </span>
          <span className="text-base font-bold text-gray-900 dark:text-white flex-shrink-0 tabular-nums">
            {formatCurrency(suggestion.amount, currency)}
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="capitalize">{t(INTERVAL_KEYS[suggestion.interval])}</span>
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
          <span>{t('suggestions.matchesInMonths', { n: suggestion.match_count })}</span>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onRespond(suggestion.id, 'accept')}
            className="flex-1 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
          >
            {t('suggestions.accept')}
          </button>
          <button
            type="button"
            onClick={() => onRespond(suggestion.id, 'snooze')}
            className="flex-1 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors"
          >
            {t('suggestions.snooze')}
          </button>
          <button
            type="button"
            onClick={() => onRespond(suggestion.id, 'reject')}
            className="flex-1 py-1.5 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium transition-colors"
          >
            {t('suggestions.reject')}
          </button>
        </div>
      </div>
    </div>
  )
}
