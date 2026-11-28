// What a project's page says about its purchase orders (playbook #92, NY-PRJ-2026-0032).
// The Overview read `totalAmount ?? amount` while the data's key is `total_amount` (every amount was 0), added every amount
// into one number labelled with the project's currency, counted a cancelled PO in the total but not in the rows, and called
// "Approved POs" only the ones whose status was exactly `approved` (0 for a project whose 22 POs were all received and closed).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  APPROVED_OR_LATER_PO_STATUSES,
  BEFORE_APPROVAL_PO_STATUSES,
  DEAD_PO_STATUSES,
  FINISHED_PO_STATUSES,
  approvedOrLaterAmount,
  countApprovedOrLater,
  currenciesWithMoney,
  isOpenPo,
  pendingApprovalAmount,
  poAmountLines,
  poAmountsByCurrency,
  summarisePosByStatus,
  type ProjectPoLike,
} from '../projectPoSummary'

const po = (
  status: string,
  lines: [string, number][],
  over: Partial<ProjectPoLike> = {},
): ProjectPoLike => ({
  status,
  currency_code: lines[0]?.[0] ?? 'USD',
  total_amount: lines.reduce((s, [, a]) => s + a, 0).toFixed(4),
  line_totals: lines.map(([currency_code, amount]) => ({ currency_code, amount: String(amount) })),
  ...over,
})

describe('the status groups', () => {
  const migration = fs.readFileSync(
    path.resolve(
      __dirname,
      // the LATEST migration that rewrote the constraint (258 made the child statuses, 337 added returned_to_organizer)
      '../../../../../packages/db/migrations/337_po_return_to_organizer_review.sql',
    ),
    'utf8',
  )
  const constraint = /purchase_orders_status_check\s+CHECK \(status IN \(([^)]*)\)\)/.exec(
    migration,
  )
  const dbStatuses = [...(constraint?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

  it('read the real purchase_orders_status_check', () => {
    expect(dbStatuses.length).toBe(21)
  })

  it('place every status in exactly one group (a new status fails here until it is classified)', () => {
    const groups = [BEFORE_APPROVAL_PO_STATUSES, APPROVED_OR_LATER_PO_STATUSES, DEAD_PO_STATUSES]
    for (const s of dbStatuses) {
      const inGroups = groups.filter((g) => g.includes(s)).length
      expect(inGroups, `${s} must be in exactly one group`).toBe(1)
    }
    const all = groups.flat()
    expect(new Set(all).size).toBe(all.length)
    expect([...all].sort()).toEqual([...dbStatuses].sort())
  })

  it('mirror the server rule for a finished PO (packages/db/src/poStatus.ts)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../../../packages/db/src/poStatus.ts'),
      'utf8',
    )
    const m = /export const FINISHED_PO_STATUSES = \[([^\]]*)\] as const/.exec(src)
    if (!m?.[1]) throw new Error('FINISHED_PO_STATUSES not found in poStatus.ts')
    const server = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    expect(server).toEqual([...FINISHED_PO_STATUSES])
  })

  it('a closed or completed PO is finished, a rejected one is not (it can be reopened), and so is an unknown status', () => {
    expect(isOpenPo(po('closed', []))).toBe(false)
    expect(isOpenPo(po('completed', []))).toBe(false)
    expect(isOpenPo(po('cancelled', []))).toBe(false)
    expect(isOpenPo(po('deleted', []))).toBe(false)
    expect(isOpenPo(po('rejected', []))).toBe(true)
    expect(isOpenPo(po('payment_pending', []))).toBe(true)
    expect(isOpenPo(po('some_future_status', []))).toBe(true)
  })
})

describe('poAmountsByCurrency', () => {
  it('reads what the LINES hold, one figure per currency, whatever the header says', () => {
    // NY-PO-2026-0063: a USD header total of 11,276.96 that added a 10,000 IQD line into 1,276.96 USD
    const mixed = po(
      'closed',
      [
        ['USD', 1276.96],
        ['IQD', 10000],
      ],
      { currency_code: 'USD' },
    )
    expect(poAmountsByCurrency(mixed)).toEqual({ USD: 1276.96, IQD: 10000 })
  })

  it('adds two lines of one currency', () => {
    expect(
      poAmountsByCurrency(
        po('closed', [
          ['USD', 5],
          ['USD', 7.5],
        ]),
      ),
    ).toEqual({ USD: 12.5 })
  })

  it('falls back to the header total in the header currency only when the server sent no lines at all', () => {
    expect(
      poAmountsByCurrency({ status: 'closed', currency_code: 'USD', total_amount: '300.5000' }),
    ).toEqual({ USD: 300.5 })
    // an empty header total (a mixed PO from an older server) is nothing, never 0 USD
    expect(
      poAmountsByCurrency({ status: 'closed', currency_code: 'IQD', total_amount: null }),
    ).toEqual({})
  })

  it('treats a PO whose line_totals is an empty list as holding nothing (it does not fall back to the header)', () => {
    expect(
      poAmountsByCurrency(po('draft', [], { total_amount: '999', currency_code: 'USD' })),
    ).toEqual({})
  })

  it('ignores an entry with no currency and one with a number that is not a number', () => {
    const p: ProjectPoLike = {
      status: 'closed',
      line_totals: [{ amount: '5' }, { currency_code: 'USD', amount: 'abc' }],
    }
    expect(poAmountsByCurrency(p)).toEqual({ USD: 0 })
  })
})

