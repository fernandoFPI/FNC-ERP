// Stock Balances page (playbook #67). The snapshot used to label every row IQD and add all rows into one total
// labelled IQD, although a location's last cost carries its own currency (stock_balances.last_cost_currency) and
// this system never converts between currencies. Now every row carries its own currency_code and the totals are one
// figure per currency, added in SQL. Runs the real ApolloServer({ typeDefs, resolvers }) with the selection set the
// web sends (the same GraphQL-layer pattern as po-mixed-currency-graphql.test.ts, because calling the resolver
// function directly would skip the schema). Real Postgres; fixtures are real stock moves, so the real trigger
// (migration 283) produces the balance rows with the currency each move carried.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'SNAPCCY-TEST-'
const TEST_USER_EMAIL = 'snapccy-test@fnc-erp.local'

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

interface World {
  id: string
  wh: string
  site: string
  vin: string
  vout: string
}

let userId: string
let main: World
let other: World
let usdOnly: World
let empty: World

// The selection set StockBalancesPage sends (graphql/inventory.ts STOCK_SNAPSHOT_QUERY), plus the two fields kept for
// a tab still open on the previous release.
const SNAPSHOT = `
  query StockSnapshot {
    stockBalanceSnapshot {
      totalValue
      currency
      totals { currency_code total_value row_count }
      rows {
        product_id sku product_name category location_id location_name location_type
        qty_on_hand qty_reserved available average_cost total_value currency_code is_low_stock
      }
    }
  }`

interface Snapshot {
  totalValue: string
  currency: string
  totals: { currency_code: string; total_value: string; row_count: number }[]
  rows: {
    sku: string
    location_name: string
    qty_on_hand: string
    average_cost: string
    total_value: string
    currency_code: string | null
  }[]
}

async function snapshotFor(w: World): Promise<Snapshot> {
  const ctx: TestCtx = {
    auth: { companyId: w.id, userId, role: 'system_admin', module: 'all', sessionId: 'snapccy-test' },
  }
  const res = await server.executeOperation({ query: SNAPSHOT }, { contextValue: ctx })
  if (res.body.kind !== 'single') throw new Error('unexpected incremental GraphQL response')
  const out = res.body.singleResult as {
    data?: { stockBalanceSnapshot: Snapshot } | null
    errors?: readonly { message: string }[]
  }
  if (out.errors?.length) throw new Error(out.errors.map((e) => e.message).join('; '))
  return out.data!.stockBalanceSnapshot
}

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
    site: await loc('Site Store', 'site'),
    vin: await loc('Virtual Receipts', 'virtual_in'),
    vout: await loc('Virtual Consumption', 'virtual_out'),
  }
}

async function makeProduct(w: World, sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [w.id, sku],
  )
  return r.rows[0]!.id
}

// Stock arrives with the currency the move carries, which the trigger copies onto the balance.
async function receive(w: World, productId: string, locationId: string, qty: number, cost: number, currency: string) {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, currency_code, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,'opening_balance',$9)`,
    [w.id, productId, w.vin, locationId, qty, cost, qty * cost, currency, userId],
  )
}

async function emptyOut(w: World, productId: string, locationId: string, qty: number) {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, currency_code, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,0,0,'IQD','adjustment',$6)`,
    [w.id, productId, locationId, w.vout, qty, userId],
  )
}

async function cleanup(): Promise<void> {
  const cos = `SELECT id FROM companies WHERE name LIKE '${NAME_PREFIX}%'`
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id IN (${cos}) OR product_id IN (SELECT id FROM products WHERE company_id IN (${cos}))`,
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id IN (${cos}))
        OR location_id IN (SELECT id FROM stock_locations WHERE company_id IN (${cos}))`,
  )
  await pool.query(`DELETE FROM products WHERE company_id IN (${cos})`)
  await pool.query(`DELETE FROM stock_locations WHERE company_id IN (${cos})`)
  await pool.query(`DELETE FROM companies WHERE name LIKE '${NAME_PREFIX}%'`)
}

