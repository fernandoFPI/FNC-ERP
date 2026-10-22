// One entry in a PO's Edit Request History: who asked and when, what exactly changed (by
// line name, not by id), why it is waiting, and what approving or rejecting it does.
// The review controls live here too, so the card is the whole story of a request.
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { enumLabel } from '../../i18n'
import { formatDateTime } from './ListKit'
import {
  describeEditChanges,
  formatEditNumber,
  formatEditValue,
  type CurrentLine,
} from '../../lib/poEditChanges'

export interface EditRequestView {
  id: string
  status: string
  changes: string
  request_notes?: string | null
  requested_by?: string | null
  requested_by_name?: string | null
  requested_by_email?: string | null
  reviewed_by?: string | null
  reviewed_by_name?: string | null
  reviewed_by_email?: string | null
  review_notes?: string | null
  reviewed_at?: string | null
  created_at: string
  auto_applied?: boolean | null
}

interface Props {
  request: EditRequestView
  /** The PO's lines as they are now: names a bare line id recorded by an older request. */
  currentLines: CurrentLine[]
  /** Whatever is typed in the reason box goes along as the review note, as it always has. */
  onApprove: (requestId: string, reviewNotes?: string) => void
  onReject: (requestId: string, reason: string) => void
  approving?: boolean
  rejecting?: boolean
  /** Bold fill for the Approve button, matching the page's other primary actions. */
  primaryStyle?: CSSProperties
  /** What the request is on. Only changes the wording ("PO" or "requisition"). */
  kind?: 'po' | 'requisition'
  /** Show Approve / Reject on a pending request. The requisition page limits them to admins. */
  canReview?: boolean
  /** No side padding, for a list that already sits inside a padded card. */
  flush?: boolean
}

// Entries shown before the rest are folded behind "Show all": a request that adds 22
// lines would otherwise push the Approve button off the screen.
const COLLAPSED_ENTRIES = 6

const ENUM_FIELDS = new Set(['priority', 'delivery_destination'])

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

