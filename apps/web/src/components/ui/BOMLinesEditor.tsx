import { useTheme } from '../../theme/ThemeContext'
import { SearchableSelect } from './SearchableSelect'
import { LineItemEditor, type LineItemField } from './LineItemEditor'

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

  const numberInputStyle: React.CSSProperties = {
    width: '100%',
    background: theme.bgSurface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '13px',
    fontFamily: 'monospace',
  }

  const textInputStyle: React.CSSProperties = {
    width: '100%',
    background: theme.bgSurface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '12px',
  }

  const reorderButtonStyle = (disabled: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: theme.textMuted,
    padding: '2px 4px',
  })

  const fields: LineItemField<BOMLine>[] = [
    {
      key: 'index',
      label: '#',
      width: '30px',
      mobileHide: true,
      render: (_line, idx) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{idx + 1}</span>
      ),
    },
    {
      key: 'component',
      label: 'Component',
      render: (line) => (
        <SearchableSelect
          value={line.component_product_id}
          onChange={(pid) => {
            selectProduct(line.id, pid)
          }}
          options={products.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Select product…"
        />
      ),
    },
    {
      key: 'qty',
      label: 'Qty',
      width: '80px',
      render: (line) => (
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={line.qty}
          onChange={(e) => {
            updateLine(line.id, { qty: parseFloat(e.target.value) || 0 })
          }}
          style={numberInputStyle}
        />
      ),
    },
    {
      key: 'uom',
      label: 'UOM',
      width: '60px',
      render: (line) => (
        <input
          value={line.uom}
          onChange={(e) => {
            updateLine(line.id, { uom: e.target.value })
          }}
          style={textInputStyle}
        />
      ),
    },
    {
      key: 'unit_cost',
      label: 'Unit Cost',
      width: '100px',
      render: (line) => (
        <input
          type="number"
          min="0"
          step="0.01"
          value={line.unit_cost}
          onChange={(e) => {
            updateLine(line.id, { unit_cost: parseFloat(e.target.value) || 0 })
          }}
          style={numberInputStyle}
        />
      ),
    },
    {
      key: 'line_total',
      label: 'Line Total',
      width: '100px',
      render: (line) => (
        <span style={{ fontFamily: 'monospace', fontSize: '13px', color: theme.textPrimary }}>
          {(line.qty * line.unit_cost).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'order',
      label: 'Order',
      width: '70px',
      render: (line, idx) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          <button
            type="button"
            onClick={() => {
              moveUp(idx)
            }}
            disabled={idx === 0}
            style={reorderButtonStyle(idx === 0)}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => {
              moveDown(idx)
            }}
            disabled={idx === lines.length - 1}
            style={reorderButtonStyle(idx === lines.length - 1)}
          >
            ↓
          </button>
        </span>
      ),
    },
  ]

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

      <LineItemEditor
        fields={fields}
        rows={lines}
        rowKey={(line) => line.id}
        onRemoveRow={(idx) => {
          removeLine(lines[idx].id)
        }}
        onAddRow={addLine}
        addLabel="+ Add Component"
        emptyMessage="No components added yet"
        footerRow={{
          component: (
            <span style={{ fontSize: '13px', color: theme.textSecondary, fontWeight: 600 }}>
              Total Planned Cost
            </span>
          ),
          line_total: (
            <span style={{ fontFamily: 'monospace', fontSize: '13px', color: theme.accent }}>
              {lines.reduce((s, l) => s + l.qty * l.unit_cost, 0).toLocaleString()}
            </span>
          ),
        }}
      />
    </div>
  )
}
