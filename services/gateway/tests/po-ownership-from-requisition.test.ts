// A purchase order forked from a requisition continues the requisition's ownership: created_by is the organizer,
// not whoever triggered Finish Buying (250 of 297 requisition-linked POs on production named that person), and
// the backfill that fixes the rows already there. Real Postgres, nothing mocked, in an isolated company.
//
// Fixtures run the real flow (create requisition, inventory check, pricing, approval, record purchase, finish
// buying) with TWO users: the organizer raises it, a different user buys and finishes. The old state the backfill
// repairs cannot be produced by the old code any more, so it is made by writing created_by back with SQL.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { backfillPoOwnership, planOwnership } from '../src/scripts/backfill-po-ownership.js'

const NAME_PREFIX = 'POOWN-TEST-'
const TEST_EMAIL = (key: string) => `poown-test-${key}@fnc-erp.local`

let companyId: string
let otherCompanyId: string
let organizerId: string // raises the requisition, owns it
let finisherId: string // buys the lines and finishes the buying
let thirdId: string // somebody else entirely
let seq = 0

const ctxFor = (userId: string, role = 'system_admin', company = companyId) =>
  ({ auth: { companyId: company, userId, role, module: 'all', sessionId: 'poown-test' } }) as never

async function makeUser(key: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_EMAIL(key)],
  )
  return r.rows[0]!.id
}

async function makeCompany(label: string): Promise<string> {
  const co = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${label}-${Date.now()}`],
  )
  const id = co.rows[0]!.id
  for (const uid of [organizerId, finisherId, thirdId]) {
    await pool.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
      [uid, id],
    )
  }
  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'IQD',5,1000,true) ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=1000`,
    [id],
  )
  await pool.query(`INSERT INTO vendors (company_id, name) VALUES ($1,$2)`, [id, `${NAME_PREFIX}VENDOR-${Date.now()}`])
  return id
}

async function makeUploadedFile(company: string, by: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [company, by, `poown-test-${Date.now()}-${++seq}`],
  )
  return r.rows[0]!.id
}

interface Forked {
  reqId: string
  poId: string
  lineId: string
}

// The real flow up to and including the fork. The organizer raises and approves the requisition; the finisher
// records the purchase (which finishes the buying by itself, as in production).
async function forkRequisition(
  opts: { company?: string; organizerNull?: boolean; finisher?: string } = {},
): Promise<Forked> {
  const company = opts.company ?? companyId
  const finisher = opts.finisher ?? finisherId
  const code = `${NAME_PREFIX}PRJ-${Date.now()}-${++seq}`
  const project = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
    [company, code, organizerId],
  )
  const product = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [company, `${NAME_PREFIX}SKU-${Date.now()}-${++seq}`],
  )
  const octx = ctxFor(organizerId, 'system_admin', company)
  const created = (await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: 'project',
        project_id: project.rows[0]!.id,
        delivery_destination: 'jobsite',
        lines: [{ product_id: product.rows[0]!.id, description: 'x', qty: 5, unit_price: 1 }],
      },
    },
    octx,
  )) as { id: string }
  const reqId = created.id
  const lineId = (await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])).rows[0]!.id

  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, octx)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(null, { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 0 }] }, octx)
  await resolvers.Mutation.submitRequisitionMarketPricing(null, { id: reqId, linePrices: [{ lineId, marketPrice: 20, currencyCode: 'IQD' }] }, octx)
  await resolvers.Mutation.verifyRequisitionPrices(null, { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 20 }] }, octx)
  await resolvers.Mutation.approveRequisition(null, { id: reqId }, octx)
  if (opts.organizerNull) await pool.query(`UPDATE requisitions SET organizer_id=NULL WHERE id=$1`, [reqId])

  const vendorId = (await pool.query<{ id: string }>(`SELECT id FROM vendors WHERE company_id=$1 LIMIT 1`, [company])).rows[0]!.id
  const receiptFileId = await makeUploadedFile(company, finisher)
  await resolvers.Mutation.recordLinePurchase(
    null,
    { input: { lineId, vendorId, qty: 5, actualUnitPrice: 20, currencyCode: 'IQD', receiptFileId } },
    ctxFor(finisher, 'system_admin', company),
  )
  // the buying finished by itself; the button is the fallback and must change nothing now
  await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctxFor(finisher, 'system_admin', company))

  const poId = (await pool.query<{ po_id: string }>(`SELECT po_id FROM po_lines WHERE id=$1`, [lineId])).rows[0]!.po_id
  return { reqId, poId, lineId }
}

interface PoOwner {
  created_by: string
  organizer_id: string | null
}
const owner = async (poId: string): Promise<PoOwner> =>
  (await pool.query<PoOwner>(`SELECT created_by, organizer_id FROM purchase_orders WHERE id=$1`, [poId])).rows[0]!

