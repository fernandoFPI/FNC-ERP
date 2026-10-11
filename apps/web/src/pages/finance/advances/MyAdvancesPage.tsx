import i18n, { tlh } from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Grid } from '../../../components/ui/Grid'
import { KPICard } from '../../../components/ui/KPICard'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Badge, type BadgeVariant } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'

interface Advance {
  id: string
  advance_number: string
  purpose: string | null
  amount: number
  settled_amount: number
  outstanding_amount: number
  currency_code: string
  status: string
  created_at: string
}

interface Project {
  id: string
  code: string
  name: string
}

const STATUS_LABELS: Record<string, string> = {
  get pending_approval() { return i18n.t('fin.myAdv.pendingApproval', { defaultValue: "Pending approval" }) },
  get approved() { return i18n.t('fin.myAdv.approved', { defaultValue: "Approved" }) },
  get partially_settled() { return i18n.t('fin.myAdv.partiallySettled', { defaultValue: "Partially settled" }) },
  get settled() { return i18n.t('fin.myAdv.settled', { defaultValue: "Settled" }) },
  get rejected() { return i18n.t('fin.myAdv.rejected', { defaultValue: "Rejected" }) },
  get cancelled() { return i18n.t('fin.myAdv.cancelled', { defaultValue: "Cancelled" }) },
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  pending_approval: 'info',
  approved: 'warning',
  partially_settled: 'warning',
  settled: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

const EMPTY_FORM = {
  amount: '',
  currency_code: 'IQD',
  purpose: '',
  project_id: '',
}

export default function MyAdvancesPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const pagePadding = usePagePadding()
  const addToast = useToastStore((s) => s.addToast)
  const employeeId = useAuthStore((s) => s.user?.employeeId)
  const hasEmployeeLink = !!employeeId

  const [advances, setAdvances] = useState<Advance[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    if (!employeeId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [advRes, projRes] = await Promise.all([
        api.get<Advance[]>('/finance/advances', { params: { employee_id: employeeId } }),
        api.get<{ data: Project[] }>('/projects', { params: { limit: 500 } }),
      ])
      setAdvances(advRes.data)
      setProjects(projRes.data.data)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) {
      addToast({ type: 'error', message: t('fin.myAdv.enterAnAmountGreaterThanZero') })
      return
    }
    setSubmitting(true)
    try {
      await api.post('/finance/advances/request-self', {
        amount: Number(form.amount),
        currency_code: form.currency_code,
        purpose: form.purpose || undefined,
        project_id: form.project_id || undefined,
      })
      addToast({ type: 'success', message: t('fin.myAdv.advanceRequestSubmitted') })
      setShowForm(false)
      setForm(EMPTY_FORM)
      void load()
    } catch (e: unknown) {
      const apiError = e as { response?: { data?: { error?: { message?: string } } } }
      addToast({
        type: 'error',
        message: apiError.response?.data?.error?.message ?? (e as Error).message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const pendingCount = advances.filter((a) => a.status === 'pending_approval').length
  const activeCount = advances.filter((a) =>
    ['approved', 'partially_settled'].includes(a.status),
  ).length
  const totalOutstanding = advances
    .filter((a) => ['approved', 'partially_settled'].includes(a.status))
    .reduce((sum, a) => sum + Number(a.outstanding_amount), 0)

  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title={t('fin.myAdv.myAdvances')}
        subtitle={t('fin.myAdv.requestCashBeforeSpendingAndTrack')}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              if (!hasEmployeeLink) {
                addToast({
                  type: 'error',
                  message:
                    t('fin.myAdv.yourAccountIsnTLinkedTo'),
                })
                return
              }
              setShowForm(true)
            }}
          >
            {t('fin.myAdv.requestAdvance')}
          </Button>
        }
      />

      <Grid
        cols={3}
        tabletCols={3}
        phoneCols={1}
        gap={12}
        style={{ marginTop: '20px', marginBottom: '20px' }}
      >
        <KPICard
          label={t('fin.myAdv.pendingApproval')}
          value={pendingCount}
          iconColor={pendingCount > 0 ? 'warning' : 'accent'}
        />
        <KPICard label={t('fin.myAdv.activeAdvances')} value={activeCount} iconColor="accent" />
        <KPICard
          label={t('fin.myAdv.outstanding')}
          value={totalOutstanding.toLocaleString()}
          iconColor={totalOutstanding > 0 ? 'warning' : 'accent'}
        />
      </Grid>

      {!hasEmployeeLink ? (
        <EmptyState
          title={t('fin.myAdv.yourAccountIsnTLinkedTo2')}
          message={t('fin.myAdv.askHrToLinkYourUser')}
        />
      ) : loading && advances.length === 0 ? (
        <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
      ) : advances.length === 0 ? (
        <EmptyState
          title={t('fin.myAdv.noAdvanceRequestsYet')}
          message={t('fin.myAdv.requestAnAdvanceAndFinanceWill')}
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowForm(true)
              }}
            >
              {t('fin.myAdv.requestAdvance2')}
            </Button>
          }
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Ref', 'Purpose', 'Amount', 'Outstanding', 'Status', ''].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: h === 'Amount' || h === 'Outstanding' ? 'right' : 'left',
                        padding: '10px 16px',
                        color: theme.textMuted,
                        fontWeight: 600,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {tlh('fin.myAdv', h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {advances.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => {
                      navigate(`/finance/advances/${a.id}`)
                    }}
                    style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  >
                    <td
                      style={{
                        padding: '10px 16px',
                        color: theme.accent,
                        fontFamily: 'monospace',
                        fontSize: '12px',
                      }}
                    >
                      {a.advance_number}
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.textSecondary }}>
                      {a.purpose ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'end' }}>
                      <AmountDisplay
                        amount={Number(a.amount)}
                        currency={a.currency_code}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'end' }}>
                      <AmountDisplay
                        amount={Number(a.outstanding_amount)}
                        currency={a.currency_code}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge variant={STATUS_VARIANTS[a.status] ?? 'neutral'}>
                        {STATUS_LABELS[a.status] ?? a.status}
                      </Badge>
                    </td>
                    <td
                      style={{ padding: '10px 16px' }}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigate(`/finance/advances/${a.id}`)
                        }}
                      >
                        {t('fin.myAdv.view')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false)
          setForm(EMPTY_FORM)
        }}
        title={t('fin.myAdv.requestAdvance2')}
        description={t('fin.myAdv.aFinanceUserWillReviewThis')}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false)
                setForm(EMPTY_FORM)
              }}
            >
              {t('fin.myAdv.cancel')}
            </Button>
            <Button variant="primary" loading={submitting} onClick={() => void handleSubmit()}>
              {t('fin.myAdv.submitRequest')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label={t('fin.myAdv.amount')}
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => {
                setForm((f) => ({ ...f, amount: e.target.value }))
              }}
            />
            <Select
              label={t('fin.myAdv.currency')}
              value={form.currency_code}
              onChange={(e) => {
                setForm((f) => ({ ...f, currency_code: e.target.value }))
              }}
            >
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
          </div>

          <Textarea
            label={t('fin.myAdv.purpose')}
            value={form.purpose}
            onChange={(e) => {
              setForm((f) => ({ ...f, purpose: e.target.value }))
            }}
            placeholder={t('fin.myAdv.whatIsThisAdvanceFor')}
            rows={2}
          />

          <Select
            label={t('fin.myAdv.projectOptional')}
            value={form.project_id}
            onChange={(e) => {
              setForm((f) => ({ ...f, project_id: e.target.value }))
            }}
          >
            <option value="">{t('fin.myAdv.notSet')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
        </div>
      </Modal>
    </div>
  )
}
