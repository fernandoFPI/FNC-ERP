// The parts the top bar's controls and menus are built from: the 36px button (a ring for the keyboard only), the open / close state
// of a menu (a press outside closes it, the first row takes the keyboard, Escape gives it back), and the menu card and rows.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import {
  MenuCaption,
  MenuRow,
  MenuTick,
  ShellMenuPanel,
  TopbarButton,
  shellFocusRing,
  useShellMenu,
} from '../shellParts'

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value')
  return value
}

const light = themes['light-flat']

afterEach(() => {
  vi.restoreAllMocks()
})

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

describe('TopbarButton', () => {
  const show = (props: Partial<React.ComponentProps<typeof TopbarButton>> = {}) => {
    render(
      <ThemeProvider>
        <TopbarButton aria-label="Thing" {...props}>
          x
        </TopbarButton>
      </ThemeProvider>,
    )
    return screen.getByRole('button', { name: 'Thing' })
  }

  it('is a 36px button with 10px corners that never submits a form', () => {
    const b = show()
    expect(b).toHaveAttribute('type', 'button')
    expect(b).toHaveStyle({ height: '36px', minWidth: '36px', borderRadius: '10px' })
  })

  it('is quiet at rest and takes the soft tint and the stronger text under the pointer', () => {
    const b = show()
    expect(b).toHaveStyle({ background: 'transparent', color: light.textSecondary })
    fireEvent.mouseEnter(b)
    expect(b).toHaveStyle({ background: light.bgSurfaceHover, color: light.textPrimary })
    fireEvent.mouseLeave(b)
    expect(b).toHaveStyle({ background: 'transparent', color: light.textSecondary })
  })

  it('still runs the pointer handlers the caller gave it', () => {
    const onMouseEnter = vi.fn()
    const onMouseLeave = vi.fn()
    const b = show({ onMouseEnter, onMouseLeave })
    fireEvent.mouseEnter(b)
    expect(onMouseEnter).toHaveBeenCalledTimes(1)
    expect(onMouseLeave).not.toHaveBeenCalled()
    fireEvent.mouseLeave(b)
    expect(onMouseLeave).toHaveBeenCalledTimes(1)
  })

  it('takes the accent tint and the solid accent text while its menu is open', () => {
    const b = show({ active: true })
    expect(b).toHaveStyle({ background: light.accentBg, color: light.accentSolid })
  })

  it('has no edge unless it holds a value or opens a search, which get the readable edge', () => {
    const plain = show()
    expect(plain).toHaveStyle({ border: '1px solid transparent' })
    document.body.innerHTML = ''
    const edged = show({ bordered: true })
    expect(edged).toHaveStyle({ border: `1px solid ${light.borderField}` })
  })

  it('turns the readable edge to the solid accent while its menu is open, and gives an open plain button no edge', () => {
    const open = show({ bordered: true, active: true })
    expect(open).toHaveStyle({ border: `1px solid ${light.accentSolid}` })
    document.body.innerHTML = ''
    const plainOpen = show({ active: true })
    expect(plainOpen).toHaveStyle({ border: '1px solid transparent' })
  })

  it('draws the keyboard ring only for keyboard focus, never after a click, and takes it off on blur', () => {
    const b = show()
    const spy = focusVisible(true)
    fireEvent.focus(b)
    expect(b.style.boxShadow).toBe(shellFocusRing(light))
    fireEvent.blur(b)
    expect(b.style.boxShadow).toBe('none')
    spy.mockRestore()
    focusVisible(false)
    fireEvent.focus(b)
    expect(b.style.boxShadow).toBe('none')
  })

  it('lets the caller override its look (the round avatar)', () => {
    const b = show({ style: { width: '36px', borderRadius: '50%', padding: 0 } })
    expect(b).toHaveStyle({ borderRadius: '50%' })
  })
})

describe('shellFocusRing', () => {
  it('is a gap and then the solid accent, in both themes (the 12% menu ring is too faint to tab by)', () => {
    for (const key of ['light-flat', 'black'] as const) {
      expect(shellFocusRing(themes[key])).toBe(
        `0 0 0 2px ${themes[key].bgSurface}, 0 0 0 4px ${themes[key].accentSolid}`,
      )
    }
  })
})

// A tiny menu built from the parts, so the hook is tested the way the real menus use it.
function Demo({ onOpen }: { onOpen?: () => void }) {
  const menu = useShellMenu(onOpen)
  return (
    <div>
      <span>outside</span>
      <div ref={menu.containerRef}>
        <TopbarButton
          ref={menu.triggerRef}
          aria-label="Open demo"
          aria-expanded={menu.open}
          onClick={menu.toggle}
        >
          o
        </TopbarButton>
        {menu.open && (
          <ShellMenuPanel
            align="end"
            label="Demo menu"
            panelRef={menu.panelRef}
            onKeyDown={menu.onKeyDown}
            header={<MenuCaption>Caption</MenuCaption>}
          >
            <MenuRow role="menuitemradio" checked onSelect={vi.fn()}>
              One <MenuTick />
            </MenuRow>
            <MenuRow role="menuitemradio" onSelect={vi.fn()}>
              Two
            </MenuRow>
            <MenuRow danger onSelect={vi.fn()}>
              Three
            </MenuRow>
          </ShellMenuPanel>
        )}
      </div>
    </div>
  )
}

const mount = (onOpen?: () => void) =>
  render(
    <ThemeProvider>
      <Demo onOpen={onOpen} />
    </ThemeProvider>,
  )
const trigger = () => screen.getByRole('button', { name: 'Open demo' })

