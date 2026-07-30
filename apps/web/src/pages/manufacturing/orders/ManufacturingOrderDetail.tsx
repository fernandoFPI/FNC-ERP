import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  MANUFACTURING_ORDER_QUERY,
  MO_COST_ANALYSIS_QUERY,
  CONFIRM_MO,
  START_MO,
  COMPLETE_MO,
  CANCEL_MO,
} from '../../../graphql/manufacturing'
import { MO_MISSING_COMPONENTS_QUERY } from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button, StickyActionBar } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { TabBar } from '../../../components/ui/TabBar'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { KPICard } from '../../../components/ui/KPICard'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { useToastStore } from '../../../store/toastStore'
import { MOCompletionForm } from './MOCompletionForm'
import { MOCostAnalysis } from './MOCostAnalysis'

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  confirmed: 'info',
  in_progress: 'warning',
  done: 'success',
  cancelled: 'danger',
}

interface MOComponentStatus {
  bomLineId: string
  componentProductId: string
  productName?: string
  uom?: string
  qtyRequired: number
  qtyOnHand: number
  qtyAvailable: number
  qtyShortfall: number
  hasSufficientStock: boolean
}

interface MOLine {
  id: string
  component_name?: string
  qty_planned: number
  qty_consumed: number
  unit_cost: number
  total_cost: number
}

