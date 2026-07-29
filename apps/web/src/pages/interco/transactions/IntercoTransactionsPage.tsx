import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { FilterBar } from '../../../components/ui/FilterBar'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'

const FILTER_DEFAULTS = { search: '', status: '', type: '', fromDate: '', toDate: '' }
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { useToastStore } from '../../../store/toastStore'
import { INTERCO_TRANSACTIONS_QUERY, CREATE_INTERCO_TRANSACTION } from '../../../graphql/interco'

interface IntercoTxItem {
  id: string
  reference: string
  transactionType: string
  fromCompanyName: string
  toCompanyName: string
  amount: number
  currencyCode: string
  status: string
  createdAt: string
}

interface IntercoTxData {
  intercoTransactions: {
    items: IntercoTxItem[]
    total: number
    page: number
    limit: number
  }
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    posted: 'success',
    draft: 'neutral',
    cancelled: 'danger',
    pending: 'warning',
  }
  return m[status?.toLowerCase()] ?? 'neutral'
}

interface CreateTxForm {
  transactionType: string
  fromCompanyId: string
  toCompanyId: string
  amount: string
  currencyCode: string
  description: string
  fromAccountId: string
  toAccountId: string
}

const EMPTY_FORM: CreateTxForm = {
  transactionType: 'interco_charge',
  fromCompanyId: '',
  toCompanyId: '',
  amount: '',
  currencyCode: 'USD',
  description: '',
  fromAccountId: '',
  toAccountId: '',
}

export default function IntercoTransactionsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page] = useState(1)
  const currentFilters = { search, status: statusFilter, type: typeFilter, fromDate, toDate }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'interco_transactions',
    FILTER_DEFAULTS,
  )
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateTxForm>(EMPTY_FORM)

  const { data, loading, refetch } = useQuery<IntercoTxData>(INTERCO_TRANSACTIONS_QUERY, {
    variables: {
      status: statusFilter || undefined,
      transactionType: typeFilter || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      page,
      limit: 50,
    },
  })
  useEntityChanged('interco_transaction', () => void refetch())

  const [createTx, { loading: creating }] = useMutation(CREATE_INTERCO_TRANSACTION, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Transaction created' })
      setShowCreate(false)
      setForm(EMPTY_FORM)
      refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const items = (data?.intercoTransactions.items ?? []).filter(
    (r) =>
      !search ||
      r.reference.toLowerCase().includes(search.toLowerCase()) ||
      r.fromCompanyName.toLowerCase().includes(search.toLowerCase()),
  )

  const columns: Column<IntercoTxItem>[] = [
    {
      key: 'reference',
      header: 'Reference',
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.accent, fontWeight: 500 }}>{row.reference}</span>
      ),
    },
    {
      key: 'transactionType',
      header: 'Type',
      mobilePriority: 3,
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {row.transactionType.replace('interco_', '')}
        </Badge>
      ),
    },
    {
      key: 'fromCompanyName',
      header: 'From',
      mobileSecondary: true,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.fromCompanyName}</span>,
    },
    {
      key: 'toCompanyName',
      header: 'To',
      mobilePriority: 4,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.toCompanyName}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      mobilePriority: 2,
      render: (row) => <AmountDisplay amount={row.amount} currency={row.currencyCode} size="sm" />,
    },
    {
      key: 'status',
      header: 'Status',
      mobilePriority: 1,
      render: (row) => (
        <Badge variant={statusVariant(row.status)} size="sm">
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      mobilePriority: 5,
      render: (row) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ]

  function handleCreate() {
    createTx({
      variables: {
        input: {
          transactionType: form.transactionType,
          fromCompanyId: form.fromCompanyId,
          toCompanyId: form.toCompanyId,
          amount: parseFloat(form.amount),
          currencyCode: form.currencyCode,
          description: form.description,
          fromAccountId: form.fromAccountId,
          toAccountId: form.toAccountId,
        },
      },
    })
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Intercompany Transactions"
        subtitle="Charges, loans, and settlements between group entities"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowCreate(true)
            }}
          >
            + New Transaction
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search reference or company…',
          }}
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'pending', label: 'Pending' },
                { value: 'posted', label: 'Posted' },
                { value: 'cancelled', label: 'Cancelled' },
              ],
            },
            {
              key: 'type',
              label: 'Type',
              value: typeFilter,
              onChange: setTypeFilter,
              options: [
                { value: 'interco_charge', label: 'Charge' },
                { value: 'interco_loan', label: 'Loan' },
                { value: 'interco_settlement', label: 'Settlement' },
              ],
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onRefresh={() => {
            refetch()
          }}
          resultCount={items.length}
        >
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
              setStatusFilter(r.status)
              setTypeFilter(r.type)
              setFromDate(r.fromDate)
              setToDate(r.toDate)
            }}
            onSave={(name) => {
              savePreset(name, currentFilters)
            }}
            onDelete={deletePreset}
          />
        </FilterBar>
      </Card>

      <Card padding="none">
        <Table
          columns={columns}
          data={items}
          rowKey="id"
          loading={loading}
          emptyMessage="No transactions found. Create a new intercompany transaction to get started."
          onRowClick={(row) => {
            navigate(`/interco/transactions/${row.id}`)
          }}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false)
        }}
        title="New Intercompany Transaction"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setShowCreate(false)
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleCreate} loading={creating}>
              Create
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select
            label="Transaction Type"
            value={form.transactionType}
            onChange={(e) => {
              setForm((f) => ({ ...f, transactionType: e.target.value }))
            }}
            options={[
              { value: 'interco_charge', label: 'Interco Charge' },
              { value: 'interco_loan', label: 'Interco Loan' },
              { value: 'interco_settlement', label: 'Settlement' },
            ]}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <Input
              label="From Company ID"
              value={form.fromCompanyId}
              onChange={(e) => {
                setForm((f) => ({ ...f, fromCompanyId: e.target.value }))
              }}
              placeholder="e.g. 1"
            />
            <Input
              label="To Company ID"
              value={form.toCompanyId}
              onChange={(e) => {
                setForm((f) => ({ ...f, toCompanyId: e.target.value }))
              }}
              placeholder="e.g. 2"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <Input
              label="Amount"
              type="number"
              value={form.amount}
              onChange={(e) => {
                setForm((f) => ({ ...f, amount: e.target.value }))
              }}
              placeholder="0.00"
            />
            <Select
              label="Currency"
              value={form.currencyCode}
              onChange={(e) => {
                setForm((f) => ({ ...f, currencyCode: e.target.value }))
              }}
              options={[
                { value: 'USD', label: 'USD' },
                { value: 'IQD', label: 'IQD' },
                { value: 'EUR', label: 'EUR' },
              ]}
            />
          </div>
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => {
              setForm((f) => ({ ...f, description: e.target.value }))
            }}
            placeholder="Transaction description…"
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <Input
              label="From Account ID"
              value={form.fromAccountId}
              onChange={(e) => {
                setForm((f) => ({ ...f, fromAccountId: e.target.value }))
              }}
              placeholder="Account ID"
            />
            <Input
              label="To Account ID"
              value={form.toAccountId}
              onChange={(e) => {
                setForm((f) => ({ ...f, toAccountId: e.target.value }))
              }}
              placeholder="Account ID"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
