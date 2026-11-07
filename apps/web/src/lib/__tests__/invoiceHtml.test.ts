import { describe, it, expect, afterEach } from 'vitest'
import { buildInvoiceHTML, type BankAccount, type InvoiceRenderData } from '../invoiceHtml'
import { esc, safeImageSrc } from '../htmlEscape'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

function inv(over: Partial<InvoiceRenderData> = {}): InvoiceRenderData {
  return {
    invoiceNumber: 'FNC-26-80',
    status: 'issued',
    invoiceDate: '2026-10-17',
    dueDate: '2026-11-17',
    billingMethod: 'fixed_lump_sum',
    paymentTermsDays: 30,
    currencyCode: 'USD',
    paymentType: 'wire_transfer',
    projectCode: 'BA-8102-2025',
    projectName: 'modify the cool shack',
    contractNumber: 'IMPORT-BA-8102-2025',
    clientName: 'TotalEnergies EP Ratawi Hub SAS',
    companyName: 'Nishtimani Yakam',
    companyLegalName: 'Nishtimani Yakam Ltd',
    companyCountry: 'IQ',
    clientContractNo: '4300065926',
    billToAddress: 'TotalEnergies EP Ratawi Hub SAS\nMansour District, 601\nBaghdad - Iraq',
    deliverToAddress: 'TotalEnergies EP Ratawi Hub SAS\nRatawi Site\nBasra - IRAQ',
    deliveryDate: '2026-07-30',
    periodOfPerformance: null,
    grossTotal: 100,
    retentionAmount: 0,
    retentionPct: 0,
    netPayable: 100,
    lines: [
      {
        lineNumber: 1,
        description: 'Cool shack works',
        qty: 1,
        unitCost: 100,
        subtotal: 100,
        marginPct: 0,
        marginAmount: 0,
        taxPct: 0,
        taxAmount: 0,
        lineTotal: 100,
      },
    ],
    ...over,
  }
}

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('expected a value')
  return v
}
/** The page's own script (letterhead mode has exactly one). */
const scriptOf = (html: string): string => must(/<script>([\s\S]*?)<\/script>/.exec(html)?.[1])
const contractRow = (doc: Document, startsWith: string): Element =>
  must(Array.from(doc.querySelectorAll('tr')).find((r) => textOf(r).startsWith(startsWith)))

/** Header cells in reading order: each label with the text of the cell after it. */
function headerPairs(doc: Document): Record<string, string> {
  const out: Record<string, string> = {}
  doc.querySelectorAll('section td, section th, section div').forEach((el) => {
    const t = textOf(el)
    if (['Date of Issue', 'Due Date', 'Invoice No.', 'Deliver To', 'Bill To'].includes(t)) {
      const next = el.nextElementSibling
      if (next) out[t] = next.textContent
    }
  })
  return out
}

