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
})
