import { useTheme } from '../../theme/ThemeContext'
import { Button } from './Button'
import { formatNumber } from '../../lib/format'

interface Company { id: string; name: string }

interface ConsolidatedRow {
  accountType: string
  accountCode: string
  accountName: string
  companies: Record<string, number>
  consolidated: number
  eliminated: number
}

interface ConsolidatedFinancialTableProps {
  data: ConsolidatedRow[]
  companies: Company[]
  currency: string
  showEliminations: boolean
  loading?: boolean
  priorData?: ConsolidatedRow[]
}

function groupByType(rows: ConsolidatedRow[]): Map<string, ConsolidatedRow[]> {
  const map = new Map<string, ConsolidatedRow[]>()
  for (const row of rows) {
    const list = map.get(row.accountType) ?? []
    list.push(row)
    map.set(row.accountType, list)
  }
  return map
}

function exportCsv(data: ConsolidatedRow[], companies: Company[], currency: string, showEliminations: boolean) {
  const headers = ['Code', 'Account', ...companies.map(c => c.name)]
  if (showEliminations) headers.push('Eliminations')
  headers.push('Consolidated')
  const rows = data.map(r => [
    r.accountCode,
    r.accountName,
    ...companies.map(c => String(r.companies[c.id] ?? 0)),
    ...(showEliminations ? [String(r.eliminated)] : []),
    String(r.consolidated),
  ])
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `consolidated_${currency}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ConsolidatedFinancialTable({
  data,
  companies,
  currency,
  showEliminations,
  loading = false,
  priorData,
}: ConsolidatedFinancialTableProps) {
  const { theme } = useTheme()
  const grouped = groupByType(data)
  const priorByCode = priorData
    ? new Map(priorData.map(r => [r.accountCode, r]))
    : undefined

  const grandTotal = {
    companies: companies.reduce<Record<string, number>>((acc, c) => {
      acc[c.id] = data.reduce((s, r) => s + (r.companies[c.id] ?? 0), 0)
      return acc
    }, {}),
    consolidated: data.reduce((s, r) => s + r.consolidated, 0),
    eliminated: data.reduce((s, r) => s + r.eliminated, 0),
  }

  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    textAlign: 'right',
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: 600,
    borderBottom: `2px solid ${theme.tableBorder}`,
    whiteSpace: 'nowrap',
    background: theme.bgSurfaceHover,
  }

  const tdStyle: React.CSSProperties = {
    padding: '8px 14px',
    textAlign: 'right',
    color: theme.textSecondary,
    fontSize: 13,
    borderBottom: `1px solid ${theme.tableBorder}`,
    whiteSpace: 'nowrap',
  }

  const subtotalStyle: React.CSSProperties = {
    ...tdStyle,
    fontWeight: 600,
    color: theme.textPrimary,
    background: theme.bgSurfaceHover,
    borderTop: `1px solid ${theme.border}`,
  }

  const formatAmt = (v: number) => formatNumber(v)
  const formatElim = (v: number) =>
    v !== 0 ? <span style={{ color: theme.danger }}>{`(${formatAmt(Math.abs(v))})`}</span> : <span>—</span>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          size="sm"
          onClick={() => exportCsv(data, companies, currency, showEliminations)}
        >
          Export CSV
        </Button>
      </div>

      <div style={{ overflowX: 'auto', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{
                ...thStyle,
                textAlign: 'left',
                position: 'sticky',
                left: 0,
                zIndex: 2,
                minWidth: 200,
                background: theme.bgSurfaceHover,
              }}>
                Account
              </th>
              {companies.map(c => (
                <th key={c.id} style={thStyle}>{c.name}</th>
              ))}
              {showEliminations && (
                <th style={{ ...thStyle, color: theme.danger }}>Eliminations</th>
              )}
              <th style={{ ...thStyle, color: theme.accent }}>Consolidated ({currency})</th>
              {priorByCode && (
                <th style={{ ...thStyle, color: theme.textMuted }}>vs Prior</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={companies.length + (showEliminations ? 3 : 2) + (priorByCode ? 1 : 0)} style={{ ...tdStyle, textAlign: 'center', padding: 28 }}>
                  Loading…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={companies.length + (showEliminations ? 3 : 2) + (priorByCode ? 1 : 0)} style={{ ...tdStyle, textAlign: 'center', padding: 28 }}>
                  No data available.
                </td>
              </tr>
            ) : (
              Array.from(grouped.entries()).map(([type, rows]) => {
                const typeTotal = {
                  companies: companies.reduce<Record<string, number>>((acc, c) => {
                    acc[c.id] = rows.reduce((s, r) => s + (r.companies[c.id] ?? 0), 0)
                    return acc
                  }, {}),
                  consolidated: rows.reduce((s, r) => s + r.consolidated, 0),
                  eliminated: rows.reduce((s, r) => s + r.eliminated, 0),
                }

                return [
                  // Type header
                  <tr key={`type-${type}`}>
                    <td
                      colSpan={companies.length + (showEliminations ? 3 : 2) + (priorByCode ? 1 : 0)}
                      style={{
                        padding: '10px 14px',
                        color: theme.accent,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        background: theme.bgSurface,
                        borderBottom: `1px solid ${theme.tableBorder}`,
                        position: 'sticky',
                        left: 0,
                      }}
                    >
                      {type}
                    </td>
                  </tr>,

                  // Account rows
                  ...rows.map(row => (
                    <tr key={row.accountCode} style={{ cursor: 'default' }}
                      onMouseEnter={e => (e.currentTarget.style.background = theme.bgSurfaceHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{
                        ...tdStyle,
                        textAlign: 'left',
                        position: 'sticky',
                        left: 0,
                        background: 'inherit',
                        zIndex: 1,
                      }}>
                        <span style={{ color: theme.textMuted, fontSize: 11, marginRight: 6 }}>{row.accountCode}</span>
                        <span style={{ color: theme.textPrimary }}>{row.accountName}</span>
                      </td>
                      {companies.map(c => (
                        <td key={c.id} style={tdStyle}>
                          {formatAmt(row.companies[c.id] ?? 0)}
                        </td>
                      ))}
                      {showEliminations && (
                        <td style={tdStyle}>{formatElim(row.eliminated)}</td>
                      )}
                      <td style={{ ...tdStyle, fontWeight: 600, color: theme.textPrimary }}>
                        {formatAmt(row.consolidated)}
                      </td>
                      {priorByCode && (() => {
                        const prior = priorByCode.get(row.accountCode)
                        const pv = prior?.consolidated ?? 0
                        const pct = pv !== 0 ? ((row.consolidated - pv) / Math.abs(pv)) * 100 : null
                        return (
                          <td style={{ ...tdStyle, color: pct === null ? theme.textMuted : pct >= 0 ? theme.success : theme.danger, fontWeight: 500 }}>
                            {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
                          </td>
                        )
                      })()}
                    </tr>
                  )),

                  // Subtotal row
                  <tr key={`subtotal-${type}`}>
                    <td style={{
                      ...subtotalStyle,
                      textAlign: 'left',
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                    }}>
                      Total {type}
                    </td>
                    {companies.map(c => (
                      <td key={c.id} style={subtotalStyle}>
                        {formatAmt(typeTotal.companies[c.id] ?? 0)}
                      </td>
                    ))}
                    {showEliminations && (
                      <td style={subtotalStyle}>{formatElim(typeTotal.eliminated)}</td>
                    )}
                    <td style={{ ...subtotalStyle, color: theme.accent }}>
                      {formatAmt(typeTotal.consolidated)}
                    </td>
                    {priorByCode && <td style={subtotalStyle} />}
                  </tr>,
                ]
              })
            )}

            {/* Grand total */}
            {!loading && data.length > 0 && (
              <tr style={{ background: theme.accentBg }}>
                <td style={{
                  ...subtotalStyle,
                  textAlign: 'left',
                  background: theme.accentBg,
                  color: theme.accent,
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  borderTop: `2px solid ${theme.accentBorder}`,
                }}>
                  GRAND TOTAL
                </td>
                {companies.map(c => (
                  <td key={c.id} style={{
                    ...subtotalStyle,
                    background: theme.accentBg,
                    borderTop: `2px solid ${theme.accentBorder}`,
                  }}>
                    {formatAmt(grandTotal.companies[c.id] ?? 0)}
                  </td>
                ))}
                {showEliminations && (
                  <td style={{
                    ...subtotalStyle,
                    background: theme.accentBg,
                    borderTop: `2px solid ${theme.accentBorder}`,
                  }}>
                    {formatElim(grandTotal.eliminated)}
                  </td>
                )}
                <td style={{
                  ...subtotalStyle,
                  background: theme.accentBg,
                  color: theme.accent,
                  fontSize: 14,
                  borderTop: `2px solid ${theme.accentBorder}`,
                }}>
                  {formatAmt(grandTotal.consolidated)}
                </td>
                {priorByCode && (() => {
                  const priorTotal = priorData!.reduce((s, r) => s + r.consolidated, 0)
                  const pct = priorTotal !== 0 ? ((grandTotal.consolidated - priorTotal) / Math.abs(priorTotal)) * 100 : null
                  return (
                    <td style={{
                      ...subtotalStyle,
                      background: theme.accentBg,
                      color: pct === null ? theme.textMuted : pct >= 0 ? theme.success : theme.danger,
                      fontSize: 14,
                      fontWeight: 700,
                      borderTop: `2px solid ${theme.accentBorder}`,
                    }}>
                      {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
                    </td>
                  )
                })()}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
