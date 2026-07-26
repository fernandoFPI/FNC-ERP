import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
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
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const { data: vendorData, loading } = useQuery(VENDOR_QUERY, { variables: { id }, skip: !id })
  const { data: ordersData } = useQuery(PURCHASE_ORDERS_QUERY, {
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
        addToast({ type: 'error', message: 'Failed to load vendor invoices' })
      })
      .finally(() => {
        setApLoading(false)
      })
  }, [activeTab, id, addToast])

  const vendor = vendorData?.vendor
  const orders: PurchaseOrder[] = ordersData?.purchaseOrders ?? []

  if (loading && !vendor)
    return <div style={{ padding: '24px', color: theme.textMuted }}>Loading…</div>
  if (!vendor)
    return <div style={{ padding: '24px', color: theme.textMuted }}>Vendor not found</div>

  const poColumns: Column<PurchaseOrder>[] = [
    {
      key: 'po_number',
      header: 'PO Number',
      render: (p) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent }}>{p.po_number}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
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
      header: 'Amount',
      render: (p) => (
        <AmountDisplay amount={parseFloat(p.total_amount)} currency={p.currency_code} />
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (p) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {p.created_at.slice(0, 10)}
        </span>
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
    { key: 'pos', label: `Purchase Orders (${orders.length})` },
    { key: 'ap', label: 'AP Invoices' },
  ] as const

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title={vendor.name}
        subtitle={vendor.legal_name ?? 'Vendor details'}
        backPath="/procurement/vendors"
        status={
          <Badge variant={vendor.is_active ? 'success' : 'neutral'}>
            {vendor.is_active ? 'Active' : 'Inactive'}
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
            Edit
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
            General Info
          </div>
          <InfoRow label="Tax ID" value={vendor.tax_id} />
          <InfoRow label="Currency" value={<Badge variant="info">{vendor.currency_code}</Badge>} />
          <InfoRow label="Payment Terms" value={`Net ${vendor.payment_terms_days} days`} />
          <InfoRow label="Country" value={vendor.country_code} />
          <InfoRow label="City" value={vendor.city} />
          <InfoRow label="Address" value={vendor.address} />
          <InfoRow label="Bank" value={vendor.bank_name} />
        </Card>

        <Card style={{ padding: '20px' }}>
          <div style={{ fontWeight: 600, marginBottom: '12px', color: theme.textPrimary }}>
            Contact
          </div>
          <InfoRow label="Name" value={vendor.contact_name} />
          <InfoRow label="Email" value={vendor.contact_email} />
          <InfoRow label="Phone" value={vendor.contact_phone} />
          <InfoRow label="Invoice Email" value={vendor.email} />
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
              Purchase Orders ({orders.length})
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/procurement/purchase-orders/new')
              }}
            >
              New PO
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
              Vendor invoices
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/finance/ap/new')
              }}
            >
              New invoice
            </Button>
          </div>
          {apLoading ? (
            <div style={{ padding: '20px' }}>
              <div className="skeleton" style={{ height: 120 }} />
            </div>
          ) : apInvoices.length === 0 ? (
            <EmptyState message="No invoices for this vendor" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {[
                    'Invoice #',
                    'Invoice date',
                    'Due date',
                    'Net payable',
                    'Outstanding',
                    'Status',
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '8px 14px',
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
                {apInvoices.map((inv) => {
                  const outstanding = parseFloat(inv.net_payable) - parseFloat(inv.amount_paid)
                  const isOverdue =
                    inv.days_overdue > 0 && !['paid', 'cancelled'].includes(inv.status)
                  return (
                    <tr
                      key={inv.id}
                      style={{ borderBottom: `1px solid ${theme.tableBorder}`, cursor: 'pointer' }}
                      onClick={() => {
                        navigate(`/finance/ap/${inv.id}`)
                      }}
                    >
                      <td
                        style={{
                          padding: '8px 14px',
                          fontFamily: 'monospace',
                          color: theme.accent,
                        }}
                      >
                        {inv.invoice_number}
                      </td>
                      <td style={{ padding: '8px 14px', color: theme.textMuted }}>
                        {inv.invoice_date?.slice(0, 10)}
                      </td>
                      <td
                        style={{
                          padding: '8px 14px',
                          color: isOverdue ? theme.danger : theme.textMuted,
                        }}
                      >
                        {inv.due_date?.slice(0, 10)}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <AmountDisplay
                          amount={parseFloat(inv.net_payable)}
                          currency={inv.currency_code}
                          size="sm"
                        />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <AmountDisplay
                          amount={outstanding}
                          currency={inv.currency_code}
                          size="sm"
                        />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <Badge variant={AP_STATUS_VARIANTS[inv.status] ?? 'neutral'} size="sm">
                          {AP_STATUS_LABELS[inv.status] ?? inv.status}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  )
}
