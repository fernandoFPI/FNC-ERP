import { describe, it, expect } from 'vitest'
import { buildInvoiceHTML, type InvoiceRenderData } from '../invoiceHtml'
import { safeImageSrc } from '../htmlEscape'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const P1 = 'data:image/jpeg;base64,AAAA'
const P2 = 'data:image/jpeg;base64,BBBB'
const P3 = 'data:image/png;base64,CCCC'

function inv(rows = 1, letterhead = false): InvoiceRenderData {
  return {
    invoiceNumber: 'FNC-26-80',
    status: 'issued',
    invoiceDate: '2026-10-17',
    dueDate: '2026-11-17',
    billingMethod: 'fixed_lump_sum',
    paymentTermsDays: 30,
    currencyCode: 'USD',
    paymentType: 'wire_transfer',
    projectCode: 'P-1',
    projectName: 'Proj',
    contractNumber: 'C',
    clientName: 'Client',
    companyName: 'Co',
    companyLegalName: 'Co Ltd',
    companyCountry: 'IQ',
    companyLetterheadImage: letterhead ? PNG : null,
    grossTotal: rows * 100,
    retentionAmount: 0,
    retentionPct: 0,
    netPayable: rows * 100,
    lines: Array.from({ length: rows }, (_, i) => ({
      lineNumber: i + 1,
      description: `Row ${i + 1}`,
      qty: 1,
      unitCost: 100,
      subtotal: 100,
      marginPct: 0,
      marginAmount: 0,
      taxPct: 0,
      taxAmount: 0,
      lineTotal: 100,
    })),
  }
}

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const sheets = (doc: Document) => Array.from(doc.querySelectorAll('.inv-att'))
const build = (rows: number, letterhead: boolean, pages?: readonly string[] | null) =>
  buildInvoiceHTML(inv(rows, letterhead), null, 'wire_transfer', PNG, PNG, pages)

describe('invoice with no attachment', () => {
  it.each([false, true])(
    'is the same page whether the pages are left out, null or empty (letterhead %s)',
    (lh) => {
      const plain = build(7, lh)
      expect(build(7, lh, null)).toBe(plain)
      expect(build(7, lh, [])).toBe(plain)
      expect(plain).not.toContain('inv-att')
    },
  )

  it('a page list with nothing printable in it also adds nothing', () => {
    expect(build(2, true, ['javascript:alert(1)', 'not an image'])).toBe(build(2, true))
  })
})

