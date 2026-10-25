// D10 regression, at the GraphQL layer. Migration 308 made
// purchase_orders.total_amount/subtotal nullable and recalcPOTotalsGW writes
// NULL for a PO whose lines span more than one currency (and for a PO with no
// lines). PurchaseOrder.total_amount used to be declared `String!`, so the
// executor refused the NULL: purchaseOrder/purchaseOrderForAction/myPOQueue
// came back null and a list row was nulled -- the PO silently vanished from
// the screens. Every other test calls the resolver functions directly, which
// bypasses the schema's nullability checks entirely; this one runs the real
// ApolloServer({ typeDefs, resolvers }) the gateway itself builds (app.ts)
// with the selection sets the web sends. Real Postgres, own throwaway company,
// same pattern as sync-po-commitments-multicurrency.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-POMIXGQL-TEST-'
const TEST_USER_EMAIL = 'g-po-mixed-graphql-test@fnc-erp.local'

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

let companyId: string
let userId: string
let requisitionId: string
let mixedPoId: string
let zeroLinePoId: string
let singlePoId: string
let mixedChildPoId: string
let singleChildPoId: string
let ctx: TestCtx

async function makePO(opts: {
  status: string
  requisitionId?: string
  lines: { currency: string; qty: number; price: number }[]
  totals?: string
}): Promise<string> {
  const poNumber = `${NAME_PREFIX}PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  // total_amount/subtotal are left out on purpose for the NULL cases: that is
  // exactly the row recalcPOTotalsGW leaves behind for a mixed-currency or
  // line-less PO.
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders
       (company_id, po_number, currency_code, base_currency_code, status, purpose, created_by, organizer_id,
        requisition_id, subtotal, total_amount)
     VALUES ($1,$2,'IQD','IQD',$3,'stock',$4,$4,$5,$6,$6) RETURNING id`,
    [companyId, poNumber, opts.status, userId, opts.requisitionId ?? null, opts.totals ?? null],
  )
  const poId = r.rows[0]!.id
  let n = 0
  for (const l of opts.lines) {
    n++
    await pool.query(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [poId, n, `line ${n}`, l.qty, l.price, l.qty * l.price, l.currency],
    )
  }
  return poId
}

async function run(
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown> | null; errors?: readonly { message: string }[] }> {
  const res = await server.executeOperation({ query, variables }, { contextValue: ctx })
  if (res.body.kind !== 'single') throw new Error('unexpected incremental GraphQL response')
  return res.body.singleResult as { data?: Record<string, unknown> | null; errors?: { message: string }[] }
}

const TOTALS = `total_amount subtotal currencyTotals { currency_code subtotal line_count }`

function sortedTotals(totals: { currency_code: string; subtotal: string }[]) {
  return [...totals]
    .sort((a, b) => a.currency_code.localeCompare(b.currency_code))
    .map((t) => [t.currency_code, parseFloat(t.subtotal)])
}

async function cleanup(): Promise<void> {
  if (!companyId) return
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [
    companyId,
  ])
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

beforeAll(async () => {
  await server.start()
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  companyId = companyRes.rows[0]!.id
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
    [userId, companyId],
  )
  ctx = { auth: { companyId, userId, role: 'system_admin', module: 'all', sessionId: 'po-mixed-graphql-test' } }

  const reqRes = await pool.query<{ id: string }>(
    `INSERT INTO requisitions (company_id, requisition_number, purpose, priority, organizer_id, status)
     VALUES ($1,$2,'stock','low',$3,'draft') RETURNING id`,
    [companyId, `${NAME_PREFIX}REQ-${Date.now()}`, userId],
  )
  requisitionId = reqRes.rows[0]!.id

  // price_verification is a status the system_admin sees in myPOQueue.
  mixedPoId = await makePO({
    status: 'price_verification',
    lines: [
      { currency: 'IQD', qty: 2, price: 100 }, // 200 IQD
      { currency: 'USD', qty: 3, price: 10 }, // 30 USD
    ],
  })
  zeroLinePoId = await makePO({ status: 'draft', lines: [] })
  singlePoId = await makePO({
    status: 'price_verification',
    lines: [{ currency: 'IQD', qty: 5, price: 100 }],
    totals: '500.0000',
  })
  mixedChildPoId = await makePO({
    status: 'bought',
    requisitionId,
    lines: [
      { currency: 'IQD', qty: 1, price: 50 },
      { currency: 'USD', qty: 1, price: 5 },
    ],
  })
  singleChildPoId = await makePO({
    status: 'bought',
    requisitionId,
    lines: [{ currency: 'IQD', qty: 1, price: 70 }],
    totals: '70.0000',
  })
})

