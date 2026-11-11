// A line added by an approved edit request names its currency.
//
// Regression: NF-PO-2026-0163. A requisition in USD had a line added after approval. The edit form had no currency
// for an added line and the server filled in `?? 'IQD'`, so the line was stored (and bought, and received) as IQD on
// a USD document; the Lines table printed the order's USD while the Order total counted 24 IQD. On the PO side the
// fallback was the company's base currency, the same mistake. Now the request carries the currency (named by the
// form, else the one every existing line shares), a mixed document must be told, and nothing falls back to IQD.
//
// The first block is pure. The rest is real Postgres through the real mutations, nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { resolveAddedLineCurrency, stampAddedLineCurrencies } from '../src/lib/poEditChanges.js'

describe('resolveAddedLineCurrency (pure)', () => {
  it('uses the currency the request names, trimmed and upper-cased', () => {
    expect(resolveAddedLineCurrency('USD', ['IQD'])).toBe('USD')
    expect(resolveAddedLineCurrency(' usd ', ['IQD', 'EUR'])).toBe('USD')
  })

  it('refuses something that is not a three-letter code', () => {
    for (const bad of ['dollars', 'US', 'US1', 'U$D'])
      expect(() => resolveAddedLineCurrency(bad, ['USD']), bad).toThrow(/not a currency code/)
  })

  it('takes the currency every existing line shares when none is named', () => {
    expect(resolveAddedLineCurrency(undefined, ['USD', 'USD'])).toBe('USD')
    expect(resolveAddedLineCurrency(null, ['USD'])).toBe('USD')
    expect(resolveAddedLineCurrency('', ['USD'])).toBe('USD')
    expect(resolveAddedLineCurrency('  ', ['IQD'])).toBe('IQD')
  })

  it('treats padding, case and empty values on existing lines as the same currency', () => {
    expect(resolveAddedLineCurrency(undefined, ['USD', 'usd ', null, undefined, ''])).toBe('USD')
  })

  it('asks when the lines are in more than one currency, naming them', () => {
    expect(() => resolveAddedLineCurrency(undefined, ['USD', 'IQD'])).toThrow(
      /Choose a currency.*USD and IQD/,
    )
  })

  it('asks when there is nothing to take it from', () => {
    expect(() => resolveAddedLineCurrency(undefined, [])).toThrow(/Choose a currency/)
    expect(() => resolveAddedLineCurrency(undefined, [null, ''])).toThrow(/Choose a currency/)
  })

  it('never answers IQD by default', () => {
    expect(resolveAddedLineCurrency(undefined, ['USD'])).not.toBe('IQD')
  })
})

describe('stampAddedLineCurrencies (pure)', () => {
  const existing = [{ currency_code: 'USD' }, { currency_code: 'USD' }]

  it('writes the currency into every added line, each decided on its own', () => {
    const out = stampAddedLineCurrencies(
      {
        lines: {
          added: [
            { description: 'a', qty: 1, unit_price: 2 },
            { description: 'b', qty: 1, unit_price: 3, currency_code: 'eur' },
          ],
        },
      },
      existing,
    )
    expect(out.lines?.added?.map((l) => l.currency_code)).toEqual(['USD', 'EUR'])
    expect(out.lines?.added?.[0]).toMatchObject({ description: 'a', qty: 1, unit_price: 2 })
  })

  it('does not change what it was given', () => {
    const input = { lines: { added: [{ description: 'a' }] } }
    stampAddedLineCurrencies(input, existing)
    expect(input.lines.added[0]).toEqual({ description: 'a' })
  })

  it('hands back a request with no added lines as it was', () => {
    const noLines = { header: { notes: { from: '', to: 'x' } } }
    expect(stampAddedLineCurrencies(noLines, existing)).toBe(noLines)
    const none = { lines: { removed: ['a'] } }
    expect(stampAddedLineCurrencies(none, existing)).toBe(none)
  })

  it('refuses a mixed document instead of choosing', () => {
    expect(() =>
      stampAddedLineCurrencies({ lines: { added: [{ description: 'a' }] } }, [
        { currency_code: 'USD' },
        { currency_code: 'IQD' },
      ]),
    ).toThrow(/Choose a currency/)
  })
})

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'added-ccy-test-'
const SKU_PREFIX = 'ACYTEST-'
const PO_PREFIX = 'ACYTEST-PO-'

