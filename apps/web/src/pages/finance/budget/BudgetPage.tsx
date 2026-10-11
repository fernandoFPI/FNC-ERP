import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { Grid } from '../../../components/ui/Grid'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { api } from '../../../lib/axios'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { usePermission } from '../../../hooks/usePermission'

interface Budget {
  id: string
  name: string
  fiscal_year: number
  currency_code: string
  status: 'draft' | 'active' | 'locked'
  notes: string | null
  line_count: number
  total_budget: number
  created_at: string
}

const STATUS_BADGE: Record<string, 'neutral' | 'success' | 'info'> = {
  draft: 'neutral',
  active: 'success',
  locked: 'info',
}

const currentYear = new Date().getFullYear()

export default function BudgetPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const navigate = useNavigate()
  const { can } = usePermission()
  const canEdit = can('finance.budget.edit', 'edit')
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    fiscal_year: currentYear,
    currency_code: 'IQD',
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<Budget[]>('/finance/budget')
      setBudgets(r.data)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate() {
    if (!form.name) return
    setSaving(true)
    try {
      const r = await api.post<Budget>('/finance/budget', form)
      setShowForm(false)
      setForm({ name: '', fiscal_year: currentYear, currency_code: 'IQD', notes: '' })
      navigate(`/finance/budget/${r.data.id}`)
    } catch {
      /* handled */
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '12px',
    color: theme.textPrimary,
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    fontSize: '11px',
    color: theme.textMuted,
    marginBottom: '3px',
    display: 'block' as const,
  }

  const activeBudgets = budgets.filter((b) => b.status === 'active')
  const totalActive = activeBudgets.reduce((s, b) => s + Number(b.total_budget), 0)

  const columns: Column<Budget>[] = [
    {
      key: 'name',
      header: t('fin.budget.budgetName'),
      mobilePrimary: true,
      render: (b) => <span style={{ fontWeight: 600, color: theme.textPrimary }}>{b.name}</span>,
    },
    {
      key: 'fiscal_year',
      header: t('fin.budget.year'),
      mobileSecondary: true,
      render: (b) => `FY ${b.fiscal_year}`,
    },
    {
      key: 'currency_code',
      header: t('fin.budget.currency'),
      render: (b) => b.currency_code,
    },
    {
      key: 'line_count',
      header: t('fin.budget.lines'),
      render: (b) => b.line_count,
    },
    {
      key: 'total_budget',
      header: t('fin.budget.totalBudget'),
      render: (b) => (
        <AmountDisplay amount={Number(b.total_budget)} currency={b.currency_code} size="sm" />
      ),
    },
    {
      key: 'status',
      header: t('fin.budget.status'),
      render: (b) => <Badge variant={STATUS_BADGE[b.status] ?? 'neutral'}>{enumLabel(b.status)}</Badge>,
    },
    {
      key: 'created_at',
      header: t('fin.budget.created'),
      render: (b) => new Date(b.created_at).toLocaleDateString(),
    },
    {
      key: 'open',
      header: '',
      mobileAction: true,
      render: (b) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigate(`/finance/budget/${b.id}`)
          }}
        >
          {t('fin.budget.open')}
        </Button>
      ),
    },
  ]

  return (
    <div style={pagePadding}>
      <PageHeader
        title={t('fin.budget.glBudgetManagement')}
        subtitle={t('fin.budget.defineAnnualBudgetsPerAccountAnd')}
        actions={
          canEdit ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowForm(true)
              }}
            >
              {t('fin.budget.newBudget')}
            </Button>
          ) : undefined
        }
      />

      {/* KPI strip */}
      <Grid cols={4} tabletCols={2} phoneCols={2} gap={12} style={{ marginBottom: '20px' }}>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.budget.totalBudgets')}
          </p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: theme.textPrimary }}>
            {budgets.length}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.budget.activeBudgets')}
          </p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e' }}>
            {activeBudgets.length}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.budget.totalActiveBudget')}
          </p>
          <AmountDisplay amount={totalActive} currency="IQD" size="md" />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.budget.currentYear')}
          </p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: theme.accent }}>{currentYear}</p>
        </Card>
      </Grid>

      {/* Budget list */}
      <Card padding="none">
        <Table
          columns={columns}
          data={budgets}
          rowKey="id"
          loading={loading}
          emptyMessage={t('fin.budget.noBudgetsYetClickNewBudget')}
          onRowClick={(b) => {
            navigate(`/finance/budget/${b.id}`)
          }}
        />
      </Card>

      {/* New budget modal */}
      {showForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <Card padding="lg" style={{ width: '420px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>{t('fin.budget.newBudget2')}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false)
                }}
              >
                ✕
              </Button>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle}>{t('fin.budget.budgetName2')}</label>
                <input
                  style={inputStyle}
                  value={form.name}
                  placeholder={t('fin.budget.eGFy2025OperatingBudget')}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{t('fin.budget.fiscalYear')}</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={form.fiscal_year}
                    min="2020"
                    max="2030"
                    onChange={(e) => {
                      setForm((f) => ({ ...f, fiscal_year: Number(e.target.value) }))
                    }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t('fin.budget.currency')}</label>
                  <select
                    style={inputStyle}
                    value={form.currency_code}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, currency_code: e.target.value }))
                    }}
                  >
                    <option value="IQD">IQD</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>{t('fin.budget.notes')}</label>
                <input
                  style={inputStyle}
                  value={form.notes}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }}
                />
              </div>
            </div>
            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false)
                }}
              >
                {t('fin.budget.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleCreate()}
                disabled={saving || !form.name}
              >
                {saving ? t('fin.budget.creating') : t('fin.budget.createOpen')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
