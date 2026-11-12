// The one picture or PDF an invoice prints after its last page.
//
// Why it has its own path: the generic attach routes check only that the caller is logged in (the gateway's
// /files/attach) or holds view access (the projects service mount), and verifyAttachmentEntityOwnershipGW answers `true`
// for 'project_invoice'. Anyone could have put a file on an invoice that prints for the client, including another
// document's file. These tests pin the rules through the real ApolloServer({ typeDefs, resolvers }) against real
// Postgres, in throwaway companies: edit access, the invoice in the caller's company, a file the caller uploaded that
// nothing else uses, picture or PDF up to 10 MB, one file (a new one replaces the old), any invoice status (the
// user's rule), and nothing on the public verification page.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { verifyRouter } from '../src/routes/verify.js'
import {
  INVOICE_PRINT_ATTACHMENT_LABEL,
  PRINT_ATTACHMENT_MAX_BYTES,
  checkPrintAttachmentFile,
  getInvoicePrintAttachment,
  type PrintAttachmentFileRow,
} from '../src/lib/invoicePrintAttachment.js'

const PREFIX = 'G-INVATT-TEST-'
const EMAILS = {
  admin: 'g-invatt-admin@fnc-erp.local',
  editor: 'g-invatt-editor@fnc-erp.local',
  viewer: 'g-invatt-viewer@fnc-erp.local',
  plain: 'g-invatt-plain@fnc-erp.local',
  adminB: 'g-invatt-adminb@fnc-erp.local',
}

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

let companyA: string
let companyB: string
let contractId: string
const ids: Record<keyof typeof EMAILS, string> = { admin: '', editor: '', viewer: '', plain: '', adminB: '' }
const ctxOf = (who: keyof typeof EMAILS, role: string, company: string): TestCtx => ({
  auth: { companyId: company, userId: ids[who], role, module: 'all', sessionId: `invatt-${who}` },
})
let admin: TestCtx
let editor: TestCtx
let viewer: TestCtx
let plain: TestCtx
let adminB: TestCtx

async function run(
  ctx: TestCtx,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: Record<string, any> | null; errors?: readonly { message: string }[] }> {
  const res = await server.executeOperation({ query, variables }, { contextValue: ctx })
  if (res.body.kind !== 'single') throw new Error('unexpected incremental GraphQL response')
  return res.body.singleResult as never
}

const ATT = `id fileId filename mimeType sizeBytes uploadedAt`
const SET = `mutation S($invoiceId: ID!, $fileId: ID!) { setInvoicePrintAttachment(invoiceId: $invoiceId, fileId: $fileId) { ${ATT} } }`
const REMOVE = `mutation R($invoiceId: ID!) { removeInvoicePrintAttachment(invoiceId: $invoiceId) }`
const READ = `query Q($id: ID!) { projectInvoice(id: $id) { id invoiceNumber printAttachment { ${ATT} } } }`

let contractIdB: string

async function newInvoice(who: TestCtx = admin, forContract?: string): Promise<string> {
  const r = await run(who, `mutation C($contractId: ID!, $input: ProjectInvoiceInput!) {
    createProjectInvoice(contractId: $contractId, input: $input) { id } }`, {
    contractId: forContract ?? contractId,
    input: {
      billingMethod: 'fixed',
      dueDate: '2026-12-01',
      lines: [{ description: 'Item', sourceType: 'manual', qty: 1, unitCost: 100 }],
    },
  })
  expect(r.errors).toBeUndefined()
  return r.data!.createProjectInvoice.id as string
}

// A file row as the upload flow leaves it once the bytes are in: confirmed, nothing attached yet.
async function newFile(
  by: keyof typeof EMAILS,
  over: Partial<{ mime: string; size: number; status: string; category: string; company: string; name: string }> = {},
): Promise<string> {
  const key = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      over.company ?? companyA,
      ids[by],
      key,
      over.name ?? 'po-copy.pdf',
      over.mime ?? 'application/pdf',
      over.size ?? 120_000,
      over.category ?? 'attachment',
      over.status ?? 'uploaded',
    ],
  )
  return r.rows[0]!.id
}

