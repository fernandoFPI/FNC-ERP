import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@apollo/client'
import {
  BANK_DETAILS_SUMMARY_QUERY,
  REVEAL_BANK_DETAILS,
  UPDATE_BANK_DETAILS,
} from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { PermissionGate } from '../../../components/ui/PermissionGate'
import { useToastStore } from '../../../store/toastStore'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

interface BankDetails {
  bank_name?: string
  account_number?: string
  iban?: string
  currency_code?: string
}

interface Props {
  employeeId: string
}

const REVEAL_SECONDS = 30

export function BankDetailsForm({ employeeId }: Props) {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [expanded, setExpanded] = useState(false)
  const [revealed, setRevealed] = useState<BankDetails | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<BankDetails>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: summaryData, refetch: refetchSummary } = useQuery(BANK_DETAILS_SUMMARY_QUERY, {
    variables: { employee_id: employeeId },
    skip: !expanded,
    fetchPolicy: 'cache-and-network',
  })

  const [revealMutation, { loading: revealing }] = useMutation(REVEAL_BANK_DETAILS)
  const [updateMutation, { loading: saving }] = useMutation(UPDATE_BANK_DETAILS)

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current)
    },
    [],
  )

  function startCountdown() {
    setCountdown(REVEAL_SECONDS)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          timerRef.current = null
          setRevealed(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function handleReveal() {
    try {
      const res = await revealMutation({ variables: { employee_id: employeeId } })
      setRevealed(res.data.revealBankDetails as BankDetails)
      startCountdown()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleSave() {
    try {
      await updateMutation({
        variables: {
          employee_id: employeeId,
          input: {
            bank_name: editForm.bank_name || null,
            account_number: editForm.account_number || null,
            iban: editForm.iban || null,
            currency_code: editForm.currency_code || null,
          },
        },
      })
      addToast({ type: 'success', message: 'Bank details updated' })
      setEditing(false)
      setRevealed(null)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      refetchSummary()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  function handleEdit() {
    const summary = summaryData?.bankDetailsSummary
    setEditForm({
      bank_name: revealed?.bank_name ?? summary?.bank_name ?? '',
      account_number: revealed?.account_number ?? '',
      iban: revealed?.iban ?? '',
      currency_code: revealed?.currency_code ?? summary?.currency_code ?? '',
    })
    setEditing(true)
  }

  const summary = summaryData?.bankDetailsSummary
  const hasData = summary?.has_account || revealed

  return (
    <div
      style={{
        marginTop: '16px',
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => {
          setExpanded((e) => !e)
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: theme.bgSurface,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>
          Bank Details
        </span>
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '16px', background: theme.bgCanvas }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Input
                label="Bank Name"
                value={editForm.bank_name ?? ''}
                onChange={(e) => {
                  setEditForm((f) => ({ ...f, bank_name: e.target.value }))
                }}
              />
              <Input
                label="Account Number"
                value={editForm.account_number ?? ''}
                onChange={(e) => {
                  setEditForm((f) => ({ ...f, account_number: e.target.value }))
                }}
                placeholder={
                  revealed?.account_number
                    ? '(leave blank to keep existing)'
                    : 'Enter account number'
                }
              />
              <Input
                label="IBAN"
                value={editForm.iban ?? ''}
                onChange={(e) => {
                  setEditForm((f) => ({ ...f, iban: e.target.value }))
                }}
                placeholder={revealed?.iban ? '(leave blank to keep existing)' : 'Enter IBAN'}
              />
              <div>
                <SearchableSelect
                  label="Currency"
                  value={editForm.currency_code ?? ''}
                  onChange={(v) => {
                    setEditForm((f) => ({ ...f, currency_code: v }))
                  }}
                  placeholder="— Select currency —"
                  options={[
                    { value: 'IQD', label: 'IQD – Iraqi Dinar' },
                    { value: 'USD', label: 'USD – US Dollar' },
                    { value: 'EUR', label: 'EUR – Euro' },
                    { value: 'GBP', label: 'GBP – British Pound' },
                    { value: 'AED', label: 'AED – UAE Dirham' },
                    { value: 'SAR', label: 'SAR – Saudi Riyal' },
                    { value: 'TRY', label: 'TRY – Turkish Lira' },
                    { value: 'CNY', label: 'CNY – Chinese Yuan' },
                  ]}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false)
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '8px',
                  marginBottom: '12px',
                }}
              >
                {[
                  {
                    label: 'Bank',
                    value: summary?.bank_name ?? revealed?.bank_name ?? '—',
                    sensitive: false,
                  },
                  {
                    label: 'Account Number',
                    value: revealed?.account_number ?? (hasData ? '••••••••' : '—'),
                    sensitive: !revealed,
                  },
                  {
                    label: 'IBAN',
                    value: revealed?.iban ?? (hasData ? '••••••••' : '—'),
                    sensitive: !revealed,
                  },
                  {
                    label: 'Currency',
                    value: summary?.currency_code ?? revealed?.currency_code ?? '—',
                    sensitive: false,
                  },
                ].map(({ label, value, sensitive }) => (
                  <div
                    key={label}
                    style={{
                      padding: '10px 12px',
                      background: theme.bgSurface,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '3px' }}>
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        color: theme.textPrimary,
                        fontFamily: sensitive ? 'monospace' : undefined,
                        letterSpacing: sensitive ? '0.1em' : undefined,
                      }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {revealed ? (
                  <span style={{ fontSize: '12px', color: theme.warning, fontWeight: 500 }}>
                    Hiding in {countdown}s
                  </span>
                ) : (
                  hasData && (
                    <PermissionGate permission="hr.employees.view_salary" minLevel="view">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={revealing}
                        onClick={handleReveal}
                      >
                        Reveal
                      </Button>
                    </PermissionGate>
                  )
                )}
                <PermissionGate permission="hr.employees.manage_salary" minLevel="edit">
                  <Button variant="ghost" size="sm" onClick={handleEdit}>
                    {hasData ? 'Edit' : 'Add bank details'}
                  </Button>
                </PermissionGate>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
