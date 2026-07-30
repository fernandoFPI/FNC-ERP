import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export interface LineItemField<T> {
  key: string
  label: string
  // Desktop <th>/<td> width hint (e.g. '80px'). Not used on phone.
  width?: string
  // The actual input/select/checkbox/etc for this field — same element you'd
  // already written for a table cell. Give it `style={{ width: '100%' }}`
  // (not a fixed pixel width) so it fills whatever container it's in: a
  // narrow desktop <td> (sized by `width` above) or a full-width phone card
  // section.
  render: (row: T, index: number) => React.ReactNode
  // Omit this field entirely on phone — rare, for desktop-only metadata.
  mobileHide?: boolean
}

interface LineItemEditorProps<T extends object> {
  fields: LineItemField<T>[]
  rows: T[]
  rowKey?: (row: T, index: number) => string
  getRowStyle?: (row: T) => React.CSSProperties
  // Renders a delete control per row/card when provided.
  onRemoveRow?: (index: number) => void
  removeDisabled?: (row: T) => boolean
  // Renders an "+ Add Line"-style button below the list when provided.
  onAddRow?: () => void
  addLabel?: string
  emptyMessage?: string
  // Totals/summary row, keyed by field key — sparse, same convention as
  // Table's footerRow.
  footerRow?: Record<string, React.ReactNode>
}

export function LineItemEditor<T extends object>({
  fields,
  rows,
  rowKey,
  getRowStyle,
  onRemoveRow,
  removeDisabled,
  onAddRow,
  addLabel = '+ Add Line',
  emptyMessage = 'No lines yet',
  footerRow,
}: LineItemEditorProps<T>) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  const keyFor = (row: T, idx: number) => (rowKey ? rowKey(row, idx) : String(idx))

  // ── PHONE — stacked field cards ──────────────────────────────────────────────
  if (isPhone) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.length === 0 ? (
          <div
            style={{
              padding: '20px 0',
              textAlign: 'center',
              color: theme.textMuted,
              fontSize: '13px',
            }}
          >
            {emptyMessage}
          </div>
        ) : (
          rows.map((row, idx) => (
            <div
              key={keyFor(row, idx)}
              style={{
                background: theme.bgSurface,
                border: `0.5px solid ${theme.border}`,
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                ...(getRowStyle?.(row) ?? {}),
              }}
            >
              {fields
                .filter((f) => !f.mobileHide)
                .map((f) => (
                  <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 600 }}>
                      {f.label}
                    </label>
                    {f.render(row, idx)}
                  </div>
                ))}
              {onRemoveRow && (
                <button
                  type="button"
                  onClick={() => {
                    onRemoveRow(idx)
                  }}
                  disabled={removeDisabled?.(row)}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'none',
                    border: 'none',
                    padding: '4px 0 0',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: removeDisabled?.(row) ? theme.textMuted : theme.danger,
                    cursor: removeDisabled?.(row) ? 'not-allowed' : 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Remove line
                </button>
              )}
            </div>
          ))
        )}

        {footerRow && rows.length > 0 && (
          <div
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.accentBorder ?? theme.border}`,
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {fields
              .filter((f) => footerRow[f.key] != null)
              .map((f, i) => (
                <div
                  key={f.key}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '4px 0',
                    borderTop:
                      i === 0 ? 'none' : `0.5px solid ${theme.tableBorder ?? theme.border}`,
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>
                    {footerRow[f.key]}
                  </div>
                </div>
              ))}
          </div>
        )}

        {onAddRow && (
          <button
            type="button"
            onClick={onAddRow}
            style={{
              minHeight: '44px',
              borderRadius: '10px',
              border: `1px dashed ${theme.border}`,
              background: 'none',
              color: theme.accent,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {addLabel}
          </button>
        )}
      </div>
    )
  }

  // ── TABLET + DESKTOP — table layout ──────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div
        style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: theme.bgSurface }}>
              {fields.map((f) => (
                <th
                  key={f.key}
                  style={{
                    width: f.width,
                    padding: '7px 8px',
                    textAlign: 'left',
                    fontSize: '11px',
                    color: theme.textMuted,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.label}
                </th>
              ))}
              {onRemoveRow && <th style={{ width: '32px' }} />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={fields.length + (onRemoveRow ? 1 : 0)}
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: theme.textMuted,
                    fontSize: '13px',
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={keyFor(row, idx)}
                  style={{ borderTop: `1px solid ${theme.border}`, ...(getRowStyle?.(row) ?? {}) }}
                >
                  {fields.map((f) => (
                    <td key={f.key} style={{ padding: '5px 4px' }}>
                      {f.render(row, idx)}
                    </td>
                  ))}
                  {onRemoveRow && (
                    <td style={{ padding: '5px 4px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveRow(idx)
                        }}
                        disabled={removeDisabled?.(row)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: removeDisabled?.(row) ? theme.border : theme.textMuted,
                          cursor: removeDisabled?.(row) ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {footerRow && rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `2px solid ${theme.tableBorder ?? theme.border}` }}>
                {fields.map((f) => (
                  <td
                    key={f.key}
                    style={{ padding: '7px 8px', fontWeight: 700, color: theme.textPrimary }}
                  >
                    {footerRow[f.key] ?? null}
                  </td>
                ))}
                {onRemoveRow && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {onAddRow && (
        <button
          type="button"
          onClick={onAddRow}
          style={{
            alignSelf: 'flex-start',
            padding: '6px 12px',
            borderRadius: '6px',
            border: `1px dashed ${theme.border}`,
            background: 'none',
            color: theme.accent,
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {addLabel}
        </button>
      )}
    </div>
  )
}