describe('invoice header block', () => {
  it('prints Date of Issue, Due Date and Invoice No. in one row, dates as dd/mm/yyyy', () => {
    const doc = parse(buildInvoiceHTML(inv()))
    const pairs = headerPairs(doc)
    expect(pairs['Date of Issue']).toBe('17/10/2026')
    expect(pairs['Due Date']).toBe('17/11/2026')
    expect(pairs['Invoice No.']).toBe('FNC-26-80')
  })

  it('puts Deliver To and Bill To in two boxes, one line per line break', () => {
    const doc = parse(buildInvoiceHTML(inv()))
    const pairs = headerPairs(doc)
    expect(pairs['Deliver To']).toBe('TotalEnergies EP Ratawi Hub SAS\nRatawi Site\nBasra - IRAQ')
    expect(pairs['Bill To']).toBe(
      'TotalEnergies EP Ratawi Hub SAS\nMansour District, 601\nBaghdad - Iraq',
    )
    // pre-line is what turns the stored line breaks into lines on the page
    expect(buildInvoiceHTML(inv())).toContain('white-space:pre-line')
  })

  it("prints the CLIENT's contract number, never our internal contract number", () => {
    const html = buildInvoiceHTML(inv())
    const doc = parse(html)
    expect(textOf(contractRow(doc, '4300065926'))).toContain('4300065926')
    expect(html).not.toContain('IMPORT-BA-8102-2025')
  })

  it('fills the contract row: Job is the project name, Reference is the project code, Period defaults to n/a', () => {
    const doc = parse(buildInvoiceHTML(inv()))
    const row = contractRow(doc, '4300065926')
    expect(Array.from(row.children).map((c) => textOf(c))).toEqual([
      '4300065926',
      'modify the cool shack',
      'n/a',
      '30/07/2026',
      'BA-8102-2025',
    ])
    const head = must(row.previousElementSibling)
    expect(Array.from(head.children).map((c) => textOf(c))).toEqual([
      'Contract No.',
      'Job',
      'Period of Performance',
      'Date of Delivery',
      'Reference',
    ])
  })

  it('shows a dash for what is missing, and n/a for a missing period', () => {
    const doc = parse(
      buildInvoiceHTML(
        inv({
          clientContractNo: null,
          deliveryDate: null,
          deliverToAddress: '',
          periodOfPerformance: '',
        }),
      ),
    )
    const row = contractRow(doc, '—')
    expect(Array.from(row.children).map((c) => textOf(c))).toEqual([
      '—',
      'modify the cool shack',
      'n/a',
      '—',
      'BA-8102-2025',
    ])
    expect(headerPairs(doc)['Deliver To']).toBe('—')
  })

  it('stands the client name in for Bill To only when the caller sent no address at all', () => {
    const none = headerPairs(parse(buildInvoiceHTML(inv({ billToAddress: undefined }))))
    expect(none['Bill To']).toBe('TotalEnergies EP Ratawi Hub SAS')
    const blank = headerPairs(parse(buildInvoiceHTML(inv({ billToAddress: '' }))))
    expect(blank['Bill To']).toBe('—')
  })

  it('reads a date from the string, so a time zone cannot move the day', () => {
    const doc = parse(
      buildInvoiceHTML(inv({ invoiceDate: '2026-01-01', dueDate: '2026-12-31T21:00:00.000Z' })),
    )
    const pairs = headerPairs(doc)
    expect(pairs['Date of Issue']).toBe('01/01/2026')
    expect(pairs['Due Date']).toBe('31/12/2026')
  })
})

