// An invoice in review can be rejected with the lines that need changing flagged (migration 313): it goes
// back to draft, where Edit and Submit for review already exist, and the flags follow the same lifecycle
// as expense claims and requisitions: open, then "addressed" when the invoice is submitted again, then
// resolved by the approver.
//
// Regression background: an invoice in review had one button, Approve. An approver who saw a wrong line
// had to tell the creator outside the system.
//
// Real Postgres through the real routes (supertest). Gate is the same as Approve: projects.invoices.edit.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'
import { createTestUser, cleanProjectsData, attachTestBankAccount, TEST_COMPANY_ID } from './setup.js'
import { INVOICE_HEADER_FLAG_FIELDS } from '../src/lib/invoiceHeaderFlags.js'

const app = createApp()
const OTHER_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const REFRESH_HASH = 'test-refresh-hash-projects-invrev'
const EMAILS = {
  editor: 'inv-review-editor@fnc-erp.local',
  viewer: 'inv-review-viewer@fnc-erp.local',
  outsider: 'inv-review-outsider@fnc-erp.local',
}

let adminToken: string
let adminId: string
let editorToken: string
let viewerToken: string
let outsiderToken: string
let projectId: string
let contractId: string
let counter = 0

async function makeUser(
  email: string,
  companyId: string,
  role: string,
  perms: Record<string, string> = {},
): Promise<{ userId: string; token: string }> {
  const passwordHash = await hashPassword('TestPass123!')
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,$2,'Rev','Tester')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [email, passwordHash],
  )
  const userId = u.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,$3,'all') ON CONFLICT DO NOTHING`,
    [userId, companyId, role],
  )
  for (const [key, level] of Object.entries(perms)) {
    await pool.query(
      `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level=EXCLUDED.access_level`,
      [userId, companyId, key, level],
    )
  }
  const token = signAccessToken({ userId, companyId, role, module: 'all', sessionId: 'test-session' })
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,$3,NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days') ON CONFLICT DO NOTHING`,
    [userId, createHash('sha256').update(token).digest('hex'), `${REFRESH_HASH}-${userId}`],
  )
  return { userId, token }
}

async function cleanInvoices(): Promise<void> {
  await pool.query(
    `DELETE FROM project_invoice_lines WHERE invoice_id IN (SELECT id FROM project_invoices WHERE company_id=$1)`,
    [TEST_COMPANY_ID],
  )
  await pool.query(`DELETE FROM project_invoices WHERE company_id=$1`, [TEST_COMPANY_ID])
}

async function cleanAll(): Promise<void> {
  await cleanInvoices()
  await pool.query(`DELETE FROM project_contracts WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'inv-review-%')`)
  await pool.query(`DELETE FROM users WHERE email LIKE 'inv-review-%'`)
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash LIKE $1`, [`${REFRESH_HASH}%`])
  await cleanProjectsData()
}

beforeAll(async () => {
  // createTestUser keeps one fixed refresh hash and skips the session insert if a leftover one
  // exists (a crashed earlier run), which shows up as a wall of 401s; start from none.
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-projects'`)
  const admin = await createTestUser()
  adminToken = admin.token
  adminId = admin.userId
  editorToken = (await makeUser(EMAILS.editor, TEST_COMPANY_ID, 'user', { 'projects.invoices.edit': 'edit', 'projects.invoices.view': 'edit' })).token
  viewerToken = (await makeUser(EMAILS.viewer, TEST_COMPANY_ID, 'user', { 'projects.invoices.view': 'view' })).token
  outsiderToken = (await makeUser(EMAILS.outsider, OTHER_COMPANY_ID, 'company_admin')).token

  const p = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code: 'TEST-INVREV-1', name: 'Review project', project_type: 'construction', budget_amount: 1_000_000, budget_currency: 'IQD' })
  projectId = p.body.data?.id ?? p.body.id
  expect(projectId, JSON.stringify(p.body)).toBeTruthy()
  const c = await request(app)
    .post('/projects/contracts')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      project_id: projectId,
      contract_number: 'CNT-INVREV-001',
      contract_name: 'Review contract',
      client_name: 'Test Client',
      contract_value: 1_000_000,
      currency_code: 'IQD',
      default_billing_method: 'milestone',
      retention_pct: 0,
      payment_terms_days: 30,
      contract_date: '2026-01-01',
    })
  contractId = c.body.data?.id ?? c.body.id
  expect(contractId, JSON.stringify(c.body)).toBeTruthy()
})

