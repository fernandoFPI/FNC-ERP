import { useTheme } from '../../theme/ThemeContext'
import { Button } from './Button'
import { Input } from './Input'
import { SearchableSelect } from './SearchableSelect'

export interface BOMLine {
  id: string
  component_product_id: string
  component_name: string
  qty: number
  uom: string
  unit_cost: number
}

interface Props {
  lines: BOMLine[]
  onChange: (lines: BOMLine[]) => void
  products: { id: string; name: string; standard_cost: number; uom?: string }[]
  costPreview?: number
  currency?: string
}

export function BOMLinesEditor({
  lines,
  onChange,
  products,
  costPreview,
  currency = 'IQD',
}: Props) {
  const { theme } = useTheme()

  function addLine() {
    const newLine: BOMLine = {
      id: `new-${Date.now()}`,
      component_product_id: '',
      component_name: '',
      qty: 1,
      uom: 'pcs',
      unit_cost: 0,
    }
    onChange([...lines, newLine])
  }

  function removeLine(id: string) {
    onChange(lines.filter((l) => l.id !== id))
  }

  function updateLine(id: string, patch: Partial<BOMLine>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function selectProduct(lineId: string, productId: string) {
    const p = products.find((p) => p.id === productId)
    if (!p) return
    updateLine(lineId, {
      component_product_id: productId,
      component_name: p.name,
      unit_cost: p.standard_cost,
      uom: p.uom ?? 'pcs',
    })
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const arr = [...lines]
    ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
    onChange(arr)
  }

  function moveDown(idx: number) {
    if (idx === lines.length - 1) return
    const arr = [...lines]
    ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
    onChange(arr)
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: '11px',
    color: theme.textMuted,
    fontWeight: 600,
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
          BOM Components
        </span>
        {costPreview != null && (
          <span style={{ fontSize: '13px', color: theme.accent, fontFamily: 'monospace' }}>
            Planned Cost: {costPreview.toLocaleString()} {currency}
          </span>
        )}
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: theme.bgSurfaceHover }}>
              <th style={{ ...thStyle, width: '30px' }}>#</th>
              <th style={thStyle}>Component</th>
              <th style={{ ...thStyle, width: '80px' }}>Qty</th>
              <th style={{ ...thStyle, width: '60px' }}>UOM</th>
              <th style={{ ...thStyle, width: '100px' }}>Unit Cost</th>
              <th style={{ ...thStyle, width: '100px' }}>Line Total</th>
              <th style={{ ...thStyle, width: '70px' }}>Order</th>
              <th style={{ ...thStyle, width: '40px' }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const lineTotal = line.qty * line.unit_cost
              return (
                <tr
                  key={line.id}
                  style={{ borderBottom: `1px solid ${theme.border}`, background: theme.bgSurface }}
                >
                  <td style={{ padding: '6px 12px', color: theme.textMuted, fontSize: '12px' }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <SearchableSelect
                      value={line.component_product_id}
                      onChange={(pid) => {
                        selectProduct(line.id, pid)
                      }}
                      options={products.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder="Select product…"
                    />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.qty}
                      onChange={(e) => {
                        updateLine(line.id, { qty: parseFloat(e.target.value) || 0 })
                      }}
                      style={{
                        width: '100%',
                        background: theme.bgSurface,
                        color: theme.textPrimary,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                      }}
                    />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input
                      value={line.uom}
                      onChange={(e) => {
                        updateLine(line.id, { uom: e.target.value })
                      }}
                      style={{
                        width: '100%',
                        background: theme.bgSurface,
                        color: theme.textPrimary,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '12px',
                      }}
                    />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unit_cost}
                      onChange={(e) => {
                        updateLine(line.id, { unit_cost: parseFloat(e.target.value) || 0 })
                      }}
                      style={{
                        width: '100%',
                        background: theme.bgSurface,
                        color: theme.textPrimary,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                      }}
                    />
                  </td>
                  <td
                    style={{
                      padding: '6px 12px',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      color: theme.textPrimary,
                    }}
                  >
                    {lineTotal.toLocaleString()}
                  </td>
                  <td style={{ padding: '4px', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => {
                        moveUp(idx)
                      }}
                      disabled={idx === 0}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: idx === 0 ? 'not-allowed' : 'pointer',
                        color: theme.textMuted,
                        padding: '2px 4px',
                      }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => {
                        moveDown(idx)
                      }}
                      disabled={idx === lines.length - 1}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: idx === lines.length - 1 ? 'not-allowed' : 'pointer',
                        color: theme.textMuted,
                        padding: '2px 4px',
                      }}
                    >
                      ↓
                    </button>
                  </td>
                  <td style={{ padding: '4px' }}>
                    <button
                      onClick={() => {
                        removeLine(line.id)
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: theme.danger,
                        padding: '4px',
                        fontSize: '16px',
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
            {lines.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: theme.textMuted,
                    fontSize: '13px',
                  }}
                >
                  No components added yet
                </td>
              </tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr style={{ background: theme.bgSurfaceHover }}>
                <td
                  colSpan={5}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'right',
                    fontSize: '13px',
                    color: theme.textSecondary,
                    fontWeight: 600,
                  }}
                >
                  Total Planned Cost
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    color: theme.accent,
                    fontWeight: 700,
                  }}
                >
                  {lines.reduce((s, l) => s + l.qty * l.unit_cost, 0).toLocaleString()}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Button variant="ghost" size="sm" onClick={addLine} style={{ marginTop: '8px' }}>
        + Add Component
      </Button>
    </div>
  )
}

// suppress unused import
void Input
