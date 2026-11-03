// Project invoice header block (migration 311): Contract No. (the CLIENT's number, from
// projects.rfq_number), Bill To, Deliver To, Date of Delivery, Period of Performance.
//
// Three code paths build the invoice shape (projectInvoice, the re-fetch inside
// updateProjectInvoice, the public verification route); all three must agree, so each is
// asserted here. A stored NULL ("never set", every invoice made before the migration) falls
// back to what the project says; a stored '' (cleared on purpose) stays blank.
//
// Runs the real ApolloServer({ typeDefs, resolvers }) against real Postgres with throwaway
// companies, so a misspelt field or argument fails here instead of in the browser.
// Needs migration 311 applied to the test database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { verifyRouter } from '../src/routes/verify.js'

const PREFIX = 'G-INVHDR-TEST-'
const EMAIL_A = 'g-invhdr-a@fnc-erp.local'
const EMAIL_B = 'g-invhdr-b@fnc-erp.local'

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

let companyA: string
let companyB: string
let ctxA: TestCtx
let ctxB: TestCtx
let projectId: string
let contractId: string

async function run(
  ctx: TestCtx,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: Record<string, any> | null; errors?: readonly { message: string }[] }> {
  const res = await server.executeOperation({ query, variables }, { contextValue: ctx })
  if (res.body.kind !== 'single') throw new Error('unexpected incremental GraphQL response')
  return res.body.singleResult as never
}

const FIELDS = `clientContractNo billToAddress deliverToAddress deliveryDate periodOfPerformance`
const CREATE = `mutation C($contractId: ID!, $input: ProjectInvoiceInput!) {
  createProjectInvoice(contractId: $contractId, input: $input) { id invoiceNumber ${FIELDS} } }`
const READ = `query R($id: ID!) { projectInvoice(id: $id) {
  id invoiceNumber contractNumber clientName projectCode projectName ${FIELDS} } }`
const UPDATE = `mutation U($id: ID!, $clientContractNo: String, $billToAddress: String, $deliverToAddress: String,
  $deliveryDate: String, $periodOfPerformance: String) {
  updateProjectInvoice(id: $id, clientContractNo: $clientContractNo, billToAddress: $billToAddress,
    deliverToAddress: $deliverToAddress, deliveryDate: $deliveryDate, periodOfPerformance: $periodOfPerformance) {
    id ${FIELDS} } }`
const DEFAULTS = `query D($contractId: ID!) { projectInvoiceDefaults(contractId: $contractId) { ${FIELDS} } }`

const LINES = [{ description: 'Header test line', sourceType: 'manual', qty: 1, unitCost: 100 }]
const baseInput = (extra: Record<string, unknown> = {}) => ({
  billingMethod: 'fixed',
  dueDate: '2026-12-01',
  lines: LINES,
  ...extra,
})

async function create(extra: Record<string, unknown> = {}): Promise<string> {
  const r = await run(ctxA, CREATE, { contractId, input: baseInput(extra) })
  expect(r.errors).toBeUndefined()
  return r.data!.createProjectInvoice.id as string
}

async function stored(id: string) {
  const r = await pool.query(
    `SELECT client_contract_no, bill_to_address, deliver_to_address, to_char(delivery_date,'YYYY-MM-DD') AS delivery_date,
            period_of_performance FROM project_invoices WHERE id=$1`,
    [id],
  )
  return r.rows[0] as Record<string, string | null>
}

async function read(id: string, ctx = ctxA) {
  const r = await run(ctx, READ, { id })
  expect(r.errors).toBeUndefined()
  return r.data!.projectInvoice as Record<string, string | null> | null
}

