// The one-off script that folds a company's leftover stock into the central warehouse company
// (playbook #48). Real Postgres, throwaway companies per test so one test's leftovers can never be
// picked up by another (the script moves EVERY real stock row a company holds).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import {
  consolidateStockIntoCentral,
  CONSOLIDATION_SOURCE_TYPE,
} from '../src/scripts/consolidate-stock-into-central.js'

const COMPANY_PREFIX = 'CONSOLTEST-Company-'
const SKU_PREFIX = 'CONSOLTEST-'
const EMAIL_PREFIX = 'consol-test-'
const FACTORY_TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'

let sysAdminEmail: string
let adminBothEmail: string
let adminOneEmail: string
let plainEmail: string
const userId: Record<string, string> = {}

interface Scenario {
  srcId: string
  srcName: string
  dstId: string
  dstName: string
  srcWh: string
  srcVin: string
  dstWh: string
  dstVin: string
}

let seq = 0
async function scenario(): Promise<Scenario> {
  seq += 1
  const make = async (label: string) => {
    const name = `${COMPANY_PREFIX}${label}-${Date.now()}-${seq}`
    const c = await pool.query<{ id: string }>(
      `INSERT INTO companies (name, legal_name, currency_code) VALUES ($1,$1,'IQD') RETURNING id`,
      [name],
    )
    const id = c.rows[0]!.id
    const loc = async (nm: string, type: string) =>
      (
        await pool.query<{ id: string }>(
          `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
          [id, nm, type],
        )
      ).rows[0]!.id
    return {
      id,
      name,
      wh: await loc('Main Warehouse', 'warehouse'),
      vin: await loc('Virtual Receipts', 'virtual_in'),
    }
  }
  const src = await make('src')
  const dst = await make('dst')
  return {
    srcId: src.id,
    srcName: src.name,
    dstId: dst.id,
    dstName: dst.name,
    srcWh: src.wh,
    srcVin: src.vin,
    dstWh: dst.wh,
    dstVin: dst.vin,
  }
}

async function makeProduct(companyId: string, sku?: string): Promise<string> {
  const code = sku ?? `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category, standard_cost, cost_currency)
     VALUES ($1,$2,$3,'unit','general',7,'USD') RETURNING id`,
    [companyId, code, `Item ${code}`],
  )
  return r.rows[0]!.id
}

async function receive(
  companyId: string,
  productId: string,
  fromVin: string,
  toLocation: string,
  qty: number,
  unitCost: number,
  currency = 'USD',
): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, currency_code, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,'po_receipt',$9)`,
    [companyId, productId, fromVin, toLocation, qty, unitCost, qty * unitCost, currency, userId.sysadmin],
  )
}

async function balance(
  productId: string,
  locationId: string,
): Promise<{ qty: number; reserved: number; cost: number }> {
  const r = await pool.query<{ qty_on_hand: string; qty_reserved: string; average_cost: string }>(
    `SELECT qty_on_hand, qty_reserved, average_cost FROM stock_balances
      WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  const row = r.rows[0]
  return {
    qty: parseFloat(row?.qty_on_hand ?? '0'),
    reserved: parseFloat(row?.qty_reserved ?? '0'),
    cost: parseFloat(row?.average_cost ?? '0'),
  }
}

const consolidationMoves = async (companyIds: string[]) =>
  (
    await pool.query<{
      company_id: string
      product_id: string
      qty: string
      unit_cost: string
      total_cost: string
      currency_code: string
      source_id: string
      notes: string
      moved_by: string
    }>(
      `SELECT company_id, product_id, qty, unit_cost, total_cost, currency_code, source_id, notes, moved_by
         FROM stock_moves WHERE source_type=$1 AND company_id = ANY($2::uuid[]) ORDER BY moved_at, id`,
      [CONSOLIDATION_SOURCE_TYPE, companyIds],
    )
  ).rows

async function cleanup(): Promise<void> {
  const companies = `SELECT id FROM companies WHERE name LIKE $1`
  const products = `SELECT id FROM products WHERE sku LIKE $1 OR company_id IN (${companies.replace('$1', '$2')})`
  const args = [`${SKU_PREFIX}%`, `${COMPANY_PREFIX}%`]
  await pool.query(
    `DELETE FROM audit_log WHERE action='consolidate_stock_into_central' AND company_id IN (${companies})`,
    [`${COMPANY_PREFIX}%`],
  )
  await pool.query(`DELETE FROM stock_moves WHERE product_id IN (${products})`, args)
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (${products})`, args)
  await pool.query(`DELETE FROM stock_lots WHERE product_id IN (${products})`, args)
  await pool.query(`DELETE FROM products WHERE id IN (${products})`, args)
  await pool.query(`DELETE FROM stock_locations WHERE company_id IN (${companies})`, [`${COMPANY_PREFIX}%`])
  await pool.query(
    `DELETE FROM user_company_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`${EMAIL_PREFIX}%`],
  )
  await pool.query(`DELETE FROM companies WHERE name LIKE $1`, [`${COMPANY_PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  const mk = async (key: string): Promise<string> => {
    const email = `${EMAIL_PREFIX}${key}@fnc-erp.local`
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [email],
    )
    userId[key] = r.rows[0]!.id
    return email
  }
  sysAdminEmail = await mk('sysadmin')
  adminBothEmail = await mk('adminboth')
  adminOneEmail = await mk('adminone')
  plainEmail = await mk('plain')
  // A system admin holds a role row in some company (any one is enough).
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all')
     ON CONFLICT DO NOTHING`,
    [userId.sysadmin, FACTORY_TEST_COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

describe('consolidateStockIntoCentral - dry run', () => {
  it('lists what it would move and writes nothing', async () => {
    const s = await scenario()
    const p = await makeProduct(s.dstId)
    await receive(s.srcId, p, s.srcVin, s.srcWh, 4, 2.25)

    const r = await consolidateStockIntoCentral({ company: s.srcName, toCompany: s.dstName, apply: false })

    expect(r.status).toBe('planned')
    expect(r.problems).toEqual([])
    expect(r.moves).toHaveLength(1)
    expect(parseFloat(r.moves[0]!.qty)).toBe(4)
    expect(parseFloat(r.moves[0]!.value)).toBe(9)
    expect(r.moves[0]!.currency).toBe('USD')
    expect((await balance(p, s.srcWh)).qty).toBe(4)
    expect((await balance(p, s.dstWh)).qty).toBe(0)
    expect(await consolidationMoves([s.srcId, s.dstId])).toHaveLength(0)
  })

  it('says there is nothing to do for a company that holds no stock (Al Watanyia today)', async () => {
    const s = await scenario()

    const r = await consolidateStockIntoCentral({ company: s.srcName, toCompany: s.dstName, apply: false })

    expect(r.status).toBe('nothing-to-do')
    expect(r.moves).toEqual([])
  })
})

describe('consolidateStockIntoCentral - apply', () => {
  it('moves every row: source goes to zero, destination gets it at the same cost, no charge anywhere', async () => {
    const s = await scenario()
    const a = await makeProduct(s.dstId)
    const b = await makeProduct(s.dstId)
    await receive(s.srcId, a, s.srcVin, s.srcWh, 12, 3)
    await receive(s.srcId, b, s.srcVin, s.srcWh, 4, 5.5)
    const costBefore = (await pool.query(`SELECT standard_cost FROM products WHERE id=$1`, [a])).rows[0].standard_cost

    const r = await consolidateStockIntoCentral({
      company: s.srcName,
      toCompany: s.dstName,
      apply: true,
      actorEmail: sysAdminEmail,
    })

    expect(r.status).toBe('moved')
    expect(r.runId).toBeTruthy()
    expect((await balance(a, s.srcWh)).qty).toBe(0)
    expect((await balance(b, s.srcWh)).qty).toBe(0)
    expect(await balance(a, s.dstWh)).toMatchObject({ qty: 12, cost: 3 })
    expect(await balance(b, s.dstWh)).toMatchObject({ qty: 4, cost: 5.5 })

    // Two ledger entries per row, one in each company, all carrying the one run id.
    const moves = await consolidationMoves([s.srcId, s.dstId])
    expect(moves).toHaveLength(4)
    expect(new Set(moves.map((m) => m.source_id))).toEqual(new Set([r.runId]))
    expect(moves.filter((m) => m.company_id === s.srcId)).toHaveLength(2)
    expect(moves.filter((m) => m.company_id === s.dstId)).toHaveLength(2)
    for (const m of moves) {
      expect(m.currency_code.trim()).toBe('USD')
      expect(m.moved_by).toBe(userId.sysadmin)
      expect(parseFloat(m.total_cost)).toBeCloseTo(parseFloat(m.qty) * parseFloat(m.unit_cost), 4)
    }
    expect(moves.some((m) => m.notes.includes(s.dstName) && m.notes.includes('no charge'))).toBe(true)
    expect(moves.some((m) => m.notes.includes(s.srcName) && m.notes.includes('no charge'))).toBe(true)
    // The notes name the companies, never their ids.
    expect(moves.every((m) => !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(m.notes))).toBe(true)

    // No inter-company sale: no transfer, no bill, and the item's own cost is untouched.
    const t = await pool.query(
      `SELECT 1 FROM interco_stock_transfers WHERE from_company_id=$1 OR to_company_id=$1 OR from_company_id=$2 OR to_company_id=$2`,
      [s.srcId, s.dstId],
    )
    const tx = await pool.query(
      `SELECT 1 FROM interco_transactions WHERE from_company_id=$1 OR to_company_id=$1 OR from_company_id=$2 OR to_company_id=$2`,
      [s.srcId, s.dstId],
    )
    expect(t.rows).toHaveLength(0)
    expect(tx.rows).toHaveLength(0)
    expect((await pool.query(`SELECT standard_cost FROM products WHERE id=$1`, [a])).rows[0].standard_cost).toBe(costBefore)
    expect((await pool.query(`SELECT 1 FROM product_cost_change_requests WHERE product_id IN ($1,$2)`, [a, b])).rows).toHaveLength(0)

    // The source company's Virtual Consumption exists now, and each company has an audit entry.
    const vout = await pool.query(`SELECT 1 FROM stock_locations WHERE company_id=$1 AND type='virtual_out'`, [s.srcId])
    expect(vout.rows).toHaveLength(1)
    const audit = await pool.query<{ company_id: string }>(
      `SELECT company_id FROM audit_log WHERE action='consolidate_stock_into_central' AND company_id = ANY($1::uuid[])`,
      [[s.srcId, s.dstId]],
    )
    expect(new Set(audit.rows.map((x) => x.company_id))).toEqual(new Set([s.srcId, s.dstId]))
  })

  // The system values stock at its LAST cost (an incoming move's cost replaces the location's cost), so a
  // re-assignment at the source's cost would silently re-price what the destination already holds.
  it('never re-prices stock the destination already holds: the incoming entry takes the destination cost', async () => {
    const s = await scenario()
    const p = await makeProduct(s.dstId)
    await receive(s.dstId, p, s.dstVin, s.dstWh, 6, 10)
    await receive(s.srcId, p, s.srcVin, s.srcWh, 4, 20)

    const r = await consolidateStockIntoCentral({
      company: s.srcName,
      toCompany: s.dstName,
      apply: true,
      actorEmail: sysAdminEmail,
    })

    const b = await balance(p, s.dstWh)
    expect(b.qty).toBe(10)
    expect(b.cost).toBe(10) // not 20
    expect(r.moves[0]!.destinationKeeps).toMatchObject({ currency: 'USD' })
    expect(parseFloat(r.moves[0]!.destinationKeeps!.unitCost)).toBe(10)
    // The source's own entry is still booked at the source's cost.
    const moves = await consolidationMoves([s.srcId, s.dstId])
    expect(parseFloat(moves.find((m) => m.company_id === s.srcId)!.unit_cost)).toBe(20)
    expect(parseFloat(moves.find((m) => m.company_id === s.dstId)!.unit_cost)).toBe(10)
  })

  it('keeps the destination currency too, with no conversion', async () => {
    const s = await scenario()
    const p = await makeProduct(s.dstId)
    await receive(s.dstId, p, s.dstVin, s.dstWh, 6, 10, 'IQD')
    await receive(s.srcId, p, s.srcVin, s.srcWh, 4, 20, 'USD')

    await consolidateStockIntoCentral({
      company: s.srcName,
      toCompany: s.dstName,
      apply: true,
      actorEmail: sysAdminEmail,
    })

    const moves = await consolidationMoves([s.srcId, s.dstId])
    expect(moves.find((m) => m.company_id === s.srcId)!.currency_code.trim()).toBe('USD')
    expect(moves.find((m) => m.company_id === s.dstId)!.currency_code.trim()).toBe('IQD')
    expect((await balance(p, s.dstWh)).cost).toBe(10)
  })

  it('leaves a destination that does not hold the item yet with the source cost', async () => {
    const s = await scenario()
    const p = await makeProduct(s.dstId)
    await receive(s.srcId, p, s.srcVin, s.srcWh, 4, 20)

    const r = await consolidateStockIntoCentral({
      company: s.srcName,
      toCompany: s.dstName,
      apply: true,
      actorEmail: sysAdminEmail,
    })

    expect(r.moves[0]!.destinationKeeps).toBeUndefined()
    expect(await balance(p, s.dstWh)).toMatchObject({ qty: 4, cost: 20 })
  })

  it('running it twice moves nothing the second time', async () => {
    const s = await scenario()
    const p = await makeProduct(s.dstId)
    await receive(s.srcId, p, s.srcVin, s.srcWh, 3, 2)
    const opts = { company: s.srcName, toCompany: s.dstName, apply: true, actorEmail: sysAdminEmail }

    await consolidateStockIntoCentral(opts)
    const again = await consolidateStockIntoCentral(opts)

    expect(again.status).toBe('nothing-to-do')
    expect(await consolidationMoves([s.srcId, s.dstId])).toHaveLength(2)
    expect((await balance(p, s.dstWh)).qty).toBe(3)
  })
})

describe('consolidateStockIntoCentral - refusals (all or nothing)', () => {
  it('refuses the whole company when one row is reserved for a document, and writes nothing', async () => {
    const s = await scenario()
    const ok = await makeProduct(s.dstId)
    const held = await makeProduct(s.dstId)
    await receive(s.srcId, ok, s.srcVin, s.srcWh, 5, 1)
    await receive(s.srcId, held, s.srcVin, s.srcWh, 5, 1)
    await pool.query(`UPDATE stock_balances SET qty_reserved=2 WHERE product_id=$1 AND location_id=$2`, [held, s.srcWh])

    const r = await consolidateStockIntoCentral({
      company: s.srcName,
      toCompany: s.dstName,
      apply: true,
      actorEmail: sysAdminEmail,
    })

    expect(r.status).toBe('refused')
    expect(r.problems.join(' ')).toMatch(/2\.0000 reserved for a document/)
    expect((await balance(ok, s.srcWh)).qty).toBe(5)
    expect((await balance(ok, s.dstWh)).qty).toBe(0)
    expect(await consolidationMoves([s.srcId, s.dstId])).toHaveLength(0)
  })

  it('refuses an item that is not in the destination catalog, even when the destination has the same SKU for another item', async () => {
    const s = await scenario()
    const sku = `${SKU_PREFIX}SAME-${Date.now()}`
    const mine = await makeProduct(s.srcId, sku)
    await makeProduct(s.dstId, sku) // same SKU, different item: must never be matched
    await receive(s.srcId, mine, s.srcVin, s.srcWh, 2, 1)

    const r = await consolidateStockIntoCentral({
      company: s.srcName,
      toCompany: s.dstName,
      apply: true,
      actorEmail: sysAdminEmail,
    })

    expect(r.status).toBe('refused')
    expect(r.problems.join(' ')).toMatch(/never matched by SKU/)
    expect((await balance(mine, s.srcWh)).qty).toBe(2)
    expect(await consolidationMoves([s.srcId, s.dstId])).toHaveLength(0)
  })

  it('refuses lot-tracked stock', async () => {
    const s = await scenario()
    const p = await makeProduct(s.dstId)
    const lot = await pool.query<{ id: string }>(
      `INSERT INTO stock_lots (product_id, lot_number) VALUES ($1,'L1') RETURNING id`,
      [p],
    )
    await pool.query(
      `INSERT INTO stock_moves (company_id, product_id, lot_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
       VALUES ($1,$2,$3,$4,$5,NOW(),3,1,3,'po_receipt',$6)`,
      [s.srcId, p, lot.rows[0]!.id, s.srcVin, s.srcWh, userId.sysadmin],
    )

    const r = await consolidateStockIntoCentral({ company: s.srcName, toCompany: s.dstName, apply: false })

    expect(r.status).toBe('refused')
    expect(r.problems.join(' ')).toMatch(/lot-tracked/)
  })

  it('refuses to consolidate a company into itself', async () => {
    const s = await scenario()
    await expect(
      consolidateStockIntoCentral({ company: s.srcName, toCompany: s.srcName, apply: false }),
    ).rejects.toThrow(/nothing to consolidate/)
  })

  it('will not guess the destination when more than one company is flagged central', async () => {
    const s = await scenario()
    await pool.query(`UPDATE companies SET is_central_warehouse=true WHERE id = ANY($1::uuid[])`, [
      [s.dstId, FACTORY_TEST_COMPANY_ID],
    ])
    try {
      await expect(consolidateStockIntoCentral({ company: s.srcName, apply: false })).rejects.toThrow(
        /companies are flagged as the central warehouse/,
      )
    } finally {
      await pool.query(`UPDATE companies SET is_central_warehouse=false WHERE id=$1`, [s.dstId])
    }
  })
})

describe('consolidateStockIntoCentral - who may apply', () => {
  const stocked = async () => {
    const s = await scenario()
    const p = await makeProduct(s.dstId)
    await receive(s.srcId, p, s.srcVin, s.srcWh, 2, 1)
    return { s, p }
  }

  it('needs an actor to apply', async () => {
    const { s } = await stocked()
    await expect(
      consolidateStockIntoCentral({ company: s.srcName, toCompany: s.dstName, apply: true }),
    ).rejects.toThrow(/--actor-email/)
  })

  it('refuses a user who is not an administrator, and moves nothing', async () => {
    const { s, p } = await stocked()
    await expect(
      consolidateStockIntoCentral({ company: s.srcName, toCompany: s.dstName, apply: true, actorEmail: plainEmail }),
    ).rejects.toThrow(/not a system administrator/)
    expect((await balance(p, s.srcWh)).qty).toBe(2)
  })

  it('refuses a company administrator of only one of the two companies', async () => {
    const { s } = await stocked()
    await pool.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'company_admin','all') ON CONFLICT DO NOTHING`,
      [userId.adminone, s.srcId],
    )
    await expect(
      consolidateStockIntoCentral({ company: s.srcName, toCompany: s.dstName, apply: true, actorEmail: adminOneEmail }),
    ).rejects.toThrow(/not a system administrator/)
  })

  it('accepts a company administrator of both companies', async () => {
    const { s, p } = await stocked()
    for (const companyId of [s.srcId, s.dstId]) {
      await pool.query(
        `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'company_admin','all') ON CONFLICT DO NOTHING`,
        [userId.adminboth, companyId],
      )
    }
    const r = await consolidateStockIntoCentral({
      company: s.srcName,
      toCompany: s.dstName,
      apply: true,
      actorEmail: adminBothEmail,
    })
    expect(r.status).toBe('moved')
    expect((await balance(p, s.dstWh)).qty).toBe(2)
  })
})
