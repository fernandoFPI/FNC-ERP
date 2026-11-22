// Direct supply: a requisition purpose that is always tied to a project and skips inventory check and every
// pricing step: draft > pending approval > items bought > sourcing > completed. The Est. Unit Price typed at
// creation is the price the approver sees and, once approved, the ceiling Items Bought judges purchases against.
//
// Real Postgres, real mutations (createRequisition, submitRequisitionDirectSupply, approveRequisition,
// recordLinePurchase, finishBuyingRequisition, closeRequisitionLine, ...) and the real schema for the one query that
// runs through ApolloServer; nothing mocked. One user per role: the organizer (a plain user), an admin, a stranger
// (a plain user who organizes nothing) and an admin of another company.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { passReview } from './review-helpers.js'
import {
  DIRECT_SUPPLY_DESTINATION,
  childPurchaseOrderPurpose,
  directSupplyCreateProblem,
  directSupplySubmitProblem,
  isDirectSupply,
} from '../src/lib/directSupply.js'

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const OTHER_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const EMAIL_PREFIX = 'direct-supply-test-'
const CODE_PREFIX = 'DSTEST-'
const VENDOR_PREFIX = 'DSTEST-VENDOR-'
const FILE_PREFIX = 'dstest/'

type Who = 'organizer' | 'admin' | 'admin2' | 'stranger'
const WHO: Who[] = ['organizer', 'admin', 'admin2', 'stranger']
const userIds = {} as Record<Who, string>
let projectId: string
let otherCompanyProjectId: string
let costCenterId: string
let vendorId: string
let companyRequiresJobsite = false
let toleranceBefore: { tolerance_pct: string; tolerance_abs: string; is_provisional: boolean } | null = null

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const ctxFor = (who: Who, companyId = COMPANY_ID, role?: string): TestCtx => ({
  auth: {
    companyId,
    userId: userIds[who],
    role: role ?? (who === 'admin' || who === 'admin2' ? 'system_admin' : 'user'),
    module: 'all',
    sessionId: 'ds-test',
  },
})
// The organizer is a plain user, but creating a requisition needs a permission a plain user in this fixture lacks:
// create as an administrator ACTING with the organizer's user id, so organizer_id is the organizer, then act as him.
const createCtx = (): TestCtx => ctxFor('organizer', COMPANY_ID, 'system_admin')

const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

interface LineIn {
  description?: string
  qty?: number
  unit_price?: number
  currency?: string | null
}

function lineInput(l: LineIn, i: number) {
  return {
    description: l.description ?? `Item ${i + 1}`,
    qty: l.qty ?? 10,
    unit_price: l.unit_price ?? 12.5,
    uom: 'pc',
    // null means "leave it out", to prove the server refuses a line with no currency
    requested_currency_code: l.currency === null ? undefined : (l.currency ?? 'USD'),
  }
}

async function createDirect(
  lines: LineIn[] = [{}],
  extra: Record<string, unknown> = {},
  ctx: TestCtx = createCtx(),
): Promise<{ id: string; status: string; purpose: string; delivery_destination: string | null }> {
  return (await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: 'direct_supply',
        project_id: projectId,
        lines: lines.map(lineInput),
        ...extra,
      },
    },
    ctx as never,
  )) as never
}

const submitDirect = (id: string, who: Who = 'organizer', companyId = COMPANY_ID, role?: string) =>
  resolvers.Mutation.submitRequisitionDirectSupply(null, { id }, ctxFor(who, companyId, role) as never) as Promise<{
    id: string
    status: string
  }>
const approve = (id: string) =>
  resolvers.Mutation.approveRequisition(null, { id }, ctxFor('admin') as never) as Promise<{ id: string; status: string }>

