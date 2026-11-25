// Price after discount on a purchase (migration 336, playbook #124). A vendor quotes a unit price and gives a discount; the buyer
// records the quoted price AND the unit price after the discount. When the second is filled it is the price that counts (the
// purchase total, the child purchase order, the tolerance check, the review totals); the quoted price stays as information.
//
// Real Postgres, real mutations, and the real schema for the reads the page makes. The user's own example drives it: quantity 5,
// quoted 42.50 USD, 40 USD after the discount, all per unit. The line's approved price is 40 with a tolerance of 1 USD, so the
// quoted price alone is over tolerance (ceiling 41) and the price after the discount is not.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  discountedPriceProblem,
  effectivePriceSql,
  effectiveUnitPrice,
} from '../src/lib/purchaseDiscount.js'
import { passReview } from './review-helpers.js'

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const EMAIL_PREFIX = 'disc-price-test-'
const CODE_PREFIX = 'DISCTEST-'
const VENDOR_PREFIX = 'DISCTEST-VENDOR-'
const FILE_PREFIX = 'disctest/'

type Who = 'organizer' | 'buyer' | 'admin'
const WHO: Who[] = ['organizer', 'buyer', 'admin']
const userIds = {} as Record<Who, string>
let projectId: string
let vendorA: string
let vendorB: string
let toleranceBefore: { tolerance_pct: string; tolerance_abs: string; is_provisional: boolean } | null = null

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const ctxFor = (who: Who, role?: string): TestCtx => ({
  auth: {
    companyId: COMPANY_ID,
    userId: userIds[who],
    role: role ?? (who === 'admin' ? 'system_admin' : 'user'),
    module: 'all',
    sessionId: 'disc-test',
  },
})
const asAdmin = (who: Who): TestCtx => ctxFor(who, 'system_admin')

const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })
type Mut = Record<string, (...a: unknown[]) => Promise<unknown>>
const M = resolvers.Mutation as unknown as Mut
const Q = resolvers.Query as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>

async function makeReceipt(): Promise<string> {
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [COMPANY_ID, userIds.admin, `${FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
  )
  return f.rows[0]!.id
}

interface PurchaseRow {
  id: string
  qty: string
  actual_unit_price: string
  discounted_unit_price: string | null
  over_tolerance: boolean
  review_original_price: string | null
}
async function purchaseRow(id: string): Promise<PurchaseRow> {
  return (
    await pool.query<PurchaseRow>(
      `SELECT id, qty, actual_unit_price, discounted_unit_price, over_tolerance, review_original_price
         FROM po_line_purchases WHERE id=$1`,
      [id],
    )
  ).rows[0]!
}
async function statusOf(reqId: string): Promise<string> {
  return (await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])).rows[0]!.status
}
async function purchaseCount(lineId: string): Promise<number> {
  return Number(
    (await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM po_line_purchases WHERE po_line_id=$1`, [lineId])).rows[0]!.c,
  )
}

// A direct supply requisition with two lines of 5 x 40 USD (the approved price is 40), approved and waiting at Items Bought.
async function reachBuying(): Promise<{ reqId: string; lines: string[] }> {
  const created = (await M.createRequisition(
    null,
    {
      input: {
        purpose: 'direct_supply',
        project_id: projectId,
        lines: [1, 2].map((n) => ({
          description: `Discount item ${n}`,
          qty: 5,
          unit_price: 40,
          uom: 'pc',
          requested_currency_code: 'USD',
        })),
      },
    },
    asAdmin('organizer'),
  )) as { id: string }
  await M.submitRequisitionDirectSupply(null, { id: created.id }, asAdmin('organizer'))
  await M.approveRequisition(null, { id: created.id }, ctxFor('admin'))
  const lines = (
    await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`, [created.id])
  ).rows.map((r) => r.id)
  return { reqId: created.id, lines }
}

async function record(
  lineId: string,
  over: { vendorId?: string; qty?: number; price: number; discounted?: number | null },
): Promise<{ id: string }> {
  return (await M.recordLinePurchase(
    null,
    {
      input: {
        lineId,
        vendorId: over.vendorId ?? vendorA,
        qty: over.qty ?? 5,
        actualUnitPrice: over.price,
        ...(over.discounted === undefined ? {} : { discountedUnitPrice: over.discounted }),
        currencyCode: 'USD',
        receiptFileId: await makeReceipt(),
      },
    },
    asAdmin('buyer'),
  )) as { id: string }
}

async function cleanup(): Promise<void> {
  const reqs = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`
  const params = [COMPANY_ID, `${EMAIL_PREFIX}%`]
  await pool.query(
    `DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE requisition_id IN (${reqs}) OR po_id IN (SELECT id FROM purchase_orders WHERE requisition_id IN (${reqs})))`,
    params,
  )
  await pool.query(`DELETE FROM document_attachments WHERE file_id IN (SELECT id FROM files WHERE file_key LIKE $1)`, [`${FILE_PREFIX}%`])
  await pool.query(`DELETE FROM files WHERE file_key LIKE $1`, [`${FILE_PREFIX}%`])
  await pool.query(
    `DELETE FROM service_outbox WHERE payload->>'requisitionId' IN (SELECT id::text FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2))`,
    params,
  )
  await pool.query(`DELETE FROM po_edit_requests WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_review_removed_lines WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE requisition_id IN (${reqs}))`, params)
  await pool.query(`DELETE FROM purchase_orders WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`, params)
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [COMPANY_ID, `${VENDOR_PREFIX}%`])
}

