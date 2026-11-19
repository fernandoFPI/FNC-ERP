// Two things that kept drifting, pinned by reading the source (the same pattern as the other source-scan tests):
//
// 1. A labelled form control (`<Input label=...>`, `<Select ...>`, `<Textarea ...>`, `<SearchableSelect ...>`,
//    `<DatePicker ...>`) must opt into the `field` look: 40px, 10px corners, the readable edge, the shared chevron. A form
//    whose boxes drift into three families (a grey native select between searchable pickers, as on the New Requisition
//    form) is the bug this catches. Filter bars are the exception: they stay compact (36px) on purpose.
//
// 2. The PO pages (detail, form, receipt, returns) and the comments dialog take every colour from the theme. They had
//    ~100 fixed hex colours (a light pink box, bright green text, a fixed #2563EB) that read badly in the dark theme, and
//    used the shared `Button`, whose primary is a pale tint, beside the solid accent button of the requisition page.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      walk(full, out)
    } else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

interface Tag {
  name: string
  text: string
  line: number
}

// Every opening tag of the controls, read with a brace / quote depth so an arrow function inside an attribute does not
// end it early.
function controlTags(src: string): Tag[] {
  const re = /<(Input|Select|SearchableSelect|Textarea|DatePicker)(?=[\s/>])/g
  const tags: Tag[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let j = m.index + m[0].length
    let depth = 0
    let quote: string | null = null
    for (; j < src.length; j++) {
      const c = src[j]
      if (quote) {
        if (c === quote && src[j - 1] !== '\\') quote = null
        continue
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c
        continue
      }
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    tags.push({
      name: m[1],
      text: src.slice(m.index, j + 1),
      line: src.slice(0, m.index).split('\n').length,
    })
  }
  return tags
}

// Filter bars keep the compact 36px boxes: they sit in one row with buttons and chips.
const FILTER_FILES = new Set([
  'components/ui/FilterBar.tsx',
  'components/ui/ReportFilterPanel.tsx',
  'components/ui/AuditLogViewer.tsx',
  'pages/finance/accounts/AccountLedger.tsx',
  'pages/finance/reports/ProfitLoss.tsx',
  'pages/finance/reports/BalanceSheet.tsx',
  'pages/finance/reports/TrialBalance.tsx',
])

describe('labelled form controls use the field look', () => {
  const files = walk(SRC).map((f) => ({ file: f, rel: path.relative(SRC, f).replace(/\\/g, '/') }))

  it('reads the controls it is meant to (a scan that finds nothing would pass for the wrong reason)', () => {
    const all = files.flatMap(({ file }) => controlTags(read(file)))
    expect(all.length).toBeGreaterThan(300)
    expect(all.filter((t) => /\sfield(\s|=|\/|>)/.test(t.text)).length).toBeGreaterThan(300)
  })

  it('has no labelled control without `field`, outside the filter bars', () => {
    const missing: string[] = []
    for (const { file, rel } of files) {
      if (FILTER_FILES.has(rel)) continue
      for (const tag of controlTags(read(file))) {
        if (!/\slabel=/.test(tag.text)) continue
        if (/\sfield(\s|=|\/|>)/.test(tag.text)) continue
        missing.push(`${rel}:${tag.line} <${tag.name}>`)
      }
    }
    expect(missing).toEqual([])
  })

  it('still finds a labelled control without `field` in a filter bar: the exception is real, not a stale list', () => {
    const filterTags = [...FILTER_FILES].flatMap((rel) =>
      controlTags(read(path.join(SRC, rel))).filter(
        (t) => /\slabel=/.test(t.text) && !/\sfield(\s|=|\/|>)/.test(t.text),
      ),
    )
    expect(filterTags.length).toBeGreaterThan(0)
  })

  it('every filter file in the list exists', () => {
    for (const rel of FILTER_FILES) {
      expect(() => readFileSync(path.join(SRC, rel))).not.toThrow()
    }
  })
})

describe('the PO pages take their colours and buttons from the theme', () => {
  const PO_FILES = [
    'pages/procurement/purchase-orders/PurchaseOrderDetail.tsx',
    'pages/procurement/purchase-orders/PurchaseOrderForm.tsx',
    'pages/procurement/purchase-orders/POReturnDetail.tsx',
    'pages/procurement/purchase-orders/POReturnForm.tsx',
    'pages/procurement/receipts/ReceiptForm.tsx',
    'pages/procurement/requisitions/LineCommentsModal.tsx',
    'components/procurement/EditRequestCard.tsx',
    'components/procurement/OverflowMenu.tsx',
  ]

  it.each(PO_FILES)('%s has no fixed 6-digit hex colour', (rel) => {
    const hex = read(path.join(SRC, rel)).match(/#[0-9a-fA-F]{6}\b/g) ?? []
    expect(hex).toEqual([])
  })

  it.each(PO_FILES)('%s has no fixed brand colour constant or bold-fill style', (rel) => {
    const src = read(path.join(SRC, rel))
    expect(src).not.toMatch(/BRAND_(BLUE|GREEN|ORANGE|RED)/)
    expect(src).not.toMatch(/PRIMARY_CTA_STYLE|primaryStyle/)
  })

  it.each(PO_FILES)('%s uses the solid-accent ActionButton, not the shared pale Button', (rel) => {
    const src = read(path.join(SRC, rel))
    expect(src).not.toMatch(/<Button[\s>]/)
    expect(src).not.toMatch(/import \{[^}]*\bButton\b[^}]*\} from '[./]*components\/ui\/Button'/)
  })
})
