import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, type Column } from '../Table'
import { ThemeProvider } from '../../../theme/ThemeContext'

interface Row {
  id: string
  name: string
  value: number
}

const columns: Column<Row>[] = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'value', header: 'Value' },
]

const data: Row[] = [
  { id: '1', name: 'Alpha', value: 100 },
  { id: '2', name: 'Beta', value: 200 },
]

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

describe('Table', () => {
  it('renders column headers', () => {
    wrap(<Table columns={columns} data={data} />)
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Value')).toBeInTheDocument()
  })

  it('renders data rows', () => {
    wrap(<Table columns={columns} data={data} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('shows empty message when data is empty', () => {
    wrap(<Table columns={columns} data={[]} emptyMessage="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('calls onRowClick when row clicked', () => {
    const fn = vi.fn()
    wrap(<Table columns={columns} data={data} onRowClick={fn} />)
    const row = screen.getByText('Alpha').closest('tr')
    if (!row) throw new Error('Expected a <tr> ancestor for Alpha')
    fireEvent.click(row)
    expect(fn).toHaveBeenCalledWith(data[0])
  })

  it('shows skeleton rows when loading=true', () => {
    const { container } = wrap(<Table columns={columns} data={[]} loading />)
    // skeleton rows are tr elements with skeleton div children
    const skeletons = container.querySelectorAll('.skeleton')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders a footer row with the given values under the matching columns', () => {
    wrap(<Table columns={columns} data={data} footerRow={{ name: 'Total', value: '300' }} />)
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('300')).toBeInTheDocument()
  })

  it('does not render a footer row when data is empty', () => {
    wrap(<Table columns={columns} data={[]} footerRow={{ name: 'Total' }} />)
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })

  it('renders expanded content only for rows renderExpanded returns content for', () => {
    wrap(
      <Table
        columns={columns}
        data={data}
        renderExpanded={(row) => (row.id === '1' ? <span>Detail for Alpha</span> : null)}
      />,
    )
    expect(screen.getByText('Detail for Alpha')).toBeInTheDocument()
  })

  it('renders a section header before the row it applies to', () => {
    wrap(
      <Table
        columns={columns}
        data={data}
        getSectionHeader={(row, i) => (i === 0 ? 'Group A' : null)}
      />,
    )
    expect(screen.getByText('Group A')).toBeInTheDocument()
  })
})

// A long item name used to set the width of the whole table (every cell was one line), pushing
// the quantity and price columns off the card behind a sideways scrollbar. A column can now
// opt in to wrapping; everything else stays on one line exactly as before.
describe('Table: wrapping columns', () => {
  const longName =
    'UNIVERSAL SLIM WC SEAT MODEL 2 - ROUND FORM (DUROPLAST, SOFT-CLOSING, DETACHABLE METAL HINGE, TOP FIXING)'
  const wrapColumns: Column<Row>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name', wrap: true, minWidth: '220px' },
    { key: 'value', header: 'Value' },
  ]
  const cellOf = (text: string) => {
    const td = screen.getByText(text).closest('td')
    if (!td) throw new Error(`no cell for ${text}`)
    return td
  }

  it('lets a column that asks for it wrap, and keeps its minimum width', () => {
    wrap(<Table columns={wrapColumns} data={[{ id: 'row-a', name: longName, value: 777 }]} />)
    const cell = cellOf(longName)
    expect(cell).toHaveStyle({ whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: '220px' })
  })

  it('keeps every other column on one line, as before', () => {
    wrap(<Table columns={wrapColumns} data={[{ id: 'row-a', name: longName, value: 777 }]} />)
    expect(cellOf('row-a')).toHaveStyle({ whiteSpace: 'nowrap' })
    expect(cellOf('row-a')).not.toHaveStyle({ overflowWrap: 'anywhere' })
    expect(cellOf('777')).toHaveStyle({ whiteSpace: 'nowrap' })
  })

  it('leaves a table that never asks for wrapping completely unchanged', () => {
    wrap(<Table columns={columns} data={data} />)
    for (const text of ['1', 'Alpha', '100'])
      expect(cellOf(text)).toHaveStyle({ whiteSpace: 'nowrap' })
  })

  it('keeps the header on one line but gives it the same minimum width, so header and cells line up', () => {
    wrap(<Table columns={wrapColumns} data={[{ id: 'row-a', name: longName, value: 777 }]} />)
    const th = screen.getByText('Name').closest('th')
    expect(th).toHaveStyle({ whiteSpace: 'nowrap', minWidth: '220px' })
  })
})

// Row spacing: comfortable is the long-standing look and stays the default; compact trims the
// vertical padding. Nothing else about the table changes.
describe('Table: density', () => {
  const cell = (text: string) => {
    const td = screen.getByText(text).closest('td')
    if (!td) throw new Error(`no cell for ${text}`)
    return td
  }
  const head = (text: string) => {
    const th = screen.getByText(text).closest('th')
    if (!th) throw new Error(`no header for ${text}`)
    return th
  }

  it('keeps the existing padding unless asked for compact', () => {
    wrap(<Table columns={columns} data={data} />)
    expect(cell('Alpha')).toHaveStyle({ padding: '12px 14px' })
    expect(head('Name')).toHaveStyle({ padding: '10px 14px' })
  })

  it('treats comfortable as the same thing', () => {
    wrap(<Table columns={columns} data={data} density="comfortable" />)
    expect(cell('Alpha')).toHaveStyle({ padding: '12px 14px' })
  })

  it('packs rows and headers tighter when compact', () => {
    wrap(<Table columns={columns} data={data} density="compact" />)
    expect(cell('Alpha')).toHaveStyle({ padding: '8px 14px' })
    expect(head('Name')).toHaveStyle({ padding: '7px 14px' })
  })
})