async function statusOf(id: string): Promise<string> {
  return (await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [id])).rows[0]!.status
}
async function lineIds(id: string): Promise<string[]> {
  return (
    await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`, [id])
  ).rows.map((r) => r.id)
}
// The actions in the order they were taken. Rows written by one mutation share a transaction timestamp (approve and
// start_buying are one transaction), so order by what the row says it moved from and to, never by created_at.
const STATUS_RANK = ['draft', 'pending_approval', 'approved', 'items_bought', 'sourcing', 'completed']
async function logActions(id: string): Promise<string[]> {
  const rows = (
    await pool.query<{ action: string; from_status: string; created_at: string }>(
      `SELECT action, from_status, created_at FROM requisition_approval_log WHERE requisition_id=$1`,
      [id],
    )
  ).rows
  return rows
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) ||
        STATUS_RANK.indexOf(a.from_status) - STATUS_RANK.indexOf(b.from_status),
    )
    .map((r) => r.action)
}

// The approver notices a submit sends, as outbox rows. The notifier is fire-and-forget and inserts one row per recipient,
// one await after another, so wait until the count stops changing rather than until the first row appears
// (playbook #35); a refused submit sends none, so an empty list is a valid, immediate answer when `expectSome` is off.
async function approvalNotices(id: string, expectSome = true): Promise<{ payload: Record<string, unknown> }[]> {
  const read = async () =>
    (
      await pool.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM service_outbox WHERE event_type='REQ_APPROVAL_REQUIRED' AND payload->>'requisitionId'=$1`,
        [id],
      )
    ).rows
  if (!expectSome) return read()
  let last = -1
  for (let i = 0; i < 40; i++) {
    const rows = await read()
    if (rows.length > 0 && rows.length === last) return rows
    last = rows.length
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('no approval notice was written')
}

async function makeReceipt(): Promise<string> {
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [COMPANY_ID, userIds.admin, `${FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
  )
  return f.rows[0]!.id
}

async function buy(lineId: string, qty: number, price: number, currencyCode = 'USD') {
  return (await resolvers.Mutation.recordLinePurchase(
    null,
    { input: { lineId, vendorId, qty, actualUnitPrice: price, currencyCode, receiptFileId: await makeReceipt() } },
    ctxFor('admin') as never,
  )) as { id: string; over_tolerance: boolean }
}

async function cleanup(): Promise<void> {
  const reqs = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`
  const params = [COMPANY_ID, `${EMAIL_PREFIX}%`]
  await pool.query(`DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE requisition_id IN (${reqs}) OR po_id IN (SELECT id FROM purchase_orders WHERE requisition_id IN (${reqs})))`, params)
  await pool.query(`DELETE FROM document_attachments WHERE file_id IN (SELECT id FROM files WHERE file_key LIKE $1)`, [`${FILE_PREFIX}%`])
  await pool.query(`DELETE FROM files WHERE file_key LIKE $1`, [`${FILE_PREFIX}%`])
  await pool.query(
    `DELETE FROM service_outbox WHERE event_type='REQ_APPROVAL_REQUIRED' AND payload->>'requisitionId' IN (SELECT id::text FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2))`,
    params,
  )
  await pool.query(`DELETE FROM po_edit_requests WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE requisition_id IN (${reqs}))`, params)
  await pool.query(`DELETE FROM purchase_orders WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`, params)
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM cost_centers WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
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
  costCenterId = (
    await pool.query<{ id: string }>(
      `INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'Direct supply test','project') RETURNING id`,
      [COMPANY_ID, `${CODE_PREFIX}CC`],
    )
  ).rows[0]!.id
  projectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, cost_center_id, created_by)
       VALUES ($1,$2,'Direct supply test project','approved',$3,$4) RETURNING id`,
      [COMPANY_ID, `${CODE_PREFIX}A`, costCenterId, userIds.admin],
    )
  ).rows[0]!.id
  otherCompanyProjectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, created_by)
       VALUES ($1,$2,'Other company project','approved',$3) RETURNING id`,
      [OTHER_COMPANY_ID, `${CODE_PREFIX}B`, userIds.admin],
    )
  ).rows[0]!.id
  vendorId = (
    await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
      COMPANY_ID,
      `${VENDOR_PREFIX}${Date.now()}`,
    ])
  ).rows[0]!.id
  companyRequiresJobsite =
    (await pool.query<{ r: boolean }>(`SELECT requires_jobsite_delivery AS r FROM companies WHERE id=$1`, [COMPANY_ID]))
      .rows[0]?.r ?? false

  // 5% or 1 USD, whichever is less, so an estimate of 12.50 tolerates up to 13.125 and no more.
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

