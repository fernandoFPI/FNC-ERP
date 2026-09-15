import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  MATERIAL_RETURNS_QUERY,
  RETURNABLE_MATERIAL_ISSUE_LINES_QUERY,
  RETURNABLE_DIRECT_DELIVERY_LINES_QUERY,
  CREATE_MATERIAL_RETURN,
} from '../../../graphql/projects'
import { PURCHASE_ORDERS_QUERY } from '../../../graphql/procurement'
import { STOCK_LOCATIONS_QUERY } from '../../../graphql/inventory'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Card } from '../../../components/ui/Card'
import { KPICard } from '../../../components/ui/KPICard'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'

interface MRLine {
  id: string
  issueLineId: string | null
  poLineId: string | null
  productId: string
  productName: string | null
  sku: string | null
  toLocationId: string
  toLocationName: string | null
  qtyReturned: number
  unitCost: number
  totalCost: number
}
interface MR {
  id: string
  returnNumber: string
  returnDate: string
  poId: string
  poNumber: string | null
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  notes: string | null
  createdByName: string | null
  createdAt: string
  lines: MRLine[]
}
interface ReturnableIssueLine {
  issueLineId: string
  issueId: string
  issueNumber: string
  issueDate: string
  productId: string
  productName: string | null
  sku: string | null
  uom: string | null
  qtyIssued: number
  qtyReturnedSoFar: number
  qtyReturnable: number
  unitCost: number
  fromLocationId: string | null
  fromLocationName: string | null
}
interface ReturnableDirectDeliveryLine {
  poLineId: string
  productId: string
  productName: string | null
  sku: string | null
  uom: string | null
  qtyReceived: number
  qtyReturnedSoFar: number
  qtyVendorReturned: number
  qtyReturnable: number
  unitCost: number
}
interface PO {
  id: string
  po_number: string
  vendor_name: string | null
  projectCode: string | null
  projectName: string | null
}

const fmtAmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function MaterialReturnsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [poFilter, setPoFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // New return modal
  const [showModal, setShowModal] = useState(false)
  const [formPoId, setFormPoId] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [returnQty, setReturnQty] = useState<Record<string, string>>({})
  const [returnLocation, setReturnLocation] = useState<Record<string, string>>({})

  const { data, loading, refetch } = useQuery(MATERIAL_RETURNS_QUERY, {
    variables: poFilter ? { poId: poFilter } : {},
    fetchPolicy: 'cache-and-network',
  })
  const { data: posData } = useQuery(PURCHASE_ORDERS_QUERY, {
    variables: {},
    fetchPolicy: 'cache-and-network',
  })
  const { data: returnableIssueData, loading: loadingReturnableIssue } = useQuery(
    RETURNABLE_MATERIAL_ISSUE_LINES_QUERY,
    { variables: { poId: formPoId }, skip: !formPoId, fetchPolicy: 'cache-and-network' },
  )
  const { data: returnableDirectData, loading: loadingReturnableDirect } = useQuery(
    RETURNABLE_DIRECT_DELIVERY_LINES_QUERY,
    { variables: { poId: formPoId }, skip: !formPoId, fetchPolicy: 'cache-and-network' },
  )
  const { data: locationsData } = useQuery(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })

  const returns = (data?.materialReturns ?? []) as MR[]
  const purchaseOrders = (posData?.purchaseOrders ?? []) as PO[]
  const returnableIssueLines = (returnableIssueData?.returnableMaterialIssueLines ?? []) as ReturnableIssueLine[]
  const returnableDirectLines = (returnableDirectData?.returnableDirectDeliveryLines ?? []) as ReturnableDirectDeliveryLine[]
  const loadingReturnable = loadingReturnableIssue || loadingReturnableDirect
  const locations = ((locationsData?.stockLocations ?? []) as { id: string; name: string; type: string }[]).filter(
    (l) => !['virtual_in', 'virtual_out'].includes(l.type),
  )

  const poOptions = purchaseOrders.map((po) => ({
    value: po.id,
    label: po.po_number,
    sublabel: [po.vendor_name, po.projectCode].filter(Boolean).join(' · ') || undefined,
  }))
  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name }))

  const [createReturn, { loading: creating }] = useMutation(CREATE_MATERIAL_RETURN)

  function resetModal() {
    setShowModal(false)
    setFormPoId('')
    setFormNotes('')
    setReturnQty({})
    setReturnLocation({})
  }

  const pendingIssueLines = returnableIssueLines
    .map((l) => ({ line: l, qty: parseFloat(returnQty[l.issueLineId] ?? '0') || 0 }))
    .filter((p) => p.qty > 0)
  const pendingDirectLines = returnableDirectLines
    .map((l) => ({ line: l, qty: parseFloat(returnQty[l.poLineId] ?? '0') || 0 }))
    .filter((p) => p.qty > 0)
  const pendingCount = pendingIssueLines.length + pendingDirectLines.length
  const pendingTotal =
    pendingIssueLines.reduce((s, p) => s + p.qty * p.line.unitCost, 0) +
    pendingDirectLines.reduce((s, p) => s + p.qty * p.line.unitCost, 0)
  const canSubmit =
    pendingCount > 0 &&
    pendingIssueLines.every((p) => !!returnLocation[p.line.issueLineId]) &&
    pendingDirectLines.every((p) => !!returnLocation[p.line.poLineId])

  async function handleCreate() {
    if (!canSubmit) return
    try {
      await createReturn({
        variables: {
          input: {
            poId: formPoId,
            notes: formNotes || null,
            lines: [
              ...pendingIssueLines.map((p) => ({
                issueLineId: p.line.issueLineId,
                toLocationId: returnLocation[p.line.issueLineId],
                qtyReturned: p.qty,
              })),
              ...pendingDirectLines.map((p) => ({
                poLineId: p.line.poLineId,
                toLocationId: returnLocation[p.line.poLineId],
                qtyReturned: p.qty,
              })),
            ],
          },
        },
      })
      addToast({ type: 'success', message: `Material return created with ${pendingCount} item(s)` })
      resetModal()
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Failed to create material return' })
    }
  }

  const totalValue = returns.reduce(
    (s, r) => s + r.lines.reduce((ls, l) => ls + l.totalCost, 0),
    0,
  )

  const IconArrow = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 14l-4-4 4-4M5 10h11a4 4 0 0 1 4 4v1" />
    </svg>
  )

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <PageHeader
        title="Material Returns"
        subtitle="Bring unused material — issued from stock or delivered direct to a jobsite — back into inventory"
        actions={
          <Button variant="primary" onClick={() => setShowModal(true)}>
            + New Material Return
          </Button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <KPICard label="Returns Recorded" value={returns.length} subtitle="all time" icon={IconArrow} iconColor="info" />
        <KPICard
          label="Value Returned"
          value={fmtAmt(totalValue)}
          subtitle="IQD, net back to stock"
          icon={IconArrow}
          iconColor="success"
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: '260px', flex: 1, maxWidth: '400px' }}>
          <SearchableSelect
            label="Purchase Order"
            value={poFilter}
            onChange={(val) => setPoFilter(val)}
            options={poOptions}
            placeholder="All Purchase Orders"
          />
        </div>
        {poFilter && (
          <Button variant="ghost" size="sm" onClick={() => setPoFilter('')}>
            Clear filter
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: '56px',
                borderRadius: '14px',
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
                animation: 'fnc-shimmer 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      ) : returns.length === 0 ? (
        <EmptyState
          title="No material returns yet"
          message="Record unused material — issued from stock or delivered direct to a jobsite — coming back into inventory."
          action={
            <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
              + New Material Return
            </Button>
          }
          icon={IconArrow}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {returns.map((r) => {
            const isExpanded = expandedId === r.id
            const total = r.lines.reduce((s, l) => s + l.totalCost, 0)
            return (
              <Card key={r.id} padding="none">
                <div
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr 140px 110px auto',
                    alignItems: 'center',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    gap: '12px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.tableRowHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: theme.accent }}>
                    {r.returnNumber}
                  </div>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>
                      {r.poNumber ?? '—'}
                    </span>
                    {r.projectCode && (
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
                        {r.projectCode}
                        {r.projectName ? ` · ${r.projectName}` : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>{r.returnDate.slice(0, 10)}</div>
                  <div style={{ fontWeight: 600, fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: theme.textPrimary }}>
                    {fmtAmt(total)} IQD
                  </div>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={theme.textMuted}
                    strokeWidth="2"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${theme.border}`, padding: '16px' }}>
                    {r.notes && (
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
                        {r.notes}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                      {r.lines.map((l) => (
                        <div
                          key={l.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '12px',
                            fontSize: '13px',
                            padding: '8px 0',
                            borderBottom: `1px solid ${theme.border}22`,
                          }}
                        >
                          <div>
                            <span style={{ color: theme.textPrimary, fontWeight: 500 }}>
                              {l.productName ?? l.productId}
                            </span>
                            {l.sku && <span style={{ color: theme.textMuted, marginLeft: '6px' }}>{l.sku}</span>}
                            <span style={{ color: theme.textMuted, marginLeft: '8px' }}>
                              → {l.toLocationName ?? 'location'}
                            </span>
                            <span
                              style={{
                                color: theme.textMuted,
                                marginLeft: '8px',
                                fontSize: '11px',
                                fontStyle: 'italic',
                              }}
                            >
                              ({l.poLineId ? 'direct delivery' : 'Store Out'})
                            </span>
                          </div>
                          <div style={{ fontVariantNumeric: 'tabular-nums', color: theme.textPrimary }}>
                            {l.qtyReturned} × {fmtAmt(l.unitCost)} = {fmtAmt(l.totalCost)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>
                      {r.createdByName ? `Recorded by ${r.createdByName}` : ''}
                    </span>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ── New Material Return modal ──────────────────────────────────── */}
      <Modal
        open={showModal}
        onClose={resetModal}
        closeOnBackdrop={false}
        title="New Material Return"
        description="Pick the purchase order, then choose how much of each item is coming back and where it's going."
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={resetModal}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!canSubmit || creating}
              loading={creating}
              onClick={() => void handleCreate()}
            >
              Create Return
              {pendingCount > 0 ? ` (${pendingCount} item${pendingCount > 1 ? 's' : ''})` : ''}
            </Button>
          </>
        }
      >
        <div style={{ marginBottom: '14px' }}>
          <SearchableSelect
            label="Purchase Order"
            value={formPoId}
            onChange={(val) => {
              setFormPoId(val)
              setReturnQty({})
              setReturnLocation({})
            }}
            options={poOptions}
            placeholder="Search purchase order…"
          />
        </div>

        {formPoId && (
          <div style={{ marginBottom: '14px' }}>
            <p
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '10px',
              }}
            >
              Returnable Items
            </p>
            {loadingReturnable ? (
              <div style={{ fontSize: '13px', color: theme.textMuted }}>Loading…</div>
            ) : returnableIssueLines.length === 0 && returnableDirectLines.length === 0 ? (
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                No returnable items — this PO has no issued Store Out lines and no direct-to-jobsite
                deliveries with anything still outstanding.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {returnableIssueLines.map((l) => (
                  <div
                    key={l.issueLineId}
                    style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}` }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
                      {l.productName ?? l.productId}
                      {l.sku && <span style={{ color: theme.textMuted, fontWeight: 400 }}> · {l.sku}</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>
                      Store Out {l.issueNumber} — issued {l.qtyIssued} {l.uom}, {l.qtyReturnable} still returnable
                      {l.fromLocationName ? ` (was consumed from ${l.fromLocationName})` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ width: '120px' }}>
                        <input
                          type="number"
                          min={0}
                          max={l.qtyReturnable}
                          step="any"
                          placeholder="0"
                          value={returnQty[l.issueLineId] ?? ''}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(l.qtyReturnable, parseFloat(e.target.value) || 0))
                            setReturnQty((prev) => ({ ...prev, [l.issueLineId]: String(v) }))
                          }}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '6px',
                            border: `1px solid ${theme.borderInput}`,
                            background: theme.bgCanvas,
                            color: theme.textPrimary,
                            fontSize: '13px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <Select
                          value={returnLocation[l.issueLineId] ?? ''}
                          onChange={(e) =>
                            setReturnLocation((prev) => ({ ...prev, [l.issueLineId]: e.target.value }))
                          }
                          options={locationOptions}
                          placeholder="Return to…"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {returnableDirectLines.map((l) => (
                  <div
                    key={l.poLineId}
                    style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}` }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
                      {l.productName ?? l.productId}
                      {l.sku && <span style={{ color: theme.textMuted, fontWeight: 400 }}> · {l.sku}</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>
                      Delivered direct to jobsite — received {l.qtyReceived} {l.uom}, {l.qtyReturnable} still
                      returnable
                      {l.qtyVendorReturned > 0 ? ` (${l.qtyVendorReturned} already sent back to vendor)` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ width: '120px' }}>
                        <input
                          type="number"
                          min={0}
                          max={l.qtyReturnable}
                          step="any"
                          placeholder="0"
                          value={returnQty[l.poLineId] ?? ''}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(l.qtyReturnable, parseFloat(e.target.value) || 0))
                            setReturnQty((prev) => ({ ...prev, [l.poLineId]: String(v) }))
                          }}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '6px',
                            border: `1px solid ${theme.borderInput}`,
                            background: theme.bgCanvas,
                            color: theme.textPrimary,
                            fontSize: '13px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <Select
                          value={returnLocation[l.poLineId] ?? ''}
                          onChange={(e) =>
                            setReturnLocation((prev) => ({ ...prev, [l.poLineId]: e.target.value }))
                          }
                          options={locationOptions}
                          placeholder="Return to…"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {pendingCount > 0 && (
              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '10px', textAlign: 'right' }}>
                Total: <strong style={{ color: theme.textPrimary }}>{fmtAmt(pendingTotal)} IQD</strong>
              </div>
            )}
          </div>
        )}

        <Textarea
          label="Notes"
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes…"
        />
      </Modal>
    </div>
  )
}