async function cleanup(): Promise<void> {
  // Every company this test ever made (found by name), so a run that died half way cannot poison the next one.
  const companies = (await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name LIKE $1`, [`${NAME_PREFIX}%`])).rows.map((r) => r.id)
  // po_line_purchases.receipt_attachment_id points AT document_attachments (playbook #21): purchases of BOTH
  // companies go before any attachment does.
  for (const co of companies) {
    const reqs = `SELECT id FROM requisitions WHERE company_id=$1`
    const pos = `SELECT id FROM purchase_orders WHERE company_id=$1`
    await pool.query(`DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id IN (${pos}) OR requisition_id IN (${reqs}))`, [co])
  }
  await pool.query(`DELETE FROM document_attachments WHERE entity_type='po_line_purchase' AND uploaded_by IN (SELECT id FROM users WHERE email LIKE 'poown-test-%')`)
  for (const co of companies) {
    const reqs = `SELECT id FROM requisitions WHERE company_id=$1`
    const pos = `SELECT id FROM purchase_orders WHERE company_id=$1`
    await pool.query(`DELETE FROM audit_log WHERE company_id=$1 AND action='backfill_po_ownership'`, [co])
    await pool.query(`DELETE FROM files WHERE company_id=$1`, [co])
    await pool.query(`DELETE FROM po_edit_requests WHERE po_id IN (${pos})`, [co])
    await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, [co])
    await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${reqs})`, [co])
    await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, [co])
    await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos}) OR requisition_id IN (${reqs})`, [co])
    await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [co])
    await pool.query(`DELETE FROM requisitions WHERE company_id=$1`, [co])
    await pool.query(`DELETE FROM projects WHERE company_id=$1`, [co])
    await pool.query(`DELETE FROM products WHERE company_id=$1`, [co])
    await pool.query(`DELETE FROM vendors WHERE company_id=$1`, [co])
    await pool.query(`DELETE FROM company_price_tolerance WHERE company_id=$1`, [co])
    await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [co])
    await pool.query(`DELETE FROM companies WHERE id=$1`, [co])
  }
}

beforeAll(async () => {
  organizerId = await makeUser('organizer')
  finisherId = await makeUser('finisher')
  thirdId = await makeUser('third')
  await cleanup()
  companyId = await makeCompany('A')
  otherCompanyId = await makeCompany('B')
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE 'poown-test-%'`).catch(() => undefined)
  await pool.end()
})

describe('the forked PO continues the requisition ownership', () => {
  it('created_by and organizer_id are both the requisition organizer, not the user who finished the buying', async () => {
    const f = await forkRequisition()
    expect(await owner(f.poId)).toEqual({ created_by: organizerId, organizer_id: organizerId })
  })

  it('still records who finished the buying, in the requisition log', async () => {
    const f = await forkRequisition()
    const log = await pool.query<{ actor_id: string }>(
      `SELECT actor_id FROM requisition_approval_log WHERE requisition_id=$1 AND action='finish_buying'`,
      [f.reqId],
    )
    expect(log.rows.map((r) => r.actor_id)).toEqual([finisherId])
  })

  it('falls back to the user who finished only when the requisition has no organizer (created_by is NOT NULL)', async () => {
    const f = await forkRequisition({ organizerNull: true })
    expect(await owner(f.poId)).toEqual({ created_by: finisherId, organizer_id: null })
  })

  it('the organizer, as a plain user with no admin role, can raise an edit request on the PO (the gate reads created_by)', async () => {
    const f = await forkRequisition()
    const req = (await resolvers.Mutation.submitPOEditRequest(
      null,
      {
        id: f.poId,
        changes: JSON.stringify({ lines: { edited: [{ id: f.lineId, field: 'unit_price', from: 20, to: 25 }] } }),
      } as never,
      ctxFor(organizerId, 'user'),
    )) as { id: string; status: string }
    expect(req.id).toBeTruthy()
  })
})