describe('the rules in lib/directSupply.ts', () => {
  it('knows only its own purpose', () => {
    expect(isDirectSupply('direct_supply')).toBe(true)
    for (const p of ['project', 'stock', 'manufacturing', 'expense', 'advance', '', null, undefined])
      expect(isDirectSupply(p)).toBe(false)
  })

  it('forks its purchase orders as project POs, and leaves every other purpose alone', () => {
    expect(childPurchaseOrderPurpose('direct_supply')).toBe('project')
    expect(childPurchaseOrderPurpose('project')).toBe('project')
    expect(childPurchaseOrderPurpose('manufacturing')).toBe('manufacturing')
    expect(childPurchaseOrderPurpose('stock')).toBe('stock')
    expect(childPurchaseOrderPurpose(null)).toBe('stock')
  })

  it('is always delivered to the jobsite', () => {
    expect(DIRECT_SUPPLY_DESTINATION).toBe('jobsite')
  })

  it('wants a project and a currency on every line to be created', () => {
    expect(directSupplyCreateProblem({ project_id: 'p', lines: [{ requested_currency_code: 'USD' }] })).toBeNull()
    expect(directSupplyCreateProblem({ project_id: null, lines: [{ requested_currency_code: 'USD' }] })).toMatch(/project/)
    expect(directSupplyCreateProblem({ project_id: '', lines: [{ requested_currency_code: 'USD' }] })).toMatch(/project/)
    expect(
      directSupplyCreateProblem({ project_id: 'p', lines: [{ requested_currency_code: 'USD' }, {}] }),
    ).toBe('Choose a currency for line 2')
    expect(directSupplyCreateProblem({ project_id: 'p', lines: [{ requested_currency_code: '  ' }] })).toMatch(/line 1/)
  })

  it('wants a quantity and a price above zero on every line to be submitted, and names the line', () => {
    const req = { purpose: 'direct_supply', project_id: 'p' }
    const ok = { description: 'Pipe', qty_ordered: '2.0000', unit_price: '5.0000' }
    expect(directSupplySubmitProblem(req, [ok])).toBeNull()
    expect(directSupplySubmitProblem(req, [ok, { ...ok, description: 'Valve', unit_price: '0.0000' }])).toBe(
      'Line 2 (Valve) needs an estimated unit price above zero',
    )
    expect(directSupplySubmitProblem(req, [{ ...ok, qty_ordered: 0 }])).toBe('Line 1 (Pipe) needs a quantity above zero')
    expect(directSupplySubmitProblem(req, [{ description: null, qty_ordered: 1, unit_price: 0 }])).toBe(
      'Line 1 needs an estimated unit price above zero',
    )
    expect(directSupplySubmitProblem(req, [])).toMatch(/at least one line/)
    expect(directSupplySubmitProblem({ ...req, purpose: 'project' }, [ok])).toMatch(/Only a direct supply/)
    expect(directSupplySubmitProblem({ ...req, project_id: null }, [ok])).toMatch(/project/)
  })
})

describe('creating a direct supply requisition', () => {
  it('is a draft tied to the project, delivered to the jobsite, with the typed price and currency on its lines', async () => {
    const created = await createDirect([{ unit_price: 12.5, currency: 'USD', qty: 4 }])
    expect(created).toMatchObject({ status: 'draft', purpose: 'direct_supply', delivery_destination: 'jobsite' })
    const row = await pool.query(
      `SELECT project_id, organizer_id, delivery_destination FROM requisitions WHERE id=$1`,
      [created.id],
    )
    expect(row.rows[0]).toMatchObject({
      project_id: projectId,
      organizer_id: userIds.organizer,
      delivery_destination: 'jobsite',
    })
    const line = await pool.query(
      `SELECT unit_price, total_price, currency_code, requested_currency_code, qty_from_stock, cost_center_id
         FROM po_lines WHERE requisition_id=$1`,
      [created.id],
    )
    expect(Number(line.rows[0].unit_price)).toBe(12.5)
    expect(Number(line.rows[0].total_price)).toBe(50)
    expect(line.rows[0].currency_code).toBe('USD')
    expect(line.rows[0].requested_currency_code).toBe('USD')
    expect(Number(line.rows[0].qty_from_stock)).toBe(0)
    // The project's own cost center, as Project Supply does.
    expect(line.rows[0].cost_center_id).toBe(costCenterId)
  })

  it('keeps the destination at jobsite whatever the form sent', async () => {
    const created = await createDirect([{}], { delivery_destination: 'inventory' })
    expect(created.delivery_destination).toBe('jobsite')
  })

  it('keeps each line in its own currency', async () => {
    const created = await createDirect([{ currency: 'USD' }, { currency: 'EUR' }])
    const lines = await pool.query<{ currency_code: string }>(
      `SELECT currency_code FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`,
      [created.id],
    )
    expect(lines.rows.map((l) => l.currency_code)).toEqual(['USD', 'EUR'])
  })

  it('refuses one with no project', async () => {
    await expect(createDirect([{}], { project_id: undefined })).rejects.toThrow('must be tied to a project')
  })

  it('refuses a line with no currency, never storing it as IQD', async () => {
    await expect(createDirect([{ currency: 'USD' }, { currency: null }])).rejects.toThrow('Choose a currency for line 2')
  })

  it("refuses another company's project", async () => {
    await expect(createDirect([{}], { project_id: otherCompanyProjectId })).rejects.toThrow('Project not found')
  })

  it('leaves the other purposes as they were', async () => {
    const stock = (await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ description: 'x', qty: 1, unit_price: 1 }] } },
      createCtx() as never,
    )) as { id: string; delivery_destination: string | null }
    expect(stock.delivery_destination).toBeNull()

    const project = (await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'project',
          project_id: projectId,
          delivery_destination: 'inventory',
          lines: [{ description: 'x', qty: 1, unit_price: 1 }],
        },
      },
      createCtx() as never,
    )) as { id: string; delivery_destination: string | null }
    expect(project.delivery_destination).toBe(companyRequiresJobsite ? 'jobsite' : 'inventory')
  })
})

