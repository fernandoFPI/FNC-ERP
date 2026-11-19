// The "⋯" menu that holds Print and Cancel in the page header on a phone.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { OverflowMenu } from '../OverflowMenu'

const show = () => {
  const onPrint = vi.fn()
  const onCancel = vi.fn()
  render(
    <ThemeProvider>
      <div>
        <span>outside</span>
        <OverflowMenu
          label="More actions"
          items={[
            { key: 'print', label: 'Print', onSelect: onPrint },
            { key: 'cancel', label: 'Cancel requisition', onSelect: onCancel, danger: true },
          ]}
        />
      </div>
    </ThemeProvider>,
  )
  return { onPrint, onCancel }
}
const trigger = () => screen.getByRole('button', { name: 'More actions' })

describe('OverflowMenu', () => {
  it('starts closed, named for a screen reader, and says it opens a menu', () => {
    show()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('is big enough to tap', () => {
    show()
    expect(trigger()).toHaveStyle({ width: '44px', height: '44px' })
  })

  it('opens the list and moves focus to its first item', () => {
    show()
    fireEvent.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Print',
      'Cancel requisition',
    ])
    expect(screen.getByRole('menuitem', { name: 'Print' })).toHaveFocus()
  })

  it('runs the chosen action once and closes', () => {
    const { onPrint, onCancel } = show()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print' }))
    expect(onPrint).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('draws the destructive action in the danger colour and the other in the normal one', () => {
    show()
    fireEvent.click(trigger())
    expect(screen.getByRole('menuitem', { name: 'Cancel requisition' })).toHaveStyle({
      color: themes['light-flat'].danger,
    })
    expect(screen.getByRole('menuitem', { name: 'Print' })).toHaveStyle({
      color: themes['light-flat'].textPrimary,
    })
  })

  it('closes on Escape and gives focus back to the button', () => {
    show()
    fireEvent.click(trigger())
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Print' }), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('closes on a click outside, and not on a click inside', () => {
    show()
    fireEvent.click(trigger())
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves between the items with the arrow keys, wrapping round', () => {
    show()
    fireEvent.click(trigger())
    const [print, cancel] = screen.getAllByRole('menuitem')
    fireEvent.keyDown(print, { key: 'ArrowDown' })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(cancel, { key: 'ArrowDown' })
    expect(print).toHaveFocus()
    fireEvent.keyDown(print, { key: 'ArrowUp' })
    expect(cancel).toHaveFocus()
  })

  it('a second press on the button closes it again', () => {
    show()
    fireEvent.click(trigger())
    fireEvent.click(trigger())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('draws nothing at all when there is nothing to offer', () => {
    const { container } = render(
      <ThemeProvider>
        <OverflowMenu label="More actions" items={[]} />
      </ThemeProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  describe('a disabled item', () => {
    const showWithDisabled = () => {
      const onPrint = vi.fn()
      const onDelete = vi.fn()
      const onEdit = vi.fn()
      render(
        <ThemeProvider>
          <OverflowMenu
            label="More actions"
            items={[
              { key: 'print', label: 'Print', onSelect: onPrint },
              { key: 'delete', label: 'Delete', onSelect: onDelete, danger: true, disabled: true },
              { key: 'edit', label: 'Edit', onSelect: onEdit },
            ]}
          />
        </ThemeProvider>,
      )
      fireEvent.click(trigger())
      return { onPrint, onDelete, onEdit }
    }

    it('is drawn, but cannot be chosen', () => {
      const { onDelete } = showWithDisabled()
      const item = screen.getByRole('menuitem', { name: 'Delete' })
      expect(item).toBeDisabled()
      fireEvent.click(item)
      expect(onDelete).not.toHaveBeenCalled()
      // the menu stays open: nothing was chosen
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('looks unavailable', () => {
      showWithDisabled()
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveStyle({
        opacity: '0.5',
        cursor: 'not-allowed',
      })
      expect(screen.getByRole('menuitem', { name: 'Print' })).toHaveStyle({ opacity: '1' })
    })

    it('is skipped by the arrow keys in both directions', () => {
      showWithDisabled()
      const print = screen.getByRole('menuitem', { name: 'Print' })
      const edit = screen.getByRole('menuitem', { name: 'Edit' })
      expect(print).toHaveFocus()
      fireEvent.keyDown(print, { key: 'ArrowDown' })
      expect(edit).toHaveFocus()
      fireEvent.keyDown(edit, { key: 'ArrowUp' })
      expect(print).toHaveFocus()
    })

    it('does not stop the other items working', () => {
      const { onPrint } = showWithDisabled()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Print' }))
      expect(onPrint).toHaveBeenCalledTimes(1)
    })
  })

  // jsdom has no layout, so the button's box is stubbed and the menu's own inline position is read back.
  describe('where the list appears', () => {
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight

    function stubButtonBox(box: { left: number; right: number; top: number; bottom: number }) {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        ...box,
        width: box.right - box.left,
        height: box.bottom - box.top,
        x: box.left,
        y: box.top,
        toJSON: () => ({}),
      })
    }
    const setWindow = (width: number, height: number) => {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
    }

    beforeEach(() => {
      setWindow(390, 844)
    })
    afterEach(async () => {
      vi.restoreAllMocks()
      setWindow(originalWidth, originalHeight)
      await i18n.changeLanguage('en')
    })

    it('is drawn at the end of the page, so a card around the button cannot clip it', () => {
      stubButtonBox({ left: 340, right: 384, top: 20, bottom: 64 })
      const { container } = render(
        <ThemeProvider>
          <OverflowMenu label="More actions" items={[{ key: 'p', label: 'Print', onSelect: vi.fn() }]} />
        </ThemeProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      const menu = screen.getByRole('menu')
      expect(container.contains(menu)).toBe(false)
      expect(menu.parentElement).toBe(document.body)
    })

    it('lines its right edge up with the button in English, just under it', () => {
      stubButtonBox({ left: 336, right: 380, top: 20, bottom: 64 })
      show()
      fireEvent.click(trigger())
      const menu = screen.getByRole('menu')
      // 380 (button's right edge) - 200 (the menu's minimum width) = 180
      expect(menu.style.left).toBe('180px')
      expect(menu.style.top).toBe('70px') // 64 + 6
      expect(menu.style.position).toBe('fixed')
    })

    it('is kept 8px inside the window when the button is at the very edge', () => {
      stubButtonBox({ left: 340, right: 390, top: 20, bottom: 64 })
      show()
      fireEvent.click(trigger())
      // 390 - 200 - 8: the menu's right edge stays 8px from the window's
      expect(screen.getByRole('menu').style.left).toBe('182px')
    })

    it('lines its left edge up with the button in Arabic', async () => {
      await i18n.changeLanguage('ar')
      // well inside the window, so the 8px edge clamp cannot give the same answer as the alignment does
      stubButtonBox({ left: 100, right: 144, top: 20, bottom: 64 })
      show()
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      expect(screen.getByRole('menu').style.left).toBe('100px')
    })

    it('does not line the right edge up in Arabic: the menu would run off the left of the window', async () => {
      await i18n.changeLanguage('ar')
      // English alignment would put it at 144 - 200 = -56px, which the clamp turns into 8px
      stubButtonBox({ left: 100, right: 144, top: 20, bottom: 64 })
      show()
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      expect(screen.getByRole('menu').style.left).not.toBe('8px')
    })

    it('stays inside the window at the left edge', () => {
      stubButtonBox({ left: 4, right: 48, top: 20, bottom: 64 })
      show()
      fireEvent.click(trigger())
      expect(screen.getByRole('menu').style.left).toBe('8px')
    })

    it('opens upward when the button is near the bottom of the window', () => {
      stubButtonBox({ left: 340, right: 384, top: 790, bottom: 834 })
      show()
      fireEvent.click(trigger())
      const menu = screen.getByRole('menu')
      expect(menu.style.bottom).toBe('60px') // 844 - 790 + 6
      expect(menu.style.top).toBe('')
    })

    it('follows the button when the window is resized', () => {
      stubButtonBox({ left: 340, right: 384, top: 20, bottom: 64 })
      show()
      fireEvent.click(trigger())
      expect(screen.getByRole('menu').style.top).toBe('70px')
      stubButtonBox({ left: 340, right: 384, top: 120, bottom: 164 })
      fireEvent(window, new Event('resize'))
      expect(screen.getByRole('menu').style.top).toBe('170px')
    })
  })

  describe('rows', () => {
    it('takes the accent tint under the pointer and gives it back', () => {
      show()
      fireEvent.click(trigger())
      const row = screen.getByRole('menuitem', { name: 'Cancel requisition' })
      expect(row).toHaveStyle({ background: 'transparent' })
      fireEvent.mouseEnter(row)
      // a danger row tints red, not with the accent
      expect(row).toHaveStyle({ background: themes['light-flat'].dangerBg })
      fireEvent.mouseLeave(row)
      expect(row).toHaveStyle({ background: 'transparent' })
    })

    it('tints an ordinary row with the accent', () => {
      show()
      fireEvent.click(trigger())
      const row = screen.getByRole('menuitem', { name: 'Print' })
      fireEvent.mouseEnter(row)
      expect(row).toHaveStyle({ background: themes['light-flat'].accentBg })
    })

    it('keeps a disabled row untinted, dimmed and not clickable', () => {
      const onSelect = vi.fn()
      render(
        <ThemeProvider>
          <OverflowMenu
            label="More actions"
            items={[{ key: 'd', label: 'Delete', onSelect, disabled: true }]}
          />
        </ThemeProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      const row = screen.getByRole('menuitem', { name: 'Delete' })
      fireEvent.mouseEnter(row)
      expect(row).toBeDisabled()
      expect(row).toHaveStyle({ background: 'transparent', opacity: '0.5' })
    })
  })
})