beforeAll(async () => {
  for (const who of WHO) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [`${EMAIL_PREFIX}${who}@fnc-erp.local`],
    )
    userIds[who] = r.rows[0]!.id
  }
  await cleanup()
  projectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,'Discount test project','approved',$3) RETURNING id`,
      [COMPANY_ID, `${CODE_PREFIX}A`, userIds.admin],
    )
  ).rows[0]!.id
  const vendor = async (n: string) =>
    (
      await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
        COMPANY_ID,
        `${VENDOR_PREFIX}${n}-${Date.now()}`,
      ])
    ).rows[0]!.id
  vendorA = await vendor('A')
  vendorB = await vendor('B')
  // 5% or 1 USD, whichever is less: an approved price of 40 tolerates up to 41 and no more.
  const before = await pool.query(
    `SELECT tolerance_pct, tolerance_abs, is_provisional FROM company_price_tolerance WHERE company_id=$1 AND currency_code='USD'`,
    [COMPANY_ID],
  )
  toleranceBefore = before.rows[0] ?? null
  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'USD',5,1,true)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=1`,
    [COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanup()
  if (toleranceBefore) {
    await pool.query(
      `UPDATE company_price_tolerance SET tolerance_pct=$2, tolerance_abs=$3, is_provisional=$4 WHERE company_id=$1 AND currency_code='USD'`,
      [COMPANY_ID, toleranceBefore.tolerance_pct, toleranceBefore.tolerance_abs, toleranceBefore.is_provisional],
    )
  } else {
    await pool.query(`DELETE FROM company_price_tolerance WHERE company_id=$1 AND currency_code='USD'`, [COMPANY_ID])
  }
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

describe('the rule in lib/purchaseDiscount.ts', () => {
  it('counts the price after the discount when there is one, otherwise the quoted price', () => {
    expect(effectiveUnitPrice(42.5, 40)).toBe(40)
    expect(effectiveUnitPrice('42.5000', '40.0000')).toBe(40)
    expect(effectiveUnitPrice(42.5, null)).toBe(42.5)
    expect(effectiveUnitPrice(42.5, undefined)).toBe(42.5)
    expect(effectiveUnitPrice('42.5000', '')).toBe(42.5)
  })

  it('accepts no discount, a lower price and an equal one; refuses zero, a negative and a higher price, in words', () => {
    expect(discountedPriceProblem(42.5, null)).toBeNull()
    expect(discountedPriceProblem(42.5, undefined)).toBeNull()
    expect(discountedPriceProblem(42.5, 40)).toBeNull()
    expect(discountedPriceProblem(42.5, 42.5)).toBeNull()
    expect(discountedPriceProblem(42.5, 0)).toMatch(/greater than 0/)
    expect(discountedPriceProblem(42.5, -1)).toMatch(/greater than 0/)
    expect(discountedPriceProblem(42.5, 43)).toMatch(/cannot be higher than the price the vendor quoted/)
  })

  it('has one SQL expression for the price that counts', () => {
    expect(effectivePriceSql('plp')).toBe('COALESCE(plp.discounted_unit_price, plp.actual_unit_price)')
    expect(effectivePriceSql()).toBe('COALESCE(plp.discounted_unit_price, plp.actual_unit_price)')
    expect(effectivePriceSql('x')).toBe('COALESCE(x.discounted_unit_price, x.actual_unit_price)')
  })
})

describe('recording a purchase with a price after discount', () => {
  it("keeps both prices, and the discounted one is what the tolerance check judges (the user's example)", async () => {
    const { lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 42.5, discounted: 40 })
    const row = await purchaseRow(p.id)
    expect(Number(row.qty)).toBe(5)
    expect(Number(row.actual_unit_price)).toBe(42.5)
    expect(Number(row.discounted_unit_price)).toBe(40)
    // 42.50 alone would be over the 41 ceiling; 40 after the discount is exactly the approved price
    expect(row.over_tolerance).toBe(false)
  })

  it('still flags an over-tolerance price when there is no discount', async () => {
    const { lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 42.5 })
    const row = await purchaseRow(p.id)
    expect(row.discounted_unit_price).toBeNull()
    expect(row.over_tolerance).toBe(true)
  })

  it('flags a price after discount that is itself over tolerance', async () => {
    const { lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 45, discounted: 42 })
    expect((await purchaseRow(p.id)).over_tolerance).toBe(true)
  })

  it('refuses a price after discount that is higher than the quoted price, or zero, and records nothing', async () => {
    const { lines } = await reachBuying()
    await expect(record(lines[0]!, { price: 42.5, discounted: 43 })).rejects.toThrow(
      /cannot be higher than the price the vendor quoted/,
    )
    await expect(record(lines[0]!, { price: 42.5, discounted: 0 })).rejects.toThrow(/greater than 0/)
    expect(await purchaseCount(lines[0]!)).toBe(0)
  })

  it('the database itself refuses a discounted price above the quoted one', async () => {
    const { lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 42.5, discounted: 40 })
    await expect(
      pool.query(`UPDATE po_line_purchases SET discounted_unit_price=50 WHERE id=$1`, [p.id]),
    ).rejects.toThrow(/po_line_purchases_discounted_price_check/)
    await expect(
      pool.query(`UPDATE po_line_purchases SET discounted_unit_price=0 WHERE id=$1`, [p.id]),
    ).rejects.toThrow(/po_line_purchases_discounted_price_check/)
  })
})

