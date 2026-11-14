import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { AmountDisplay } from '../ui/AmountDisplay'
import { api } from '../../lib/axios'
import { useToastStore } from '../../store/toastStore'

// Why a cashbox cannot pay this advance; the server decides (cashboxProblem) and sends the code.
export type CashboxProblem =
  | 'CASHBOX_INACTIVE'
  | 'CURRENCY_MISMATCH'
  | 'NO_GL_ACCOUNT'
  | 'INSUFFICIENT_BALANCE'

interface Cashbox {
  id: string
  name: string
  location: string | null
  custodian_name: string | null
  currency_code: string
  current_balance: number | string
  problem: CashboxProblem | null
}

interface IssueOptions {
  advance: {
    id: string
    advance_number: string
    employee_name: string
    purpose: string | null
    amount: number | string
    currency_code: string
    project_code: string | null
    project_name: string | null
    // Already set on the advance (by whoever filed it, or an earlier edit); the picker starts on it.
    cost_center_id: string | null
  }
  cashboxes: Cashbox[]
  // The company's active cost centers, sent with the options because the handler holds the cashbox permission and not
  // necessarily the one that lists cost centers.
  cost_centers: { id: string; code: string; name: string }[]
}

const errorMessage = (err: unknown, fallback: string): string => {
  const apiError = err as { response?: { data?: { error?: { message?: string } } } }
  return apiError.response?.data?.error?.message ?? fallback
}

// The cashbox handler's step: pick the cashbox the cash comes out of and pay the advance. The manager has already
// approved it; the server refuses a cashbox that is not this company's, not active, in another currency, without a GL
// account or holding less than the amount, and the list below shows each of those up front so nobody picks one only
// to be refused.
export function IssueAdvanceModal({
  advanceId,
  onClose,
  onIssued,
}: {
  advanceId: string | null
  onClose: () => void
  // The advance was paid out: the page reloads its list and closes the dialog.
  onIssued: () => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [options, setOptions] = useState<IssueOptions | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [selected, setSelected] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [issuing, setIssuing] = useState(false)

  useEffect(() => {
    setOptions(null)
    setFailed(null)
    setSelected('')
    setCostCenterId('')
    if (!advanceId) return
    let cancelled = false
    setLoading(true)
    api
      .get<IssueOptions>(`/finance/advances/${advanceId}/issue-options`)
      .then((r) => {
        if (cancelled) return
        setOptions(r.data)
        setCostCenterId(r.data.advance.cost_center_id ?? '')
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailed(errorMessage(err, t('fin.advRequest.couldNotLoadCashboxes')))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [advanceId, t])

  const usable = options?.cashboxes.filter((b) => !b.problem) ?? []

  async function issue() {
    if (!advanceId || !selected) return
    setIssuing(true)
    try {
      await api.post(`/finance/advances/${advanceId}/issue`, {
        petty_cash_float_id: selected,
        cost_center_id: costCenterId || undefined,
      })
      addToast({ type: 'success', message: t('fin.advRequest.advanceIssued') })
      onIssued()
    } catch (err: unknown) {
      addToast({ type: 'error', message: errorMessage(err, t('fin.advRequest.couldNotIssue')) })
    } finally {
      setIssuing(false)
    }
  }

  const adv = options?.advance

  return (
    <Modal
      open={!!advanceId}
      onClose={onClose}
      title={
        adv
          ? t('fin.advRequest.issueTitle', { number: adv.advance_number })
          : t('fin.advRequest.issueCash')
      }
      description={adv?.purpose ?? undefined}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('fin.advRequest.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={issuing}
            disabled={!selected || issuing}
            onClick={() => void issue()}
          >
            {adv
              ? t('fin.advRequest.issueButton', {
                  amount: Number(adv.amount).toLocaleString(),
                  currency: adv.currency_code,
                })
              : t('fin.advRequest.issueCash')}
          </Button>
        </div>
      }
    >
      {loading && (
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>
          {t('fin.advRequest.loadingCashboxes')}
        </div>
      )}
      {failed && (
        <div role="alert" style={{ color: theme.danger, fontSize: '13px' }}>
          {failed}
        </div>
      )}
      {adv && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              padding: '12px 14px',
              borderRadius: '10px',
              background: theme.bgCanvas,
              border: `1px solid ${theme.border}`,
            }}
          >
            <span style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 600 }}>
              {adv.employee_name}
            </span>
            <AmountDisplay amount={Number(adv.amount)} currency={adv.currency_code} size="sm" />
            {adv.project_code && (
              <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                {adv.project_code} — {adv.project_name}
              </span>
            )}
          </div>

          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            {t('fin.advRequest.chooseCashbox')}
          </div>

          {options.cashboxes.length === 0 && (
            <div style={{ fontSize: '13px', color: theme.textSecondary }}>
              {t('fin.advRequest.noCashboxes')}
            </div>
          )}
          {options.cashboxes.length > 0 && usable.length === 0 && (
            <div style={{ fontSize: '13px', color: theme.warning }}>
              {t('fin.advRequest.noUsableCashbox')}
            </div>
          )}

          <div
            role="radiogroup"
            aria-label={t('fin.advRequest.chooseCashbox')}
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {options.cashboxes.map((b) => {
              const disabled = !!b.problem
              const active = selected === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => {
                    setSelected(b.id)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    textAlign: 'start',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: `1px solid ${active ? theme.accent : theme.borderField}`,
                    background: active ? theme.accentBg : theme.bgSurface,
                    opacity: disabled ? 0.55 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    color: theme.textPrimary,
                  }}
                >
                  <span
                    style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{b.name}</span>
                    <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                      {[
                        b.location,
                        b.custodian_name
                          ? t('fin.advRequest.heldBy', { name: b.custodian_name })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </span>
                    {b.problem && (
                      <span style={{ fontSize: '12px', color: theme.danger }}>
                        {t(`fin.advRequest.problem.${b.problem}`)}
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: 'end', flexShrink: 0 }}>
                    <span
                      style={{ display: 'block', fontSize: '11px', color: theme.textSecondary }}
                    >
                      {t('fin.advRequest.balance')}
                    </span>
                    <AmountDisplay
                      amount={Number(b.current_balance)}
                      currency={b.currency_code}
                      size="sm"
                    />
                  </span>
                </button>
              )
            })}
          </div>

          {options.cost_centers.length > 0 && (
            <div>
              <Select
                label={t('fin.advDetail.costCenterOptional')}
                value={costCenterId}
                onChange={(e) => {
                  setCostCenterId(e.target.value)
                }}
              >
                <option value="">{t('fin.advDetail.notSet')}</option>
                {options.cost_centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </Select>
              <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                {t('fin.advRequest.costCenterHint')}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
