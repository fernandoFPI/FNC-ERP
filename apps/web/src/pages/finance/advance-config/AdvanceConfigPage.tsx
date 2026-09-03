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
      addToast({ type: 'success', message: `Default cash account set for ${newCurrency}` })
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
      addToast({ type: 'success', message: 'Employee Advances parent account updated' })
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
        title="Advance Automation"
        subtitle="Accounts used to auto-resolve employee cash advance and expense reimbursement postings"
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
          Default Cash Accounts
        </p>
        <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '14px' }}>
          The account credited when an advance is issued or an expense claim is reimbursed, chosen
          automatically by currency.
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
                {['Currency', 'Account', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 8px',
                      textAlign: 'left',
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
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {loading ? (
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ width: '110px' }}>
              <label style={labelStyle}>Currency</label>
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
              <label style={labelStyle}>Account</label>
              <select
                style={inputStyle}
                value={newAccountId}
                onChange={(e) => {
                  setNewAccountId(e.target.value)
                }}
              >
                <option value="">— Select account —</option>
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
              {savingDefault ? 'Saving...' : 'Save'}
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
          Employee Advances Parent Account
        </p>
        <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '14px' }}>
          Each employee's own advance-tracking account is auto-created the first time they need one,
          as a child of this account. Also used to auto-fill Payment Vouchers linked to an advance
          settlement — this account's code on the voucher header, the employee's own on the line.
        </p>
        <Select
          value={parentAccountId ?? ''}
          onChange={(e) => {
            void handleSaveParent(e.target.value)
          }}
          disabled={savingParent}
        >
          <option value="">— Select parent account —</option>
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
