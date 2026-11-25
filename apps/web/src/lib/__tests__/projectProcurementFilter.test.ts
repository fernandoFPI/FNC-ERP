// The status filter rules of a project's Procurement tab (playbook #126): which chips exist, in what order, what a selection keeps,
// and what happens to a remembered selection that no longer matches anything.
import { describe, it, expect } from 'vitest'
import {
  PO_STATUS_ORDER,
  REQUISITION_STATUS_ORDER,
  effectiveSelection,
  filterByStatus,
  statusOptions,
  toggleStatus,
} from '../projectProcurementFilter'
import { REQUISITION_STATUSES } from '../requisition-constants'
import { ALL_PO_STATUSES } from '../po-constants'

interface Row {
  id: string
  status: string
}
const rows = (...statuses: string[]): Row[] =>
  statuses.map((status, i) => ({ id: String(i), status }))
const statusOf = (r: Row) => r.status
const label = (s: string) => `L:${s}`

describe('statusOptions', () => {
  it('has one option per status that occurs, with how many rows carry it', () => {
    const out = statusOptions(
      rows('draft', 'rejected', 'draft', 'rejected', 'rejected'),
      statusOf,
      REQUISITION_STATUS_ORDER,
      label,
    )
    expect(out).toEqual([
      { value: 'draft', label: 'L:draft', count: 2 },
      { value: 'rejected', label: 'L:rejected', count: 3 },
    ])
  })

  it('does not offer a status nothing has', () => {
    const out = statusOptions(rows('draft'), statusOf, REQUISITION_STATUS_ORDER, label)
    expect(out.map((o) => o.value)).toEqual(['draft'])
  })

  it('follows the order given, whatever the order of the rows', () => {
    const out = statusOptions(
      rows('completed', 'draft', 'sourcing', 'approved'),
      statusOf,
      REQUISITION_STATUS_ORDER,
      label,
    )
    expect(out.map((o) => o.value)).toEqual(['draft', 'approved', 'sourcing', 'completed'])
  })

  it('puts rejected after every live status and before cancelled', () => {
    const out = statusOptions(
      rows('cancelled', 'rejected', 'completed', 'draft'),
      statusOf,
      REQUISITION_STATUS_ORDER,
      label,
    )
    expect(out.map((o) => o.value)).toEqual(['draft', 'completed', 'rejected', 'cancelled'])
  })

  it('keeps a status the order does not know, last and by name, instead of dropping it', () => {
    const out = statusOptions(
      rows('zeta', 'draft', 'alpha', 'rejected'),
      statusOf,
      REQUISITION_STATUS_ORDER,
      label,
    )
    expect(out.map((o) => o.value)).toEqual(['draft', 'rejected', 'alpha', 'zeta'])
  })

  it('skips a row with no status rather than offering an empty chip', () => {
    const out = statusOptions(rows('draft', ''), statusOf, REQUISITION_STATUS_ORDER, label)
    expect(out.map((o) => o.value)).toEqual(['draft'])
  })

  it('is empty for no rows', () => {
    expect(statusOptions([], statusOf, REQUISITION_STATUS_ORDER, label)).toEqual([])
  })
})

describe('the two orders', () => {
  it('the requisition order holds every requisition status, in sequence, then the ways it can stop', () => {
    expect(REQUISITION_STATUS_ORDER.slice(0, REQUISITION_STATUSES.length)).toEqual(
      REQUISITION_STATUSES.map((s) => s.key),
    )
    expect(REQUISITION_STATUS_ORDER.slice(REQUISITION_STATUSES.length)).toEqual([
      'rejected',
      'cancelled',
      'deleted',
    ])
  })

  it('the PO order holds every status a PO can carry (the whole flow and the child flow), in sequence, then the ways it can stop', () => {
    expect(PO_STATUS_ORDER.slice(0, ALL_PO_STATUSES.length)).toEqual(
      ALL_PO_STATUSES.map((s) => s.key),
    )
    expect(PO_STATUS_ORDER.slice(ALL_PO_STATUSES.length)).toEqual([
      'rejected',
      'cancelled',
      'deleted',
    ])
    for (const s of ['bought', 'goods_received', 'finance_review', 'payment_pending', 'closed'])
      expect(PO_STATUS_ORDER, s).toContain(s)
  })

  it('has no status twice in either', () => {
    expect(new Set(REQUISITION_STATUS_ORDER).size).toBe(REQUISITION_STATUS_ORDER.length)
    expect(new Set(PO_STATUS_ORDER).size).toBe(PO_STATUS_ORDER.length)
  })
})

describe('effectiveSelection', () => {
  const options = statusOptions(
    rows('draft', 'rejected'),
    statusOf,
    REQUISITION_STATUS_ORDER,
    label,
  )

  it('keeps the selected statuses that occur', () => {
    expect(effectiveSelection(['rejected'], options)).toEqual(['rejected'])
  })

  it('drops a remembered status that no row carries any more', () => {
    expect(effectiveSelection(['cancelled', 'rejected'], options)).toEqual(['rejected'])
    expect(effectiveSelection(['cancelled'], options)).toEqual([])
  })

  it('is empty for nothing selected', () => {
    expect(effectiveSelection([], options)).toEqual([])
  })
})

describe('filterByStatus', () => {
  const all = rows('draft', 'rejected', 'sourcing', 'rejected')

  it('nothing selected is no filter: every row, in the same order, as a new array', () => {
    const out = filterByStatus(all, statusOf, [])
    expect(out).toEqual(all)
    expect(out).not.toBe(all)
  })

  it('keeps the rows whose status is selected, in their order', () => {
    expect(filterByStatus(all, statusOf, ['rejected']).map((r) => r.id)).toEqual(['1', '3'])
    expect(filterByStatus(all, statusOf, ['rejected', 'draft']).map((r) => r.id)).toEqual([
      '0',
      '1',
      '3',
    ])
  })

  it('a selected status nothing has gives nothing (the page removes such a status first)', () => {
    expect(filterByStatus(all, statusOf, ['cancelled'])).toEqual([])
  })
})

describe('toggleStatus', () => {
  it('adds a status that is off and removes one that is on, without touching the others', () => {
    expect(toggleStatus([], 'rejected')).toEqual(['rejected'])
    expect(toggleStatus(['rejected'], 'draft')).toEqual(['rejected', 'draft'])
    expect(toggleStatus(['rejected', 'draft'], 'rejected')).toEqual(['draft'])
    expect(toggleStatus(['draft'], 'draft')).toEqual([])
  })

  it('does not change the array it was given', () => {
    const before = ['rejected']
    toggleStatus(before, 'draft')
    toggleStatus(before, 'rejected')
    expect(before).toEqual(['rejected'])
  })
})
