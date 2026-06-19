import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, AlertTriangle, ChevronDown, ChevronUp, Archive,
} from 'lucide-react'
import {
  getCategories, createCategory, updateCategory, deleteCategory,
} from '@/lib/api'
import type { Category } from '@/types'
import { useUIStore } from '@/store/useUIStore'
import { useT } from '@/lib/i18n'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import IconPicker from '@/components/ui/IconPicker'

// ─── Category Modal ───────────────────────────────────────────────────────────

type CategoryFormData = {
  name: string
  icon: string
  color: string
  archived: boolean
}

function CategoryModal({
  open,
  onClose,
  editing,
  onSave,
  onDelete,
  loading,
}: {
  open: boolean
  onClose: () => void
  editing: Category | null
  onSave: (data: CategoryFormData) => void
  onDelete?: () => void
  loading: boolean
}) {
  const t = useT()
  const [form, setForm] = useState<CategoryFormData>({
    name: '',
    icon: '📦',
    color: '#6366f1',
    archived: false,
  })

  useEffect(() => {
    if (open) {
      setForm({
        name: editing?.name ?? '',
        icon: editing?.icon ?? '📦',
        color: editing?.color ?? '#6366f1',
        archived: editing?.archived ?? false,
      })
    }
  }, [open, editing])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('categories.edit') : t('categories.new')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
        className="space-y-4"
      >
        <IconPicker
          value={form.icon}
          onChange={(emoji) => setForm((f) => ({ ...f, icon: emoji }))}
          label={t('categories.icon')}
        />

        <Input
          label={t('categories.name')}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="z.B. Lebensmittel"
          required
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('categories.color')}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="h-10 w-16 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer p-0.5"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              {form.color}
            </span>
          </div>
        </div>

        {editing && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.archived}
              onClick={() => setForm((f) => ({ ...f, archived: !f.archived }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                form.archived ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  form.archived ? 'translate-x-5' : ''
                }`}
              />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('categories.archived')}
            </span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {editing && onDelete && (
            <Button type="button" variant="danger" size="sm" onClick={onDelete}>
              <Trash2 size={14} />
              {t('action.delete')}
            </Button>
          )}
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {editing ? t('action.save') : t('action.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const addToast = useUIStore((s) => s.addToast)
  const t = useT()
  const [searchParams] = useSearchParams()

  const [archivedOpen, setArchivedOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null)

  // Auto-open create modal if ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditingCategory(null)
      setModalOpen(true)
    }
  }, [searchParams])

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setModalOpen(false)
      addToast(t('categories.created'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateCategory>[1] }) =>
      updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setModalOpen(false)
      addToast(t('categories.updated'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setDeleteCategoryId(null)
      setModalOpen(false)
      addToast(t('categories.deleted'), 'success')
    },
    onError: () => addToast(t('common.error'), 'error'),
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSave(data: CategoryFormData) {
    if (editingCategory) {
      updateMut.mutate({ id: editingCategory.id, data })
    } else {
      createMut.mutate(data)
    }
  }

  const activeCategories = categories.filter((c) => !c.archived)
  const archivedCategories = categories.filter((c) => c.archived)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('categories.title')}
        </h1>
        <Button
          onClick={() => {
            setEditingCategory(null)
            setModalOpen(true)
          }}
        >
          <Plus size={16} />
          {t('categories.new')}
        </Button>
      </div>

      {/* Active categories grid */}
      {activeCategories.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={t('categories.empty')}
          description={t('categories.emptyDesc')}
          actionLabel={t('categories.new')}
          onAction={() => {
            setEditingCategory(null)
            setModalOpen(true)
          }}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {activeCategories.map((cat) => (
            <div
              key={cat.id}
              className="relative group rounded-xl p-4 flex flex-col items-center gap-2 border border-gray-100 dark:border-gray-700 transition-transform hover:scale-105 cursor-default"
              style={{ backgroundColor: cat.color ? `${cat.color}26` : '#f3f4f626' }}
            >
              <span className="text-3xl">{cat.icon}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white text-center">
                {cat.name}
              </span>
              <button
                onClick={() => {
                  setEditingCategory(cat)
                  setModalOpen(true)
                }}
                className="absolute top-2 right-2 p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={t('action.edit')}
              >
                <Pencil size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Archived section */}
      {archivedCategories.length > 0 && (
        <div>
          <button
            onClick={() => setArchivedOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {archivedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {t('categories.archivedSection')} ({archivedCategories.length})
          </button>
          {archivedOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 opacity-50">
              {archivedCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="relative group rounded-xl p-4 flex flex-col items-center gap-2 border border-gray-200 dark:border-gray-700"
                >
                  <span className="text-3xl grayscale">{cat.icon}</span>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center">
                    {cat.name}
                  </span>
                  <button
                    onClick={() => {
                      setEditingCategory(cat)
                      setModalOpen(true)
                    }}
                    className="absolute top-2 right-2 p-1 rounded-md text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={t('action.edit')}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Category Modal ─────────────────────────────────────────────────── */}
      <CategoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editingCategory}
        onSave={handleSave}
        onDelete={editingCategory ? () => setDeleteCategoryId(editingCategory.id) : undefined}
        loading={createMut.isPending || updateMut.isPending}
      />

      {/* ── Delete Confirm Modal ───────────────────────────────────────────── */}
      <Modal
        open={deleteCategoryId !== null}
        onClose={() => setDeleteCategoryId(null)}
        title={t('action.delete')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Möchtest du diese Kategorie wirklich löschen? Diese Aktion kann nicht rückgängig
              gemacht werden.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteCategoryId(null)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => deleteCategoryId !== null && deleteMut.mutate(deleteCategoryId)}
            >
              {t('action.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
