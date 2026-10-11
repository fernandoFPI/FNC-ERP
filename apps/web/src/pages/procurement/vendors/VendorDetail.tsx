import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import i18n from '../../../i18n'
import { VENDOR_QUERY, PURCHASE_ORDERS_QUERY } from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import type { PurchaseOrdersQuery, PurchaseOrdersQueryVariables, VendorQuery, VendorQueryVariables } from '../../../graphql/generated'

interface PurchaseOrder {
  id: string
  po_number: string
  status: string
  total_amount: string
  currency_code: string
  created_at: string
}

interface VendorInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  net_payable: string
  amount_paid: string
  currency_code: string
  status: string
  days_overdue: number
}

const AP_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Pending',
  approved: 'Approved',
  partially_paid: 'Partial',
  paid: 'Paid',
  cancelled: 'Cancelled',
}
const apStatusLabel = (s: string) =>
  i18n.t(`vendor.detail.apStatus.${s}`, { defaultValue: AP_STATUS_LABELS[s] ?? s })
const AP_STATUS_VARIANTS: Record<
  string,
  'neutral' | 'warning' | 'accent' | 'info' | 'success' | 'danger'
> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'accent',
  partially_paid: 'info',
  paid: 'success',
  cancelled: 'danger',
}

export default function VendorDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const { data: vendorData, loading } = useQuery<VendorQuery, VendorQueryVariables>(VENDOR_QUERY, { variables: { id: id ?? '' }, skip: !id })
  const { data: ordersData } = useQuery<PurchaseOrdersQuery, PurchaseOrdersQueryVariables>(PURCHASE_ORDERS_QUERY, {
    variables: { vendorId: id },
    skip: !id,
  })

  const [activeTab, setActiveTab] = useState<'pos' | 'ap'>('pos')
  const [apInvoices, setApInvoices] = useState<VendorInvoice[]>([])
  const [apLoading, setApLoading] = useState(false)

  useEffect(() => {
    if (activeTab !== 'ap' || !id) return
    setApLoading(true)
    api
      .get<{ items?: VendorInvoice[] } | VendorInvoice[]>(`/finance/vendor-invoices`, {
        params: { vendor_id: id },
      })
      .then((r) => {
        const d = r.data as unknown
        if (Array.isArray(d)) setApInvoices(d as VendorInvoice[])
        else setApInvoices((d as { items?: VendorInvoice[] }).items ?? [])
      })
      .catch(() => {
        addToast({ type: 'error', message: i18n.t('vendor.detail.failedToLoadVendorInvoices') })
      })
      .finally(() => {
        setApLoading(false)
      })
  }, [activeTab, id, addToast])

  const vendor = vendorData?.vendor
  const orders: PurchaseOrder[] = (ordersData?.purchaseOrders ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  if (loading && !vendor)
    return <div style={{ padding: '24px', color: theme.textMuted }}>{t('vendor.detail.loading')}</div>
  if (!vendor)
    return <div style={{ padding: '24px', color: theme.textMuted }}>{t('vendor.detail.vendorNotFound')}</div>

  const poColumns: Column<PurchaseOrder>[] = [
    {
      key: 'po_number',
      header: t('vendor.detail.poNumber'),
      render: (p) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent }}>{p.po_number}</span>
      ),
    },
    {
      key: 'status',
      header: t('vendor.detail.status'),
      render: (p) => (
        <Badge
          variant={
            p.status === 'fully_received'
              ? 'success'
              : p.status === 'rejected'
                ? 'danger'
                : 'warning'
          }
        >
          {p.status}
        </Badge>
      ),
    },
    {
      key: 'total_amount',
      header: t('vendor.detail.amount'),
      render: (p) => (
        <AmountDisplay amount={parseFloat(p.total_amount)} currency={p.currency_code} />
      ),
    },
    {
      key: 'created_at',
      header: t('vendor.detail.created'),
      render: (p) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {p.created_at.slice(0, 10)}
        </span>
      ),
    },
  ]

  const apColumns: Column<VendorInvoice>[] = [
    {
      key: 'invoice_number',
      header: t('vendor.detail.invoice'),
      mobilePrimary: true,
      render: (inv) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent }}>{inv.invoice_number}</span>
      ),
    },
    {
      key: 'invoice_date',
      header: t('vendor.detail.invoiceDate'),
      mobileSecondary: true,
      render: (inv) => (
        <span style={{ color: theme.textMuted }}>{inv.invoice_date.slice(0, 10)}</span>
      ),
    },
    {
      key: 'status',
      header: t('vendor.detail.status'),
      mobilePriority: 1,
      render: (inv) => (
        <Badge variant={AP_STATUS_VARIANTS[inv.status] ?? 'neutral'} size="sm">
          {apStatusLabel(inv.status)}
        </Badge>
      ),
    },
    {
      key: 'due_date',
      header: t('vendor.detail.dueDate'),
      mobilePriority: 2,
      render: (inv) => {
        const isOverdue = inv.days_overdue > 0 && !['paid', 'cancelled'].includes(inv.status)
        return (
          <span style={{ color: isOverdue ? theme.danger : theme.textMuted }}>
            {inv.due_date.slice(0, 10)}
          </span>
        )
      },
    },
    {
      key: 'outstanding',
      header: t('vendor.detail.outstanding'),
      mobilePriority: 3,
      render: (inv) => (
        <AmountDisplay
          amount={parseFloat(inv.net_payable) - parseFloat(inv.amount_paid)}
          currency={inv.currency_code}
          size="sm"
        />
      ),
    },
    {
      key: 'net_payable',
      header: t('vendor.detail.netPayable'),
      mobilePriority: 4,
      render: (inv) => (
        <AmountDisplay
          amount={parseFloat(inv.net_payable)}
          currency={inv.currency_code}
          size="sm"
        />
      ),
    },
  ]

  function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 0',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>{label}</span>
        <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{value ?? '—'}</span>
      </div>
    )
  }

  const tabs = [
    { key: 'pos', label: t('vendor.detail.purchaseOrdersCount', { count: orders.length }) },
    { key: 'ap', label: t('vendor.detail.apInvoices') },
  ] as const

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title={vendor.name}
        subtitle={vendor.legal_name ?? t('vendor.detail.vendorDetails')}
        backPath="/procurement/vendors"
        status={
          <Badge variant={vendor.is_active ? 'success' : 'neutral'}>
            {vendor.is_active ? t('vendor.detail.active') : t('vendor.detail.inactive')}
          </Badge>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              navigate(`/procurement/vendors/${id}/edit`)
            }}
          >
            {t('vendor.detail.edit')}
          </Button>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginTop: '20px',
          marginBottom: '16px',
        }}
      >
        <Card style={{ padding: '20px' }}>
          <div style={{ fontWeight: 600, marginBottom: '12px', color: theme.textPrimary }}>
            {t('vendor.detail.generalInfo')}
          </div>
          <InfoRow label={t('vendor.detail.taxId')} value={vendor.tax_id} />
          <InfoRow label={t('vendor.detail.currency')} value={<Badge variant="info">{vendor.currency_code}</Badge>} />
          <InfoRow label={t('vendor.detail.paymentTerms')} value={`Net ${vendor.payment_terms_days} days`} />
          <InfoRow label={t('vendor.detail.country')} value={vendor.country_code} />
          <InfoRow label={t('vendor.detail.city')} value={vendor.city} />
          <InfoRow label={t('vendor.detail.address')} value={vendor.address} />
          <InfoRow label={t('vendor.detail.bank')} value={vendor.bank_name} />
        </Card>

        <Card style={{ padding: '20px' }}>
          <div style={{ fontWeight: 600, marginBottom: '12px', color: theme.textPrimary }}>
            {t('vendor.detail.contact')}
          </div>
          <InfoRow label={t('vendor.detail.name')} value={vendor.contact_name} />
          <InfoRow label={t('vendor.detail.email')} value={vendor.contact_email} />
          <InfoRow label={t('vendor.detail.phone')} value={vendor.contact_phone} />
        </Card>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0',
          borderBottom: `1px solid ${theme.border}`,
          marginBottom: '0',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key)
            }}
            style={{
              padding: '9px 18px',
              background: 'none',
              border: 'none',
              borderBottom:
                activeTab === tab.key ? `2px solid ${theme.accent}` : '2px solid transparent',
              color: activeTab === tab.key ? theme.accent : theme.textMuted,
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pos' && (
        <Card>
          <div
            style={{
              padding: '16px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 600, color: theme.textPrimary }}>
              {t('vendor.detail.purchaseOrdersCount', { count: orders.length })}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/procurement/requisitions/new')
              }}
            >
              {t('vendor.detail.newRequisition')}
            </Button>
          </div>
          <Table
            columns={poColumns}
            data={orders}
            rowKey="id"
            onRowClick={(p) => {
              navigate(`/procurement/purchase-orders/${p.id}`)
            }}
          />
        </Card>
      )}

      {activeTab === 'ap' && (
        <Card padding="none">
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '13px' }}>
              {t('vendor.detail.vendorInvoices')}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/finance/ap/new')
              }}
            >
              {t('vendor.detail.newInvoice')}
            </Button>
          </div>
          {apLoading ? (
            <div style={{ padding: '20px' }}>
              <div className="skeleton" style={{ height: 120 }} />
            </div>
          ) : apInvoices.length === 0 ? (
            <EmptyState message={t('vendor.detail.noInvoicesForThisVendor')} />
          ) : (
            <Table
              columns={apColumns}
              data={apInvoices}
              rowKey="id"
              onRowClick={(inv) => {
                navigate(`/finance/ap/${inv.id}`)
              }}
            />
          )}
        </Card>
      )}
    </div>
  )
}
