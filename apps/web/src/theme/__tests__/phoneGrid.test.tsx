// On a phone themes.css collapses every label/value grid (`main dl[style]`) to one column with !important, which beats
// the inline `grid-template-columns` of a component. That silently undid the two-column requisition line cards: each
// card was twice as tall as designed and a requisition with ten lines was 7,000px long. A grid that sets its own phone
// layout opts out with `data-phone-grid`. jsdom does not apply stylesheets, so these tests pin the source of the rule
// and the attribute on the grids that rely on it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ThemeProvider } from '../ThemeContext'
import { Table } from '../../components/ui/Table'

// Read with fs: Vitest turns a `.css?raw` import into an empty string, which would make every "not" check pass.
// The path goes through a variable on purpose: Vite rewrites a literal `new URL('../x', import.meta.url)` into an
// http asset URL, which `fileURLToPath` then refuses.
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const css = read('../themes.css')

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
})

describe('the phone rule that collapses label/value grids', () => {
  const rule = /main dl\[style\]([^{]*)\{([^}]*)\}/.exec(css)

  it('reads the real stylesheet (so the checks below cannot pass on nothing)', () => {
    expect(css.length).toBeGreaterThan(1000)
    expect(rule).not.toBeNull()
  })

  it('still collapses an ordinary label/value grid to one column with !important', () => {
    expect(rule?.[2]).toMatch(/grid-template-columns:\s*1fr\s*!important/)
  })

  it('leaves out a grid that opts out with data-phone-grid', () => {
    expect(rule?.[1]).toContain(':not([data-phone-grid])')
  })

  it('has no other rule that forces a definition list to one column', () => {
    const forcing = [...css.matchAll(/([^{}]*\bdl\b[^{}]*)\{([^}]*grid-template-columns[^}]*)\}/g)]
    expect(forcing).toHaveLength(1)
  })
})

describe('the grids that rely on the opt-out carry the attribute', () => {
  const rows = [{ id: 'a', name: 'Cement', qty: 5 }]
  const columns = [
    { key: 'name', header: 'Item', mobilePrimary: true },
    { key: 'qty', header: 'Qty' },
  ]

  it('a Table phone card in the "fields" layout keeps its two columns', () => {
    setWidth(390)
    const { container } = render(
      <ThemeProvider>
        <Table columns={columns} data={rows} rowKey="id" mobileLayout="fields" />
      </ThemeProvider>,
    )
    const dl = container.querySelector('dl')
    expect(dl).not.toBeNull()
    expect(dl).toHaveAttribute('data-phone-grid')
    expect(dl?.style.gridTemplateColumns).toContain('repeat(2')
  })

  it('the default Table phone card is not a grid at all, so it carries no opt-out', () => {
    setWidth(390)
    const { container } = render(
      <ThemeProvider>
        <Table columns={columns} data={rows} rowKey="id" />
      </ThemeProvider>,
    )
    expect(container.querySelector('dl')).toBeNull()
  })
})
