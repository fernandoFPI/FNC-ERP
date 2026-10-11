import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { usePermission } from '../../../hooks/usePermission'
import { api } from '../../../lib/axios'
import { apiErrMsg } from '../../../lib/apiError'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface Category {
  id: string
  name: string
  gl_account_id: string | null
  account_code: string | null
  account_name: string | null
  is_project_related: boolean
  is_active: boolean
}

interface GLAccount {
  id: string
  code: string
  name: string
}

const EMPTY_FORM = {
  name: '',
  gl_account_id: '',
  is_project_related: false,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <div style={{ marginBottom: '12px' }}>
      <label
        style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

export default function ExpenseCategoriesPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const { can } = usePermission()
  const canEdit = can('finance.expenses.edit', 'edit')

  const [items, setItems] = useState<Category[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [catRes, glRes] = await Promise.all([
        api.get<Category[]>('/finance/expense-claims/categories'),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
      ])
      setItems(Array.isArray(catRes.data) ? catRes.data : [])
      setGlAccounts(Array.isArray(glRes.data) ? glRes.data : [])
    } catch {
      addToast({ type: 'error', message: t('fin.expCats.failedToLoadExpenseCategories') })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }
  function openEdit(cat: Category) {
    setEditing(cat)
    setForm({
      name: cat.name,
      gl_account_id: cat.gl_account_id ?? '',
      is_project_related: cat.is_project_related,
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      addToast({ type: 'error', message: t('fin.expCats.nameIsRequired') })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/finance/expense-claims/categories/${editing.id}`, {
          name: form.name,
          gl_account_id: form.gl_account_id || undefined,
          is_project_related: form.is_project_related,
          is_active: editing.is_active,
        })
        addToast({ type: 'success', message: t('fin.expCats.categoryUpdated') })
      } else {
        await api.post('/finance/expense-claims/categories', {
          name: form.name,
          gl_account_id: form.gl_account_id || undefined,
          is_project_related: form.is_project_related,
        })
        addToast({ type: 'success', message: t('fin.expCats.categoryCreated') })
      }
      setModalOpen(false)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, t('fin.expCats.saveFailed')) })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!deactivatingId) return
    const cat = items.find((c) => c.id === deactivatingId)
    if (!cat) return
    setDeactivateLoading(true)
    try {
      await api.put(`/finance/expense-claims/categories/${deactivatingId}`, {
        name: cat.name,
        gl_account_id: cat.gl_account_id ?? undefined,
        is_project_related: cat.is_project_related,
        is_active: false,
      })
      addToast({ type: 'success', message: t('fin.expCats.categoryDeactivated') })
      setDeactivatingId(null)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, t('fin.expCats.deactivateFailed')) })
    } finally {
      setDeactivateLoading(false)
    }
  }

  const visible = items.filter((c) => {
    if (activeOnly && !c.is_active) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: t('fin.expCats.name'),
      mobilePrimary: true,
      render: (c) => <span style={{ color: theme.textPrimary }}>{c.name}</span>,
    },
    {
      key: 'is_project_related',
      header: t('fin.expCats.requiresProject'),
      render: (c) =>
        c.is_project_related ? (
          <Badge variant="warning" size="sm">
            {t('fin.expCats.required')}
          </Badge>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '11px' }}>—</span>
        ),
    },
    {
      key: 'gl_account_id',
      header: t('fin.expCats.defaultGlAccount'),
      mobileSecondary: true,
      render: (c) =>
        c.account_code ? (
          <span style={{ color: theme.textSecondary, fontSize: '12px' }}>
            {c.account_code} · {c.account_name}
          </span>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '11px' }}>{t('fin.expCats.notSet')}</span>
        ),
    },
    {
      key: 'is_active',
      header: t('fin.expCats.status'),
      render: (c) => (
        <Badge variant={c.is_active ? 'success' : 'neutral'} size="sm">
          {c.is_active ? t('fin.expCats.active') : t('fin.expCats.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('fin.expCats.actions'),
      render: (c) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                openEdit(c)
              }}
            >
              {t('fin.expCats.edit')}
            </Button>
          )}
          {canEdit && c.is_active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeactivatingId(c.id)
              }}
            >
              {t('fin.expCats.deactivate')}
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title={t('fin.expCats.expenseCategories')}
        subtitle={t('fin.expCats.usedWhenSettlingExpenseClaimsPetty')}
        actions={
          canEdit ? (
            <Button variant="primary" size="sm" onClick={openCreate}>
              {t('fin.expCats.newCategory')}
            </Button>
          ) : undefined
        }
      />

      <Card padding="none">
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            placeholder={t('fin.expCats.searchName')}
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              background: theme.bgSurface,
              color: theme.textPrimary,
              fontSize: '12px',
            }}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: theme.textMuted,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => {
                setActiveOnly(e.target.checked)
              }}
            />
            {t('fin.expCats.activeOnly')}
          </label>
        </div>
        <Table
          columns={columns}
          data={visible}
          rowKey="id"
          loading={loading}
          emptyMessage={t('fin.expCats.noExpenseCategoriesFound')}
          getRowStyle={(c) => (c.is_active ? {} : { opacity: 0.5 })}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title={editing ? t('fin.expCats.editCategory') : t('fin.expCats.newCategory')}
      >
        <Field label={t('fin.expCats.name2')}>
          <input
            value={form.name}
            onChange={(e) => {
              setForm((p) => ({ ...p, name: e.target.value }))
            }}
            placeholder={t('fin.expCats.siteMaterials')}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              background: theme.bgSurface,
              color: theme.textPrimary,
              fontSize: '12px',
            }}
          />
        </Field>
        <Field label={t('fin.expCats.defaultGlAccountOptional')}>
          <SearchableSelect
            value={form.gl_account_id}
            onChange={(v) => {
              setForm((p) => ({ ...p, gl_account_id: v }))
            }}
            placeholder={t('fin.expCats.notSet')}
            options={glAccounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
          />
          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
            {t('fin.expCats.preFillsTheGlAccountWhen')}
          </div>
        </Field>
        <Field label={t('fin.expCats.requiresAProject')}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: theme.textSecondary,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={form.is_project_related}
              onChange={(e) => {
                setForm((p) => ({ ...p, is_project_related: e.target.checked }))
              }}
            />
            {t('fin.expCats.linesUsingThisCategoryMustBe')}
          </label>
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setModalOpen(false)
            }}
          >
            {t('fin.expCats.cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={(...args: Parameters<typeof handleSave>) => void handleSave(...args)} disabled={saving}>
            {saving ? t('fin.expCats.saving') : editing ? t('fin.expCats.update') : t('fin.expCats.create')}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deactivatingId}
        onClose={() => {
          setDeactivatingId(null)
        }}
        onConfirm={(...args: Parameters<typeof handleDeactivate>) => void handleDeactivate(...args)}
        title={t('fin.expCats.deactivateCategory')}
        message={t('fin.expCats.thisWillDeactivateTheCategoryIt')}
        confirmLabel={t('fin.expCats.deactivate')}
        loading={deactivateLoading}
      />
    </div>
  )
}
