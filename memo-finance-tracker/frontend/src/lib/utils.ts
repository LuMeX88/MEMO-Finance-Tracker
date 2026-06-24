import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInCalendarDays, parseISO } from 'date-fns'
import { useSettingsStore } from '@/store/useSettingsStore'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function localeForLanguage(language: string): string {
  return language === 'en' ? 'en-GB' : 'de-CH'
}

export function formatCurrency(
  amount: number,
  currency = 'CHF',
  locale?: string,
): string {
  const resolved = locale ?? localeForLanguage(useSettingsStore.getState().language)
  return new Intl.NumberFormat(resolved, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'dd.MM.yyyy')
}

export function getDaysUntil(dateStr: string): number {
  return differenceInCalendarDays(parseISO(dateStr), new Date())
}

export function getMonthName(dateStr: string): string {
  return format(parseISO(dateStr), 'MMMM yyyy')
}