describe('summarisePosByStatus', () => {
  const report = [
    po('closed', [['USD', 50]]),
    po('closed', [['USD', 1000]]),
    po(
      'closed',
      [
        ['USD', 1276.96],
        ['IQD', 10000],
      ],
      { currency_code: 'USD' },
    ),
    po('approved', [['USD', 100]]),
    po('pending_approval', [['USD', 900]]),
    po('cancelled', [['IQD', 12000]]),
    po('deleted', [['IQD', 500]]),
  ]

  it('one row per status that has POs, in workflow order, with the money per currency', () => {
    const s = summarisePosByStatus(report)
    expect(s.rows.map((r) => [r.status, r.count])).toEqual([
      ['pending_approval', 1],
      ['approved', 1],
      ['closed', 3],
    ])
    expect(s.rows.find((r) => r.status === 'closed')?.amounts).toEqual({ USD: 2326.96, IQD: 10000 })
  })

  it('cancelled and deleted POs are in neither the rows nor the total, so the rows add up to the total', () => {
    const s = summarisePosByStatus(report)
    expect(s.total).toBe(5)
    expect(s.rows.reduce((n, r) => n + r.count, 0)).toBe(s.total)
    // 12,000 + 500 IQD of the dead ones are not in the IQD total
    expect(s.totals).toEqual({ USD: 3326.96, IQD: 10000 })
  })

  it('never adds one currency into another', () => {
    const s = summarisePosByStatus([po('closed', [['USD', 1]]), po('closed', [['IQD', 1500]])])
    expect(s.totals).toEqual({ USD: 1, IQD: 1500 })
  })

  it('shows a status it has never heard of rather than dropping its POs', () => {
    const s = summarisePosByStatus([
      po('some_future_status', [['USD', 3]]),
      po('closed', [['USD', 1]]),
    ])
    expect(s.rows.map((r) => r.status)).toEqual(['closed', 'some_future_status'])
    expect(s.total).toBe(2)
  })

  it('a project with no POs has no rows and a total of 0', () => {
    expect(summarisePosByStatus([])).toEqual({ rows: [], total: 0, totals: {} })
  })

  it('a row carries the status label the rest of the app uses', () => {
    const s = summarisePosByStatus([po('payment_pending', [['USD', 1]])])
    expect(s.rows[0].label).toBe('Payment pending')
  })
})

describe('the header tiles', () => {
  const pos = [
    po('closed', [['USD', 50]]),
    po('payment_pending', [
      ['USD', 200],
      ['IQD', 4000],
    ]),
    po('approved', [['USD', 10]]),
    po('pending_approval', [
      ['USD', 900],
      ['IQD', 1],
    ]),
    po('draft', [['USD', 77]]),
    po('cancelled', [['USD', 5000]]),
  ]

  it('"approved" counts approved AND LATER, not cancelled, not before approval', () => {
    expect(countApprovedOrLater(pos)).toBe(3)
    expect(countApprovedOrLater([po('closed', []), po('closed', [])])).toBe(2)
    expect(countApprovedOrLater([po('draft', []), po('cancelled', [])])).toBe(0)
  })

  it('the approved amount is what those POs hold in the header currency, from the lines', () => {
    expect(approvedOrLaterAmount(pos, 'USD')).toBe(260)
    expect(approvedOrLaterAmount(pos, 'IQD')).toBe(4000)
    expect(approvedOrLaterAmount(pos, 'EUR')).toBe(0)
  })

  it('the pending amount is only POs waiting for approval, in one currency', () => {
    expect(pendingApprovalAmount(pos, 'USD')).toBe(900)
    expect(pendingApprovalAmount(pos, 'IQD')).toBe(1)
  })
})

describe('list helpers', () => {
  it('poAmountLines lists only currencies that hold money, in a stable order', () => {
    expect(
      poAmountLines(
        po('closed', [
          ['USD', 5],
          ['IQD', 0],
          ['EUR', 2],
        ]),
      ),
    ).toEqual([
      { currency: 'EUR', amount: 2 },
      { currency: 'USD', amount: 5 },
    ])
    expect(poAmountLines({ status: 'draft', currency_code: 'USD', total_amount: null })).toEqual([])
  })

  it('currenciesWithMoney skips zero and sorts', () => {
    expect(currenciesWithMoney({ USD: 1, IQD: 0, AED: -3 })).toEqual(['AED', 'USD'])
  })
})