describe('what the page reads', () => {
  it('returns both prices through the real schema, and the review totals count the price after the discount', async () => {
    const { reqId, lines } = await reachBuying()
    await record(lines[0]!, { price: 42.5, discounted: 40 })
    await record(lines[1]!, { price: 38, vendorId: vendorB })
    const res = await server.executeOperation(
      {
        query: `query($id: ID!) { requisition(id: $id) {
          status
          review { totals { currency_code was now purchases } }
          lines { line_number purchases { actual_unit_price discounted_unit_price } }
        } }`,
        variables: { id: reqId },
      },
      { contextValue: asAdmin('organizer') },
    )
    expect(res.body.kind).toBe('single')
    if (res.body.kind !== 'single') return
    expect(res.body.singleResult.errors).toBeUndefined()
    const data = res.body.singleResult.data as {
      requisition: {
        status: string
        review: { totals: { currency_code: string; was: string; now: string; purchases: number }[] }
        lines: { line_number: number; purchases: { actual_unit_price: string; discounted_unit_price: string | null }[] }[]
      }
    }
    expect(data.requisition.status).toBe('organizer_review')
    const [first, second] = data.requisition.lines
    expect(Number(first!.purchases[0]!.actual_unit_price)).toBe(42.5)
    expect(Number(first!.purchases[0]!.discounted_unit_price)).toBe(40)
    expect(second!.purchases[0]!.discounted_unit_price).toBeNull()
    const total = data.requisition.review.totals[0]!
    expect(total.currency_code).toBe('USD')
    // 5 x 40 (after the discount, not 5 x 42.50 = 212.50) + 5 x 38
    expect(Number(total.now)).toBeCloseTo(200 + 190, 4)
    expect(Number(total.was)).toBeCloseTo(200 + 190, 4)
  })
})

