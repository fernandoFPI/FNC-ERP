import i18n, { enumLabel } from '../../../i18n'
import { useTranslation } from 'react-i18next'
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
  return m[status.toLowerCase()] ?? 'neutral'
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

// Must match interco_transactions_transaction_type_check in the DB —
// the previous list here (interco_charge/interco_loan/interco_settlement)
// didn't, so every create and every type-filter silently failed.
const TRANSACTION_TYPES = [
  { value: 'goods_transfer', get label() { return i18n.t('interco.txns.goodsTransfer', { defaultValue: "Goods Transfer" }) } },
  { value: 'service_charge', get label() { return i18n.t('interco.txns.serviceCharge', { defaultValue: "Service Charge" }) } },
  { value: 'equipment_rental', get label() { return i18n.t('interco.txns.equipmentRental', { defaultValue: "Equipment Rental" }) } },
  { value: 'management_fee', get label() { return i18n.t('interco.txns.managementFee', { defaultValue: "Management Fee" }) } },
]

const EMPTY_FORM: CreateTxForm = {
  transactionType: 'goods_transfer',
  fromCompanyId: '',
  toCompanyId: '',
  amount: '',
  currencyCode: 'USD',
  description: '',
  fromAccountId: '',
  toAccountId: '',
}

export default function IntercoTransactionsPage() {
  const { t } = useTranslation()
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
      addToast({ type: 'success', message: t('interco.txns.transactionCreated') })
      setShowCreate(false)
      setForm(EMPTY_FORM)
      void refetch()
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
      header: t('interco.txns.reference'),
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.accent, fontWeight: 500 }}>{row.reference}</span>
      ),
    },
    {
      key: 'transactionType',
      header: t('interco.txns.type'),
      mobilePriority: 3,
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {TRANSACTION_TYPES.find((tt) => tt.value === row.transactionType)?.label ??
            row.transactionType}
        </Badge>
      ),
    },
    {
      key: 'fromCompanyName',
      header: t('interco.txns.from'),
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
      header: t('interco.txns.amount'),
      mobilePriority: 2,
      render: (row) => <AmountDisplay amount={row.amount} currency={row.currencyCode} size="sm" />,
    },
    {
      key: 'status',
      header: t('interco.txns.status'),
      mobilePriority: 1,
      render: (row) => (
        <Badge variant={statusVariant(row.status)} size="sm">
          {enumLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: t('interco.txns.date'),
      mobilePriority: 5,
      render: (row) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ]

  function handleCreate() {
    void createTx({
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
        title={t('interco.txns.intercompanyTransactions')}
        subtitle={t('interco.txns.chargesLoansAndSettlementsBetweenGroup')}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowCreate(true)
            }}
          >
            {t('interco.txns.newTransaction')}
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: t('interco.txns.searchReferenceOrCompany'),
          }}
          filters={[
            {
              key: 'status',
              label: t('interco.txns.status'),
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'pending', label: t('interco.txns.pending') },
                { value: 'posted', label: t('interco.txns.posted') },
                { value: 'cancelled', label: t('interco.txns.cancelled') },
              ],
            },
            {
              key: 'type',
              label: t('interco.txns.type'),
              value: typeFilter,
              onChange: setTypeFilter,
              options: TRANSACTION_TYPES,
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onRefresh={() => {
            void refetch()
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
          emptyMessage={t('interco.txns.noTransactionsFoundCreateANew')}
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
        title={t('interco.txns.newIntercompanyTransaction')}
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
              {t('interco.txns.cancel')}
            </Button>
            <Button variant="primary" size="md" onClick={handleCreate} loading={creating}>
              {t('interco.txns.create')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select
            label={t('interco.txns.transactionType')}
            value={form.transactionType}
            onChange={(e) => {
              setForm((f) => ({ ...f, transactionType: e.target.value }))
            }}
            options={TRANSACTION_TYPES}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <Input
              label={t('interco.txns.fromCompanyId')}
              value={form.fromCompanyId}
              onChange={(e) => {
                setForm((f) => ({ ...f, fromCompanyId: e.target.value }))
              }}
              placeholder="e.g. 1"
            />
            <Input
              label={t('interco.txns.toCompanyId')}
              value={form.toCompanyId}
              onChange={(e) => {
                setForm((f) => ({ ...f, toCompanyId: e.target.value }))
              }}
              placeholder="e.g. 2"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <Input
              label={t('interco.txns.amount')}
              type="number"
              value={form.amount}
              onChange={(e) => {
                setForm((f) => ({ ...f, amount: e.target.value }))
              }}
              placeholder="0.00"
            />
            <Select
              label={t('interco.txns.currency')}
              value={form.currencyCode}
              onChange={(e) => {
                setForm((f) => ({ ...f, currencyCode: e.target.value }))
              }}
              options={[
                { value: 'USD', label: t('interco.txns.usd') },
                { value: 'IQD', label: t('interco.txns.iqd') },
                { value: 'EUR', label: t('interco.txns.eur') },
              ]}
            />
          </div>
          <Input
            label={t('interco.txns.description')}
            value={form.description}
            onChange={(e) => {
              setForm((f) => ({ ...f, description: e.target.value }))
            }}
            placeholder={t('interco.txns.transactionDescription')}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <Input
              label={t('interco.txns.fromAccountId')}
              value={form.fromAccountId}
              onChange={(e) => {
                setForm((f) => ({ ...f, fromAccountId: e.target.value }))
              }}
              placeholder={t('interco.txns.accountId')}
            />
            <Input
              label={t('interco.txns.toAccountId')}
              value={form.toAccountId}
              onChange={(e) => {
                setForm((f) => ({ ...f, toAccountId: e.target.value }))
              }}
              placeholder={t('interco.txns.accountId')}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
