// Settling the lines of a PO that has lines in two currencies (migration 324, playbook #90).
//
// A PO funded from advances now holds one advance PER CURRENCY (po_funding_advances). A line is settled against the
// advance of its own currency: the IQD lines of a mixed PO go to its IQD advance and the USD lines to its USD advance, each
// in its own currency. Before, the queue and the bundle joined on the PO's single `funding_advance_id` and booked the summed
// total_price in the advance's currency, so a USD line settled against an IQD advance would have become an IQD amount with no
// conversion. Real Postgres through the real routes (supertest), in the finance fixture company.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser, getAccountId } from './setup.js'

const app = createApp()
const PREFIX = 'F-ADVCCY-TEST-'

let token = ''
let userId = ''
let advIqd = ''
let advUsd = ''
let advIqdOther = ''
let expenseAccountId = ''
let costCenterId = ''
const L: Record<string, string> = {} // line ids by key

const auth = () => ({ Authorization: `Bearer ${token}` })

// One PO with a line per entry. `links` is what setPOFunding would have written: the advance of each currency.
async function makePO(key: string, lines: { key: string; ccy: 'IQD' | 'USD'; amount: number }[], links: Record<string, string>, status = 'closed') {
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, currency_code, base_currency_code, status, purpose, created_by,
                                  funding_source, funding_decided, funding_advance_id)
     VALUES ($1,$2,'IQD','IQD',$3,'stock',$4,'employee_advance',true,$5) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}${key}`, status, userId, Object.values(links)[0] ?? null],
  )
  for (const [ccy, advance] of Object.entries(links)) {
    await pool.query(`INSERT INTO po_funding_advances (po_id, currency_code, advance_id, company_id) VALUES ($1,$2,$3,$4)`, [
      po.rows[0]!.id,
      ccy,
      advance,
      TEST_COMPANY_ID,
    ])
  }
  let n = 0
  for (const l of lines) {
    n += 1
    const r = await pool.query<{ id: string }>(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, currency_code, account_id, cost_center_id)
       VALUES ($1,$2,$3,1,$4,$4,$5,$6,$7) RETURNING id`,
      [po.rows[0]!.id, n, `${key} ${l.key}`, l.amount, l.ccy, expenseAccountId, costCenterId],
    )
    L[`${key}.${l.key}`] = r.rows[0]!.id
  }
}

