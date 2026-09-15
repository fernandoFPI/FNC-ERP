import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  MATERIAL_RETURNS_QUERY,
  RETURNABLE_MATERIAL_ISSUE_LINES_QUERY,
  CREATE_MATERIAL_RETURN,
  PROJECTS_QUERY,
} from '../../../graphql/projects'
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
  issueLineId: string
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
  projectId: string
  projectCode: string | null
  projectName: string | null
  notes: string | null
  createdByName: string | null
  createdAt: string
  lines: MRLine[]
}
interface ReturnableLine {
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

const fmtAmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function MaterialReturnsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [projectFilter, setProjectFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // New return modal
  const [showModal, setShowModal] = useState(false)
  const [formProjectId, setFormProjectId] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [returnQty, setReturnQty] = useState<Record<string, string>>({})
  const [returnLocation, setReturnLocation] = useState<Record<string, string>>({})

  const { data, loading, refetch } = useQuery(MATERIAL_RETURNS_QUERY, {
    variables: projectFilter ? { projectId: projectFilter } : {},
    fetchPolicy: 'cache-and-network',
  })
  const { data: projectsData } = useQuery(PROJECTS_QUERY, {
    variables: { limit: 200, includeAll: true },
    fetchPolicy: 'cache-and-network',
  })
  const { data: returnableData, loading: loadingReturnable } = useQuery(
    RETURNABLE_MATERIAL_ISSUE_LINES_QUERY,
    {
      variables: { projectId: formProjectId },
      skip: !formProjectId,
      fetchPolicy: 'cache-and-network',
    },
  )
  const { data: locationsData } = useQuery(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })

  const returns = (data?.materialReturns ?? []) as MR[]
  const projects = (projectsData?.projects?.data ?? []) as { id: string; code: string; name: string }[]
  const returnableLines = (returnableData?.returnableMaterialIssueLines ?? []) as ReturnableLine[]
  const locations = ((locationsData?.stockLocations ?? []) as { id: string; name: string; type: string }[]).filter(
    (l) => !['virtual_in', 'virtual_out'].includes(l.type),
  )

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))
  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name }))

  const [createReturn, { loading: creating }] = useMutation(CREATE_MATERIAL_RETURN)

  function resetModal() {
    setShowModal(false)
    setFormProjectId('')
    setFormNotes('')
    setReturnQty({})
    setReturnLocation({})
  }

  const pendingLines = returnableLines
    .map((l) => ({ line: l, qty: parseFloat(returnQty[l.issueLineId] ?? '0') || 0 }))
    .filter((p) => p.qty > 0)
  const pendingTotal = pendingLines.reduce((s, p) => s + p.qty * p.line.unitCost, 0)
  const canSubmit =
    pendingLines.length > 0 && pendingLines.every((p) => !!returnLocation[p.line.issueLineId])

  async function handleCreate() {
    if (!canSubmit) return
    try {
      await createReturn({
        variables: {
          input: {
            projectId: formProjectId,
            notes: formNotes || null,
            lines: pendingLines.map((p) => ({
              issueLineId: p.line.issueLineId,
              toLocationId: returnLocation[p.line.issueLineId],
              qtyReturned: p.qty,
            })),
          },
        },
      })
      addToast({ type: 'success', message: `Material return created with ${pendingLines.length} item(s)` })
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
        subtitle="Bring unused, already-issued project material back into inventory"
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
          <Select
            label="Project"
            value={projectFilter}
            options={projectOptions}
            placeholder="All Projects"
            onChange={(e) => setProjectFilter(e.target.value)}
          />
        </div>
        {projectFilter && (
          <Button variant="ghost" size="sm" onClick={() => setProjectFilter('')}>
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
          message="Record unused material coming back from a project into inventory."
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
                    {r.projectCode ? (
                      <>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>
                          {r.projectCode}
                        </span>
                        {r.projectName && (
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
                            {r.projectName}
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '13px', color: theme.textMuted }}>—</span>
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
        description="Pick the project, then choose how much of each issued item is coming back and where it's going."
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
              {pendingLines.length > 0 ? ` (${pendingLines.length} item${pendingLines.length > 1 ? 's' : ''})` : ''}
            </Button>
          </>
        }
      >
        <div style={{ marginBottom: '14px' }}>
          <SearchableSelect
            label="Project"
            value={formProjectId}
            onChange={(val) => {
              setFormProjectId(val)
              setReturnQty({})
              setReturnLocation({})
            }}
            options={projectOptions}
            placeholder="Search project…"
          />
        </div>

        {formProjectId && (
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
            ) : returnableLines.length === 0 ? (
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                No returnable items — this project has no issued Store Out lines with anything still
                outstanding.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {returnableLines.map((l) => (
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
              </div>
            )}
            {pendingLines.length > 0 && (
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
