import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildInvoiceHTML, type InvoiceLine, type InvoiceRenderData } from '../invoiceHtml'

// The letterhead invoice repeats the company stamp on every printed page (position: fixed), so
// no page's table may reach into the band the stamp occupies. The page split is made by a script
// inside the generated HTML that measures real row heights. jsdom has no layout, so these tests
// run that script against a small stand-in layout where a row's height is written in its
// description ("h=200"). That pins the algorithm (which rows go where, the "continued" notes,
// page numbers, ids, restoring on failure); the real geometry was checked in headless Chrome by
// printing to PDF and looking for text inside the stamp band.

const PX_PER_MM = 96 / 25.4
// What the script allows below its anchor (297 mm minus the page's top padding minus the 85 mm reserve)
const FIRST_PAGE_BUDGET = (297 - 54 - 85) * PX_PER_MM // 597 px
const OTHER_PAGE_BUDGET = (297 - 74 - 85) * PX_PER_MM // 521 px
const BAR = 40 // the head row, like every other row unless it says otherwise
const SECTION = 120 // one totals / payment section

function line(n: number, h: number): InvoiceLine {
  return {
    lineNumber: n,
    description: `row ${n} h=${h}`,
    qty: 1,
    unitCost: 10,
    subtotal: 10,
    marginPct: 0,
    marginAmount: 0,
    taxPct: 0,
    taxAmount: 0,
    lineTotal: 10,
  }
}

function invoice(
  heights: number[],
  letterhead: string | null = 'data:image/png;base64,AAAA',
  invoiceNumber = 'INV-1',
): string {
  const data: InvoiceRenderData = {
    invoiceNumber,
    status: 'issued',
    invoiceDate: '2026-11-01',
    dueDate: '2026-12-01',
    billingMethod: 'fixed_lump_sum',
    paymentTermsDays: 30,
    currencyCode: 'USD',
    companyLetterheadImage: letterhead,
    grossTotal: 10,
    retentionAmount: 0,
    retentionPct: 0,
    netPayable: 10,
    lines: heights.map((h, i) => line(i + 1, h)),
  }
  return buildInvoiceHTML(data, null, 'cash', null, null)
}

// ── stand-in layout ──────────────────────────────────────────────────────────
function heightOf(el: Element): number {
  if (el.tagName === 'TR') {
    if (!el.closest('table.inv-lines')) return 0
    const m = /h=(\d+)/.exec(el.textContent)
    return m ? Number(m[1]) : BAR
  }
  if (el.classList.contains('js-trailing-section')) return SECTION
  return Array.from(el.children).reduce((sum, c) => sum + heightOf(c), 0)
}

function topOf(el: Element): number {
  let top = 0
  let node: Element = el
  while (node !== document.body) {
    for (let s = node.previousElementSibling; s; s = s.previousElementSibling) top += heightOf(s)
    const parent = node.parentElement
    if (!parent) break
    node = parent
  }
  return top
}

function find<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`missing ${selector}`)
  return el
}

function mockLayout(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = topOf(this)
    const height = heightOf(this)
    return {
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: top,
    } as DOMRect
  })
}

// Loads the generated page into the test document and runs its script, as the iframe would.
function load(html: string): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]
  document.documentElement.className = ''
  document.body.innerHTML = parsed.body.innerHTML
  // Running the generated page's own script is the point of these tests.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  if (script) new Function(script)()
}

interface PageSummary {
  rows: number[]
  continued: boolean
  id: string
  footer: string | null
  sections: number
  tableBottom: number
}

function pages(): PageSummary[] {
  const root = find<HTMLElement>(document, '.page')
  return [root, ...Array.from(document.querySelectorAll<HTMLElement>('.page2-break'))].map((el) => {
    const table = el.querySelector<HTMLTableElement>(':scope > table.inv-lines')
    const anchor = find(el, ':scope > .content-anchor')
    return {
      rows: table
        ? Array.from(table.tBodies[0].rows).map((r) => Number(r.cells[0].textContent))
        : [],
      continued: !!el.querySelector(':scope > .page-footer-bar .page-continued'),
      id: el.id,
      footer: el.querySelector(':scope > .page-footer-bar .page-count')?.textContent ?? null,
      sections: Array.from(el.querySelectorAll('.js-trailing-section')).filter(
        (s) => s.closest('.page2-break, .page') === el,
      ).length,
      tableBottom: table
        ? table.getBoundingClientRect().bottom - anchor.getBoundingClientRect().top
        : 0,
    }
  })
}

