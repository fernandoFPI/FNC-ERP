// The "Inventory cost" column on PO and requisition lines: the catalog product's own Cost
// (products.standard_cost / cost_currency), shown for reference. It is NOT the line's
// store_price (what the store keeper typed while pricing that line).
//
// Run through the real ApolloServer({ typeDefs, resolvers }) with the field names the web asks
// for, against real Postgres in a throwaway company: a field that is in the SQL but not in the
// schema (or the other way round) would pass a direct resolver call and fail here.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-INVCOST-TEST-'
const TEST_USER_EMAIL = 'g-inventory-cost-test@fnc-erp.local'
const OTHER_USER_EMAIL = 'g-inventory-cost-other@fnc-erp.local'

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

let companyId: string
let otherCompanyId: string
let userId: string
let otherUserId: string
let ctx: TestCtx
let otherCtx: TestCtx
let poId: string
let requisitionId: string
const productIds: Record<string, string> = {}

async function makeCompany(label: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  return r.rows[0]!.id
}

async function makeUser(email: string, company: string): Promise<string> {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [email],
  )
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
    [u.rows[0]!.id, company],
  )
  return u.rows[0]!.id
}

async function makeProduct(
  key: string,
  cost: number,
  currency: string | null,
): Promise<string> {
  const sku = `${NAME_PREFIX}${key}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category, standard_cost, cost_currency)
     VALUES ($1,$2,$2,'unit','general',$3,$4) RETURNING id`,
    [companyId, sku, cost, currency],
  )
  productIds[key] = r.rows[0]!.id
  return r.rows[0]!.id
}

// Each line gets a store_price (the store keeper's own figure) that differs from every product cost.
const LINES: { key: string; productKey: string | null; n: number }[] = [
  { key: 'withCost', productKey: 'usdCost', n: 1 },
  { key: 'noCost', productKey: 'zeroCost', n: 2 },
  { key: 'noCurrency', productKey: 'noCurrency', n: 3 },
  { key: 'custom', productKey: null, n: 4 },
]

async function addLines(owner: { poId?: string; requisitionId?: string }) {
  for (const l of LINES) {
    await pool.query(
      `INSERT INTO po_lines (po_id, requisition_id, line_number, description, product_id, qty_ordered, unit_price,
                             total_price, currency_code, store_price, store_price_currency)
       VALUES ($1,$2,$3,$4,$5,2,100,200,'IQD',99,'IQD')`,
      [
        owner.poId ?? null,
        owner.requisitionId ?? null,
        l.n,
        l.key,
        l.productKey ? productIds[l.productKey] : null,
      ],
    )
  }
}

async function run(
  context: TestCtx,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown> | null; errors?: readonly { message: string }[] }> {
  const res = await server.executeOperation({ query, variables }, { contextValue: context })
  if (res.body.kind !== 'single') throw new Error('unexpected incremental GraphQL response')
  return res.body.singleResult as {
    data?: Record<string, unknown> | null
    errors?: { message: string }[]
  }
}

interface LineOut {
  description: string
  inventory_cost: string | null
  inventory_cost_currency: string | null
  store_price: string | null
  total: string
}
const LINE_FIELDS = `description inventory_cost inventory_cost_currency store_price total`
const byName = (lines: LineOut[]) => Object.fromEntries(lines.map((l) => [l.description, l]))

const poLines = async (context = ctx): Promise<LineOut[] | null> => {
  const res = await run(context, `query ($id: ID!) { po: purchaseOrder(id: $id) { lines { ${LINE_FIELDS} } } }`, {
    id: poId,
  })
  expect(res.errors).toBeUndefined()
  return (res.data?.po as { lines: LineOut[] } | null)?.lines ?? null
}
const reqLines = async (context = ctx): Promise<LineOut[] | null> => {
  const res = await run(
    context,
    `query ($id: ID!) { req: requisition(id: $id) { lines { ${LINE_FIELDS} } } }`,
    { id: requisitionId },
  )
  expect(res.errors).toBeUndefined()
  return (res.data?.req as { lines: LineOut[] } | null)?.lines ?? null
}