const attachmentRows = async (invoiceId: string) =>
  (
    await pool.query<{ file_id: string; label: string }>(
      `SELECT file_id, label FROM document_attachments WHERE entity_type='project_invoice' AND entity_id=$1 ORDER BY created_at`,
      [invoiceId],
    )
  ).rows
const fileStatus = async (fileId: string) =>
  (await pool.query<{ status: string }>(`SELECT status FROM files WHERE id=$1`, [fileId])).rows[0]!.status

async function cleanup(): Promise<void> {
  for (const companyId of [companyA, companyB].filter(Boolean)) {
    await pool.query(
      `DELETE FROM document_attachments WHERE entity_type='project_invoice' AND entity_id IN (SELECT id FROM project_invoices WHERE company_id=$1)`,
      [companyId],
    )
    await pool.query(`DELETE FROM files WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM project_invoice_lines WHERE invoice_id IN (SELECT id FROM project_invoices WHERE company_id=$1)`, [companyId])
    await pool.query(`DELETE FROM project_invoices WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM project_contracts WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM projects WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM document_sequences WHERE company_id=$1`, [companyId]).catch(() => undefined)
    await pool.query(`DELETE FROM user_permissions WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
    await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
  }
  await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [Object.values(EMAILS)])
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
  companyA = await mkCompany('A')
  companyB = await mkCompany('B')
  for (const c of [companyA, companyB])
    await pool.query(
      `INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
       VALUES ($1, 'project_invoice', 'INV', 1, 4, true, '-')`,
      [c],
    )
  for (const [who, email] of Object.entries(EMAILS) as [keyof typeof EMAILS, string][]) {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [email],
    )
    ids[who] = u.rows[0]!.id
    const company = who === 'adminB' ? companyB : companyA
    const role = who === 'admin' || who === 'adminB' ? 'system_admin' : 'user'
    await pool.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,$3,'all') ON CONFLICT DO NOTHING`,
      [ids[who], company, role],
    )
  }
  const grant = (who: keyof typeof EMAILS, key: string, level: string) =>
    pool.query(
      `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level`,
      [ids[who], companyA, key, level],
    )
  await grant('editor', 'projects.invoices.edit', 'edit')
  await grant('editor', 'projects.invoices.view', 'edit')
  await grant('viewer', 'projects.invoices.view', 'view')
  admin = ctxOf('admin', 'system_admin', companyA)
  editor = ctxOf('editor', 'user', companyA)
  viewer = ctxOf('viewer', 'user', companyA)
  plain = ctxOf('plain', 'user', companyA)
  adminB = ctxOf('adminB', 'system_admin', companyB)

  const p = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by, client_name)
     VALUES ($1,'INVATT-1','Attachment test project','ongoing',$2,'Acme Oil') RETURNING id`,
    [companyA, ids.admin],
  )
  const c = await run(
    admin,
    `mutation($projectId: ID!, $input: ProjectContractInput!) { createProjectContract(projectId: $projectId, input: $input) { id } }`,
    {
      projectId: p.rows[0]!.id,
      input: { contractName: 'Attachment contract', clientName: 'Acme Oil Ltd', contractValue: 1000, currencyCode: 'USD' },
    },
  )
  expect(c.errors).toBeUndefined()
  contractId = c.data!.createProjectContract.id

  // The other company's own invoice, to test the file rules from a caller who is allowed to touch the INVOICE.
  const pB = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by, client_name)
     VALUES ($1,'INVATT-B1','Other company project','ongoing',$2,'Beta Oil') RETURNING id`,
    [companyB, ids.adminB],
  )
  const cB = await run(
    adminB,
    `mutation($projectId: ID!, $input: ProjectContractInput!) { createProjectContract(projectId: $projectId, input: $input) { id } }`,
    {
      projectId: pB.rows[0]!.id,
      input: { contractName: 'Other contract', clientName: 'Beta Oil', contractValue: 1000, currencyCode: 'USD' },
    },
  )
  expect(cB.errors).toBeUndefined()
  contractIdB = cB.data!.createProjectContract.id
})

afterAll(async () => {
  await cleanup()
  await server.stop()
  await pool.end()
})