describe('letterhead invoice pagination', () => {
  beforeEach(() => {
    vi.useFakeTimers() // the script arms a fallback timer
    mockLayout()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
  })

  it('keeps a short invoice on one page, totals included', () => {
    load(invoice([BAR, BAR, BAR]))
    const p = pages()
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({
      rows: [1, 2, 3],
      continued: false,
      id: 'page-last',
      footer: 'Page 1 of 1',
      sections: 2,
    })
  })

  it('starts a new page before a row would push the table into the stamp band', () => {
    load(invoice([200, 200, 200, 200, 200]))
    const p = pages()
    // page 1: head + 2 rows = 440 of 597; a third row would make 640
    expect(p.map((x) => x.rows)).toEqual([[1, 2], [3, 4], [5]])
    expect(p.map((x) => x.continued)).toEqual([true, true, false])
    expect(p.map((x) => x.footer)).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3'])
    expect(p.map((x) => x.id)).toEqual(['', '', 'page-last'])
    // and every page really ends above its limit
    p.forEach((x, i) => {
      expect(x.tableBottom).toBeLessThanOrEqual(i === 0 ? FIRST_PAGE_BUDGET : OTHER_PAGE_BUDGET)
    })
    expect(p[2].sections).toBe(2)
  })

  it('splits by height, not by a fixed row count', () => {
    load(invoice([BAR, BAR, BAR, BAR, BAR, BAR, BAR, BAR, BAR, BAR, BAR, BAR]))
    const p = pages()
    // short rows: far more than the old six per page fit
    expect(p[0].rows.length).toBeGreaterThan(6)
    expect(p.flatMap((x) => x.rows)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('moves the totals to their own page when they do not fit under the last rows', () => {
    load(invoice([200, 200, 200, 200]))
    const p = pages()
    expect(p.map((x) => x.rows)).toEqual([[1, 2], [3, 4], []])
    expect(p.map((x) => x.sections)).toEqual([0, 0, 2])
    expect(p.map((x) => x.footer)).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3'])
    // the rows end on page 2, but the invoice goes on to the totals page: page 2 must say so
    expect(p.map((x) => x.continued)).toEqual([true, true, false])
  })

  it('says "continued" on every page but the last, and nowhere else', () => {
    load(invoice([200, 200, 200, 200, 200]))
    const notes = Array.from(document.querySelectorAll('.page-continued'))
    expect(notes).toHaveLength(2)
    expect(notes.every((n) => n.textContent === 'Continued on next page →')).toBe(true)
    // no bar inside the tables any more
    expect(document.querySelectorAll('tfoot')).toHaveLength(0)
  })

  it('puts only the page number and the note in a page marker: no company text, no rule', () => {
    load(invoice([200, 200, 200, 200, 200]))
    const bars = Array.from(document.querySelectorAll<HTMLElement>('.page-footer-bar'))
    // one line each, the page number above the note
    expect(bars.map((b) => Array.from(b.children).map((c) => c.textContent))).toEqual([
      ['Page 1 of 3', 'Continued on next page →'],
      ['Page 2 of 3', 'Continued on next page →'],
      ['Page 3 of 3'],
    ])
    // the rule above the old footer was an inline border; the marker carries no inline style at all
    expect(bars.every((b) => !b.hasAttribute('style'))).toBe(true)
  })

  it('keeps database text out of the continuation header it builds', () => {
    const HOSTILE = '<img src=x onerror="window.__pwned=1">'
    load(invoice([200, 200, 200, 200, 200], 'data:image/png;base64,AAAA', `INV-${HOSTILE}`))
    expect(document.querySelectorAll('.page2-break').length).toBeGreaterThan(0)
    expect(document.querySelector('img[src="x"]')).toBeNull()
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const a of Array.from(el.attributes)) expect(a.name.startsWith('on')).toBe(false)
    }
    const header = find(document, '.page2-break .p2-screen-hdr')
    expect(header.textContent).toContain(HOSTILE) // shown, as text
  })

  it('gives the page that receives the moved totals no "page-mid" bottom padding', () => {
    load(invoice([200, 200, 200, 200]))
    // In print "page-mid" adds 85 mm of padding under the content, and Chrome cannot break between the last block and
    // the padding below it. A page holding the payment block (about 85 mm) then needs block + 85 mm + the first page's
    // 50 mm to fit on the sheet, which it does not, so the whole block was pushed onto an extra sheet with no header
    // or page number and the page the script had made was left empty (NY-INV-2026-0011). Every wire-transfer invoice
    // of 5 or more rows hit it. jsdom has no layout; the sheets were counted in a real printed PDF.
    expect(document.querySelectorAll('.page-mid')).toHaveLength(0)
    expect(Array.from(document.querySelectorAll('.page2-break')).map((el) => el.className)).toEqual(
      ['page2-break', 'page2-break'],
    )
  })

  it('terminates on a row taller than a whole page and keeps every row', () => {
    load(invoice([BAR, 2000, BAR]))
    const p = pages()
    expect(p.map((x) => x.rows)).toEqual([[1], [2], [3]])
  })

  it('restarts the zebra stripe on every page', () => {
    load(invoice([200, 200, 200, 200, 200]))
    const second = document.querySelectorAll<HTMLElement>('.page2-break')[0]
    const rows = second.querySelectorAll<HTMLTableRowElement>('tbody tr')
    expect(rows[0].cells[0].style.background).toBe('')
    expect(rows[1].cells[0].style.background).not.toBe('')
  })

  it('puts the server-rendered pages back untouched if measuring fails', () => {
    const html = invoice([BAR, BAR, BAR])
    const original = find(
      new DOMParser().parseFromString(html, 'text/html').body,
      '.page',
    ).innerHTML
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => {
      throw new Error('layout unavailable')
    })
    load(html)
    const root = find<HTMLElement>(document, '.page')
    expect(root.innerHTML).toBe(original)
    expect(root.id).toBe('page-last')
    expect(document.documentElement.classList.contains('measuring')).toBe(false)
  })

  it('leaves no measuring class behind', () => {
    load(invoice([200, 200, 200]))
    expect(document.documentElement.classList.contains('measuring')).toBe(false)
  })
})

