import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { usePermission } from '../../../hooks/usePermission'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { ACCOUNTS_QUERY } from '../../../graphql/finance'
import {
  POSTING_ACCOUNT_ROLES_QUERY,
  COMPANY_POSTING_ACCOUNTS_QUERY,
  POSTING_ACCOUNT_READINESS_QUERY,
  UPSERT_COMPANY_POSTING_ACCOUNT,
  DELETE_COMPANY_POSTING_ACCOUNT,
} from '../../../graphql/finance'
import type {
  AccountsQuery,
  AccountsQueryVariables,
  PostingAccountRolesQuery,
  CompanyPostingAccountsQuery,
  PostingAccountReadinessQuery,
  UpsertCompanyPostingAccountMutation,
  UpsertCompanyPostingAccountMutationVariables,
  DeleteCompanyPostingAccountMutation,
  DeleteCompanyPostingAccountMutationVariables,
} from '../../../graphql/generated'

// G1/G2: labels for the 18 fixed roles in packages/db/src/posting-accounts.ts
// (POSTING_ACCOUNT_ROLES). A module-level map, so translated at the use
// site (i18n.t(key, { defaultValue })) rather than via the useTranslation
// hook -- see docs/claude/playbook.md #25.
const ROLE_LABELS: Record<string, string> = {
  ar: 'Accounts Receivable (default)',
  ap: 'Accounts Payable (default)',
  revenue_project: 'Project Revenue',
  revenue_rental: 'Rental Revenue',
  expense_default: 'Default Expense',
  cash: 'Cash / Bank (payments out)',
  retention_receivable: 'Retention Receivable',
  retention_payable: 'Retention Payable',
  wht_recoverable: 'WHT Recoverable',
  wht_payable: 'WHT Payable',
  wht_expense: 'WHT Expense',
  salaries_payable: 'Salaries Payable',
  payroll_tax_payable: 'Payroll Tax / Social Security Payable',
  grni: 'Goods Received, Not Invoiced',
  stock_variance: 'Stock Variance',
  interco_receivable: 'Intercompany Receivable',
  interco_payable: 'Intercompany Payable',
  inventory: 'Inventory',
}
const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

interface GLAccount {
  id: string
  code: string
  name: string
  is_postable: boolean
  is_active: boolean
}