afterAll(async () => {
  await cleanAll()
  await pool.end()
})

beforeEach(cleanInvoices)

interface Fixture {
  id: string
  lines: string[]
}

// An invoice with three manual lines, in the given status.
async function makeInvoice(status = 'review'): Promise<Fixture> {
  counter += 1
  const inv = await pool.query<{ id: string }>(
    `INSERT INTO project_invoices (contract_id, project_id, company_id, invoice_number, billing_method, invoice_date, due_date, created_by, status)
     VALUES ($1,$2,$3,$4,'milestone','2026-03-01','2026-04-01',$5,$6) RETURNING id`,
    [contractId, projectId, TEST_COMPANY_ID, `INV-REV-${Date.now()}-${counter}`, adminId, status],
  )
  const id = inv.rows[0]!.id
  await attachTestBankAccount(id) // a wire-transfer invoice needs an account before it moves forward
  const lines: string[] = []
  for (const [i, [desc, amount]] of ([['Cement', 50], ['Steel bars', 200], ['Labour', 300]] as [string, number][]).entries()) {
    const l = await pool.query<{ id: string }>(
      `INSERT INTO project_invoice_lines (invoice_id, line_number, description, source_type, qty, unit_cost, subtotal, line_total)
       VALUES ($1,$2,$3,'manual',1,$4,$4,$4) RETURNING id`,
      [id, i + 1, desc, amount],
    )
    lines.push(l.rows[0]!.id)
  }
  return { id, lines }
}

const post = (path: string, body: unknown = {}, token = adminToken) =>
  request(app).post(`/projects/invoices${path}`).set('Authorization', `Bearer ${token}`).send(body as object)

interface LineRow {
  line_number: number
  flag_reason: string | null
  flagged_by: string | null
  flag_addressed_at: string | null
  flag_resolved_at: string | null
}
async function lineRows(id: string): Promise<LineRow[]> {
  const r = await pool.query<LineRow>(
    `SELECT line_number, flag_reason, flagged_by, flag_addressed_at, flag_resolved_at
     FROM project_invoice_lines WHERE invoice_id=$1 ORDER BY line_number`,
    [id],
  )
  return r.rows
}
async function invoiceRow(id: string) {
  const r = await pool.query(
    `SELECT status, rejected_by, rejected_at, rejection_reason FROM project_invoices WHERE id=$1`,
    [id],
  )
  return r.rows[0] as { status: string; rejected_by: string | null; rejected_at: string | null; rejection_reason: string | null }
}

