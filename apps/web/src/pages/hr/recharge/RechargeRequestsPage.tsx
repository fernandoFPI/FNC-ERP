import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  RECHARGE_BUNDLES_QUERY,
  RECHARGE_REQUESTS_QUERY,
  CREATE_RECHARGE_REQUEST,
  CANCEL_RECHARGE_REQUEST,
  APPROVE_RECHARGE_REQUEST,
  REJECT_RECHARGE_REQUEST,
  FULFILL_RECHARGE_REQUEST,
  CONFIRM_RECHARGE_RECEIPT,
} from '../../../graphql/recharge'
import { COST_CENTERS_QUERY } from '../../../graphql/finance'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { usePermission } from '../../../hooks/usePermission'
import { useToastStore } from '../../../store/toastStore'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Grid } from '../../../components/ui/Grid'
import { KPICard } from '../../../components/ui/KPICard'
import { TabBar } from '../../../components/ui/TabBar'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Drawer } from '../../../components/ui/Drawer'
import { Select } from '../../../components/ui/Select'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Timeline, type TimelineEvent } from '../../../components/ui/Timeline'
import { StatusBar } from '../../../components/ui/StatusBar'
import {
  RechargeRequestCard,
  RECHARGE_STATUS_LABELS,
  type RechargeRequestSummary,
} from '../../../components/ui/RechargeRequestCard'

interface RechargeBundle {
  id: string
  name: string
  amount: number
  currencyCode: string
  isActive: boolean
}

interface CostCenter {
  id: string
  name: string
  code: string
}

interface RechargeRequest extends RechargeRequestSummary {
  companyId: string
  requestedBy: string
  costCenterId: string
  bundleId: string
  notes?: string | null
  approvedBy?: string | null
  approvedByEmail?: string | null
  approvedAt?: string | null
  rejectionReason?: string | null
  fulfilledBy?: string | null
  fulfilledByEmail?: string | null
  fulfilledAt?: string | null
  photoDownloadUrl?: string | null
  confirmedAt?: string | null
  updatedAt: string
}

type TabKey = 'mine' | 'toApprove' | 'toFulfill'

const EMPTY_FORM = { costCenterId: '', bundleId: '', phoneNumber: '', notes: '' }

