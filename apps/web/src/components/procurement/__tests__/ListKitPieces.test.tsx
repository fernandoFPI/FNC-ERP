// The pieces of the list pages' kit that the Purchase Orders and Requisitions lists are built from: applied-filter chips, the empty state,
// the priority tag, the filter pill and "More Filters" panel, the row menu, the pager, the person and stage cells and the selection bar.
// (The title and the tiles are in ListKitPhone.test.tsx.)
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import {
  EmptyState,
  FilterChips,
  MoreFilters,
  PersonCell,
  Pagination,
  PillSelect,
  PriorityTag,
  RowMenu,
  SelectionBar,
  StageMini,
} from '../ListKit'

// the element a test is about, or a clear failure (a cast would hide a null, and the lint rules forbid `!`)
const must = <T,>(x: T | null | undefined): T => {
  if (x == null) throw new Error('expected the element to exist')
  return x
}

const light = themes['light-flat']
const wrap = (ui: React.ReactNode) => render(<ThemeProvider>{ui}</ThemeProvider>)
// jsdom reports a colour as rgb(...), the tokens are hex
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`
}

afterEach(async () => {
  localStorage.removeItem('fnc-theme')
  await i18n.changeLanguage('en')
})

describe('FilterChips', () => {
  const chips = () => [
    { key: 'status', label: 'Status', value: 'Payment pending', onRemove: vi.fn() },
    { key: 'mine', label: 'Only mine', onRemove: vi.fn() },
  ]

  it('draws nothing when no filter is applied', () => {
    const { container } = wrap(
      <FilterChips chips={[]} onClearAll={vi.fn()} clearAllLabel="Clear all" />,
    )
    expect(container.querySelector('ul')).toBeNull()
  })

  it('is a list named for what it is, with one item per applied filter and the name and value of each', () => {
    wrap(<FilterChips chips={chips()} onClearAll={vi.fn()} clearAllLabel="Clear all" />)
    const list = screen.getByRole('list', { name: 'Applied filters' })
    const items = within(list).getAllByRole('listitem')
    // two chips and the "clear all" item
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('StatusPayment pending')
    // a plain on/off filter shows only its name
    expect(items[1]).toHaveTextContent(/^Only mine$/)
  })

  it('takes a filter off with its own button, and only that one', () => {
    const c = chips()
    wrap(<FilterChips chips={c} onClearAll={vi.fn()} clearAllLabel="Clear all" />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Status Payment pending' }))
    expect(c[0].onRemove).toHaveBeenCalledTimes(1)
    expect(c[1].onRemove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Only mine' }))
    expect(c[1].onRemove).toHaveBeenCalledTimes(1)
  })

  it('has one "clear all", worded by the page', () => {
    const onClearAll = vi.fn()
    wrap(<FilterChips chips={chips()} onClearAll={onClearAll} clearAllLabel="Reset everything" />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }))
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it('says it in Arabic too, with the filter named and no raw key', async () => {
    await i18n.changeLanguage('ar')
    wrap(<FilterChips chips={chips()} onClearAll={vi.fn()} clearAllLabel="مسح الكل" />)
    expect(screen.getByRole('list', { name: i18n.t('common.activeFilters') })).toBeInTheDocument()
    const remove = screen.getByRole('button', {
      name: i18n.t('common.removeFilter', { name: 'Status Payment pending' }),
    })
    expect(remove.getAttribute('aria-label')).toContain('Status Payment pending')
    expect(document.body.textContent).not.toMatch(/common\./)
    expect(remove.getAttribute('aria-label')).not.toMatch(/common\./)
  })
})

describe('EmptyState', () => {
  it('shows the title, the hint and the action, and hides the picture from a screen reader', () => {
    const { container } = wrap(
      <EmptyState
        title="No orders match"
        hint="Try fewer filters."
        action={<button type="button">Clear all</button>}
      />,
    )
    expect(screen.getByText('No orders match')).toBeInTheDocument()
    expect(screen.getByText('Try fewer filters.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
    // the picture's own circle is hidden, not just the icon inside it (the icon hides itself)
    const picture = container.firstElementChild?.firstElementChild as HTMLElement
    expect(picture).toHaveStyle({ width: '48px', height: '48px' })
    expect(picture).toHaveAttribute('aria-hidden', 'true')
  })

  it('leaves the hint and the action out when there are none', () => {
    const { container } = wrap(<EmptyState title="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    // the card has the picture and the title only
    expect(container.firstElementChild?.children).toHaveLength(2)
  })

  it('reads its hint in the readable grey, not the pale one', () => {
    wrap(<EmptyState title="Nothing here" hint="A hint" />)
    expect(screen.getByText('A hint')).toHaveStyle({ color: light.textSecondary })
  })
})

describe('PriorityTag', () => {
  it('is the danger colours for danger and the warning colours for warning', () => {
    wrap(
      <>
        <PriorityTag tone="danger">Emergency</PriorityTag>
        <PriorityTag tone="warning">High</PriorityTag>
      </>,
    )
    expect(screen.getByText('Emergency')).toHaveStyle({
      color: light.danger,
      background: light.dangerBg,
    })
    expect(screen.getByText('High')).toHaveStyle({
      color: light.warning,
      background: light.warningBg,
    })
  })
})

describe('PillSelect', () => {
  const options = [
    { value: 'bought', label: 'Bought' },
    { value: 'closed', label: 'Closed' },
  ]
  const field = () => screen.getByRole('combobox', { name: 'Status' })

  it('shows what it filters and what it is set to, in the page text and not only in the hidden select', () => {
    wrap(<PillSelect label="Status" value="closed" options={options} onChange={vi.fn()} />)
    const pill = must(field().parentElement)
    expect(pill).toHaveTextContent('Status')
    expect(within(pill).getAllByText('Closed').length).toBeGreaterThan(0)
  })

  it('reads "All" when nothing is chosen, and is quiet', () => {
    wrap(<PillSelect label="Status" value="" options={options} onChange={vi.fn()} />)
    const pill = must(field().parentElement)
    expect(pill.querySelectorAll('span')[1]).toHaveTextContent('All')
    expect(pill).toHaveStyle({
      border: `1px solid ${light.borderField}`,
      background: light.bgSurface,
    })
  })

  it('shows an applied filter with the solid accent edge', () => {
    wrap(<PillSelect label="Status" value="bought" options={options} onChange={vi.fn()} />)
    const pill = must(field().parentElement)
    expect(pill).toHaveStyle({
      border: `1px solid ${light.accentSolid}`,
      background: light.accentBg,
    })
  })

  it('hands the chosen value to the page, and offers All first', () => {
    const onChange = vi.fn()
    wrap(<PillSelect label="Status" value="" options={options} onChange={onChange} />)
    expect(
      within(field())
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All', 'Bought', 'Closed'])
    fireEvent.change(field(), { target: { value: 'bought' } })
    expect(onChange).toHaveBeenCalledWith('bought')
  })

  it('is a real select over the whole pill, so a click or the keyboard anywhere on it works', () => {
    wrap(<PillSelect label="Status" value="" options={options} onChange={vi.fn()} />)
    expect(field()).toHaveStyle({
      position: 'absolute',
      width: '100%',
      height: '100%',
      opacity: '0',
    })
  })
})

describe('MoreFilters', () => {
  const show = (activeCount = 0) =>
    wrap(
      <div>
        <span>outside</span>
        <MoreFilters activeCount={activeCount}>
          <input
            aria-label="inner box"
            onKeyDown={(e) => {
              e.preventDefault()
            }}
          />
        </MoreFilters>
      </div>,
    )
  const trigger = () => screen.getByRole('button', { name: /more filters/i })

  it('starts closed and says so', () => {
    show()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a named dialog, points the button at it and says it is open', () => {
    show()
    fireEvent.click(trigger())
    const dialog = screen.getByRole('dialog', { name: 'More Filters' })
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(trigger()).toHaveAttribute('aria-controls', dialog.id)
    expect(within(dialog).getByLabelText('inner box')).toBeInTheDocument()
  })

  it('closes with a second press of the button', () => {
    show()
    fireEvent.click(trigger())
    fireEvent.click(trigger())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape and gives the keyboard back to the button', () => {
    show()
    fireEvent.click(trigger())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('leaves an Escape that a box inside already used alone', () => {
    show()
    fireEvent.click(trigger())
    fireEvent.keyDown(screen.getByLabelText('inner box'), { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes when the page outside is pressed, but not when something inside is', () => {
    show()
    fireEvent.click(trigger())
    fireEvent.mouseDown(screen.getByLabelText('inner box'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows how many filters are set, and no badge when none are', () => {
    const { unmount } = show(0)
    expect(trigger()).toHaveTextContent(/^More Filters$/)
    unmount()
    show(3)
    expect(trigger()).toHaveTextContent('More Filters3')
    expect(trigger()).toHaveStyle({ border: `1px solid ${light.accentSolid}` })
  })
})

describe('RowMenu', () => {
  const show = () => {
    const onOpen = vi.fn()
    const onPrint = vi.fn()
    const onCancel = vi.fn()
    const onRow = vi.fn()
    wrap(
      <div onClick={onRow}>
        <RowMenu
          items={[
            { label: 'Open', onClick: onOpen },
            { label: 'Print', onClick: onPrint },
            { label: 'Cancel PO', onClick: onCancel, tone: 'danger' },
          ]}
        />
      </div>,
    )
    return { onOpen, onPrint, onCancel, onRow }
  }
  const button = () => screen.getByRole('button', { name: 'Row actions' })
  const open = () => fireEvent.click(button())
  const items = () => screen.getAllByRole('menuitem')

  it('is a menu button that says whether it is open', () => {
    show()
    expect(button()).toHaveAttribute('aria-haspopup', 'menu')
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    open()
    expect(button()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Row actions' })).toBeInTheDocument()
    expect(items().map((i) => i.textContent)).toEqual(['Open', 'Print', 'Cancel PO'])
  })

  it('gives the keyboard to the first row as it opens', () => {
    show()
    open()
    expect(items()[0]).toHaveFocus()
  })

  it('moves with the arrow keys, wrapping round, and Home and End', () => {
    show()
    open()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items()[1]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items()[2]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items()[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(items()[2]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(items()[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(items()[2]).toHaveFocus()
  })

  it('closes on Escape and gives the keyboard back to the button', () => {
    show()
    open()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button()).toHaveFocus()
  })

  it('closes on Tab so focus is not left in a menu that is gone', () => {
    show()
    open()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes when the page outside is pressed, but not when the menu is', () => {
    show()
    open()
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('does what a row says and closes, without also opening the row', () => {
    const { onPrint, onOpen, onRow } = show()
    open()
    fireEvent.click(items()[1])
    expect(onPrint).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
    // neither the button nor a menu row reaches the row that holds them
    expect(onRow).not.toHaveBeenCalled()
  })

  it('draws a danger row in the danger colour and the others in the normal one', () => {
    show()
    open()
    expect(screen.getByRole('menuitem', { name: 'Cancel PO' })).toHaveStyle({ color: light.danger })
    expect(screen.getByRole('menuitem', { name: 'Open' })).not.toHaveStyle({ color: light.danger })
  })

  it('is drawn in the page body, so a table that clips what overflows cannot cut it', () => {
    wrap(
      <div style={{ overflow: 'hidden' }} data-testid="clip">
        <RowMenu items={[{ label: 'Open', onClick: vi.fn() }]} />
      </div>,
    )
    fireEvent.click(button())
    expect(screen.getByTestId('clip')).not.toContainElement(screen.getByRole('menu'))
    expect(screen.getByRole('menu').parentElement).toBe(document.body)
  })
})

describe('Pagination', () => {
  const show = (props: Partial<React.ComponentProps<typeof Pagination>> = {}) => {
    const onChange = vi.fn()
    wrap(<Pagination page={2} pageSize={5} total={42} onChange={onChange} {...props} />)
    return onChange
  }
  const prev = () => screen.getByRole('button', { name: 'Previous page' })
  const next = () => screen.getByRole('button', { name: 'Next page' })
  const numbers = () =>
    within(screen.getByRole('navigation', { name: 'Pages' }))
      .getAllByRole('button')
      .filter((b) => /^\d+$/.test(b.textContent))
      .map((b) => b.textContent)

  it('says which rows are shown, and is a navigation landmark', () => {
    show()
    expect(screen.getByText('Showing 6-10 of 42 entries')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument()
  })

  it('says 0 to 0 for an empty list, not 1 to 0', () => {
    show({ page: 1, total: 0 })
    expect(screen.getByText('Showing 0-0 of 0 entries')).toBeInTheDocument()
  })

  it('marks the current page for a screen reader and in the solid accent', () => {
    show({ page: 2 })
    const current = screen.getByRole('button', { name: '2' })
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current).toHaveStyle({ background: light.accentSolid, color: light.accentSolidText })
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current')
  })

  it('shows the first, the last and one either side of the current page, with a gap between', () => {
    show({ page: 5, total: 45 })
    expect(numbers()).toEqual(['1', '4', '5', '6', '9'])
    expect(screen.getAllByText('…')).toHaveLength(2)
  })

  it('shows every page when there are few', () => {
    show({ page: 1, total: 15 })
    expect(numbers()).toEqual(['1', '2', '3'])
    expect(screen.queryByText('…')).toBeNull()
  })

  it('cannot go back from the first page or forward from the last', () => {
    const { unmount } = render(
      <ThemeProvider>
        <Pagination page={1} pageSize={5} total={42} onChange={vi.fn()} />
      </ThemeProvider>,
    )
    expect(prev()).toBeDisabled()
    expect(next()).not.toBeDisabled()
    unmount()
    show({ page: 9 })
    expect(next()).toBeDisabled()
    expect(prev()).not.toBeDisabled()
  })

  it('asks for the page it is pressed for', () => {
    const onChange = show({ page: 5, total: 45 })
    fireEvent.click(prev())
    expect(onChange).toHaveBeenLastCalledWith(4)
    fireEvent.click(next())
    expect(onChange).toHaveBeenLastCalledWith(6)
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    expect(onChange).toHaveBeenLastCalledWith(9)
  })

  it('draws the same two arrows in Arabic: ‹ and › are mirrored by the browser there, swapping them would flip them back', async () => {
    show()
    expect(prev()).toHaveTextContent('‹')
    expect(next()).toHaveTextContent('›')
    document.body.innerHTML = ''
    await i18n.changeLanguage('ar')
    show()
    expect(screen.getByRole('button', { name: i18n.t('common.previousPage') })).toHaveTextContent(
      '‹',
    )
    expect(screen.getByRole('button', { name: i18n.t('common.nextPage') })).toHaveTextContent('›')
  })
})

describe('PersonCell', () => {
  it('shows the initials of the first two words, and the name', () => {
    wrap(
      <>
        <PersonCell name="Nadia Saleh" />
        <PersonCell name="Omar" />
        <PersonCell name="Ali Hassan Karim" />
      </>,
    )
    expect(screen.getByText('NS')).toBeInTheDocument()
    expect(screen.getByText('O')).toBeInTheDocument()
    expect(screen.getByText('AH')).toBeInTheDocument()
    expect(screen.getByText('Nadia Saleh')).toBeInTheDocument()
  })

  it('shows a dash when nobody is named', () => {
    wrap(
      <>
        <PersonCell name={null} />
        <PersonCell name="" />
        <PersonCell />
      </>,
    )
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('gives a person the same colour every time and different people different ones', () => {
    wrap(
      <>
        <PersonCell name="Nadia Saleh" />
        <PersonCell name="Nadia Saleh" />
        <PersonCell name="Omar Hassan" />
      </>,
    )
    const [a, b] = screen.getAllByText('NS').map((e) => e.style.background)
    expect(a).toBe(b)
    expect(screen.getByText('OH').style.background).not.toBe(a)
  })

  it('is a soft tint in the light theme and a deep one in the dark, not the same for both', () => {
    const lightRender = wrap(<PersonCell name="Nadia Saleh" />)
    const inLight = screen.getByText('NS').style.background
    lightRender.unmount()
    localStorage.setItem('fnc-theme', 'black')
    wrap(<PersonCell name="Nadia Saleh" />)
    expect(screen.getByText('NS').style.background).not.toBe(inLight)
  })

  it('hides the initials from a screen reader, which reads the name', () => {
    wrap(<PersonCell name="Nadia Saleh" />)
    expect(screen.getByText('NS')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('StageMini', () => {
  it('draws one dot per stage, the ones reached filled', () => {
    const { container } = wrap(<StageMini total={6} reached={2} label="2/6" />)
    const dots = Array.from(container.querySelectorAll<HTMLElement>('span')).filter(
      (s) => s.style.width === '9px',
    )
    expect(dots).toHaveLength(6)
    const filled = dots.filter(
      (d) => getComputedStyle(d).backgroundColor === rgb(light.accentSolid),
    )
    expect(filled).toHaveLength(2)
    expect(screen.getByText('2/6')).toBeInTheDocument()
  })

  it('shows a dash when there is no stage', () => {
    wrap(<StageMini total={6} reached={null} label="" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('SelectionBar', () => {
  it('is a region named for the selection, holds the actions, and clears it', () => {
    const onClear = vi.fn()
    wrap(
      <SelectionBar label="2 selected" onClear={onClear}>
        <button type="button">Export selected</button>
      </SelectionBar>,
    )
    const region = screen.getByRole('region', { name: '2 selected' })
    expect(within(region).getByRole('button', { name: 'Export selected' })).toBeInTheDocument()
    fireEvent.click(within(region).getByRole('button', { name: 'Clear selection' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
