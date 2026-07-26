import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../theme/ThemeContext'
import { Badge } from './Badge'
import { Input } from './Input'
import { Select } from './Select'
import { Button } from './Button'
import { AUDIT_LOG_QUERY } from '../../graphql/admin'
import { formatDate, formatRelativeTime } from '../../lib/format'

interface AuditLogViewerProps {
  filters?: {
    userId?: string
    companyId?: string
    tableName?: string
    action?: string
    fromDate?: string
    toDate?: string
  }
  embedded?: boolean
}

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'

function actionVariant(action: string): BadgeVariant {
  switch (action) {
    case 'CREATE':
      return 'success'
    case 'UPDATE':
      return 'info'
    case 'DELETE':
      return 'danger'
    case 'LOGIN':
      return 'neutral'
    case 'POST':
      return 'success'
    default:
      return 'neutral'
  }
}

function rowHighlight(
  action: string,
  theme: { warningBg: string; infoBg: string },
): string | undefined {
  if (action === 'BANK_DETAILS_REVEALED') return theme.warningBg
  if (action === 'INTERCO_PRICING_METHOD_CHANGED') return theme.infoBg
  return undefined
}

interface AuditRow {
  id: string
  createdAt: string
  userEmail: string
  companyName: string
  action: string
  tableName: string
  recordId: string
  ipAddress: string
  oldValues: string | null
  newValues: string | null
}

function parseJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

