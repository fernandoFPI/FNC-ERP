// The list that opens under a searchable select. It was drawn by hand with #ffffff / #1a1a2e / an indigo that is not the
// accent, 8px corners against the 10px field boxes, no mark on the chosen row, a physical `left` alignment for the Arabic
// line and no keyboard focus ring or focus return. It is now the shared menu look (`menuStyles.ts`).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { themes } from '../../../theme/tokens'
import { SearchableSelect } from '../SearchableSelect'
import { menuFocusRing } from '../menuStyles'

const options = [
  { value: '', label: 'Select branch…' },
  { value: 'a', label: 'Alpha Office', sublabel: 'A-1', keywords: 'ألفا' },
  { value: 'b', label: 'Beta Office' },
  { value: 'c', label: 'Gamma Office' },
]

const originalWidth = window.innerWidth
const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

function mount(props: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) {
  const onChange = vi.fn()
  const view = render(
    <ThemeProvider>
      <div>
        <button type="button">before</button>
        <SearchableSelect
          value=""
          onChange={onChange}
          options={options}
          placeholder="Pick one"
          field
          {...props}
        />
        <button type="button">after</button>
      </div>
    </ThemeProvider>,
  )
  return { onChange, ...view }
}
// The field is the one button that opens a listbox (its name is whatever is chosen, or "Select branch…" for no choice).
const trigger = (): HTMLElement => {
  const found = screen
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-haspopup') === 'listbox')
  if (!found) throw new Error('the field was not found')
  return found
}
const open = () => {
  fireEvent.click(trigger())
  return screen.getByRole('listbox')
}
const rows = () => screen.getAllByRole('option')
const row = (label: string) => {
  const found = rows().find((r) => r.textContent.includes(label))
  if (!found) throw new Error(`no row for ${label}`)
  return found
}