// The stamp sits just above the footer artwork of the company's own letterhead, which the
// script reads from the image. jsdom cannot decode images, so the image and the canvas are
// faked: a 1000 x 2000 px letterhead whose footer ink starts `inkRow` rows into its bottom
// 40 % (rows 1200 to 2000). With inkRow 700 the footer begins 14.85 mm above the bottom edge.
describe('stamp placement from the letterhead footer', () => {
  function fakeLetterhead(inkRow: number | null, tainted = false): void {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(2000)
    const ctx = {
      fillStyle: '',
      fillRect: () => undefined,
      drawImage: () => undefined,
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        if (tainted) throw new Error('SecurityError')
        const data = new Uint8ClampedArray(w * h * 4).fill(255)
        if (inkRow !== null) {
          for (let y = inkRow; y < h; y++) data.fill(0, y * w * 4, (y * w + w) * 4)
        }
        return { data }
      },
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => ctx) as unknown as HTMLCanvasElement['getContext'],
    )
  }
  const stampBottom = (): string =>
    document.documentElement.style.getPropertyValue('--stamp-bottom')

  beforeEach(() => {
    vi.useFakeTimers()
    mockLayout()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
  })

  it('puts the stamp 2 mm above the footer and frees the band below it for rows', () => {
    fakeLetterhead(700)
    load(invoice([200, 200, 200, 200, 200]))
    expect(parseFloat(stampBottom())).toBeCloseTo(16.85, 1)
    // reserve 55 mm instead of 85: page 1 now takes a third 200 px row (head + 3 rows = 640
    // of 710 px), where the default budget of 597 px stopped at two
    const p = pages()
    expect(p[0].rows).toEqual([1, 2, 3])
    expect(p.flatMap((x) => x.rows)).toEqual([1, 2, 3, 4, 5])
  })

  it('never lets the stamp sink below 12 mm, whatever the footer', () => {
    fakeLetterhead(null) // no ink at all in the bottom 40 %
    load(invoice([BAR]))
    expect(parseFloat(stampBottom())).toBe(12)
  })

  it('keeps today’s 43 mm stamp and 85 mm reserve when the image cannot be read', () => {
    fakeLetterhead(700, true) // a tainted canvas throws on getImageData
    load(invoice([200, 200, 200, 200, 200]))
    expect(stampBottom()).toBe('')
    expect(pages().map((x) => x.rows)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('keeps the defaults while the image has not loaded', () => {
    load(invoice([200, 200, 200, 200, 200])) // jsdom: naturalWidth is 0
    expect(stampBottom()).toBe('')
    expect(pages().map((x) => x.rows)).toEqual([[1, 2], [3, 4], [5]])
  })
})

describe('letterhead invoice markup', () => {
  it('declares the stamp position once for print and once for the measuring mode', () => {
    const html = invoice([BAR])
    const rule = (scope: string) =>
      new RegExp(
        `${scope}\\s*\\.lh-stamp \\{ position: fixed; bottom: var\\(--stamp-bottom, 43mm\\);`,
      )
    expect(html).toMatch(rule('html\\.measuring'))
    // the @media print copy: same declaration without the scope
    expect(
      html.match(/\.lh-stamp \{ position: fixed; bottom: var\(--stamp-bottom, 43mm\);/g),
    ).toHaveLength(2)
    expect(html).toContain('html.measuring .page { padding: 54mm 15mm 50mm; }')
  })

  it('has no pagination script without a letterhead (the stamp is in the flow there)', () => {
    expect(invoice([BAR], null)).not.toContain('<script>')
  })

  it('puts the page marker bottom right, level with the stamp, once for print and once for measuring', () => {
    const html = invoice([BAR])
    const decl =
      '.page-footer-bar { position: absolute; top: calc(297mm - var(--stamp-bottom, 43mm) - 9mm); right: 15mm; margin: 0; }'
    expect(html.split(decl)).toHaveLength(3) // plain (@media print) and under html.measuring
    expect(html).toContain(`html.measuring ${decl}`)
  })

  it('keeps the marker at the same place on a continuation page, which is already inset 15 mm', () => {
    const html = invoice([BAR])
    const nested = '.page .page2-break > .page-footer-bar { right: 0; }'
    expect(html.split(nested)).toHaveLength(3)
    expect(html).toContain(`html.measuring ${nested}`)
    // it must come after the general rule, or the general rule would win on equal footing
    expect(html.indexOf(nested)).toBeGreaterThan(
      html.indexOf('.page-footer-bar { position: absolute;'),
    )
  })

  describe('before the script runs (what is printed if it cannot)', () => {
    const bars = (html: string) =>
      Array.from(
        new DOMParser()
          .parseFromString(html, 'text/html')
          .querySelectorAll<HTMLElement>('.page-footer-bar'),
      )
    const lines = (el: HTMLElement) => Array.from(el.children).map((c) => c.textContent)

    it('a one-page invoice has just "Page 1 of 1"', () => {
      const b = bars(invoice([BAR]))
      expect(b.map(lines)).toEqual([['Page 1 of 1']])
    })

    it('a long invoice says "continued" on every page but the last, with no table bar', () => {
      const html = invoice(Array.from({ length: 20 }, () => BAR))
      const b = bars(html)
      expect(b.length).toBeGreaterThanOrEqual(3)
      b.forEach((el, i) => {
        const last = i === b.length - 1
        expect(lines(el)).toEqual(
          last
            ? [`Page ${i + 1} of ${b.length}`]
            : [`Page ${i + 1} of ${b.length}`, 'Continued on next page →'],
        )
        expect(el.hasAttribute('style')).toBe(false)
      })
      expect(
        new DOMParser().parseFromString(html, 'text/html').querySelectorAll('tfoot'),
      ).toHaveLength(0)
    })
  })

  it('leaves the plain (no letterhead) layout as it was: company text, rule and a bar in the table', () => {
    const html = invoice(
      Array.from({ length: 20 }, () => BAR),
      null,
    )
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const first = doc.querySelector<HTMLElement>('.page-footer-bar')
    expect(first?.getAttribute('style')).toContain('border-top:1px solid #e5e5e5')
    expect(first?.textContent).toContain('INV-1')
    expect(doc.querySelectorAll('tfoot').length).toBeGreaterThan(0)
  })
})