let requesterId: string
let adminId: string
let insertedFxRate = false
const createdPoIds: string[] = [] // purchase orders made through createPurchaseOrder (their numbers are not mine)

const ctxFor = (userId: string, role: string) =>
  ({
    auth: { companyId: TEST_COMPANY_ID, userId, role, module: 'all', sessionId: 'acy-test' },
  }) as never

async function makeUser(key: string, first: string, last: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,'test-hash-not-used',$2,$3)
     ON CONFLICT (email) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`, first, last],
  )
  return r.rows[0]!.id
}

// A requisition with two lines, each in the currency given, forced to `status`.
async function makeRequisition(
  status: string,
  currencies: [string, string],
): Promise<{ reqId: string }> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const prod = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  const created = (await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: 'stock',
        lines: [
          { product_id: prod.rows[0]!.id, description: 'Acoustic tile', qty: 12, unit_price: 6.25 },
          { product_id: prod.rows[0]!.id, description: 'Aluminium ceiling', qty: 3, unit_price: 12.5 },
        ],
      },
    },
    ctxFor(requesterId, 'system_admin'),
  )) as { id: string }
  await pool.query(`UPDATE requisitions SET status=$1 WHERE id=$2`, [status, created.id])
  await pool.query(
    `UPDATE po_lines SET currency_code = CASE description WHEN 'Acoustic tile' THEN $2 ELSE $3 END WHERE requisition_id=$1`,
    [created.id, currencies[0], currencies[1]],
  )
  return { reqId: created.id }
}

// A purchase order (base currency IQD) with two lines, each in the currency given.
async function makePO(
  status: string,
  currencies: [string, string],
): Promise<{ poId: string }> {
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, base_currency_code, purpose)
     VALUES ($1,$2,$3,$4,'IQD','IQD','stock') RETURNING id`,
    [TEST_COMPANY_ID, `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, requesterId, status],
  )
  const poId = po.rows[0]!.id
  const insertLine = (n: number, desc: string, price: number, ccy: string) =>
    pool.query(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, uom, currency_code)
       VALUES ($1,$2,$3,10,$4,$5,'pc',$6)`,
      [poId, n, desc, price, price * 10, ccy],
    )
  await insertLine(1, 'Acoustic tile', 6.25, currencies[0])
  await insertLine(2, 'Aluminium ceiling', 12.5, currencies[1])
  return { poId }
}

async function cleanup(): Promise<void> {
  const reqs = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`
  const reqArgs = [TEST_COMPANY_ID, `${EMAIL_PREFIX}%`]
  await pool.query(`DELETE FROM po_edit_requests WHERE requisition_id IN (${reqs})`, reqArgs)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, reqArgs)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, reqArgs)
  await pool.query(`DELETE FROM requisitions WHERE id IN (${reqs})`, reqArgs)

  const pos = `SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`
  const poArgs = [TEST_COMPANY_ID, `${PO_PREFIX}%`]
  await pool.query(`DELETE FROM po_edit_requests WHERE po_id IN (${pos})`, poArgs)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, poArgs)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos})`, poArgs)
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, poArgs)
  if (createdPoIds.length > 0) {
    await pool.query(`DELETE FROM po_edit_requests WHERE po_id = ANY($1)`, [createdPoIds])
    await pool.query(`DELETE FROM po_approval_log WHERE po_id = ANY($1)`, [createdPoIds])
    await pool.query(`DELETE FROM po_lines WHERE po_id = ANY($1)`, [createdPoIds])
    await pool.query(`DELETE FROM purchase_orders WHERE id = ANY($1)`, [createdPoIds])
    createdPoIds.length = 0
  }
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  requesterId = await makeUser('requester', 'Yazin', 'Requester')
  adminId = await makeUser('admin', 'Nadia', 'Admin')
  await cleanup()
  // The PO side looks up an exchange rate for any line currency that is not the order's base.
  const rate = await pool.query(
    `INSERT INTO po_fx_rates (company_id, currency_code, rate_to_base) VALUES ($1,'USD',1500)
     ON CONFLICT (company_id, currency_code) DO NOTHING RETURNING id`,
    [TEST_COMPANY_ID],
  )
  insertedFxRate = rate.rows.length > 0
})