export default function RechargeRequestsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const pagePadding = usePagePadding()
  const { can } = usePermission()
  const addToast = useToastStore((s) => s.addToast)
  const currentUserId = useAuthStore((s) => s.user?.id)

  const canApprove = can('hr.recharge.approve', 'approve')
  const canAdmin = can('hr.recharge.admin', 'admin')

  const [activeTab, setActiveTab] = useState<TabKey>('mine')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [fulfillFile, setFulfillFile] = useState<File | null>(null)
  const [fulfillPreview, setFulfillPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const { data: costCentersData } = useQuery(COST_CENTERS_QUERY)
  const { data: bundlesData } = useQuery(RECHARGE_BUNDLES_QUERY, { variables: { activeOnly: true } })
  const {
    data: mineData,
    loading: mineLoading,
    refetch: refetchMine,
  } = useQuery(RECHARGE_REQUESTS_QUERY, { variables: { scope: 'mine' }, fetchPolicy: 'cache-and-network' })
  const {
    data: toApproveData,
    loading: toApproveLoading,
    refetch: refetchToApprove,
  } = useQuery(RECHARGE_REQUESTS_QUERY, {
    variables: { scope: 'toApprove' },
    skip: !canApprove,
    fetchPolicy: 'cache-and-network',
  })
  const {
    data: toFulfillData,
    loading: toFulfillLoading,
    refetch: refetchToFulfill,
  } = useQuery(RECHARGE_REQUESTS_QUERY, {
    variables: { scope: 'toFulfill' },
    fetchPolicy: 'cache-and-network',
  })

  const [createRequest, { loading: creating }] = useMutation(CREATE_RECHARGE_REQUEST)
  const [cancelRequest] = useMutation(CANCEL_RECHARGE_REQUEST)
  const [approveRequest, { loading: approving }] = useMutation(APPROVE_RECHARGE_REQUEST)
  const [rejectRequest, { loading: rejectingMutation }] = useMutation(REJECT_RECHARGE_REQUEST)
  const [fulfillRequest, { loading: fulfilling }] = useMutation(FULFILL_RECHARGE_REQUEST)
  const [confirmReceipt, { loading: confirming }] = useMutation(CONFIRM_RECHARGE_RECEIPT)

  const costCenters: CostCenter[] = costCentersData?.costCenters ?? []
  const bundles: RechargeBundle[] = bundlesData?.rechargeBundles ?? []
  const mine: RechargeRequest[] = mineData?.rechargeRequests ?? []
  const toApprove: RechargeRequest[] = toApproveData?.rechargeRequests ?? []
  const toFulfill: RechargeRequest[] = toFulfillData?.rechargeRequests ?? []

  const refetchAll = () => {
    void refetchMine()
    if (canApprove) void refetchToApprove()
    void refetchToFulfill()
  }

  const tabs = [
    { key: 'mine', label: 'My Requests', badge: mine.filter((r) => r.status === 'fulfilled').length || undefined },
    ...(canApprove
      ? [{ key: 'toApprove', label: 'To Approve', badge: toApprove.length || undefined }]
      : []),
    { key: 'toFulfill', label: 'To Fulfill', badge: toFulfill.length || undefined },
  ]

  const activeList = activeTab === 'mine' ? mine : activeTab === 'toApprove' ? toApprove : toFulfill
  const activeLoading =
    activeTab === 'mine' ? mineLoading : activeTab === 'toApprove' ? toApproveLoading : toFulfillLoading

  const selectedRequest =
    mine.find((r) => r.id === selectedId) ??
    toApprove.find((r) => r.id === selectedId) ??
    toFulfill.find((r) => r.id === selectedId) ??
    null

  const selectedBundle = bundles.find((b) => b.id === form.bundleId)

  async function handleCreate() {
    if (!form.costCenterId || !form.bundleId || !form.phoneNumber.trim()) {
      addToast({ type: 'error', message: 'Cost center, bundle, and phone number are required' })
      return
    }
    try {
      await createRequest({
        variables: {
          input: {
            costCenterId: form.costCenterId,
            bundleId: form.bundleId,
            phoneNumber: form.phoneNumber.trim(),
            notes: form.notes.trim() || undefined,
          },
        },
      })
      addToast({ type: 'success', message: 'Recharge request submitted' })
      setShowCreateModal(false)
      setForm(EMPTY_FORM)
      refetchAll()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelRequest({ variables: { id } })
      addToast({ type: 'success', message: 'Request cancelled' })
      setSelectedId(null)
      refetchAll()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleApprove(id: string) {
    try {
      await approveRequest({ variables: { id } })
      addToast({ type: 'success', message: 'Request approved' })
      refetchAll()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) {
      addToast({ type: 'error', message: 'A rejection reason is required' })
      return
    }
    try {
      await rejectRequest({ variables: { id, reason: rejectReason.trim() } })
      addToast({ type: 'success', message: 'Request rejected' })
      setRejecting(false)
      setRejectReason('')
      setSelectedId(null)
      refetchAll()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  function pickFulfillFile(file: File) {
    setFulfillFile(file)
    setFulfillPreview(URL.createObjectURL(file))
  }

  async function handleFulfill(id: string) {
    if (!fulfillFile) {
      addToast({ type: 'error', message: 'Please attach a photo first' })
      return
    }
    setUploadingPhoto(true)
    try {
      const regResp = await api.post<{ fileId: string }>('/files/upload-url', {
        filename: fulfillFile.name,
        mimeType: fulfillFile.type || 'image/jpeg',
        sizeBytes: fulfillFile.size,
        category: 'recharge_proof',
      })
      const { fileId } = regResp.data
      await api.post(`/files/${fileId}/content`, fulfillFile, {
        headers: { 'Content-Type': fulfillFile.type || 'image/jpeg' },
      })
      await fulfillRequest({ variables: { id, fileId } })
      addToast({ type: 'success', message: 'Proof uploaded — requester notified' })
      setFulfillFile(null)
      setFulfillPreview(null)
      refetchAll()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleConfirm(id: string) {
    try {
      await confirmReceipt({ variables: { id } })
      addToast({ type: 'success', message: 'Receipt confirmed' })
      refetchAll()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  const awaitingConfirmCount = mine.filter((r) => r.status === 'fulfilled').length

  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title="Phone Recharge Requests"
        subtitle="Request a recharge bundle, track approval, and confirm once it arrives"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {canAdmin && (
              <Button
                variant="secondary"
                onClick={() => {
                  navigate('/hr/recharge/bundles')
                }}
              >
                Manage Bundles
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                setShowCreateModal(true)
              }}
            >
              + New Request
            </Button>
          </div>
        }
      />

      <Grid cols={3} tabletCols={3} phoneCols={1} gap={12} style={{ marginTop: '20px', marginBottom: '20px' }}>
        <KPICard label="My open requests" value={mine.filter((r) => !['confirmed', 'rejected', 'cancelled'].includes(r.status)).length} iconColor="accent" />
        <KPICard label="Awaiting my confirmation" value={awaitingConfirmCount} iconColor={awaitingConfirmCount > 0 ? 'warning' : 'accent'} />
        {canApprove ? (
          <KPICard label="Pending my approval" value={toApprove.length} iconColor={toApprove.length > 0 ? 'warning' : 'accent'} />
        ) : (
          <KPICard label="Ready to fulfill" value={toFulfill.length} iconColor={toFulfill.length > 0 ? 'warning' : 'accent'} />
        )}
      </Grid>

      <TabBar
        tabs={tabs}
        active={activeTab}
        onChange={(k) => {
          setActiveTab(k as TabKey)
        }}
      />

      <div style={{ marginTop: '20px' }}>
        {activeLoading && activeList.length === 0 ? (
          <Grid cols={3} tabletCols={2} phoneCols={1} gap={12}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '150px', borderRadius: '12px' }}
              />
            ))}
          </Grid>
        ) : activeList.length === 0 ? (
          <EmptyState
            title={
              activeTab === 'mine'
                ? 'No recharge requests yet'
                : activeTab === 'toApprove'
                  ? 'Nothing pending approval'
                  : 'Nothing to fulfill right now'
            }
            message={
              activeTab === 'mine'
                ? 'Submit a request to get a phone recharge bundle approved and sent to you.'
                : activeTab === 'toApprove'
                  ? "You're all caught up."
                  : "You're not assigned as the fulfiller for any cost center with a pending request."
            }
            action={
              activeTab === 'mine' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setShowCreateModal(true)
                  }}
                >
                  New Request
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Grid cols={3} tabletCols={2} phoneCols={1} gap={12}>
            {activeList.map((r) => (
              <RechargeRequestCard
                key={r.id}
                request={r}
                onClick={() => {
                  setSelectedId(r.id)
                }}
                actions={
                  activeTab === 'toApprove' && r.status === 'pending' ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={approving}
                        onClick={() => void handleApprove(r.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedId(r.id)
                          setRejecting(true)
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  ) : activeTab === 'toFulfill' && r.status === 'approved' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedId(r.id)
                      }}
                    >
                      Upload Proof
                    </Button>
                  ) : activeTab === 'mine' && r.status === 'fulfilled' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      loading={confirming}
                      onClick={() => void handleConfirm(r.id)}
                    >
                      Confirm Receipt
                    </Button>
                  ) : activeTab === 'mine' && r.status === 'pending' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleCancel(r.id)}
                    >
                      Cancel
                    </Button>
                  ) : null
                }
              />
            ))}
          </Grid>
        )}
      </div>

      {/* ── Create Request Modal ─────────────────────────────────────────── */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setForm(EMPTY_FORM)
        }}
        title="New Recharge Request"
        description="An approver will review this, then the assigned cost-center fulfiller will send the bundle."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCreateModal(false)
                setForm(EMPTY_FORM)
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={creating} onClick={() => void handleCreate()}>
              Submit Request
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select
            label="Cost Center"
            value={form.costCenterId}
            onChange={(e) => {
              setForm((f) => ({ ...f, costCenterId: e.target.value }))
            }}
          >
            <option value="">Select cost center…</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>

          <div>
            <Select
              label="Bundle"
              value={form.bundleId}
              onChange={(e) => {
                setForm((f) => ({ ...f, bundleId: e.target.value }))
              }}
            >
              <option value="">Select bundle…</option>
              {bundles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — {b.amount.toLocaleString()} {b.currencyCode}
                </option>
              ))}
            </Select>
            {selectedBundle && (
              <div style={{ fontSize: '12px', color: theme.accent, marginTop: '4px', fontWeight: 600 }}>
                {selectedBundle.amount.toLocaleString()} {selectedBundle.currencyCode}
              </div>
            )}
          </div>

          <Input
            label="Phone Number"
            type="tel"
            value={form.phoneNumber}
            onChange={(e) => {
              setForm((f) => ({ ...f, phoneNumber: e.target.value }))
            }}
            placeholder="07xx xxx xxxx"
          />

          <Textarea
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => {
              setForm((f) => ({ ...f, notes: e.target.value }))
            }}
            placeholder="Anything the approver should know…"
            rows={2}
          />
        </div>
      </Modal>

      {/* ── Detail Drawer ────────────────────────────────────────────────── */}
      <Drawer
        open={!!selectedRequest}
        onClose={() => {
          setSelectedId(null)
          setRejecting(false)
          setRejectReason('')
          setFulfillFile(null)
          setFulfillPreview(null)
        }}
        title={selectedRequest ? selectedRequest.phoneNumber : 'Recharge Request'}
        width="440px"
      >
        {selectedRequest && (
          <RequestDetailBody
            request={selectedRequest}
            theme={theme}
            isRequester={selectedRequest.requestedBy === currentUserId}
            isApproveTab={activeTab === 'toApprove'}
            isFulfillTab={activeTab === 'toFulfill'}
            rejecting={rejecting}
            rejectReason={rejectReason}
            setRejectReason={setRejectReason}
            setRejecting={setRejecting}
            approving={approving}
            rejectingMutation={rejectingMutation}
            onApprove={() => void handleApprove(selectedRequest.id)}
            onReject={() => void handleReject(selectedRequest.id)}
            fulfillFile={fulfillFile}
            fulfillPreview={fulfillPreview}
            onPickFile={pickFulfillFile}
            onFulfill={() => void handleFulfill(selectedRequest.id)}
            uploadingPhoto={uploadingPhoto || fulfilling}
            onConfirm={() => void handleConfirm(selectedRequest.id)}
            confirming={confirming}
            onCancel={() => void handleCancel(selectedRequest.id)}
          />
        )}
      </Drawer>
    </div>
  )
}