export default function ManufacturingOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [showComplete, setShowComplete] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelNotes, setCancelNotes] = useState('')
  const [tab, setTab] = useState('details')

  const { data, loading, refetch } = useQuery(MANUFACTURING_ORDER_QUERY, {
    variables: { id },
    skip: !id,
  })
  const { data: costData } = useQuery(MO_COST_ANALYSIS_QUERY, {
    variables: { moId: id },
    skip: !id || data?.manufacturingOrder?.status !== 'done',
  })
  const { data: missingData } = useQuery(MO_MISSING_COMPONENTS_QUERY, {
    variables: { moId: id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const missingComponents: MOComponentStatus[] = missingData?.moMissingComponents ?? []
  const [confirmMO, { loading: confirming }] = useMutation(CONFIRM_MO)
  const [startMO, { loading: starting }] = useMutation(START_MO)
  const [completeMO, { loading: completing }] = useMutation(COMPLETE_MO)
  const [cancelMO, { loading: cancelling }] = useMutation(CANCEL_MO)

  const mo = data?.manufacturingOrder
  const costAnalysis = costData?.moCostAnalysis

  async function handleAction(fn: () => Promise<unknown>, successMsg: string) {
    try {
      await fn()
      addToast({ type: 'success', message: successMsg })
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleComplete(input: {
    qty_produced: number
    actual_cost?: number
    notes?: string
    lines?: { component_product_id: string; qty_consumed: number; unit_cost?: number }[]
  }) {
    await handleAction(
      () =>
        completeMO({
          variables: { id, input },
          refetchQueries: [{ query: MANUFACTURING_ORDER_QUERY, variables: { id } }],
        }),
      'MO completed',
    )
    setShowComplete(false)
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>
  if (!mo)
    return (
      <div style={{ padding: '24px' }}>
        <PageHeader
          title="Manufacturing Order not found"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigate(-1)
              }}
            >
              Back
            </Button>
          }
        />
        <div style={{ color: theme.textMuted, fontSize: '13px', marginTop: '12px' }}>
          This Manufacturing Order doesn't exist, or it belongs to a different company than the one
          you're currently viewing. Switch to that company to view it.
        </div>
      </div>
    )

  const planned = parseFloat(mo.planned_cost ?? '0')
  const actual = parseFloat(mo.actual_cost ?? '0')
  const variance = actual - planned
  const isDone = mo.status === 'done'

  const shortfallCount = missingComponents.filter((c) => c.qtyShortfall > 0).length

  const componentColumns: Column<MOLine>[] = [
    {
      key: 'component_name',
      header: 'Component',
      mobilePrimary: true,
      render: (l) => l.component_name,
    },
    {
      key: 'qty_planned',
      header: 'Qty Planned',
      mobilePriority: 1,
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{l.qty_planned}</span>
      ),
    },
    {
      key: 'qty_consumed',
      header: 'Qty Consumed',
      mobilePriority: 2,
      render: (l) => (
        <span
          style={{
            fontFamily: 'monospace',
            color: l.qty_consumed >= l.qty_planned ? theme.success : theme.textPrimary,
          }}
        >
          {l.qty_consumed}
        </span>
      ),
    },
    {
      key: 'unit_cost',
      header: 'Unit Cost',
      mobilePriority: 3,
      render: (l) => <AmountDisplay amount={l.unit_cost} currency="IQD" size="sm" />,
    },
    {
      key: 'total_cost',
      header: 'Total Cost',
      mobilePriority: 4,
      render: (l) => <AmountDisplay amount={l.total_cost} currency="IQD" size="sm" />,
    },
  ]

  const stockColumns: Column<MOComponentStatus>[] = [
    {
      key: 'productName',
      header: 'Product',
      mobilePrimary: true,
      render: (c) => {
        const rowColor = c.hasSufficientStock
          ? '#16a34a'
          : c.qtyAvailable > 0
            ? '#d97706'
            : '#dc2626'
        return (
          <>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: rowColor,
                marginRight: '8px',
              }}
            />
            {c.productName ?? '—'}
            {c.uom ? ` (${c.uom})` : ''}
          </>
        )
      },
    },
    {
      key: 'qtyRequired',
      header: 'Required',
      mobilePriority: 1,
      render: (c) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{c.qtyRequired}</span>
      ),
    },
    {
      key: 'qtyOnHand',
      header: 'On Hand',
      mobilePriority: 2,
      render: (c) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {c.qtyOnHand.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'qtyAvailable',
      header: 'Available',
      mobilePriority: 3,
      render: (c) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {c.qtyAvailable.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'qtyShortfall',
      header: 'Shortfall',
      mobilePriority: 4,
      render: (c) => {
        const rowColor = c.hasSufficientStock
          ? '#16a34a'
          : c.qtyAvailable > 0
            ? '#d97706'
            : '#dc2626'
        return (
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 600,
              color: c.qtyShortfall > 0 ? rowColor : theme.success,
            }}
          >
            {c.qtyShortfall.toFixed(2)}
          </span>
        )
      },
    },
  ]

  const TABS = [
    { key: 'details', label: 'Details' },
    { key: 'components', label: 'Components' },
    { key: 'stock', label: 'Components & Stock' },
    ...(isDone ? [{ key: 'costs', label: 'Cost Analysis' }] : []),
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={`MO: ${mo.mo_number}`}
        subtitle={`${mo.product_name ?? '—'} · ${mo.work_center_name ?? 'No work center'}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_VARIANT[mo.status] ?? 'neutral'}>
              {mo.status.replace('_', ' ')}
            </Badge>
            {mo.status === 'draft' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleAction(() => confirmMO({ variables: { id } }), 'MO confirmed')}
                loading={confirming}
              >
                Confirm
              </Button>
            )}
            {mo.status === 'confirmed' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleAction(() => startMO({ variables: { id } }), 'MO started')}
                loading={starting}
              >
                Start Production
              </Button>
            )}
            {mo.status === 'in_progress' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowComplete(true)
                }}
              >
                Mark Complete
              </Button>
            )}
            {['draft', 'confirmed'].includes(mo.status) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCancel(true)
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginTop: '20px',
        }}
      >
        <KPICard
          title="Qty Planned"
          value={parseFloat(mo.qty_planned).toLocaleString()}
          subtitle="units"
          iconColor="info"
        />
        <KPICard
          title="Qty Produced"
          value={parseFloat(mo.qty_produced).toLocaleString()}
          subtitle="units"
          iconColor="success"
        />
        <KPICard
          title="Planned Cost"
          value={planned.toLocaleString()}
          subtitle="IQD"
          iconColor="info"
        />
        <KPICard
          title="Actual Cost"
          value={actual.toLocaleString()}
          subtitle={`${variance >= 0 ? '+' : ''}${variance.toFixed(0)} IQD variance`}
          iconColor={variance > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Tabs */}
      <div style={{ marginTop: '20px', borderBottom: `1px solid ${theme.border}` }}>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div style={{ marginTop: '16px' }}>
        {tab === 'details' && (
          <Card style={{ padding: '20px', maxWidth: '520px' }}>
            <div
              style={{
                fontWeight: 600,
                color: theme.textPrimary,
                fontSize: '14px',
                marginBottom: '12px',
              }}
            >
              Details
            </div>
            {[
              ['BOM', `v${mo.bom_version ?? '—'}`],
              ['Project', mo.project_name ?? '—'],
              ['Scheduled Start', mo.scheduled_start?.slice(0, 10) ?? '—'],
              ['Scheduled End', mo.scheduled_end?.slice(0, 10) ?? '—'],
              ['Actual Start', mo.actual_start?.slice(0, 10) ?? '—'],
              ['Actual End', mo.actual_end?.slice(0, 10) ?? '—'],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: `1px solid ${theme.border}`,
                  fontSize: '13px',
                }}
              >
                <span style={{ color: theme.textMuted }}>{label}</span>
                <span style={{ color: theme.textPrimary }}>{value}</span>
              </div>
            ))}
            {mo.notes && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: theme.textSecondary }}>
                {mo.notes}
              </div>
            )}
          </Card>
        )}

        {tab === 'components' && (
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                fontWeight: 600,
                color: theme.textPrimary,
                fontSize: '14px',
                marginBottom: '12px',
              }}
            >
              Components
            </div>
            <Table columns={componentColumns} data={mo.lines ?? []} rowKey="id" />
          </Card>
        )}

        {tab === 'stock' && (
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>
                Components & Stock
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {shortfallCount === 0 ? (
                  <Badge variant="success">All components ready</Badge>
                ) : (
                  <Badge variant="warning">{shortfallCount} component(s) need procurement</Badge>
                )}
                {shortfallCount > 0 && (
                  <StickyActionBar>
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidthOnMobile
                      onClick={() => {
                        const lines = missingComponents
                          .filter((c) => c.qtyShortfall > 0)
                          .map((c) => ({
                            product_id: c.componentProductId,
                            description: c.productName ?? '',
                            qty: String(c.qtyShortfall),
                            unit_price: '0',
                            uom: c.uom ?? 'pc',
                          }))
                        sessionStorage.setItem('po_prefill_lines', JSON.stringify(lines))
                        navigate(
                          `/procurement/purchase-orders/new?moId=${mo.id}&purpose=manufacturing`,
                        )
                      }}
                    >
                      Create PO for missing items
                    </Button>
                  </StickyActionBar>
                )}
              </div>
            </div>
            <Table
              columns={stockColumns}
              data={missingComponents}
              rowKey="bomLineId"
              emptyMessage="No BOM components found."
            />
          </Card>
        )}

        {tab === 'costs' && costAnalysis && (
          <MOCostAnalysis
            analysis={costAnalysis}
            qtyPlanned={parseFloat(mo.qty_planned)}
            qtyProduced={parseFloat(mo.qty_produced)}
          />
        )}

        {tab === 'costs' && !costAnalysis && (
          <div style={{ color: theme.textMuted, fontSize: '13px' }}>Cost analysis loading…</div>
        )}
      </div>

      {/* Completion form */}
      <MOCompletionForm
        open={showComplete}
        onClose={() => {
          setShowComplete(false)
        }}
        mo={{
          id: id!,
          qty_planned: parseFloat(mo.qty_planned),
          planned_cost: planned,
          work_center_name: mo.work_center_name,
          lines: mo.lines ?? [],
        }}
        onComplete={handleComplete}
        loading={completing}
      />

      {/* Cancel modal */}
      {showCancel && (
        <Modal
          open={showCancel}
          onClose={() => {
            setShowCancel(false)
          }}
          title="Cancel Manufacturing Order"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              This will cancel the MO. Components will not be returned automatically.
            </div>
            <Input
              label="Reason (optional)"
              value={cancelNotes}
              onChange={(e) => {
                setCancelNotes(e.target.value)
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCancel(false)
                }}
              >
                Back
              </Button>
              <Button
                variant="danger"
                loading={cancelling}
                onClick={() =>
                  handleAction(
                    () => cancelMO({ variables: { id, notes: cancelNotes } }),
                    'MO cancelled',
                  ).then(() => {
                    setShowCancel(false)
                  })
                }
              >
                Cancel MO
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