export default function PostingAccountsPage() {
  const { t, i18n } = useTranslation()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const { can } = usePermission()
  const addToast = useToastStore((s) => s.addToast)
  const canEdit = can('finance.accounts.edit', 'edit')

  const [addingRole, setAddingRole] = useState<string | null>(null)
  const [addCurrency, setAddCurrency] = useState<string>('')
  const [addAccountId, setAddAccountId] = useState('')

  const { data: rolesData, loading: rolesLoading } = useQuery<PostingAccountRolesQuery>(
    POSTING_ACCOUNT_ROLES_QUERY,
  )
  const { data: accountsData } = useQuery<AccountsQuery, AccountsQueryVariables>(ACCOUNTS_QUERY, {
    variables: { isActive: true },
  })
  const {
    data: mapData,
    loading: mapLoading,
    refetch: refetchMap,
  } = useQuery<CompanyPostingAccountsQuery>(COMPANY_POSTING_ACCOUNTS_QUERY)
  const { data: readinessData, refetch: refetchReadiness } = useQuery<PostingAccountReadinessQuery>(
    POSTING_ACCOUNT_READINESS_QUERY,
  )

  const [upsert, { loading: saving }] = useMutation<
    UpsertCompanyPostingAccountMutation,
    UpsertCompanyPostingAccountMutationVariables
  >(UPSERT_COMPANY_POSTING_ACCOUNT, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('fin.postingAccounts.saved', { defaultValue: 'Posting account saved' }) })
      setAddingRole(null)
      setAddAccountId('')
      void refetchMap()
      void refetchReadiness()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [remove] = useMutation<DeleteCompanyPostingAccountMutation, DeleteCompanyPostingAccountMutationVariables>(
    DELETE_COMPANY_POSTING_ACCOUNT,
    {
      onCompleted: () => {
        addToast({ type: 'success', message: t('fin.postingAccounts.removed', { defaultValue: 'Posting account removed' }) })
        void refetchMap()
        void refetchReadiness()
      },
      onError: (e) => {
        addToast({ type: 'error', message: e.message })
      },
    },
  )

  const postableAccounts = useMemo(
    () => ((accountsData?.accounts ?? []) as GLAccount[]).filter((a) => a.is_postable && a.is_active),
    [accountsData],
  )
  const rows = mapData?.companyPostingAccounts ?? []
  const roles = rolesData?.postingAccountRoles ?? []
  const readiness = readinessData?.postingAccountReadiness
  const loading = rolesLoading || mapLoading

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '6px',
    padding: '5px 8px',
    fontSize: '12px',
    color: theme.textPrimary,
    fontFamily: 'inherit',
  }

  function handleSave(role: string, currencyCode: string | null) {
    if (!addAccountId) return
    void upsert({ variables: { role, currencyCode, accountId: addAccountId } })
  }

  return (
    <div style={pagePadding}>
      <PageHeader
        title={t('fin.postingAccounts.title', { defaultValue: 'Posting Accounts' })}
        subtitle={t('fin.postingAccounts.subtitle', {
          defaultValue:
            'The GL account every automated journal (vendor invoices, payments, project/rental invoices, payroll, interco) resolves through for each role. A role with no account configured fails to post with a clear error instead of guessing one.',
        })}
      />

      {readiness && (
        <Card
          padding="md"
          style={{
            marginTop: '16px',
            maxWidth: '900px',
            borderInlineStart: `4px solid ${readiness.allConfigured ? theme.accent : '#f59e0b'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
              {t('fin.postingAccounts.readiness', { defaultValue: 'Readiness' })}
            </span>
            <Badge variant={readiness.allConfigured ? 'success' : 'warning'}>
              {readiness.allConfigured
                ? t('fin.postingAccounts.allConfigured', { defaultValue: 'All roles configured' })
                : t('fin.postingAccounts.rolesMissing', {
                    defaultValue: '{{count}} role(s) missing a default',
                    count: readiness.missingRoles.length,
                  })}
            </Badge>
          </div>
          {!readiness.allConfigured && (
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>
              {readiness.missingRoles
                .map((r) => i18n.t(`fin.postingAccounts.roleLabels.${r}`, { defaultValue: ROLE_LABELS[r] ?? r }))
                .join(', ')}
            </div>
          )}
        </Card>
      )}

      <Card padding="md" style={{ marginTop: '16px', maxWidth: '900px' }}>
        {loading ? (
          <div style={{ fontSize: '12px', color: theme.textMuted }}>{t('common.loading', { defaultValue: 'Loading…' })}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {[
                  t('fin.postingAccounts.role', { defaultValue: 'Role' }),
                  t('fin.postingAccounts.defaultAccount', { defaultValue: 'Default Account' }),
                  t('fin.postingAccounts.currencyOverrides', { defaultValue: 'Currency Overrides' }),
                  '',
                ].map((h) => (
                  <th key={h} style={{ padding: '8px', textAlign: 'start', color: theme.textMuted, fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const roleRows = rows.filter((r) => r.role === role)
                const defaultRow = roleRows.find((r) => r.currencyCode === null)
                const overrideRows = roleRows.filter((r) => r.currencyCode !== null)
                const label = i18n.t(`fin.postingAccounts.roleLabels.${role}`, {
                  defaultValue: ROLE_LABELS[role] ?? role,
                })
                return (
                  <tr key={role} style={{ borderBottom: `1px solid ${theme.border}`, verticalAlign: 'top' }}>
                    <td style={{ padding: '8px', fontWeight: 600, color: theme.textPrimary, minWidth: '180px' }}>
                      {label}
                      <div style={{ fontSize: '10px', color: theme.textMuted, fontFamily: 'monospace' }}>{role}</div>
                    </td>
                    <td style={{ padding: '8px' }}>
                      {defaultRow ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: theme.textSecondary }}>
                            {defaultRow.accountCode} · {defaultRow.accountName}
                          </span>
                          {canEdit && (
                            <button
                              onClick={() => void remove({ variables: { role, currencyCode: null } })}
                              style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '11px' }}
                            >
                              {t('fin.postingAccounts.clear', { defaultValue: 'Clear' })}
                            </button>
                          )}
                        </div>
                      ) : addingRole === role && addCurrency === '' ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <select
                            style={inputStyle}
                            value={addAccountId}
                            onChange={(e) => { setAddAccountId(e.target.value) }}
                          >
                            <option value="">{t('fin.postingAccounts.selectAccount', { defaultValue: 'Select account…' })}</option>
                            {postableAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code} · {a.name}
                              </option>
                            ))}
                          </select>
                          <Button variant="primary" size="sm" disabled={!addAccountId || saving} onClick={() => { handleSave(role, null); }}>
                            {t('fin.postingAccounts.save', { defaultValue: 'Save' })}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => { setAddingRole(null); setAddAccountId(''); }}>
                            {t('fin.postingAccounts.cancel', { defaultValue: 'Cancel' })}
                          </Button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Badge variant="warning">{t('fin.postingAccounts.notConfigured', { defaultValue: 'Not configured' })}</Badge>
                          {canEdit && (
                            <button
                              onClick={() => { setAddingRole(role); setAddCurrency(''); setAddAccountId(''); }}
                              style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                            >
                              {t('fin.postingAccounts.setDefault', { defaultValue: '+ Set default' })}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {overrideRows.map((r) => (
                          <div key={r.currencyCode} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, color: theme.textPrimary, minWidth: '34px' }}>{r.currencyCode}</span>
                            <span style={{ color: theme.textSecondary }}>{r.accountCode} · {r.accountName}</span>
                            {canEdit && (
                              <button
                                onClick={() => void remove({ variables: { role, currencyCode: r.currencyCode } })}
                                style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '11px' }}
                              >
                                {t('fin.postingAccounts.clear', { defaultValue: 'Clear' })}
                              </button>
                            )}
                          </div>
                        ))}
                        {canEdit && addingRole === role && addCurrency !== '' ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select style={inputStyle} value={addCurrency} onChange={(e) => { setAddCurrency(e.target.value); }}>
                              {CURRENCIES.filter((c) => !overrideRows.some((r) => r.currencyCode === c)).map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <select style={inputStyle} value={addAccountId} onChange={(e) => { setAddAccountId(e.target.value); }}>
                              <option value="">{t('fin.postingAccounts.selectAccount', { defaultValue: 'Select account…' })}</option>
                              {postableAccounts.map((a) => (
                                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                              ))}
                            </select>
                            <Button variant="primary" size="sm" disabled={!addAccountId || saving} onClick={() => { handleSave(role, addCurrency); }}>
                              {t('fin.postingAccounts.save', { defaultValue: 'Save' })}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => { setAddingRole(null); setAddCurrency(''); setAddAccountId(''); }}>
                              {t('fin.postingAccounts.cancel', { defaultValue: 'Cancel' })}
                            </Button>
                          </div>
                        ) : (
                          canEdit && (
                            <button
                              onClick={() => { setAddingRole(role); setAddCurrency(CURRENCIES.find((c) => !overrideRows.some((r) => r.currencyCode === c)) ?? 'USD'); setAddAccountId(''); }}
                              style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '11px', fontWeight: 600, alignSelf: 'flex-start' }}
                            >
                              {t('fin.postingAccounts.addCurrencyOverride', { defaultValue: '+ Add currency override' })}
                            </button>
                          )
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '8px' }} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