describe('submitting for approval', () => {
  it('goes straight from draft to pending approval and says so in the log', async () => {
    const { id } = await createDirect()
    const result = await submitDirect(id)
    expect(result.status).toBe('pending_approval')
    expect(await statusOf(id)).toBe('pending_approval')
    expect(await logActions(id)).toEqual(['submit_direct_supply'])
    const log = await pool.query(`SELECT from_status, to_status, actor_id FROM requisition_approval_log WHERE requisition_id=$1`, [id])
    expect(log.rows[0]).toMatchObject({ from_status: 'draft', to_status: 'pending_approval', actor_id: userIds.organizer })
  })

  it('can be submitted by an administrator who is not the organizer', async () => {
    const { id } = await createDirect()
    expect((await submitDirect(id, 'admin')).status).toBe('pending_approval')
  })

  it('is refused to someone who is neither the organizer nor an administrator', async () => {
    const { id } = await createDirect()
    await expect(submitDirect(id, 'stranger')).rejects.toThrow('Only the requisition organizer or an admin')
    expect(await statusOf(id)).toBe('draft')
  })

  it("is refused to an administrator of another company: the requisition is not theirs to see", async () => {
    const { id } = await createDirect()
    await expect(submitDirect(id, 'admin', OTHER_COMPANY_ID)).rejects.toThrow('Requisition not found')
    expect(await statusOf(id)).toBe('draft')
  })

  it('is refused for a requisition of another purpose', async () => {
    const stock = (await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ description: 'x', qty: 1, unit_price: 5 }] } },
      createCtx() as never,
    )) as { id: string }
    await expect(submitDirect(stock.id)).rejects.toThrow('Only a direct supply requisition')
    expect(await statusOf(stock.id)).toBe('draft')
  })

  it('is refused while a line has no price, naming the line, and moves nothing', async () => {
    const { id } = await createDirect([{ description: 'Pipe' }, { description: 'Valve', unit_price: 0 }])
    await expect(submitDirect(id)).rejects.toThrow('Line 2 (Valve) needs an estimated unit price above zero')
    expect(await statusOf(id)).toBe('draft')
    expect(await logActions(id)).toEqual([])
  })

  it('tells the approvers, with the requisition id under the key the worker reads', async () => {
    const { id } = await createDirect()
    await submitDirect(id)
    const notices = await approvalNotices(id)
    expect(notices.length).toBeGreaterThan(0)
    for (const n of notices) {
      expect(n.payload).toMatchObject({ requisitionId: id, type: 'REQ_APPROVAL_REQUIRED' })
      expect(n.payload.userId).toBeTruthy()
      // the worker's REQ_ handlers read requisitionId; a poId here would fail them (playbook #60)
      expect(n.payload).not.toHaveProperty('poId')
    }
  })

  it('tells nobody when the submit is refused', async () => {
    const { id } = await createDirect([{ unit_price: 0 }])
    await expect(submitDirect(id)).rejects.toThrow('estimated unit price')
    expect(await approvalNotices(id, false)).toHaveLength(0)
  })

  it('cannot be submitted twice', async () => {
    const { id } = await createDirect()
    await submitDirect(id)
    await expect(submitDirect(id)).rejects.toThrow("Expected 'draft'")
  })

  it('runs through the real schema with the fields the page asks for', async () => {
    const { id } = await createDirect()
    const res = await server.executeOperation(
      {
        query: `mutation($id: ID!) { submitRequisitionDirectSupply(id: $id) { id status purpose delivery_destination } }`,
        variables: { id },
      },
      { contextValue: ctxFor('organizer') },
    )
    if (res.body.kind !== 'single') throw new Error('unexpected response kind')
    expect(res.body.singleResult.errors).toBeUndefined()
    expect(res.body.singleResult.data).toEqual({
      submitRequisitionDirectSupply: {
        id,
        status: 'pending_approval',
        purpose: 'direct_supply',
        delivery_destination: 'jobsite',
      },
    })
  })
})

