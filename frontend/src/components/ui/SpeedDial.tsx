import { useState, useEffect, useRef } from 'react'
import { Plus, TrendingDown, TrendingUp, FolderPlus, Tag, ScanLine } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { useUIStore } from '@/store/useUIStore'

interface Action {
  icon: React.ReactNode
  label: string
  bg: string
  onClick: () => void
}

export default function SpeedDial() {
  const t        = useT()
  const navigate = useNavigate()
  const openAs   = useUIStore((s) => s.openQuickAddAs)
  const openScan = useUIStore((s) => s.openQuickAddWithScan)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const actions: Action[] = [
    {
      icon: <TrendingDown size={20} />,
      label: t('action.newExpense'),
      bg: 'bg-rose-500 hover:bg-rose-600',
      onClick: () => { setOpen(false); openAs('expense') },
    },
    {
      icon: <TrendingUp size={20} />,
      label: t('action.newIncome'),
      bg: 'bg-emerald-500 hover:bg-emerald-600',
      onClick: () => { setOpen(false); openAs('income') },
    },
    {
      icon: <ScanLine size={20} />,
      label: t('action.scanReceipt'),
      bg: 'bg-amber-500 hover:bg-amber-600',
      onClick: () => { setOpen(false); openScan() },
    },
    {
      icon: <FolderPlus size={20} />,
      label: t('action.newProject'),
      bg: 'bg-blue-500 hover:bg-blue-600',
      onClick: () => { setOpen(false); navigate('/projects?new=1') },
    },
    {
      icon: <Tag size={20} />,
      label: t('action.newCategory'),
      bg: 'bg-violet-500 hover:bg-violet-600',
      onClick: () => { setOpen(false); navigate('/categories?new=1') },
    },
  ]

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        ref={ref}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-5 md:bottom-8 md:right-8 z-40 flex flex-col items-end gap-3"
      >
        {/* Action rows – stacked above the FAB */}
        {actions.map((action, i) => (
          <button
            key={action.label}
            onClick={action.onClick}
            aria-label={action.label}
            className={cn(
              'flex items-center gap-3 transition-all duration-200 cursor-pointer',
              open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none',
            )}
            style={{ transitionDelay: open ? `${i * 50}ms` : `${(actions.length - 1 - i) * 30}ms` }}
          >
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-100 bg-white dark:bg-gray-800 shadow-md px-3.5 py-2 rounded-full border border-gray-200 dark:border-gray-700 whitespace-nowrap select-none">
              {action.label}
            </span>
            <span
              className={cn('w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg shrink-0', action.bg)}
            >
              {action.icon}
            </span>
          </button>
        ))}

        {/* Main FAB */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Schliessen' : 'Aktionen'}
          aria-expanded={open}
          className={cn(
            'w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 focus:outline-none',
            open
              ? 'bg-gray-700 dark:bg-gray-500 rotate-45'
              : 'bg-primary-600 hover:bg-primary-700 hover:scale-110',
          )}
        >
          <Plus size={30} className="text-white" />
        </button>
      </div>
    </>
  )
}

