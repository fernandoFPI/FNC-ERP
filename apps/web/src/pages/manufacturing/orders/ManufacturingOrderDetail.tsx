import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
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
import type { CancelMoMutation, CancelMoMutationVariables, CompleteMoMutation, CompleteMoMutationVariables, ConfirmMoMutation, ConfirmMoMutationVariables, MOmissingComponentsQuery, MOmissingComponentsQueryVariables, ManufacturingOrderQuery, ManufacturingOrderQueryVariables, MoCostAnalysisQuery, MoCostAnalysisQueryVariables, StartMoMutation, StartMoMutationVariables } from '../../../graphql/generated'

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
  productName?: string | null
  uom?: string | null
  qtyRequired: number
  qtyOnHand: number
  qtyAvailable: number
  qtyShortfall: number
  hasSufficientStock: boolean
}

interface MOLine {
  id: string
  component_name?: string | null
  qty_planned: number
  qty_consumed: number
  unit_cost: number
  total_cost: number
}

export default function ManufacturingOrderDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [showComplete, setShowComplete] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelNotes, setCancelNotes] = useState('')
  const [tab, setTab] = useState('details')

  const { data, loading, refetch } = useQuery<ManufacturingOrderQuery, ManufacturingOrderQueryVariables>(MANUFACTURING_ORDER_QUERY, {
    variables: { id: id ?? '' },
    skip: !id,
  })
  const { data: costData } = useQuery<MoCostAnalysisQuery, MoCostAnalysisQueryVariables>(MO_COST_ANALYSIS_QUERY, {
    variables: { moId: id ?? '' },
    skip: !id || data?.manufacturingOrder?.status !== 'done',
  })
  const { data: missingData } = useQuery<MOmissingComponentsQuery, MOmissingComponentsQueryVariables>(MO_MISSING_COMPONENTS_QUERY, {
    variables: { moId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const missingComponents: MOComponentStatus[] = missingData?.moMissingComponents ?? []
  const [confirmMO, { loading: confirming }] = useMutation<ConfirmMoMutation, ConfirmMoMutationVariables>(CONFIRM_MO)
  const [startMO, { loading: starting }] = useMutation<StartMoMutation, StartMoMutationVariables>(START_MO)
  const [completeMO, { loading: completing }] = useMutation<CompleteMoMutation, CompleteMoMutationVariables>(COMPLETE_MO)
  const [cancelMO, { loading: cancelling }] = useMutation<CancelMoMutation, CancelMoMutationVariables>(CANCEL_MO)

  const mo = data?.manufacturingOrder
  const costAnalysis = costData?.moCostAnalysis

  async function handleAction(fn: () => Promise<unknown>, successMsg: string) {
    try {
      await fn()
      addToast({ type: 'success', message: successMsg })
      void refetch()
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
          variables: { id: id ?? '', input },
          refetchQueries: [{ query: MANUFACTURING_ORDER_QUERY, variables: { id } }],
        }),
      t('mfg.moDetail.moCompleted'),
    )
    setShowComplete(false)
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>{t('mfg.moDetail.loading')}</div>
  if (!mo)
    return (
      <div style={{ padding: '24px' }}>
        <PageHeader
          title={t('mfg.moDetail.manufacturingOrderNotFound')}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigate(-1)
              }}
            >
              {t('mfg.moDetail.back')}
            </Button>
          }
        />
        <div style={{ color: theme.textMuted, fontSize: '13px', marginTop: '12px' }}>
          {t('mfg.moDetail.thisManufacturingOrderDoesnTExist')}
        </div>
      </div>
    )

  const planned = parseFloat(mo.planned_cost)
  const actual = parseFloat(mo.actual_cost)
  const variance = actual - planned
  const isDone = mo.status === 'done'

  const shortfallCount = missingComponents.filter((c) => c.qtyShortfall > 0).length

  const componentColumns: Column<MOLine>[] = [
    {
      key: 'component_name',
      header: t('mfg.moDetail.component'),
      mobilePrimary: true,
      render: (l) => l.component_name,
    },
    {
      key: 'qty_planned',
      header: t('mfg.moDetail.qtyPlanned'),
      mobilePriority: 1,
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{l.qty_planned}</span>
      ),
    },
    {
      key: 'qty_consumed',
      header: t('mfg.moDetail.qtyConsumed'),
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
      header: t('mfg.moDetail.unitCost'),
      mobilePriority: 3,
      render: (l) => <AmountDisplay amount={l.unit_cost} currency="IQD" size="sm" />,
    },
    {
      key: 'total_cost',
      header: t('mfg.moDetail.totalCost'),
      mobilePriority: 4,
      render: (l) => <AmountDisplay amount={l.total_cost} currency="IQD" size="sm" />,
    },
  ]

  const stockColumns: Column<MOComponentStatus>[] = [
    {
      key: 'productName',
      header: t('mfg.moDetail.product'),
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
                marginInlineEnd: '8px',
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
      header: t('mfg.moDetail.required'),
      mobilePriority: 1,
      render: (c) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{c.qtyRequired}</span>
      ),
    },
    {
      key: 'qtyOnHand',
      header: t('mfg.moDetail.onHand'),
      mobilePriority: 2,
      render: (c) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {c.qtyOnHand.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'qtyAvailable',
      header: t('mfg.moDetail.available'),
      mobilePriority: 3,
      render: (c) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {c.qtyAvailable.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'qtyShortfall',
      header: t('mfg.moDetail.shortfall'),
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
    { key: 'details', label: t('mfg.moDetail.details') },
    { key: 'components', label: t('mfg.moDetail.components') },
    { key: 'stock', label: t('mfg.moDetail.componentsStock') },
    ...(isDone ? [{ key: 'costs', label: t('mfg.moDetail.costAnalysis') }] : []),
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={t('mfg.moDetail.moTitle', { number: mo.mo_number })}
        subtitle={`${mo.product_name ?? '—'} · ${mo.work_center_name ?? t('mfg.moDetail.noWorkCenter')}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_VARIANT[mo.status] ?? 'neutral'}>
              {enumLabel(mo.status).replace('_', ' ')}
            </Badge>
            {mo.status === 'draft' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleAction(() => confirmMO({ variables: { id: id ?? '' } }), t('mfg.moDetail.moConfirmed'))}
                loading={confirming}
              >
                {t('mfg.moDetail.confirm')}
              </Button>
            )}
            {mo.status === 'confirmed' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleAction(() => startMO({ variables: { id: id ?? '' } }), t('mfg.moDetail.moStarted'))}
                loading={starting}
              >
                {t('mfg.moDetail.startProduction')}
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
                {t('mfg.moDetail.markComplete')}
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
                {t('mfg.moDetail.cancel')}
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
          title={t('mfg.moDetail.qtyPlanned')}
          value={parseFloat(mo.qty_planned).toLocaleString()}
          subtitle={t('mfg.moDetail.units')}
          iconColor="info"
        />
        <KPICard
          title={t('mfg.moDetail.qtyProduced')}
          value={parseFloat(mo.qty_produced).toLocaleString()}
          subtitle={t('mfg.moDetail.units')}
          iconColor="success"
        />
        <KPICard
          title={t('mfg.moDetail.plannedCost')}
          value={planned.toLocaleString()}
          subtitle={t('mfg.moDetail.iqd')}
          iconColor="info"
        />
        <KPICard
          title={t('mfg.moDetail.actualCost')}
          value={actual.toLocaleString()}
          subtitle={t('mfg.moDetail.iqdVariance', { value: `${variance >= 0 ? '+' : ''}${variance.toFixed(0)}` })}
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
              {t('mfg.moDetail.details')}
            </div>
            {[
              [t('mfg.moDetail.bom'), `v${mo.bom_version ?? '—'}`],
              [t('mfg.moDetail.project'), mo.project_name ?? '—'],
              [t('mfg.moDetail.scheduledStart'), mo.scheduled_start?.slice(0, 10) ?? '—'],
              [t('mfg.moDetail.scheduledEnd'), mo.scheduled_end?.slice(0, 10) ?? '—'],
              [t('mfg.moDetail.actualStart'), mo.actual_start?.slice(0, 10) ?? '—'],
              [t('mfg.moDetail.actualEnd'), mo.actual_end?.slice(0, 10) ?? '—'],
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
              {t('mfg.moDetail.components')}
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
                {t('mfg.moDetail.componentsStock')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {shortfallCount === 0 ? (
                  <Badge variant="success">{t('mfg.moDetail.allComponentsReady')}</Badge>
                ) : (
                  <Badge variant="warning">{t('mfg.moDetail.componentSNeedProcurement', { shortfallCount })}</Badge>
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
                            account_id: '',
                            cost_center_id: '',
                          }))
                        sessionStorage.setItem('req_prefill_lines', JSON.stringify(lines))
                        navigate(`/procurement/requisitions/new?moId=${mo.id}`)
                      }}
                    >
                      {t('mfg.moDetail.createRequisitionForMissingItems')}
                    </Button>
                  </StickyActionBar>
                )}
              </div>
            </div>
            <Table
              columns={stockColumns}
              data={missingComponents}
              rowKey="bomLineId"
              emptyMessage={t('mfg.moDetail.noBomComponentsFound')}
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
          <div style={{ color: theme.textMuted, fontSize: '13px' }}>{t('mfg.moDetail.costAnalysisLoading')}</div>
        )}
      </div>

      {/* Completion form */}
      <MOCompletionForm
        open={showComplete}
        onClose={() => {
          setShowComplete(false)
        }}
        mo={{
          id: id ?? '',
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
          title={t('mfg.moDetail.cancelManufacturingOrder')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {t('mfg.moDetail.thisWillCancelTheMoComponents')}
            </div>
            <Input
              label={t('mfg.moDetail.reasonOptional')}
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
                {t('mfg.moDetail.back')}
              </Button>
              <Button
                variant="danger"
                loading={cancelling}
                onClick={() =>
                  void handleAction(
                    () => cancelMO({ variables: { id: id ?? '', notes: cancelNotes } }),
                    t('mfg.moDetail.moCancelled'),
                  ).then(() => {
                    setShowCancel(false)
                  })
                }
              >
                {t('mfg.moDetail.cancelMo')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
