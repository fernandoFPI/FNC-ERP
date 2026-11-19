// The calendar that opens under a date box (Account Ledger, Invoice payment). It was drawn inside the page (a card
// around it could clip it), took the pale accent for the chosen day, left days outside min / max looking clickable,
// had no Escape, no month labels for a screen reader and arrows that did not flip in Arabic. It also read "2026-12-01"
// through `new Date(...)`, which is midnight UTC and so the day before in a negative offset.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { themes } from '../../../theme/tokens'
import { DatePicker } from '../DatePicker'

const originalWidth = window.innerWidth
const originalHeight = window.innerHeight
const setWindow = (w: number, h: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}

function mount(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = vi.fn()
  const view = render(
    <ThemeProvider>
      <div data-testid="host">
        <button type="button">outside</button>
        <DatePicker label="Expected delivery" value="2026-11-17" onChange={onChange} {...props} />
      </div>
    </ThemeProvider>,
  )
  return { onChange, ...view }
}
const input = () => screen.getByRole('textbox')
const openIt = () => {
  fireEvent.click(input())
  return screen.getByRole('dialog')
}
const day = (n: number, dialog = screen.getByRole('dialog')): HTMLElement => {
  const found = within(dialog)
    .getAllByRole('button')
    .find((b) => b.textContent === String(n) && b.getAttribute('aria-pressed') !== null)
  if (!found) throw new Error(`no day ${n}`)
  return found
}
const heading = (dialog: HTMLElement) =>
  within(dialog).getByText(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/).textContent

beforeEach(() => {
  localStorage.clear()
  setWindow(1400, 900)
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  setWindow(originalWidth, originalHeight)
  localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('DatePicker: opening', () => {
  it('is closed to begin with, and says it opens a dialog', () => {
    mount()
    expect(input()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(input()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a dialog named after the field, at the end of the page so a card cannot clip it', () => {
    const { container } = mount()
    const dialog = openIt()
    expect(dialog).toHaveAccessibleName('Expected delivery')
    expect(container.contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body)
    expect(input()).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens on the month of the chosen date, read as numbers (not through Date, which shifts by the time zone)', () => {
    mount({ value: '2026-12-01' })
    expect(heading(openIt())).toBe('Dec 2026')
  })

  it('opens on the current month when no date is chosen', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2027, 2, 9, 12))
    mount({ value: '' })
    expect(heading(openIt())).toBe('Mar 2027')
  })

  it('opens on the chosen month again after browsing to another one', () => {
    mount()
    const dialog = openIt()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next month' }))
    expect(heading(dialog)).toBe('Dec 2026')
    fireEvent.keyDown(input(), { key: 'Escape' })
    fireEvent.click(input())
    expect(heading(screen.getByRole('dialog'))).toBe('Nov 2026')
  })

  it('opens from the keyboard on Enter and ArrowDown', () => {
    mount()
    for (const key of ['Enter', 'ArrowDown']) {
      fireEvent.keyDown(input(), { key })
      expect(screen.queryByRole('dialog')).not.toBeNull()
      fireEvent.keyDown(input(), { key: 'Escape' })
      expect(screen.queryByRole('dialog')).toBeNull()
    }
  })

  it('does not open a disabled field', () => {
    mount({ disabled: true })
    fireEvent.click(input())
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('DatePicker: the days', () => {
  it('draws the chosen day in the solid accent with its text, and says it is pressed', () => {
    mount()
    const dialog = openIt()
    const chosen = day(17, dialog)
    expect(chosen).toHaveAttribute('aria-pressed', 'true')
    expect(chosen).toHaveStyle({
      background: themes['light-flat'].accentSolid,
      color: themes['light-flat'].accentSolidText,
    })
    expect(day(18, dialog)).toHaveAttribute('aria-pressed', 'false')
  })

  it('outlines today in the accent, apart from the chosen day', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 12))
    mount()
    const dialog = openIt()
    expect(day(20, dialog)).toHaveStyle({
      border: `1px solid ${themes['light-flat'].accent}`,
      color: themes['light-flat'].accentSolid,
    })
    // the chosen day is the solid one, not outlined
    expect(day(17, dialog)).toHaveStyle({ border: '1px solid transparent' })
  })

  it('names every day in full for a screen reader', () => {
    mount()
    const dialog = openIt()
    expect(day(17, dialog)).toHaveAccessibleName(/Tuesday, November 17, 2026/)
  })

  it('tints the day under the pointer with the accent', () => {
    mount()
    const dialog = openIt()
    fireEvent.mouseEnter(day(18, dialog))
    expect(day(18, dialog)).toHaveStyle({ background: themes['light-flat'].accentBg })
    fireEvent.mouseLeave(day(18, dialog))
    expect(day(18, dialog)).toHaveStyle({ background: 'transparent' })
  })

  it('chooses a day: reports it as YYYY-MM-DD, closes, and puts focus back on the box', () => {
    const { onChange } = mount()
    fireEvent.click(day(20, openIt()))
    expect(onChange).toHaveBeenCalledWith('2026-11-20')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(input()).toHaveFocus()
  })

  it('moves a month forward and back, across a year', () => {
    mount({ value: '2026-12-05' })
    const dialog = openIt()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next month' }))
    expect(heading(dialog)).toBe('Jan 2027')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Previous month' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Previous month' }))
    expect(heading(dialog)).toBe('Nov 2026')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Previous month' }))
    expect(heading(dialog)).toBe('Oct 2026')
  })

  it('draws a 30-day month with 30 days, starting on the right weekday', () => {
    mount()
    const dialog = openIt()
    const days = within(dialog)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') !== null)
    expect(days).toHaveLength(30)
    // 1 November 2026 is a Sunday: no blank cell before it
    expect(days[0]).toHaveAccessibleName(/Sunday, November 1, 2026/)
  })
})

