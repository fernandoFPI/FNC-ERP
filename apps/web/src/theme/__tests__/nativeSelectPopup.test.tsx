// The open list of a native <select>. The Priority box on the New Requisition form had the field look closed and the
// browser's own grey popup open. Chrome and Edge 135+ can draw that popup from CSS (`appearance: base-select` and
// `::picker(select)`), so one stylesheet block now gives every <select> in the app the menu look of the searchable
// select's list, with no change to any markup. jsdom draws neither, so the rules are pinned from the source, and the
// variables they read are checked against what the theme actually publishes.
import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ThemeProvider } from '../ThemeContext'
import { themes } from '../tokens'

const css = readFileSync(path.resolve(__dirname, '../themes.css'), 'utf8').replace(/\r\n/g, '\n')
const context = readFileSync(path.resolve(__dirname, '../ThemeContext.tsx'), 'utf8')

// The block that holds the rules: from its @supports line to the next comment banner.
const start = css.indexOf('@supports (appearance: base-select)')
const end = css.indexOf('/* ── Global table scroll on mobile', start)
const block = css.slice(start, end)

// The declarations of the rule whose selector is exactly this one (alone on its line, so the combined
// `select, select::picker(select)` rule above is not mistaken for it).
const rule = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const all = [...block.matchAll(new RegExp(`^\\s*${escaped} \\{`, 'gm'))]
  // a line that follows a comma is the second selector of a combined rule, not a rule of its own
  const found = all.find((m) => !block.slice(0, m.index).trimEnd().endsWith(','))
  if (!found) throw new Error(`no rule for ${selector}`)
  return block.slice(found.index, block.indexOf('}', found.index))
}

describe('the native select popup block', () => {
  it('is there, and behind a feature test, so a browser without it keeps its own popup', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(block.startsWith('@supports (appearance: base-select)')).toBe(true)
  })

  it('turns on the customizable select for the box and for its list, over the inline `appearance: none`', () => {
    expect(block).toMatch(
      /select:not\(\[multiple\]\),\s*select:not\(\[multiple\]\)::picker\(select\)\s*\{\s*appearance: base-select !important;/,
    )
  })

  it('leaves a multiple select (a list box) alone', () => {
    const selectors = [...block.matchAll(/^\s*(select[^{]*)\{/gm)].map((m) => m[1])
    expect(selectors.length).toBeGreaterThan(5)
    for (const s of selectors) expect(s).toContain(':not([multiple])')
  })

  it('hands the chevron to the select itself: no background image, and the room that image needed is gone', () => {
    const box = rule('select:not([multiple])')
    expect(box).toMatch(/background-image: none !important/)
    expect(box).toMatch(/padding-inline-end: 12px !important/)
  })

  it('draws the chevron as ::picker-icon in the muted colour, and turns it over while the list is open', () => {
    expect(rule('select:not([multiple])::picker-icon')).toMatch(
      /background-color: var\(--text-muted\)/,
    )
    expect(rule('select:not([multiple]):open::picker-icon')).toMatch(/rotate: 180deg/)
  })

  it('draws the list as a 12px card on the surface with the strong edge, like the searchable select', () => {
    const list = rule('select:not([multiple])::picker(select)')
    expect(list).toMatch(/background: var\(--bg-surface\)/)
    expect(list).toMatch(/border: 1px solid var\(--border-strong\)/)
    expect(list).toMatch(/border-radius: 12px/)
    expect(list).toMatch(/padding: 6px/)
  })

  it('draws a row as a 40px pill with 8px corners', () => {
    const row = rule('select:not([multiple]) option')
    expect(row).toMatch(/min-height: 40px/)
    expect(row).toMatch(/border-radius: 8px/)
    expect(row).toMatch(/color: var\(--text-primary\)/)
  })

  it('tints the row under the pointer or the keyboard with the accent', () => {
    const hover = block.slice(block.indexOf('select:not([multiple]) option:hover'))
    expect(hover.slice(0, hover.indexOf('}'))).toMatch(/option:focus/)
    expect(hover.slice(0, hover.indexOf('}'))).toMatch(/background: var\(--accent-bg\)/)
  })

  it('gives the chosen row the stronger tint, the solid accent text, a heavier weight and a tick at the end', () => {
    const chosen = rule('select:not([multiple]) option:checked')
    expect(chosen).toMatch(/background: var\(--accent-hover\)/)
    expect(chosen).toMatch(/color: var\(--accent-solid\)/)
    expect(chosen).toMatch(/font-weight: 600/)
    const tick = rule('select:not([multiple]) option::checkmark')
    expect(tick).toMatch(/margin-inline-start: auto/)
    expect(tick).toMatch(/color: var\(--accent-solid\)/)
  })

  it('dims a disabled row and never tints it', () => {
    const off = rule('select:not([multiple]) option:disabled')
    expect(off).toMatch(/background: transparent/)
    expect(off).toMatch(/opacity: 0\.5/)
    expect(off).toMatch(/cursor: not-allowed/)
  })

  it('makes the rows 44px and 15px on a touch screen', () => {
    const touch = block.slice(block.indexOf('@media (pointer: coarse)'))
    expect(touch).toMatch(/min-height: 44px/)
    expect(touch).toMatch(/font-size: 15px/)
  })

  it('takes every colour from a theme variable: no literal colour except the shadow', () => {
    const withoutShadows = block.replace(/box-shadow:[^;]*;/g, '')
    expect(withoutShadows).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(withoutShadows).not.toMatch(/rgba?\(/)
  })
})

describe('the variables the block reads are really published by the theme', () => {
  const used = [...new Set([...block.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]))]

  it('reads at least the ones it needs', () => {
    for (const name of [
      '--bg-surface',
      '--border-strong',
      '--text-primary',
      '--text-muted',
      '--accent-bg',
      '--accent-hover',
      '--accent-solid',
    ]) {
      expect(used).toContain(name)
    }
  })

  it.each(used)('%s is set by the theme provider', (name) => {
    expect(context).toContain(`'${name}'`)
  })

  describe('and they follow the theme', () => {
    afterEach(() => {
      document.documentElement.removeAttribute('style')
      localStorage.clear()
    })

    it.each(Object.values(themes))('in the $key theme', (theme) => {
      localStorage.setItem('fnc-theme', theme.key)
      render(
        <ThemeProvider>
          <span />
        </ThemeProvider>,
      )
      const read = (v: string) => document.documentElement.style.getPropertyValue(v)
      expect(read('--accent-solid')).toBe(theme.accentSolid)
      expect(read('--accent-solid-hover')).toBe(theme.accentSolidHover)
      expect(read('--accent-solid-text')).toBe(theme.accentSolidText)
      expect(read('--border-field')).toBe(theme.borderField)
      expect(read('--bg-surface')).toBe(theme.bgSurface)
      expect(read('--accent-hover')).toBe(theme.accentHover)
    })
  })
})