describe('checkPrintAttachmentFile (pure)', () => {
  const ok: PrintAttachmentFileRow = { mime_type: 'application/pdf', size_bytes: '1000', status: 'uploaded', uploaded_by: 'u1', category: 'attachment' }

  it('accepts a PDF, a JPG and a PNG that the caller uploaded and nothing uses', () => {
    for (const mime of ['application/pdf', 'image/jpeg', 'image/png'])
      expect(checkPrintAttachmentFile({ ...ok, mime_type: mime }, 'u1'), mime).toBeNull()
  })

  it('refuses any other type, including a picture format that can carry script', () => {
    for (const mime of ['image/svg+xml', 'text/html', 'application/zip', 'image/gif', 'application/octet-stream'])
      expect(checkPrintAttachmentFile({ ...ok, mime_type: mime }, 'u1'), mime).toMatch(/JPG, PNG or PDF/)
  })

  it('allows exactly 10 MB and refuses one byte more', () => {
    expect(checkPrintAttachmentFile({ ...ok, size_bytes: PRINT_ATTACHMENT_MAX_BYTES }, 'u1')).toBeNull()
    expect(checkPrintAttachmentFile({ ...ok, size_bytes: String(PRINT_ATTACHMENT_MAX_BYTES + 1) }, 'u1')).toMatch(/larger than 10 MB/)
  })

  it('refuses a file that is not freshly uploaded, is somebody else\'s, or was uploaded for another purpose', () => {
    expect(checkPrintAttachmentFile({ ...ok, status: 'pending' }, 'u1')).toMatch(/not available/)
    expect(checkPrintAttachmentFile({ ...ok, status: 'attached' }, 'u1')).toMatch(/not available/)
    expect(checkPrintAttachmentFile({ ...ok, status: 'deleted' }, 'u1')).toMatch(/not available/)
    expect(checkPrintAttachmentFile(ok, 'someone-else')).toMatch(/uploaded yourself/)
    expect(checkPrintAttachmentFile({ ...ok, category: 'identity' }, 'u1')).toMatch(/uploaded for something else/)
  })
})

