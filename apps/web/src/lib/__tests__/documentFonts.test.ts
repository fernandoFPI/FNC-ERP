// Printed documents use STATIC Inter from our own site (lib/documentFonts.ts, playbook #68). Google serves Inter as a
// variable font, which Chrome cannot embed in a PDF: it writes Type 3 text broken into a piece at every space and
// hyphen, and a PDF program that re-flows it printed the invoice number "NY-INV-2026-0005" with the "Y-I" on top of
// each other. What a unit test can pin is the wiring: the document asks for the static files, the files exist, and
// nothing pulls the Google variable font back in. (How the PDF looks was checked in headless Chrome: no Type 3 fonts.)
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  INTER_FONT_DIR,
  INTER_FONT_FACES,
  INTER_SUBSETS,
  INTER_WEIGHTS,
  interFontFile,
} from '../documentFonts'
import { buildInvoiceHTML, type InvoiceRenderData } from '../invoiceHtml'

// Tests run from apps/web (pnpm test, turbo and CI all run a package from its own folder).
const FONT_FOLDER = resolve(process.cwd(), 'public', 'fonts') + '/'

const invoice: InvoiceRenderData = {
  invoiceNumber: 'NY-INV-2026-0005',
  status: 'issued',
  invoiceDate: '2026-11-07',
  dueDate: '2026-12-06',
  billingMethod: 'fixed_lump_sum',
  paymentTermsDays: 30,
  currencyCode: 'USD',
  paymentType: 'wire_transfer',
  grossTotal: 100,
  retentionAmount: 0,
  retentionPct: 0,
  netPayable: 100,
  lines: [
    {
      lineNumber: 1,
      description: 'Item',
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
}

describe('static Inter files', () => {
  it('declares every weight for both subsets, each with its own unicode range', () => {
    const rules = INTER_FONT_FACES.split('\n').filter((l) => l.includes('@font-face'))
    expect(rules).toHaveLength(Object.keys(INTER_SUBSETS).length * INTER_WEIGHTS.length)
    for (const rule of rules) {
      expect(rule).toContain("font-family: 'Inter'")
      expect(rule).toMatch(/font-weight: (400|500|600|700);/) // one weight each, never a variable range like "100 900"
      expect(rule).toContain('unicode-range: U+')
      expect(rule).toContain("format('woff2')")
    }
  })

  it('every file it points at exists, is a real woff2 and is not empty', () => {
    const urls = [...INTER_FONT_FACES.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1])
    expect(urls).toHaveLength(8)
    for (const url of urls) {
      expect(url.startsWith(INTER_FONT_DIR)).toBe(true)
      const file = FONT_FOLDER + url.slice(INTER_FONT_DIR.length)
      expect(existsSync(file), `${url} is missing from apps/web/public/fonts`).toBe(true)
      expect(statSync(file).size, url).toBeGreaterThan(10_000)
      expect(readFileSync(file).subarray(0, 4).toString('latin1'), url).toBe('wOF2')
    }
  })

  it('names the files the way the folder holds them', () => {
    for (const subset of Object.keys(INTER_SUBSETS) as (keyof typeof INTER_SUBSETS)[])
      for (const weight of INTER_WEIGHTS)
        expect(existsSync(FONT_FOLDER + interFontFile(subset, weight))).toBe(true)
  })

  it('ships the license that the Open Font License requires with the font files', () => {
    const license = readFileSync(FONT_FOLDER + 'Inter-OFL.txt', 'utf8')
    expect(license).toContain('SIL Open Font License')
  })
})

describe('the invoice document', () => {
  const html = buildInvoiceHTML(invoice, undefined, 'wire_transfer')

  it('asks for the static Inter files from our own site', () => {
    expect(html).toContain("@font-face { font-family: 'Inter'")
    expect(html).toContain("url('/fonts/inter-latin-400-normal.woff2')")
    expect(html).toContain("url('/fonts/inter-latin-ext-700-normal.woff2')")
  })

  it('does not pull in the Google variable font', () => {
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
    expect(html).not.toContain('@import')
  })

  it('keeps Arial as the fallback for anything Inter does not cover', () => {
    expect(html).toContain("font-family: 'Inter', Arial, sans-serif")
  })
})
