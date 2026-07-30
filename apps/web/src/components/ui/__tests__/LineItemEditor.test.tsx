import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LineItemEditor, type LineItemField } from '../LineItemEditor'
import { ThemeProvider } from '../../../theme/ThemeContext'

interface Row {
  id: string
  description: string
  qty: number
}

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

const fields: LineItemField<Row>[] = [
  {
    key: 'description',
    label: 'Description',
    render: (row) => <input aria-label={`description-${row.id}`} defaultValue={row.description} />,
  },
  {
    key: 'qty',
    label: 'Qty',
    render: (row) => <input aria-label={`qty-${row.id}`} type="number" defaultValue={row.qty} />,
  },
]

const rows: Row[] = [
  { id: '1', description: 'Widget', qty: 2 },
  { id: '2', description: 'Gadget', qty: 5 },
]

describe('LineItemEditor', () => {
  it('renders a field column header per field and a cell per row', () => {
    wrap(<LineItemEditor fields={fields} rows={rows} rowKey={(r) => r.id} />)
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Qty')).toBeInTheDocument()
    expect(screen.getByLabelText('description-1')).toHaveValue('Widget')
    expect(screen.getByLabelText('description-2')).toHaveValue('Gadget')
  })

  it('shows the empty message when there are no rows', () => {
    wrap(
      <LineItemEditor fields={fields} rows={[]} rowKey={(r) => r.id} emptyMessage="Nothing here" />,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('calls onAddRow when the add button is clicked', () => {
    const onAddRow = vi.fn()
    wrap(<LineItemEditor fields={fields} rows={rows} onAddRow={onAddRow} addLabel="+ Add Line" />)
    fireEvent.click(screen.getByText('+ Add Line'))
    expect(onAddRow).toHaveBeenCalled()
  })

  it('calls onRemoveRow with the row index when the remove control is clicked', () => {
    const onRemoveRow = vi.fn()
    wrap(<LineItemEditor fields={fields} rows={rows} onRemoveRow={onRemoveRow} />)
    fireEvent.click(screen.getAllByText('×')[0])
    expect(onRemoveRow).toHaveBeenCalledWith(0)
  })

  it('renders a footer row with values under the matching fields', () => {
    wrap(
      <LineItemEditor fields={fields} rows={rows} footerRow={{ description: 'Total', qty: '7' }} />,
    )
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })
})
