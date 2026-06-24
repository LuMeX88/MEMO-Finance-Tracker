import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Camera, Loader2, Image as ImageIcon } from 'lucide-react'
import { useT } from '@/lib/i18n'
import {
  getCategories,
  getProjects,
  createTransaction,
  updateTransaction,
  scanReceipt,
  getAiStatus,
} from '@/lib/api'
import { useUIStore } from '@/store/useUIStore'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import CameraCapture from '@/components/transactions/CameraCapture'
import { cn } from '@/lib/utils'
import type { Transaction, OcrResult } from '@/types'

interface TransactionFormProps {
  transaction?: Transaction
  initialType?: 'expense' | 'income'
  autoScan?: boolean
  onSuccess: () => void
  onCancel: () => void
}

const PAYMENT_METHODS = ['Bar', 'Karte', 'TWINT', 'Überweisung', 'Sonstige']

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface FormErrors {
  date?: string
  recipient?: string
  amount?: string
  category_id?: string
}

export default function TransactionForm({
  transaction,
  initialType = 'expense',
  autoScan = false,
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const queryClient = useQueryClient()
  const addToast = useUIStore((s) => s.addToast)
  const t = useT()

  const [date, setDate] = useState(transaction?.date.slice(0, 10) ?? today())
  const [recipient, setRecipient] = useState(transaction?.recipient ?? '')
  const [type, setType] = useState<'expense' | 'income'>(
    transaction?.type ?? initialType,
  )
  const [amount, setAmount] = useState(
    transaction?.amount != null ? String(transaction.amount) : '',
  )
  const [categoryId, setCategoryId] = useState(
    transaction?.category_id != null ? String(transaction.category_id) : '',
  )
  const [projectId, setProjectId] = useState(
    transaction?.project_id != null ? String(transaction.project_id) : '',
  )
  const [paymentMethod, setPaymentMethod] = useState(
    transaction?.payment_method ?? '',
  )
  const [note, setNote] = useState(transaction?.note ?? '')
  const [moreOpen, setMoreOpen] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [scanning, setScanning] = useState(false)
  const [ocrFields, setOcrFields] = useState<Set<string>>(new Set())
  const [ocrBanner, setOcrBanner] = useState<'success' | 'unavailable' | 'error' | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  // The live getUserMedia camera is only exposed in a secure context. When it
  // is missing (e.g. some HA Companion webviews) we fall back to the native
  // capture input, which at least opens the gallery/system camera.
  const cameraSupported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  function openCamera() {
    if (cameraSupported) setCameraOpen(true)
    else cameraInputRef.current?.click()
  }

  // Auto-trigger the camera when opened via the "Beleg scannen" SpeedDial action
  useEffect(() => {
    if (autoScan) {
      const timer = setTimeout(() => openCamera(), 150)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan])

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    void scanFile(file)
  }

  function handleCapturedFile(file: File) {
    setCameraOpen(false)
    void scanFile(file)
  }

  async function scanFile(file: File) {
    setScanning(true)
    setOcrBanner(null)
    setOcrError(null)
    try {
      const result: OcrResult = await scanReceipt(file)
      if (!result.ocr_available || result.error) {
        setOcrBanner('unavailable')
        return
      }
      const detected = new Set<string>()
      if (result.amount != null) {
        setAmount(String(result.amount))
        detected.add('amount')
      }
      if (result.date) {
        setDate(result.date.slice(0, 10))
        detected.add('date')
      }
      if (result.merchant) {
        setRecipient(result.merchant)
        detected.add('recipient')
      }
      if (result.category_name) {
        const match = categories.find(
          (c) => c.name.toLowerCase() === result.category_name!.toLowerCase(),
        )
        if (match) {
          setCategoryId(String(match.id))
          detected.add('category_id')
        }
      }
      setOcrFields(detected)
      setOcrBanner('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('receipt.scanFailed')
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      setOcrError(isAbort ? t('receipt.timeout') : msg)
      setOcrBanner('error')
    } finally {
      setScanning(false)
    }
  }

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  })

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: getAiStatus,
  })

  const mutation = useMutation({
    mutationFn: (
      data: Omit<Transaction, 'id' | 'created_at' | 'category' | 'project'>,
    ) => {
      if (transaction) {
        return updateTransaction(transaction.id, data)
      }
      return createTransaction(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['report-summary'] })
      queryClient.invalidateQueries({ queryKey: ['report-by-category'] })
      queryClient.invalidateQueries({ queryKey: ['report-timeline'] })
      addToast(t('transaction.saved'), 'success')
      onSuccess()
    },
    onError: () => {
      addToast(t('common.error'), 'error')
    },
  })

  function validate(): boolean {
    const next: FormErrors = {}
    if (!date) next.date = t('transaction.errDate')
    if (!recipient.trim()) next.recipient = t('transaction.errRecipient')
    const parsed = parseFloat(amount)
    if (!amount || isNaN(parsed) || parsed <= 0)
      next.amount = t('transaction.errAmount')
    if (!categoryId) next.category_id = t('transaction.errCategory')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    mutation.mutate({
      date,
      recipient: recipient.trim(),
      type,
      amount: parseFloat(amount),
      category_id: parseInt(categoryId),
      project_id: projectId ? parseInt(projectId) : null,
      payment_method: paymentMethod || null,
      note: note.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <CameraCapture
        open={cameraOpen}
        onCapture={handleCapturedFile}
        onClose={() => setCameraOpen(false)}
      />
      {/* Receipt scan — separate camera + file inputs so both work reliably,
          including inside the Home Assistant Companion app. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      <div className="flex items-center justify-end gap-4">
        <button
          type="button"
          disabled={scanning}
          onClick={openCamera}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50"
        >
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {t('action.takePhoto')}
        </button>
        <button
          type="button"
          disabled={scanning}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50"
        >
          <ImageIcon size={14} />
          {t('action.chooseFile')}
        </button>
      </div>

      {/* Nudge: receipt recognition is much better with the (opt-in) local AI. */}
      {aiStatus && !aiStatus.enabled && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          {t('ai.scanHint')}
        </p>
      )}

      {/* OCR banners */}
      {ocrBanner === 'success' && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-2 text-xs text-green-700 dark:text-green-300">
          ✓ {t('receipt.scanSuccess')}
        </div>
      )}
      {ocrBanner === 'unavailable' && (
        <div className="flex items-center gap-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-3 py-2 text-xs text-orange-700 dark:text-orange-300">
          {t('receipt.unavailable')}
        </div>
      )}
      {ocrBanner === 'error' && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {ocrError ?? t('receipt.scanError')}
        </div>
      )}

      {/* Type toggle */}
      <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setType('expense')}
          className={cn(
            'flex-1 py-2 text-sm font-medium transition-colors',
            type === 'expense'
              ? 'bg-red-500 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700',
          )}
        >
          {t('transaction.expense')}
        </button>
        <button
          type="button"
          onClick={() => setType('income')}
          className={cn(
            'flex-1 py-2 text-sm font-medium transition-colors',
            type === 'income'
              ? 'bg-emerald-500 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700',
          )}
        >
          {t('transaction.income')}
        </button>
      </div>

      {/* Date + Amount row */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('transaction.date')}
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setOcrFields((s) => { const n = new Set(s); n.delete('date'); return n }) }}
          error={errors.date}
          className={ocrFields.has('date') ? 'bg-yellow-50 ring-1 ring-yellow-300' : undefined}
        />
        <Input
          label={t('transaction.amount')}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setOcrFields((s) => { const n = new Set(s); n.delete('amount'); return n }) }}
          error={errors.amount}
          className={ocrFields.has('amount') ? 'bg-yellow-50 ring-1 ring-yellow-300' : undefined}
        />
      </div>

      {/* Recipient */}
      <Input
        label={t('transaction.recipient')}
        type="text"
        placeholder={t('transaction.recipientPlaceholder')}
        value={recipient}
        onChange={(e) => { setRecipient(e.target.value); setOcrFields((s) => { const n = new Set(s); n.delete('recipient'); return n }) }}
        error={errors.recipient}
        className={ocrFields.has('recipient') ? 'bg-yellow-50 ring-1 ring-yellow-300' : undefined}
      />

      {/* Category */}
      <Select
        label={t('transaction.category')}
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        error={errors.category_id}
      >
        <option value="">{t('transaction.categoryPlaceholder')}</option>
        {categories
          .filter((c) => !c.archived)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
      </Select>

      {/* Mehr anzeigen accordion */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <span>{moreOpen ? t('action.showLess') : t('action.showMore')}</span>
          {moreOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {moreOpen && (
          <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-3">
            {/* Project */}
            <Select
              label={t('transaction.project')}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">{t('common.noProject')}</option>
              {projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>

            {/* Payment method */}
            <Select
              label={t('transaction.paymentMethod')}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="">{t('transaction.paymentNone')}</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {({ Bar: t('payment.cash'), Karte: t('payment.card'), TWINT: t('payment.twint'), Überweisung: t('payment.transfer'), Sonstige: t('payment.other') } as Record<string, string>)[m] ?? m}
                </option>
              ))}
            </Select>

            {/* Note */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('transaction.note')}
              </label>
              <textarea
                rows={3}
                placeholder={t('transaction.notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm transition-colors resize-none',
                  'bg-white dark:bg-gray-800',
                  'text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500',
                  'border-gray-300 dark:border-gray-600',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                )}
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          {t('action.cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          className="flex-1"
          loading={mutation.isPending}
        >
          {transaction ? t('action.save') : t('action.create')}
        </Button>
      </div>
    </form>
  )
}
