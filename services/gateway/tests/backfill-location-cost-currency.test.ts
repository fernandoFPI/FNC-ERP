// The one-off backfill for the currency label on a stock location's last cost
// (scripts/backfill-location-cost-currency.ts, playbook #67). Real Postgres, nothing mocked, in two isolated
// companies of its own. Every fixture is built with real stock moves, so the real trigger (migration 283) produces
// the balance rows, with the label the move carried: an import / opening balance tags 'IQD' whatever the product's
// currency is, which is exactly the state production is in.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { pool } from '@fnc-erp/db'
import {
  AUDIT_ACTION,
  MOVE_NOTE,
  applyLocationCurrency,
  backfillLocationCostCurrency,
  planLocationCurrency,
} from '../src/scripts/backfill-location-cost-currency.js'

const NAME_PREFIX = 'LCCBF-TEST-'
const ADMIN_EMAIL = 'lccbf-test-admin@fnc-erp.local'

interface World {
  id: string
  wh: string
  wh2: string
  vin: string
  vout: string
}

let adminId: string
let A: World
let B: World
// product ids by sku, for assertions
const P: Record<string, string> = {}
const OPENED_AT = '2026-01-15T10:00:00.000Z'
const EMPTIED_AT = '2026-02-01T10:00:00.000Z'

async function makeCompany(label: string): Promise<World> {
  const co = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${label}-${Date.now()}`],
  )
  const id = co.rows[0]!.id
  const loc = async (name: string, type: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
        [id, name, type],
      )
    ).rows[0]!.id
  return {
    id,
    wh: await loc('Main Warehouse', 'warehouse'),
    wh2: await loc('Second Warehouse', 'warehouse'),
    vin: await loc('Virtual Receipts', 'virtual_in'),
    vout: await loc('Virtual Consumption', 'virtual_out'),
  }
}

async function makeProduct(
  companyId: string,
  sku: string,
  cost: number,
  currency: string | null,
): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category, standard_cost, cost_currency)
     VALUES ($1,$2,$2,'unit','general',$3,$4) RETURNING id`,
    [companyId, sku, cost, currency],
  )
  return r.rows[0]!.id
}

// Stock arrives at a location with the label the move carries (the trigger copies it onto the balance).
async function receive(
  w: World,
  productId: string,
  locationId: string,
  qty: number,
  cost: number,
  currency: string,
  lotId: string | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, lot_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, currency_code, source_type, moved_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'opening_balance',$11)`,
    [w.id, productId, lotId, w.vin, locationId, OPENED_AT, qty, cost, qty * cost, currency, adminId],
  )
}

async function emptyOut(w: World, productId: string, locationId: string, qty: number): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, currency_code, source_type, moved_by)
     VALUES ($1,$2,$3,$4,$5,$6,0,0,'IQD','adjustment',$7)`,
    [w.id, productId, locationId, w.vout, EMPTIED_AT, qty, adminId],
  )
}

interface Bal {
  qty: string
  reserved: string
  cost: string
  label: string
  lastMove: string | null
}

async function bal(productId: string, locationId: string, lotId: string | null = null): Promise<Bal> {
  const r = await pool.query<{
    qty: string
    reserved: string
    cost: string
    label: string
    last_move: string | null
  }>(
    `SELECT qty_on_hand::text AS qty, qty_reserved::text AS reserved, average_cost::text AS cost,
            btrim(last_cost_currency) AS label, last_move_at::text AS last_move
       FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NOT DISTINCT FROM $3`,
    [productId, locationId, lotId],
  )
  if (!r.rows[0]) throw new Error('no balance row')
  return {
    qty: r.rows[0].qty,
    reserved: r.rows[0].reserved,
    cost: r.rows[0].cost,
    label: r.rows[0].label,
    lastMove: r.rows[0].last_move,
  }
}