describe('who may attach', () => {
  it('an administrator and a user with edit access to invoices can; the file then reads back on the invoice', async () => {
    for (const who of [admin, editor]) {
      const invoiceId = await newInvoice()
      const fileId = await newFile(who === admin ? 'admin' : 'editor', { name: 'client-approval.pdf', size: 54_321 })
      const r = await run(who, SET, { invoiceId, fileId })
      expect(r.errors).toBeUndefined()
      expect(r.data!.setInvoicePrintAttachment).toMatchObject({
        fileId,
        filename: 'client-approval.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 54_321,
      })
      const read = await run(admin, READ, { id: invoiceId })
      expect(read.errors).toBeUndefined()
      expect(read.data!.projectInvoice.printAttachment).toMatchObject({ fileId, filename: 'client-approval.pdf' })
      expect(await fileStatus(fileId)).toBe('attached')
    }
  })

  it('a view-only user and a user with no access are refused, and nothing is stored', async () => {
    const invoiceId = await newInvoice()
    for (const [who, by] of [[viewer, 'viewer'], [plain, 'plain']] as const) {
      const fileId = await newFile(by)
      const r = await run(who, SET, { invoiceId, fileId })
      expect(r.errors?.[0]?.message).toMatch(/Requires 'edit' access to 'projects\.invoices\.edit'/)
      expect(await fileStatus(fileId)).toBe('uploaded')
      const rm = await run(who, REMOVE, { invoiceId })
      expect(rm.errors?.[0]?.message).toMatch(/Requires 'edit' access/)
    }
    expect(await attachmentRows(invoiceId)).toHaveLength(0)
  })

  it('a user in another company cannot attach to this invoice, nor use this company\'s file', async () => {
    const invoiceId = await newInvoice()
    const fileOfB = await newFile('adminB', { company: companyB })
    const wrongInvoice = await run(adminB, SET, { invoiceId, fileId: fileOfB })
    expect(wrongInvoice.errors?.[0]?.message).toMatch(/Invoice not found/)
    const fileOfA = await newFile('admin')
    const ownInvoiceNeeded = await run(adminB, SET, { invoiceId, fileId: fileOfA })
    expect(ownInvoiceNeeded.errors?.[0]?.message).toMatch(/Invoice not found/)
    expect(await attachmentRows(invoiceId)).toHaveLength(0)
    expect(await fileStatus(fileOfA)).toBe('uploaded')
    expect((await run(adminB, REMOVE, { invoiceId })).errors?.[0]?.message).toMatch(/Invoice not found/)
  })

  it('a caller with a valid invoice of their own cannot use another company\'s file, even one they uploaded', async () => {
    const invoiceB = await newInvoice(adminB, contractIdB)
    // uploaded by adminB, but it belongs to company A: it must be as if it does not exist
    const fileInA = await newFile('adminB', { company: companyA })
    const r = await run(adminB, SET, { invoiceId: invoiceB, fileId: fileInA })
    expect(r.errors?.[0]?.message).toMatch(/File not found/)
    expect(await attachmentRows(invoiceB)).toHaveLength(0)
    expect(await fileStatus(fileInA)).toBe('uploaded')
    // and their own file works on their own invoice (the company B setup itself is sound)
    const fileInB = await newFile('adminB', { company: companyB })
    const ok = await run(adminB, SET, { invoiceId: invoiceB, fileId: fileInB })
    expect(ok.errors).toBeUndefined()
  })

  it('a row that links an invoice to a file of another company is never returned, to either company', async () => {
    const invoiceId = await newInvoice()
    const fileOfB = await newFile('adminB', { company: companyB, status: 'attached' })
    await pool.query(
      `INSERT INTO document_attachments (file_id, entity_type, entity_id, label, uploaded_by) VALUES ($1,'project_invoice',$2,$3,$4)`,
      [fileOfB, invoiceId, INVOICE_PRINT_ATTACHMENT_LABEL, ids.admin],
    )
    expect(await getInvoicePrintAttachment(invoiceId, companyA)).toBeNull() // the file is not theirs
    expect(await getInvoicePrintAttachment(invoiceId, companyB)).toBeNull() // the invoice is not theirs
  })

  it('the other company cannot read it either', async () => {
    const invoiceId = await newInvoice()
    const fileId = await newFile('admin')
    await run(admin, SET, { invoiceId, fileId })
    expect(await getInvoicePrintAttachment(invoiceId, companyA)).toMatchObject({ fileId })
    expect(await getInvoicePrintAttachment(invoiceId, companyB)).toBeNull()
  })
})

describe('which files are refused', () => {
  const refusal = async (over: Parameters<typeof newFile>[1], by: keyof typeof EMAILS = 'admin') => {
    const invoiceId = await newInvoice()
    const fileId = await newFile(by, over)
    const r = await run(admin, SET, { invoiceId, fileId })
    expect(await attachmentRows(invoiceId)).toHaveLength(0)
    return { message: r.errors?.[0]?.message ?? '', fileId }
  }

  it('a type that is not a JPG, PNG or PDF', async () => {
    expect((await refusal({ mime: 'text/html', name: 'x.html' })).message).toMatch(/JPG, PNG or PDF/)
    expect((await refusal({ mime: 'image/svg+xml', name: 'x.svg' })).message).toMatch(/JPG, PNG or PDF/)
  })

  it('a file over 10 MB', async () => {
    expect((await refusal({ size: PRINT_ATTACHMENT_MAX_BYTES + 1 })).message).toMatch(/larger than 10 MB/)
  })

  it('a file someone else uploaded', async () => {
    expect((await refusal({}, 'editor')).message).toMatch(/uploaded yourself/)
  })

  it('a file whose bytes were never sent, and a file already used by something else', async () => {
    expect((await refusal({ status: 'pending' })).message).toMatch(/not available/)
    expect((await refusal({ status: 'attached' })).message).toMatch(/not available/)
  })

  it('a file uploaded for another purpose (identity papers, contracts)', async () => {
    expect((await refusal({ category: 'identity' })).message).toMatch(/uploaded for something else/)
    expect((await refusal({ category: 'contract' })).message).toMatch(/uploaded for something else/)
  })

  it('a file that does not exist', async () => {
    const invoiceId = await newInvoice()
    const r = await run(admin, SET, { invoiceId, fileId: '00000000-0000-0000-0000-00000000dead' })
    expect(r.errors?.[0]?.message).toMatch(/File not found/)
  })

  it('an invoice that does not exist', async () => {
    const fileId = await newFile('admin')
    const r = await run(admin, SET, { invoiceId: '00000000-0000-0000-0000-00000000dead', fileId })
    expect(r.errors?.[0]?.message).toMatch(/Invoice not found/)
    expect(await fileStatus(fileId)).toBe('uploaded')
  })
})

