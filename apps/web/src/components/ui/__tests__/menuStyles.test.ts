// The one look of every list that opens over the page (the searchable select, the Columns menu, the "⋯" menu).
// Every colour is a theme token (the old list used #ffffff, #1a1a2e and an indigo that is not the accent, which read
// wrongly in the dark theme); the colour contrast of the tokens themselves is pinned in theme/__tests__/controlColours.
import { describe, it, expect } from 'vitest'
import { themes } from '../../../theme/tokens'
import {
  MENU_ITEM_RADIUS,
  MENU_PANEL_RADIUS,
  menuFocusRing,
  menuItemStyle,
  menuPanelStyle,
  menuSeparatorStyle,
} from '../menuStyles'

describe.each(Object.values(themes))('menu styles in the $key theme', (theme) => {
  const dark = theme.key === 'black'

  it('the panel is a card on the theme surface with the strong edge, and its corners are rounder than a row', () => {
    const s = menuPanelStyle(theme, dark)
    expect(s.background).toBe(theme.bgSurface)
    expect(s.border).toBe(`1px solid ${theme.borderStrong}`)
    expect(s.borderRadius).toBe(`${MENU_PANEL_RADIUS}px`)
    // concentric: the row's corners are smaller than the panel's, which has 6px of padding around the rows
    expect(MENU_ITEM_RADIUS).toBeLessThan(MENU_PANEL_RADIUS)
    expect(s.overflow).toBe('hidden')
  })

  it('has a deeper shadow in the dark theme, where a light one would not show', () => {
    expect(menuPanelStyle(theme, true).boxShadow).not.toBe(menuPanelStyle(theme, false).boxShadow)
  })

  it('a resting row has no fill, the primary text and the 8px corners', () => {
    const s = menuItemStyle(theme)
    expect(s.background).toBe('transparent')
    expect(s.color).toBe(theme.textPrimary)
    expect(s.borderRadius).toBe(`${MENU_ITEM_RADIUS}px`)
    expect(s.fontWeight).toBe(500)
  })

  it('a row under the pointer or the keyboard takes the accent tint', () => {
    expect(menuItemStyle(theme, { highlighted: true }).background).toBe(theme.accentBg)
  })

  it('the chosen row has the stronger tint, the solid accent text and a heavier weight', () => {
    const s = menuItemStyle(theme, { selected: true })
    expect(s.background).toBe(theme.accentHover)
    // accentSolid, not accent: the pale accent is 4.19:1 on its own tint in the light theme
    expect(s.color).toBe(theme.accentSolid)
    expect(s.fontWeight).toBe(600)
  })

  it('the chosen row keeps its own tint while the pointer is over it', () => {
    expect(menuItemStyle(theme, { selected: true, highlighted: true }).background).toBe(
      theme.accentHover,
    )
  })

  it('a danger row is red, and tints red (not with the accent) when highlighted', () => {
    expect(menuItemStyle(theme, { danger: true }).color).toBe(theme.danger)
    expect(menuItemStyle(theme, { danger: true, highlighted: true }).background).toBe(
      theme.dangerBg,
    )
  })

  it('a disabled row is never tinted, even when highlighted, and is dimmed and not clickable', () => {
    const s = menuItemStyle(theme, { disabled: true, highlighted: true })
    expect(s.background).toBe('transparent')
    expect(s.opacity).toBe(0.5)
    expect(s.cursor).toBe('not-allowed')
  })

  it('a row is 40px high, and 44px with 15px text on a phone', () => {
    expect(menuItemStyle(theme)).toMatchObject({ minHeight: '40px', fontSize: '13px' })
    expect(menuItemStyle(theme, { touch: true })).toMatchObject({
      minHeight: '44px',
      fontSize: '15px',
    })
  })

  it('the separator is a one pixel hairline in the border colour', () => {
    expect(menuSeparatorStyle(theme)).toMatchObject({ height: '1px', background: theme.border })
  })

  it('the keyboard ring is a 3px halo in the accent tint', () => {
    expect(menuFocusRing(theme)).toBe(`0 0 0 3px ${theme.accentHover}`)
  })
})