async function cleanup(): Promise<void> {
  for (const c of [companyId, otherCompanyId]) {
    if (!c) continue
    await pool.query(
      `DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)
         OR requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1)`,
      [c],
    )
    await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM requisitions WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM products WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM companies WHERE id=$1`, [c])
  }
}

beforeAll(async () => {
  await server.start()
  companyId = await makeCompany('main')
  otherCompanyId = await makeCompany('other')
  userId = await makeUser(TEST_USER_EMAIL, companyId)
  otherUserId = await makeUser(OTHER_USER_EMAIL, otherCompanyId)
  ctx = { auth: { companyId, userId, role: 'system_admin', module: 'all', sessionId: 'inv-cost-test' } }
  otherCtx = {
    auth: { companyId: otherCompanyId, userId: otherUserId, role: 'system_admin', module: 'all', sessionId: 'inv-cost-test-2' },
  }

  await makeProduct('usdCost', 12.5, 'USD')
  await makeProduct('zeroCost', 0, 'IQD')
  await makeProduct('noCurrency', 800, null)

  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, currency_code, base_currency_code, status, purpose, created_by, organizer_id)
     VALUES ($1,$2,'IQD','IQD','inventory_check','stock',$3,$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}PO-${Date.now()}`, userId],
  )
  poId = po.rows[0]!.id
  const rq = await pool.query<{ id: string }>(
    `INSERT INTO requisitions (company_id, requisition_number, purpose, priority, organizer_id, status)
     VALUES ($1,$2,'stock','low',$3,'inventory_check') RETURNING id`,
    [companyId, `${NAME_PREFIX}REQ-${Date.now()}`, userId],
  )
  requisitionId = rq.rows[0]!.id
  await addLines({ poId })
  await addLines({ requisitionId })
})

afterAll(async () => {
  await server.stop()
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email IN ($1,$2)`, [TEST_USER_EMAIL, OTHER_USER_EMAIL])
  await pool.end()
})

describe.each([
  ['PO lines', poLines],
  ['requisition lines', reqLines],
])('inventory cost on %s, through the real GraphQL schema', (_name, load) => {
  it("is the product's own Cost and its currency", async () => {
    const lines = byName((await load())!)
    expect(parseFloat(lines.withCost!.inventory_cost!)).toBe(12.5)
    expect(lines.withCost!.inventory_cost_currency).toBe('USD')
  })

  it('is not the store price the store keeper typed on the line', async () => {
    const l = byName((await load())!).withCost!
    expect(parseFloat(l.store_price!)).toBe(99)
    expect(parseFloat(l.inventory_cost!)).not.toBe(parseFloat(l.store_price!))
  })

  it('is empty for a product whose cost was never recorded (0 means "unknown")', async () => {
    const l = byName((await load())!).noCost!
    expect(l.inventory_cost).toBeNull()
  })

  it('is empty for a custom line with no catalog product', async () => {
    const l = byName((await load())!).custom!
    expect(l.inventory_cost).toBeNull()
    expect(l.inventory_cost_currency).toBeNull()
  })

  it('still returns an old cost that has no currency, with the currency empty rather than guessed', async () => {
    const l = byName((await load())!).noCurrency!
    expect(parseFloat(l.inventory_cost!)).toBe(800)
    expect(l.inventory_cost_currency).toBeNull()
  })

  it('does not change what a line costs', async () => {
    const lines = byName((await load())!)
    for (const l of Object.values(lines)) expect(parseFloat(l.total)).toBe(200)
  })
})

describe('inventory cost: current, and tenant-safe', () => {
  it("follows the product's cost as it is now, not the cost when the line was made", async () => {
    await pool.query(`UPDATE products SET standard_cost=20, cost_currency='IQD' WHERE id=$1`, [productIds.usdCost])
    const l = byName((await poLines())!).withCost!
    expect(parseFloat(l.inventory_cost!)).toBe(20)
    expect(l.inventory_cost_currency).toBe('IQD')
    await pool.query(`UPDATE products SET standard_cost=12.5, cost_currency='USD' WHERE id=$1`, [productIds.usdCost])
  })

  it("does not give another company's user the lines, or their costs", async () => {
    expect(await poLines(otherCtx)).toBeNull()
    expect(await reqLines(otherCtx)).toBeNull()
  })
})