describe('the stages a direct supply never visits', () => {
  it('has no inventory check to submit to', async () => {
    const { id } = await createDirect()
    await expect(
      resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id }, ctxFor('organizer') as never),
    ).rejects.toThrow('A direct supply requisition has no inventory check: submit it for approval instead')
    expect(await statusOf(id)).toBe('draft')
  })

  it('still lets every other requisition be submitted to inventory check', async () => {
    const stock = (await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ description: 'x', qty: 1, unit_price: 5 }] } },
      createCtx() as never,
    )) as { id: string }
    const result = (await resolvers.Mutation.submitRequisitionToInventoryCheck(
      null,
      { id: stock.id },
      ctxFor('organizer') as never,
    )) as { status: string }
    expect(result.status).toBe('inventory_check')
  })

  it('cannot be sent back to market pricing from approval', async () => {
    const { id } = await createDirect()
    await submitDirect(id)
    const [lineId] = await lineIds(id)
    await expect(
      resolvers.Mutation.rejectRequisitionToMarketPricing(
        null,
        { id, reason: 'prices', lineFlags: [{ lineId, reason: 'prices' }] },
        ctxFor('admin') as never,
      ),
    ).rejects.toThrow('A direct supply requisition has no market pricing step: send it back to draft instead')
    expect(await statusOf(id)).toBe('pending_approval')
  })

  it('cannot be sent back to inventory check from approval', async () => {
    const { id } = await createDirect()
    await submitDirect(id)
    const [lineId] = await lineIds(id)
    await expect(
      resolvers.Mutation.rejectRequisitionToInventoryCheck(
        null,
        { id, reason: 'stock', lineFlags: [{ lineId, reason: 'stock' }] },
        ctxFor('admin') as never,
      ),
    ).rejects.toThrow('A direct supply requisition has no inventory check: send it back to draft instead')
    expect(await statusOf(id)).toBe('pending_approval')
  })

  it('is sent back to draft by a rejection, flags the lines, and goes round again when resubmitted', async () => {
    const { id } = await createDirect([{ description: 'Pipe' }, { description: 'Valve' }])
    await submitDirect(id)
    const [first] = await lineIds(id)
    await resolvers.Mutation.rejectRequisitionApproval(
      null,
      { id, reason: 'Check the price of the pipe', lineFlags: [{ lineId: first!, reason: 'Too high' }] },
      ctxFor('admin') as never,
    )
    expect(await statusOf(id)).toBe('draft')
    const flagged = await pool.query(`SELECT flagged_at, flag_addressed_at FROM po_lines WHERE id=$1`, [first])
    expect(flagged.rows[0].flagged_at).not.toBeNull()
    expect(flagged.rows[0].flag_addressed_at).toBeNull()

    await pool.query(`UPDATE po_lines SET unit_price=10, total_price=qty_ordered*10 WHERE id=$1`, [first])
    expect((await submitDirect(id)).status).toBe('pending_approval')
    const addressed = await pool.query(`SELECT flag_addressed_at FROM po_lines WHERE id=$1`, [first])
    expect(addressed.rows[0].flag_addressed_at).not.toBeNull()
    expect(await logActions(id)).toEqual(['submit_direct_supply', 'reject', 'submit_direct_supply'])
  })
})