describe('rejecting with ticked lines', () => {
  it('flags only the ticked lines, composes the reason, and sends the invoice back to draft', async () => {
    const { id, lines } = await makeInvoice()
    const res = await post(`/${id}/reject`, { lineFlags: [{ lineId: lines[1]!, reason: 'Price per bar is wrong' }] })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('draft')
    expect(res.body.data.rejection_reason).toBe('• Line 2 (Steel bars): Price per bar is wrong')

    const inv = await invoiceRow(id)
    expect(inv.status).toBe('draft')
    expect(inv.rejected_by).toBe(adminId)
    expect(inv.rejected_at).not.toBeNull()
    expect(inv.rejection_reason).toBe('• Line 2 (Steel bars): Price per bar is wrong')

    const rows = await lineRows(id)
    expect(rows.map((r) => r.flag_reason)).toEqual([null, 'Price per bar is wrong', null])
    expect(rows[1]!.flagged_by).toBe(adminId)
    expect(rows[1]!.flag_addressed_at).toBeNull()
    expect(rows[1]!.flag_resolved_at).toBeNull()
  })

  it('keeps an overall reason above the flagged lines when both are given', async () => {
    const { id, lines } = await makeInvoice()
    const res = await post(`/${id}/reject`, { reason: 'Please recheck', lineFlags: [{ lineId: lines[0]!, reason: 'Wrong qty' }] })
    expect(res.status).toBe(200)
    expect(res.body.data.rejection_reason).toBe('Please recheck\n\n• Line 1 (Cement): Wrong qty')
  })

  it('rejects the whole invoice with only an overall reason, flagging nothing', async () => {
    const { id } = await makeInvoice()
    const res = await post(`/${id}/reject`, { reason: 'Wrong client' })
    expect(res.status).toBe(200)
    expect(res.body.data.rejection_reason).toBe('Wrong client')
    expect((await lineRows(id)).every((r) => r.flag_reason === null)).toBe(true)
    expect((await invoiceRow(id)).status).toBe('draft')
  })

  it('refuses a rejection with neither a reason nor a flagged line, and changes nothing', async () => {
    const { id } = await makeInvoice()
    expect((await post(`/${id}/reject`, {})).status).toBe(422)
    expect((await post(`/${id}/reject`, { reason: '   ' })).status).toBe(422)
    expect((await post(`/${id}/reject`, { lineFlags: [] })).status).toBe(422)
    expect((await invoiceRow(id)).status).toBe('review')
  })

  it('refuses a flag with no reason, and the same line twice', async () => {
    const { id, lines } = await makeInvoice()
    expect((await post(`/${id}/reject`, { lineFlags: [{ lineId: lines[0]!, reason: ' ' }] })).status).toBe(422)
    const twice = await post(`/${id}/reject`, {
      lineFlags: [
        { lineId: lines[0]!, reason: 'a' },
        { lineId: lines[0]!, reason: 'b' },
      ],
    })
    expect(twice.status).toBe(422)
    // Its own message, not the "does not belong" one the line count would also give.
    expect(twice.body.error.message).toBe('A line can only be flagged once')
    expect((await invoiceRow(id)).status).toBe('review')
  })

  it("refuses another invoice's line, and leaves both invoices untouched", async () => {
    const a = await makeInvoice()
    const b = await makeInvoice()
    const res = await post(`/${a.id}/reject`, { lineFlags: [{ lineId: b.lines[0]!, reason: 'not yours' }] })
    expect(res.status).toBe(422)
    expect((await invoiceRow(a.id)).status).toBe('review')
    expect((await lineRows(b.id)).every((r) => r.flag_reason === null)).toBe(true)
  })

  it('only an invoice in review can be rejected', async () => {
    for (const status of ['draft', 'approved', 'issued', 'paid']) {
      const { id } = await makeInvoice(status)
      const res = await post(`/${id}/reject`, { reason: 'x' })
      expect(res.status).toBe(409)
      expect((await invoiceRow(id)).status).toBe(status)
    }
  })

  it("never reaches another company's invoice", async () => {
    const { id, lines } = await makeInvoice()
    const res = await post(`/${id}/reject`, { lineFlags: [{ lineId: lines[0]!, reason: 'x' }] }, outsiderToken)
    expect(res.status).toBe(404)
    expect((await invoiceRow(id)).status).toBe('review')
    expect((await lineRows(id)).every((r) => r.flag_reason === null)).toBe(true)
  })

  it('is open to an editor (the same gate as Approve) and refused to a view-only user', async () => {
    const a = await makeInvoice()
    expect((await post(`/${a.id}/reject`, { reason: 'x' }, viewerToken)).status).toBe(403)
    expect((await invoiceRow(a.id)).status).toBe('review')
    const b = await makeInvoice()
    expect((await post(`/${b.id}/reject`, { reason: 'x' }, editorToken)).status).toBe(200)
  })

  it('writes an audit row for the rejection', async () => {
    const { id, lines } = await makeInvoice()
    await post(`/${id}/reject`, { lineFlags: [{ lineId: lines[0]!, reason: 'x' }] })
    const a = await pool.query(
      `SELECT old_values, new_values FROM audit_log WHERE table_name='project_invoices' AND record_id=$1 AND new_values->>'status'='draft'`,
      [id],
    )
    expect(a.rowCount).toBeGreaterThan(0)
    expect(a.rows[0].old_values.status).toBe('review')
    expect(a.rows[0].new_values.lines_flagged).toBe(1)
  })
})

