// Unit of measure on a project invoice line (migration 318): Ea, M, Lot, Roll, Set, Box, ...
//
// The web offers a list but the server takes any short text, so the rules live in one place
// (lib/invoiceUnit.ts) and are asserted here through the real ApolloServer({ typeDefs, resolvers }) against real
// Postgres, in throwaway companies. A line made before the migration has no unit (NULL) and stays that way unless
// somebody sets one. Three code paths build the invoice shape (projectInvoice, the re-fetch inside
// updateProjectInvoice, the public verification route); each is asserted, because a field added to some of them
// reads as empty on the others.
// Needs migration 318 applied to the test database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { verifyRouter } from '../src/routes/verify.js'
import { INVOICE_UNIT_MAX_LENGTH, normalizeInvoiceUnit } from '../src/lib/invoiceUnit.js'

const PREFIX = 'G-INVUOM-TEST-'
const EMAIL_A = 'g-invuom-a@fnc-erp.local'
const EMAIL_B = 'g-invuom-b@fnc-erp.local'

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

let companyA: string
let companyB: string
let ctxA: TestCtx
let ctxB: TestCtx
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

const LINE_FIELDS = `id lineNumber description qty uom unitCost`
const CREATE = `mutation C($contractId: ID!, $input: ProjectInvoiceInput!) {
  createProjectInvoice(contractId: $contractId, input: $input) { id invoiceNumber } }`
const READ = `query R($id: ID!) { projectInvoice(id: $id) { id lines { ${LINE_FIELDS} } } }`
const UPDATE = `mutation U($id: ID!, $lines: [InvoiceLineEditInput!]) {
  updateProjectInvoice(id: $id, lines: $lines) { id lines { ${LINE_FIELDS} } } }`

type Line = { description: string; sourceType: string; qty: number; unitCost: number; uom?: string | null }
const line = (description: string, uom?: string | null): Line => ({
  description,
  sourceType: 'manual',
  qty: 1,
  unitCost: 100,
  ...(uom === undefined ? {} : { uom }),
})

async function create(lines: Line[]): Promise<{ id: string; invoiceNumber: string }> {
  const r = await run(ctxA, CREATE, {
    contractId,
    input: { billingMethod: 'fixed', dueDate: '2026-12-01', lines },
  })
  expect(r.errors).toBeUndefined()
  return r.data!.createProjectInvoice as { id: string; invoiceNumber: string }
}

type ReadLine = { id: string; lineNumber: number; description: string; qty: number; uom: string | null }
async function read(id: string): Promise<ReadLine[]> {
  const r = await run(ctxA, READ, { id })
  expect(r.errors).toBeUndefined()
  return r.data!.projectInvoice.lines as ReadLine[]
}

async function stored(id: string): Promise<Record<string, string | null>> {
  const r = await pool.query(
    `SELECT description, uom FROM project_invoice_lines WHERE invoice_id=$1 ORDER BY line_number`,
    [id],
  )
  return Object.fromEntries(r.rows.map((x) => [x.description as string, x.uom as string | null]))
}

