// Regression coverage for a real gap the central-warehouse visibility work
// this session missed: making Factory's STOCK visible during Inventory
// Check (migration 280) is useless if the requisition/PO line-item picker
// can never find the PRODUCT in the first place — the `products` query was
// still scoped to "my own company's products, or a foreign product that
// already has stock at one of my own locations", so an item that has only
// ever lived in Factory's own catalog (never interco'd anywhere) was
// invisible from every other company's New Requisition/PO form. Real-
// Postgres pattern, same as interco-billing-bridge.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const FACTORY_COMPANY_ID = '00000000-0000-0000-0000-000000000002'
const YAKAM_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const SKU_PREFIX = 'PRODCWSEARCHTEST-'

let userId: string
let factoryWarehouseId: string
let factoryVirtualInId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeFactoryProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [FACTORY_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    [`${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    [`${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [`${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    ['products-central-warehouse-search-test@fnc-erp.local'],
  )
  userId = userR.rows[0]!.id
  ctx = {
    auth: { companyId: YAKAM_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'prod-cw-search-test' },
  }

  const fwh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [FACTORY_COMPANY_ID],
  )
  if (!fwh.rows[0]) throw new Error('No Factory warehouse location seeded — run seeds first')
  factoryWarehouseId = fwh.rows[0].id

  const fvi = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [FACTORY_COMPANY_ID],
  )
  if (!fvi.rows[0]) throw new Error('No Factory virtual_in location seeded — run seeds first')
  factoryVirtualInId = fvi.rows[0].id

  // Belt-and-braces, same reasoning as interco-billing-bridge.test.ts:
  // migrations run before seeds, so a freshly-migrated-then-seeded DB can
  // have this still false even though seed-companies.ts now sets it too.
  await pool.query(`UPDATE companies SET is_central_warehouse=true WHERE id=$1`, [FACTORY_COMPANY_ID])

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE id=$1`, [userId])
  await pool.end()
})

describe('products query — central-warehouse product discoverability', () => {
  it('a Factory-only product (no stock anywhere else) is invisible from Yakam by default', async () => {
    const productId = await makeFactoryProduct('default-hidden')

    const results = (await resolvers.Query.products(
      null,
      { category: undefined, companyId: undefined, includeCentralWarehouse: false },
      ctx as never,
    )) as { id: string }[]

    expect(results.some((p) => p.id === productId)).toBe(false)
  })

  it('the same product IS visible from Yakam with includeCentralWarehouse, with its real Factory qty_on_hand', async () => {
    const productId = await makeFactoryProduct('cw-visible')
    await pool.query(
      `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
      [FACTORY_COMPANY_ID, productId, factoryVirtualInId, factoryWarehouseId, 12, 7, 84, userId],
    )

    const results = (await resolvers.Query.products(
      null,
      { category: undefined, companyId: undefined, includeCentralWarehouse: true },
      ctx as never,
    )) as { id: string; qty_on_hand: string | number }[]

    const found = results.find((p) => p.id === productId)
    expect(found).toBeTruthy()
    expect(parseFloat(String(found!.qty_on_hand))).toBe(12)
  })

  it('a product with no stock anywhere still shows up with includeCentralWarehouse (0 qty), just findable', async () => {
    const productId = await makeFactoryProduct('cw-visible-zero-stock')

    const results = (await resolvers.Query.products(
      null,
      { category: undefined, companyId: undefined, includeCentralWarehouse: true },
      ctx as never,
    )) as { id: string; qty_on_hand: string | number }[]

    const found = results.find((p) => p.id === productId)
    expect(found).toBeTruthy()
    expect(parseFloat(String(found!.qty_on_hand))).toBe(0)
  })

  it('a caller\'s own-company product is unaffected by the flag either way', async () => {
    const sku = `${SKU_PREFIX}own-company-${Date.now()}`
    const ownProduct = await pool.query<{ id: string }>(
      `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
      [YAKAM_COMPANY_ID, sku, sku],
    )
    const productId = ownProduct.rows[0]!.id

    const withoutFlag = (await resolvers.Query.products(
      null,
      { category: undefined, companyId: undefined, includeCentralWarehouse: false },
      ctx as never,
    )) as { id: string }[]
    const withFlag = (await resolvers.Query.products(
      null,
      { category: undefined, companyId: undefined, includeCentralWarehouse: true },
      ctx as never,
    )) as { id: string }[]

    expect(withoutFlag.some((p) => p.id === productId)).toBe(true)
    expect(withFlag.some((p) => p.id === productId)).toBe(true)

    await pool.query(`DELETE FROM products WHERE id=$1`, [productId])
  })

  it('an explicit companyId targeting a specific foreign company is unaffected by the flag (its own separate, already-gated branch)', async () => {
    const productId = await makeFactoryProduct('explicit-company-id')

    const results = (await resolvers.Query.products(
      null,
      { category: undefined, companyId: FACTORY_COMPANY_ID, includeCentralWarehouse: false },
      { auth: { ...ctx.auth, role: 'system_admin' } } as never,
    )) as { id: string }[]

    expect(results.some((p) => p.id === productId)).toBe(true)
  })
})