function DiffPanel({ old: oldRaw, next: nextRaw }: { old: string | null; next: string | null }) {
  const { theme } = useTheme()
  const oldObj = parseJson(oldRaw)
  const nextObj = parseJson(nextRaw)
  const allKeys = Array.from(new Set([...Object.keys(oldObj ?? {}), ...Object.keys(nextObj ?? {})]))
  if (allKeys.length === 0)
    return <span style={{ color: theme.textMuted, fontSize: 12 }}>No diff data</span>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          <th
            style={{
              textAlign: 'left' as const,
              color: theme.textMuted,
              padding: '2px 8px',
              fontWeight: 500,
            }}
          >
            Field
          </th>
          <th
            style={{
              textAlign: 'left' as const,
              color: theme.danger,
              padding: '2px 8px',
              fontWeight: 500,
            }}
          >
            Old
          </th>
          <th
            style={{
              textAlign: 'left' as const,
              color: theme.success,
              padding: '2px 8px',
              fontWeight: 500,
            }}
          >
            New
          </th>
        </tr>
      </thead>
      <tbody>
        {allKeys.map((k) => (
          <tr key={k}>
            <td style={{ padding: '2px 8px', color: theme.textSecondary }}>{k}</td>
            <td style={{ padding: '2px 8px', background: theme.dangerBg, color: theme.danger }}>
              {oldObj ? String(oldObj[k] ?? '') : '—'}
            </td>
            <td style={{ padding: '2px 8px', background: theme.successBg, color: theme.success }}>
              {nextObj ? String(nextObj[k] ?? '') : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'CREATE', label: 'CREATE' },
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'LOGIN', label: 'LOGIN' },
  { value: 'POST', label: 'POST' },
]

const PAGE_SIZE = 20

export function AuditLogViewer({
  filters: externalFilters,
  embedded = false,
}: AuditLogViewerProps) {
  const { theme } = useTheme()
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [localUserId, setLocalUserId] = useState(externalFilters?.userId ?? '')
  const [localTable, setLocalTable] = useState(externalFilters?.tableName ?? '')
  const [localAction, setLocalAction] = useState(externalFilters?.action ?? '')
  const [localFrom, setLocalFrom] = useState(externalFilters?.fromDate ?? '')
  const [localTo, setLocalTo] = useState(externalFilters?.toDate ?? '')

  const { data, loading, error } = useQuery(AUDIT_LOG_QUERY, {
    variables: {
      userId: localUserId || undefined,
      companyId: externalFilters?.companyId || undefined,
      tableName: localTable || undefined,
      action: localAction || undefined,
      fromDate: localFrom || undefined,
      toDate: localTo || undefined,
      page,
      limit: PAGE_SIZE,
    },
    fetchPolicy: 'cache-and-network',
  })

  const rows: AuditRow[] = data?.auditLog?.items ?? []
  const total: number = data?.auditLog?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: 600,
    borderBottom: `1px solid ${theme.tableBorder}`,
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!embedded && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            padding: '12px 0',
            alignItems: 'flex-end',
          }}
        >
          <Input
            label="User ID"
            value={localUserId}
            onChange={(e) => {
              setLocalUserId(e.target.value)
              setPage(1)
            }}
            placeholder="Filter by user…"
            style={{ width: 160 }}
          />
          <Input
            label="Table"
            value={localTable}
            onChange={(e) => {
              setLocalTable(e.target.value)
              setPage(1)
            }}
            placeholder="Table name…"
            style={{ width: 140 }}
          />
          <Select
            label="Action"
            value={localAction}
            onChange={(e) => {
              setLocalAction(e.target.value)
              setPage(1)
            }}
            options={ACTION_OPTIONS}
            style={{ width: 140 }}
          />
          <Input
            label="From"
            type="date"
            value={localFrom}
            onChange={(e) => {
              setLocalFrom(e.target.value)
              setPage(1)
            }}
            style={{ width: 140 }}
          />
          <Input
            label="To"
            type="date"
            value={localTo}
            onChange={(e) => {
              setLocalTo(e.target.value)
              setPage(1)
            }}
            style={{ width: 140 }}
          />
          <Button
            onClick={() => {
              setLocalUserId('')
              setLocalTable('')
              setLocalAction('')
              setLocalFrom('')
              setLocalTo('')
              setPage(1)
            }}
          >
            Clear
          </Button>
        </div>
      )}

      {error && (
        <div style={{ color: theme.danger, fontSize: 13 }}>
          Failed to load audit log: {error.message}
        </div>
      )}

      <div style={{ overflowX: 'auto', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr style={{ background: theme.bgSurfaceHover }}>
              <th style={thStyle}>Time</th>
              <th style={thStyle}>User</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Table</th>
              <th style={thStyle}>Record</th>
              <th style={thStyle}>Company</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: 24, textAlign: 'center', color: theme.textMuted }}
                >
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: 24, textAlign: 'center', color: theme.textMuted }}
                >
                  No audit entries found.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const highlight = rowHighlight(row.action, theme)
              const isExpanded = expandedId === row.id
              return [
                <tr
                  key={row.id}
                  style={{
                    borderBottom: `1px solid ${theme.tableBorder}`,
                    background: highlight ?? 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setExpandedId(isExpanded ? null : row.id)
                  }}
                >
                  <td
                    style={{
                      padding: '9px 12px',
                      color: theme.textMuted,
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span title={row.createdAt}>{formatRelativeTime(row.createdAt)}</span>
                    <div style={{ fontSize: 10, color: theme.textMuted }}>
                      {formatDate(row.createdAt)}
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', color: theme.textSecondary, fontSize: 13 }}>
                    {row.userEmail}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <Badge variant={actionVariant(row.action)}>{row.action}</Badge>
                  </td>
                  <td style={{ padding: '9px 12px', color: theme.textSecondary, fontSize: 13 }}>
                    {row.tableName}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      color: theme.textMuted,
                      fontSize: 12,
                      fontFamily: 'monospace',
                    }}
                  >
                    {row.recordId?.slice(0, 12)}
                  </td>
                  <td style={{ padding: '9px 12px', color: theme.textSecondary, fontSize: 13 }}>
                    {row.companyName}
                  </td>
                  <td style={{ padding: '9px 12px', color: theme.accent, fontSize: 12 }}>
                    {isExpanded ? '▲' : '▼'}
                  </td>
                </tr>,
                isExpanded && (
                  <tr key={`${row.id}-detail`} style={{ background: theme.bgSurface }}>
                    <td
                      colSpan={7}
                      style={{
                        padding: '12px 20px',
                        borderBottom: `1px solid ${theme.tableBorder}`,
                      }}
                    >
                      <DiffPanel old={row.oldValues} next={row.newValues} />
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 0',
        }}
      >
        <span style={{ color: theme.textMuted, fontSize: 13 }}>
          {total} record{total !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button
            onClick={() => {
              setPage((p) => Math.max(1, p - 1))
            }}
            disabled={page <= 1}
            size="sm"
          >
            Prev
          </Button>
          <span style={{ color: theme.textSecondary, fontSize: 13 }}>
            Page {page} / {totalPages}
          </span>
          <Button
            onClick={() => {
              setPage((p) => Math.min(totalPages, p + 1))
            }}
            disabled={page >= totalPages}
            size="sm"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
