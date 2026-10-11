import i18n, { enumLabel } from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { ACCOUNTS_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import type { AccountsQuery, AccountsQueryVariables } from '../../../graphql/generated'

interface Account {
  id: string
  code: string
  name: string
  account_type: string
  is_active: boolean
  currency_code: string
  parent_name?: string | null
  is_reconcilable?: boolean | null
  is_header?: boolean | null
  account_category?: string | null
}

const TYPE_LABELS: Record<string, string> = {
  get asset() { return i18n.t('fin.accounts.asset', { defaultValue: "Asset" }) },
  get liability() { return i18n.t('fin.accounts.liability', { defaultValue: "Liability" }) },
  get equity() { return i18n.t('fin.accounts.equity', { defaultValue: "Equity" }) },
  get revenue() { return i18n.t('fin.accounts.revenue', { defaultValue: "Revenue" }) },
  get expense() { return i18n.t('fin.accounts.expense', { defaultValue: "Expense" }) },
}

const TYPE_OPTIONS = [
  { value: 'asset', get label() { return i18n.t('fin.accounts.asset', { defaultValue: "Asset" }) } },
  { value: 'liability', get label() { return i18n.t('fin.accounts.liability', { defaultValue: "Liability" }) } },
  { value: 'equity', get label() { return i18n.t('fin.accounts.equity', { defaultValue: "Equity" }) } },
  { value: 'revenue', get label() { return i18n.t('fin.accounts.revenue', { defaultValue: "Revenue" }) } },
  { value: 'expense', get label() { return i18n.t('fin.accounts.expense', { defaultValue: "Expense" }) } },
]

export default function AccountsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const { data, loading, refetch } = useQuery<AccountsQuery, AccountsQueryVariables>(ACCOUNTS_QUERY, {
    variables: { type: typeFilter || undefined, isActive: undefined },
    fetchPolicy: 'cache-and-network',
  })

  const accounts: Account[] = (data?.accounts ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const filtered = accounts.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
  })

  const columns: Column<Account>[] = [
    {
      key: 'code',
      header: t('fin.accounts.code'),
      render: (a) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary, fontSize: '13px' }}>
          {a.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: t('fin.accounts.name'),
      render: (a) => (
        <div>
          <div
            style={{
              color: theme.textPrimary,
              fontSize: '13px',
              fontWeight: a.is_header ? 600 : 400,
            }}
          >
            {a.name}
          </div>
          {a.parent_name && (
            <div style={{ color: theme.textMuted, fontSize: '11px' }}>{a.parent_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'account_type',
      header: t('fin.accounts.type'),
      render: (a) => (
        <Badge
          variant={
            a.account_type === 'asset' || a.account_type === 'revenue'
              ? 'success'
              : a.account_type === 'expense'
                ? 'warning'
                : 'info'
          }
        >
          {TYPE_LABELS[a.account_type] ?? a.account_type}
        </Badge>
      ),
    },
    {
      key: 'account_category',
      header: t('fin.accounts.category'),
      render: (a) =>
        a.account_category ? (
          <Badge variant="neutral">{enumLabel(a.account_category)}</Badge>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '12px' }}>—</span>
        ),
    },
    {
      key: 'currency_code',
      header: t('fin.accounts.currency'),
      render: (a) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{a.currency_code}</span>
      ),
    },
    {
      key: 'is_active',
      header: t('fin.accounts.status'),
      render: (a) => (
        <Badge variant={a.is_active ? 'success' : 'neutral'}>
          {a.is_active ? t('fin.accounts.active') : t('fin.accounts.inactive')}
        </Badge>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title={t('fin.accounts.chartOfAccounts')}
        subtitle={`${filtered.length} accounts`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/finance/accounts/new')
            }}
          >
            {t('fin.accounts.newAccount')}
          </Button>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'type',
              label: t('fin.accounts.type'),
              value: typeFilter,
              options: TYPE_OPTIONS,
              onChange: (v) => {
                setTypeFilter(v)
              },
            },
          ]}
          resultCount={filtered.length}
          onRefresh={() => void refetch()}
        />
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="id"
          onRowClick={(a) => {
            navigate(`/finance/accounts/${a.id}/ledger`)
          }}
        />
      </Card>
    </div>
  )
}
