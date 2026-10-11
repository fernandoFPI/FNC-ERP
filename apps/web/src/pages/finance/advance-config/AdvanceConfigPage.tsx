import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'

interface GLAccount {
  id: string
  code: string
  name: string
}
interface DefaultCashAccount {
  id: string
  currency_code: string
  account_id: string
  account_code: string
  account_name: string
}
const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

export default function AdvanceConfigPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const addToast = useToastStore((s) => s.addToast)

  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [defaults, setDefaults] = useState<DefaultCashAccount[]>([])
  const [parentAccountId, setParentAccountId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [newCurrency, setNewCurrency] = useState('IQD')
  const [newAccountId, setNewAccountId] = useState('')
  const [savingDefault, setSavingDefault] = useState(false)
  const [savingParent, setSavingParent] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [glRes, defaultsRes, parentRes] = await Promise.all([
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
        api.get<DefaultCashAccount[]>('/finance/advance-config/default-cash-accounts'),
        api.get<{ advance_control_parent_account_id: string | null }>(
          '/finance/advance-config/parent-account',
        ),
      ])
      setGlAccounts(glRes.data)
      setDefaults(defaultsRes.data)
      setParentAccountId(parentRes.data.advance_control_parent_account_id)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleAddDefault() {
    if (!newAccountId) return
    setSavingDefault(true)
    try {
      await api.post('/finance/advance-config/default-cash-accounts', {
        currency_code: newCurrency,
        account_id: newAccountId,
      })
      addToast({ type: 'success', message: t('fin.advConfig.defaultCashAccountSetFor', { newCurrency }) })
      setNewAccountId('')
      void load()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    } finally {
      setSavingDefault(false)
    }
  }

  async function handleRemoveDefault(id: string) {
    try {
      await api.delete(`/finance/advance-config/default-cash-accounts/${id}`)
      void load()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleSaveParent(accountId: string) {
    setSavingParent(true)
    try {
      await api.put('/finance/advance-config/parent-account', { account_id: accountId })
      setParentAccountId(accountId)
      addToast({ type: 'success', message: t('fin.advConfig.employeeAdvancesParentAccountUpdated') })
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    } finally {
      setSavingParent(false)
    }
  }

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '6px',
    padding: '5px 8px',
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

  return (
    <div style={pagePadding}>
      <PageHeader
        title={t('fin.advConfig.advanceAutomation')}
        subtitle={t('fin.advConfig.accountsUsedToAutoResolveEmployee')}
      />

      <Card padding="md" style={{ marginTop: '20px', maxWidth: '640px' }}>
        <p
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: theme.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '4px',
          }}
        >
          {t('fin.advConfig.defaultCashAccounts')}
        </p>
        <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '14px' }}>
          {t('fin.advConfig.theAccountCreditedWhenAnAdvance')}
        </p>

        {defaults.length > 0 && (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12px',
              marginBottom: '14px',
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {[t('fin.advConfig.currency'), t('fin.advConfig.account'), ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 8px',
                      textAlign: 'start',
                      color: theme.textMuted,
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {defaults.map((d) => (
                <tr key={d.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: theme.textPrimary }}>
                    {d.currency_code}
                  </td>
                  <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                    {d.account_code} · {d.account_name}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleRemoveDefault(d.id)}
                    >
                      {t('fin.advConfig.remove')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {loading ? (
          <div style={{ fontSize: '12px', color: theme.textMuted }}>{t('fin.advConfig.loading')}</div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ width: '110px' }}>
              <label style={labelStyle}>{t('fin.advConfig.currency')}</label>
              <select
                style={inputStyle}
                value={newCurrency}
                onChange={(e) => {
                  setNewCurrency(e.target.value)
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{t('fin.advConfig.account')}</label>
              <select
                style={inputStyle}
                value={newAccountId}
                onChange={(e) => {
                  setNewAccountId(e.target.value)
                }}
              >
                <option value="">{t('fin.advConfig.selectAccount')}</option>
                {glAccounts.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code} · {g.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleAddDefault()}
              disabled={savingDefault || !newAccountId}
            >
              {savingDefault ? t('fin.advConfig.saving') : t('fin.advConfig.save')}
            </Button>
          </div>
        )}
      </Card>

      <Card padding="md" style={{ marginTop: '16px', maxWidth: '640px' }}>
        <p
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: theme.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '4px',
          }}
        >
          {t('fin.advConfig.employeeAdvancesParentAccount')}
        </p>
        <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '14px' }}>
          {t('fin.advConfig.eachEmployeeSOwnAdvanceTracking')}
        </p>
        <Select
          value={parentAccountId ?? ''}
          onChange={(e) => {
            void handleSaveParent(e.target.value)
          }}
          disabled={savingParent}
        >
          <option value="">{t('fin.advConfig.selectParentAccount')}</option>
          {glAccounts.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} · {g.name}
            </option>
          ))}
        </Select>
      </Card>
    </div>
  )
}
