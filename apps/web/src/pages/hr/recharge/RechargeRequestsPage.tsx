import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  RECHARGE_BUNDLES_QUERY,
  RECHARGE_REQUESTS_QUERY,
  RECHARGE_COST_CENTER_QUERY,
  RECHARGE_MONTHLY_SUMMARY_QUERY,
  CREATE_RECHARGE_REQUEST,
  CANCEL_RECHARGE_REQUEST,
  FULFILL_RECHARGE_REQUEST,
  CONFIRM_RECHARGE_RECEIPT,
} from '../../../graphql/recharge'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { usePermission } from '../../../hooks/usePermission'
import { useToastStore } from '../../../store/toastStore'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
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

interface RechargeRequest extends RechargeRequestSummary {
  companyId: string
  requestedBy: string
  costCenterId: string
  bundleId: string
  notes?: string | null
  fulfilledBy?: string | null
  fulfilledByEmail?: string | null
  fulfilledAt?: string | null
  photoDownloadUrl?: string | null
  confirmedAt?: string | null
  updatedAt: string
}

interface MonthlySummaryEntry {
  requestedBy: string
  requestedByEmail?: string | null
  requestCount: number
  totalAmount: number
  currencyCode: string
}

type TabKey = 'mine' | 'toFulfill' | 'summary'