describe('text from the database is text, never markup', () => {
  const HOSTILE = '<img src=x onerror="window.__pwned=1">'
  const SCRIPT = '<script>window.__pwned=1</script>'
  const bank: BankAccount = {
    id: 'b1',
    accountName: HOSTILE,
    bankName: SCRIPT,
    beneficiaryName: HOSTILE,
    accountNumber: HOSTILE,
    iban: HOSTILE,
    swift: HOSTILE,
    branchCode: HOSTILE,
    bankAddress: SCRIPT,
    intermediaryBankName: HOSTILE,
    intermediarySwift: HOSTILE,
    intermediaryCountry: HOSTILE,
    currencyCode: HOSTILE,
    isActive: true,
  }
  const hostile = () =>
    inv({
      invoiceNumber: `INV-${HOSTILE}`,
      status: HOSTILE,
      currencyCode: HOSTILE,
      projectCode: HOSTILE,
      projectName: SCRIPT,
      clientName: HOSTILE,
      clientContractNo: HOSTILE,
      billToAddress: `${SCRIPT}\n${HOSTILE}`,
      deliverToAddress: HOSTILE,
      periodOfPerformance: HOSTILE,
      companyName: HOSTILE,
      companyLegalName: SCRIPT,
      companyCountry: HOSTILE,
      lines: [
        {
          lineNumber: 1,
          description: `${SCRIPT}${HOSTILE}`,
          qty: 1,
          unitCost: 1,
          subtotal: 1,
          marginPct: 0,
          marginAmount: 0,
          taxPct: 0,
          taxAmount: 0,
          lineTotal: 1,
        },
      ],
    })

  function assertNothingExecutable(html: string, ownScripts: number): void {
    const doc = parse(html)
    expect(doc.querySelectorAll('script')).toHaveLength(ownScripts)
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      for (const a of Array.from(el.attributes)) expect(a.name.startsWith('on')).toBe(false)
    }
    expect(doc.querySelector('img[src="x"]')).toBeNull()
    // the hostile text is shown, as text
    expect(doc.body.textContent).toContain(HOSTILE)
    expect(doc.body.textContent).toContain(SCRIPT)
    expect(html).not.toContain(HOSTILE)
    expect(html).not.toContain(SCRIPT)
  }

  it('escapes every field of the standard (no letterhead) invoice, bank block included', () => {
    assertNothingExecutable(buildInvoiceHTML(hostile(), bank, 'wire_transfer', null, null), 0)
  })

  it('escapes every field of the letterhead invoice, and its own script is the only script', () => {
    const html = buildInvoiceHTML(
      { ...hostile(), companyLetterheadImage: PNG },
      bank,
      'wire_transfer',
      PNG,
      PNG,
    )
    assertNothingExecutable(html, 1)
    // the company name and invoice number reach the footer through a JS string: still no raw markup
    const script = scriptOf(html)
    expect(script).not.toContain('<img')
    expect(script).not.toContain('onerror="')
  })

  describe('when the generated page runs its own script', () => {
    afterEach(() => {
      document.body.innerHTML = ''
      document.documentElement.className = ''
    })

    it('puts only the page number in the footers it builds: no database text reaches them', () => {
      const html = buildInvoiceHTML(
        { ...hostile(), companyLetterheadImage: PNG },
        null,
        'cash',
        PNG,
        null,
      )
      const script = scriptOf(html)
      document.body.innerHTML = parse(html).body.innerHTML
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(script)()
      expect(document.querySelectorAll('.page-footer-bar img')).toHaveLength(0)
      expect(textOf(document.querySelector('.page-footer-bar'))).toBe('Page 1 of 1')
    })
  })

  it('refuses an image value that could end its quote', () => {
    const evil = `${PNG}" onerror="alert(1)`
    const evilCss = `x');}</style><script>alert(1)</script><style>a{background:url('`
    const html = buildInvoiceHTML(
      { ...inv(), companyLetterheadImage: evilCss },
      null,
      'cash',
      evil,
      'javascript:alert(1)',
    )
    expect(html).not.toContain('onerror="alert(1)')
    expect(html).not.toContain('alert(1)')
    expect(parse(html).querySelectorAll('script')).toHaveLength(0)
  })
})