describe('useShellMenu', () => {
  it('starts closed', () => {
    mount()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens a named menu and gives the keyboard to its first row', () => {
    mount()
    fireEvent.click(trigger())
    expect(screen.getByRole('menu', { name: 'Demo menu' })).toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitemradio', { name: /One/ })).toHaveFocus()
  })

  it('closes with a second press of the button', () => {
    mount()
    fireEvent.click(trigger())
    fireEvent.click(trigger())
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('runs the open callback when it opens, and not when it closes', () => {
    const onOpen = vi.fn()
    mount(onOpen)
    fireEvent.click(trigger())
    expect(onOpen).toHaveBeenCalledTimes(1)
    fireEvent.click(trigger())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('closes on a press outside, but not on a press inside', () => {
    mount()
    fireEvent.click(trigger())
    fireEvent.mouseDown(screen.getByRole('menuitemradio', { name: /Two/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('stays open when the pointer leaves it (the old user menu vanished on mouse-leave)', () => {
    mount()
    fireEvent.click(trigger())
    const menu = screen.getByRole('menu')
    fireEvent.mouseLeave(menu)
    fireEvent.mouseLeave(must(menu.parentElement))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('closes on Escape and gives the keyboard back to the button', () => {
    mount()
    fireEvent.click(trigger())
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('moves between the rows with the arrow keys', () => {
    mount()
    fireEvent.click(trigger())
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: /Two/ })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus()
  })

  it('closes on Tab', () => {
    mount()
    fireEvent.click(trigger())
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('ShellMenuPanel and MenuRow', () => {
  it('marks the panel for the reduced-motion rule, animates it in, and keeps it inside the window', () => {
    mount()
    fireEvent.click(trigger())
    const panel = must(screen.getByRole('menu').parentElement)
    expect(panel).toHaveAttribute('data-menu-panel')
    expect(panel.style.animation).toContain('fnc-menu-in')
    expect(panel.style.maxWidth).toBe('calc(100vw - 24px)')
  })

  it('keeps the rows out of the Tab order (the arrow keys move between them)', () => {
    mount()
    fireEvent.click(trigger())
    const rows = [...screen.getAllByRole('menuitemradio'), ...screen.getAllByRole('menuitem')]
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(r).toHaveAttribute('tabindex', '-1')
  })

  it('tints a row while the keyboard is on it, and takes the tint off when it leaves', () => {
    mount()
    fireEvent.click(trigger())
    const two = screen.getByRole('menuitemradio', { name: /Two/ })
    const resting = two.style.background
    act(() => {
      two.focus()
    })
    expect(two.style.background).not.toBe(resting)
    const focused = two.style.background
    act(() => {
      two.blur()
    })
    expect(two.style.background).toBe(resting)
    expect(focused).not.toBe('')
  })

  it('puts the tick on the side the row ends, whichever way the page reads', () => {
    mount()
    fireEvent.click(trigger())
    const tick = must(screen.getByRole('menuitemradio', { name: /One/ }).querySelector('svg'))
    expect(tick).toHaveAttribute('aria-hidden', 'true')
    expect(tick.style.marginInlineStart).toBe('auto')
    expect(tick.style.marginLeft).toBe('')
  })

  it('reads the caption in the readable grey, never the pale one', () => {
    mount()
    fireEvent.click(trigger())
    expect(screen.getByText('Caption')).toHaveStyle({ color: light.textSecondary })
    expect(screen.getByText('Caption')).not.toHaveStyle({ color: light.textMuted })
  })

  it('draws the header outside the menu, so a heading is not read as a row', () => {
    mount()
    fireEvent.click(trigger())
    expect(screen.getByText('Caption')).toBeInTheDocument()
    expect(screen.getByRole('menu')).not.toContainElement(screen.getByText('Caption'))
  })

  it('says which radio row is chosen, and gives a plain row no checked state', () => {
    mount()
    fireEvent.click(trigger())
    expect(screen.getByRole('menuitemradio', { name: /One/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemradio', { name: /Two/ })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('menuitem', { name: 'Three' })).not.toHaveAttribute('aria-checked')
  })

  it('draws the chosen row stronger and a danger row in the danger colour', () => {
    mount()
    fireEvent.click(trigger())
    expect(screen.getByRole('menuitemradio', { name: /One/ })).toHaveStyle({
      color: light.accentSolid,
    })
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveStyle({ color: light.danger })
    expect(screen.getByRole('menuitemradio', { name: /Two/ })).toHaveStyle({
      color: light.textPrimary,
    })
  })

  it('opens toward the start of the page for `end` and toward its end for `start`, in the logical direction', () => {
    const { unmount } = mount()
    fireEvent.click(trigger())
    const panel = must(screen.getByRole('menu').parentElement)
    expect(panel.style.insetInlineEnd).toBe('0')
    unmount()
    render(
      <ThemeProvider>
        <ShellMenuPanel
          align="start"
          label="x"
          panelRef={{ current: null }}
          onKeyDown={() => undefined}
        >
          <MenuRow onSelect={() => undefined}>row</MenuRow>
        </ShellMenuPanel>
      </ThemeProvider>,
    )
    const startPanel = must(screen.getByRole('menu').parentElement)
    expect(startPanel.style.insetInlineStart).toBe('0')
    expect(startPanel.style.insetInlineEnd).toBe('')
  })

  it("runs the row's action when it is pressed", () => {
    const onSelect = vi.fn()
    render(
      <ThemeProvider>
        <MenuRow onSelect={onSelect}>Go</MenuRow>
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('draws the tick as a hidden icon, so the choice is not carried by colour alone but is not read twice', () => {
    mount()
    fireEvent.click(trigger())
    const tick = screen.getByRole('menuitemradio', { name: /One/ }).querySelector('svg')
    expect(tick).toHaveAttribute('aria-hidden', 'true')
  })
})