async function setProject(set: string, params: unknown[] = []): Promise<void> {
  await pool.query(`UPDATE projects SET ${set} WHERE id=$${params.length + 1}`, [...params, projectId])
}

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
  const mkUser = async (email: string, company: string) => {
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
  companyA = await mkCompany('A')
  companyB = await mkCompany('B')
  const userA = await mkUser(EMAIL_A, companyA)
  const userB = await mkUser(EMAIL_B, companyB)
  ctxA = { auth: { companyId: companyA, userId: userA, role: 'system_admin', module: 'all', sessionId: 'invhdr-a' } }
  ctxB = { auth: { companyId: companyB, userId: userB, role: 'system_admin', module: 'all', sessionId: 'invhdr-b' } }

  const p = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by, client_name, client_contact, project_location,
                           rfq_number, planned_start_date, planned_end_date, actual_end_date)
     VALUES ($1,'INVHDR-1','Cool shack','ongoing',$2,'Acme Oil','Mr Ahmed','Basra','PO 4500140630',
             '2026-10-01','2026-10-31','2026-10-29') RETURNING id`,
    [companyA, userA],
  )
  projectId = p.rows[0]!.id
  const c = await run(ctxA, `mutation($projectId: ID!, $input: ProjectContractInput!) {
    createProjectContract(projectId: $projectId, input: $input) { id } }`, {
    projectId,
    input: { contractName: 'Header contract', clientName: 'Acme Oil Ltd', contractValue: 1000, currencyCode: 'USD' },
  })
  expect(c.errors).toBeUndefined()
  contractId = c.data!.createProjectContract.id
})

afterAll(async () => {
  await cleanup()
  await server.stop()
  await pool.end()
})

describe('projectInvoiceDefaults', () => {
  it('derives every field from the project, and uses the RFQ # (not our internal contract number)', async () => {
    const r = await run(ctxA, DEFAULTS, { contractId })
    expect(r.errors).toBeUndefined()
    expect(r.data!.projectInvoiceDefaults).toEqual({
      clientContractNo: 'PO 4500140630',
      billToAddress: 'Acme Oil Ltd\nAttention: Mr Ahmed',
      deliverToAddress: 'Acme Oil Ltd\nBasra',
      deliveryDate: '2026-10-29',
      periodOfPerformance: '01/10/2026 – 31/10/2026',
    })
  })

  it('invents nothing: a project with none of it yields nulls', async () => {
    await setProject(
      `rfq_number=NULL, project_location=NULL, client_contact=NULL, planned_start_date=NULL, planned_end_date=NULL, actual_end_date=NULL`,
    )
    try {
      const r = await run(ctxA, DEFAULTS, { contractId })
      expect(r.data!.projectInvoiceDefaults).toEqual({
        clientContractNo: null,
        billToAddress: 'Acme Oil Ltd',
        deliverToAddress: 'Acme Oil Ltd',
        deliveryDate: null,
        periodOfPerformance: null,
      })
    } finally {
      await setProject(
        `rfq_number='PO 4500140630', project_location='Basra', client_contact='Mr Ahmed',
         planned_start_date='2026-10-01', planned_end_date='2026-10-31', actual_end_date='2026-10-29'`,
      )
    }
  })

  it("refuses another company's contract", async () => {
    const r = await run(ctxB, DEFAULTS, { contractId })
    expect(r.errors?.[0]?.message).toMatch(/Contract not found/)
  })
})

describe('createProjectInvoice', () => {
  it('stores what the project says when the form sent nothing', async () => {
    const id = await create()
    expect(await stored(id)).toEqual({
      client_contract_no: 'PO 4500140630',
      bill_to_address: 'Acme Oil Ltd\nAttention: Mr Ahmed',
      deliver_to_address: 'Acme Oil Ltd\nBasra',
      delivery_date: '2026-10-29',
      period_of_performance: '01/10/2026 – 31/10/2026',
    })
  })

  it('stores what the person typed, tidied: trimmed, CRLF to LF, an empty field kept empty', async () => {
    const id = await create({
      clientContractNo: '  4300065926 ',
      billToAddress: 'TotalEnergies EP Ratawi Hub SAS\r\nMansour District, 601\r\nBaghdad - Iraq',
      deliverToAddress: '',
      deliveryDate: '2026-07-30',
      periodOfPerformance: 'n/a',
    })
    expect(await stored(id)).toEqual({
      client_contract_no: '4300065926',
      bill_to_address: 'TotalEnergies EP Ratawi Hub SAS\nMansour District, 601\nBaghdad - Iraq',
      deliver_to_address: '',
      delivery_date: '2026-07-30',
      period_of_performance: 'n/a',
    })
    const inv = (await read(id))!
    expect(inv.clientContractNo).toBe('4300065926')
    expect(inv.deliverToAddress).toBe('') // cleared on purpose: not re-derived
    expect(inv.deliveryDate).toBe('2026-07-30')
  })

  it('is a snapshot: a later change to the project does not rewrite an invoice already made', async () => {
    const id = await create()
    await setProject(`rfq_number='CHANGED-LATER'`)
    try {
      expect((await read(id))!.clientContractNo).toBe('PO 4500140630')
    } finally {
      await setProject(`rfq_number='PO 4500140630'`)
    }
  })

  it.each([
    ['an address over 1000 characters', { billToAddress: 'x'.repeat(1001) }, /Bill To is too long/],
    ['a contract no. over 200 characters', { clientContractNo: 'x'.repeat(201) }, /Contract No\. is too long/],
    ['a date that does not exist', { deliveryDate: '2026-02-30' }, /Date of Delivery must be a valid date/],
    ['a date that is not a date', { deliveryDate: 'next week' }, /Date of Delivery must be a valid date/],
  ])('rejects %s and writes nothing', async (_name, extra, message) => {
    const before = await pool.query(`SELECT count(*)::int AS n FROM project_invoices WHERE company_id=$1`, [companyA])
    const r = await run(ctxA, CREATE, { contractId, input: baseInput(extra) })
    expect(r.errors?.[0]?.message).toMatch(message)
    const after = await pool.query(`SELECT count(*)::int AS n FROM project_invoices WHERE company_id=$1`, [companyA])
    expect(after.rows[0].n).toBe(before.rows[0].n)
  })
})

describe('invoices made before the columns existed', () => {
  it('print a useful header: NULL falls back to the project, live', async () => {
    const id = await create()
    await pool.query(
      `UPDATE project_invoices SET client_contract_no=NULL, bill_to_address=NULL, deliver_to_address=NULL,
              delivery_date=NULL, period_of_performance=NULL WHERE id=$1`,
      [id],
    )
    const inv = (await read(id))!
    expect(inv).toMatchObject({
      clientContractNo: 'PO 4500140630',
      billToAddress: 'Acme Oil Ltd\nAttention: Mr Ahmed',
      deliverToAddress: 'Acme Oil Ltd\nBasra',
      deliveryDate: '2026-10-29',
      periodOfPerformance: '01/10/2026 – 31/10/2026',
    })
    // Job and Reference come from the project; the internal contract number stays available but is not the Contract No.
    expect(inv.projectName).toBe('Cool shack')
    expect(inv.projectCode).toBe('INVHDR-1')
    expect(inv.contractNumber).not.toBe(inv.clientContractNo)
  })
})

describe('updateProjectInvoice', () => {
  it('changes only the fields that were sent, and its response matches projectInvoice', async () => {
    const id = await create({ clientContractNo: 'KEEP-ME', periodOfPerformance: 'KEEP-PERIOD' })
    const r = await run(ctxA, UPDATE, { id, billToAddress: 'New Client\nNew Street', deliveryDate: '2026-11-05' })
    expect(r.errors).toBeUndefined()
    const fromUpdate = r.data!.updateProjectInvoice as Record<string, string | null>
    expect(fromUpdate.billToAddress).toBe('New Client\nNew Street')
    expect(fromUpdate.deliveryDate).toBe('2026-11-05')
    expect(fromUpdate.clientContractNo).toBe('KEEP-ME')
    expect(fromUpdate.periodOfPerformance).toBe('KEEP-PERIOD')
    const fromRead = (await read(id))!
    for (const k of Object.keys(fromUpdate)) {
      if (k !== 'id') expect(fromRead[k]).toBe(fromUpdate[k])
    }
  })

  it('can blank a text field on purpose', async () => {
    const id = await create()
    const r = await run(ctxA, UPDATE, { id, deliverToAddress: '' })
    expect(r.data!.updateProjectInvoice.deliverToAddress).toBe('')
    expect((await stored(id)).deliver_to_address).toBe('')
  })

  it('rejects bad input before changing anything', async () => {
    const id = await create({ billToAddress: 'Original' })
    const r = await run(ctxA, UPDATE, { id, billToAddress: 'Changed', deliveryDate: '31/12/2026' })
    expect(r.errors?.[0]?.message).toMatch(/Date of Delivery must be a valid date/)
    expect((await stored(id)).bill_to_address).toBe('Original')
  })

  it("does not let another company's user read or change the invoice", async () => {
    const id = await create()
    expect(await read(id, ctxB)).toBeNull()
    const r = await run(ctxB, UPDATE, { id, billToAddress: 'Hijacked' })
    expect(r.errors?.[0]?.message).toMatch(/Invoice not found/)
    expect((await stored(id)).bill_to_address).not.toBe('Hijacked')
  })
})

describe('public verification route', () => {
  it('returns the same header fields as the app, so the QR page prints the same block', async () => {
    const id = await create({ clientContractNo: '4300065926', billToAddress: 'Bill\nTo' })
    const tokenRow = await pool.query<{ verification_token: string }>(
      `SELECT verification_token FROM project_invoices WHERE id=$1`,
      [id],
    )
    const app = express()
    app.use('/verify', verifyRouter)
    const srv = app.listen(0)
    try {
      const { port } = srv.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/verify/invoice/${tokenRow.rows[0]!.verification_token}`)
      const body = (await res.json()) as { data: { invoice: Record<string, string | null> } }
      const fromApp = (await read(id))!
      for (const k of ['clientContractNo', 'billToAddress', 'deliverToAddress', 'deliveryDate', 'periodOfPerformance']) {
        expect(body.data.invoice[k]).toBe(fromApp[k])
      }
      expect(body.data.invoice.clientContractNo).toBe('4300065926')
    } finally {
      await new Promise((r) => srv.close(r))
    }
  })
})
