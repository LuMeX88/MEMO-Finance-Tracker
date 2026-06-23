import { useRef, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Moon, Sun, Download, Upload, Trash2, ExternalLink, AlertTriangle, Database, Tags } from 'lucide-react'
import { format } from 'date-fns'
import {
  getCategories,
  getProjects,
  getTransactions,
  getSchedules,
  createCategory,
  createProject,
  createTransaction,
  createSchedule,
  getVersion,
  getAiStatus,
  setAiEnabled,
  loadDemoData,
  eraseDemoData,
  addSuggestedCategories,
  eraseSuggestedCategories,
} from '@/lib/api'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { useT } from '@/lib/i18n'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest pt-4 pb-1 px-0.5">
      {title}
    </h2>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

const selectClass =
  'h-9 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white px-3 focus:outline-none focus:ring-2 focus:ring-primary-500'

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-14 h-8 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
        checked ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

type RestoreData = {
  categories: Record<string, unknown>[]
  projects: Record<string, unknown>[]
  transactions: Record<string, unknown>[]
  schedules: Record<string, unknown>[]
}

export default function SettingsPage() {
  const t = useT()
  const addToast = useUIStore((s) => s.addToast)
  const queryClient = useQueryClient()
  const {
    currency,
    language,
    theme,
    defaultCategoryId,
    setCurrency,
    setLanguage,
    setTheme,
    setDefaultCategoryId,
  } = useSettingsStore()

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const [pendingRestoreData, setPendingRestoreData] = useState<RestoreData | null>(null)
  const [demoEraseConfirm, setDemoEraseConfirm] = useState(false)
  const [suggestedEraseConfirm, setSuggestedEraseConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const { data: versionInfo } = useQuery({
    queryKey: ['version'],
    queryFn: getVersion,
    staleTime: Infinity,
  })

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: getAiStatus,
    // Poll only while the model is still downloading/loading, then stop.
    refetchInterval: (query) => {
      const state = query.state.data?.state
      return state === 'downloading' || state === 'loading' ? 3000 : false
    },
  })

  const aiMutation = useMutation({
    mutationFn: setAiEnabled,
    onSuccess: (status) => {
      queryClient.setQueryData(['ai-status'], status)
      addToast(
        status.enabled ? t('settings.aiEnabledToast') : t('settings.aiDisabledToast'),
        'success',
      )
    },
    onError: () => addToast(t('settings.actionError'), 'error'),
  })

  const demoLoadMutation = useMutation({
    mutationFn: loadDemoData,
    onSuccess: () => {
      queryClient.invalidateQueries()
      addToast(t('settings.demoLoaded'), 'success')
    },
    onError: () => addToast(t('settings.actionError'), 'error'),
  })

  const demoEraseMutation = useMutation({
    mutationFn: eraseDemoData,
    onSuccess: () => {
      queryClient.invalidateQueries()
      addToast(t('settings.demoErased'), 'success')
    },
    onError: () => addToast(t('settings.actionError'), 'error'),
  })

  const suggestedAddMutation = useMutation({
    mutationFn: addSuggestedCategories,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      addToast(t('settings.suggestedAdded', { n: res.created }), 'success')
    },
    onError: () => addToast(t('settings.actionError'), 'error'),
  })

  const suggestedEraseMutation = useMutation({
    mutationFn: eraseSuggestedCategories,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      addToast(t('settings.suggestedErased', { n: res.deleted }), 'success')
    },
    onError: () => addToast(t('settings.actionError'), 'error'),
  })

  function aiStateLabel(): string {
    if (!aiStatus || !aiStatus.enabled) return t('settings.aiOff')
    switch (aiStatus.state) {
      case 'downloading':
        return t('settings.aiDownloading')
      case 'loading':
        return t('settings.aiLoading')
      case 'ready':
        return t('settings.aiReady')
      case 'error':
        return t('settings.aiErrorState')
      default:
        return t('settings.aiOff')
    }
  }

  function handleThemeToggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    addToast(`${t('settings.theme')}: ${next === 'dark' ? t('settings.dark') : t('settings.light')}`, 'success')
  }

  async function handleBackup() {
    setBackupLoading(true)
    try {
      const [cats, projects, transactions, schedules] = await Promise.all([
        getCategories(),
        getProjects(),
        getTransactions(),
        getSchedules(),
      ])
      const data = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        categories: cats,
        projects,
        transactions,
        schedules,
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ha-budgeting-backup-${format(new Date(), 'yyyy-MM-dd')}.json`
      a.click()
      URL.revokeObjectURL(url)
      addToast(t('settings.backupDownloaded'), 'success')
    } catch {
      addToast(t('settings.restoreError'), 'error')
    } finally {
      setBackupLoading(false)
    }
  }

  function handleRestoreFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Record<string, unknown>
        if (
          !Array.isArray(parsed.categories) ||
          !Array.isArray(parsed.projects) ||
          !Array.isArray(parsed.transactions) ||
          !Array.isArray(parsed.schedules)
        ) {
          addToast(t('settings.restoreInvalid'), 'error')
          return
        }
        setPendingRestoreData({
          categories: parsed.categories as Record<string, unknown>[],
          projects: parsed.projects as Record<string, unknown>[],
          transactions: parsed.transactions as Record<string, unknown>[],
          schedules: parsed.schedules as Record<string, unknown>[],
        })
        setRestoreConfirm(true)
      } catch {
        addToast(t('settings.restoreInvalid'), 'error')
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsText(file)
  }

  async function handleRestoreConfirm() {
    if (!pendingRestoreData) return
    setRestoreConfirm(false)
    setRestoreLoading(true)
    try {
      for (const item of pendingRestoreData.categories) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, created_at, ...rest } = item as Record<string, unknown>
        await createCategory(rest as Parameters<typeof createCategory>[0])
      }
      for (const item of pendingRestoreData.projects) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, created_at, ...rest } = item as Record<string, unknown>
        await createProject(rest as Parameters<typeof createProject>[0])
      }
      for (const item of pendingRestoreData.schedules) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, created_at, category, ...rest } = item as Record<string, unknown>
        await createSchedule(rest as Parameters<typeof createSchedule>[0])
      }
      for (const item of pendingRestoreData.transactions) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, created_at, category, project, ...rest } = item as Record<string, unknown>
        await createTransaction(rest as Parameters<typeof createTransaction>[0])
      }
      await queryClient.invalidateQueries()
      addToast(t('settings.restoreSuccess'), 'success')
    } catch {
      addToast(t('settings.restoreError'), 'error')
    } finally {
      setRestoreLoading(false)
      setPendingRestoreData(null)
    }
  }

  function handleDeleteAll() {
    setDeleteConfirm(false)
    addToast(t('settings.deleted'), 'success')
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('settings.title')}</h1>

      {/* ── Allgemein ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 mb-4">
        <SectionHeader title={t('settings.general')} />

        <SettingRow label={t('settings.currency')} description={t('settings.currencyDesc')}>
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value)
              addToast(t('settings.saved'), 'success')
            }}
            className={selectClass}
          >
            <option value="CHF">CHF – Schweizer Franken</option>
            <option value="EUR">EUR – Euro</option>
            <option value="USD">USD – US-Dollar</option>
            <option value="GBP">GBP – Britisches Pfund</option>
          </select>
        </SettingRow>

        <SettingRow label={t('settings.language')} description={t('settings.languageDesc')}>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value)
              addToast(t('settings.saved'), 'success')
            }}
            className={selectClass}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </SettingRow>

        <SettingRow
          label={t('settings.theme')}
          description={theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
        >
          <button
            onClick={handleThemeToggle}
            aria-label={t('settings.theme')}
            className={`relative flex items-center justify-between w-16 h-8 rounded-full px-1.5 transition-colors ${
              theme === 'dark' ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <Sun
              size={13}
              className={`transition-opacity ${
                theme === 'light' ? 'opacity-100 text-amber-500' : 'opacity-30 text-white'
              }`}
            />
            <Moon
              size={13}
              className={`transition-opacity ${
                theme === 'dark' ? 'opacity-100 text-white' : 'opacity-30'
              }`}
            />
            <span
              className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                theme === 'dark' ? 'translate-x-8' : 'translate-x-0'
              }`}
            />
          </button>
        </SettingRow>
      </div>

      {/* ── KI / AI (lokal) ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 mb-4">
        <SectionHeader title={t('settings.ai')} />

        <SettingRow
          label={t('settings.aiEnable')}
          description={aiStatus?.enabled ? aiStateLabel() : t('settings.aiEnableDesc')}
        >
          <Toggle
            checked={!!aiStatus?.enabled}
            disabled={aiMutation.isPending}
            label={t('settings.aiEnable')}
            onChange={(next) => aiMutation.mutate(next)}
          />
        </SettingRow>
      </div>

      {/* ── Backup & Restore ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 mb-4">
        <SectionHeader title={t('settings.backup')} />

        <SettingRow label={t('settings.backupBtn')} description={t('settings.backupDesc')}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBackup}
            disabled={backupLoading}
          >
            <Download size={14} />
            {backupLoading ? t('common.loading') : t('settings.backupBtn')}
          </Button>
        </SettingRow>

        <SettingRow label={t('settings.restoreBtn')} description={t('settings.restoreDesc')}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleRestoreFileChange}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={restoreLoading}
          >
            <Upload size={14} />
            {restoreLoading ? t('settings.restoring') : t('settings.restoreBtn')}
          </Button>
        </SettingRow>
      </div>

      {/* ── Daten ─────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 mb-4">
        <SectionHeader title={t('settings.data')} />

        <SettingRow
          label={t('settings.defaultCategory')}
          description={t('settings.defaultCategoryDesc')}
        >
          <select
            value={defaultCategoryId?.toString() ?? ''}
            onChange={(e) => {
              setDefaultCategoryId(e.target.value ? parseInt(e.target.value) : null)
              addToast(t('settings.saved'), 'success')
            }}
            className={selectClass}
          >
            <option value="">{t('common.noCategory')}</option>
            {categories
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
          </select>
        </SettingRow>

        <SettingRow
          label={t('settings.deleteAll')}
          description={t('settings.deleteAllDesc')}
        >
          <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(true)}>
            <Trash2 size={14} />
            {t('action.delete')}
          </Button>
        </SettingRow>
      </div>

      {/* ── Demo & Vorlagen ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 mb-4">
        <SectionHeader title={t('settings.demo')} />

        <SettingRow label={t('settings.demoLoad')} description={t('settings.demoLoadDesc')}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => demoLoadMutation.mutate()}
            loading={demoLoadMutation.isPending}
            disabled={demoLoadMutation.isPending}
          >
            <Database size={14} />
            {t('settings.demoLoad')}
          </Button>
        </SettingRow>

        <SettingRow label={t('settings.demoErase')} description={t('settings.demoEraseDesc')}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDemoEraseConfirm(true)}
            loading={demoEraseMutation.isPending}
            disabled={demoEraseMutation.isPending}
          >
            <Trash2 size={14} />
            {t('settings.demoErase')}
          </Button>
        </SettingRow>

        <SectionHeader title={t('settings.suggestedCats')} />

        <SettingRow label={t('settings.suggestedAdd')} description={t('settings.suggestedAddDesc')}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => suggestedAddMutation.mutate()}
            loading={suggestedAddMutation.isPending}
            disabled={suggestedAddMutation.isPending}
          >
            <Tags size={14} />
            {t('settings.suggestedAdd')}
          </Button>
        </SettingRow>

        <SettingRow label={t('settings.suggestedErase')} description={t('settings.suggestedEraseDesc')}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSuggestedEraseConfirm(true)}
            loading={suggestedEraseMutation.isPending}
            disabled={suggestedEraseMutation.isPending}
          >
            <Trash2 size={14} />
            {t('settings.suggestedErase')}
          </Button>
        </SettingRow>
      </div>

      {/* ── Info ──────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5">
        <SectionHeader title={t('settings.info')} />

        <SettingRow label={t('settings.version')}>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
            {versionInfo?.version ?? '…'}
          </span>
        </SettingRow>

        <SettingRow label={t('settings.buildDate')}>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
            {versionInfo?.build_date ?? '…'}
          </span>
        </SettingRow>

        <SettingRow label="MEMO – Finance Tracker" description={t('settings.description')}>
          <span />
        </SettingRow>

        <SettingRow label={t('settings.docs')}>
          <a
            href="https://github.com/LuMeX88/MEMO-Finance-Tracker/blob/main/memo-finance-tracker/DOCS.md"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            <ExternalLink size={13} />
            Docs
          </a>
        </SettingRow>
      </div>

      {/* Delete Confirm Modal */}
      <Modal
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title={t('settings.deleteAll')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t('settings.deleteAllConfirm')}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t('settings.deleteAllWarning')}
              </p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>
              {t('action.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeleteAll}>
              {t('settings.deleteAll')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Restore Confirm Modal */}
      <Modal
        open={restoreConfirm}
        onClose={() => {
          setRestoreConfirm(false)
          setPendingRestoreData(null)
        }}
        title={t('settings.restoreBtn')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t('common.confirm')}
              </p>
              {pendingRestoreData && (
                <ul className="text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-0.5">
                  <li>{t('categories.title')}: {pendingRestoreData.categories.length}</li>
                  <li>{t('projects.title')}: {pendingRestoreData.projects.length}</li>
                  <li>{t('nav.schedules')}: {pendingRestoreData.schedules.length}</li>
                  <li>{t('transaction.new').replace('Neue ', '').replace('New ', '')}: {pendingRestoreData.transactions.length}</li>
                </ul>
              )}
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setRestoreConfirm(false)
                setPendingRestoreData(null)
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button variant="primary" onClick={handleRestoreConfirm}>
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Demo Erase Confirm Modal */}
      <Modal
        open={demoEraseConfirm}
        onClose={() => setDemoEraseConfirm(false)}
        title={t('settings.demoErase')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t('settings.demoEraseConfirm')}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t('settings.demoEraseWarning')}
              </p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDemoEraseConfirm(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDemoEraseConfirm(false)
                demoEraseMutation.mutate()
              }}
            >
              {t('settings.demoErase')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Suggested Categories Erase Confirm Modal */}
      <Modal
        open={suggestedEraseConfirm}
        onClose={() => setSuggestedEraseConfirm(false)}
        title={t('settings.suggestedErase')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t('settings.suggestedEraseConfirm')}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t('settings.suggestedEraseWarning')}
              </p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setSuggestedEraseConfirm(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setSuggestedEraseConfirm(false)
                suggestedEraseMutation.mutate()
              }}
            >
              {t('settings.suggestedErase')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
