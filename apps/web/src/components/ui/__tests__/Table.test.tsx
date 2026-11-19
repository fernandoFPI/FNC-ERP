import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, type Column } from '../Table'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'

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

// How a row reads on a phone. 'rows' is the long-standing card and stays the default (about 90 tables
// use it); 'fields' is the opt-in layout with a label above every value.
describe('Table: phone cards', () => {
  interface Wide {
    id: string
    name: string
    a: string
    b: string
    c: string
    d: string
  }
  const wideColumns: Column<Wide>[] = [
    { key: 'name', header: 'Name', mobilePrimary: true },
    { key: 'a', header: 'Alpha field' },
    { key: 'b', header: 'Beta field' },
    { key: 'c', header: 'Gamma field' },
    { key: 'd', header: 'Delta field', mobileFullWidth: true },
  ]
  const wideData: Wide[] = [
    {
      id: '1',
      name: 'A very long item name that has to wrap',
      a: 'a-1',
      b: 'b-1',
      c: 'c-1',
      d: 'd-1',
    },
  ]
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }
  afterEach(() => {
    setWidth(1024)
  })

  it('keeps the long-standing card by default: three fields, the rest behind More', () => {
    setWidth(390)
    wrap(<Table columns={wideColumns} data={wideData} rowKey="id" />)
    expect(screen.getByText('c-1')).toBeInTheDocument()
    expect(screen.queryByText('d-1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument()
    expect(screen.getByText('Alpha field').tagName).not.toBe('DT')
  })

  it('fields: shows every field under its own label, nothing behind More', () => {
    setWidth(390)
    wrap(<Table columns={wideColumns} data={wideData} rowKey="id" mobileLayout="fields" />)
    for (const [label, value] of [
      ['Alpha field', 'a-1'],
      ['Beta field', 'b-1'],
      ['Gamma field', 'c-1'],
      ['Delta field', 'd-1'],
    ]) {
      expect(screen.getByText(label).tagName).toBe('DT')
      expect(screen.getByText(value).tagName).toBe('DD')
    }
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument()
  })

  it('fields: the label is the readable grey and the value is the strong text colour', () => {
    setWidth(390)
    wrap(<Table columns={wideColumns} data={wideData} rowKey="id" mobileLayout="fields" />)
    const label = screen.getByText('Alpha field')
    const value = screen.getByText('a-1')
    // theme.textMuted (#9aa0a8) is 2.64:1 on white; labels are never drawn in it (playbook #75)
    expect(label).not.toHaveStyle({ color: '#9aa0a8' })
    expect(value).toHaveStyle({ fontWeight: '600' })
    expect(getComputedStyle(label).color).not.toBe(getComputedStyle(value).color)
  })

  it('fields: only a field marked full width spans the whole card', () => {
    setWidth(390)
    wrap(<Table columns={wideColumns} data={wideData} rowKey="id" mobileLayout="fields" />)
    expect(screen.getByText('Delta field').parentElement).toHaveStyle({ gridColumn: '1 / -1' })
    expect(screen.getByText('Alpha field').parentElement).not.toHaveStyle({ gridColumn: '1 / -1' })
  })

  it('fields: the card title wraps instead of being cut with an ellipsis; the default still truncates', () => {
    setWidth(390)
    const { unmount } = wrap(
      <Table columns={wideColumns} data={wideData} rowKey="id" mobileLayout="fields" />,
    )
    expect(screen.getByText(/very long item name/)).toHaveStyle({ whiteSpace: 'normal' })
    unmount()
    wrap(<Table columns={wideColumns} data={wideData} rowKey="id" />)
    expect(screen.getByText(/very long item name/)).toHaveStyle({ whiteSpace: 'nowrap' })
  })

  it('fields: changes nothing on a desktop, where the table is the same table', () => {
    wrap(<Table columns={wideColumns} data={wideData} rowKey="id" mobileLayout="fields" />)
    expect(screen.getByRole('columnheader', { name: 'Alpha field' })).toBeInTheDocument()
    expect(screen.queryByText('Alpha field')?.tagName).toBe('TH')
  })
})

// Opt-in for the list pages: readable column headings, and a row that opens something is a keyboard stop.
describe('Table: readable', () => {
  const light = themes['light-flat']
  const header = (name: string) => screen.getByRole('columnheader', { name })
  const row = () => screen.getByText('Alpha').closest('tr') as HTMLElement
  // Say what the browser would answer for ":focus-visible" and leave every other selector to the real `matches`.
  const focusVisible = (answer: boolean) => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Element.prototype.matches
    return vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible' ? answer : original.call(this, selector)
    })
  }
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('draws the headings in the readable grey at 11px, where the default is the pale grey at 10px', () => {
    const { unmount } = wrap(<Table readable columns={columns} data={data} />)
    expect(header('Name')).toHaveStyle({ color: light.textSecondary, fontSize: '11px' })
    unmount()
    wrap(<Table columns={columns} data={data} />)
    expect(header('Name')).toHaveStyle({ color: light.textMuted, fontSize: '10px' })
  })

  it('makes a row that opens something a keyboard stop, and a row that does not open anything is not one', () => {
    const { unmount } = wrap(<Table readable columns={columns} data={data} onRowClick={vi.fn()} />)
    expect(row()).toHaveAttribute('tabindex', '0')
    unmount()
    const noClick = wrap(<Table readable columns={columns} data={data} />)
    expect(row()).not.toHaveAttribute('tabindex')
    noClick.unmount()
    wrap(<Table columns={columns} data={data} onRowClick={vi.fn()} />)
    expect(row()).not.toHaveAttribute('tabindex')
  })

  it('opens the row on Enter and on Space, and on no other key', () => {
    const onRowClick = vi.fn()
    wrap(<Table readable columns={columns} data={data} onRowClick={onRowClick} />)
    fireEvent.keyDown(row(), { key: 'Enter' })
    expect(onRowClick).toHaveBeenLastCalledWith(data[0])
    fireEvent.keyDown(row(), { key: ' ' })
    expect(onRowClick).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(row(), { key: 'a' })
    fireEvent.keyDown(row(), { key: 'Tab' })
    expect(onRowClick).toHaveBeenCalledTimes(2)
  })

  it('leaves a key typed in a control inside the row to that control', () => {
    const onRowClick = vi.fn()
    const withButton: Column<Row>[] = [
      ...columns,
      { key: 'action', header: 'Action', render: () => <button type="button">Menu</button> },
    ]
    wrap(<Table readable columns={withButton} data={data} onRowClick={onRowClick} />)
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Menu' })[0], { key: 'Enter' })
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('shows a ring on a row reached with the keyboard, takes it off when the focus leaves, and shows none for a mouse click', () => {
    wrap(<Table readable columns={columns} data={data} onRowClick={vi.fn()} />)
    const spy = focusVisible(true)
    fireEvent.focus(row())
    expect(row().style.boxShadow).toContain(light.accentSolid)
    fireEvent.blur(row())
    expect(row().style.boxShadow).toBe('none')
    spy.mockRestore()
    focusVisible(false)
    fireEvent.focus(row())
    expect(row().style.boxShadow).not.toContain(light.accentSolid)
  })

  it('does not ring a row for focus that began on something inside it', () => {
    const withButton: Column<Row>[] = [
      ...columns,
      { key: 'action', header: 'Action', render: () => <button type="button">Menu</button> },
    ]
    wrap(<Table readable columns={withButton} data={data} onRowClick={vi.fn()} />)
    focusVisible(true)
    fireEvent.focus(screen.getAllByRole('button', { name: 'Menu' })[0])
    expect(row().style.boxShadow).not.toContain(light.accentSolid)
  })
})
