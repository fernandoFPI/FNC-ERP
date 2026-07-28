import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { VENDORS_QUERY } from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { useEntityChanged } from '../../../hooks/useEntityChanged'

interface Vendor {
  id: string
  name: string
  legal_name?: string
  tax_id?: string
  currency_code: string
  payment_terms_days: number
  country_code?: string
  contact_email?: string
  is_active: boolean
}

export default function VendorsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data, loading, refetch } = useQuery(VENDORS_QUERY, {
    variables: {},
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('vendor', () => void refetch())

  const vendors: Vendor[] = data?.vendors ?? []
  const filtered = vendors.filter((v) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      v.name.toLowerCase().includes(q) ||
      (v.contact_email ?? '').toLowerCase().includes(q) ||
      (v.tax_id ?? '').includes(q)
    )
  })

  const columns: Column<Vendor>[] = [
    {
      key: 'name',
      header: 'Vendor Name',
      render: (v) => (
        <div>
          <div style={{ color: theme.textPrimary, fontWeight: 500 }}>{v.name}</div>
          {v.legal_name && v.legal_name !== v.name && (
            <div style={{ color: theme.textMuted, fontSize: '11px' }}>{v.legal_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'tax_id',
      header: 'Tax ID',
      render: (v) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px', fontFamily: 'monospace' }}>
          {v.tax_id ?? '—'}
        </span>
      ),
    },
    {
      key: 'currency_code',
      header: 'Currency',
      render: (v) => <Badge variant="info">{v.currency_code}</Badge>,
    },
    {
      key: 'payment_terms_days',
      header: 'Payment Terms',
      render: (v) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
          Net {v.payment_terms_days} days
        </span>
      ),
    },
    {
      key: 'country_code',
      header: 'Country',
      render: (v) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
          {v.country_code ?? '—'}
        </span>
      ),
    },
    {
      key: 'contact_email',
      header: 'Contact',
      render: (v) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
          {v.contact_email ?? '—'}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (v) => (
        <Badge variant={v.is_active ? 'success' : 'neutral'}>
          {v.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Vendors"
        subtitle={`${filtered.length} vendors`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/procurement/vendors/new')
            }}
          >
            New Vendor
          </Button>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        />
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="id"
          onRowClick={(v) => {
            navigate(`/procurement/vendors/${v.id}`)
          }}
        />
      </Card>
    </div>
  )
}