// Every balance row of both test companies' products and locations, to prove what did NOT change.
async function snapshot(): Promise<string> {
  const r = await pool.query(
    `SELECT p.sku, sl.name AS location, sb.lot_id IS NOT NULL AS lotted, sb.qty_on_hand::text AS qty,
            sb.average_cost::text AS cost, btrim(sb.last_cost_currency) AS label, sb.last_move_at::text AS last_move
       FROM stock_balances sb JOIN products p ON p.id = sb.product_id JOIN stock_locations sl ON sl.id = sb.location_id
      WHERE sl.company_id IN (SELECT id FROM companies WHERE name LIKE $1)
      ORDER BY p.sku, sl.name, lotted, sb.id`,
    [`${NAME_PREFIX}%`],
  )
  return JSON.stringify(r.rows)
}

async function counts(): Promise<{ moves: number; audit: number }> {
  const m = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM stock_moves WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1)`,
    [`${NAME_PREFIX}%`],
  )
  const a = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_log WHERE action = $1 AND company_id IN (SELECT id FROM companies WHERE name LIKE $2)`,
    [AUDIT_ACTION, `${NAME_PREFIX}%`],
  )
  return { moves: parseInt(m.rows[0]!.n, 10), audit: parseInt(a.rows[0]!.n, 10) }
}

async function cleanup(): Promise<void> {
  const cos = `SELECT id FROM companies WHERE name LIKE '${NAME_PREFIX}%'`
  await pool.query(`DELETE FROM audit_log WHERE company_id IN (${cos})`)
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id IN (${cos}) OR product_id IN (SELECT id FROM products WHERE company_id IN (${cos}))`,
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id IN (${cos}))
        OR location_id IN (SELECT id FROM stock_locations WHERE company_id IN (${cos}))`,
  )
  await pool.query(`DELETE FROM stock_lots WHERE product_id IN (SELECT id FROM products WHERE company_id IN (${cos}))`)
  await pool.query(`DELETE FROM products WHERE company_id IN (${cos})`)
  await pool.query(`DELETE FROM stock_locations WHERE company_id IN (${cos})`)
  await pool.query(`DELETE FROM companies WHERE name LIKE '${NAME_PREFIX}%'`)
}

// The world: one row of every kind the script has to treat differently.
async function seedWorld(): Promise<void> {
  await cleanup()
  A = await makeCompany('A')
  B = await makeCompany('B')

  // --- to relabel: location IQD, product USD, same amount ---
  P.steel = await makeProduct(A.id, 'STEEL-A', 35, 'USD')
  await receive(A, P.steel, A.wh, 5, 35, 'IQD')
  // Part of it is reserved for a Store Out (58 of the production rows are): a correction must not touch that.
  await pool.query(`UPDATE stock_balances SET qty_reserved = 2 WHERE product_id=$1 AND location_id=$2`, [P.steel, A.wh])
  P.emptied = await makeProduct(A.id, 'EMPTY-A', 35, 'USD')
  await receive(A, P.emptied, A.wh, 5, 35, 'IQD')
  await emptyOut(A, P.emptied, A.wh, 5) // the row stays, holding 0
  P.two = await makeProduct(A.id, 'TWO-LOC', 7, 'USD')
  await receive(A, P.two, A.wh, 2, 7, 'IQD')
  await receive(A, P.two, A.wh2, 3, 7, 'IQD')
  P.lotted = await makeProduct(A.id, 'LOTTED', 5, 'USD')
  const lot = await pool.query<{ id: string }>(
    `INSERT INTO stock_lots (product_id, lot_number) VALUES ($1,'L-1') RETURNING id`,
    [P.lotted],
  )
  P.lotId = lot.rows[0]!.id
  await receive(A, P.lotted, A.wh, 4, 5, 'IQD', P.lotId)

  // --- left alone ---
  P.iqdProduct = await makeProduct(A.id, 'GENUINE-IQD', 11, 'IQD') // a genuinely IQD product
  await receive(A, P.iqdProduct, A.wh, 3, 11, 'IQD')
  P.noCcy = await makeProduct(A.id, 'NO-CCY', 12, null) // nothing to follow
  await receive(A, P.noCcy, A.wh, 2, 12, 'IQD')
  P.alreadyUsd = await makeProduct(A.id, 'ALREADY-USD', 9, 'USD')
  await receive(A, P.alreadyUsd, A.wh, 4, 9, 'USD')
  P.usdUnderIqd = await makeProduct(A.id, 'USD-UNDER-IQD', 8, 'IQD') // location USD, product IQD
  await receive(A, P.usdUnderIqd, A.wh, 1, 8, 'USD')
  P.zeroCost = await makeProduct(A.id, 'ZERO-COST', 0, 'USD') // product has no cost at all
  await receive(A, P.zeroCost, A.wh, 3, 0, 'IQD')
  P.foreign = await makeProduct(B.id, 'FOREIGN-B', 20, 'USD') // company B's product held in A's location
  await receive(A, P.foreign, A.wh, 2, 20, 'IQD')

  // --- needs a person's review: same labels, DIFFERENT amount ---
  P.diff = await makeProduct(A.id, 'DIFF-AMOUNT', 0.5, 'USD')
  await receive(A, P.diff, A.wh, 520, 20098, 'IQD')
  P.near = await makeProduct(A.id, 'NEAR-AMOUNT', 0.24, 'USD')
  await receive(A, P.near, A.wh, 6000, 0.2405, 'IQD')

  // --- another company ---
  P.steelB = await makeProduct(B.id, 'STEEL-B', 35, 'USD')
  await receive(B, P.steelB, B.wh, 5, 35, 'IQD')
}