beforeEach(() => {
  localStorage.clear()
  setWidth(1400)
})
afterEach(async () => {
  vi.restoreAllMocks()
  setWidth(originalWidth)
  localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('SearchableSelect: the field and its list, for a screen reader', () => {
  it('is a button that opens a listbox, and says so', () => {
    mount()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).not.toHaveAttribute('aria-controls')
    const list = open()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(trigger()).toHaveAttribute('aria-controls', list.id)
  })

  it('draws every choice as an option, and marks only the chosen one as selected', () => {
    mount({ value: 'b' })
    open()
    expect(rows()).toHaveLength(4)
    expect(rows().map((r) => r.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ])
  })

  it('never marks the "no choice" row as selected, even when nothing is chosen', () => {
    mount({ value: '' })
    open()
    expect(rows()[0]).toHaveAttribute('aria-selected', 'false')
  })

  it('tells the search box which row is current, and follows the arrow keys', () => {
    mount({ value: 'b' })
    open()
    const input = screen.getByPlaceholderText(i18n.t('ui.select.search'))
    // opens on the chosen row, not on the first one
    expect(input).toHaveAttribute('aria-activedescendant', row('Beta Office').id)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', row('Gamma Office').id)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input).toHaveAttribute('aria-activedescendant', row('Alpha Office').id)
  })

  it('starts on the first row when nothing is chosen', () => {
    mount({ value: '' })
    open()
    const input = screen.getByPlaceholderText(i18n.t('ui.select.search'))
    expect(input).toHaveAttribute('aria-activedescendant', rows()[0].id)
  })
})

describe('SearchableSelect: the list in the shared menu look', () => {
  it('is a card on the theme surface with the strong edge and 12px corners', () => {
    mount()
    const panel = open().closest<HTMLElement>('[data-menu-panel]')
    if (!panel) throw new Error('the panel was not found')
    expect(panel).toHaveStyle({
      background: themes['light-flat'].bgSurface,
      border: `1px solid ${themes['light-flat'].borderStrong}`,
      borderRadius: '12px',
    })
  })

  it('takes every colour from the dark theme: surface, search box, chosen row', () => {
    localStorage.setItem('fnc-theme', 'black')
    mount({ value: 'b' })
    const list = open()
    const panel = list.closest<HTMLElement>('[data-menu-panel]')
    if (!panel) throw new Error('the panel was not found')
    // the old list was a fixed #1e2030 here, a different dark from the page
    expect(panel).toHaveStyle({ background: themes.black.bgSurface })
    expect(screen.getByPlaceholderText(i18n.t('ui.select.search'))).toHaveStyle({
      background: themes.black.bgCanvas,
    })
    expect(row('Beta Office')).toHaveStyle({
      background: themes.black.accentHover,
      color: themes.black.accentSolid,
    })
    expect(row('Gamma Office')).toHaveStyle({ color: themes.black.textPrimary })
  })

  it('gives the chosen row the solid accent text, the stronger tint, and a tick', () => {
    mount({ value: 'b' })
    open()
    const chosen = row('Beta Office')
    expect(chosen).toHaveStyle({
      background: themes['light-flat'].accentHover,
      color: themes['light-flat'].accentSolid,
    })
    expect(chosen.querySelector('svg')).not.toBeNull()
    // the other rows carry no tick
    expect(row('Gamma Office').querySelector('svg')).toBeNull()
  })

  it('tints the row under the pointer with the accent, and moves the tint with it', () => {
    mount({ value: 'b' })
    open()
    fireEvent.mouseEnter(row('Gamma Office'))
    expect(row('Gamma Office')).toHaveStyle({ background: themes['light-flat'].accentBg })
    expect(row('Alpha Office')).toHaveStyle({ background: 'transparent' })
    // the chosen row keeps its own, stronger tint
    expect(row('Beta Office')).toHaveStyle({ background: themes['light-flat'].accentHover })
  })

  it('draws the "no choice" row apart: secondary text, italic, a hairline under it, no tick, no selected tint', () => {
    mount({ value: '' })
    open()
    const none = rows()[0]
    expect(none).toHaveStyle({ color: themes['light-flat'].textSecondary, fontStyle: 'italic' })
    expect(none.querySelector('svg')).toBeNull()
    const after = none.nextElementSibling
    expect(after).toHaveAttribute('aria-hidden', 'true')
    expect(after).toHaveStyle({ height: '1px' })
    // and no other row has a hairline after it
    expect(row('Alpha Office').nextElementSibling).toBe(row('Beta Office'))
  })

  it('shows the code chip in the readable grey, and in the accent on the chosen row', () => {
    mount({ value: 'a' })
    open()
    const chip = within(row('Alpha Office')).getByText('A-1')
    expect(chip).toHaveStyle({ color: themes['light-flat'].accentSolid })
    fireEvent.click(screen.getByText('Select branch…'))
  })

  it('says "No results" in the readable grey when the search finds nothing', () => {
    mount()
    open()
    fireEvent.change(screen.getByPlaceholderText(i18n.t('ui.select.search')), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText(i18n.t('ui.select.noResults'))).toHaveStyle({
      color: themes['light-flat'].textSecondary,
    })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('draws 44px rows and a 44px search box on a phone, and 40px / 38px elsewhere', () => {
    setWidth(390)
    const phone = mount()
    open()
    expect(rows()[1]).toHaveStyle({ minHeight: '44px', fontSize: '15px' })
    expect(screen.getByPlaceholderText(i18n.t('ui.select.search'))).toHaveStyle({ height: '44px' })
    phone.unmount()
    setWidth(1400)
    mount()
    open()
    expect(rows()[1]).toHaveStyle({ minHeight: '40px', fontSize: '13px' })
    expect(screen.getByPlaceholderText(i18n.t('ui.select.search'))).toHaveStyle({ height: '38px' })
  })

  it('draws the search box focus as the accent edge with a halo, without re-drawing the rows', () => {
    mount()
    open()
    const input = screen.getByPlaceholderText(i18n.t('ui.select.search'))
    expect(input).toHaveStyle({ borderColor: themes['light-flat'].borderInput })
    fireEvent.focus(input)
    expect(input).toHaveStyle({ borderColor: themes['light-flat'].accent })
    expect(input.style.boxShadow).toBe(menuFocusRing(themes['light-flat']))
    fireEvent.blur(input)
    expect(input).toHaveStyle({ borderColor: themes['light-flat'].borderInput })
    expect(input.style.boxShadow).toBe('none')
  })
})

describe('SearchableSelect: the Arabic line and names', () => {
  it('keeps the Arabic line at the start of the row: the block follows the page, only the text is right to left', () => {
    mount({ value: 'a' })
    open()
    const arabic = within(row('Alpha Office')).getByText('ألفا')
    expect(arabic).toHaveAttribute('dir', 'rtl')
    const block = arabic.parentElement
    // the old element was `dir="rtl"` with a physical `text-align: left`, so in an Arabic page it still hung to the left
    expect(block).toHaveStyle({ textAlign: 'start', display: 'block' })
    expect(block).not.toHaveAttribute('dir')
  })

  it('does the same in the field itself, once chosen', () => {
    mount({ value: 'a' })
    const arabic = within(trigger()).getByText('ألفا')
    expect(arabic).toHaveAttribute('dir', 'rtl')
    expect(arabic.parentElement).toHaveStyle({ textAlign: 'start' })
  })

  it('isolates an option name, so an English name keeps its punctuation order in a right-to-left row', async () => {
    await i18n.changeLanguage('ar')
    mount({ value: 'b' })
    open()
    expect(within(row('Beta Office')).getByText('Beta Office').tagName).toBe('BDI')
    expect(within(trigger()).getByText('Beta Office').tagName).toBe('BDI')
  })
})

describe('SearchableSelect: keeping the keyboard where it was', () => {
  it('gives focus back to the field when a choice is made', () => {
    const { onChange } = mount()
    open()
    fireEvent.keyDown(screen.getByPlaceholderText(i18n.t('ui.select.search')), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByPlaceholderText(i18n.t('ui.select.search')), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('a')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('gives focus back to the field on Escape, and the key does not go on to close a dialog around it', () => {
    mount()
    const outer = vi.fn()
    document.addEventListener('keydown', outer)
    open()
    fireEvent.keyDown(screen.getByPlaceholderText(i18n.t('ui.select.search')), { key: 'Escape' })
    document.removeEventListener('keydown', outer)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger()).toHaveFocus()
    expect(outer).not.toHaveBeenCalled()
  })

  it('closes on Tab, the way a native select does, with focus on the field so Tab goes on from there', () => {
    mount()
    open()
    fireEvent.keyDown(screen.getByPlaceholderText(i18n.t('ui.select.search')), { key: 'Tab' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('does not take focus back from whatever the person clicked outside the list', () => {
    mount()
    open()
    const after = screen.getByRole('button', { name: 'after' })
    after.focus()
    fireEvent.mouseDown(after)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(after).toHaveFocus()
  })

  it('opens from the keyboard on Enter, Space and ArrowDown', () => {
    mount()
    for (const key of ['Enter', ' ', 'ArrowDown']) {
      fireEvent.keyDown(trigger(), { key })
      expect(screen.queryByRole('listbox')).not.toBeNull()
      fireEvent.keyDown(screen.getByPlaceholderText(i18n.t('ui.select.search')), { key: 'Escape' })
      expect(screen.queryByRole('listbox')).toBeNull()
    }
  })
})

describe('SearchableSelect: the focus ring on the field', () => {
  // Say what the browser would answer for ":focus-visible" and leave every other selector alone.
  const focusVisible = (answer: boolean) => {
    // Always called with the element as `this`, so reading it unbound is safe.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Element.prototype.matches
    return vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible' ? answer : original.call(this, selector)
    })
  }

  it('draws the accent edge and a halo for keyboard focus', () => {
    focusVisible(true)
    mount()
    fireEvent.focus(trigger())
    expect(trigger()).toHaveStyle({ border: `1px solid ${themes['light-flat'].accent}` })
    expect(trigger().style.boxShadow).toBe(menuFocusRing(themes['light-flat']))
  })

  it('draws nothing extra after a mouse click that merely focused it', () => {
    focusVisible(false)
    mount()
    fireEvent.focus(trigger())
    expect(trigger()).toHaveStyle({ border: `1px solid ${themes['light-flat'].borderField}` })
    expect(trigger().style.boxShadow).toBe('none')
  })

  it('takes the ring away on blur', () => {
    focusVisible(true)
    mount()
    fireEvent.focus(trigger())
    fireEvent.blur(trigger())
    expect(trigger().style.boxShadow).toBe('none')
  })
})

describe('SearchableSelect: scrolling the list', () => {
  it('does not re-place the list (or re-draw its rows) when the list itself scrolls, but follows the page', () => {
    mount()
    const list = open()
    const field = trigger()
    let measuredField = 0
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this === field) measuredField++
      return original.call(this)
    })
    fireEvent.scroll(list)
    expect(measuredField).toBe(0)
    // a scroll of the page behind it moves the list with the field
    fireEvent.scroll(document.body)
    expect(measuredField).toBeGreaterThan(0)
  })
})
