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

interface Account {
  id: string
  code: string
  name: string
  account_type: string
  is_active: boolean
  currency_code: string
  parent_name?: string
  is_reconcilable?: boolean
}

const TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
}

const TYPE_OPTIONS = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
]

export default function AccountsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const { data, loading, refetch } = useQuery(ACCOUNTS_QUERY, {
    variables: { type: typeFilter || undefined, isActive: undefined },
    fetchPolicy: 'cache-and-network',
  })

  const accounts: Account[] = data?.accounts ?? []
  const filtered = accounts.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
  })

  const columns: Column<Account>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (a) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary, fontSize: '13px' }}>
          {a.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (a) => (
        <div>
          <div style={{ color: theme.textPrimary, fontSize: '13px' }}>{a.name}</div>
          {a.parent_name && (
            <div style={{ color: theme.textMuted, fontSize: '11px' }}>{a.parent_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'account_type',
      header: 'Type',
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
      key: 'currency_code',
      header: 'Currency',
      render: (a) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{a.currency_code}</span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (a) => (
        <Badge variant={a.is_active ? 'success' : 'neutral'}>
          {a.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Chart of Accounts"
        subtitle={`${filtered.length} accounts`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/finance/accounts/new')
            }}
          >
            New Account
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
              label: 'Type',
              value: typeFilter,
              options: TYPE_OPTIONS,
              onChange: (v) => {
                setTypeFilter(v)
              },
            },
          ]}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
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