describe('an edit request cannot move a direct supply off the jobsite', () => {
  it('ignores a change of delivery destination', async () => {
    const { id } = await createDirect()
    await resolvers.Mutation.submitPOEditRequest(
      null,
      {
        requisitionId: id,
        changes: JSON.stringify({ header: { delivery_destination: { from: 'jobsite', to: 'inventory' } } }),
      } as never,
      ctxFor('admin') as never,
    )
    const row = await pool.query(`SELECT delivery_destination FROM requisitions WHERE id=$1`, [id])
    expect(row.rows[0].delivery_destination).toBe('jobsite')
  })
})

describe('from approval to completion', () => {
  it('is approved straight into items bought with the typed price as the approved price, and no Store Out', async () => {
    const { id } = await createDirect([{ unit_price: 12.5, qty: 10, currency: 'USD' }])
    await submitDirect(id)
    const approved = await approve(id)
    expect(approved.status).toBe('items_bought')

    const [lineId] = await lineIds(id)
    const line = await pool.query(
      `SELECT approved_unit_price, market_price, verified_price, qty_from_stock FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(Number(line.rows[0].approved_unit_price)).toBe(12.5)
    expect(line.rows[0].market_price).toBeNull()
    expect(line.rows[0].verified_price).toBeNull()
    expect(Number(line.rows[0].qty_from_stock)).toBe(0)
    const issues = await pool.query(`SELECT 1 FROM project_material_issues WHERE requisition_id=$1`, [id])
    expect(issues.rows).toHaveLength(0)
    const totals = await pool.query(`SELECT currency_code, subtotal FROM requisition_approved_totals WHERE requisition_id=$1`, [id])
    expect(totals.rows.map((t) => [t.currency_code, Number(t.subtotal)])).toEqual([['USD', 125]])
    expect(await logActions(id)).toEqual(['submit_direct_supply', 'approve', 'start_buying'])
  })

  it('judges every purchase against the typed price: within tolerance passes, above it is flagged', async () => {
    const { id } = await createDirect([{ unit_price: 12.5, qty: 10, currency: 'USD' }])
    await submitDirect(id)
    await approve(id)
    const [lineId] = await lineIds(id)

    // 5% of 12.50 is 0.625 and the absolute limit is 1, so the ceiling is 13.125.
    expect((await buy(lineId!, 4, 13.1)).over_tolerance).toBe(false)
    expect((await buy(lineId!, 4, 13.2)).over_tolerance).toBe(true)
  })

  it('is bought, forks its purchase orders as project POs delivered to the jobsite, and completes', async () => {
    const { id } = await createDirect([
      { description: 'Pipe', unit_price: 12.5, qty: 10, currency: 'USD' },
      { description: 'Valve', unit_price: 40, qty: 2, currency: 'USD' },
    ])
    await submitDirect(id)
    await approve(id)
    const [pipe, valve] = await lineIds(id)

    await buy(pipe!, 10, 12.5)
    await buy(valve!, 2, 40)
    // Finish Buying happens by itself once the last purchase is in; the button is the fallback and is harmless then.
    // It moves the requisition to the organizer's review (no purchase order yet); the organizer confirms (playbook #115).
    await resolvers.Mutation.finishBuyingRequisition(null, { id }, ctxFor('admin') as never)
    expect(await statusOf(id)).toBe('organizer_review')
    await passReview(id, ctxFor('organizer'), ctxFor('admin2'))
    expect(await statusOf(id)).toBe('sourcing')

    const pos = await pool.query(
      `SELECT purpose, delivery_destination, project_id, linked_project_id, created_by, organizer_id, status
         FROM purchase_orders WHERE requisition_id=$1`,
      [id],
    )
    expect(pos.rows).toHaveLength(1)
    expect(pos.rows[0]).toMatchObject({
      purpose: 'project',
      delivery_destination: 'jobsite',
      project_id: projectId,
      linked_project_id: projectId,
      created_by: userIds.organizer,
      organizer_id: userIds.organizer,
      status: 'bought',
    })

    for (const lineId of await lineIds(id)) {
      await resolvers.Mutation.closeRequisitionLine(null, { lineId, reason: 'delivered' }, ctxFor('admin') as never)
    }
    expect(await statusOf(id)).toBe('completed')
    expect(await logActions(id)).toEqual([
      'submit_direct_supply',
      'approve',
      'start_buying',
      'finish_buying',
      'confirm_review',
      'complete',
    ])
  })
})