describe('fixing and resubmitting', () => {
  it('submit for review addresses the open flags (and only those), keeping the rejection as history', async () => {
    const { id, lines } = await makeInvoice()
    await post(`/${id}/reject`, { lineFlags: [{ lineId: lines[1]!, reason: 'Price per bar is wrong' }] })
    const res = await post(`/${id}/submit-for-review`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('review')

    const rows = await lineRows(id)
    // Addressed, not cleared: the approver still has to confirm it.
    expect(rows[1]!.flag_reason).toBe('Price per bar is wrong')
    expect(rows[1]!.flag_addressed_at).not.toBeNull()
    expect(rows[1]!.flag_resolved_at).toBeNull()
    expect(rows[0]!.flag_addressed_at).toBeNull()
    // The last rejection stays on the invoice.
    expect((await invoiceRow(id)).rejection_reason).toBe('• Line 2 (Steel bars): Price per bar is wrong')
  })

  it('an invoice that was never rejected submits exactly as before', async () => {
    const { id } = await makeInvoice('draft')
    const res = await post(`/${id}/submit-for-review`)
    expect(res.status).toBe(200)
    expect((await invoiceRow(id)).status).toBe('review')
    expect((await lineRows(id)).every((r) => r.flag_addressed_at === null)).toBe(true)
  })

  it('a failed submit (not a draft) stamps nothing', async () => {
    const { id, lines } = await makeInvoice()
    await pool.query(`UPDATE project_invoice_lines SET flag_reason='x', flagged_at=NOW() WHERE id=$1`, [lines[0]])
    const res = await post(`/${id}/submit-for-review`) // already in review
    expect(res.status).toBe(409)
    expect((await lineRows(id))[0]!.flag_addressed_at).toBeNull()
  })

  it('the whole loop still reaches approval: reject, edit, resubmit, approve', async () => {
    const { id, lines } = await makeInvoice()
    await post(`/${id}/reject`, { lineFlags: [{ lineId: lines[2]!, reason: 'Labour is too high' }] })
    await post(`/${id}/submit-for-review`)
    const approve = await post(`/${id}/approve`)
    expect(approve.status).toBe(200)
    expect((await invoiceRow(id)).status).toBe('approved')
  })

  it('a new rejection of the same line starts the flag cycle again', async () => {
    const { id, lines } = await makeInvoice()
    await post(`/${id}/reject`, { lineFlags: [{ lineId: lines[0]!, reason: 'first' }] })
    await post(`/${id}/submit-for-review`)
    await post(`/${id}/reject`, { lineFlags: [{ lineId: lines[0]!, reason: 'second' }] })
    const r = (await lineRows(id))[0]!
    expect(r.flag_reason).toBe('second')
    expect(r.flag_addressed_at).toBeNull()
    expect(r.flag_resolved_at).toBeNull()
  })
})

describe('confirming a fixed line', () => {
  it('can only be done after the flag was addressed by a resubmit', async () => {
    const { id, lines } = await makeInvoice()
    await post(`/${id}/reject`, { lineFlags: [{ lineId: lines[0]!, reason: 'No receipt' }] })
    const resolve = (token = adminToken) => post(`/${id}/lines/${lines[0]!}/resolve-flag`, {}, token)

    // Still waiting for whoever made the invoice: nothing to confirm yet.
    expect((await resolve()).status).toBe(409)

    await post(`/${id}/submit-for-review`)
    // Another company's approver cannot, and neither can a view-only user.
    expect((await resolve(outsiderToken)).status).toBe(409)
    expect((await resolve(viewerToken)).status).toBe(403)

    const ok = await resolve()
    expect(ok.status).toBe(200)
    expect((await lineRows(id))[0]!.flag_resolved_at).not.toBeNull()
    // Once only.
    expect((await resolve()).status).toBe(409)
  })

  it("refuses a line that belongs to another invoice", async () => {
    const a = await makeInvoice()
    const b = await makeInvoice()
    await post(`/${b.id}/reject`, { lineFlags: [{ lineId: b.lines[0]!, reason: 'x' }] })
    await post(`/${b.id}/submit-for-review`)
    // Asking invoice A to resolve invoice B's line must not work.
    expect((await post(`/${a.id}/lines/${b.lines[0]!}/resolve-flag`)).status).toBe(409)
    expect((await lineRows(b.id))[0]!.flag_resolved_at).toBeNull()
  })
})

// ── Header fields (migration 314): the block printed at the top of the invoice ───────────────────
interface HeaderFlagRow {
  field: string
  flag_reason: string
  flagged_by: string | null
  flag_addressed_at: string | null
  flag_resolved_at: string | null
}
async function headerFlagRows(id: string): Promise<HeaderFlagRow[]> {
  const r = await pool.query<HeaderFlagRow>(
    `SELECT field, flag_reason, flagged_by, flag_addressed_at, flag_resolved_at
     FROM project_invoice_header_flags WHERE invoice_id=$1 ORDER BY field`,
    [id],
  )
  return r.rows
}

describe('flagging header fields', () => {
  it('stores each flagged field with its reason and composes the invoice reason from them', async () => {
    const { id } = await makeInvoice()
    const res = await post(`/${id}/reject`, {
      headerFlags: [
        { field: 'bill_to_address', reason: 'Wrong company name' },
        { field: 'due_date', reason: 'Should be 60 days' },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('draft')
    expect(res.body.data.rejection_reason).toBe('• Bill To: Wrong company name\n• Due Date: Should be 60 days')

    const rows = await headerFlagRows(id)
    expect(rows.map((r) => [r.field, r.flag_reason])).toEqual([
      ['bill_to_address', 'Wrong company name'],
      ['due_date', 'Should be 60 days'],
    ])
    expect(rows.every((r) => r.flagged_by === adminId && r.flag_addressed_at === null && r.flag_resolved_at === null)).toBe(true)
    // No line was ticked.
    expect((await lineRows(id)).every((r) => r.flag_reason === null)).toBe(true)
  })

  it('reports a wrong line and a wrong header field together: header first, then the lines', async () => {
    const { id, lines } = await makeInvoice()
    const res = await post(`/${id}/reject`, {
      headerFlags: [{ field: 'client_contract_no', reason: 'Not the PO number' }],
      lineFlags: [{ lineId: lines[1]!, reason: 'Price per bar is wrong' }],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.rejection_reason).toBe(
      '• Contract No.: Not the PO number\n• Line 2 (Steel bars): Price per bar is wrong',
    )
    expect((await headerFlagRows(id)).map((r) => r.field)).toEqual(['client_contract_no'])
    expect((await lineRows(id)).map((r) => r.flag_reason)).toEqual([null, 'Price per bar is wrong', null])
  })

  it('keeps an overall reason above the flagged items when both are given', async () => {
    const { id } = await makeInvoice()
    const res = await post(`/${id}/reject`, { reason: 'Please recheck', headerFlags: [{ field: 'job', reason: 'Wrong project' }] })
    expect(res.status).toBe(200)
    expect(res.body.data.rejection_reason).toBe('Please recheck\n\n• Job: Wrong project')
  })

  it('accepts every field of the printed header, and the names match the printed labels', async () => {
    const { id } = await makeInvoice()
    const res = await post(`/${id}/reject`, {
      headerFlags: INVOICE_HEADER_FLAG_FIELDS.map((field) => ({ field, reason: `fix ${field}` })),
    })
    expect(res.status).toBe(200)
    expect(await headerFlagRows(id)).toHaveLength(10)
    for (const label of ['Date of Issue', 'Due Date', 'Invoice No.', 'Deliver To', 'Bill To', 'Contract No.', 'Job', 'Period of Performance', 'Date of Delivery', 'Reference']) {
      expect(res.body.data.rejection_reason).toContain(`• ${label}: `)
    }
  })

  it('refuses an unknown field, a blank reason, and the same field twice, and changes nothing', async () => {
    const { id } = await makeInvoice()
    expect((await post(`/${id}/reject`, { headerFlags: [{ field: 'total_amount', reason: 'x' }] })).status).toBe(422)
    expect((await post(`/${id}/reject`, { headerFlags: [{ field: 'job', reason: '  ' }] })).status).toBe(422)
    const twice = await post(`/${id}/reject`, {
      headerFlags: [
        { field: 'job', reason: 'a' },
        { field: 'job', reason: 'b' },
      ],
    })
    expect(twice.status).toBe(422)
    expect(twice.body.error.message).toBe('A header field can only be flagged once')
    expect((await invoiceRow(id)).status).toBe('review')
    expect(await headerFlagRows(id)).toHaveLength(0)
  })

  it('still needs a reason, a flagged line or a flagged field: none of them is refused', async () => {
    const { id } = await makeInvoice()
    expect((await post(`/${id}/reject`, { headerFlags: [] })).status).toBe(422)
    expect((await post(`/${id}/reject`, { lineFlags: [], headerFlags: [] })).status).toBe(422)
    expect((await invoiceRow(id)).status).toBe('review')
  })

  it('only an invoice in review can be rejected, and a refusal leaves no header flag behind', async () => {
    for (const status of ['draft', 'approved']) {
      const { id } = await makeInvoice(status)
      const res = await post(`/${id}/reject`, { headerFlags: [{ field: 'job', reason: 'x' }] })
      expect(res.status).toBe(409)
      expect(await headerFlagRows(id)).toHaveLength(0)
    }
  })

  it("never reaches another company's invoice, and a view-only user cannot flag", async () => {
    const { id } = await makeInvoice()
    expect((await post(`/${id}/reject`, { headerFlags: [{ field: 'job', reason: 'x' }] }, outsiderToken)).status).toBe(404)
    expect((await post(`/${id}/reject`, { headerFlags: [{ field: 'job', reason: 'x' }] }, viewerToken)).status).toBe(403)
    expect(await headerFlagRows(id)).toHaveLength(0)
    expect((await invoiceRow(id)).status).toBe('review')
  })

  it('a bad line in the same request rolls the header flags back too', async () => {
    const a = await makeInvoice()
    const b = await makeInvoice()
    const res = await post(`/${a.id}/reject`, {
      headerFlags: [{ field: 'job', reason: 'x' }],
      lineFlags: [{ lineId: b.lines[0]!, reason: 'not yours' }],
    })
    expect(res.status).toBe(422)
    expect(await headerFlagRows(a.id)).toHaveLength(0)
    expect((await invoiceRow(a.id)).status).toBe('review')
  })

  it('flagging the same field again starts the cycle again', async () => {
    const { id } = await makeInvoice()
    await post(`/${id}/reject`, { headerFlags: [{ field: 'job', reason: 'first' }] })
    await post(`/${id}/submit-for-review`)
    await post(`/${id}/reject`, { headerFlags: [{ field: 'job', reason: 'second' }] })
    const r = (await headerFlagRows(id))[0]!
    expect(r.flag_reason).toBe('second')
    expect(r.flag_addressed_at).toBeNull()
    expect(r.flag_resolved_at).toBeNull()
  })

  it('the allowed fields are exactly what the database accepts', async () => {
    const def = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
       WHERE c.conrelid = 'project_invoice_header_flags'::regclass AND c.contype = 'c'`,
    )
    const inDb = [...def.rows.map((r) => r.def).join(' ').matchAll(/'([a-z_]+)'::character varying/g)].map((m) => m[1]).sort()
    expect(inDb).toEqual([...INVOICE_HEADER_FLAG_FIELDS].sort())
  })
})

describe('fixing and confirming a header field', () => {
  it('submit for review addresses the open header flags, keeping them until the approver confirms', async () => {
    const { id } = await makeInvoice()
    await post(`/${id}/reject`, { headerFlags: [{ field: 'bill_to_address', reason: 'Wrong name' }] })
    expect((await post(`/${id}/submit-for-review`)).status).toBe(200)
    const r = (await headerFlagRows(id))[0]!
    expect(r.flag_reason).toBe('Wrong name')
    expect(r.flag_addressed_at).not.toBeNull()
    expect(r.flag_resolved_at).toBeNull()
  })

  it('can only be confirmed after the resubmit, only by someone who may approve, only once', async () => {
    const { id } = await makeInvoice()
    await post(`/${id}/reject`, { headerFlags: [{ field: 'delivery_date', reason: 'Wrong date' }] })
    const resolve = (field = 'delivery_date', token = adminToken) => post(`/${id}/header-flags/${field}/resolve-flag`, {}, token)

    expect((await resolve()).status).toBe(409) // still waiting for whoever made the invoice
    await post(`/${id}/submit-for-review`)
    expect((await resolve('delivery_date', outsiderToken)).status).toBe(409)
    expect((await resolve('delivery_date', viewerToken)).status).toBe(403)
    expect((await resolve('not_a_field')).status).toBe(422)
    expect((await resolve('job')).status).toBe(409) // a field nobody flagged

    const ok = await resolve()
    expect(ok.status).toBe(200)
    expect((await headerFlagRows(id))[0]!.flag_resolved_at).not.toBeNull()
    expect((await resolve()).status).toBe(409)
  })

  it("will not confirm another invoice's field", async () => {
    const a = await makeInvoice()
    const b = await makeInvoice()
    await post(`/${b.id}/reject`, { headerFlags: [{ field: 'job', reason: 'x' }] })
    await post(`/${b.id}/submit-for-review`)
    expect((await post(`/${a.id}/header-flags/job/resolve-flag`)).status).toBe(409)
    expect((await headerFlagRows(b.id))[0]!.flag_resolved_at).toBeNull()
  })

  it('the whole loop reaches approval with header and line flags together', async () => {
    const { id, lines } = await makeInvoice()
    await post(`/${id}/reject`, {
      headerFlags: [{ field: 'period_of_performance', reason: 'Wrong period' }],
      lineFlags: [{ lineId: lines[0]!, reason: 'Wrong qty' }],
    })
    await post(`/${id}/submit-for-review`)
    expect((await post(`/${id}/approve`)).status).toBe(200)
    expect((await invoiceRow(id)).status).toBe('approved')
  })
})
