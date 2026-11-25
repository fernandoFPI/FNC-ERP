import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { enumLabel, useIsRtl } from '../../i18n'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import {
  getRequisitionStatusLabel,
  getRequisitionStatusVariant,
} from '../../lib/requisition-constants'
import {
  REQUISITION_STATUS_ORDER,
  effectiveSelection,
  filterByStatus,
  statusOptions,
  toggleStatus,
} from '../../lib/projectProcurementFilter'
import { StatusFilterChips } from './StatusFilterChips'

// The Requisitions section of a project's Procurement tab: every requisition filed for the project, newest first, drawn like the
// Purchase Orders section beside it (a count and a "New Requisition" button above, a table on a desktop, cards on a phone, a click
// opens the requisition). It only draws: the page asks for the list (the `requisitions(projectId)` query, company and branch scoped
// like the Requisitions page) and says whether the caller may create one.

export interface ProjectRequisitionRow {
  id: string
  requisition_number?: string | null
  status: string
  purpose?: string | null
  organizerName?: string | null
  created_at?: string | null
}

interface Props {
  requisitions: ProjectRequisitionRow[]
  /** Whether the caller may start a new requisition for this project (the same right as the Purchase Orders section's button). */
  canCreate: boolean
  onNew: () => void
  onOpen: (id: string) => void
  isPhone: boolean
  /** The statuses ticked in the filter (none = show everything); the page keeps them so they survive opening a requisition and coming back. */
  selectedStatuses: string[]
  onSelectedStatusesChange: (next: string[]) => void
}

// Dates are shown the way the rest of the project page shows them (day, short month, year).
function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// An empty or missing text is a dash (an empty string must fall back too, which `??` would not do).
function orDash(s: string | null | undefined): string {
  if (s) return s
  return '—'
}

const COLUMNS = '170px minmax(0, 1fr) minmax(0, 1fr) 120px 150px 32px'

export function ProjectRequisitionsList({
  requisitions,
  canCreate,
  onNew,
  onOpen,
  isPhone,
  selectedStatuses,
  onSelectedStatusesChange,
}: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  // One chip per status that occurs (rejected included), with its count. A remembered status that no row carries any more is dropped
  // from the selection, so an old filter can never hide every row.
  const options = statusOptions(
    requisitions,
    (r) => r.status,
    REQUISITION_STATUS_ORDER,
    getRequisitionStatusLabel,
  )
  const selected = effectiveSelection(selectedStatuses, options)
  const shown = filterByStatus(requisitions, (r) => r.status, selected)
  // A chevron drawn as an SVG is not mirrored by the browser in a right-to-left page, so it points the other way by hand.
  const rtl = useIsRtl()

  // A row opens its requisition with a click or, from the keyboard, Enter or Space.
  const openProps = (r: ProjectRequisitionRow) => ({
    role: 'link' as const,
    tabIndex: 0,
    onClick: () => {
      onOpen(r.id)
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen(r.id)
      }
    },
  })
  const numberOf = (r: ProjectRequisitionRow) => orDash(r.requisition_number)
  // The purpose is named the way the Requisitions page names it (req.purpose.*: Project Supply, Direct Supply...); a value with no label shows as it is.
  const purposeOf = (r: ProjectRequisitionRow) =>
    r.purpose ? t(`req.purpose.${r.purpose}`, { defaultValue: enumLabel(r.purpose) }) : ''

  return (
    <div data-testid="project-requisitions">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <span style={{ fontSize: '13px', color: theme.textSecondary }}>
          {t('proj.detail.requisitionCount', { count: requisitions.length })}
          {selected.length > 0 && (
            <span data-testid="showing-of" style={{ marginInlineStart: '8px' }}>
              {t('proj.detail.showingOf', { shown: shown.length, total: requisitions.length })}
            </span>
          )}
        </span>
        {canCreate && (
          <Button variant="primary" size="sm" onClick={onNew}>
            {t('proj.detail.newRequisition')}
          </Button>
        )}
      </div>

      <StatusFilterChips
        options={options}
        selected={selected}
        total={requisitions.length}
        onToggle={(value) => {
          onSelectedStatusesChange(toggleStatus(selected, value))
        }}
        onClear={() => {
          onSelectedStatusesChange([])
        }}
      />

      {requisitions.length === 0 && (
        <div
          style={{
            color: theme.textSecondary,
            fontSize: '13px',
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
          {t('proj.detail.noRequisitionsForThisProject')}
        </div>
      )}

      {shown.length > 0 &&
        (isPhone ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {shown.map((r) => (
              <div
                key={r.id}
                data-testid="project-requisition-row"
                {...openProps(r)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  padding: '10px 14px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: theme.accent,
                      fontSize: '13px',
                    }}
                  >
                    {numberOf(r)}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                    {[purposeOf(r), r.organizerName].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                    {shortDate(r.created_at)}
                  </div>
                </div>
                <Badge variant={getRequisitionStatusVariant(r.status)}>
                  {getRequisitionStatusLabel(r.status)}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: COLUMNS,
                padding: '8px 16px',
                borderBottom: `1px solid ${theme.border}`,
                background: theme.bgCanvas,
              }}
            >
              {[
                t('proj.detail.requisitionNumber'),
                t('proj.detail.purpose'),
                t('req.list.organizer'),
                t('req.list.created'),
                t('proj.detail.status'),
                '',
              ].map((h, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {h}
                </div>
              ))}
            </div>
            {shown.map((r, i) => (
              <div
                key={r.id}
                data-testid="project-requisition-row"
                {...openProps(r)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: COLUMNS,
                  alignItems: 'center',
                  padding: '10px 16px',
                  borderBottom: i < shown.length - 1 ? `1px solid ${theme.border}` : 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.bgCanvas
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: theme.accent,
                  }}
                >
                  {numberOf(r)}
                </div>
                <div style={{ fontSize: '13px', color: theme.textPrimary }}>
                  {orDash(purposeOf(r))}
                </div>
                <div style={{ fontSize: '13px', color: theme.textPrimary }}>
                  {orDash(r.organizerName)}
                </div>
                <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                  {shortDate(r.created_at)}
                </div>
                <div>
                  <Badge variant={getRequisitionStatusVariant(r.status)}>
                    {getRequisitionStatusLabel(r.status)}
                  </Badge>
                </div>
                <div
                  aria-hidden="true"
                  style={{
                    color: theme.textMuted,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d={rtl ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}
