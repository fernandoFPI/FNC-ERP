// The "Columns · 6 of 9" menu and the Comfortable | Compact toggle that sit above a table.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { ColumnsMenu, type ColumnsMenuItem } from '../ColumnsMenu'
import { DensityToggle } from '../DensityToggle'

const items: ColumnsMenuItem[] = [
  { key: 'qty', label: 'Qty', on: true },
  { key: 'initial', label: 'Initial Price', on: false },
  { key: 'total', label: 'Total', on: true, locked: true },
]

function renderMenu(over: Partial<React.ComponentProps<typeof ColumnsMenu>> = {}) {
  const onToggle = vi.fn()
  const onReset = vi.fn()
  render(
    <ThemeProvider>
      <div>
        <ColumnsMenu
          items={items}
          onToggle={onToggle}
          onReset={onReset}
          canReset={false}
          {...over}
        />
        <p>outside</p>
      </div>
    </ThemeProvider>,
  )
  return { onToggle, onReset }
}

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('ColumnsMenu', () => {
  it('says how many columns are showing out of how many there are', () => {
    renderMenu()
    expect(screen.getByRole('button', { name: 'Columns · 2 of 3' })).toBeInTheDocument()
  })

  it('opens a tick box per column, and a locked one that cannot be changed', () => {
    renderMenu()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    expect(screen.getByRole('checkbox', { name: 'Qty' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Initial Price' })).not.toBeChecked()
    const total = screen.getByRole('checkbox', { name: 'Total' })
    expect(total).toBeChecked()
    expect(total).toBeDisabled()
  })

  it('reports the column and the new state when one is ticked or cleared', () => {
    const { onToggle } = renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Initial Price' }))
    expect(onToggle).toHaveBeenLastCalledWith('initial', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Qty' }))
    expect(onToggle).toHaveBeenLastCalledWith('qty', false)
  })

  it('shows the small print, and "Reset to default" only when there is something to reset', () => {
    renderMenu({ note: 'Item and Total always stay visible' })
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    expect(screen.getByText('Item and Total always stay visible')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull()
  })

  it('resets when asked', () => {
    const { onReset } = renderMenu({ canReset: true })
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('tells assistive technology whether it is open', () => {
    renderMenu()
    const button = screen.getByRole('button', { name: /^Columns/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes on Escape and on a click anywhere else, but not when clicking inside', () => {
    renderMenu()
    const button = screen.getByRole('button', { name: /^Columns/ })
    fireEvent.click(button)
    fireEvent.mouseDown(screen.getByRole('checkbox', { name: 'Qty' }))
    expect(screen.getByRole('checkbox', { name: 'Qty' })).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('checkbox')).toBeNull()

    fireEvent.click(button)
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Qty' }), { key: 'Escape' })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderMenu({ canReset: true })
    expect(screen.getByRole('button', { name: 'الأعمدة · 2 من 3' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^الأعمدة/ }))
    expect(screen.getByRole('button', { name: 'استعادة الافتراضي' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/ui\.tableView\./)
  })
})

describe('DensityToggle', () => {
  it('shows which spacing is on, and changes it', () => {
    const onChange = vi.fn()
    render(
      <ThemeProvider>
        <DensityToggle value="comfortable" onChange={onChange} />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Comfortable' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(onChange).toHaveBeenCalledWith('compact')
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    render(
      <ThemeProvider>
        <DensityToggle value="compact" onChange={vi.fn()} />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: 'مضغوط' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'مريح' })).toBeInTheDocument()
  })
})

// The list used to be drawn inside the table's card, which clips anything sticking out of it, so
// on a short table (one line) the menu was cut off after the fifth column. It is now drawn at the
// end of the page and placed from the button.
describe('ColumnsMenu: where the list appears', () => {
  interface Rect {
    top: number
    bottom: number
    left: number
    right: number
  }
  let buttonRect: Rect

  const rectOf = (r: Rect): DOMRect =>
    ({
      ...r,
      x: r.left,
      y: r.top,
      width: r.right - r.left,
      height: r.bottom - r.top,
      toJSON: () => ({}),
    }) as DOMRect

  beforeEach(() => {
    buttonRect = { top: 100, bottom: 130, left: 300, right: 500 }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return this.getAttribute('aria-haspopup')
        ? rectOf(buttonRect)
        : rectOf({ top: 0, bottom: 0, left: 0, right: 0 })
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  })

  const openInsideClippingCard = () => {
    const view = render(
      <ThemeProvider>
        <div data-testid="card" style={{ overflow: 'hidden', height: '40px' }}>
          <ColumnsMenu items={items} onToggle={vi.fn()} onReset={vi.fn()} canReset={false} />
        </div>
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    return {
      card: screen.getByTestId('card'),
      panel: screen.getByRole('group', { name: 'Show columns' }),
      view,
    }
  }

  it('is not inside the card, so the card cannot clip it', () => {
    const { card, panel } = openInsideClippingCard()
    expect(card.contains(panel)).toBe(false)
    expect(panel.parentElement).toBe(document.body)
  })

  it('sits just under the button with the two right edges lined up', () => {
    const { panel } = openInsideClippingCard()
    expect(panel).toHaveStyle({ position: 'fixed', top: '136px', left: '252px', width: '248px' })
  })

  it('opens upward when the button is near the bottom of the window', () => {
    buttonRect = { top: 700, bottom: 730, left: 300, right: 500 }
    const { panel } = openInsideClippingCard()
    expect(panel.style.bottom).toBe('74px')
    expect(panel.style.top).toBe('')
    expect(panel).toHaveStyle({ maxHeight: '480px' })
  })

  it('scrolls inside itself, rather than running off the screen, when the window is short', () => {
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true })
    const { panel } = openInsideClippingCard()
    expect(panel).toHaveStyle({ maxHeight: '256px', overflowY: 'auto' })
  })

  it('stays inside the window at the left edge', () => {
    buttonRect = { top: 100, bottom: 130, left: 10, right: 100 }
    const { panel } = openInsideClippingCard()
    expect(panel).toHaveStyle({ left: '8px' })
  })

  it('lines up with the left edge of the button in Arabic', async () => {
    await i18n.changeLanguage('ar')
    render(
      <ThemeProvider>
        <ColumnsMenu items={items} onToggle={vi.fn()} onReset={vi.fn()} canReset={false} />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^الأعمدة/ }))
    expect(screen.getByRole('group')).toHaveStyle({ left: '300px' })
  })

  it('follows the button when the window is resized, but not when the list itself scrolls', () => {
    const { panel } = openInsideClippingCard()
    expect(panel).toHaveStyle({ left: '252px' })
    buttonRect = { top: 100, bottom: 130, left: 400, right: 600 }
    fireEvent.scroll(panel)
    expect(panel).toHaveStyle({ left: '252px' })
    fireEvent(window, new Event('resize'))
    expect(panel).toHaveStyle({ left: '352px' })
  })

  it('moves the keyboard into the list when it opens, and back to the button on Escape', () => {
    const { panel } = openInsideClippingCard()
    expect(panel.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Qty' }))
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Qty' }), { key: 'Escape' })
    expect(screen.queryByRole('group')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Columns/ }))
  })

  it('removes the list from the page when it closes', () => {
    openInsideClippingCard()
    fireEvent.mouseDown(document.body)
    expect(document.querySelector('[role="group"]')).toBeNull()
  })
})
