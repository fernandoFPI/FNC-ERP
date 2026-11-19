import type { KeyboardEvent } from 'react'

/**
 * The keyboard of a menu (the row "⋯" menu, the company, theme and user menus of the top bar): the arrow keys move
 * between the rows and wrap round, Home and End jump to the ends, Escape closes and gives the focus back to the
 * button that opened it, and Tab closes (the focus is not left in a menu that is gone). One function, so every menu
 * in the app answers the same keys.
 */
export const MENU_ROW_SELECTOR = '[role="menuitem"], [role="menuitemradio"]'

export function menuRows(panel: HTMLElement | null): HTMLElement[] {
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>(MENU_ROW_SELECTOR)) : []
}

/** Gives the keyboard to the row at `index` (wrapping round the ends). */
export function focusMenuRow(panel: HTMLElement | null, index: number): void {
  const rows = menuRows(panel)
  if (rows.length === 0) return
  rows[(index + rows.length) % rows.length].focus()
}

export function handleMenuKeyDown(
  e: KeyboardEvent,
  panel: HTMLElement | null,
  actions: { close: () => void; restoreFocus: () => void },
): void {
  const rows = menuRows(panel)
  const at = rows.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusMenuRow(panel, at + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    // from outside the rows (the menu itself has the focus) the last row is the one "above" the start
    focusMenuRow(panel, at < 0 ? rows.length - 1 : at - 1)
  } else if (e.key === 'Home') {
    e.preventDefault()
    focusMenuRow(panel, 0)
  } else if (e.key === 'End') {
    e.preventDefault()
    focusMenuRow(panel, rows.length - 1)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    actions.close()
    actions.restoreFocus()
  } else if (e.key === 'Tab') {
    actions.close()
  }
}
