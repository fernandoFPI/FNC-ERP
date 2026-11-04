// Review flags on project invoice lines and the last rejection of an invoice (migration 313), as the
// app reads them through GraphQL, and what the PUBLIC verification page must never show.
//
// Rejecting and resolving are REST routes in the projects service (tested there); here the flags are
// written straight to the tables and this file checks the read side: the `projectInvoice` query and
// the re-fetch inside `updateProjectInvoice` build the same shape from one helper (they used to carry
// their own copies, and a field added to one read as empty on the other), and the QR verification route,
// which is not behind a login, shows none of it.
//
// Runs the real ApolloServer({ typeDefs, resolvers }) against real Postgres with throwaway companies.
// Needs migration 313 applied to the test database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { verifyRouter } from '../src/routes/verify.js'

const PREFIX = 'G-INVREV-TEST-'
const EMAIL_A = 'g-invrev-a@fnc-erp.local'
const EMAIL_B = 'g-invrev-b@fnc-erp.local'

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

let companyA: string
let companyB: string
let userA: string
let ctxA: TestCtx
let ctxB: TestCtx
let invoiceId: string
let lineIds: string[]

async function run(
  ctx: TestCtx,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: Record<string, any> | null; errors?: readonly { message: string }[] }> {
  const res = await server.executeOperation({ query, variables }, { contextValue: ctx })
  if (res.body.kind !== 'single') throw new Error('unexpected incremental GraphQL response')
  return res.body.singleResult as never
}

const LINE_FIELDS = `id lineNumber description flagReason flaggedAt flaggedByName flagAddressedAt flagResolvedAt`
const HEADER_FLAG_FIELDS = `field reason flaggedAt flaggedByName addressedAt resolvedAt`
const INVOICE_FIELDS = `id status rejectionReason rejectedAt rejectedByName headerFlags { ${HEADER_FLAG_FIELDS} } lines { ${LINE_FIELDS} }`
const READ = `query R($id: ID!) { projectInvoice(id: $id) { ${INVOICE_FIELDS} } }`
const UPDATE = `mutation U($id: ID!) { updateProjectInvoice(id: $id) { ${INVOICE_FIELDS} } }`

async function cleanup(): Promise<void> {
  for (const companyId of [companyA, companyB].filter(Boolean)) {
    await pool.query(
      `DELETE FROM project_invoice_lines WHERE invoice_id IN (SELECT id FROM project_invoices WHERE company_id=$1)`,
      [companyId],
    )
    await pool.query(`DELETE FROM project_invoices WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM project_contracts WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM projects WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM document_sequences WHERE company_id=$1`, [companyId]).catch(() => undefined)
    await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
  }
  await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[EMAIL_A, EMAIL_B]])
}