describe('one file: replace and remove', () => {
  it('a second file replaces the first; the first becomes a free upload again', async () => {
    const invoiceId = await newInvoice()
    const first = await newFile('admin', { name: 'first.pdf' })
    const second = await newFile('admin', { name: 'second.png', mime: 'image/png' })
    await run(admin, SET, { invoiceId, fileId: first })
    const r = await run(admin, SET, { invoiceId, fileId: second })
    expect(r.errors).toBeUndefined()
    expect(r.data!.setInvoicePrintAttachment).toMatchObject({ fileId: second, filename: 'second.png' })
    const rows = await attachmentRows(invoiceId)
    expect(rows).toEqual([{ file_id: second, label: INVOICE_PRINT_ATTACHMENT_LABEL }])
    expect(await fileStatus(first)).toBe('uploaded')
    expect(await fileStatus(second)).toBe('attached')
  })

  it('attaching the same file again does not duplicate it', async () => {
    const invoiceId = await newInvoice()
    const fileId = await newFile('admin')
    await run(admin, SET, { invoiceId, fileId })
    // now 'attached', so the refusal rule makes a second attach of the SAME id impossible, which is the point
    const again = await run(admin, SET, { invoiceId, fileId })
    expect(again.errors?.[0]?.message).toMatch(/not available/)
    expect(await attachmentRows(invoiceId)).toHaveLength(1)
  })

  it('removing clears it, says whether anything was removed, and frees the file', async () => {
    const invoiceId = await newInvoice()
    const fileId = await newFile('admin')
    await run(admin, SET, { invoiceId, fileId })
    const gone = await run(admin, REMOVE, { invoiceId })
    expect(gone.errors).toBeUndefined()
    expect(gone.data!.removeInvoicePrintAttachment).toBe(true)
    expect((await run(admin, READ, { id: invoiceId })).data!.projectInvoice.printAttachment).toBeNull()
    expect(await attachmentRows(invoiceId)).toHaveLength(0)
    expect(await fileStatus(fileId)).toBe('uploaded')
    expect((await run(admin, REMOVE, { invoiceId })).data!.removeInvoicePrintAttachment).toBe(false)
  })

  it('an invoice with nothing attached reads null, not an error', async () => {
    const invoiceId = await newInvoice()
    const r = await run(admin, READ, { id: invoiceId })
    expect(r.errors).toBeUndefined()
    expect(r.data!.projectInvoice.printAttachment).toBeNull()
  })

  it('records who changed it and from what, so it can be traced', async () => {
    const invoiceId = await newInvoice()
    const first = await newFile('editor')
    const second = await newFile('editor')
    await run(editor, SET, { invoiceId, fileId: first })
    await run(editor, SET, { invoiceId, fileId: second })
    await run(editor, REMOVE, { invoiceId })
    const audit = await pool.query<{ old_values: { print_attachment_file_id: string | null }; new_values: { print_attachment_file_id: string | null } }>(
      `SELECT old_values, new_values FROM audit_log WHERE table_name='project_invoices' AND record_id=$1 AND user_id=$2 ORDER BY created_at, id`,
      [invoiceId, ids.editor],
    )
    const trail = audit.rows.map((a) => [a.old_values.print_attachment_file_id, a.new_values.print_attachment_file_id])
    expect(trail).toEqual([
      [null, first],
      [first, second],
      [second, null],
    ])
  })
})

