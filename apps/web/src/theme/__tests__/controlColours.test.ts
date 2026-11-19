// The colours the newer form controls (ActionButton, ChipButton, QuantityStepper, MoneyField, ReceiptDropZone)
// are drawn with. A screenshot cannot tell 4.2:1 from 4.6:1, so the contrast is computed here, in both themes:
// text needs 4.5:1, the edge of a box a person must find needs 3:1.
import { describe, it, expect } from 'vitest'
import { themes, type ThemeTokens } from '../tokens'

interface Rgba {
  r: number
  g: number
  b: number
  a: number
}
function parse(colour: string): Rgba {
  if (colour.startsWith('#')) {
    const hex = colour.slice(1)
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    }
  }
  const match = /rgba?\(([^)]+)\)/.exec(colour)
  if (!match) throw new Error(`Cannot read the colour ${colour}`)
  const parts = match[1].split(',').map((p) => parseFloat(p))
  // rgb() has three numbers, rgba() a fourth for the opacity
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}
// A translucent colour as it looks on top of another.
const over = (top: Rgba, below: Rgba): Rgba => ({
  r: top.r * top.a + below.r * (1 - top.a),
  g: top.g * top.a + below.g * (1 - top.a),
  b: top.b * top.a + below.b * (1 - top.a),
  a: 1,
})
const linear = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const luminance = (c: Rgba) => 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b)
function ratio(a: Rgba, b: Rgba): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

describe.each(Object.entries(themes))('control colours in the %s theme', (_name, theme) => {
  const c = (key: keyof ThemeTokens) => {
    const value = theme[key]
    // not every token is a colour (some are flags); a colour token is always a string
    if (typeof value !== 'string') throw new Error(`${key} is not a colour`)
    return parse(value)
  }
  const surface = c('bgSurface')

  it('text on the solid button is readable, at rest and under the pointer (4.5:1)', () => {
    expect(ratio(c('accentSolidText'), c('accentSolid'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(c('accentSolidText'), c('accentSolidHover'))).toBeGreaterThanOrEqual(4.5)
  })

  it('the edge of an entry box can be found against the card it sits on (3:1)', () => {
    expect(ratio(c('borderField'), surface)).toBeGreaterThanOrEqual(3)
  })

  it('text in the accent on a tint (soft button, picked chip) is readable (4.5:1)', () => {
    expect(ratio(c('accentSolid'), over(c('accentBg'), surface))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(c('accentSolid'), over(c('accentHover'), surface))).toBeGreaterThanOrEqual(4.5)
  })

  it('the dashed "add" chip is readable on its grey (4.5:1)', () => {
    expect(ratio(c('accentSolid'), c('bgSurfaceHover'))).toBeGreaterThanOrEqual(4.5)
  })

  it('the secondary and primary text are readable on the grey the drop zone and steppers use (4.5:1)', () => {
    expect(ratio(c('textSecondary'), c('bgSurfaceHover'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(c('textPrimary'), c('bgSurfaceHover'))).toBeGreaterThanOrEqual(4.5)
  })

  it('red text on the danger tint is readable (4.5:1)', () => {
    expect(ratio(c('danger'), c('dangerBg'))).toBeGreaterThanOrEqual(4.5)
  })

  it('the field edge is darker than the ordinary border, which is the point of having it', () => {
    expect(ratio(c('borderField'), surface)).toBeGreaterThan(ratio(c('border'), surface))
  })
})

describe('the colour check itself', () => {
  it('knows black on white is 21:1 and a colour against itself is 1:1', () => {
    expect(ratio(parse('#000000'), parse('#ffffff'))).toBeCloseTo(21, 0)
    expect(ratio(parse('#777777'), parse('#777777'))).toBeCloseTo(1, 5)
  })

  it('the pale accent on its own tint really is under 4.5 in the light theme, which is why accentSolid is used for text', () => {
    const light = themes['light-flat']
    const surface = parse(light.bgSurface)
    expect(ratio(parse(light.accent), over(parse(light.accentBg), surface))).toBeLessThan(4.5)
  })
})
