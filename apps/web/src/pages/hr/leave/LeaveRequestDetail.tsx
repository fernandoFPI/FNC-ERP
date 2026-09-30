import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  LEAVE_REQUEST_QUERY,
  APPROVE_LEAVE_REQUEST,
  REJECT_LEAVE_REQUEST,
  CANCEL_LEAVE_REQUEST,
} from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { DetailHeader } from '../../../components/ui/DetailHeader'
import { Card } from '../../../components/ui/Card'
import { Button, StickyActionBar } from '../../../components/ui/Button'
import { Textarea } from '../../../components/ui/Textarea'
import { useToastStore } from '../../../store/toastStore'
import { useState } from 'react'
import type { ApproveLeaveRequestMutation, ApproveLeaveRequestMutationVariables, CancelLeaveRequestMutation, CancelLeaveRequestMutationVariables, LeaveRequestQuery, LeaveRequestQueryVariables, RejectLeaveRequestMutation, RejectLeaveRequestMutationVariables } from '../../../graphql/generated'

export default function LeaveRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const { isPhone } = useBreakpoint()
  const addToast = useToastStore((s) => s.addToast)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showReject, setShowReject] = useState(false)

  const { data, loading, refetch } = useQuery<LeaveRequestQuery, LeaveRequestQueryVariables>(LEAVE_REQUEST_QUERY, { variables: { id: id ?? '' }, skip: !id })
  const [approveRequest, { loading: approving }] = useMutation<ApproveLeaveRequestMutation, ApproveLeaveRequestMutationVariables>(APPROVE_LEAVE_REQUEST)
  const [rejectRequest, { loading: rejecting }] = useMutation<RejectLeaveRequestMutation, RejectLeaveRequestMutationVariables>(REJECT_LEAVE_REQUEST)
  const [cancelRequest, { loading: cancelling }] = useMutation<CancelLeaveRequestMutation, CancelLeaveRequestMutationVariables>(CANCEL_LEAVE_REQUEST)

  const req = data?.leaveRequest

  async function handleApprove() {
    try {
      await approveRequest({ variables: { id: id ?? '' } })
      addToast({ type: 'success', message: 'Leave request approved' })
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleReject() {
    if (!rejectNotes) {
      addToast({ type: 'error', message: 'Review notes required' })
      return
    }
    try {
      await rejectRequest({ variables: { id: id ?? '', reviewNotes: rejectNotes } })
      addToast({ type: 'warning', message: 'Leave request rejected' })
      setShowReject(false)
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleCancel() {
    try {
      await cancelRequest({ variables: { id: id ?? '' } })
      addToast({ type: 'warning', message: 'Leave request cancelled' })
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  if (loading && !req)
    return <div style={{ padding: '24px', color: theme.textMuted }}>Loading…</div>
  if (!req) return <div style={{ padding: '24px', color: theme.textMuted }}>Request not found</div>

  const statusVariant =
    req.status === 'approved'
      ? 'success'
      : req.status === 'rejected'
        ? 'danger'
        : req.status === 'cancelled'
          ? 'neutral'
          : 'warning'

  return (
    <div
      style={{
        ...pagePadding,
        margin: '0 auto',
        maxWidth: '1000px',
        paddingBottom: isPhone ? 'calc(env(safe-area-inset-bottom, 0px) + 120px)' : undefined,
      }}
    >
      <DetailHeader
        title={`Leave Request — ${req.leave_type_name ?? ''}`}
        subtitle={req.employee_name ?? undefined}
        status={req.status}
        statusVariant={statusVariant}
        backPath="/hr/leave"
        backLabel="Leave requests"
        actions={
          !isPhone ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              {req.status === 'pending' && (
                <>
                  <Button variant="primary" size="sm" onClick={(...args: Parameters<typeof handleApprove>) => void handleApprove(...args)} loading={approving}>
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowReject((v) => !v)
                    }}
                  >
                    Reject
                  </Button>
                  <Button variant="danger" size="sm" onClick={(...args: Parameters<typeof handleCancel>) => void handleCancel(...args)} loading={cancelling}>
                    Cancel
                  </Button>
                </>
              )}
            </div>
          ) : undefined
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
        <Card style={{ padding: '16px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            {[
              ['Employee', req.employee_name],
              ['Leave type', req.leave_type_name],
              ['Start date', req.start_date],
              ['End date', req.end_date],
              ['Days requested', req.total_days],
              ['Submitted', req.created_at?.slice(0, 10)],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  padding: '10px',
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{label}</div>
                <div style={{ fontSize: '13px', color: theme.textPrimary, marginTop: '4px' }}>
                  {value ?? '—'}
                </div>
              </div>
            ))}
          </div>
          {req.reason && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px',
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                Reason
              </div>
              <div style={{ fontSize: '13px', color: theme.textSecondary }}>{req.reason}</div>
            </div>
          )}
        </Card>

        {showReject && (
          <Card style={{ padding: '16px' }}>
            <Textarea
              label="Rejection notes (required)"
              value={rejectNotes}
              onChange={(e) => {
                setRejectNotes(e.target.value)
              }}
              rows={3}
              required
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <Button
                variant="danger"
                size="sm"
                onClick={(...args: Parameters<typeof handleReject>) => void handleReject(...args)}
                loading={rejecting}
                disabled={!rejectNotes}
              >
                Confirm rejection
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowReject(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {/* review_notes/reviewed_by_email have no backing schema field
            (LeaveRequest only has reviewed_by as a bare ID, plus reviewed_at)
            — showing just the review timestamp until that's resolvable. */}
        {req.reviewed_at && (
          <Card style={{ padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '6px' }}>
              Reviewed
            </div>
            {req.reviewed_at && (
              <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '6px' }}>
                {req.reviewed_at.slice(0, 10)}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Sticky actions on phone */}
      {isPhone && req.status === 'pending' && (
        <StickyActionBar>
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <Button
              variant="primary"
              fullWidthOnMobile
              onClick={(...args: Parameters<typeof handleApprove>) => void handleApprove(...args)}
              loading={approving}
              style={{ flex: 1 }}
            >
              Approve
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowReject((v) => !v)
              }}
              style={{ flex: 1 }}
            >
              Reject
            </Button>
            <Button
              variant="danger"
              onClick={(...args: Parameters<typeof handleCancel>) => void handleCancel(...args)}
              loading={cancelling}
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
          </div>
        </StickyActionBar>
      )}
    </div>
  )
}