describe('any invoice status (the rule is "any time")', () => {
  it.each(['draft', 'review', 'approved', 'issued', 'paid', 'cancelled'])('%s', async (status) => {
    const invoiceId = await newInvoice()
    await pool.query(`UPDATE project_invoices SET status=$2 WHERE id=$1`, [invoiceId, status])
    const fileId = await newFile('admin')
    const r = await run(admin, SET, { invoiceId, fileId })
    expect(r.errors).toBeUndefined()
    expect((await run(admin, REMOVE, { invoiceId })).data!.removeInvoicePrintAttachment).toBe(true)
  })
})

describe('where it shows up', () => {
  it('the invoice the update mutation returns carries it too (every reader of the invoice shape)', async () => {
    const invoiceId = await newInvoice()
    const fileId = await newFile('admin')
    await run(admin, SET, { invoiceId, fileId })
    const r = await run(
      admin,
      `mutation($id: ID!) { updateProjectInvoice(id: $id, dueDate: "2027-01-15") { id dueDate printAttachment { ${ATT} } } }`,
      { id: invoiceId },
    )
    expect(r.errors).toBeUndefined()
    expect(r.data!.updateProjectInvoice.dueDate).toBe('2027-01-15')
    expect(r.data!.updateProjectInvoice.printAttachment).toMatchObject({ fileId })
    // and saving the invoice does not drop the attachment
    expect(await attachmentRows(invoiceId)).toHaveLength(1)
  })

  it('a file attached to the invoice by any other route is NOT printed: only this feature\'s own marker counts', async () => {
    const invoiceId = await newInvoice()
    const fileId = await newFile('admin')
    await pool.query(
      `INSERT INTO document_attachments (file_id, entity_type, entity_id, label, uploaded_by) VALUES ($1,'project_invoice',$2,'Some other document',$3)`,
      [fileId, invoiceId, ids.admin],
    )
    expect((await run(admin, READ, { id: invoiceId })).data!.projectInvoice.printAttachment).toBeNull()
    expect(await getInvoicePrintAttachment(invoiceId, companyA)).toBeNull()
  })

  it('a file that was deleted afterwards is not printed', async () => {
    const invoiceId = await newInvoice()
    const fileId = await newFile('admin')
    await run(admin, SET, { invoiceId, fileId })
    await pool.query(`UPDATE files SET status='deleted' WHERE id=$1`, [fileId])
    expect((await run(admin, READ, { id: invoiceId })).data!.projectInvoice.printAttachment).toBeNull()
  })

  it('if two marked rows ever exist (a crash between steps), the newest one is the one printed', async () => {
    const invoiceId = await newInvoice()
    const older = await newFile('admin', { name: 'older.pdf', status: 'attached' })
    const newer = await newFile('admin', { name: 'newer.pdf', status: 'attached' })
    await pool.query(
      `INSERT INTO document_attachments (file_id, entity_type, entity_id, label, uploaded_by, created_at)
       VALUES ($1,'project_invoice',$3,$4,$5, now() - interval '1 hour'), ($2,'project_invoice',$3,$4,$5, now())`,
      [older, newer, invoiceId, INVOICE_PRINT_ATTACHMENT_LABEL, ids.admin],
    )
    expect((await run(admin, READ, { id: invoiceId })).data!.projectInvoice.printAttachment).toMatchObject({ fileId: newer })
  })

  it('the public verification page (no login) says nothing about it', async () => {
    const invoiceId = await newInvoice()
    const fileId = await newFile('admin', { name: 'confidential-client-approval.pdf' })
    await run(admin, SET, { invoiceId, fileId })
    const token = await pool.query<{ verification_token: string }>(
      `SELECT verification_token FROM project_invoices WHERE id=$1`,
      [invoiceId],
    )
    const app = express()
    app.use('/verify', verifyRouter)
    const srv = app.listen(0)
    try {
      const { port } = srv.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/verify/invoice/${token.rows[0]!.verification_token}`)
      expect(res.status).toBe(200)
      const text = await res.text()
      for (const leak of ['confidential-client-approval', fileId, 'printAttachment', 'print_attachment', INVOICE_PRINT_ATTACHMENT_LABEL])
        expect(text, `the public page must not contain "${leak}"`).not.toContain(leak)
    } finally {
      await new Promise((r) => srv.close(r))
    }
  })
})