describe('the purchase orders', () => {
  it('are made from the price after the discount; the quoted price is not carried; a purchase without a discount is unchanged', async () => {
    const { reqId, lines } = await reachBuying()
    await record(lines[0]!, { price: 42.5, discounted: 40, vendorId: vendorA })
    await record(lines[1]!, { price: 38, vendorId: vendorB })
    await passReview(reqId, asAdmin('organizer'))
    const poLines = await pool.query<{
      vendor_id: string
      unit_price: string
      actual_unit_price: string
      total_price: string
      qty_ordered: string
    }>(
      `SELECT po.vendor_id, pl.unit_price, pl.actual_unit_price, pl.total_price, pl.qty_ordered
         FROM po_lines pl JOIN purchase_orders po ON po.id = pl.po_id
        WHERE po.requisition_id=$1`,
      [reqId],
    )
    expect(poLines.rows).toHaveLength(2)
    const byVendor = Object.fromEntries(poLines.rows.map((r) => [r.vendor_id, r]))
    const discounted = byVendor[vendorA]!
    expect(Number(discounted.unit_price)).toBe(40)
    expect(Number(discounted.actual_unit_price)).toBe(40)
    expect(Number(discounted.total_price)).toBeCloseTo(200, 4) // not 212.50
    const plain = byVendor[vendorB]!
    expect(Number(plain.unit_price)).toBe(38)
    expect(Number(plain.total_price)).toBeCloseTo(190, 4)

    const totals = await pool.query<{ vendor_id: string; total_amount: string }>(
      `SELECT vendor_id, total_amount FROM purchase_orders WHERE requisition_id=$1`,
      [reqId],
    )
    const poTotal = Object.fromEntries(totals.rows.map((r) => [r.vendor_id, Number(r.total_amount)]))
    expect(poTotal[vendorA]).toBeCloseTo(200, 4)
    expect(poTotal[vendorB]).toBeCloseTo(190, 4)
  })
})

