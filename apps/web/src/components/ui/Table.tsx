import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export interface Column<T> {
  key: string
  header: string
  renderHeader?: () => React.ReactNode
  width?: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  // Mobile card view options
  mobileHide?: boolean
  mobileLabel?: string
  mobilePrimary?: boolean
  mobileSecondary?: boolean
  mobileAction?: boolean
  tabletHide?: boolean
}

interface TableProps<T extends object> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (row: T) => void
  rowKey?: string
  stickyHeader?: boolean
  className?: string
  getRowStyle?: (row: T) => React.CSSProperties
  // Responsive options
  mobileCard?: boolean
  stickyFirstColumn?: boolean
}

function renderValue<T extends object>(col: Column<T>, row: T): React.ReactNode {
  return col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')
}

function SkeletonRow({ cols }: { cols: number }) {
  const { theme } = useTheme()
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '12px 14px' }}>
          <div
            className="skeleton"
            style={{
              height: '14px',
              width: i === 0 ? '75%' : '55%',
              borderRadius: '4px',
              animation: 'fnc-shimmer 1.5s ease-in-out infinite',
              background: theme.border,
            }}
          />
        </td>
      ))}
    </tr>
  )
}

function CardSkeleton() {
  const { theme } = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            background: theme.bgSurface,
            border: `0.5px solid ${theme.border}`,
            borderRadius: '12px',
            padding: '14px',
            height: '88px',
            animation: 'fnc-shimmer 1.5s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  )
}

export function Table<T extends object>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data',
  onRowClick,
  rowKey,
  stickyHeader = false,
  className = '',
  getRowStyle,
  mobileCard = true,
  stickyFirstColumn = false,
}: TableProps<T>) {
  const { theme } = useTheme()
  const { isPhone, isTablet } = useBreakpoint()

  // ── PHONE — Card list view ───────────────────────────────────────────────────
  if (isPhone && mobileCard) {
    if (loading) return <CardSkeleton />

    if (data.length === 0) {
      return (
        <div
          style={{
            padding: '32px 0',
            textAlign: 'center',
            color: theme.textMuted,
            fontSize: '13px',
          }}
        >
          {emptyMessage}
        </div>
      )
    }

    const primaryCol = columns.find((c) => c.mobilePrimary) ?? columns[0]
    const secondaryCol = columns.find((c) => c.mobileSecondary)
    const actionCol = columns.find((c) => c.mobileAction)
    const bodyColumns = columns.filter(
      (c) => !c.mobileHide && !c.mobilePrimary && !c.mobileSecondary && !c.mobileAction,
    )

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '8px' }}>
        {data.map((row, idx) => {
          const key = rowKey ? String((row as Record<string, unknown>)[rowKey] ?? idx) : String(idx)
          const primaryContent = primaryCol ? renderValue(primaryCol, row) : null
          const secondaryContent = secondaryCol ? renderValue(secondaryCol, row) : null
          const actionContent = actionCol ? renderValue(actionCol, row) : null

          return (
            <div
              key={key}
              onClick={
                onRowClick
                  ? () => {
                      onRowClick(row)
                    }
                  : undefined
              }
              style={{
                background: theme.bgSurface,
                border: `0.5px solid ${theme.border}`,
                borderRadius: '12px',
                padding: '14px',
                cursor: onRowClick ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* Card header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: theme.textPrimary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {primaryContent}
                  </div>
                  {secondaryContent && (
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                      {secondaryContent}
                    </div>
                  )}
                </div>
                {actionContent ? (
                  <div style={{ flexShrink: 0 }}>{actionContent}</div>
                ) : onRowClick ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={theme.textMuted}
                    strokeWidth="2"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                ) : null}
              </div>

              {/* Body fields — label/value grid */}
              {bodyColumns.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    paddingTop: '10px',
                    borderTop: `0.5px solid ${theme.tableBorder ?? theme.border}`,
                  }}
                >
                  {bodyColumns.map((col) => (
                    <div key={col.key}>
                      <div
                        style={{
                          fontSize: '10px',
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '2px',
                        }}
                      >
                        {col.mobileLabel ?? col.header}
                      </div>
                      <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                        {renderValue(col, row)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── TABLET + DESKTOP — Standard table with scroll wrapper ────────────────────
  const visibleColumns = columns.filter((col) => (isTablet ? !col.tabletHide : true))

  return (
    <div
      className={className}
      style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        width: '100%',
        margin: isTablet ? '0 -16px' : '0',
        padding: isTablet ? '0 16px' : '0',
        boxSizing: isTablet ? 'content-box' : undefined,
      }}
    >
      <table
        style={{
          width: '100%',
          minWidth: isTablet ? '600px' : undefined,
          borderCollapse: 'collapse',
          fontSize: '13px',
        }}
      >
        <thead style={{ position: stickyHeader ? 'sticky' : 'static', top: 0, zIndex: 1 }}>
          <tr>
            {visibleColumns.map((col, i) => (
              <th
                key={String(col.key)}
                style={{
                  width: col.width,
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.tableBorder ?? theme.border}`,
                  whiteSpace: 'nowrap',
                  background: theme.bgSurface,
                  position: stickyFirstColumn && i === 0 ? 'sticky' : undefined,
                  left: stickyFirstColumn && i === 0 ? 0 : undefined,
                  zIndex: stickyFirstColumn && i === 0 ? 2 : undefined,
                }}
              >
                {col.renderHeader ? col.renderHeader() : col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} cols={visibleColumns.length} />
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={visibleColumns.length}
                style={{
                  padding: '32px 14px',
                  textAlign: 'center',
                  color: theme.textMuted,
                  fontSize: '13px',
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => {
              const rowStyle = getRowStyle?.(row) ?? {}
              return (
                <tr
                  key={rowKey ? String((row as Record<string, unknown>)[rowKey] ?? idx) : idx}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    borderBottom: `1px solid ${theme.tableBorder ?? theme.border}`,
                    ...rowStyle,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = rowStyle.background
                      ? String(rowStyle.background)
                      : theme.tableRowHover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = rowStyle.background
                      ? String(rowStyle.background)
                      : 'transparent'
                  }}
                >
                  {visibleColumns.map((col, ci) => (
                    <td
                      key={String(col.key)}
                      style={{
                        padding: '12px 14px',
                        color: theme.textSecondary,
                        whiteSpace: 'nowrap',
                        position: stickyFirstColumn && ci === 0 ? 'sticky' : undefined,
                        left: stickyFirstColumn && ci === 0 ? 0 : undefined,
                        background: stickyFirstColumn && ci === 0 ? theme.bgSurface : undefined,
                      }}
                    >
                      {renderValue(col, row)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
