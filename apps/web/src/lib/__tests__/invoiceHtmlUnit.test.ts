// The Unit column on the printed invoice (migration 318): right after Qty, in both layouts, on every page, one cell per
// row. The unit is text typed by a person, so it goes in through esc() like every other value (playbook #54).
import { describe, it, expect } from 'vitest'
import { buildInvoiceHTML, type InvoiceLine, type InvoiceRenderData } from '../invoiceHtml'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

function line(n: number, over: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    lineNumber: n,
    description: `Item ${n}`,
    qty: n,
    uom: 'Ea',
    unitCost: 10,
    subtotal: 10 * n,
    marginPct: 0,
    marginAmount: 0,
    taxPct: 0,
    taxAmount: 0,
    lineTotal: 10 * n,
    ...over,
  }
}

function inv(lines: InvoiceLine[], over: Partial<InvoiceRenderData> = {}): InvoiceRenderData {
  const total = lines.reduce((s, l) => s + l.lineTotal, 0)
  return {
    invoiceNumber: 'NY-INV-2026-0005',
    status: 'issued',
    invoiceDate: '2026-11-07',
    dueDate: '2026-12-06',
    billingMethod: 'fixed_lump_sum',
    paymentTermsDays: 30,
    currencyCode: 'USD',
    paymentType: 'wire_transfer',
    grossTotal: total,
    retentionAmount: 0,
    retentionPct: 0,
    netPayable: total,
    lines,
    ...over,
  }
}

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html')

/** Every lines table of the document (one per page), as { headers, rows of cell texts }. */
function linesTables(html: string) {
  return [...doc(html).querySelectorAll('table')]
    .filter((t) =>
      [...t.querySelectorAll('th')].some((th) => th.textContent.trim() === 'Description'),
    )
    .map((t) => ({
      headers: [...t.querySelectorAll('th')].map((th) => th.textContent.trim()),
      rows: [...t.querySelectorAll('tr')]
        .filter((tr) => tr.querySelector('td') && !tr.querySelector('td[colspan]'))
        .map((tr) => [...tr.querySelectorAll('td')]),
    }))
}

describe('Unit column on the printed invoice', () => {
  it('is right after Qty in the header', () => {
    const [t] = linesTables(buildInvoiceHTML(inv([line(1)])))
    expect(t.headers).toEqual(['#', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Subtotal', 'Total'])
  })

  it("shows each line's own unit in the cell right after its quantity", () => {
    const lines = [
      line(1, { uom: 'Ea' }),
      line(2, { uom: 'M' }),
      line(3, { uom: 'Lot' }),
      line(4, { uom: 'Roll' }),
    ]
    const [t] = linesTables(buildInvoiceHTML(inv(lines)))
    expect(t.rows).toHaveLength(4)
    expect(t.rows.map((cells) => [cells[2].textContent, cells[3].textContent])).toEqual([
      ['1', 'Ea'],
      ['2', 'M'],
      ['3', 'Lot'],
      ['4', 'Roll'],
    ])
  })

  it('shows a dash for a line without a unit: none stored, empty, or only spaces', () => {
    const lines = [
      line(1, { uom: null }),
      line(2, { uom: '' }),
      line(3, { uom: '   ' }),
      line(4, { uom: undefined }),
    ]
    const [t] = linesTables(buildInvoiceHTML(inv(lines)))
    expect(t.rows.map((cells) => cells[3].textContent)).toEqual(['—', '—', '—', '—'])
  })

  it('keeps a long typed unit in its own cell instead of pushing a neighbour out', () => {
    const [t] = linesTables(buildInvoiceHTML(inv([line(1, { uom: 'Man-Day shift' })])))
    const cell = t.rows[0][3]
    expect(cell.textContent).toBe('Man-Day shift')
    expect(cell.getAttribute('style')).toContain('overflow-wrap:anywhere')
  })

  it('has one cell per header cell in every row, also with the margin and tax columns', () => {
    const lines = [line(1, { marginPct: 0.1, marginAmount: 1, taxPct: 5, taxAmount: 0.5 }), line(2)]
    const [t] = linesTables(buildInvoiceHTML(inv(lines)))
    expect(t.headers).toEqual([
      '#',
      'Description',
      'Qty',
      'Unit',
      'Unit Cost',
      'Subtotal',
      'Margin%',
      'Margin',
      'Tax%',
      'Tax',
      'Total',
    ])
    for (const cells of t.rows) expect(cells).toHaveLength(t.headers.length)
  })

  it('is on every page of a long invoice, the same way', () => {
    const lines = Array.from({ length: 14 }, (_, i) => line(i + 1, { uom: i % 2 ? 'Box' : 'Set' }))
    const tables = linesTables(buildInvoiceHTML(inv(lines)))
    expect(tables.length).toBeGreaterThan(1)
    for (const t of tables) {
      expect(t.headers.slice(2, 4)).toEqual(['Qty', 'Unit'])
      for (const cells of t.rows) expect(cells[3].textContent).toMatch(/^(Box|Set)$/)
    }
    expect(tables.reduce((n, t) => n + t.rows.length, 0)).toBe(14)
  })

  it('is the same on a letterhead invoice', () => {
    const [t] = linesTables(
      buildInvoiceHTML(inv([line(1, { uom: 'Pack' })], { companyLetterheadImage: PNG })),
    )
    expect(t.headers.slice(2, 4)).toEqual(['Qty', 'Unit'])
    expect(t.rows[0][3].textContent).toBe('Pack')
  })

  it('keeps amounts on one line, so the narrower money columns never split "439.50" from "USD"', () => {
    const [t] = linesTables(buildInvoiceHTML(inv([line(1)])))
    const cells = t.rows[0]
    for (const i of [4, 5, 6])
      expect(cells[i].getAttribute('style'), `column ${i}`).toContain('white-space:nowrap')
  })
})

describe('the unit goes in as text, never as markup', () => {
  const hostile = [
    '<img src=x onerror=alert(1)>',
    '"><script>alert(1)</script>',
    "x' onmouseover='alert(1)",
    '&lt;b&gt;',
  ]

  it.each(hostile)('shows %s literally in the cell', (value) => {
    const html = buildInvoiceHTML(inv([line(1, { uom: value })]))
    const d = doc(html)
    const [t] = linesTables(html)
    expect(t.rows[0][3].textContent).toBe(value)
    expect(d.querySelectorAll('img[src="x"]')).toHaveLength(0)
    expect(d.querySelectorAll('[onerror],[onmouseover]')).toHaveLength(0)
    // The document has exactly the scripts it has without the hostile text.
    const clean = doc(buildInvoiceHTML(inv([line(1)])))
    expect(d.querySelectorAll('script')).toHaveLength(clean.querySelectorAll('script').length)
  })
})
