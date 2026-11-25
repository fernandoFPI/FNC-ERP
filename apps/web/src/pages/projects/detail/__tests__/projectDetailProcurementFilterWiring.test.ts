// ProjectDetail.tsx is a 36,000-line page with no render harness, so how the Procurement tab wires its status filters (Purchase Orders
// and Requisitions, playbook #126) is pinned here at the source; the rules themselves are tested in lib/__tests__/projectProcurementFilter
// and hooks/__tests__/useStatusFilter, and the Requisitions list's own behaviour in components/projects/__tests__.
// The checks are booleans with a message on purpose: `expect(src).toContain(...)` would print the whole file when it fails.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const src = fs.readFileSync(path.resolve(__dirname, '../ProjectDetail.tsx'), 'utf8')
const has = (text: string) => {
  expect(src.includes(text), `ProjectDetail.tsx should contain: ${text}`).toBe(true)
}
const between = (from: string, to: string) => {
  const a = src.indexOf(from)
  const b = src.indexOf(to, a + from.length)
  expect(a, `anchor not found: ${from}`).toBeGreaterThan(-1)
  expect(b, `anchor not found: ${to}`).toBeGreaterThan(a)
  return src.slice(a, b)
}
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1
// A call the formatter may wrap over several lines (and give a trailing comma) is the same call: compare without whitespace.
const norm = (s: string) => s.replace(/\s+/g, '').replace(/,([)}\]])/g, '$1')
const hasNorm = (haystack: string, needle: string) => norm(haystack).includes(norm(needle))

describe('the status filters on the Procurement tab', () => {
  it('keep their selection per project and per list, for the browser tab', () => {
    has("useStatusFilter(`project-proc-po:${id ?? ''}`)")
    has("useStatusFilter(`project-proc-req:${id ?? ''}`)")
  })

  it('build the Purchase Orders chips from the POs that exist, in the PO status order, with the PO status names', () => {
    const block = between('const poStatusOf', 'const subNav:')
    expect(
      hasNorm(block, 'statusOptions(recentPos, poStatusOf, PO_STATUS_ORDER, getPOStatusLabel)'),
      'the chips are built from the POs, in the PO order, with the PO labels',
    ).toBe(true)
    expect(
      block.includes('effectiveSelection(poStatusFilter, poOptions)'),
      'a stale remembered status is dropped',
    ).toBe(true)
    expect(block.includes('filterByStatus(recentPos, poStatusOf, poSelected)')).toBe(true)
  })

  it('draw the chips in the Purchase Orders section, with the total, and say "Showing x of y" only while something is ticked', () => {
    const po = between("procSection === 'purchase_orders'", '{/* Requisitions of this project */}')
    expect(po.includes('<StatusFilterChips'), 'the chips').toBe(true)
    expect(po.includes('total={recentPos.length}'), 'All counts every PO').toBe(true)
    expect(po.includes('toggleStatus(poSelected, value)'), 'toggling').toBe(true)
    expect(po.includes('setPoStatusFilter([])'), 'All clears').toBe(true)
    expect(po.includes('poSelected.length > 0'), 'the Showing text only while filtered').toBe(true)
    expect(
      hasNorm(
        po,
        "t('proj.detail.showingOf', { shown: shownPos.length, total: recentPos.length })",
      ),
      'the text names the filtered and the total number',
    ).toBe(true)
  })

  it("show only the filtered POs, on a phone and on a desktop, and end the last row's border on the filtered list", () => {
    const po = between("procSection === 'purchase_orders'", '{/* Requisitions of this project */}')
    expect(count(po, 'shownPos.map('), 'both layouts read the filtered list').toBe(2)
    expect(po.includes('recentPos.map('), 'neither reads the whole list').toBe(false)
    expect(
      po.includes('i < shownPos.length - 1'),
      'the divider logic follows the filtered list',
    ).toBe(true)
    expect(po.includes('shownPos.length > 0'), 'the list is drawn from the filtered count').toBe(
      true,
    )
  })

  it("name and colour a PO row's status like the chip and the PO page, instead of printing the raw word", () => {
    has("import { getPOStatusLabel, getPOStatusVariant } from '../../../lib/po-constants'")
    const po = between("procSection === 'purchase_orders'", '{/* Requisitions of this project */}')
    expect(count(po, '{poStatusBadge(po)}'), 'the badge in both layouts').toBe(2)
    expect(
      po.includes('<Badge variant="neutral">{String(po.status'),
      'no raw status badge is left',
    ).toBe(false)
    const helper = between('const poStatusBadge', 'const subNav:')
    expect(
      helper.includes('getPOStatusVariant(status)') && helper.includes('getPOStatusLabel(status)'),
    ).toBe(true)
  })

  it('hand the Requisitions list its selection and the setter that remembers it', () => {
    const section = between("procSection === 'requisitions'", "procSection === 'manufacturing'")
    expect(section.includes('selectedStatuses={reqStatusFilter}')).toBe(true)
    expect(section.includes('onSelectedStatusesChange={setReqStatusFilter}')).toBe(true)
  })

  it('leave the sub-navigation counts as the totals of every PO and requisition, not of the filtered ones', () => {
    const nav = between('const subNav:', 'return (')
    expect(nav.includes('count: recentPos.length')).toBe(true)
    expect(nav.includes('count: projectRequisitions.length')).toBe(true)
    expect(nav.includes('shownPos'), 'the PO count is not the filtered one').toBe(false)
  })
})