beforeAll(async () => {
  await server.start()
  const mkCompany = async (tag: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','USD') RETURNING id`,
        [`${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
      )
    ).rows[0]!.id
  const mkUser = async (email: string, company: string, first: string) => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,'test-hash-not-used',$2,'Approver')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [email, first],
    )
    await pool.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
      [u.rows[0]!.id, company],
    )
    return u.rows[0]!.id
  }
  companyA = await mkCompany('A')
  companyB = await mkCompany('B')
  userA = await mkUser(EMAIL_A, companyA, 'Sara')
  const userB = await mkUser(EMAIL_B, companyB, 'Other')
  ctxA = { auth: { companyId: companyA, userId: userA, role: 'system_admin', module: 'all', sessionId: 'invrev-a' } }
  ctxB = { auth: { companyId: companyB, userId: userB, role: 'system_admin', module: 'all', sessionId: 'invrev-b' } }

  const p = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by, client_name)
     VALUES ($1,'INVREV-1','Review project','ongoing',$2,'Acme Oil') RETURNING id`,
    [companyA, userA],
  )
  const c = await run(
    ctxA,
    `mutation($projectId: ID!, $input: ProjectContractInput!) {
       createProjectContract(projectId: $projectId, input: $input) { id } }`,
    {
      projectId: p.rows[0]!.id,
      input: { contractName: 'Review contract', clientName: 'Acme Oil Ltd', contractValue: 1000, currencyCode: 'USD' },
    },
  )
  expect(c.errors).toBeUndefined()
  const created = await run(
    ctxA,
    `mutation C($contractId: ID!, $input: ProjectInvoiceInput!) {
       createProjectInvoice(contractId: $contractId, input: $input) { id } }`,
    {
      contractId: c.data!.createProjectContract.id,
      input: {
        billingMethod: 'fixed',
        dueDate: '2026-12-01',
        lines: [
          { description: 'Cement', sourceType: 'manual', qty: 10, unitCost: 5 },
          { description: 'Steel bars', sourceType: 'manual', qty: 2, unitCost: 100 },
          { description: 'Labour', sourceType: 'manual', qty: 1, unitCost: 300 },
        ],
      },
    },
  )
  expect(created.errors).toBeUndefined()
  invoiceId = created.data!.createProjectInvoice.id
  const l = await pool.query<{ id: string }>(
    `SELECT id FROM project_invoice_lines WHERE invoice_id=$1 ORDER BY line_number`,
    [invoiceId],
  )
  lineIds = l.rows.map((r) => r.id)
  expect(lineIds).toHaveLength(3)
})

afterAll(async () => {
  await cleanup()
  await server.stop()
  await pool.end()
})

// What an approver's rejection leaves behind: line 2 flagged, the invoice back in draft.
async function flagLine2AndReject(): Promise<void> {
  await pool.query(
    `UPDATE project_invoice_lines SET flag_reason='Price per bar is wrong', flagged_at=NOW(), flagged_by=$2 WHERE id=$1`,
    [lineIds[1], userA],
  )
  // ...and two header fields flagged (migration 314).
  await pool.query(
    `INSERT INTO project_invoice_header_flags (invoice_id, field, flag_reason, flagged_by)
     VALUES ($1,'bill_to_address','Wrong company name',$2), ($1,'due_date','Should be 60 days',$2)
     ON CONFLICT (invoice_id, field) DO NOTHING`,
    [invoiceId, userA],
  )
  await pool.query(
    `UPDATE project_invoices SET status='draft', rejected_by=$2, rejected_at=NOW(), rejection_reason=$3 WHERE id=$1`,
    [invoiceId, userA, '• Line 2 (Steel bars): Price per bar is wrong'],
  )
}

describe('invoice with no review history', () => {
  it('reads null for every flag and for the rejection', async () => {
    const r = await run(ctxA, READ, { id: invoiceId })
    expect(r.errors).toBeUndefined()
    const inv = r.data!.projectInvoice
    expect(inv.rejectionReason).toBeNull()
    expect(inv.rejectedAt).toBeNull()
    expect(inv.rejectedByName).toBeNull()
    expect(inv.headerFlags).toEqual([])
    for (const l of inv.lines) {
      expect([l.flagReason, l.flaggedAt, l.flaggedByName, l.flagAddressedAt, l.flagResolvedAt]).toEqual([
        null,
        null,
        null,
        null,
        null,
      ])
    }
  })
})

describe('after a rejection', () => {
  beforeAll(flagLine2AndReject)

  it('projectInvoice shows the flag on its own line only, with who raised it, and the rejection history', async () => {
    const r = await run(ctxA, READ, { id: invoiceId })
    expect(r.errors).toBeUndefined()
    const inv = r.data!.projectInvoice
    expect(inv.status).toBe('draft')
    expect(inv.rejectionReason).toBe('• Line 2 (Steel bars): Price per bar is wrong')
    expect(inv.rejectedByName).toBe('Sara Approver')
    expect(inv.rejectedAt).toBeTruthy()
    const byNumber = Object.fromEntries(inv.lines.map((l: any) => [l.lineNumber, l]))
    expect(byNumber[1].flagReason).toBeNull()
    expect(byNumber[3].flagReason).toBeNull()
    expect(byNumber[2].flagReason).toBe('Price per bar is wrong')
    expect(byNumber[2].flaggedByName).toBe('Sara Approver')
    expect(byNumber[2].flaggedAt).toBeTruthy()
    expect(byNumber[2].flagAddressedAt).toBeNull()
    expect(byNumber[2].flagResolvedAt).toBeNull()
  })

  it('shows the flagged header fields in the order they were raised, with who raised them', async () => {
    const inv = (await run(ctxA, READ, { id: invoiceId })).data!.projectInvoice
    expect(inv.headerFlags.map((h: any) => [h.field, h.reason])).toEqual([
      ['bill_to_address', 'Wrong company name'],
      ['due_date', 'Should be 60 days'],
    ])
    for (const h of inv.headerFlags) {
      expect(h.flaggedByName).toBe('Sara Approver')
      expect(h.flaggedAt).toBeTruthy()
      expect(h.addressedAt).toBeNull()
      expect(h.resolvedAt).toBeNull()
    }
  })

  it('shows a fixed header flag as addressed, and a confirmed one as resolved', async () => {
    await pool.query(`UPDATE project_invoice_header_flags SET flag_addressed_at=NOW() WHERE invoice_id=$1 AND field='due_date'`, [invoiceId])
    let due = (await run(ctxA, READ, { id: invoiceId })).data!.projectInvoice.headerFlags.find((h: any) => h.field === 'due_date')
    expect(due.addressedAt).toBeTruthy()
    expect(due.resolvedAt).toBeNull()
    await pool.query(`UPDATE project_invoice_header_flags SET flag_resolved_at=NOW(), flag_resolved_by=$2 WHERE invoice_id=$1 AND field='due_date'`, [invoiceId, userA])
    due = (await run(ctxA, READ, { id: invoiceId })).data!.projectInvoice.headerFlags.find((h: any) => h.field === 'due_date')
    expect(due.resolvedAt).toBeTruthy()
  })

  it('updateProjectInvoice returns the very same flags and rejection (one builder, not two)', async () => {
    const read = (await run(ctxA, READ, { id: invoiceId })).data!.projectInvoice
    const upd = await run(ctxA, UPDATE, { id: invoiceId })
    expect(upd.errors).toBeUndefined()
    expect(upd.data!.updateProjectInvoice).toEqual(read)
  })

  it('shows a fixed flag as addressed, and a confirmed one as resolved', async () => {
    await pool.query(`UPDATE project_invoice_lines SET flag_addressed_at=NOW() WHERE id=$1`, [lineIds[1]])
    const fixed = (await run(ctxA, READ, { id: invoiceId })).data!.projectInvoice.lines[1]
    expect(fixed.flagAddressedAt).toBeTruthy()
    expect(fixed.flagResolvedAt).toBeNull()
    await pool.query(`UPDATE project_invoice_lines SET flag_resolved_at=NOW(), flag_resolved_by=$2 WHERE id=$1`, [
      lineIds[1],
      userA,
    ])
    const resolved = (await run(ctxA, READ, { id: invoiceId })).data!.projectInvoice.lines[1]
    expect(resolved.flagResolvedAt).toBeTruthy()
  })

  it("does not show another company's invoice, flags included", async () => {
    const r = await run(ctxB, READ, { id: invoiceId })
    expect(r.errors).toBeUndefined()
    expect(r.data!.projectInvoice).toBeNull()
  })
})

describe('the public verification page', () => {
  it('shows none of the review notes: no flag, no rejection', async () => {
    await flagLine2AndReject()
    const tokenRow = await pool.query<{ verification_token: string }>(
      `SELECT verification_token FROM project_invoices WHERE id=$1`,
      [invoiceId],
    )
    const app = express()
    app.use('/verify', verifyRouter)
    const srv = app.listen(0)
    try {
      const port = (srv.address() as AddressInfo).port
      const res = await fetch(`http://127.0.0.1:${port}/verify/invoice/${tokenRow.rows[0]!.verification_token}`)
      expect(res.status).toBe(200)
      const text = await res.text()
      const body = JSON.parse(text)
      expect(body.data.invoice.lines).toHaveLength(3)
      // The reason text itself must not appear anywhere in what a stranger can fetch.
      expect(text).not.toContain('Price per bar is wrong')
      expect(text).not.toContain('Wrong company name')
      expect(text).not.toContain('Should be 60 days')
      expect(text.toLowerCase()).not.toContain('flag')
      expect(text.toLowerCase()).not.toContain('rejection')
      expect(Object.keys(body.data.invoice.lines[1]).sort()).toEqual(
        ['description', 'lineNumber', 'lineTotal', 'marginAmount', 'marginPct', 'qty', 'subtotal', 'taxAmount', 'taxPct', 'unitCost'].sort(),
      )
    } finally {
      srv.close()
    }
  })
})