describe('invoice with an attachment', () => {
  it.each([false, true])(
    'adds one sheet per page, in order, with the picture (letterhead %s)',
    (lh) => {
      const doc = parse(build(3, lh, [P1, P2, P3]))
      const found = sheets(doc)
      expect(found).toHaveLength(3)
      expect(found.map((s) => s.querySelector('img')?.getAttribute('src'))).toEqual([P1, P2, P3])
      expect(found.map((s) => s.getAttribute('data-attachment-page'))).toEqual(['1', '2', '3'])
      expect(found[1].querySelector('.inv-att-label')?.textContent).toContain('page 2 of 3')
      expect(found[1].querySelector('img')?.getAttribute('alt')).toBe('Attachment page 2 of 3')
    },
  )

  it('the sheets come after the last invoice page, as its siblings, and last in the document', () => {
    const doc = parse(build(3, true, [P1, P2]))
    const kids = Array.from(doc.body.children)
    const lastPage = kids.map((k) => k.classList.contains('page')).lastIndexOf(true)
    const firstSheet = kids.findIndex((k) => k.classList.contains('inv-att'))
    expect(firstSheet).toBeGreaterThan(lastPage)
    // nothing but sheets and the script comes after the first sheet
    expect(
      kids
        .slice(firstSheet)
        .filter((k) => !k.classList.contains('inv-att') && k.tagName !== 'SCRIPT'),
    ).toEqual([])
    // and no sheet sits inside an invoice page
    expect(doc.querySelectorAll('.page .inv-att, .page2-break .inv-att')).toHaveLength(0)
  })

  it('the pagination script cannot see them: none of the classes it looks for are on a sheet', () => {
    const doc = parse(build(12, true, [P1, P2]))
    for (const s of sheets(doc)) {
      for (const cls of [
        'page',
        'page2-break',
        'page-mid',
        'page-footer-bar',
        'page-count',
        'content-anchor',
        'js-trailing-section',
      ]) {
        expect(s.classList.contains(cls), cls).toBe(false)
        expect(s.querySelector('.' + cls), cls).toBeNull()
      }
    }
    // so "Page N of M" still counts invoice pages only
    expect(doc.querySelectorAll('.page-count')).toHaveLength(
      parse(build(12, true)).querySelectorAll('.page-count').length,
    )
  })

  it('the invoice page markup and its script are untouched by an attachment', () => {
    const withAtt = build(12, true, [P1, P2])
    const without = build(12, true)
    // everything from <body> up to where the sheets (or, without them, the script) begin
    const body = (h: string, endMarker: string) =>
      h.slice(h.indexOf('<body>'), h.indexOf(endMarker)).trim()
    const a = body(withAtt, '<div class="inv-att"')
    expect(a.length).toBeGreaterThan(1000)
    expect(a).toBe(body(without, '<script>'))
    const script = (h: string) => /<script>[\s\S]*?<\/script>/.exec(h)?.[0]
    expect(script(withAtt)).toBe(script(without))
  })

  it('the style says the sheet covers the fixed letterhead and stamp, and is not as tall as the sheet of paper', () => {
    const html = build(1, true, [P1])
    const css = /\.inv-att \{[^}]*\}/.exec(html)?.[0] ?? ''
    expect(css).toContain('break-before: page')
    expect(css).toContain('background: #fff')
    const z = Number(/\.inv-att \{[^}]*z-index: (\d+)/.exec(html)?.[1])
    const stampZ = Number(
      /\.lh-stamp\) \{[^}]*|\.lh-stamp \{[^}]*z-index: (\d+)/.exec(html)?.[1] ??
        /\.lh-stamp[^{]*\{[^}]*z-index: (\d+)/.exec(html)?.[1],
    )
    expect(z).toBeGreaterThan(stampZ)
    // 296 mm, never 297: a block as tall as the sheet prints an empty sheet after it (playbook #53f, #63)
    expect(html).toContain('height: 296mm')
    // the print rule: a full A4 width, a margin round the picture, nothing spilling out, and a shadow that covers the
    // last millimetre of letterhead artwork under the 296 mm sheet
    const print = /@media print \{[^}]*\.inv-att \{([^}]*)\}/.exec(html)?.[1] ?? ''
    expect(print).toContain('width: 210mm')
    expect(print).toContain('padding: 12mm')
    expect(print).toContain('overflow: hidden')
    expect(print).toContain('box-shadow: 0 2mm 0 0 #fff')
    expect(html).not.toMatch(/\.inv-att[^}]*height: 297mm/)
    // a sheet is hidden label in print, shown on screen
    expect(html).toMatch(
      /@media print \{[^}]*\.inv-att \{[^}]*\}[\s\S]*?\.inv-att-label \{ display: none; \}/,
    )
  })

  it('the label says what the sheet is on screen and is not printed', () => {
    const html = build(1, false, [P1])
    expect(html).toContain('Attachment, page 1 of 1 (printed after the invoice)')
    expect(html).toMatch(/\.inv-att-label \{ display: none; \}/)
  })
})

describe('what is allowed into the page (playbook #54)', () => {
  const hostile = [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/png;base64,AAA"onerror="alert(1)',
    "data:image/png;base64,AAA' onerror='alert(1)",
    'data:image/png;base64,AAA><script>alert(1)</script>',
    'https://evil.example/x.png" onerror="alert(1)',
    'https://evil.example/a b.png',
    '',
  ]

  it('drops every unsafe source and keeps the safe ones, numbering the survivors', () => {
    const doc = parse(build(1, false, [P1, ...hostile, P2]))
    const found = sheets(doc)
    expect(found.map((s) => s.querySelector('img')?.getAttribute('src'))).toEqual([P1, P2])
    expect(found[1].querySelector('.inv-att-label')?.textContent).toContain('page 2 of 2')
  })

  it('a hostile source cannot add an element or an event attribute', () => {
    const html = build(1, false, hostile)
    const doc = parse(html)
    expect(doc.querySelectorAll('img[onerror]')).toHaveLength(0)
    expect(html).not.toContain('onerror')
    expect(doc.querySelectorAll('script')).toHaveLength(0)
  })

  it('accepts a 14 MB picture without choking on the check (a 10 MB file is about 13.4 MB of base64)', () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(14 * 1024 * 1024)
    const t0 = Date.now()
    expect(safeImageSrc(big)).toBe(big)
    expect(Date.now() - t0).toBeLessThan(2000)
    const doc = parse(build(1, false, [big]))
    expect(sheets(doc)).toHaveLength(1)
  })
})

describe('the public verification page keeps working', () => {
  it('the builder called the way that page calls it (no attachment argument) shows no sheet', () => {
    const html = buildInvoiceHTML(inv(1, true), null, 'wire_transfer', PNG, PNG)
    expect(html).not.toContain('inv-att')
    expect(html).not.toContain(JPG)
  })
})