describe('changing a purchase in the review', () => {
  it('adding a discount is a price change: it is judged again, remembered as "was", and needs a PO Admin', async () => {
    const { reqId, lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 42.5 })
    await record(lines[1]!, { price: 40, vendorId: vendorB })
    expect((await purchaseRow(p.id)).over_tolerance).toBe(true)
    // an over-tolerance purchase holds the requisition at Items Bought until someone else signs it off
    await M.approveTolerancePurchase(null, { purchaseId: p.id }, ctxFor('admin'))
    expect(await statusOf(reqId)).toBe('organizer_review')

    await M.editReviewPurchase(null, { purchaseId: p.id, discountedUnitPrice: 40 }, ctxFor('organizer'))
    const row = await purchaseRow(p.id)
    expect(Number(row.actual_unit_price)).toBe(42.5)
    expect(Number(row.discounted_unit_price)).toBe(40)
    expect(row.over_tolerance).toBe(false)
    expect(Number(row.review_original_price)).toBe(42.5) // what counted when the review began
    await expect(M.confirmReview(null, { requisitionId: reqId }, ctxFor('organizer'))).rejects.toThrow(/PO Admin/)
  })

  it('removing the discount puts the price back to the quoted one, and an edit back to the start is no change', async () => {
    const { reqId, lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 42.5, discounted: 40 })
    await record(lines[1]!, { price: 40, vendorId: vendorB })
    await M.editReviewPurchase(null, { purchaseId: p.id, qty: 4 }, ctxFor('organizer'))
    await M.editReviewPurchase(null, { purchaseId: p.id, discountedUnitPrice: null }, ctxFor('organizer'))
    let row = await purchaseRow(p.id)
    expect(row.discounted_unit_price).toBeNull()
    expect(row.over_tolerance).toBe(true) // 42.50 against a 41 ceiling
    // the price that counted when the review began was 40
    expect(Number(row.review_original_price)).toBe(40)
    // back to the start: quantity 5 and the same discount
    await M.editReviewPurchase(null, { purchaseId: p.id, qty: 5, discountedUnitPrice: 40 }, ctxFor('organizer'))
    row = await purchaseRow(p.id)
    expect(Number(row.discounted_unit_price)).toBe(40)
    expect(row.review_original_price).toBeNull()
    await M.confirmReview(null, { requisitionId: reqId }, ctxFor('organizer'))
  })

  it('a change to only the quoted price under an unchanged discount changes nothing that counts', async () => {
    const { reqId, lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 42.5, discounted: 40 })
    await record(lines[1]!, { price: 40, vendorId: vendorB })
    await M.editReviewPurchase(null, { purchaseId: p.id, actualUnitPrice: 43 }, ctxFor('organizer'))
    const row = await purchaseRow(p.id)
    expect(Number(row.actual_unit_price)).toBe(43)
    expect(Number(row.discounted_unit_price)).toBe(40)
    expect(row.review_original_price).toBeNull()
    // nothing that counts was changed, so the organizer can still just confirm
    await M.confirmReview(null, { requisitionId: reqId }, ctxFor('organizer'))
  })

  it('refuses a discount above the quoted price, or a quoted price below the discount, and changes nothing', async () => {
    const { lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 42.5, discounted: 40 })
    await record(lines[1]!, { price: 40, vendorId: vendorB })
    await expect(
      M.editReviewPurchase(null, { purchaseId: p.id, discountedUnitPrice: 50 }, ctxFor('organizer')),
    ).rejects.toThrow(/cannot be higher than the price the vendor quoted/)
    await expect(
      M.editReviewPurchase(null, { purchaseId: p.id, actualUnitPrice: 39 }, ctxFor('organizer')),
    ).rejects.toThrow(/cannot be higher than the price the vendor quoted/)
    const row = await purchaseRow(p.id)
    expect(Number(row.actual_unit_price)).toBe(42.5)
    expect(Number(row.discounted_unit_price)).toBe(40)
  })

  it('says "nothing to change" for the values it already has, and asks for something when nothing is given', async () => {
    const { lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 42.5, discounted: 40 })
    await record(lines[1]!, { price: 40, vendorId: vendorB })
    await expect(
      M.editReviewPurchase(null, { purchaseId: p.id, discountedUnitPrice: 40 }, ctxFor('organizer')),
    ).rejects.toThrow(/nothing to change/)
    await expect(M.editReviewPurchase(null, { purchaseId: p.id }, ctxFor('organizer'))).rejects.toThrow(
      /price after discount/,
    )
  })

  it('the discount argument is in the real schema, and null removes it', async () => {
    const { lines } = await reachBuying()
    const p = await record(lines[0]!, { price: 42.5, discounted: 40 })
    await record(lines[1]!, { price: 40, vendorId: vendorB })
    const mutation = `mutation($id: ID!, $d: Float) { editReviewPurchase(purchaseId: $id, discountedUnitPrice: $d) { id actual_unit_price discounted_unit_price } }`
    const res = await server.executeOperation(
      { query: mutation, variables: { id: p.id, d: null } },
      { contextValue: ctxFor('organizer') },
    )
    if (res.body.kind !== 'single') throw new Error('unexpected response')
    expect(res.body.singleResult.errors).toBeUndefined()
    const out = (res.body.singleResult.data as { editReviewPurchase: { discounted_unit_price: string | null } })
      .editReviewPurchase
    expect(out.discounted_unit_price).toBeNull()
  })
})

