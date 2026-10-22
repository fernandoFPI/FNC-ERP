// One entry in a PO's (or requisition's) Edit Request History: who asked and when, the reason
// they gave, exactly what changed on which line (index, name, details, how far a price or
// quantity moved), what it does to the totals, and who reviewed it.
// The review controls live here too, so the card is the whole story of a request.
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { enumLabel } from '../../i18n'
import { formatDateTime } from './ListKit'
import { PO_EDIT_REQUEST_IMPACT_QUERY } from '../../graphql/procurement'
import type {
  PoEditRequestImpactQuery,
  PoEditRequestImpactQueryVariables,
} from '../../graphql/generated'
import {
  describeEditChanges,
  formatEditNumber,
  formatEditValue,
  toImpactView,
  type CurrentLine,
  type LineDetails,
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
  /** The PO's lines as they are now: names (and indexes) a request recorded without them. */
  currentLines: CurrentLine[]
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

// Entries shown before the rest are folded behind "Show more": a request that adds 22
// lines would otherwise push the Approve button off the screen.
const COLLAPSED_ENTRIES = 6

// priority and delivery destination are stored as codes ('emergency', 'jobsite')
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

  // A pending request's effect on the totals is worked out by the server (the real approval
  // logic, rolled back) and only for reviewers; a reviewed one carries what was recorded.
  const pending = er.status === 'pending'
  const { data: impactData, loading: impactLoading } = useQuery<
    PoEditRequestImpactQuery,
    PoEditRequestImpactQueryVariables
  >(PO_EDIT_REQUEST_IMPACT_QUERY, {
    variables: { requestId: er.id },
    skip: !pending,
    fetchPolicy: 'network-only',
  })
  const impact = pending ? toImpactView(impactData?.poEditRequestImpact) : summary.impact

  // The strings that name the PO have a `_requisition` variant; i18next picks it from `context`.
  const context = kind === 'requisition' ? 'requisition' : undefined
  const fieldLabel = (field: string) =>
    t(`po.editReq.field.${field}`, { defaultValue: field.replace(/_/g, ' ') })
  const person = (name?: string | null, email?: string | null) =>
    name ?? email ?? t('po.editReq.unknownUser')
  const lineName = (name: string | null) =>
    name ? <bdi>{name}</bdi> : t('po.editReq.lineNotOnPo', { context })

  const muted: CSSProperties = { color: theme.textMuted }
  const displayValue = (field: string, value: unknown) =>
    ENUM_FIELDS.has(field) && typeof value === 'string' && value !== ''
      ? enumLabel(value)
      : formatEditValue(field, value)
  const money = (n: number, currency?: string | null) =>
    `${formatEditNumber(n)}${currency ? ` ${currency}` : ''}`
  const pctBadge = (pct: number | null) =>
    pct === null || Math.abs(pct) < 0.05 ? null : (
      <Badge variant={pct > 0 ? 'warning' : 'neutral'}>
        {pct > 0 ? '+' : ''}
        {pct.toFixed(1)}%
      </Badge>
    )

  // "12 m × 4,500 IQD = 54,000 IQD": the line as it was.
  const lineDetails = (d: LineDetails | null): string => {
    if (!d) return ''
    const qty = d.qty !== null ? `${formatEditNumber(d.qty)}${d.uom ? ` ${d.uom}` : ''}` : ''
    const price = d.unitPrice !== null ? money(d.unitPrice, d.currency) : ''
    const total = d.total !== null && d.total !== 0 ? ` = ${money(d.total, d.currency)}` : ''
    return [qty, price].filter(Boolean).join(' × ') + total
  }

  const lineHeading = (n: number | null, name: string | null): ReactNode => (
    <>
      {n !== null && <span style={muted}>#{n} · </span>}
      {lineName(name)}
    </>
  )

  const diffRow = (
    field: string,
    from: unknown,
    to: unknown,
    pct: number | null,
    key: string,
  ): ReactNode => (
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
      {pctBadge(pct)}
    </div>
  )

  const lineTotalRow = (lineId: string): ReactNode => {
    const l = impact?.lines.find((x) => x.id === lineId)
    if (l?.before == null || l.after == null) return null
    return (
      <div
        key={`lt-${lineId}`}
        style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}
      >
        <span style={{ ...muted, minWidth: '120px' }}>{t('po.editReq.lineTotal')}</span>
        <bdi style={{ color: theme.danger, textDecoration: 'line-through' }}>
          {money(l.before, l.currency)}
        </bdi>
        <span style={muted}>→</span>
        <bdi style={{ color: theme.accent }}>{money(l.after, l.currency)}</bdi>
      </div>
    )
  }

  const entries: { key: string; node: ReactNode }[] = [
    ...summary.header.map((h) => ({
      key: `h-${h.field}`,
      node: diffRow(h.field, h.from, h.to, null, `h-${h.field}`),
    })),
    ...summary.edited.map((line, i) => ({
      key: `e-${line.lineId}-${i}`,
      node: (
        <div
          key={`e-${line.lineId}-${i}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}
        >
          <span style={{ fontWeight: 600, color: theme.textPrimary }}>
            {lineHeading(line.lineNumber, line.name)}
          </span>
          {line.details && <span style={muted}>{lineDetails(line.details)}</span>}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              paddingInlineStart: '12px',
            }}
          >
            {line.changes.map((c, j) =>
              diffRow(c.field, c.from, c.to, c.pct, `e-${line.lineId}-${i}-${j}`),
            )}
            {lineTotalRow(line.lineId)}
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
          <span style={muted}>
            {lineDetails({
              qty: line.qty,
              unitPrice: line.unitPrice,
              uom: line.uom,
              currency: line.currency,
              total: null,
            })}
          </span>
        </div>
      ),
    })),
    ...summary.removed.map((line, i) => ({
      key: `r-${line.lineId}-${i}`,
      node: (
        <div key={`r-${line.lineId}-${i}`}>
          <span style={{ color: theme.danger, fontWeight: 600 }}>
            − {lineHeading(line.lineNumber, line.name)}
          </span>{' '}
          <span style={muted}>
            {(line.name ?? line.details)
              ? lineDetails(line.details)
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
  const showImpactRow = impact !== null || (pending && impactLoading)

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
          rowGap: '8px',
          padding: '10px 12px',
          borderRadius: '8px',
          border: `1px solid ${theme.border}`,
          background: theme.bgCanvas,
          fontSize: '12px',
          color: theme.textSecondary,
        }}
      >
        {label('po.editReq.labelReason')}
        {er.request_notes ? (
          <span style={{ fontStyle: 'italic', color: theme.textPrimary }}>
            “{er.request_notes}”
          </span>
        ) : (
          <span style={muted}>{t('po.editReq.noReasonGiven')}</span>
        )}

        {label('po.editReq.labelChanges')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

        {showImpactRow && (
          <>
            {label('po.editReq.labelImpact')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {impact === null && <span style={muted}>{t('po.editReq.impactLoading')}</span>}
              {impact?.failure && (
                <span style={{ color: theme.danger }}>
                  {t('po.editReq.impactFailure', { message: impact.failure })}
                </span>
              )}
              {impact && !impact.failure && impact.totals.every((x) => x.delta === 0) && (
                <span style={muted}>{t('po.editReq.noTotalChange')}</span>
              )}
              {impact &&
                !impact.failure &&
                impact.totals
                  .filter((x) => x.delta !== 0)
                  .map((x) => (
                    <div
                      key={x.currency}
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'baseline',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ ...muted, minWidth: '120px' }}>
                        {t('po.editReq.totalLabel', { context })}
                      </span>
                      <bdi style={{ color: theme.danger, textDecoration: 'line-through' }}>
                        {money(x.before)}
                      </bdi>
                      <span style={muted}>→</span>
                      <bdi style={{ color: theme.textPrimary, fontWeight: 600 }}>
                        {money(x.after, x.currency)}
                      </bdi>
                      <bdi
                        style={{
                          color: x.delta > 0 ? theme.warning : theme.success,
                          fontWeight: 600,
                        }}
                      >
                        ({x.delta > 0 ? '+' : '−'}
                        {formatEditNumber(Math.abs(x.delta))})
                      </bdi>
                    </div>
                  ))}
            </div>
          </>
        )}

        {er.status !== 'pending' && (
          <>
            {label('po.editReq.labelReviewed')}
            <div>
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
              {!er.auto_applied && er.review_notes && (
                <div style={{ marginTop: '2px' }}>
                  {er.status === 'rejected'
                    ? t('po.editReq.rejectedReason', { reason: er.review_notes })
                    : `“${er.review_notes}”`}
                </div>
              )}
              {reviewedByRequester && (
                <div style={{ marginTop: '2px', ...muted }}>
                  {t('po.editReq.reviewedByRequester')}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {pending && canReview && (
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