beforeAll(async () => {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [ADMIN_EMAIL],
  )
  adminId = r.rows[0]!.id
})

beforeEach(async () => {
  await seedWorld()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM audit_log WHERE user_id = $1`, [adminId])
  await pool.query(`DELETE FROM users WHERE email = $1`, [ADMIN_EMAIL])
  await pool.end()
})

const skus = (rows: { sku: string }[]) => rows.map((r) => r.sku).sort()

describe('backfill-location-cost-currency: what the plan covers', () => {
  it('lists exactly the rows to relabel and the rows for review, and counts everything else', async () => {
    const plan = await planLocationCurrency(pool, A.id)

    // Product USD, location IQD, same amount: five balance rows (TWO-LOC has two, LOTTED is lot-tracked).
    expect(skus(plan.relabel)).toEqual(['EMPTY-A', 'LOTTED', 'STEEL-A', 'TWO-LOC', 'TWO-LOC'])
    // Same labels, different amount: a person decides.
    expect(skus(plan.review)).toEqual(['DIFF-AMOUNT', 'NEAR-AMOUNT'])
    expect(plan.leftAlone).toEqual({
      alreadyMatches: 2, // GENUINE-IQD, ALREADY-USD
      productCurrencyNotSet: 1, // NO-CCY
      otherCompanyProduct: 1, // FOREIGN-B
      otherMismatch: 2, // USD-UNDER-IQD, ZERO-COST
    })
    expect(plan.totals).toEqual([
      expect.objectContaining({ rows: 5, withStock: 4, empty: 1 }),
    ])
    // 5 x 35 + 2 x 7 + 3 x 7 + 4 x 5, in the products' own number.
    expect(plan.totals[0]!.value).toBe(String(175 + 14 + 21 + 20))
  })

  it('shows the review rows with both numbers, so a person can judge them', async () => {
    const plan = await planLocationCurrency(pool, A.id)
    const diff = plan.review.find((r) => r.sku === 'DIFF-AMOUNT')!
    expect(parseFloat(diff.average_cost)).toBe(20098)
    expect(parseFloat(diff.product_cost)).toBe(0.5)
    expect(parseFloat(diff.qty_on_hand)).toBe(520)
  })

  it('a dry run writes nothing', async () => {
    const before = { snap: await snapshot(), c: await counts() }
    const report = await backfillLocationCostCurrency({ apply: false, company: A.id })
    expect(report.applied).toBe(false)
    expect(report.plan.relabel).toHaveLength(5)
    expect(await snapshot()).toBe(before.snap)
    expect(await counts()).toEqual(before.c)
  })

  it('only the named company is planned', async () => {
    const plan = await planLocationCurrency(pool, B.id)
    expect(skus(plan.relabel)).toEqual(['STEEL-B'])
    const byName = await planLocationCurrency(pool, (await pool.query<{ name: string }>(`SELECT name FROM companies WHERE id=$1`, [B.id])).rows[0]!.name.toUpperCase())
    expect(skus(byName.relabel)).toEqual(['STEEL-B'])
  })
})

describe('backfill-location-cost-currency: applying it', () => {
  it('relabels to USD and changes neither the quantity, the amount nor the last movement', async () => {
    const before = {
      steel: await bal(P.steel!, A.wh),
      emptied: await bal(P.emptied!, A.wh),
      twoWh: await bal(P.two!, A.wh),
      twoWh2: await bal(P.two!, A.wh2),
      lotted: await bal(P.lotted!, A.wh, P.lotId!),
    }
    expect(before.emptied.qty).toBe('0.0000')
    expect(before.steel.reserved).toBe('2.0000')

    const report = await backfillLocationCostCurrency({
      apply: true,
      actorEmail: ADMIN_EMAIL,
      company: A.id,
    })
    expect(report.applied).toBe(true)

    const after = {
      steel: await bal(P.steel!, A.wh),
      emptied: await bal(P.emptied!, A.wh),
      twoWh: await bal(P.two!, A.wh),
      twoWh2: await bal(P.two!, A.wh2),
      lotted: await bal(P.lotted!, A.wh, P.lotId!),
    }
    for (const k of Object.keys(before) as (keyof typeof before)[]) {
      expect(after[k].label, k).toBe('USD')
      expect(after[k].qty, k).toBe(before[k].qty)
      expect(after[k].reserved, k).toBe(before[k].reserved)
      expect(after[k].cost, k).toBe(before[k].cost)
      expect(after[k].lastMove, k).toBe(before[k].lastMove)
    }
  })

  it('writes a correcting ledger move for a location that holds stock, and none for an empty one', async () => {
    await backfillLocationCostCurrency({ apply: true, actorEmail: ADMIN_EMAIL, company: A.id })

    const moves = await pool.query<{
      sku: string
      location: string
      lot_id: string | null
      qty: string
      unit_cost: string
      total_cost: string
      currency_code: string
      notes: string
      moved_by: string
      from_location_id: string
      to_location_id: string
    }>(
      `SELECT p.sku, sl.name AS location, sm.lot_id, sm.qty::text, sm.unit_cost::text, sm.total_cost::text,
              btrim(sm.currency_code) AS currency_code, sm.notes, sm.moved_by, sm.from_location_id, sm.to_location_id
         FROM stock_moves sm JOIN products p ON p.id = sm.product_id JOIN stock_locations sl ON sl.id = sm.to_location_id
        WHERE sm.source_type = 'cost_correction' AND sm.company_id = $1 ORDER BY p.sku, sl.name`,
      [A.id],
    )
    // STEEL-A, TWO-LOC at both warehouses, LOTTED: the four rows that hold stock. EMPTY-A has no move.
    expect(moves.rows.map((m) => `${m.sku}@${m.location}`)).toEqual([
      'LOTTED@Main Warehouse',
      'STEEL-A@Main Warehouse',
      'TWO-LOC@Main Warehouse',
      'TWO-LOC@Second Warehouse',
    ])
    const steel = moves.rows.find((m) => m.sku === 'STEEL-A')!
    expect(steel.from_location_id).toBe(steel.to_location_id) // a correction, not a movement
    expect(parseFloat(steel.qty)).toBe(5)
    expect(parseFloat(steel.unit_cost)).toBe(35)
    expect(parseFloat(steel.total_cost)).toBe(175)
    expect(steel.currency_code).toBe('USD')
    expect(steel.notes).toBe(MOVE_NOTE)
    expect(steel.moved_by).toBe(adminId)
    expect(moves.rows.find((m) => m.sku === 'LOTTED')!.lot_id).toBe(P.lotId)
  })

  it('records the old and new label of every row in audit_log, so it can be reversed from there', async () => {
    await backfillLocationCostCurrency({ apply: true, actorEmail: ADMIN_EMAIL, company: A.id })
    const rows = await pool.query<{ record_id: string; old_values: Record<string, string>; new_values: Record<string, string>; user_id: string }>(
      `SELECT record_id, old_values, new_values, user_id FROM audit_log WHERE action = $1 AND company_id = $2`,
      [AUDIT_ACTION, A.id],
    )
    expect(rows.rows).toHaveLength(5)
    expect(rows.rows.every((r) => r.user_id === adminId)).toBe(true)
    const steelBal = await pool.query<{ id: string }>(
      `SELECT id FROM stock_balances WHERE product_id=$1 AND location_id=$2`,
      [P.steel, A.wh],
    )
    const steelAudit = rows.rows.find((r) => r.record_id === steelBal.rows[0]!.id)!
    expect(steelAudit.old_values.last_cost_currency).toBe('IQD')
    expect(steelAudit.new_values.last_cost_currency).toBe('USD')
    expect(steelAudit.new_values.via).toBe('cost_correction_move')
    const emptiedBal = await pool.query<{ id: string }>(
      `SELECT id FROM stock_balances WHERE product_id=$1 AND location_id=$2`,
      [P.emptied, A.wh],
    )
    expect(rows.rows.find((r) => r.record_id === emptiedBal.rows[0]!.id)!.new_values.via).toBe('direct_relabel')
  })

  it('leaves every other row exactly as it was', async () => {
    const untouched = async () =>
      JSON.stringify(
        await Promise.all([
          bal(P.iqdProduct!, A.wh),
          bal(P.noCcy!, A.wh),
          bal(P.alreadyUsd!, A.wh),
          bal(P.usdUnderIqd!, A.wh),
          bal(P.zeroCost!, A.wh),
          bal(P.foreign!, A.wh),
          bal(P.diff!, A.wh),
          bal(P.near!, A.wh),
          bal(P.steel!, A.vin), // the virtual receipts side of a relabelled product
          bal(P.steelB!, B.wh), // another company
        ]),
      )
    const before = await untouched()
    await backfillLocationCostCurrency({ apply: true, actorEmail: ADMIN_EMAIL, company: A.id })
    expect(await untouched()).toBe(before)
    // And in words, for the three that matter most:
    expect((await bal(P.iqdProduct!, A.wh)).label).toBe('IQD') // a genuinely IQD product
    expect((await bal(P.diff!, A.wh)).label).toBe('IQD') // different amount: for a person
    expect((await bal(P.steelB!, B.wh)).label).toBe('IQD') // not the company that was named
  })

  it('is safe to run twice: the second run finds nothing and writes nothing', async () => {
    await backfillLocationCostCurrency({ apply: true, actorEmail: ADMIN_EMAIL, company: A.id })
    const after = { snap: await snapshot(), c: await counts() }
    const again = await backfillLocationCostCurrency({ apply: true, actorEmail: ADMIN_EMAIL, company: A.id })
    expect(again.plan.relabel).toHaveLength(0)
    expect(await snapshot()).toBe(after.snap)
    expect(await counts()).toEqual(after.c)
  })

  it('the review rows are still there afterwards, unchanged', async () => {
    await backfillLocationCostCurrency({ apply: true, actorEmail: ADMIN_EMAIL, company: A.id })
    const plan = await planLocationCurrency(pool, A.id)
    expect(skus(plan.review)).toEqual(['DIFF-AMOUNT', 'NEAR-AMOUNT'])
  })

  it('refuses --apply without an administrator, or with one that does not exist', async () => {
    await expect(backfillLocationCostCurrency({ apply: true, company: A.id })).rejects.toThrow(/--actor-email/)
    await expect(
      backfillLocationCostCurrency({ apply: true, actorEmail: 'nobody@fnc-erp.local', company: A.id }),
    ).rejects.toThrow(/No user with the email/)
    expect((await bal(P.steel!, A.wh)).label).toBe('IQD')
  })

  it('writes nothing at all if a row changed after the plan was made', async () => {
    const stale = await planLocationCurrency(pool, A.id)
    // A real receipt lands on STEEL-A between planning and applying.
    await receive(A, P.steel!, A.wh, 1, 35, 'IQD')
    const before = { snap: await snapshot(), c: await counts() }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await expect(applyLocationCurrency(client, stale, adminId)).rejects.toThrow(/changed since the plan/)
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
    // The rows handled before the stale one were rolled back with it.
    expect((await bal(P.emptied!, A.wh)).label).toBe('IQD')
    expect(await snapshot()).toBe(before.snap)
    expect(await counts()).toEqual(before.c)
  })
})
