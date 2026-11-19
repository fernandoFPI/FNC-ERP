// The Procurement list kit on a phone: the title and its action share one row (no icon tile, no subtitle), and the KPI
// cards become a row of chips that scrolls sideways, so the list is not pushed 560px down the screen.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { KpiRow, KpiTile, PageTitle, SearchBox } from '../ListKit'

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
})

const wrap = (ui: React.ReactNode) => render(<ThemeProvider>{ui}</ThemeProvider>)

describe('PageTitle', () => {
  const title = (
    <PageTitle
      icon="doc"
      title="Requisitions"
      subtitle="Create, track and manage purchase requisitions"
      actions={<button type="button">New Requisition</button>}
    />
  )

  it('on a phone is the title and the action on one row, with no subtitle', () => {
    setWidth(390)
    wrap(title)
    const heading = screen.getByRole('heading', { level: 1 })
    const action = screen.getByRole('button', { name: 'New Requisition' })
    expect(heading.parentElement).toHaveStyle({ display: 'flex', justifyContent: 'space-between' })
    expect(heading.parentElement).toContainElement(action)
    expect(screen.queryByText(/create, track and manage/i)).toBeNull()
  })

  it('on a phone lets two actions wrap under the title instead of squeezing it', () => {
    setWidth(390)
    wrap(
      <PageTitle
        icon="cart"
        title="Purchase Orders"
        subtitle="All purchase orders"
        actions={
          <>
            <button type="button">Export CSV</button>
            <button type="button">New Requisition</button>
          </>
        }
      />,
    )
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveStyle({
      flexWrap: 'wrap',
    })
  })

  it('on a desktop keeps the icon tile and the subtitle', () => {
    wrap(title)
    expect(screen.getByText(/create, track and manage/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveStyle({ fontSize: '24px' })
  })
})

describe('KpiRow and KpiTile', () => {
  const tiles = (onFilter = vi.fn(), onQueue = vi.fn()) => (
    <KpiRow>
      <KpiTile
        tone="accent"
        icon="doc"
        label="My Queue"
        value={17}
        sub="Actions required"
        trailing={<span>→</span>}
        onClick={onQueue}
      />
      <KpiTile
        tone="warning"
        icon="clock"
        label="Pending Approval"
        value={2}
        sub="Awaiting approval"
        active
        onClick={onFilter}
      />
      <KpiTile
        tone="success"
        icon="cart"
        label="Open Requisitions"
        value={33}
        sub="Not yet completed"
      />
    </KpiRow>
  )

  it('on a phone the tiles sit in one row that scrolls sideways, running to the screen edges', () => {
    setWidth(390)
    wrap(tiles())
    const row = screen.getByRole('button', { name: /pending approval/i }).parentElement
    expect(row).toHaveStyle({ display: 'flex', overflowX: 'auto' })
    expect(row?.style.marginInline).toBe('-16px')
  })

  it('on a phone a tile is a chip: the number and the name on one line, no second line of text', () => {
    setWidth(390)
    wrap(tiles())
    const chip = screen.getByRole('button', { name: /pending approval/i })
    expect(chip).toHaveTextContent('2Pending Approval')
    expect(chip).toHaveStyle({ borderRadius: '999px', minHeight: '44px', whiteSpace: 'nowrap' })
    expect(screen.queryByText('Awaiting approval')).toBeNull()
    expect(screen.queryByText('Actions required')).toBeNull()
  })

  it('on a phone a filter tile says whether it is on; a tile that navigates, or shows a count, does not', () => {
    setWidth(390)
    wrap(tiles())
    expect(screen.getByRole('button', { name: /pending approval/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // "My Queue" has a trailing arrow: it goes to another page, so it is not an on/off switch
    expect(screen.getByRole('button', { name: /my queue/i })).not.toHaveAttribute('aria-pressed')
  })

  it('on a phone a tile still does what it did when pressed', () => {
    setWidth(390)
    const onFilter = vi.fn()
    const onQueue = vi.fn()
    wrap(tiles(onFilter, onQueue))
    fireEvent.click(screen.getByRole('button', { name: /pending approval/i }))
    fireEvent.click(screen.getByRole('button', { name: /my queue/i }))
    expect(onFilter).toHaveBeenCalledTimes(1)
    expect(onQueue).toHaveBeenCalledTimes(1)
  })

  it('on a phone a tile with no click handler is not a button', () => {
    setWidth(390)
    wrap(tiles())
    expect(screen.queryByRole('button', { name: /open requisitions/i })).toBeNull()
    expect(screen.getByText('Open Requisitions')).toBeInTheDocument()
  })

  it('on a desktop the tiles are the grid of cards, with their second line, and a quick-filter tile says whether it is on', () => {
    wrap(tiles())
    const row = screen.getByRole('button', { name: /pending approval/i }).parentElement
    expect(row).toHaveStyle({ display: 'grid' })
    expect(row?.style.gridTemplateColumns).toContain('auto-fit')
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument()
    // a filter that is on or off is a pressed button for a screen reader on a desktop too
    // (this tile is the one switched on in the fixture)
    expect(screen.getByRole('button', { name: /pending approval/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // a tile that only navigates (it has an arrow) is not a switch
    expect(screen.getByRole('button', { name: /my queue/i })).not.toHaveAttribute('aria-pressed')
  })
})

describe('SearchBox', () => {
  const box = () => screen.getByPlaceholderText('Search').closest('label')

  it('on a phone has a small minimum width, so it shares its row with the buttons beside it', () => {
    setWidth(390)
    wrap(<SearchBox value="" onChange={() => undefined} placeholder="Search" />)
    expect(box()?.style.minWidth).toBe('120px')
    expect(box()?.style.flex).toContain('120px')
  })

  it('on a desktop keeps its 200px minimum and 260px basis', () => {
    wrap(<SearchBox value="" onChange={() => undefined} placeholder="Search" />)
    expect(box()?.style.minWidth).toBe('200px')
    expect(box()?.style.flex).toContain('260px')
  })
})