describe('backfill-po-ownership', () => {
  // The old fork wrote the finisher into created_by. Put that back.
  const ageToOld = (poId: string, by = finisherId) => pool.query(`UPDATE purchase_orders SET created_by=$2 WHERE id=$1`, [poId, by])
  const run = (extra: { company?: string } = {}) =>
    backfillPoOwnership({ apply: true, actorEmail: TEST_EMAIL('organizer'), company: extra.company ?? companyId })
  const mine = (plan: Awaited<ReturnType<typeof planOwnership>>, poId: string) => plan.change.filter((c) => c.po_id === poId)

  beforeEach(async () => {
    await pool.query(`DELETE FROM audit_log WHERE company_id = ANY($1::uuid[]) AND action='backfill_po_ownership'`, [[companyId, otherCompanyId]])
  })

  it('lists a PO whose created_by is the finisher, and changes it to the organizer', async () => {
    const f = await forkRequisition()
    await ageToOld(f.poId)
    const plan = await planOwnership(pool, companyId)
    expect(mine(plan, f.poId)).toHaveLength(1)
    expect(mine(plan, f.poId)[0]).toMatchObject({ old_created_by: finisherId, new_created_by: organizerId })

    await run()
    expect(await owner(f.poId)).toEqual({ created_by: organizerId, organizer_id: organizerId })
  })

  it('never touches organizer_id', async () => {
    const f = await forkRequisition()
    await ageToOld(f.poId)
    await run()
    expect((await owner(f.poId)).organizer_id).toBe(organizerId)
  })

  it('records the old and new created_by of every changed PO in audit_log, under the administrator', async () => {
    const f = await forkRequisition()
    await ageToOld(f.poId)
    await run()
    const rows = await pool.query<{ user_id: string; old_values: { created_by: string }; new_values: { created_by: string } }>(
      `SELECT user_id, old_values, new_values FROM audit_log WHERE action='backfill_po_ownership' AND record_id=$1`,
      [f.poId],
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toMatchObject({
      user_id: organizerId,
      old_values: { created_by: finisherId },
      new_values: { created_by: organizerId },
    })
  })

  it('leaves a PO that already has the organizer, and is a no-op the second time', async () => {
    const f = await forkRequisition()
    expect(mine(await planOwnership(pool, companyId), f.poId)).toHaveLength(0)
    await ageToOld(f.poId)
    await run()
    const audit = async () =>
      parseInt((await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM audit_log WHERE action='backfill_po_ownership' AND record_id=$1`, [f.poId])).rows[0]!.n)
    expect(await audit()).toBe(1)
    await run()
    expect(await audit()).toBe(1)
    expect((await owner(f.poId)).created_by).toBe(organizerId)
  })

  it('does not list, and does not fail on, a PO whose organizer also finished the buying himself (already right)', async () => {
    const own = await forkRequisition({ finisher: organizerId })
    const stale = await forkRequisition()
    await ageToOld(stale.poId)
    expect(await owner(own.poId)).toEqual({ created_by: organizerId, organizer_id: organizerId })
    expect(mine(await planOwnership(pool, companyId), own.poId)).toHaveLength(0)
    await run() // a listed no-op would make the guarded UPDATE count differ and this throw
    expect((await owner(own.poId)).created_by).toBe(organizerId)
    expect((await owner(stale.poId)).created_by).toBe(organizerId)
  })

  it('leaves a PO whose created_by is somebody who never finished that requisition (not what the fork wrote)', async () => {
    const f = await forkRequisition()
    await ageToOld(f.poId, thirdId)
    expect(mine(await planOwnership(pool, companyId), f.poId)).toHaveLength(0)
    await run()
    expect((await owner(f.poId)).created_by).toBe(thirdId)
    expect((await planOwnership(pool, companyId)).notAFinisher).toBeGreaterThan(0)
  })

  it('leaves a PO of a requisition with no organizer, and counts it', async () => {
    const f = await forkRequisition({ organizerNull: true })
    expect(mine(await planOwnership(pool, companyId), f.poId)).toHaveLength(0)
    await run()
    expect((await owner(f.poId)).created_by).toBe(finisherId)
    expect((await planOwnership(pool, companyId)).noOrganizer).toBeGreaterThan(0)
  })

  it('only changes the company it is scoped to, by id or by name (any case)', async () => {
    const a = await forkRequisition()
    const b = await forkRequisition({ company: otherCompanyId })
    await ageToOld(a.poId)
    await ageToOld(b.poId)

    await run({ company: otherCompanyId })
    expect((await owner(b.poId)).created_by).toBe(organizerId)
    expect((await owner(a.poId)).created_by).toBe(finisherId) // the other company is untouched

    const name = (await pool.query<{ name: string }>(`SELECT name FROM companies WHERE id=$1`, [companyId])).rows[0]!.name
    const byName = await planOwnership(pool, name.toUpperCase())
    expect(mine(byName, a.poId)).toHaveLength(1)
    expect(mine(byName, b.poId)).toHaveLength(0)
    expect((await planOwnership(pool, '00000000-0000-0000-0000-00000000dead')).change).toHaveLength(0)
  })

  it('a dry run writes nothing', async () => {
    const f = await forkRequisition()
    await ageToOld(f.poId)
    const report = await backfillPoOwnership({ apply: false, company: companyId })
    expect(report.applied).toBe(false)
    expect(mine(report.plan, f.poId)).toHaveLength(1)
    expect((await owner(f.poId)).created_by).toBe(finisherId)
    const n = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM audit_log WHERE action='backfill_po_ownership' AND record_id=$1`, [f.poId])
    expect(n.rows[0]!.n).toBe('0')
  })

  it('refuses --apply without an actor, or with an unknown one, and changes nothing', async () => {
    const f = await forkRequisition()
    await ageToOld(f.poId)
    await expect(backfillPoOwnership({ apply: true, company: companyId })).rejects.toThrow(/--actor-email/)
    await expect(backfillPoOwnership({ apply: true, company: companyId, actorEmail: 'nobody@fnc-erp.local' })).rejects.toThrow(/No user with the email/)
    expect((await owner(f.poId)).created_by).toBe(finisherId)
  })
})