const seq = (invoiceNumber: string) => parseInt(invoiceNumber.split('-').pop() ?? '0', 10)

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
  // A real invoice number sequence. Without a row, nextDocumentNumber falls back to a timestamp and a random suffix,
  // which cannot show whether a refused invoice used up a number.
  await pool.query(
    `INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
     VALUES ($1, 'project_invoice', 'INV', 1, 4, true, '-')`,
    [companyA],
  )
  const userA = await mkUser(EMAIL_A, companyA)
  const userB = await mkUser(EMAIL_B, companyB)
  ctxA = { auth: { companyId: companyA, userId: userA, role: 'system_admin', module: 'all', sessionId: 'invuom-a' } }
  ctxB = { auth: { companyId: companyB, userId: userB, role: 'system_admin', module: 'all', sessionId: 'invuom-b' } }
  const p = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by, client_name)
     VALUES ($1,'INVUOM-1','Unit test project','ongoing',$2,'Acme Oil') RETURNING id`,
    [companyA, userA],
  )
  const c = await run(
    ctxA,
    `mutation($projectId: ID!, $input: ProjectContractInput!) { createProjectContract(projectId: $projectId, input: $input) { id } }`,
    {
      projectId: p.rows[0]!.id,
      input: { contractName: 'Unit contract', clientName: 'Acme Oil Ltd', contractValue: 1000, currencyCode: 'USD' },
    },
  )
  expect(c.errors).toBeUndefined()
  contractId = c.data!.createProjectContract.id
})

afterAll(async () => {
  await cleanup()
  await server.stop()
  await pool.end()
})

describe('normalizeInvoiceUnit', () => {
  it('trims, collapses inner spaces, and turns nothing into null', () => {
    expect(normalizeInvoiceUnit('Ea')).toBe('Ea')
    expect(normalizeInvoiceUnit('  Roll ')).toBe('Roll')
    expect(normalizeInvoiceUnit('Man   Day')).toBe('Man Day')
    expect(normalizeInvoiceUnit('')).toBeNull()
    expect(normalizeInvoiceUnit('   ')).toBeNull()
    expect(normalizeInvoiceUnit(null)).toBeNull()
    expect(normalizeInvoiceUnit(undefined)).toBeNull()
  })

  it('accepts exactly the column length and refuses one more', () => {
    expect(normalizeInvoiceUnit('x'.repeat(INVOICE_UNIT_MAX_LENGTH))).toHaveLength(INVOICE_UNIT_MAX_LENGTH)
    expect(() => normalizeInvoiceUnit('x'.repeat(INVOICE_UNIT_MAX_LENGTH + 1))).toThrow(/20 characters or fewer/)
  })

  it('refuses a value that is not text', () => {
    expect(() => normalizeInvoiceUnit(5)).toThrow(/must be text/)
    expect(() => normalizeInvoiceUnit({})).toThrow(/must be text/)
  })

  it('keeps any script, so a unit typed in Arabic is stored as typed', () => {
    expect(normalizeInvoiceUnit(' كارتون ')).toBe('كارتون')
  })
})

describe('createProjectInvoice', () => {
  it('stores the unit of each line, tidied', async () => {
    const inv = await create([
      line('Chairs', 'Ea'),
      line('Cable', ' M '),
      line('Fitting works', 'Lot'),
      line('Insulation', 'Man   Day'),
    ])
    expect(await stored(inv.id)).toEqual({
      Chairs: 'Ea',
      Cable: 'M',
      'Fitting works': 'Lot',
      Insulation: 'Man Day',
    })
  })

  it('stores nothing (NULL) for a line sent without a unit, with an empty one, or with null', async () => {
    const inv = await create([line('A'), line('B', ''), line('C', null), line('D', '  ')])
    expect(await stored(inv.id)).toEqual({ A: null, B: null, C: null, D: null })
  })

  it('refuses a unit that does not fit, writes nothing, and does not use up an invoice number', async () => {
    const before = await create([line('Before', 'Ea')])
    const tooLong = await run(ctxA, CREATE, {
      contractId,
      input: {
        billingMethod: 'fixed',
        dueDate: '2026-12-01',
        lines: [line('Fine', 'Ea'), line('Too long', 'x'.repeat(INVOICE_UNIT_MAX_LENGTH + 1))],
      },
    })
    expect(tooLong.errors?.[0]?.message).toMatch(/Unit must be 20 characters or fewer/)
    const after = await create([line('After', 'Ea')])
    expect(seq(after.invoiceNumber)).toBe(seq(before.invoiceNumber) + 1) // nothing between them was consumed
    const orphan = await pool.query(
      `SELECT 1 FROM project_invoice_lines WHERE description IN ('Fine','Too long') AND invoice_id IN (SELECT id FROM project_invoices WHERE company_id=$1)`,
      [companyA],
    )
    expect(orphan.rowCount).toBe(0)
  })
})

describe('the three readers', () => {
  it('projectInvoice returns the unit of each line, null where there is none', async () => {
    const inv = await create([line('Chairs', 'Ea'), line('Misc')])
    const lines = await read(inv.id)
    expect(lines.map((l) => [l.description, l.uom])).toEqual([
      ['Chairs', 'Ea'],
      ['Misc', null],
    ])
  })

  it('the re-fetch inside updateProjectInvoice returns it too', async () => {
    const inv = await create([line('Chairs', 'Ea')])
    const before = await read(inv.id)
    const r = await run(ctxA, UPDATE, {
      id: inv.id,
      lines: [{ id: before[0]!.id, qty: 4, uom: 'Box' }],
    })
    expect(r.errors).toBeUndefined()
    const lines = r.data!.updateProjectInvoice.lines as ReadLine[]
    expect(lines[0]).toMatchObject({ description: 'Chairs', uom: 'Box', qty: 4 })
  })

  it('the public verification page gets the same unit as the app, so the QR page prints the same table', async () => {
    const inv = await create([line('Chairs', 'Ea'), line('Cable', 'M'), line('Misc')])
    const token = await pool.query<{ verification_token: string }>(
      `SELECT verification_token FROM project_invoices WHERE id=$1`,
      [inv.id],
    )
    const app = express()
    app.use('/verify', verifyRouter)
    const srv = app.listen(0)
    try {
      const { port } = srv.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/verify/invoice/${token.rows[0]!.verification_token}`)
      const body = (await res.json()) as { data: { invoice: { lines: { description: string; uom: string | null }[] } } }
      const fromApp = await read(inv.id)
      expect(body.data.invoice.lines.map((l) => [l.description, l.uom])).toEqual(
        fromApp.map((l) => [l.description, l.uom]),
      )
      expect(body.data.invoice.lines.map((l) => l.uom)).toEqual(['Ea', 'M', null])
    } finally {
      await new Promise((r) => srv.close(r))
    }
  })
})