export function EditRequestCard({
  request: er,
  currentLines,
  onApprove,
  onReject,
  approving,
  rejecting,
  primaryStyle,
  kind = 'po',
  canReview = true,
  flush = false,
}: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [reason, setReason] = useState('')
  const [showAll, setShowAll] = useState(false)

  const summary = describeEditChanges(er.changes, currentLines)
  // The strings that name the PO have a `_requisition` variant; i18next picks it from `context`.
  const context = kind === 'requisition' ? 'requisition' : undefined
  const fieldLabel = (field: string) =>
    t(`po.editReq.field.${field}`, { defaultValue: field.replace(/_/g, ' ') })
  const person = (name?: string | null, email?: string | null) =>
    name ?? email ?? t('po.editReq.unknownUser')

  const muted: CSSProperties = { color: theme.textMuted }
  // priority and delivery destination are stored as codes ('emergency', 'jobsite')
  const displayValue = (field: string, value: unknown) =>
    ENUM_FIELDS.has(field) && typeof value === 'string' && value !== ''
      ? enumLabel(value)
      : formatEditValue(field, value)
  const diffRow = (field: string, from: unknown, to: unknown, key: string): ReactNode => (
    <div
      key={key}
      style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}
    >
      <span style={{ ...muted, minWidth: '120px' }}>{fieldLabel(field)}</span>
      <bdi style={{ color: theme.danger, textDecoration: 'line-through' }}>
        {displayValue(field, from)}
      </bdi>
      <span style={muted}>→</span>
      <bdi style={{ color: theme.accent }}>{displayValue(field, to)}</bdi>
    </div>
  )
  const detail = (
    qty: number | null,
    uom: string | null,
    price: number | null,
    currency: string | null,
  ) =>
    [
      qty !== null ? `${formatEditNumber(qty)}${uom ? ` ${uom}` : ''}` : null,
      price !== null
        ? t('po.editReq.each', {
            price: `${formatEditNumber(price)}${currency ? ` ${currency}` : ''}`,
          })
        : null,
    ]
      .filter(Boolean)
      .join(' · ')

  const entries: { key: string; node: ReactNode }[] = [
    ...summary.header.map((h) => ({
      key: `h-${h.field}`,
      node: diffRow(h.field, h.from, h.to, `h-${h.field}`),
    })),
    ...summary.edited.map((line, i) => ({
      key: `e-${line.lineId}-${i}`,
      node: (
        <div
          key={`e-${line.lineId}-${i}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}
        >
          <span style={{ fontWeight: 600, color: theme.textPrimary }}>
            {line.name ? <bdi>{line.name}</bdi> : t('po.editReq.lineNotOnPo', { context })}
          </span>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              paddingInlineStart: '12px',
            }}
          >
            {line.changes.map((c, j) =>
              diffRow(c.field, c.from, c.to, `e-${line.lineId}-${i}-${j}`),
            )}
          </div>
        </div>
      ),
    })),
    ...summary.added.map((line, i) => ({
      key: `a-${i}`,
      node: (
        <div key={`a-${i}`}>
          <span style={{ color: theme.accent, fontWeight: 600 }}>
            + {line.description ? <bdi>{line.description}</bdi> : t('po.editReq.newLine')}
          </span>{' '}
          <span style={muted}>{detail(line.qty, line.uom, line.unitPrice, line.currency)}</span>
        </div>
      ),
    })),
    ...summary.removed.map((line, i) => ({
      key: `r-${line.lineId}-${i}`,
      node: (
        <div key={`r-${line.lineId}-${i}`}>
          <span style={{ color: theme.danger, fontWeight: 600 }}>
            − {line.name ? <bdi>{line.name}</bdi> : t('po.editReq.lineNotOnPo', { context })}
          </span>{' '}
          <span style={muted}>
            {line.name
              ? detail(line.qty, line.uom, line.unitPrice, line.currency)
              : t('po.editReq.nameNotRecorded')}
          </span>
        </div>
      ),
    })),
  ]
  const hiddenCount = Math.max(entries.length - COLLAPSED_ENTRIES, 0)
  const visibleEntries = showAll ? entries : entries.slice(0, COLLAPSED_ENTRIES)

  const reviewer = person(er.reviewed_by_name, er.reviewed_by_email)
  const reviewedByRequester =
    er.status !== 'pending' &&
    !er.auto_applied &&
    !!er.reviewed_by &&
    er.reviewed_by === er.requested_by
  const reviewedAt = er.reviewed_at ? ` · ${formatDateTime(er.reviewed_at)}` : ''

  const label = (key: string) => <span style={muted}>{t(key)}</span>

  return (
    <div
      style={
        flush
          ? { borderTop: `1px solid ${theme.border}`, padding: '14px 0' }
          : { borderBottom: `1px solid ${theme.border}22`, padding: '16px 20px' }
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '10px',
          flexWrap: 'wrap',
        }}
      >
        <Badge variant={STATUS_VARIANT[er.status] ?? 'warning'}>{enumLabel(er.status)}</Badge>
        <span style={{ fontSize: '13px', color: theme.textPrimary }}>
          {person(er.requested_by_name, er.requested_by_email)}
        </span>
        <span style={{ fontSize: '12px', ...muted }}>{formatDateTime(er.created_at)}</span>
        <span style={{ fontSize: '12px', ...muted, marginInlineStart: 'auto' }}>
          {t('po.detail.changesCount', { count: summary.total })}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content minmax(0, 1fr)',
          columnGap: '14px',
          rowGap: '6px',
          padding: '10px 12px',
          borderRadius: '8px',
          border: `1px solid ${theme.border}`,
          background: theme.bgCanvas,
          fontSize: '12px',
          color: theme.textSecondary,
        }}
      >
        {label('po.editReq.labelChanges')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {visibleEntries.length === 0 && <span style={muted}>{t('po.editReq.noDetail')}</span>}
          {visibleEntries.map((e) => e.node)}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowAll((v) => !v)
              }}
              style={{
                alignSelf: 'flex-start',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: theme.accent,
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {showAll
                ? t('po.editReq.showFewer')
                : t('po.editReq.showAll', { hidden: hiddenCount })}
            </button>
          )}
        </div>

        {er.request_notes && (
          <>
            {label('po.editReq.labelReason')}
            <span style={{ fontStyle: 'italic' }}>“{er.request_notes}”</span>
          </>
        )}

        {label('po.editReq.labelReview')}
        <div>
          {er.status === 'pending' && <span>{t('po.editReq.waitingForReview', { context })}</span>}
          {er.auto_applied && <span>{t('po.editReq.appliedAutomatically', { context })}</span>}
          {er.status === 'approved' && !er.auto_applied && (
            <span style={{ color: theme.success }}>
              {t('po.editReq.approvedBy', { name: reviewer })}
              {reviewedAt}
            </span>
          )}
          {er.status === 'rejected' && (
            <span style={{ color: theme.danger }}>
              {t('po.editReq.rejectedBy', { name: reviewer })}
              {reviewedAt}
            </span>
          )}
          {er.status !== 'pending' && !er.auto_applied && er.review_notes && (
            <div style={{ marginTop: '2px' }}>
              {er.status === 'rejected'
                ? t('po.editReq.rejectedReason', { reason: er.review_notes })
                : `“${er.review_notes}”`}
            </div>
          )}
          {reviewedByRequester && (
            <div style={{ marginTop: '2px', ...muted }}>{t('po.editReq.reviewedByRequester')}</div>
          )}
        </div>

        {er.status === 'pending' && (
          <>
            {label('po.editReq.labelIfApproved')}
            <span>
              {t('po.editReq.ifApproved', { context })}
              {summary.removed.length > 0 && ` ${t('po.editReq.ifApprovedRemoved')}`}
            </span>
            {label('po.editReq.labelIfRejected')}
            <span>{t('po.editReq.ifRejected', { context })}</span>
          </>
        )}
      </div>

      {er.status === 'pending' && canReview && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            marginTop: '12px',
          }}
        >
          <Button
            size="sm"
            variant="primary"
            style={primaryStyle}
            loading={approving}
            onClick={() => {
              onApprove(er.id, reason.trim() || undefined)
            }}
          >
            {t('po.detail.approve')}
          </Button>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
              }}
              placeholder={t('po.detail.rejectionReasonRequired')}
              style={{
                width: '240px',
                padding: '7px 10px',
                borderRadius: '6px',
                border: `1px solid ${theme.borderInput}`,
                background: theme.bgCanvas,
                color: theme.textPrimary,
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <Button
              size="sm"
              variant="danger"
              loading={rejecting}
              disabled={!reason.trim()}
              onClick={() => {
                onReject(er.id, reason)
              }}
            >
              {t('po.detail.reject')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