describe('esc and safeImageSrc', () => {
  it('escapes the five characters that matter, and treats null as empty', () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
    expect(esc(0)).toBe('0')
  })

  it.each([
    [PNG, PNG],
    ['data:image/jpeg;base64,/9j/4AAQSkZJRg==', 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='],
    [
      'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22x%22%2F%3E',
      'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22x%22%2F%3E',
    ],
    ['https://example.com/logo.png?v=1&w=2', 'https://example.com/logo.png?v=1&w=2'],
  ])('keeps %s', (input, expected) => {
    expect(safeImageSrc(input)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    `${PNG}"`,
    `${PNG} onerror=x`,
    "data:image/png;base64,AAAA')",
    'https://example.com/a b.png',
    "https://example.com/a'b.png",
    '',
  ])('refuses %s', (input) => {
    expect(safeImageSrc(input)).toBeNull()
  })

  it('refuses null and undefined', () => {
    expect(safeImageSrc(null)).toBeNull()
    expect(safeImageSrc(undefined)).toBeNull()
  })
})

/// The title block (top right) carries only the word INVOICE: letterhead artwork often fills that corner (Al Watanyia's Arabic
// company name sat under the QR code and, on later pages, under the invoice number). The Invoice No. box carries the number
// on page 1; the QR code sits bottom left on every page, in the footer band the letterhead scan keeps clear.
describe('letterhead title block and QR code', () => {
  const lines = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      lineNumber: i + 1,
      description: `Item ${i + 1}`,
      qty: 1,
      unitCost: 10,
      subtotal: 10,
      marginPct: 0,
      marginAmount: 0,
      taxPct: 0,
      taxAmount: 0,
      lineTotal: 10,
    }))
  // What a person reads: the page's own script carries the continuation header as a JS string, which is not text on the page.
  const visibleText = (doc: Document): string => {
    const body = must(doc.body.cloneNode(true) as HTMLElement | null)
    body.querySelectorAll('script, style').forEach((n) => {
      n.remove()
    })
    return textOf(body)
  }
  const letterheadHtml = (rows = 1, qr: string | null = PNG) =>
    buildInvoiceHTML(
      {
        ...inv({ invoiceNumber: 'NY-INV-2026-0001' }),
        companyLetterheadImage: PNG,
        lines: lines(rows),
      },
      null,
      'cash',
      null,
      qr,
    )
  // the absolutely positioned title block of page 1
  const titleBlock = (doc: Document): Element =>
    must(doc.querySelector('[style*="position:absolute"][style*="top:16mm"]'))

  it('shows only the word Invoice top right on page 1: no QR code, no number, no caption', () => {
    const doc = parse(letterheadHtml())
    const block = titleBlock(doc)
    expect(textOf(block)).toBe('Invoice')
    expect(block.querySelector('img')).toBeNull()
  })

  it('still prints the number once in the Invoice No. box', () => {
    const doc = parse(letterheadHtml())
    expect(headerPairs(doc)['Invoice No.']).toBe('NY-INV-2026-0001')
  })

  it('puts the QR code in the page marker of every page, with no caption', () => {
    const doc = parse(letterheadHtml(20))
    const bars = Array.from(doc.querySelectorAll('.page-footer-bar'))
    expect(bars.length).toBeGreaterThanOrEqual(3)
    for (const bar of bars) {
      const qr = bar.querySelectorAll('img.page-qr')
      expect(qr).toHaveLength(1)
      expect(qr[0].getAttribute('src')).toBe(PNG)
      expect(qr[0].getAttribute('alt')).toBe('Scan to verify')
    }
    expect(doc.querySelectorAll('.header-qr')).toHaveLength(0)
    expect(visibleText(doc)).not.toMatch(/scan to verify/i)
  })

  it('draws nothing for the QR code when there is none', () => {
    const doc = parse(letterheadHtml(1, null))
    expect(doc.querySelector('.page-qr')).toBeNull()
    expect(visibleText(doc)).not.toMatch(/scan to verify/i)
  })

  it('keeps the QR code and its caption out of the continuation header, and the number off the artwork', () => {
    const doc = parse(letterheadHtml(9))
    const later = must(doc.querySelector('.p2-print-hdr'))
    // the title only: the number would land on the letterhead artwork under it
    expect(textOf(later)).toBe('Invoice')
    expect(later.querySelector('img')).toBeNull()
    // a later page has no Invoice No. box, so the number sits on the free row above the rule, beside "Continued"
    const row = must(doc.querySelector('.p2-print-divider'))
    expect(textOf(row)).toBe('Continued from previous page NY-INV-2026-0001')
  })

  it('builds the same continuation header and QR code when the page script re-paginates', () => {
    const script = scriptOf(letterheadHtml(9))
    // the QR code is handed to the script as one escaped string, and appears there only as the page marker's image
    expect(script).toContain('var qrImg = ')
    expect(script).toContain('class=\\"page-qr\\"')
    expect(script).not.toContain('class=\\"header-qr\\"')
    // no caption element anywhere in the script: the words may appear only as the image's alt text
    const captions = script
      .split('Scan to verify')
      .slice(0, -1)
      .filter((before) => !before.endsWith('alt=\\"'))
    expect(captions).toHaveLength(0)
  })
})
