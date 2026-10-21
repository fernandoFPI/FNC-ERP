import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { useToastStore } from '../../../store/toastStore'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Modal } from '../../../components/ui/Modal'
import { Textarea } from '../../../components/ui/Textarea'
import { EmptyState } from '../../../components/ui/EmptyState'
import { formatDateTime } from '../../../components/procurement/ListKit'
import { costChangeSourcePath, isCostChangeSourceType } from '../../../lib/costChangeSource'
import { enumLabel } from '../../../i18n'

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

type CostRequest = ProductCostChangeRequestsQuery['productCostChangeRequests'][number]

export default function CostChangeApprovalsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const { can } = usePermission()
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

  // What rejecting leaves in place. Only the product's own cost is held back: the
  // receipt, price, adjustment or edit that produced the request has already been
  // saved (recordProductCostChange parks nothing else), so each source says which
  // of its own effects stay.
  const rejectionOutcome = (r: CostRequest): string => {
    const head =
      r.old_cost != null
        ? t('inv.costApprovals.ifRejectedCost', {
            cost: `${fmtN(r.old_cost)} ${r.currency_code}`,
          })
        : t('inv.costApprovals.ifRejectedNoCost')
    return isCostChangeSourceType(r.source_type)
      ? `${head} ${t(`inv.costApprovals.source.${r.source_type}.ifRejected`)}`
      : head
  }
  const rejectTargetRequest = requests.find((x) => x.id === rejectTarget)

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
        // The server decides who may clear their own request (admins and the
        // company-wide Store Keeper may; anyone else needs a different reviewer)
        // and sends the answer per row, so this page keeps no copy of that rule.
        const needsAnotherReviewer = r.can_review === false
        // Reviewed by the person who raised it: say so, so an auditor can spot it.
        const reviewedByRequester = r.reviewed_by != null && r.reviewed_by === r.requested_by
        const sourcePath = costChangeSourcePath(r.source_type, r.source_id)
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
                  <bdi>{r.product_name}</bdi>
                  {r.product_name_ar && r.product_name_ar !== r.product_name && (
                    <>
                      {' / '}
                      <bdi dir="rtl" lang="ar">
                        {r.product_name_ar}
                      </bdi>
                    </>
                  )}
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

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'max-content minmax(0, 1fr)',
                columnGap: '14px',
                rowGap: '6px',
                marginTop: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                background: theme.bgCanvas,
                fontSize: '12px',
                color: theme.textSecondary,
              }}
            >
              <span style={{ color: theme.textMuted }}>{t('inv.costApprovals.labelSource')}</span>
              <div>
                <span style={{ fontWeight: 600, color: theme.textPrimary }}>
                  {t(`inv.productDetail.costSourceOpts.${r.source_type}`, {
                    defaultValue: enumLabel(r.source_type),
                  })}
                </span>
                {sourcePath && (
                  <>
                    {' · '}
                    <Link to={sourcePath} style={{ color: theme.accent, fontWeight: 600 }}>
                      {r.source_label ?? t('inv.costApprovals.viewSource')}
                    </Link>
                  </>
                )}
                {isCostChangeSourceType(r.source_type) && (
                  <div style={{ marginTop: '2px' }}>
                    {t(`inv.costApprovals.source.${r.source_type}.what`)}
                  </div>
                )}
              </div>

              <span style={{ color: theme.textMuted }}>
                {t('inv.costApprovals.labelRequested')}
              </span>
              <span>
                {r.requested_by_name ?? t('inv.costApprovals.unknownUser')}
                {' · '}
                {formatDateTime(r.created_at)}
              </span>

              {r.status === 'pending' && (
                <>
                  <span style={{ color: theme.textMuted }}>
                    {t('inv.costApprovals.labelIfApproved')}
                  </span>
                  <span>
                    {t('inv.costApprovals.ifApproved', {
                      cost: `${fmtN(r.new_cost)} ${r.currency_code}`,
                    })}
                  </span>
                  <span style={{ color: theme.textMuted }}>
                    {t('inv.costApprovals.labelIfRejected')}
                  </span>
                  <span>{rejectionOutcome(r)}</span>
                </>
              )}

              {r.status === 'approved' && r.reviewed_by_name && (
                <>
                  <span style={{ color: theme.textMuted }}>
                    {t('inv.costApprovals.labelReviewed')}
                  </span>
                  <div style={{ color: theme.success }}>
                    {t('inv.costApprovals.approvedBy', { name: r.reviewed_by_name })}
                    {r.reviewed_at ? ` · ${formatDateTime(r.reviewed_at)}` : ''}
                    {reviewedByRequester && (
                      <div style={{ marginTop: '2px', color: theme.textMuted }}>
                        {t('inv.costApprovals.reviewedByRequester')}
                      </div>
                    )}
                  </div>
                </>
              )}
              {r.status === 'rejected' && (
                <>
                  <span style={{ color: theme.textMuted }}>
                    {t('inv.costApprovals.labelReviewed')}
                  </span>
                  <div style={{ color: theme.danger }}>
                    {r.reviewed_by_name
                      ? t('inv.costApprovals.rejectedBy', { name: r.reviewed_by_name })
                      : t('inv.costApprovals.rejectedLabel')}
                    {r.reviewed_at ? ` · ${formatDateTime(r.reviewed_at)}` : ''}
                    {reviewedByRequester && (
                      <div style={{ marginTop: '2px', color: theme.textMuted }}>
                        {t('inv.costApprovals.reviewedByRequester')}
                      </div>
                    )}
                    {r.rejection_reason && (
                      <div style={{ marginTop: '2px' }}>
                        {t('inv.costApprovals.rejectedReason', { reason: r.rejection_reason })}
                      </div>
                    )}
                  </div>
                  <span style={{ color: theme.textMuted }}>
                    {t('inv.costApprovals.labelOutcome')}
                  </span>
                  <span>{rejectionOutcome(r)}</span>
                </>
              )}
            </div>

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
                  disabled={!canApprove || needsAnotherReviewer}
                  onClick={() => void approve({ variables: { id: r.id } })}
                >
                  {t('inv.costApprovals.approve')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ color: theme.danger }}
                  disabled={!canApprove || needsAnotherReviewer}
                  onClick={() => {
                    setRejectTarget(r.id)
                  }}
                >
                  {t('inv.costApprovals.reject')}
                </Button>
                {needsAnotherReviewer && (
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
        {rejectTargetRequest && (
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: theme.textSecondary }}>
            {rejectionOutcome(rejectTargetRequest)}
          </p>
        )}
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