describe('updateProjectInvoice', () => {
  it('changes the unit of an existing line', async () => {
    const inv = await create([line('Chairs', 'Ea')])
    const [l] = await read(inv.id)
    const r = await run(ctxA, UPDATE, { id: inv.id, lines: [{ id: l!.id, uom: 'Set' }] })
    expect(r.errors).toBeUndefined()
    expect((await stored(inv.id)).Chairs).toBe('Set')
  })

  it('keeps the stored unit when the edit says nothing about it, for example when only the quantity changes', async () => {
    const inv = await create([line('Chairs', 'Roll')])
    const [l] = await read(inv.id)
    const r = await run(ctxA, UPDATE, { id: inv.id, lines: [{ id: l!.id, qty: 9, description: 'Chairs (renamed)' }] })
    expect(r.errors).toBeUndefined()
    expect(await stored(inv.id)).toEqual({ 'Chairs (renamed)': 'Roll' })
  })

  it('clears it when the edit sends an empty unit or null', async () => {
    const inv = await create([line('A', 'Ea'), line('B', 'M')])
    const [a, b] = await read(inv.id)
    const r = await run(ctxA, UPDATE, { id: inv.id, lines: [{ id: a!.id, uom: '' }, { id: b!.id, uom: null }] })
    expect(r.errors).toBeUndefined()
    expect(await stored(inv.id)).toEqual({ A: null, B: null })
  })

  it('leaves a line that never had a unit without one', async () => {
    const inv = await create([line('Old style line')])
    const [l] = await read(inv.id)
    await run(ctxA, UPDATE, { id: inv.id, lines: [{ id: l!.id, qty: 2 }] })
    expect((await stored(inv.id))['Old style line']).toBeNull()
  })

  it('stores the unit of a line added during the edit', async () => {
    const inv = await create([line('Chairs', 'Ea')])
    const [l] = await read(inv.id)
    const r = await run(ctxA, UPDATE, {
      id: inv.id,
      lines: [{ id: l!.id }, { description: 'Added later', qty: 3, unitCost: 5, uom: 'Pack' }],
    })
    expect(r.errors).toBeUndefined()
    expect(await stored(inv.id)).toEqual({ Chairs: 'Ea', 'Added later': 'Pack' })
  })

  it('refuses a unit that does not fit and changes nothing', async () => {
    const inv = await create([line('Chairs', 'Ea')])
    const [l] = await read(inv.id)
    const r = await run(ctxA, UPDATE, {
      id: inv.id,
      lines: [{ id: l!.id, qty: 7, uom: 'y'.repeat(INVOICE_UNIT_MAX_LENGTH + 1) }],
    })
    expect(r.errors?.[0]?.message).toMatch(/Unit must be 20 characters or fewer/)
    expect((await read(inv.id))[0]).toMatchObject({ qty: 1, uom: 'Ea' })
  })

  it("does not let another company's user change a unit", async () => {
    const inv = await create([line('Chairs', 'Ea')])
    const [l] = await read(inv.id)
    const r = await run(ctxB, UPDATE, { id: inv.id, lines: [{ id: l!.id, uom: 'Hijacked' }] })
    expect(r.errors?.[0]?.message).toMatch(/Invoice not found/)
    expect((await stored(inv.id)).Chairs).toBe('Ea')
  })
})

describe('the database rule behind it (migration 318)', () => {
  it('has no way to hold an empty unit, or one longer than the column', async () => {
    const inv = await create([line('Base', 'Ea')])
    const insert = (uom: string) =>
      pool.query(
        `INSERT INTO project_invoice_lines (invoice_id, line_number, description, source_type, qty, unit_cost, subtotal, line_total, uom)
         VALUES ($1, 9, 'Direct', 'manual', 1, 1, 1, 1, $2)`,
        [inv.id, uom],
      )
    await expect(insert('')).rejects.toThrow(/project_invoice_lines_uom_not_blank/)
    await expect(insert('   ')).rejects.toThrow(/project_invoice_lines_uom_not_blank/)
    await expect(insert('z'.repeat(21))).rejects.toThrow(/value too long/)
  })
})