afterAll(async () => {
  await server.stop()
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('mixed-currency / line-less PO through the real GraphQL schema', () => {
  it('precondition: the fixture rows really carry NULL totals', async () => {
    const r = await pool.query<{ id: string }>(
      `SELECT id FROM purchase_orders WHERE company_id=$1 AND (total_amount IS NULL OR subtotal IS NULL)`,
      [companyId],
    )
    expect(r.rows.map((x) => x.id).sort()).toEqual([mixedPoId, zeroLinePoId, mixedChildPoId].sort())
  })

  it.each([
    ['purchaseOrder', 'purchaseOrder(id: $id)'],
    ['purchaseOrderForAction', 'purchaseOrderForAction(id: $id)'],
  ])('%s loads a mixed-currency PO with null total_amount and per-currency totals', async (field, call) => {
    const res = await run(
      `query ($id: ID!) { po: ${call} { id po_number status currency_code ${TOTALS} } }`,
      { id: mixedPoId },
    )
    expect(res.errors, field).toBeUndefined()
    const po = res.data!.po as { id: string; total_amount: string | null; currencyTotals: never[] }
    expect(po.id).toBe(mixedPoId)
    expect(po.total_amount).toBeNull()
    expect(sortedTotals(po.currencyTotals)).toEqual([
      ['IQD', 200],
      ['USD', 30],
    ])
  })

  it('purchaseOrder loads a PO that has no lines at all', async () => {
    const res = await run(`query ($id: ID!) { po: purchaseOrder(id: $id) { id ${TOTALS} } }`, { id: zeroLinePoId })
    expect(res.errors).toBeUndefined()
    const po = res.data!.po as { id: string; total_amount: string | null; currencyTotals: unknown[] }
    expect(po.id).toBe(zeroLinePoId)
    expect(po.total_amount).toBeNull()
    expect(po.currencyTotals).toEqual([])
  })

  it('the list returns every PO of the company, none dropped and none nulled', async () => {
    const res = await run(
      `{ purchaseOrders { id po_number status priority currency_code invoice_count viewerCanSeeTotals ${TOTALS} } }`,
    )
    expect(res.errors).toBeUndefined()
    const rows = res.data!.purchaseOrders as ({ id: string; total_amount: string | null } | null)[]
    expect(rows.every((r) => r !== null)).toBe(true)
    const inDb = await pool.query<{ n: string }>(`SELECT COUNT(*) AS n FROM purchase_orders WHERE company_id=$1`, [
      companyId,
    ])
    expect(rows).toHaveLength(parseInt(inDb.rows[0]!.n, 10))
    const byId = new Map(rows.map((r) => [r!.id, r!]))
    for (const id of [mixedPoId, zeroLinePoId, singlePoId, mixedChildPoId, singleChildPoId]) {
      expect(byId.has(id), `PO ${id} missing from the list`).toBe(true)
    }
    expect(byId.get(mixedPoId)!.total_amount).toBeNull()
    expect(parseFloat(byId.get(singlePoId)!.total_amount!)).toBe(500)
  })

  it('myPOQueue returns the mixed-currency PO instead of nulling the whole queue', async () => {
    const res = await run(`{ myPOQueue { id po_number status currency_code total_amount } }`)
    expect(res.errors).toBeUndefined()
    expect(res.data!.myPOQueue).not.toBeNull()
    const ids = (res.data!.myPOQueue as { id: string }[]).map((r) => r.id)
    expect(ids).toContain(mixedPoId)
    expect(ids).toContain(singlePoId)
    expect(ids).toContain(zeroLinePoId)
  })

  it("a requisition's child POs list survives a mixed-currency child (it is a non-null list)", async () => {
    const res = await run(
      `query ($r: ID!) { requisitionChildPurchaseOrders(requisitionId: $r) { id po_number status currency_code ${TOTALS} } }`,
      { r: requisitionId },
    )
    expect(res.errors).toBeUndefined()
    const rows = res.data!.requisitionChildPurchaseOrders as {
      id: string
      total_amount: string | null
      currencyTotals: never[]
    }[]
    expect(rows.map((r) => r.id).sort()).toEqual([mixedChildPoId, singleChildPoId].sort())
    const mixed = rows.find((r) => r.id === mixedChildPoId)!
    expect(mixed.total_amount).toBeNull()
    expect(sortedTotals(mixed.currencyTotals)).toEqual([
      ['IQD', 50],
      ['USD', 5],
    ])
  })
})
