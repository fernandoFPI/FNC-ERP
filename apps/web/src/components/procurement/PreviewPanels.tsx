import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { PO_LIFECYCLE_QUERY, VENDOR_QUERY } from '../../graphql/procurement'
import { REQUISITION_QUERY } from '../../graphql/requisitions'
import { ENTITY_ATTACHMENTS_QUERY } from '../../graphql/hr'
import { usePermission } from '../../hooks/usePermission'
import {
  FooterButton,
  Icon,
  InfoCard,
  KeyValue,
  PanelFooter,
  PanelHeader,
  PanelMessage,
  PanelTabs,
  Party,
  PersonCell,
  StatPair,
  WorkflowStepper,
  formatDateTime,
  formatLongDate,
} from './ListKit'
import {
  PO_STAGES,
  REQUISITION_STAGES,
  poStage,
  requisitionStage,
} from '../../lib/procurementStages'
import type {
  EntityAttachmentsQuery,
  EntityAttachmentsQueryVariables,
  PurchaseOrderLifecycleQuery,
  PurchaseOrderLifecycleQueryVariables,
  RequisitionQuery,
  RequisitionQueryVariables,
  VendorQuery,
  VendorQueryVariables,
} from '../../graphql/generated'

// Right-hand preview shown when a row is clicked on the Purchase Orders /
// Requisitions lists. Reads the same detail queries as the full pages, so
// field-level restrictions (viewerRestricted etc.) apply identically.

interface HistoryEntry {
  id: string
  title: string
  who: string
  notes: string | null
  at: string
}

