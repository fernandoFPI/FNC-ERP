import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface CurrencyTotal {
  currency_code: string
  total_debits: string
  total_credits: string
}

interface AnalyticAccount {
  id: string
  code: string
  name: string
  cost_center_id?: string
  cost_center_code?: string
  cost_center_name?: string
  is_active: boolean
  journal_line_count: number
  currency_totals: CurrencyTotal[]
  project_id?: string
  project_name?: string
  project_status?: string
}

interface CostCenter {
  id: string
  code: string
  name: string
}

const EMPTY_FORM = { code: '', name: '', cost_center_id: '' }

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

export default function AnalyticAccountsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const navigate = useNavigate()
  const { can } = usePermission()
  const canEdit = can('finance.analytic_accounts.edit', 'edit')

  const [items, setItems] = useState<AnalyticAccount[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AnalyticAccount | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (activeOnly) params.is_active = 'true'
      if (search) params.search = search
      const [aaRes, ccRes] = await Promise.all([
        api.get<AnalyticAccount[]>('/finance/analytic-accounts', { params }),
        api.get<CostCenter[]>('/finance/cost-centers'),
      ])
      setItems(Array.isArray(aaRes.data) ? aaRes.data : [])
      setCostCenters(Array.isArray(ccRes.data) ? ccRes.data : [])
    } catch {
      addToast({ type: 'error', message: t('fin.analytic.failedToLoadAnalyticAccounts') })
    } finally {
      setLoading(false)
    }
  }, [addToast, activeOnly, search])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }
  function openEdit(aa: AnalyticAccount) {
    setEditing(aa)
    setForm({ code: aa.code, name: aa.name, cost_center_id: aa.cost_center_id ?? '' })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.code.trim()) {
      addToast({ type: 'error', message: t('fin.analytic.codeIsRequired') })
      return
    }
    if (!form.name.trim()) {
      addToast({ type: 'error', message: t('fin.analytic.nameIsRequired') })
      return
    }
    setSaving(true)
    const payload = { ...form, cost_center_id: form.cost_center_id || undefined }
    try {
      if (editing) {
        await api.put(`/finance/analytic-accounts/${editing.id}`, payload)
        addToast({ type: 'success', message: t('fin.analytic.analyticAccountUpdated') })
      } else {
        await api.post('/finance/analytic-accounts', payload)
        addToast({ type: 'success', message: t('fin.analytic.analyticAccountCreated') })
      }
      setModalOpen(false)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, t('fin.analytic.saveFailed')) })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingId) return
    setDeleteLoading(true)
    try {
      await api.delete(`/finance/analytic-accounts/${deletingId}`)
      addToast({ type: 'success', message: t('fin.analytic.analyticAccountDeactivated') })
      setDeletingId(null)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, t('fin.analytic.deleteFailed')) })
    } finally {
      setDeleteLoading(false)
    }
  }

  // No-conversion policy: an account with lines in more than one currency
  // has no single balance, debit, or credit total — one value per currency.
  const balancesByCurrency = (aa: AnalyticAccount) =>
    aa.currency_totals.map((ct) => ({
      currency_code: ct.currency_code,
      balance: parseFloat(ct.total_debits) - parseFloat(ct.total_credits),
    }))

  const columns: Column<AnalyticAccount>[] = [
    {
      key: 'name',
      header: t('fin.analytic.name'),
      mobilePrimary: true,
      render: (aa) => <span style={{ color: theme.textPrimary }}>{aa.name}</span>,
    },
    {
      key: 'code',
      header: t('fin.analytic.code'),
      mobileSecondary: true,
      render: (aa) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent }}>{aa.code}</span>
      ),
    },
    {
      key: 'cost_center_code',
      header: t('fin.analytic.costCenter'),
      mobilePriority: 3,
      render: (aa) => (
        <span style={{ color: theme.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>
          {aa.cost_center_code ?? '—'}
        </span>
      ),
    },
    {
      key: 'project_name',
      header: t('fin.analytic.project'),
      mobilePriority: 4,
      render: (aa) =>
        aa.project_name ? (
          <span title={aa.project_name} style={{ color: theme.textSecondary }}>
            {aa.project_name.slice(0, 20)}
            {aa.project_name.length > 20 ? '…' : ''}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'journal_line_count',
      header: t('fin.analytic.lines'),
      mobilePriority: 7,
      render: (aa) => aa.journal_line_count.toLocaleString(),
    },
    {
      key: 'total_debits',
      header: t('fin.analytic.debits'),
      mobilePriority: 5,
      render: (aa) =>
        aa.currency_totals.length === 0 ? (
          '—'
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {aa.currency_totals.map((ct) => (
              <AmountDisplay key={ct.currency_code} amount={parseFloat(ct.total_debits)} currency={ct.currency_code} size="sm" />
            ))}
          </div>
        ),
    },
    {
      key: 'total_credits',
      header: t('fin.analytic.credits'),
      mobilePriority: 6,
      render: (aa) =>
        aa.currency_totals.length === 0 ? (
          '—'
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {aa.currency_totals.map((ct) => (
              <AmountDisplay key={ct.currency_code} amount={parseFloat(ct.total_credits)} currency={ct.currency_code} size="sm" />
            ))}
          </div>
        ),
    },
    {
      key: 'balance',
      header: t('fin.analytic.balance'),
      mobilePriority: 2,
      render: (aa) => {
        const balances = balancesByCurrency(aa)
        if (balances.length === 0) return '—'
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {balances.map(({ currency_code, balance: bal }) => (
              <span
                key={currency_code}
                style={{ color: bal >= 0 ? theme.textPrimary : theme.danger, fontWeight: 500 }}
              >
                {Math.abs(bal).toLocaleString('en-US', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}{' '}
                {currency_code}
                {bal < 0 ? ' Cr' : ''}
              </span>
            ))}
          </div>
        )
      },
    },
    {
      key: 'is_active',
      header: t('fin.analytic.status'),
      mobilePriority: 1,
      render: (aa) => (
        <Badge variant={aa.is_active ? 'success' : 'neutral'} size="sm">
          {aa.is_active ? t('fin.analytic.active') : t('fin.analytic.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('fin.analytic.actions'),
      mobileAction: true,
      render: (aa) => (
        <div
          style={{ display: 'flex', gap: '6px' }}
          onClick={(ev) => {
            ev.stopPropagation()
          }}
        >
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                openEdit(aa)
              }}
            >
              {t('fin.analytic.edit')}
            </Button>
          )}
          {canEdit && aa.is_active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeletingId(aa.id)
              }}
            >
              {t('fin.analytic.deactivate')}
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={t('fin.analytic.analyticAccounts')}
        subtitle={t('fin.analytic.projectAndCostTrackingByAnalytic')}
        actions={
          canEdit ? (
            <Button variant="primary" size="sm" onClick={openCreate}>
              {t('fin.analytic.newAnalyticAccount')}
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
            placeholder={t('fin.analytic.searchCodeOrName')}
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
            {t('fin.analytic.activeOnly')}
          </label>
        </div>
        <Table
          columns={columns}
          data={items}
          rowKey="id"
          loading={loading}
          emptyMessage={t('fin.analytic.noAnalyticAccountsFound')}
          onRowClick={(aa) => {
            navigate(`/finance/analytic-accounts/${aa.id}`)
          }}
          getRowStyle={(aa) => (aa.is_active ? {} : { opacity: 0.5 })}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title={editing ? t('fin.analytic.editAnalyticAccount') : t('fin.analytic.newAnalyticAccount')}
      >
        <Field label={t('fin.analytic.code2')}>
          <input
            value={form.code}
            onChange={(e) => {
              setForm((p) => ({ ...p, code: e.target.value }))
            }}
            disabled={!!editing}
            placeholder="AA-001"
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              background: theme.bgSurface,
              color: theme.textPrimary,
              fontSize: '12px',
              opacity: editing ? 0.6 : 1,
            }}
          />
        </Field>
        <Field label={t('fin.analytic.name2')}>
          <input
            value={form.name}
            onChange={(e) => {
              setForm((p) => ({ ...p, name: e.target.value }))
            }}
            placeholder={t('fin.analytic.projectAlpha')}
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
        <Field label={t('fin.analytic.costCenterOptional')}>
          <SearchableSelect
            value={form.cost_center_id}
            onChange={(v) => {
              setForm((p) => ({ ...p, cost_center_id: v }))
            }}
            placeholder={t('fin.analytic.none')}
            options={costCenters.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setModalOpen(false)
            }}
          >
            {t('fin.analytic.cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={(...args: Parameters<typeof handleSave>) => void handleSave(...args)} disabled={saving}>
            {saving ? t('fin.analytic.saving') : editing ? t('fin.analytic.update') : t('fin.analytic.create')}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingId}
        onClose={() => {
          setDeletingId(null)
        }}
        onConfirm={(...args: Parameters<typeof handleDelete>) => void handleDelete(...args)}
        title={t('fin.analytic.deactivateAnalyticAccount')}
        message={t('fin.analytic.thisWillDeactivateTheAnalyticAccount')}
        confirmLabel={t('fin.analytic.deactivate')}
        loading={deleteLoading}
      />
    </div>
  )
}