async function cleanup(): Promise<void> {
  const settlements = (
    await pool.query<{ id: string; journal_entry_id: string | null }>(
      `SELECT s.id, s.journal_entry_id FROM advance_settlements s JOIN employee_advances a ON a.id = s.advance_id WHERE a.advance_number LIKE $1`,
      [`${PREFIX}%`],
    )
  ).rows
  await pool.query(`UPDATE po_lines SET advance_settlement_id = NULL WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`, [`${PREFIX}%`])
  const journalIds = settlements.map((s) => s.journal_entry_id).filter((x): x is string => !!x)
  await pool.query(`DELETE FROM advance_settlements WHERE id = ANY($1::uuid[])`, [settlements.map((s) => s.id)])
  if (journalIds.length) {
    await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id = ANY($1::uuid[])`, [journalIds])
    await pool.query(`DELETE FROM journal_entries WHERE id = ANY($1::uuid[])`, [journalIds])
  }
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, [`${PREFIX}%`]) // takes po_funding_advances with it
  await pool.query(`DELETE FROM employee_advances WHERE advance_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM cost_centers WHERE code LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  const user = await createTestUser()
  token = user.token
  userId = user.userId
  expenseAccountId = await getAccountId('5100')
  const cashId = await getAccountId('1100')
  const advanceAssetId = await getAccountId('1200')
  costCenterId = (
    await pool.query<{ id: string }>(`INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'Per-currency test cc','overhead') RETURNING id`, [
      TEST_COMPANY_ID,
      `${PREFIX}CC`,
    ])
  ).rows[0]!.id
  const employeeId = (
    await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number, status) VALUES ($1,'Ccy','Tester',CURRENT_DATE,$2,'active') RETURNING id`,
      [TEST_COMPANY_ID, `${PREFIX}${Date.now()}`],
    )
  ).rows[0]!.id
  const mkAdvance = async (tag: string, ccy: string, amount: number) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO employee_advances (company_id, advance_number, employee_id, employee_name, currency_code, amount, cash_account_id, advance_account_id, status)
         VALUES ($1,$2,$3,'Ccy Tester',$4,$5,$6,$7,'approved') RETURNING id`,
        [TEST_COMPANY_ID, `${PREFIX}${tag}-${Date.now()}`, employeeId, ccy, amount, cashId, advanceAssetId],
      )
    ).rows[0]!.id
  advIqd = await mkAdvance('IQD', 'IQD', 10_000_000)
  advUsd = await mkAdvance('USD', 'USD', 1_000)
  advIqdOther = await mkAdvance('IQD2', 'IQD', 10_000_000)

  // the case this is for: one PO, lines in both currencies, an IQD advance and a USD advance
  await makePO(
    'MIXED',
    [
      { key: 'iqd1', ccy: 'IQD', amount: 50_000 },
      { key: 'iqd2', ccy: 'IQD', amount: 20_000 },
      { key: 'usd1', ccy: 'USD', amount: 300 },
      { key: 'usd2', ccy: 'USD', amount: 400 },
    ],
    { IQD: advIqd, USD: advUsd },
  )
  // a USD line added after the funding was confirmed: only IQD has an advance, so nothing can settle that line
  await makePO(
    'LATE',
    [
      { key: 'iqd', ccy: 'IQD', amount: 1_000 },
      { key: 'usd', ccy: 'USD', amount: 10 },
    ],
    { IQD: advIqd },
  )
  // another PO paid by a different IQD advance
  await makePO('OTHER', [{ key: 'iqd', ccy: 'IQD', amount: 5_000 }], { IQD: advIqdOther })
  // a PO whose USD part is bigger than what is left on the USD advance
  await makePO('BIGUSD', [{ key: 'usd', ccy: 'USD', amount: 500 }], { USD: advUsd })
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email = 'finance-test@fnc-erp.local'`)
  await pool.end()
})

const queue = async (advance: string) => {
  const res = await request(app).get(`/finance/advances/${advance}/pending-po-lines`).set(auth())
  expect(res.status).toBe(200)
  return res.body.data as { id: string; currency_code: string; total_price: string }[]
}
const settle = (advance: string, lines: string[]) =>
  request(app).post('/finance/advances/settlements').set(auth()).send({ advance_id: advance, po_line_ids: lines })
const claimed = async (ids: string[]) =>
  (await pool.query(`SELECT 1 FROM po_lines WHERE id = ANY($1::uuid[]) AND advance_settlement_id IS NOT NULL`, [ids])).rowCount
const outstanding = async (advance: string) =>
  Number((await pool.query<{ o: string }>(`SELECT outstanding_amount AS o FROM employee_advances WHERE id=$1`, [advance])).rows[0]!.o)

describe('each advance sees only the lines of its own currency', () => {
  it("the IQD advance's queue holds the IQD lines of the mixed PO (and of the PO that is only partly covered), no USD line", async () => {
    const rows = await queue(advIqd)
    const ids = new Set(rows.map((r) => r.id))
    for (const k of ['MIXED.iqd1', 'MIXED.iqd2', 'LATE.iqd']) expect(ids.has(L[k]!), k).toBe(true)
    for (const k of ['MIXED.usd1', 'MIXED.usd2', 'LATE.usd', 'BIGUSD.usd']) expect(ids.has(L[k]!), k).toBe(false)
    expect(rows.every((r) => r.currency_code === 'IQD')).toBe(true)
    expect(ids.has(L['OTHER.iqd']!)).toBe(false) // another advance pays that PO
  })

  it("the USD advance's queue holds the USD lines of the mixed PO, no IQD line, and not the late USD line nothing is linked for", async () => {
    const rows = await queue(advUsd)
    const ids = new Set(rows.map((r) => r.id))
    for (const k of ['MIXED.usd1', 'MIXED.usd2', 'BIGUSD.usd']) expect(ids.has(L[k]!), k).toBe(true)
    for (const k of ['MIXED.iqd1', 'MIXED.iqd2', 'LATE.iqd', 'LATE.usd']) expect(ids.has(L[k]!), k).toBe(false)
    expect(rows.every((r) => r.currency_code === 'USD')).toBe(true)
  })

  it('the line added in a currency nobody was linked for is in no queue at all', async () => {
    for (const adv of [advIqd, advUsd, advIqdOther]) {
      expect((await queue(adv)).some((r) => r.id === L['LATE.usd'])).toBe(false)
    }
  })
})

describe('a line can only be settled against the advance of its own currency', () => {
  it('a USD line against the IQD advance is refused, and nothing is claimed', async () => {
    const res = await settle(advIqd, [L['MIXED.usd1']!])
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INELIGIBLE_LINES')
    expect(res.body.error.message).toMatch(/different currency/)
    expect(await claimed([L['MIXED.usd1']!])).toBe(0)
  })

  it('an IQD line against the USD advance is refused', async () => {
    const res = await settle(advUsd, [L['MIXED.iqd1']!])
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INELIGIBLE_LINES')
    expect(await claimed([L['MIXED.iqd1']!])).toBe(0)
  })

  it('a bundle that mixes both currencies is refused as a whole, whichever advance it names', async () => {
    for (const adv of [advIqd, advUsd]) {
      const res = await settle(adv, [L['MIXED.iqd1']!, L['MIXED.usd1']!])
      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('INELIGIBLE_LINES')
    }
    expect(await claimed([L['MIXED.iqd1']!, L['MIXED.usd1']!])).toBe(0)
  })

  it('the late USD line cannot be settled against any advance, the PO has none for that currency', async () => {
    for (const adv of [advIqd, advUsd, advIqdOther]) {
      const res = await settle(adv, [L['LATE.usd']!])
      expect(res.status, adv).toBe(422)
      expect(res.body.error.code).toBe('INELIGIBLE_LINES')
    }
  })
})

describe('settling the two halves of one PO', () => {
  it('the IQD lines settle against the IQD advance, in IQD, and the USD advance is untouched', async () => {
    const usdBefore = await outstanding(advUsd)
    const res = await settle(advIqd, [L['MIXED.iqd1']!, L['MIXED.iqd2']!])
    expect(res.status).toBe(201)
    const s = await pool.query<{ currency_code: string; total_amount: string }>(
      `SELECT currency_code, total_amount FROM advance_settlements WHERE id=$1`,
      [res.body.data.id],
    )
    expect(s.rows[0]!.currency_code.trim()).toBe('IQD')
    expect(Number(s.rows[0]!.total_amount)).toBe(70_000)
    const lines = await pool.query<{ currency_code: string; amount: string }>(
      `SELECT currency_code, amount FROM advance_settlement_lines WHERE settlement_id=$1 ORDER BY amount`,
      [res.body.data.id],
    )
    expect(lines.rows.map((l) => [l.currency_code.trim(), Number(l.amount)])).toEqual([
      ['IQD', 20_000],
      ['IQD', 50_000],
    ])
    expect(await outstanding(advIqd)).toBe(10_000_000 - 70_000)
    expect(await outstanding(advUsd)).toBe(usdBefore)
  })

  it('the USD lines settle against the USD advance, in USD, with the figures they were bought at', async () => {
    const res = await settle(advUsd, [L['MIXED.usd1']!, L['MIXED.usd2']!])
    expect(res.status).toBe(201)
    const s = await pool.query<{ currency_code: string; total_amount: string }>(
      `SELECT currency_code, total_amount FROM advance_settlements WHERE id=$1`,
      [res.body.data.id],
    )
    expect(s.rows[0]!.currency_code.trim()).toBe('USD')
    expect(Number(s.rows[0]!.total_amount)).toBe(700) // 300 + 400 USD, not folded into the IQD total
    const jl = await pool.query<{ currency_code: string; credit: string }>(
      `SELECT jl.currency_code, jl.credit FROM journal_lines jl JOIN advance_settlements s ON s.journal_entry_id = jl.journal_entry_id
        WHERE s.id=$1 AND jl.credit > 0`,
      [res.body.data.id],
    )
    expect(jl.rows.map((r) => [r.currency_code.trim(), Number(r.credit)])).toEqual([['USD', 700]])
    expect(await outstanding(advUsd)).toBe(1_000 - 700)
    expect(await outstanding(advIqd)).toBe(10_000_000 - 70_000) // the IQD advance did not move
  })

  it('settled lines leave their queue, and the PO has no unsettled line of those currencies left', async () => {
    expect((await queue(advIqd)).some((r) => r.id === L['MIXED.iqd1'])).toBe(false)
    expect((await queue(advUsd)).some((r) => r.id === L['MIXED.usd1'])).toBe(false)
    const left = await pool.query(
      `SELECT 1 FROM po_lines pl JOIN purchase_orders po ON po.id = pl.po_id
        WHERE po.po_number = $1 AND pl.advance_settlement_id IS NULL`,
      [`${PREFIX}MIXED`],
    )
    expect(left.rowCount).toBe(0)
  })
})

describe('the balance that matters is the one in the line currency', () => {
  it('USD lines worth more than what is left on the USD advance are refused, however much IQD advance there is', async () => {
    expect(await outstanding(advUsd)).toBe(300)
    expect(await outstanding(advIqd)).toBeGreaterThan(9_000_000)
    const res = await settle(advUsd, [L['BIGUSD.usd']!]) // 500 USD against 300 USD outstanding
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('OVER_SETTLEMENT')
    expect(await claimed([L['BIGUSD.usd']!])).toBe(0)
  })
})
