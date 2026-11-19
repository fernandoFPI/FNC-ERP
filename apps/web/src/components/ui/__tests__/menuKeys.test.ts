// The keyboard of every menu in the app (the row "⋯" menu and the company, theme and user menus of the top bar): the arrow keys
// move between the rows and wrap round, Home and End jump to the ends, Escape closes and hands the focus back to the button, and
// Tab closes. One function, so they all answer the same keys.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { KeyboardEvent } from 'react'
import { focusMenuRow, handleMenuKeyDown, menuRows } from '../menuKeys'

let panel: HTMLElement

const addRow = (role: string, text: string) => {
  const b = document.createElement('button')
  b.setAttribute('role', role)
  b.textContent = text
  panel.appendChild(b)
  return b
}
const press = (key: string) => {
  const e = { key, preventDefault: vi.fn() }
  const actions = { close: vi.fn(), restoreFocus: vi.fn() }
  handleMenuKeyDown(e as unknown as KeyboardEvent, panel, actions)
  return { e, ...actions }
}

beforeEach(() => {
  panel = document.createElement('div')
  document.body.appendChild(panel)
})
afterEach(() => {
  panel.remove()
})

describe('menuRows', () => {
  it('lists the menu items and the radio items, and nothing else in the panel', () => {
    const a = addRow('menuitem', 'Open')
    const b = addRow('menuitemradio', 'Light')
    addRow('button', 'not a row')
    expect(menuRows(panel)).toEqual([a, b])
  })

  it('is empty for no panel', () => {
    expect(menuRows(null)).toEqual([])
  })
})

describe('handleMenuKeyDown', () => {
  let rows: HTMLElement[]
  beforeEach(() => {
    rows = [addRow('menuitem', 'A'), addRow('menuitemradio', 'B'), addRow('menuitem', 'C')]
  })

  it('moves down one row at a time and wraps from the last to the first', () => {
    rows[0].focus()
    press('ArrowDown')
    expect(rows[1]).toHaveFocus()
    press('ArrowDown')
    expect(rows[2]).toHaveFocus()
    press('ArrowDown')
    expect(rows[0]).toHaveFocus()
  })

  it('moves up one row at a time and wraps from the first to the last', () => {
    rows[1].focus()
    press('ArrowUp')
    expect(rows[0]).toHaveFocus()
    press('ArrowUp')
    expect(rows[2]).toHaveFocus()
  })

  it('goes to the first row on ArrowDown, and to the LAST on ArrowUp, when the focus is not on a row yet', () => {
    panel.tabIndex = -1
    panel.focus()
    press('ArrowDown')
    expect(rows[0]).toHaveFocus()
    panel.focus()
    press('ArrowUp')
    expect(rows[2]).toHaveFocus()
  })

  it('jumps to the ends with Home and End', () => {
    rows[1].focus()
    press('End')
    expect(rows[2]).toHaveFocus()
    press('Home')
    expect(rows[0]).toHaveFocus()
  })

  it('stops the page from scrolling on the keys it uses', () => {
    rows[0].focus()
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(press(key).e.preventDefault).toHaveBeenCalledTimes(1)
    }
  })

  it('closes on Escape and gives the keyboard back to the button, in that order', () => {
    rows[0].focus()
    const order: string[] = []
    const e = { key: 'Escape', preventDefault: vi.fn() }
    handleMenuKeyDown(e as unknown as KeyboardEvent, panel, {
      close: () => order.push('close'),
      restoreFocus: () => order.push('restore'),
    })
    expect(order).toEqual(['close', 'restore'])
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('closes on Tab without keeping the focus or stopping the Tab', () => {
    const r = press('Tab')
    expect(r.close).toHaveBeenCalledTimes(1)
    expect(r.restoreFocus).not.toHaveBeenCalled()
    expect(r.e.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores every other key', () => {
    rows[0].focus()
    for (const key of ['a', 'Enter', ' ', 'ArrowLeft']) {
      const r = press(key)
      expect(r.close).not.toHaveBeenCalled()
      expect(r.restoreFocus).not.toHaveBeenCalled()
      expect(r.e.preventDefault).not.toHaveBeenCalled()
    }
    expect(rows[0]).toHaveFocus()
  })

  it('does nothing, and does not throw, in a menu with no rows', () => {
    panel.innerHTML = ''
    expect(() => press('ArrowDown')).not.toThrow()
    expect(() => press('End')).not.toThrow()
    expect(() => {
      focusMenuRow(panel, 3)
    }).not.toThrow()
  })
})