interface RequestDetailBodyProps {
  request: RechargeRequest
  theme: ReturnType<typeof useTheme>['theme']
  isRequester: boolean
  isApproveTab: boolean
  isFulfillTab: boolean
  rejecting: boolean
  rejectReason: string
  setRejectReason: (v: string) => void
  setRejecting: (v: boolean) => void
  approving: boolean
  rejectingMutation: boolean
  onApprove: () => void
  onReject: () => void
  fulfillFile: File | null
  fulfillPreview: string | null
  onPickFile: (f: File) => void
  onFulfill: () => void
  uploadingPhoto: boolean
  onConfirm: () => void
  confirming: boolean
  onCancel: () => void
}

function RequestDetailBody({
  request: r,
  theme,
  isRequester,
  isApproveTab,
  isFulfillTab,
  rejecting,
  rejectReason,
  setRejectReason,
  setRejecting,
  approving,
  rejectingMutation,
  onApprove,
  onReject,
  fulfillFile,
  fulfillPreview,
  onPickFile,
  onFulfill,
  uploadingPhoto,
  onConfirm,
  confirming,
  onCancel,
}: RequestDetailBodyProps) {
  const statusSteps = ['pending', 'approved', 'fulfilled', 'confirmed']
  const isTerminalNegative = r.status === 'rejected' || r.status === 'cancelled'
  // Both reject and cancel only ever fire from 'pending' (see
  // rejectRechargeRequest/cancelRechargeRequest's WHERE clauses), so that's
  // always the step a terminal-negative request stopped at. Passing the
  // literal 'rejected'/'cancelled' string here wouldn't match any entry in
  // statusSteps, leaving every dot rendered as untouched instead of showing
  // where it actually stopped.
  const displayStep = isTerminalNegative ? 'pending' : r.status

  const events: TimelineEvent[] = [
    {
      id: 'created',
      title: 'Request submitted',
      description: `${r.bundleName ?? 'Bundle'} for ${r.phoneNumber}`,
      user: r.requestedByEmail ?? undefined,
      timestamp: r.createdAt,
    },
  ]
  if (r.approvedAt) {
    events.push({
      id: 'approved',
      title: r.status === 'rejected' ? 'Rejected' : 'Approved',
      description: r.status === 'rejected' ? (r.rejectionReason ?? undefined) : undefined,
      user: r.approvedByEmail ?? undefined,
      timestamp: r.approvedAt,
      variant: r.status === 'rejected' ? 'danger' : 'success',
    })
  }
  if (r.fulfilledAt) {
    events.push({
      id: 'fulfilled',
      title: 'Proof uploaded — sent to requester',
      user: r.fulfilledByEmail ?? undefined,
      timestamp: r.fulfilledAt,
      variant: 'default',
    })
  }
  if (r.confirmedAt) {
    events.push({
      id: 'confirmed',
      title: 'Receipt confirmed',
      timestamp: r.confirmedAt,
      variant: 'success',
    })
  }
  if (r.status === 'cancelled') {
    // There's no dedicated cancelledAt column — updatedAt is the closest
    // available timestamp, since cancelling is the only thing that touches
    // a pending request's updated_at besides this.
    events.push({
      id: 'cancelled',
      title: 'Cancelled by requester',
      timestamp: r.updatedAt,
      variant: 'danger',
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <StatusBar
          steps={statusSteps.map((s) => ({ key: s, label: RECHARGE_STATUS_LABELS[s] }))}
          currentStep={displayStep}
          rejected={isTerminalNegative}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <InfoField label="Requester" value={r.requestedByEmail ?? '—'} theme={theme} />
        <InfoField label="Cost Center" value={r.costCenterName ?? '—'} theme={theme} />
        <InfoField label="Bundle" value={r.bundleName ?? '—'} theme={theme} />
        <InfoField
          label="Amount"
          value={
            r.bundleAmount != null ? `${r.bundleAmount.toLocaleString()} ${r.bundleCurrencyCode ?? ''}` : '—'
          }
          theme={theme}
        />
      </div>

      {r.notes && (
        <div>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Notes</div>
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>{r.notes}</div>
        </div>
      )}

      {r.status === 'rejected' && r.rejectionReason && (
        <div
          style={{
            background: theme.dangerBg,
            border: `1px solid ${theme.dangerBorder}`,
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: '12px',
            color: theme.danger,
          }}
        >
          <strong>Rejected:</strong> {r.rejectionReason}
        </div>
      )}

      {/* ── Photo / reveal gate ──────────────────────────────────────────── */}
      {(r.status === 'fulfilled' || r.status === 'confirmed') && (
        <div>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Proof of purchase</div>
          {r.photoDownloadUrl ? (
            <a href={r.photoDownloadUrl} target="_blank" rel="noreferrer">
              <div
                style={{
                  position: 'relative',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: `1px solid ${theme.border}`,
                }}
              >
                <img
                  src={r.photoDownloadUrl}
                  alt="Recharge proof"
                  style={{ width: '100%', display: 'block', maxHeight: '280px', objectFit: 'cover' }}
                />
                {r.status === 'confirmed' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: theme.success,
                      color: '#fff',
                      borderRadius: '999px',
                      width: '26px',
                      height: '26px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                )}
              </div>
            </a>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                padding: '28px 16px',
                borderRadius: '10px',
                border: `1.5px dashed ${theme.accentBorder}`,
                background: theme.accentBg,
                textAlign: 'center',
              }}
            >
              <LockIconInline color={theme.accent} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                Proof is ready
              </div>
              <div style={{ fontSize: '12px', color: theme.textMuted, maxWidth: '260px' }}>
                Confirm you received your recharge to unlock the photo.
              </div>
              {isRequester && (
                <Button variant="primary" size="sm" loading={confirming} onClick={onConfirm}>
                  Confirm Receipt
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      {isApproveTab && r.status === 'pending' && !rejecting && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="primary" loading={approving} onClick={onApprove}>
            Approve
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRejecting(true)
            }}
          >
            Reject
          </Button>
        </div>
      )}
      {isApproveTab && rejecting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Textarea
            value={rejectReason}
            onChange={(e) => {
              setRejectReason(e.target.value)
            }}
            placeholder="Reason for rejection (required)…"
            rows={2}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="danger"
              loading={rejectingMutation}
              disabled={!rejectReason.trim()}
              onClick={onReject}
            >
              Confirm Reject
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRejecting(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isFulfillTab && r.status === 'approved' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>
            Upload proof of purchase
          </div>
          {fulfillPreview ? (
            <img
              src={fulfillPreview}
              alt="Selected proof"
              style={{
                width: '100%',
                maxHeight: '200px',
                objectFit: 'cover',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
              }}
            />
          ) : (
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '24px',
                border: `2px dashed ${theme.border}`,
                borderRadius: '10px',
                cursor: 'pointer',
                color: theme.textMuted,
                fontSize: '12px',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={theme.textMuted} strokeWidth="1.6">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Take or choose a photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onPickFile(f)
                }}
              />
            </label>
          )}
          <Button variant="primary" loading={uploadingPhoto} disabled={!fulfillFile} onClick={onFulfill}>
            Send &amp; Notify Requester
          </Button>
        </div>
      )}

      {isRequester && r.status === 'pending' && (
        <Button variant="ghost" onClick={onCancel}>
          Cancel Request
        </Button>
      )}

      <div>
        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>Activity</div>
        <Timeline events={events} />
      </div>
    </div>
  )
}

function InfoField({
  label,
  value,
  theme,
}: {
  label: string
  value: string
  theme: ReturnType<typeof useTheme>['theme']
}) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500, marginTop: '2px' }}>{value}</div>
    </div>
  )
}

function LockIconInline({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <rect x="4" y="10" width="16" height="10" rx="2.5" />
      <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" />
      <circle cx="12" cy="15" r="1.5" fill={color} stroke="none" />
    </svg>
  )
}
