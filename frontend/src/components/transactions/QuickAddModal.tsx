import Modal from '@/components/ui/Modal'
import TransactionForm from './TransactionForm'
import { useUIStore } from '@/store/useUIStore'
import { useT } from '@/lib/i18n'

export default function QuickAddModal() {
  const t = useT()
  const open = useUIStore((s) => s.quickAddOpen)
  const initialType = useUIStore((s) => s.quickAddInitialType)
  const autoScan = useUIStore((s) => s.quickAddScan)
  const closeQuickAdd = useUIStore((s) => s.closeQuickAdd)

  return (
    <Modal open={open} onClose={closeQuickAdd} title={t('transactions.new')}>
      <TransactionForm
        initialType={initialType}
        autoScan={autoScan}
        onSuccess={closeQuickAdd}
        onCancel={closeQuickAdd}
      />
    </Modal>
  )
}