const EMPTY_FORM = { bundleId: '', phoneNumber: '', notes: '' }
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function RechargeRequestsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const pagePadding = usePagePadding()
  const { can } = usePermission()
  const addToast = useToastStore((s) => s.addToast)
  const currentUserId = useAuthStore((s) => s.user?.id)

  const canAdmin = can('hr.recharge.admin', 'admin')

  const [activeTab, setActiveTab] = useState<TabKey>('mine')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fulfillFile, setFulfillFile] = useState<File | null>(null)
  const [fulfillPreview, setFulfillPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const { data: costCenterData } = useQuery(RECHARGE_COST_CENTER_QUERY)
  const { data: bundlesData } = useQuery(RECHARGE_BUNDLES_QUERY, { variables: { activeOnly: true } })
  const {
    data: mineData,
    loading: mineLoading,
    refetch: refetchMine,
  } = useQuery(RECHARGE_REQUESTS_QUERY, { variables: { scope: 'mine' }, fetchPolicy: 'cache-and-network' })
  const {
    data: toFulfillData,
    loading: toFulfillLoading,
    refetch: refetchToFulfill,
  } = useQuery(RECHARGE_REQUESTS_QUERY, {
    variables: { scope: 'toFulfill' },
    fetchPolicy: 'cache-and-network',
  })

  const costCenter = costCenterData?.rechargeCostCenter as
    | { id: string; name: string; code: string; defaultFulfillerId?: string | null }
    | null
    | undefined
  const isFulfiller = !!costCenter && costCenter.defaultFulfillerId === currentUserId
  const canSeeSummary = canAdmin || isFulfiller

  const now = new Date()
  const [summaryYear, setSummaryYear] = useState(now.getFullYear())
  const [summaryMonth, setSummaryMonth] = useState(now.getMonth() + 1)
  const { data: summaryData, loading: summaryLoading } = useQuery(RECHARGE_MONTHLY_SUMMARY_QUERY, {
    variables: { year: summaryYear, month: summaryMonth },
    skip: !canSeeSummary,
    fetchPolicy: 'cache-and-network',
  })

  const [createRequest, { loading: creating }] = useMutation(CREATE_RECHARGE_REQUEST)
  const [cancelRequest] = useMutation(CANCEL_RECHARGE_REQUEST)
  const [fulfillRequest, { loading: fulfilling }] = useMutation(FULFILL_RECHARGE_REQUEST)
  const [confirmReceipt, { loading: confirming }] = useMutation(CONFIRM_RECHARGE_RECEIPT)

  const bundles: RechargeBundle[] = bundlesData?.rechargeBundles ?? []
  const mine: RechargeRequest[] = mineData?.rechargeRequests ?? []
  const toFulfill: RechargeRequest[] = toFulfillData?.rechargeRequests ?? []
  const summary: MonthlySummaryEntry[] = summaryData?.rechargeMonthlySummary ?? []

  const refetchAll = () => {
    void refetchMine()
    void refetchToFulfill()
  }

  const tabs = [
    { key: 'mine', label: 'My Requests', badge: mine.filter((r) => r.status === 'fulfilled').length || undefined },
    { key: 'toFulfill', label: 'To Fulfill', badge: toFulfill.length || undefined },
    ...(canSeeSummary ? [{ key: 'summary', label: 'Monthly Summary' }] : []),
  ]

  const activeList = activeTab === 'mine' ? mine : activeTab === 'toFulfill' ? toFulfill : []
  const activeLoading = activeTab === 'mine' ? mineLoading : activeTab === 'toFulfill' ? toFulfillLoading : false

  const selectedRequest =
    mine.find((r) => r.id === selectedId) ?? toFulfill.find((r) => r.id === selectedId) ?? null

  const selectedBundle = bundles.find((b) => b.id === form.bundleId)

  async function handleCreate() {
    if (!form.bundleId || !form.phoneNumber.trim()) {
      addToast({ type: 'error', message: 'Bundle and phone number are required' })
      return
    }
    try {
      await createRequest({
        variables: {
          input: {
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
        subtitle="Request a recharge bundle, and confirm once it arrives"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {canAdmin && (
              <Button
                variant="secondary"
                onClick={() => {
                  navigate('/recharge/bundles')
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
        <KPICard label="My open requests" value={mine.filter((r) => !['confirmed', 'cancelled'].includes(r.status)).length} iconColor="accent" />
        <KPICard label="Awaiting my confirmation" value={awaitingConfirmCount} iconColor={awaitingConfirmCount > 0 ? 'warning' : 'accent'} />
        <KPICard label="Ready to fulfill" value={toFulfill.length} iconColor={toFulfill.length > 0 ? 'warning' : 'accent'} />
      </Grid>

      <TabBar
        tabs={tabs}
        active={activeTab}
        onChange={(k) => {
          setActiveTab(k as TabKey)
        }}
      />

      {activeTab === 'summary' ? (
        <MonthlySummaryView
          theme={theme}
          entries={summary}
          loading={summaryLoading}
          year={summaryYear}
          month={summaryMonth}
          onChangeMonth={(y, m) => {
            setSummaryYear(y)
            setSummaryMonth(m)
          }}
        />
      ) : (
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
              title={activeTab === 'mine' ? 'No recharge requests yet' : 'Nothing to fulfill right now'}
              message={
                activeTab === 'mine'
                  ? 'Submit a request to get a phone recharge bundle sent to you.'
                  : "You're not the assigned fulfiller, or there's nothing pending."
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
                    activeTab === 'toFulfill' && r.status === 'pending' ? (
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
      )}

      {/* ── Create Request Modal ─────────────────────────────────────────── */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setForm(EMPTY_FORM)
        }}
        title="New Recharge Request"
        description="The assigned fulfiller will be notified immediately and will send the bundle."
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
            placeholder="Anything the fulfiller should know…"
            rows={2}
          />
        </div>
      </Modal>

      {/* ── Detail Drawer ────────────────────────────────────────────────── */}
      <Drawer
        open={!!selectedRequest}
        onClose={() => {
          setSelectedId(null)
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
            isFulfillTab={activeTab === 'toFulfill'}
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

function MonthlySummaryView({
  theme,
  entries,
  loading,
  year,
  month,
  onChangeMonth,
}: {
  theme: ReturnType<typeof useTheme>['theme']
  entries: MonthlySummaryEntry[]
  loading: boolean
  year: number
  month: number
  onChangeMonth: (year: number, month: number) => void
}) {
  // Entries can span multiple currencies for the same requester in one
  // month — sum per currency rather than blindly adding raw amounts together.
  const totalsByCurrency = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.currencyCode] = (acc[e.currencyCode] ?? 0) + e.totalAmount
    return acc
  }, {})

  function shiftMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    onChangeMonth(y, m)
  }

  return (
    <div style={{ marginTop: '20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              shiftMonth(-1)
            }}
          >
            ←
          </Button>
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, minWidth: '140px', textAlign: 'center' }}>
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              shiftMonth(1)
            }}
          >
            →
          </Button>
        </div>
        {entries.length > 0 && (
          <div style={{ fontSize: '13px', color: theme.textMuted, display: 'flex', gap: '12px' }}>
            <span>Total sent:</span>
            {Object.entries(totalsByCurrency).map(([code, amount]) => (
              <span key={code} style={{ color: theme.accent, fontWeight: 700 }}>
                {amount.toLocaleString()} {code}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && entries.length === 0 ? (
        <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No recharges fulfilled this month"
          message="Once requests are sent out this month, per-person totals will show up here."
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', color: theme.textMuted, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>
                    Requester
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 16px', color: theme.textMuted, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>
                    Requests
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 16px', color: theme.textMuted, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>
                    Total Received
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.requestedBy} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '10px 16px', color: theme.textPrimary }}>{e.requestedByEmail ?? '—'}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: theme.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                      {e.requestCount}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: theme.accent, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {e.totalAmount.toLocaleString()} {e.currencyCode}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

interface RequestDetailBodyProps {
  request: RechargeRequest
  theme: ReturnType<typeof useTheme>['theme']
  isRequester: boolean
  isFulfillTab: boolean
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
  isFulfillTab,
  fulfillFile,
  fulfillPreview,
  onPickFile,
  onFulfill,
  uploadingPhoto,
  onConfirm,
  confirming,
  onCancel,
}: RequestDetailBodyProps) {
  const statusSteps = ['pending', 'fulfilled', 'confirmed']
  const isCancelled = r.status === 'cancelled'
  // Cancel only ever fires from 'pending' (see cancelRechargeRequest's WHERE
  // clause), so that's always the step a cancelled request stopped at.
  // Passing the literal 'cancelled' string here wouldn't match any entry in
  // statusSteps, leaving every dot rendered as untouched instead of showing
  // where it actually stopped.
  const displayStep = isCancelled ? 'pending' : r.status

  const events: TimelineEvent[] = [
    {
      id: 'created',
      title: 'Request submitted',
      description: `${r.bundleName ?? 'Bundle'} for ${r.phoneNumber}`,
      user: r.requestedByEmail ?? undefined,
      timestamp: r.createdAt,
    },
  ]
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
  if (isCancelled) {
    // There's no dedicated cancelledAt column — updatedAt is the closest
    // available timestamp, since cancelling is the only thing that touches
    // a pending request's updated_at besides this.
    events.push({
      // Requests rejected under the old approval workflow were migrated to
      // 'cancelled' too (see migration 193), so this can't claim it was
      // always the requester who cancelled.
      id: 'cancelled',
      title: 'Cancelled',
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
          rejected={isCancelled}
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
      {isFulfillTab && r.status === 'pending' && (
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