describe('DatePicker: min and max', () => {
  it('dims and disables a day outside the range, and keeps the others', () => {
    const { onChange } = mount({ min: '2026-11-10', max: '2026-11-25' })
    const dialog = openIt()
    for (const n of [9, 26]) {
      expect(day(n, dialog)).toBeDisabled()
      expect(day(n, dialog)).toHaveStyle({ opacity: '0.35', cursor: 'not-allowed' })
      fireEvent.click(day(n, dialog))
    }
    expect(onChange).not.toHaveBeenCalled()
    for (const n of [10, 25]) expect(day(n, dialog)).toBeEnabled()
  })

  it('does not tint a blocked day under the pointer', () => {
    mount({ min: '2026-11-10' })
    const dialog = openIt()
    fireEvent.mouseEnter(day(9, dialog))
    expect(day(9, dialog)).toHaveStyle({ background: 'transparent' })
  })

  it('"Today" chooses today, and is held back when today is outside the range', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 12))
    const first = mount()
    fireEvent.click(within(openIt()).getByRole('button', { name: 'Today' }))
    expect(first.onChange).toHaveBeenCalledWith('2026-11-20')
    first.unmount()
    const second = mount({ max: '2026-11-18' })
    const today = within(openIt()).getByRole('button', { name: 'Today' })
    expect(today).toBeDisabled()
    fireEvent.click(today)
    expect(second.onChange).not.toHaveBeenCalled()
  })
})