afterAll(async () => {
  await cleanup()
  if (insertedFxRate)
    await pool.query(`DELETE FROM po_fx_rates WHERE company_id=$1 AND currency_code='USD'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]).catch(() => undefined)
  await pool.end()
})

interface StoredChanges {
  lines?: { added?: { description?: string; currency_code?: string }[] }
}
const storedChanges = async (requestId: string): Promise<StoredChanges> =>
  (await pool.query<{ changes: StoredChanges }>(`SELECT changes FROM po_edit_requests WHERE id=$1`, [requestId]))
    .rows[0]!.changes

const addedLine = (over: Record<string, unknown> = {}) => ({
  product_id: '',
  description: 'Corner angle',
  qty: 16,
  uom: 'pc',
  unit_price: 1.5,
  ...over,
})

const submitReq = (reqId: string, added: Record<string, unknown>[]) =>
  resolvers.Mutation.submitPOEditRequest(
    null,
    { requisitionId: reqId, changes: JSON.stringify({ lines: { added } }) } as never,
    ctxFor(requesterId, 'user'),
  ) as Promise<{ id: string; status: string }>

const approveReq = (reqId: string, requestId: string) =>
  resolvers.Mutation.approvePOEditRequest(
    null,
    { requisitionId: reqId, requestId } as never,
    ctxFor(adminId, 'system_admin'),
  )

const submitPO = (poId: string, added: Record<string, unknown>[]) =>
  resolvers.Mutation.submitPOEditRequest(
    null,
    { id: poId, changes: JSON.stringify({ lines: { added } }) } as never,
    ctxFor(requesterId, 'user'),
  ) as Promise<{ id: string; status: string }>

const approvePO = (poId: string, requestId: string) =>
  resolvers.Mutation.approvePOEditRequest(
    null,
    { id: poId, requestId } as never,
    ctxFor(adminId, 'system_admin'),
  )

// What is already pending on production: an added line with no currency in the stored payload.
const stripCurrency = (requestId: string) =>
  pool.query(`UPDATE po_edit_requests SET changes = changes #- '{lines,added,0,currency_code}' WHERE id=$1`, [requestId])

const lineOf = async (where: 'requisition_id' | 'po_id', id: string, description: string) =>
  (
    await pool.query<{ currency_code: string; unit_price: string; total_price: string; fx_rate_to_base: string | null }>(
      `SELECT currency_code, unit_price, total_price, fx_rate_to_base FROM po_lines WHERE ${where}=$1 AND description=$2`,
      [id, description],
    )
  ).rows
const requestCount = async (col: 'requisition_id' | 'po_id', id: string) =>
  (await pool.query(`SELECT 1 FROM po_edit_requests WHERE ${col}=$1`, [id])).rows.length

describe('requisition: a line added by an edit request', () => {
  it('takes the currency the requisition is in, and the request says so (NF-PO-2026-0163)', async () => {
    const { reqId } = await makeRequisition('approved', ['USD', 'USD'])
    const res = await submitReq(reqId, [addedLine()])
    expect(res.status).toBe('pending')
    expect((await storedChanges(res.id)).lines?.added?.[0]).toMatchObject({ currency_code: 'USD' })

    await approveReq(reqId, res.id)
    const [created, ...more] = await lineOf('requisition_id', reqId, 'Corner angle')
    expect(more).toHaveLength(0)
    expect(created).toMatchObject({ currency_code: 'USD' })
    expect(Number(created!.total_price)).toBe(24)
  })

  it('keeps a currency the form named, even on a requisition in another one', async () => {
    const { reqId } = await makeRequisition('approved', ['USD', 'USD'])
    const res = await submitReq(reqId, [addedLine({ currency_code: 'EUR' })])
    expect((await storedChanges(res.id)).lines?.added?.[0]).toMatchObject({ currency_code: 'EUR' })
    await approveReq(reqId, res.id)
    expect((await lineOf('requisition_id', reqId, 'Corner angle'))[0]).toMatchObject({ currency_code: 'EUR' })
  })

  it('upper-cases a code typed in lower case', async () => {
    const { reqId } = await makeRequisition('approved', ['IQD', 'IQD'])
    const res = await submitReq(reqId, [addedLine({ currency_code: 'usd' })])
    await approveReq(reqId, res.id)
    expect((await lineOf('requisition_id', reqId, 'Corner angle'))[0]).toMatchObject({ currency_code: 'USD' })
  })

  it('leaves a requisition that is in IQD in IQD', async () => {
    const { reqId } = await makeRequisition('draft', ['IQD', 'IQD'])
    const res = await submitReq(reqId, [addedLine()]) // not yet approved: applied straight away
    expect(res.status).toBe('approved')
    expect((await lineOf('requisition_id', reqId, 'Corner angle'))[0]).toMatchObject({ currency_code: 'IQD' })
  })

  it('refuses, to the person asking, when the requisition mixes currencies and none was named', async () => {
    const { reqId } = await makeRequisition('approved', ['USD', 'IQD'])
    await expect(submitReq(reqId, [addedLine()])).rejects.toThrow(/Choose a currency.*(USD and IQD|IQD and USD)/)
    expect(await requestCount('requisition_id', reqId)).toBe(0) // nothing was stored
    expect(await lineOf('requisition_id', reqId, 'Corner angle')).toHaveLength(0)
  })

  it('refuses a currency that is not a code', async () => {
    const { reqId } = await makeRequisition('approved', ['USD', 'USD'])
    await expect(submitReq(reqId, [addedLine({ currency_code: 'dollars' })])).rejects.toThrow(/not a currency code/)
    expect(await requestCount('requisition_id', reqId)).toBe(0)
  })

  it('decides each added line on its own', async () => {
    const { reqId } = await makeRequisition('approved', ['USD', 'USD'])
    const res = await submitReq(reqId, [
      addedLine({ description: 'Corner angle' }),
      addedLine({ description: 'Wall plug', currency_code: 'EUR' }),
    ])
    await approveReq(reqId, res.id)
    expect((await lineOf('requisition_id', reqId, 'Corner angle'))[0]?.currency_code).toBe('USD')
    expect((await lineOf('requisition_id', reqId, 'Wall plug'))[0]?.currency_code).toBe('EUR')
  })

  describe('a request submitted before the currency was recorded', () => {
    it('is approved in the currency the requisition shares, not IQD', async () => {
      const { reqId } = await makeRequisition('approved', ['USD', 'USD'])
      const res = await submitReq(reqId, [addedLine()])
      await stripCurrency(res.id)
      expect((await storedChanges(res.id)).lines?.added?.[0]).not.toHaveProperty('currency_code')

      await approveReq(reqId, res.id)
      expect((await lineOf('requisition_id', reqId, 'Corner angle'))[0]).toMatchObject({ currency_code: 'USD' })
    })

    it('cannot be approved on a requisition that mixes currencies: it says why, and adds nothing', async () => {
      const { reqId } = await makeRequisition('approved', ['USD', 'USD'])
      const res = await submitReq(reqId, [addedLine()])
      await stripCurrency(res.id)
      await pool.query(`UPDATE po_lines SET currency_code='IQD' WHERE requisition_id=$1 AND description='Aluminium ceiling'`, [reqId])

      await expect(approveReq(reqId, res.id)).rejects.toThrow(/Choose a currency/)
      expect(await lineOf('requisition_id', reqId, 'Corner angle')).toHaveLength(0)
      const status = await pool.query<{ status: string }>(`SELECT status FROM po_edit_requests WHERE id=$1`, [res.id])
      expect(status.rows[0]?.status).toBe('pending')
    })
  })
})

// The page counts a line in the currency it is STORED in, so a line has to be stored in the currency it was asked for
// from the start. Both creation paths used to set only requested_currency_code and leave the stored one at its
// column default (IQD) until market pricing.
describe('a line created with a requested currency is stored in it', () => {
  const product = async () =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
        [TEST_COMPANY_ID, `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
      )
    ).rows[0]!.id

  it('a requisition line asked for in USD is stored in USD, and one with no request keeps IQD', async () => {
    const p = await product()
    const created = (await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'stock',
          lines: [
            { product_id: p, description: 'Priced in dollars', qty: 2, unit_price: 6.25, requested_currency_code: 'USD' },
            { product_id: p, description: 'No currency asked', qty: 1, unit_price: 900 },
          ],
        },
      },
      ctxFor(requesterId, 'system_admin'),
    )) as { id: string }
    const rows = await pool.query<{ description: string; currency_code: string; requested_currency_code: string | null }>(
      `SELECT description, currency_code, requested_currency_code FROM po_lines WHERE requisition_id=$1`,
      [created.id],
    )
    const byName = new Map(rows.rows.map((r) => [r.description, r]))
    expect(byName.get('Priced in dollars')).toMatchObject({ currency_code: 'USD', requested_currency_code: 'USD' })
    expect(byName.get('No currency asked')).toMatchObject({ currency_code: 'IQD', requested_currency_code: null })
  })

  it('a standalone purchase order line asked for in USD is stored in USD, and one with no request takes the base currency', async () => {
    const p = await product()
    const created = (await resolvers.Mutation.createPurchaseOrder(
      null,
      {
        input: {
          purpose: 'stock',
          lines: [
            { product_id: p, description: 'Priced in dollars', qty: 2, unit_price: 6.25, requested_currency_code: 'USD' },
            { product_id: p, description: 'No currency asked', qty: 1, unit_price: 900 },
          ],
        },
      },
      ctxFor(requesterId, 'system_admin'),
    )) as { id: string }
    createdPoIds.push(created.id)
    const rows = await pool.query<{ description: string; currency_code: string }>(
      `SELECT description, currency_code FROM po_lines WHERE po_id=$1`,
      [created.id],
    )
    const base = await pool.query<{ base_currency_code: string }>(`SELECT base_currency_code FROM purchase_orders WHERE id=$1`, [created.id])
    const byName = new Map(rows.rows.map((r) => [r.description, r.currency_code]))
    expect(byName.get('Priced in dollars')).toBe('USD')
    expect(byName.get('No currency asked')).toBe(base.rows[0]!.base_currency_code)
  })
})

describe('purchase order: a line added by an edit request', () => {
  it('takes the currency the order is in, not the company base currency', async () => {
    const { poId } = await makePO('approved', ['USD', 'USD'])
    const res = await submitPO(poId, [addedLine()])
    expect(res.status).toBe('pending')
    expect((await storedChanges(res.id)).lines?.added?.[0]).toMatchObject({ currency_code: 'USD' })

    await approvePO(poId, res.id)
    const [created] = await lineOf('po_id', poId, 'Corner angle')
    expect(created).toMatchObject({ currency_code: 'USD' })
    expect(Number(created!.fx_rate_to_base)).toBe(1500)
  })

  it('keeps a currency the form named', async () => {
    const { poId } = await makePO('approved', ['USD', 'USD'])
    const res = await submitPO(poId, [addedLine({ currency_code: 'IQD' })])
    await approvePO(poId, res.id)
    expect((await lineOf('po_id', poId, 'Corner angle'))[0]).toMatchObject({ currency_code: 'IQD', fx_rate_to_base: '1.000000' })
  })

  it('refuses, to the person asking, when the order mixes currencies and none was named', async () => {
    const { poId } = await makePO('approved', ['USD', 'IQD'])
    await expect(submitPO(poId, [addedLine()])).rejects.toThrow(/Choose a currency/)
    expect(await requestCount('po_id', poId)).toBe(0)
  })

  describe('a request submitted before the currency was recorded', () => {
    it('is approved in the currency the order shares, not the company base currency', async () => {
      const { poId } = await makePO('approved', ['USD', 'USD'])
      const res = await submitPO(poId, [addedLine()])
      await stripCurrency(res.id)
      expect((await storedChanges(res.id)).lines?.added?.[0]).not.toHaveProperty('currency_code')

      await approvePO(poId, res.id)
      expect((await lineOf('po_id', poId, 'Corner angle'))[0]).toMatchObject({ currency_code: 'USD' })
    })

    it('cannot be approved on an order that mixes currencies: it says why, and adds nothing', async () => {
      const { poId } = await makePO('approved', ['USD', 'USD'])
      const res = await submitPO(poId, [addedLine()])
      await stripCurrency(res.id)
      await pool.query(`UPDATE po_lines SET currency_code='IQD' WHERE po_id=$1 AND description='Aluminium ceiling'`, [poId])

      await expect(approvePO(poId, res.id)).rejects.toThrow(/Choose a currency/)
      expect(await lineOf('po_id', poId, 'Corner angle')).toHaveLength(0)
      const status = await pool.query<{ status: string }>(`SELECT status FROM po_edit_requests WHERE id=$1`, [res.id])
      expect(status.rows[0]?.status).toBe('pending')
    })
  })

  it('applies at once on an order not yet approved, in the order currency', async () => {
    const { poId } = await makePO('draft', ['USD', 'USD'])
    const res = await submitPO(poId, [addedLine()])
    expect(res.status).toBe('approved')
    expect((await lineOf('po_id', poId, 'Corner angle'))[0]).toMatchObject({ currency_code: 'USD' })
  })
})
