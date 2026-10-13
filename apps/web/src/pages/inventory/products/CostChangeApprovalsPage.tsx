import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PRODUCT_COST_CHANGE_REQUESTS_QUERY,
  APPROVE_PRODUCT_COST_CHANGE,
  REJECT_PRODUCT_COST_CHANGE,
} from '../../../graphql/inventory'
import type {
  ProductCostChangeRequestsQuery,
  ProductCostChangeRequestsQueryVariables,
  ApproveProductCostChangeMutation,
  ApproveProductCostChangeMutationVariables,
  RejectProductCostChangeMutation,
  RejectProductCostChangeMutationVariables,
} from '../../../graphql/generated'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { useAuthStore } from '../../../store/authStore'
import { useToastStore } from '../../../store/toastStore'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Modal } from '../../../components/ui/Modal'
import { Textarea } from '../../../components/ui/Textarea'
import { EmptyState } from '../../../components/ui/EmptyState'
import { enumLabel, useIsRtl } from '../../../i18n'

const fmtN = (n: string | number | null | undefined) =>
  parseFloat(String(n ?? 0)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

// po_receipt/catalog_link both carry a PO id as source_id — the only two
// source types with anything a "vendor receipt" could mean; every other
// trigger (market pricing, stock adjustments, a manual edit) has no
// receipt concept at all.
const PO_LINKED_SOURCE_TYPES = new Set(['po_receipt', 'catalog_link'])

export default function CostChangeApprovalsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const isRtl = useIsRtl()
  const addToast = useToastStore((s) => s.addToast)
  const { can, isSystemLevel } = usePermission()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const canApprove = can('inventory.products.approve_cost_change', 'edit')

  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data, loading, refetch } = useQuery<
    ProductCostChangeRequestsQuery,
    ProductCostChangeRequestsQueryVariables
  >(PRODUCT_COST_CHANGE_REQUESTS_QUERY, {
    variables: { status: statusFilter },
    fetchPolicy: 'cache-and-network',
  })
  const requests = data?.productCostChangeRequests ?? []

  const onErr = (err: Error) => {
    addToast({ type: 'error', message: err.message })
  }

  const [approve, { loading: approving }] = useMutation<
    ApproveProductCostChangeMutation,
    ApproveProductCostChangeMutationVariables
  >(APPROVE_PRODUCT_COST_CHANGE, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('inv.costApprovals.approved') })
      void refetch()
    },
    onError: onErr,
  })
  const [reject, { loading: rejecting }] = useMutation<
    RejectProductCostChangeMutation,
    RejectProductCostChangeMutationVariables
  >(REJECT_PRODUCT_COST_CHANGE, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('inv.costApprovals.rejected') })
      setRejectTarget(null)
      setRejectReason('')
      void refetch()
    },
    onError: onErr,
  })

  return (
    <div>
      <PageHeader title={t('inv.costApprovals.title')} subtitle={t('inv.costApprovals.subtitle')} />
      <Card style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ maxWidth: '220px' }}>
          <Select
            label={t('inv.costApprovals.status')}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'pending' | 'approved' | 'rejected')
            }}
          >
            <option value="pending">{enumLabel('pending')}</option>
            <option value="approved">{enumLabel('approved')}</option>
            <option value="rejected">{enumLabel('rejected')}</option>
          </Select>
        </div>
      </Card>

      {!loading && requests.length === 0 && (
        <Card style={{ padding: '32px' }}>
          <EmptyState
            title={t('inv.costApprovals.emptyTitle')}
            message={
              statusFilter === 'pending'
                ? t('inv.costApprovals.emptyPendingMessage')
                : t('inv.costApprovals.emptyOtherMessage')
            }
          />
        </Card>
      )}

      {requests.map((r) => {
        const oldCost = r.old_cost != null ? parseFloat(r.old_cost) : null
        const newCost = parseFloat(r.new_cost)
        const pctChange = oldCost && oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : null
        // Mirrors the backend's own exception exactly: an admin may clear
        // their own request (a single-admin company would otherwise have no
        // reviewer at all); anyone else still needs a different approver.
        const isOwnRequest = r.requested_by === currentUserId && !isSystemLevel
        return (
          <Card key={r.id} style={{ padding: '16px 20px', marginBottom: '12px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '14px',
                    color: theme.textPrimary,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    navigate(`/inventory/products/${r.product_id}`)
                  }}
                >
                  {r.product_name}
                  {isRtl && r.product_name_ar ? ` / ${r.product_name_ar}` : ''}
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>{r.sku}</div>
              </div>
              <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>{enumLabel(r.status)}</Badge>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '10px',
                marginTop: '12px',
                fontSize: '13px',
              }}
            >
              <span style={{ color: theme.textMuted }}>{fmtN(r.old_cost)}</span>
              <span style={{ color: theme.textMuted }}>→</span>
              <span style={{ fontWeight: 700, color: theme.textPrimary }}>{fmtN(r.new_cost)}</span>
              <span style={{ color: theme.textSecondary }}>{r.currency_code}</span>
              {pctChange != null && (
                <Badge variant={pctChange > 0 ? 'warning' : 'neutral'}>
                  {pctChange > 0 ? '+' : ''}
                  {pctChange.toFixed(1)}%
                </Badge>
              )}
            </div>

            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>
              {t('inv.costApprovals.sourceLine', {
                source: r.source_label ?? enumLabel(r.source_type),
                requester: r.requested_by_name ?? t('inv.costApprovals.unknownUser'),
              })}
              {PO_LINKED_SOURCE_TYPES.has(r.source_type) && r.source_id && (
                <>
                  {' — '}
                  <span
                    style={{ color: theme.accent, cursor: 'pointer' }}
                    onClick={() => {
                      navigate(`/procurement/purchase-orders/${r.source_id}`)
                    }}
                  >
                    {t('inv.costApprovals.viewPurchaseOrder')}
                  </span>
                </>
              )}
            </div>

            {r.status === 'rejected' && r.rejection_reason && (
              <div style={{ fontSize: '12px', color: theme.danger, marginTop: '6px' }}>
                {t('inv.costApprovals.rejectedReason', { reason: r.rejection_reason })}
              </div>
            )}
            {r.status === 'approved' && r.reviewed_by_name && (
              <div style={{ fontSize: '12px', color: theme.success, marginTop: '6px' }}>
                {t('inv.costApprovals.approvedBy', { name: r.reviewed_by_name })}
              </div>
            )}

            {r.status === 'pending' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '14px',
                }}
              >
                <Button
                  variant="primary"
                  size="sm"
                  loading={approving}
                  disabled={!canApprove || isOwnRequest}
                  onClick={() => void approve({ variables: { id: r.id } })}
                >
                  {t('inv.costApprovals.approve')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ color: theme.danger }}
                  disabled={!canApprove || isOwnRequest}
                  onClick={() => {
                    setRejectTarget(r.id)
                  }}
                >
                  {t('inv.costApprovals.reject')}
                </Button>
                {isOwnRequest && (
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>
                    {t('inv.costApprovals.needsADifferentApprover')}
                  </span>
                )}
              </div>
            )}
          </Card>
        )
      })}

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null)
          setRejectReason('')
        }}
        title={t('inv.costApprovals.rejectTitle')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRejectTarget(null)
                setRejectReason('')
              }}
            >
              {t('inv.costApprovals.cancel')}
            </Button>
            <Button
              variant="primary"
              style={{ background: theme.danger }}
              loading={rejecting}
              disabled={!rejectReason.trim()}
              onClick={() =>
                rejectTarget &&
                void reject({ variables: { id: rejectTarget, reason: rejectReason } })
              }
            >
              {t('inv.costApprovals.confirmReject')}
            </Button>
          </>
        }
      >
        <Textarea
          label={t('inv.costApprovals.rejectionReason')}
          value={rejectReason}
          onChange={(e) => {
            setRejectReason(e.target.value)
          }}
          rows={3}
        />
      </Modal>
    </div>
  )
}
