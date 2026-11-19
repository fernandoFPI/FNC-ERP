// "The page zooms in by itself and I have to undo it" on an iPhone. iOS Safari zooms into any text field whose
// text is under 16px. The shared inputs set a 13px size inline, which beats a plain stylesheet rule, so the rule
// that sat in themes.css for years (without !important) never applied. jsdom does not apply stylesheets, so these
// tests pin the source: the rule must stay !important, cover the text fields and nothing else, and the viewport
// must keep pinch zoom.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ThemeProvider } from '../ThemeContext'
import { Input } from '../../components/ui/Input'

// Read with fs: Vitest turns a `.css?raw` import into an empty string, which would make every "not" check pass.
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const css = read('../themes.css')
const indexHtml = read('../../../index.html')

// The text of one @media block (up to its closing brace at the start of a line).
function mediaBlock(source: string, query: string): string {
  const start = source.indexOf(`@media ${query} {`)
  if (start < 0) return ''
  const end = source.indexOf('\n}', start)
  return source.slice(start, end)
}

describe('the iOS zoom rules in themes.css', () => {
  const touch = mediaBlock(css, '(pointer: coarse)')

  it('reads the real stylesheet and page (so the checks below cannot pass on nothing)', () => {
    expect(css.length).toBeGreaterThan(1000)
    expect(css).toContain('.fnc-bottom-nav')
    expect(indexHtml).toContain('<div id="root">')
  })

  it('has a touch-screen block, not a width one (a phone turned sideways is wider than 767px)', () => {
    expect(touch).not.toBe('')
  })

  it('makes the text fields 16px with !important, because the shared inputs size themselves inline', () => {
    expect(touch).toMatch(/select,\s*textarea\s*{\s*font-size:\s*16px\s*!important;/)
    expect(touch).toMatch(/^\s*input:not\(/m)
  })

  it('leaves out what is not a text field: checkbox, radio, range, file, colour, buttons', () => {
    for (const type of [
      'checkbox',
      'radio',
      'range',
      'file',
      'color',
      'button',
      'submit',
      'reset',
      'image',
    ]) {
      expect(touch).toContain(`:not([type='${type}'])`)
    }
  })

  it('does not leave a plain, overridable 16px rule for the inputs behind', () => {
    const everyInputRule = [...css.matchAll(/(input[^{}]*|select[^{}]*|textarea[^{}]*){([^}]*)}/g)]
    for (const [, selector, body] of everyInputRule) {
      if (/font-size:\s*16px/.test(body) && /\b(input|select|textarea)\b/.test(selector)) {
        expect(body).toMatch(/font-size:\s*16px\s*!important/)
      }
    }
  })

  it('turns off the double-tap zoom on the things people tap twice, keeping pinch zoom (manipulation)', () => {
    expect(touch).toMatch(/touch-action:\s*manipulation/)
    for (const selector of ['html', 'button', 'input', 'a', "[role='checkbox']"]) {
      expect(touch).toContain(selector)
    }
    expect(css).not.toMatch(/touch-action:\s*none/)
  })

  it('shows why it has to be !important: the shared Input draws its text at an inline 13px', () => {
    const { container } = render(
      <ThemeProvider>
        <Input label="Name" value="" onChange={() => undefined} />
      </ThemeProvider>,
    )
    const field = container.querySelector('input')
    expect(field?.style.fontSize).toBe('13px')
  })
})

describe('the viewport meta in index.html', () => {
  const meta = /<meta\s+name="viewport"[^>]*>/s.exec(indexHtml)?.[0] ?? ''

  it('is present and sized to the device', () => {
    expect(meta).toContain('width=device-width')
    expect(meta).toContain('initial-scale=1.0')
  })

  it('keeps pinch zoom for people who need it: no maximum-scale and no user-scalable=no', () => {
    expect(meta).not.toMatch(/maximum-scale/)
    expect(meta).not.toMatch(/user-scalable\s*=\s*(no|0)/)
  })
})
