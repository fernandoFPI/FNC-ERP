// The theme switcher as a menu: radio rows with the current theme checked, the keyboard, and the choice taking effect, closing the menu
// and giving the keyboard back to the button. (The panel opening and closing on an outside press is in ThemeSwitcher.test.tsx.)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { ThemeSwitcher } from '../ThemeSwitcher'

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value')
  return value
}

const light = themes['light-flat']

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
})

const show = () =>
  render(
    <ThemeProvider>
      <ThemeSwitcher />
    </ThemeProvider>,
  )
const trigger = () => screen.getByRole('button', { name: 'Switch theme' })
const open = () => fireEvent.click(trigger())
const radio = (name: RegExp) => screen.getByRole('menuitemradio', { name })

describe('ThemeSwitcher menu', () => {
  it('says it opens a menu, and whether it is open', () => {
    show()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    open()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Theme' })).toBeInTheDocument()
  })

  it('offers each theme as a radio row, the current one checked, and gives the first the keyboard', () => {
    show()
    open()
    expect(radio(/Light flat/)).toHaveAttribute('aria-checked', 'true')
    expect(radio(/Black/)).toHaveAttribute('aria-checked', 'false')
    expect(radio(/Light flat/)).toHaveFocus()
  })

  it("reads each theme's description in the readable grey", () => {
    show()
    open()
    expect(screen.getByText(light.description)).toHaveStyle({ color: light.textSecondary })
  })

  it('hides the little preview from a screen reader (it only shows the colours)', () => {
    show()
    open()
    const preview = radio(/Light flat/).querySelector('span[aria-hidden="true"]')
    expect(preview).not.toBeNull()
  })

  it('switches theme when a row is chosen, remembers it, closes the menu and gives the keyboard back', () => {
    show()
    open()
    fireEvent.click(radio(/Black/))
    expect(localStorage.getItem('fnc-theme')).toBe('black')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('shows the moon while the dark theme is on and the sun in the light one', () => {
    localStorage.setItem('fnc-theme', 'black')
    const { unmount } = show()
    expect(trigger().querySelector('circle')).toBeNull()
    unmount()
    localStorage.setItem('fnc-theme', 'light-flat')
    show()
    expect(trigger().querySelector('circle')).not.toBeNull()
  })

  it('moves between the rows with the arrow keys and closes on Escape', () => {
    show()
    open()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(radio(/Black/)).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it("opens toward the start of the page from the button's own edge, in the logical direction", () => {
    show()
    open()
    const panel = must(screen.getByRole('menu').parentElement)
    expect(panel.style.insetInlineEnd).toBe('0')
  })
})