describe('DatePicker: closing', () => {
  it('closes on Escape, with the key kept from any dialog around it, and gives focus back to the box', () => {
    mount()
    const outer = vi.fn()
    document.addEventListener('keydown', outer)
    const dialog = openIt()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    document.removeEventListener('keydown', outer)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(input()).toHaveFocus()
    expect(outer).not.toHaveBeenCalled()
  })

  it('closes on a click anywhere else, but not on a click inside the calendar', () => {
    mount()
    const dialog = openIt()
    fireEvent.mouseDown(within(dialog).getByRole('button', { name: 'Next month' }))
    expect(screen.queryByRole('dialog')).not.toBeNull()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is removed from the page when it closes', () => {
    mount()
    openIt()
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('DatePicker: where it appears', () => {
  // jsdom has no layout: the box's rectangle is stubbed and the calendar's own inline position is read back.
  const stubBox = (box: { left: number; right: number; top: number; bottom: number }) =>
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      ...box,
      width: box.right - box.left,
      height: box.bottom - box.top,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    })

  it('sits just under the box with the two left edges lined up', () => {
    stubBox({ left: 200, right: 540, top: 100, bottom: 140 })
    mount()
    const dialog = openIt()
    expect(dialog.style.left).toBe('200px')
    expect(dialog.style.top).toBe('146px') // 140 + 6
    expect(dialog.style.position).toBe('fixed')
  })

  it('lines its right edge up with the box in Arabic', async () => {
    await i18n.changeLanguage('ar')
    stubBox({ left: 200, right: 540, top: 100, bottom: 140 })
    mount()
    const dialog = openIt()
    expect(dialog.style.left).toBe('244px') // 540 - 296
  })

  it('opens upward when the box is near the bottom of the window', () => {
    stubBox({ left: 200, right: 540, top: 800, bottom: 840 })
    mount()
    const dialog = openIt()
    expect(dialog.style.bottom).toBe('106px') // 900 - 800 + 6
    expect(dialog.style.top).toBe('')
  })

  it('is kept inside a narrow window', () => {
    setWindow(390, 844)
    stubBox({ left: 300, right: 380, top: 100, bottom: 140 })
    mount()
    const dialog = openIt()
    // 390 - 296 - 8: its right edge stays 8px from the window's
    expect(dialog.style.left).toBe('86px')
  })
})

describe('DatePicker: the box, the arrows and Arabic', () => {
  it('is 36px by default and the 40px field box with `field`', () => {
    const plain = mount()
    expect(input()).toHaveStyle({ height: '36px' })
    plain.unmount()
    mount({ field: true })
    expect(input()).toHaveStyle({ height: '40px', borderRadius: '10px' })
    expect(input()).toHaveStyle({ border: `1px solid ${themes['light-flat'].borderField}` })
  })

  it('turns the edge to the accent while it is open', () => {
    mount({ field: true })
    openIt()
    expect(input().style.borderColor).not.toBe('')
    expect(input()).toHaveStyle({ borderColor: themes['light-flat'].accent })
  })

  it('shows the error in red and the box edge in the error colour', () => {
    mount({ field: true, error: 'Pick a date' })
    expect(screen.getByText('Pick a date')).toHaveStyle({ color: themes['light-flat'].danger })
    expect(input()).toHaveStyle({ border: `1px solid ${themes['light-flat'].dangerBorder}` })
  })

  it('leaves the month arrows to the browser in Arabic: ‹ and › are mirrored there by themselves, so swapping them flips them back', async () => {
    const english = mount()
    let dialog = openIt()
    expect(within(dialog).getByRole('button', { name: 'Previous month' })).toHaveTextContent('‹')
    expect(within(dialog).getByRole('button', { name: 'Next month' })).toHaveTextContent('›')
    english.unmount()
    await i18n.changeLanguage('ar')
    mount()
    dialog = openIt()
    // the same two characters, the same way round, whatever the language (checked in a real browser: playbook #104)
    expect(
      within(dialog).getByRole('button', { name: i18n.t('ui.datePicker.previousMonth') }),
    ).toHaveTextContent('‹')
    expect(
      within(dialog).getByRole('button', { name: i18n.t('ui.datePicker.nextMonth') }),
    ).toHaveTextContent('›')
  })

  it('has every label in Arabic, with no raw key on screen', async () => {
    await i18n.changeLanguage('ar')
    mount()
    const dialog = openIt()
    for (const key of ['previousMonth', 'nextMonth', 'today']) {
      expect(i18n.t(`ui.datePicker.${key}`)).not.toBe(`ui.datePicker.${key}`)
    }
    expect(dialog.textContent).not.toMatch(/ui\.datePicker/)
    expect(
      within(dialog).getByRole('button', { name: i18n.t('ui.datePicker.today') }),
    ).toBeInTheDocument()
  })
})
