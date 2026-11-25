// ProjectDetail.tsx is a 36,000-line page with no render harness, so how the Procurement tab wires its Requisitions section is
// pinned here at the source (the list itself is tested by components/projects/__tests__/ProjectRequisitionsList.test.tsx).
// The checks are booleans with a message on purpose: `expect(src).toContain(...)` would print the whole file when it fails.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const src = fs.readFileSync(path.resolve(__dirname, '../ProjectDetail.tsx'), 'utf8')
const has = (text: string) => {
  expect(src.includes(text), `ProjectDetail.tsx should contain: ${text}`).toBe(true)
}

// The part of the file between two anchors, so a check cannot be satisfied by an unrelated place.
const between = (from: string, to: string) => {
  const a = src.indexOf(from)
  const b = src.indexOf(to, a + from.length)
  expect(a, `anchor not found: ${from}`).toBeGreaterThan(-1)
  expect(b, `anchor not found: ${to}`).toBeGreaterThan(a)
  return src.slice(a, b)
}

describe('the Requisitions section of the Procurement tab', () => {
  it("is one of the tab's sections", () => {
    has("'purchase_orders' | 'requisitions' | 'manufacturing' | 'store_out'")
  })

  it('asks for the requisitions of THIS project only, only on the Procurement tab, only for someone who may open the Requisitions page', () => {
    const q = between('const canSeeRequisitions', 'const { data: miData }')
    expect(
      q.includes("can('procurement.po.view')"),
      'gated by the key that guards the Requisitions route',
    ).toBe(true)
    expect(q.includes('REQUISITIONS_QUERY'), 'uses the requisitions query').toBe(true)
    expect(q.includes('variables: { projectId: id }'), 'filtered by this project').toBe(true)
    expect(q.includes("tab !== 'procurement'"), 'skipped off the Procurement tab').toBe(true)
    expect(q.includes('!canSeeRequisitions'), 'skipped without the permission').toBe(true)
  })

  it('puts the section in the sub-navigation after Purchase Orders, with its count, only when it may be seen', () => {
    const nav = between('const subNav:', 'return (')
    const po = nav.indexOf("key: 'purchase_orders'")
    const req = nav.indexOf("key: 'requisitions'")
    const mfg = nav.indexOf("key: 'manufacturing'")
    expect(po, 'purchase orders entry').toBeGreaterThan(-1)
    expect(req, 'requisitions entry').toBeGreaterThan(po)
    expect(mfg, 'manufacturing entry').toBeGreaterThan(req)
    expect(nav.includes('canSeeRequisitions'), 'the entry is conditional on the permission').toBe(
      true,
    )
    expect(nav.includes("t('proj.detail.requisitions')"), 'uses the translated label').toBe(true)
    expect(nav.includes('projectRequisitions.length'), 'shows the count').toBe(true)
  })

  it('draws the list only for that section and only with the permission, creating through the same route as Purchase Orders and opening a requisition on its own page', () => {
    const section = between("procSection === 'requisitions'", "procSection === 'manufacturing'")
    expect(section.includes('canSeeRequisitions'), 'permission').toBe(true)
    expect(section.includes('<ProjectRequisitionsList'), 'the list component').toBe(true)
    expect(
      section.includes('canCreate={canEdit.procurement}'),
      'same right as the Purchase Orders button',
    ).toBe(true)
    expect(
      section.includes('/procurement/requisitions/new?projectId=${id}'),
      'a new requisition starts on this project',
    ).toBe(true)
    expect(
      section.includes('/procurement/requisitions/${reqId}'),
      'opens the requisition page',
    ).toBe(true)
  })
})