function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  const { theme } = useTheme()
  if (entries.length === 0) return <PanelMessage>No approval history yet.</PanelMessage>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {entries.map((e, i) => (
        <div key={e.id} style={{ display: 'flex', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                marginTop: '5px',
                borderRadius: '50%',
                background: theme.accent,
                flexShrink: 0,
              }}
            />
            {i < entries.length - 1 && (
              <span style={{ flex: 1, width: '2px', background: theme.border }} />
            )}
          </div>
          <div style={{ paddingBottom: '16px', minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
              {e.title}
            </div>
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>
              {e.who} · {formatDateTime(e.at)}
            </div>
            {e.notes && (
              <div
                style={{
                  marginTop: '4px',
                  fontSize: '12px',
                  color: theme.textSecondary,
                  overflowWrap: 'anywhere',
                }}
              >
                {e.notes}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function NotesBox({ notes, onEdit }: { notes?: string | null; onEdit?: () => void }) {
  const { theme } = useTheme()
  return (
    <div
      style={{
        marginTop: '14px',
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          fontSize: '13px',
          fontWeight: 600,
          color: theme.textPrimary,
        }}
      >
        Notes
        {onEdit && (
          <button
            type="button"
            aria-label="Edit notes"
            title="Edit on the full page"
            onClick={onEdit}
            style={{
              border: 'none',
              background: 'none',
              color: theme.textMuted,
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <Icon name="pencil" size={14} />
          </button>
        )}
      </div>
      <div
        style={{
          padding: '10px 14px 14px',
          background: theme.bgSurfaceHover,
          fontSize: '13px',
          color: notes ? theme.textSecondary : theme.textMuted,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          minHeight: '52px',
        }}
      >
        {notes ?? 'No notes.'}
      </div>
    </div>
  )
}

function ItemList({
  items,
}: {
  items: { id: string; name: string; qty: string; received?: string | null }[]
}) {
  const { theme } = useTheme()
  if (items.length === 0) return <PanelMessage>No items on this document.</PanelMessage>
  return (
    <div>
      {items.map((l) => (
        <div
          key={l.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '10px 0',
            borderBottom: `1px solid ${theme.border}`,
            fontSize: '13px',
          }}
        >
          <span style={{ color: theme.textPrimary, overflowWrap: 'anywhere' }}>{l.name}</span>
          <span style={{ color: theme.textSecondary, whiteSpace: 'nowrap', textAlign: 'right' }}>
            {l.qty}
            {l.received != null && (
              <span style={{ display: 'block', fontSize: '11px', color: theme.textMuted }}>
                received {l.received}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function num(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

function money(v: string | number, cur: string): string {
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (Number.isNaN(n)) return '—'
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`
}

// ── Purchase Order ───────────────────────────────────────────────────────────

export interface POPanelRow {
  id: string
  po_number: string
  status: string
  statusLabel: string
  statusVariant: BadgeVariant
  requisitionNumber?: string | null
  organizerName?: string | null
  created_at: string
}

export function POPreviewPanel({
  row,
  canSeeTotals,
  onClose,
}: {
  row: POPanelRow
  // Same server-computed flag the list uses — totals stay hidden from anyone the list hides them from.
  canSeeTotals: boolean
  onClose: () => void
}) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { can } = usePermission()
  const [tab, setTab] = useState('Details')

  const { data, loading, error } = useQuery<
    PurchaseOrderLifecycleQuery,
    PurchaseOrderLifecycleQueryVariables
  >(PO_LIFECYCLE_QUERY, { variables: { id: row.id }, fetchPolicy: 'cache-and-network' })
  const po = data?.purchaseOrder ?? null

  const { data: vData } = useQuery<VendorQuery, VendorQueryVariables>(VENDOR_QUERY, {
    variables: { id: po?.vendor_id ?? '' },
    skip: !po?.vendor_id,
    errorPolicy: 'ignore',
  })
  const vendor = vData?.vendor ?? null

  const { data: aData } = useQuery<EntityAttachmentsQuery, EntityAttachmentsQueryVariables>(
    ENTITY_ATTACHMENTS_QUERY,
    {
      variables: { entityType: 'purchase_order', entityId: row.id },
      errorPolicy: 'ignore',
      fetchPolicy: 'cache-and-network',
    },
  )
  const attachments = aData?.entityAttachments ?? []

  const stage = poStage(po?.status ?? row.status)
  const restricted = po?.viewerRestricted ?? false
  const openFull = () => {
    navigate(`/procurement/purchase-orders/${row.id}`)
  }
  const canEdit = can('procurement.po.edit', 'edit')

  const totalText = (() => {
    if (!canSeeTotals || restricted || !po) return null
    if (po.currencyTotals.length > 0) {
      return po.currencyTotals.map((c) => money(c.subtotal, c.currency_code)).join(' + ')
    }
    return money(po.total_amount, po.currency_code)
  })()

  const tabs = ['Details', 'Items', 'Approval History', `Attachments (${attachments.length})`]

  return (
    <>
      <PanelHeader
        title={row.po_number}
        badge={<Badge variant={row.statusVariant}>{row.statusLabel}</Badge>}
        sub={
          <>
            {row.requisitionNumber ? `${row.requisitionNumber} • ` : ''}Created{' '}
            {formatLongDate(row.created_at)}
          </>
        }
        onClose={onClose}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {error && !po && <PanelMessage>Couldn’t load this PO. Try again.</PanelMessage>}
        <InfoCard>
          <Party
            icon="building"
            name={po?.vendor_name ?? (loading ? 'Loading…' : 'No vendor yet')}
            role="Vendor"
            lines={[
              ...(vendor?.contact_phone
                ? [{ icon: 'phone' as const, text: vendor.contact_phone }]
                : []),
              ...(vendor?.contact_email
                ? [{ icon: 'mail' as const, text: vendor.contact_email }]
                : []),
            ]}
          />
          <StatPair
            left={{
              label: 'Total Amount',
              value: totalText ?? <span style={{ color: theme.textMuted }}>Restricted</span>,
            }}
            right={{
              label: 'Project',
              value: po?.projectCode ? (
                <>
                  {po.projectCode}
                  {po.projectName && (
                    <span
                      style={{
                        display: 'block',
                        fontWeight: 400,
                        fontSize: '12px',
                        color: theme.textSecondary,
                      }}
                    >
                      {po.projectName}
                    </span>
                  )}
                </>
              ) : (
                '—'
              ),
            }}
          />
        </InfoCard>

        <WorkflowStepper steps={PO_STAGES} current={stage.index ?? 0} complete={stage.complete} />

        <PanelTabs tabs={tabs} active={tab} onChange={setTab} />
        <div style={{ padding: '10px 22px 20px' }}>
          {tab === 'Details' && (
            <>
              <KeyValue label="PO Number">{row.po_number}</KeyValue>
              <KeyValue label="Reference">
                {row.requisitionNumber ? (
                  <span style={{ color: theme.accent }}>{row.requisitionNumber}</span>
                ) : (
                  '—'
                )}
              </KeyValue>
              <KeyValue label="Vendor">{po?.vendor_name ?? '—'}</KeyValue>
              <KeyValue label="Project">
                {po?.projectCode
                  ? [po.projectCode, po.projectName].filter(Boolean).join(' — ')
                  : '—'}
              </KeyValue>
              <KeyValue label="Organizer">
                <PersonCell name={row.organizerName} />
              </KeyValue>
              <KeyValue label="Buyer">
                {po?.buyerNames && po.buyerNames.length > 0
                  ? po.buyerNames.join(', ')
                  : (po?.assigned_buyer_name ?? '—')}
              </KeyValue>
              <KeyValue label="Created At">{formatDateTime(row.created_at)}</KeyValue>
              <KeyValue label="Expected Delivery">
                {formatLongDate(po?.expected_delivery_date)}
              </KeyValue>
              <KeyValue label="Currency">{po?.currency_code ?? '—'}</KeyValue>
              <NotesBox notes={po?.notes} onEdit={canEdit ? openFull : undefined} />
            </>
          )}
          {tab === 'Items' &&
            (restricted ? (
              <PanelMessage>
                Item details are limited to people involved at this stage.
              </PanelMessage>
            ) : (
              <ItemList
                items={(po?.lines ?? []).map((l) => ({
                  id: l.id,
                  name: l.product_name ?? l.description ?? 'Item',
                  qty: `${num(l.qty)} ${l.uom ?? ''}`.trim(),
                  received: l.qty_received != null ? num(l.qty_received) : null,
                }))}
              />
            ))}
          {tab === 'Approval History' && (
            <HistoryList
              entries={(po?.approval_log ?? []).map((a) => ({
                id: a.id,
                title: a.action,
                who: a.user_email ?? '—',
                notes: a.notes ?? null,
                at: a.created_at,
              }))}
            />
          )}
          {tab.startsWith('Attachments') &&
            (attachments.length === 0 ? (
              <PanelMessage>No attachments.</PanelMessage>
            ) : (
              <div>
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 0',
                      borderBottom: `1px solid ${theme.border}`,
                      fontSize: '13px',
                      color: theme.textPrimary,
                    }}
                  >
                    <span style={{ color: theme.textMuted, display: 'flex' }}>
                      <Icon name="doc" size={16} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                      {a.label ?? a.file.originalFilename}
                    </span>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>
                      {formatLongDate(a.createdAt)}
                    </span>
                  </div>
                ))}
                <PanelMessage>Open the full page to view or download files.</PanelMessage>
              </div>
            ))}
        </div>
      </div>
      <PanelFooter>
        <FooterButton icon="x" onClick={onClose}>
          Close
        </FooterButton>
        <FooterButton primary icon={canEdit ? 'pencil' : 'external'} onClick={openFull}>
          {canEdit ? 'Edit PO' : 'Open PO'}
        </FooterButton>
      </PanelFooter>
    </>
  )
}

// ── Requisition ──────────────────────────────────────────────────────────────

export interface RequisitionPanelRow {
  id: string
  requisition_number: string
  status: string
  statusLabel: string
  statusVariant: BadgeVariant
  organizerName?: string | null
  created_at: string
}

export function RequisitionPreviewPanel({
  row,
  onClose,
}: {
  row: RequisitionPanelRow
  onClose: () => void
}) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { can } = usePermission()
  const [tab, setTab] = useState('Details')

  const { data, loading, error } = useQuery<RequisitionQuery, RequisitionQueryVariables>(
    REQUISITION_QUERY,
    { variables: { id: row.id }, fetchPolicy: 'cache-and-network' },
  )
  const req = data?.requisition ?? null
  const stage = requisitionStage(req?.status ?? row.status)
  const openFull = () => {
    navigate(`/procurement/requisitions/${row.id}`)
  }
  const canEdit = can('procurement.po.edit', 'edit')

  const totalText =
    req && req.currencyTotals.length > 0
      ? req.currencyTotals.map((c) => money(c.subtotal, c.currency_code)).join(' + ')
      : '—'

  return (
    <>
      <PanelHeader
        title={row.requisition_number}
        badge={<Badge variant={row.statusVariant}>{row.statusLabel}</Badge>}
        sub={<>Created {formatLongDate(row.created_at)}</>}
        onClose={onClose}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {error && !req && <PanelMessage>Couldn’t load this requisition. Try again.</PanelMessage>}
        <InfoCard>
          <Party
            icon="user"
            name={row.organizerName ?? (loading ? 'Loading…' : 'Unknown')}
            role="Organizer"
            lines={req?.branch_name ? [{ icon: 'building', text: req.branch_name }] : []}
          />
          <StatPair
            left={{ label: 'Total Amount', value: totalText }}
            right={{
              label: 'Project',
              value: req?.projectCode ? (
                <>
                  {req.projectCode}
                  {req.projectName && (
                    <span
                      style={{
                        display: 'block',
                        fontWeight: 400,
                        fontSize: '12px',
                        color: theme.textSecondary,
                      }}
                    >
                      {req.projectName}
                    </span>
                  )}
                </>
              ) : (
                '—'
              ),
            }}
          />
        </InfoCard>

        <WorkflowStepper
          steps={REQUISITION_STAGES}
          current={stage.index ?? 0}
          complete={stage.complete}
        />

        <PanelTabs tabs={['Details', 'Items', 'Approval History']} active={tab} onChange={setTab} />
        <div style={{ padding: '10px 22px 20px' }}>
          {tab === 'Details' && (
            <>
              <KeyValue label="Requisition">{row.requisition_number}</KeyValue>
              <KeyValue label="Purpose">{req?.purpose ?? '—'}</KeyValue>
              <KeyValue label="Project">
                {req?.projectCode
                  ? [req.projectCode, req.projectName].filter(Boolean).join(' — ')
                  : '—'}
              </KeyValue>
              <KeyValue label="Branch">{req?.branch_name ?? '—'}</KeyValue>
              <KeyValue label="Organizer">
                <PersonCell name={row.organizerName} />
              </KeyValue>
              <KeyValue label="Priority">{req?.priority ?? '—'}</KeyValue>
              <KeyValue label="Created At">{formatDateTime(row.created_at)}</KeyValue>
              <KeyValue label="Expected Delivery">
                {formatLongDate(req?.expected_delivery_date)}
              </KeyValue>
              <KeyValue label="Deliver To">{req?.delivery_destination ?? '—'}</KeyValue>
              <NotesBox notes={req?.notes} onEdit={canEdit ? openFull : undefined} />
            </>
          )}
          {tab === 'Items' && (
            <ItemList
              items={(req?.lines ?? []).map((l) => ({
                id: l.id,
                name: l.product_name ?? l.description ?? 'Item',
                qty: `${num(l.qty)} ${l.uom ?? ''}`.trim(),
                received: l.qty_received != null ? num(l.qty_received) : null,
              }))}
            />
          )}
          {tab === 'Approval History' && (
            <HistoryList
              entries={(req?.approval_log ?? []).map((a) => ({
                id: a.id,
                title: a.action,
                who: [a.actor_name, a.actor_position].filter(Boolean).join(' · ') || '—',
                notes: a.notes ?? null,
                at: a.created_at,
              }))}
            />
          )}
        </div>
      </div>
      <PanelFooter>
        <FooterButton icon="x" onClick={onClose}>
          Close
        </FooterButton>
        <FooterButton primary icon={canEdit ? 'pencil' : 'external'} onClick={openFull}>
          {canEdit ? 'Edit Requisition' : 'Open Requisition'}
        </FooterButton>
      </PanelFooter>
    </>
  )
}
