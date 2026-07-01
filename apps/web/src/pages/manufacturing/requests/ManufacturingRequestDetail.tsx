import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  MANUFACTURING_REQUEST_QUERY,
  SUBMIT_MANUFACTURING_REQUEST,
  APPROVE_MANUFACTURING_REQUEST,
  REJECT_MANUFACTURING_REQUEST,
  CANCEL_MANUFACTURING_REQUEST,
  CREATE_MO_FROM_REQUEST,
} from '../../../graphql/manufacturing-requests'
import { BOMS_QUERY, WORK_CENTERS_QUERY } from '../../../graphql/manufacturing'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { usePermission } from '../../../hooks/usePermission'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'info',
  in_production: 'info',
  completed: 'success',
  cancelled: 'danger',
}

interface CreateMOForm {
  bomId: string
  workCenterId: string
  scheduledStart: string
  scheduledEnd: string
}

export default function ManufacturingRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const { can } = usePermission()
  const isAdmin = can('manufacturing.orders.approve', 'approve')

  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showCreateMO, setShowCreateMO] = useState(false)
  const [moForm, setMOForm] = useState<CreateMOForm>({ bomId: '', workCenterId: '', scheduledStart: '', scheduledEnd: '' })

  const { data, loading, refetch } = useQuery(MANUFACTURING_REQUEST_QUERY, { variables: { id }, skip: !id })
  const { data: bomsData } = useQuery<{ boms: Array<{ id: string; product_name: string; version: string; qty_produced: number }> }>(BOMS_QUERY, { variables: { isActive: true, allCompanies: true } })
  const { data: wcData } = useQuery<{ workCenters: Array<{ id: string; name: string; code: string }> }>(WORK_CENTERS_QUERY, { variables: { isActive: true, allCompanies: true } })
  const boms = bomsData?.boms ?? []
  const workCenters = wcData?.workCenters ?? []
  const [submitMR, { loading: submitting }] = useMutation(SUBMIT_MANUFACTURING_REQUEST)
  const [approveMR, { loading: approving }] = useMutation(APPROVE_MANUFACTURING_REQUEST)
  const [rejectMR, { loading: rejecting }] = useMutation(REJECT_MANUFACTURING_REQUEST)
  const [cancelMR, { loading: cancelling }] = useMutation(CANCEL_MANUFACTURING_REQUEST)
  const [createMO, { loading: creatingMO }] = useMutation(CREATE_MO_FROM_REQUEST)

  const mr = data?.manufacturingRequest

  async function handleAction(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn()
      addToast({ type: 'success', message: msg })
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { addToast({ type: 'error', message: 'Rejection reason is required' }); return }
    await handleAction(
      () => rejectMR({ variables: { id, reason: rejectReason } }),
      'Request rejected',
    )
    setShowReject(false)
    setRejectReason('')
  }

  async function handleCreateMO() {
    if (!moForm.bomId) { addToast({ type: 'error', message: 'Please select a BOM' }); return }
    await handleAction(
      () => createMO({
        variables: {
          requestId: id,
          bomId: moForm.bomId,
          workCenterId: moForm.workCenterId || null,
          scheduledStart: moForm.scheduledStart || null,
          scheduledEnd: moForm.scheduledEnd || null,
        },
      }),
      'Manufacturing order created',
    )
    setShowCreateMO(false)
    setMOForm({ bomId: '', workCenterId: '', scheduledStart: '', scheduledEnd: '' })
  }

  if (loading || !mr) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: `1px solid ${theme.border}22` }}>
      <div style={{ width: '160px', flexShrink: 0, fontSize: '12px', color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: '13px', color: theme.textPrimary }}>{value}</div>
    </div>
  )

  const inputStyle = {
    width: '100%', padding: '7px 10px', borderRadius: '6px',
    border: `1px solid ${theme.border}`, background: theme.bgCanvas,
    color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={mr.requestNumber}
        subtitle={mr.projectName ?? mr.projectId}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/manufacturing/requests')}>Back</Button>
            <Badge variant={STATUS_VARIANT[mr.status] ?? 'neutral'}>{mr.status.replace(/_/g, ' ')}</Badge>
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', maxWidth: '1000px' }}>

          {/* Details Card */}
          <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, marginBottom: '12px' }}>
              Request Details
            </div>
            {row('Request #', <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{mr.requestNumber}</span>)}
            {row('Status', <Badge variant={STATUS_VARIANT[mr.status] ?? 'neutral'}>{mr.status.replace(/_/g, ' ')}</Badge>)}
            {row('Project', mr.projectName ?? mr.projectId)}
            {row('Company', mr.requestingCompanyName ?? mr.requestingCompanyId)}
            {row('Product', mr.productName ? `${mr.productName}${mr.productSku ? ` (${mr.productSku})` : ''}` : '—')}
            {row('Qty Requested', <span style={{ fontFamily: 'monospace' }}>{mr.qtyRequested.toLocaleString()}</span>)}
            {row('Required By', mr.requiredDate?.slice(0, 10) ?? '—')}
            {row('Description', mr.description ?? '—')}
            {row('Notes', mr.notes ?? '—')}
            {row('Created', new Date(mr.createdAt).toLocaleString())}
            {row('Requested By', mr.requestedByName ?? mr.requestedBy)}
          </div>

          {/* Approval & MO Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, marginBottom: '12px' }}>
                Approval
              </div>
              {row('Approved By', mr.approvedByName ?? '—')}
              {row('Approved At', mr.approvedAt ? new Date(mr.approvedAt).toLocaleString() : '—')}
              {mr.rejectionReason && row('Rejection Reason', <span style={{ color: theme.danger }}>{mr.rejectionReason}</span>)}
            </div>

            <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, marginBottom: '12px' }}>
                Manufacturing Order
              </div>
              {row('MO Number', mr.moNumber
                ? <button onClick={() => navigate(`/manufacturing/orders/${mr.moId}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, fontFamily: 'monospace', fontWeight: 600, fontSize: '13px', padding: 0 }}>{mr.moNumber}</button>
                : '—'
              )}
              {row('Actual Cost', mr.actualCost != null ? <AmountDisplay amount={mr.actualCost} currency={mr.currencyCode} /> : '—')}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginTop: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {mr.status === 'draft' && (
            <Button variant="primary" size="sm" loading={submitting}
              onClick={() => handleAction(() => submitMR({ variables: { id } }), 'Request submitted for approval')}
            >
              Submit for Approval
            </Button>
          )}
          {mr.status === 'pending_approval' && isAdmin && (
            <>
              <Button variant="primary" size="sm" loading={approving}
                onClick={() => handleAction(() => approveMR({ variables: { id } }), 'Request approved')}
              >
                Approve
              </Button>
              <Button variant="danger" size="sm" onClick={() => setShowReject(true)}>Reject</Button>
            </>
          )}
          {mr.status === 'approved' && isAdmin && (
            <Button variant="primary" size="sm" onClick={() => setShowCreateMO(true)}>
              Create Manufacturing Order
            </Button>
          )}
          {['draft', 'pending_approval'].includes(mr.status) && (
            <Button variant="ghost" size="sm" loading={cancelling}
              onClick={() => handleAction(() => cancelMR({ variables: { id } }), 'Request cancelled')}
            >
              Cancel Request
            </Button>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showReject && (
        <Modal open={showReject} title="Reject Request" onClose={() => setShowReject(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '360px' }}>
            <div>
              <label style={labelStyle}>Reason for rejection <span style={{ color: theme.danger }}>*</span></label>
              <textarea
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Explain why this request is being rejected…"
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>Cancel</Button>
              <Button variant="danger" size="sm" loading={rejecting} onClick={handleReject}>Reject</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create MO Modal */}
      {showCreateMO && (
        <Modal open={showCreateMO} title="Create Manufacturing Order" onClose={() => setShowCreateMO(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '400px' }}>
            <div>
              <SearchableSelect
                label="BOM *"
                value={moForm.bomId}
                onChange={(v) => setMOForm(f => ({ ...f, bomId: v }))}
                placeholder="— Select a BOM —"
                options={boms.map(b => ({ value: b.id, label: `${b.product_name} — v${b.version} (produces ${b.qty_produced})` }))}
              />
            </div>
            <div>
              <SearchableSelect
                label="Work Center (optional)"
                value={moForm.workCenterId}
                onChange={(v) => setMOForm(f => ({ ...f, workCenterId: v }))}
                placeholder="— None —"
                options={workCenters.map(wc => ({ value: wc.id, label: `${wc.name} (${wc.code})` }))}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Scheduled Start</label>
                <input type="date" style={inputStyle} value={moForm.scheduledStart} onChange={e => setMOForm(f => ({ ...f, scheduledStart: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Scheduled End</label>
                <input type="date" style={inputStyle} value={moForm.scheduledEnd} onChange={e => setMOForm(f => ({ ...f, scheduledEnd: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateMO(false)}>Cancel</Button>
              <Button variant="primary" size="sm" loading={creatingMO} onClick={handleCreateMO}>Create MO</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