beforeAll(async () => {
  await cleanup()
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = u.rows[0]!.id
  main = await makeCompany('main')
  other = await makeCompany('other')
  usdOnly = await makeCompany('usdonly')
  empty = await makeCompany('empty')

  // The company under test: USD stock, IQD stock, a USD row at a second location, an emptied row.
  const steel = await makeProduct(main, 'STEEL-018')
  await receive(main, steel, main.wh, 5, 35, 'USD') // 175 USD
  const duct = await makeProduct(main, 'DUCT-001')
  await receive(main, duct, main.wh, 2, 10, 'USD') // 20 USD
  await receive(main, duct, main.site, 3, 10, 'USD') // 30 USD, a second location of the same product
  const paper = await makeProduct(main, 'PAPER-001')
  await receive(main, paper, main.wh, 10, 5000, 'IQD') // 50,000 IQD
  const gone = await makeProduct(main, 'GONE-001')
  await receive(main, gone, main.wh, 4, 7, 'USD')
  await emptyOut(main, gone, main.wh, 4) // holds nothing now

  // Another company's stock must never show up in the company under test.
  const foreign = await makeProduct(other, 'OTHER-001')
  await receive(other, foreign, other.wh, 100, 1000, 'IQD')

  // A company holding USD stock only, and one holding nothing at all.
  const u1 = await makeProduct(usdOnly, 'USDONLY-001')
  await receive(usdOnly, u1, usdOnly.wh, 8, 12.5, 'USD') // 100 USD
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('stockBalanceSnapshot: every row carries its own currency', () => {
  it('labels each row with the currency of its own last cost, amounts untouched', async () => {
    const s = await snapshotFor(main)
    const bySku = Object.fromEntries(s.rows.map((r) => [`${r.sku}@${r.location_name}`, r]))
    expect(bySku['STEEL-018@Main Warehouse']).toMatchObject({ currency_code: 'USD' })
    expect(parseFloat(bySku['STEEL-018@Main Warehouse']!.average_cost)).toBe(35)
    expect(parseFloat(bySku['STEEL-018@Main Warehouse']!.total_value)).toBe(175)
    expect(bySku['PAPER-001@Main Warehouse']).toMatchObject({ currency_code: 'IQD' })
    expect(parseFloat(bySku['PAPER-001@Main Warehouse']!.total_value)).toBe(50000)
    // The same product at two locations: one row each.
    expect(bySku['DUCT-001@Main Warehouse']).toMatchObject({ currency_code: 'USD' })
    expect(bySku['DUCT-001@Site Store']).toMatchObject({ currency_code: 'USD' })
  })

  it('follows a location that was relabelled, since the label lives on the balance row', async () => {
    const paper = await pool.query<{ id: string }>(`SELECT id FROM products WHERE sku='PAPER-001' AND company_id=$1`, [main.id])
    await pool.query(`UPDATE stock_balances SET last_cost_currency='USD' WHERE product_id=$1 AND location_id=$2`, [paper.rows[0]!.id, main.wh])
    try {
      const s = await snapshotFor(main)
      expect(s.rows.find((r) => r.sku === 'PAPER-001')!.currency_code).toBe('USD')
    } finally {
      await pool.query(`UPDATE stock_balances SET last_cost_currency='IQD' WHERE product_id=$1 AND location_id=$2`, [paper.rows[0]!.id, main.wh])
    }
  })

  it('holds back what the snapshot has always held back: empty rows, virtual locations, other companies', async () => {
    const s = await snapshotFor(main)
    expect(s.rows.map((r) => r.sku).sort()).toEqual(['DUCT-001', 'DUCT-001', 'PAPER-001', 'STEEL-018'])
    expect(s.rows.some((r) => r.sku === 'GONE-001')).toBe(false)
    expect(s.rows.some((r) => r.sku === 'OTHER-001')).toBe(false)
    expect(s.rows.some((r) => r.location_name.startsWith('Virtual'))).toBe(false)
  })
})

describe('stockBalanceSnapshot: totals are one figure per currency', () => {
  it('adds each currency on its own and never across currencies', async () => {
    const s = await snapshotFor(main)
    expect(s.totals.map((t) => t.currency_code)).toEqual(['IQD', 'USD']) // stable order
    const iqd = s.totals.find((t) => t.currency_code === 'IQD')!
    const usd = s.totals.find((t) => t.currency_code === 'USD')!
    expect(parseFloat(iqd.total_value)).toBe(50000)
    expect(iqd.row_count).toBe(1)
    expect(parseFloat(usd.total_value)).toBe(175 + 20 + 30)
    expect(usd.row_count).toBe(3)
    // The old behaviour: 50,000 IQD and 225 USD added into one number.
    expect(s.totals.some((t) => parseFloat(t.total_value) === 50225)).toBe(false)
  })

  it('a company holding one currency gets one total', async () => {
    const s = await snapshotFor(usdOnly)
    expect(s.totals).toHaveLength(1)
    expect(s.totals[0]).toMatchObject({ currency_code: 'USD', row_count: 1 })
    expect(parseFloat(s.totals[0]!.total_value)).toBe(100)
  })

  it('a company with no stock gets no totals and no rows', async () => {
    const s = await snapshotFor(empty)
    expect(s.totals).toEqual([])
    expect(s.rows).toEqual([])
  })

  it("only counts the caller's own company", async () => {
    const s = await snapshotFor(other)
    expect(s.totals).toHaveLength(1)
    expect(parseFloat(s.totals[0]!.total_value)).toBe(100 * 1000)
  })
})

describe('stockBalanceSnapshot: the fields kept for a tab still open on the previous release', () => {
  it('totalValue is the IQD rows alone, labelled IQD, not every currency added up', async () => {
    const s = await snapshotFor(main)
    expect(s.currency).toBe('IQD')
    expect(parseFloat(s.totalValue)).toBe(50000)
  })

  it('totalValue is 0 when the company holds no IQD stock', async () => {
    const s = await snapshotFor(usdOnly)
    expect(s.currency).toBe('IQD')
    expect(parseFloat(s.totalValue)).toBe(0)
  })
})