describe('an item added in the review', () => {
  it('takes the price after the discount as its line price and approved price, and keeps both on the purchase', async () => {
    const { reqId, lines } = await reachBuying()
    await record(lines[0]!, { price: 40 })
    await record(lines[1]!, { price: 40, vendorId: vendorB })
    await M.addReviewLine(
      null,
      {
        input: {
          requisitionId: reqId,
          description: 'Forgotten bolts',
          qty: 4,
          uom: 'box',
          vendorId: vendorA,
          actualUnitPrice: 7.25,
          discountedUnitPrice: 6,
          currencyCode: 'USD',
          receiptFileId: await makeReceipt(),
        },
      },
      ctxFor('organizer'),
    )
    const line = (
      await pool.query<{ id: string; unit_price: string; approved_unit_price: string; total_price: string }>(
        `SELECT id, unit_price, approved_unit_price, total_price FROM po_lines WHERE requisition_id=$1 AND review_added_at IS NOT NULL`,
        [reqId],
      )
    ).rows[0]!
    expect(Number(line.unit_price)).toBe(6)
    expect(Number(line.approved_unit_price)).toBe(6)
    expect(Number(line.total_price)).toBeCloseTo(24, 4)
    const purchase = (
      await pool.query<{ actual_unit_price: string; discounted_unit_price: string | null; over_tolerance: boolean }>(
        `SELECT actual_unit_price, discounted_unit_price, over_tolerance FROM po_line_purchases WHERE po_line_id=$1`,
        [line.id],
      )
    ).rows[0]!
    expect(Number(purchase.actual_unit_price)).toBe(7.25)
    expect(Number(purchase.discounted_unit_price)).toBe(6)
    expect(purchase.over_tolerance).toBe(false)
    const note = (
      await pool.query<{ notes: string }>(
        `SELECT notes FROM requisition_approval_log WHERE requisition_id=$1 AND action='review_line_added'`,
        [reqId],
      )
    ).rows[0]!.notes
    expect(note).toMatch(/4 × 6 USD/)
    expect(note).toMatch(/quoted 7.25, after discount 6/)
  })

  it('refuses a discount above the quoted price and adds nothing', async () => {
    const { reqId, lines } = await reachBuying()
    await record(lines[0]!, { price: 40 })
    await record(lines[1]!, { price: 40, vendorId: vendorB })
    await expect(
      M.addReviewLine(
        null,
        {
          input: {
            requisitionId: reqId,
            description: 'Forgotten bolts',
            qty: 4,
            vendorId: vendorA,
            actualUnitPrice: 7.25,
            discountedUnitPrice: 9,
            currencyCode: 'USD',
            receiptFileId: await makeReceipt(),
          },
        },
        ctxFor('organizer'),
      ),
    ).rejects.toThrow(/cannot be higher than the price the vendor quoted/)
    const count = await pool.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM po_lines WHERE requisition_id=$1 AND review_added_at IS NOT NULL`,
      [reqId],
    )
    expect(Number(count.rows[0]!.c)).toBe(0)
  })
})

describe('a line removed in the review', () => {
  it('keeps the price that counted for what was bought on it, and the review totals still read it as "was"', async () => {
    const { reqId, lines } = await reachBuying()
    await record(lines[0]!, { price: 42.5, discounted: 40 })
    await record(lines[1]!, { price: 38, vendorId: vendorB })
    await M.removeReviewLine(
      null,
      { requisitionId: reqId, lineId: lines[0]!, reason: 'Not needed' },
      ctxFor('organizer'),
    )
    const kept = await pool.query<{ purchases: { price: string; qty: string; currency: string }[] }>(
      `SELECT purchases FROM requisition_review_removed_lines WHERE requisition_id=$1`,
      [reqId],
    )
    expect(kept.rows).toHaveLength(1)
    const purchase = kept.rows[0]!.purchases[0]!
    // what counted (40), not what the vendor quoted (42.5)
    expect(Number(purchase.price)).toBe(40)
    expect(Number(purchase.qty)).toBe(5)
    const res = await server.executeOperation(
      {
        query: `query($id: ID!) { requisition(id: $id) { review { totals { currency_code was now } } } }`,
        variables: { id: reqId },
      },
      { contextValue: asAdmin('organizer') },
    )
    if (res.body.kind !== 'single') throw new Error('unexpected response')
    expect(res.body.singleResult.errors).toBeUndefined()
    const total = (
      res.body.singleResult.data as {
        requisition: { review: { totals: { currency_code: string; was: string; now: string }[] } }
      }
    ).requisition.review.totals[0]!
    // was: the removed 5 x 40 plus the kept 5 x 38; now: only the kept line
    expect(Number(total.was)).toBeCloseTo(200 + 190, 4)
    expect(Number(total.now)).toBeCloseTo(190, 4)
  })
})

describe('the requisition read for the page keeps working', () => {
  it('Q.requisition returns the purchase with its discounted price for the organizer', async () => {
    const { reqId, lines } = await reachBuying()
    await record(lines[0]!, { price: 42.5, discounted: 40 })
    const seen = (await Q.requisition(null, { id: reqId }, asAdmin('organizer'))) as {
      lines: { purchases: { discounted_unit_price: string | null }[] }[]
    }
    expect(Number(seen.lines[0]!.purchases[0]!.discounted_unit_price)).toBe(40)
  })
})
