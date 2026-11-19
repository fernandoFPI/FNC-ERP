import type { CSSProperties } from 'react'
import type { ThemeTokens } from '../../theme/tokens'

/**
 * The look of every list that opens over the page (the searchable select's list, the Columns menu, the "⋯" menu):
 * one panel, one row. It sits beside the field look in `fieldStyles.ts` and follows the same rules, so a picker and
 * the list it opens read as one control:
 *
 *  - the panel is a card (12px corners) and its rows are 8px pills inside 6px of padding, so the corners are concentric;
 *  - a row under the pointer or the keyboard takes the accent tint, the chosen one a stronger tint with the solid
 *    accent text (the pale accent is 4.19:1 on its own tint, `accentSolid` is above 4.5:1 on both) and a tick, so the
 *    choice is not carried by colour alone;
 *  - every colour is a theme token (the old list used `#ffffff`, `#1a1a2e` and an indigo that is not the accent, which
 *    looked wrong in the dark theme).
 *
 * The entrance animation is `fnc-menu-in` (themes.css); a person who asked for less motion gets none.
 */

export const MENU_PANEL_RADIUS = 12
export const MENU_ITEM_RADIUS = 8
/** Padding between the panel's edge and its rows. */
export const MENU_PADDING = 6

export function menuPanelStyle(theme: ThemeTokens, dark: boolean): CSSProperties {
  return {
    boxSizing: 'border-box',
    background: theme.bgSurface,
    border: `1px solid ${theme.borderStrong}`,
    borderRadius: `${MENU_PANEL_RADIUS}px`,
    boxShadow: dark
      ? '0 14px 36px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.4)'
      : '0 14px 36px rgba(26, 26, 46, 0.16), 0 2px 8px rgba(26, 26, 46, 0.08)',
    overflow: 'hidden',
  }
}

interface MenuItemState {
  /** Under the pointer, or reached with the arrow keys. */
  highlighted?: boolean
  /** The value that is currently chosen. */
  selected?: boolean
  danger?: boolean
  disabled?: boolean
  /** 44px rows on a phone, 40px elsewhere. */
  touch?: boolean
}

export function menuItemStyle(
  theme: ThemeTokens,
  {
    highlighted = false,
    selected = false,
    danger = false,
    disabled = false,
    touch = false,
  }: MenuItemState = {},
): CSSProperties {
  const background = disabled
    ? 'transparent'
    : selected
      ? theme.accentHover
      : highlighted
        ? danger
          ? theme.dangerBg
          : theme.accentBg
        : 'transparent'
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxSizing: 'border-box',
    width: '100%',
    minHeight: touch ? '44px' : '40px',
    padding: '8px 12px',
    borderRadius: `${MENU_ITEM_RADIUS}px`,
    background,
    color: danger ? theme.danger : selected ? theme.accentSolid : theme.textPrimary,
    fontSize: touch ? '15px' : '13px',
    fontWeight: selected ? 600 : 500,
    fontFamily: 'inherit',
    textAlign: 'start',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.1s',
  }
}

/** A hairline between groups of rows (for example the "no choice" row and the real ones). */
export function menuSeparatorStyle(theme: ThemeTokens): CSSProperties {
  return {
    height: '1px',
    margin: '4px 6px',
    background: theme.border,
    flexShrink: 0,
  }
}

/** The ring a control draws while it has keyboard focus (never after a mouse click). */
export function menuFocusRing(theme: ThemeTokens): string {
  return `0 0 0 3px ${theme.accentHover}`
}
