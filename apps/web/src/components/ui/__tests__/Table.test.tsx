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
    fireEvent.click(screen.getByText('Alpha').closest('tr')!)
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
