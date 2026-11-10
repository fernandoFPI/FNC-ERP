// REST POST /projects/:id/complete follows the same invoice rule as the gateway's completeProject
// (one shared function in packages/db/src/projectCloseout.ts; the gateway side is covered by
// services/gateway/tests/project-financing-phase.test.ts): an unpaid invoice blocks the close for
// everyone, and a project with no invoices can only be closed by an administrator. This route does not
// use the lifecycle phase (it never sets one), so only the invoice rule is checked here.
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanProjectsData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
let token: string
let userId: string
let seq = 0

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  userId = user.userId
})

afterAll(async () => {
  await cleanProjectsData()
})

// A project at 'approved', through the real routes, with the invoices we ask for.
async function approvedProject(invoiceStatuses: string[]): Promise<string> {
  // Short on purpose: the analytic account code is "PRJ-" + this and is a varchar(20), so a longer code makes the create return 500.
  const code = `TEST-C${String(Date.now()).slice(-6)}${++seq}`
  const created = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ code, name: code, project_type: 'construction', budget_amount: 0 })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  const id = (created.body.data as { id: string }).id
  for (const step of ['start', 'submit', 'approve']) {
    const r = await request(app).post(`/projects/${id}/${step}`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
  }
  if (invoiceStatuses.length > 0) {
    const c = await pool.query<{ id: string }>(
      `INSERT INTO project_contracts
         (project_id, company_id, contract_number, contract_name, client_name, contract_value, currency_code, contract_date, created_by)
       VALUES ($1,$2,$3,'Close Test Contract','Close Test Client',1000,'USD','2031-01-01',$4) RETURNING id`,
      [id, TEST_COMPANY_ID, `${code}-C`, userId],
    )
    for (const [i, status] of invoiceStatuses.entries()) {
      await pool.query(
        `INSERT INTO project_invoices
           (contract_id, project_id, company_id, invoice_number, billing_method, net_payable, currency_code, status,
            invoice_date, due_date, created_by)
         VALUES ($1,$2,$3,$4,'milestone',100,'USD',$5,CURRENT_DATE,CURRENT_DATE + 30,$6)`,
        [c.rows[0]!.id, id, TEST_COMPANY_ID, `${code}-I${i}`, status, userId],
      )
    }
  }
  return id
}

const complete = (id: string) => request(app).post(`/projects/${id}/complete`).set('Authorization', `Bearer ${token}`)
const statusOf = async (id: string) =>
  (await pool.query<{ status: string }>(`SELECT status FROM projects WHERE id=$1`, [id])).rows[0]!.status

describe('POST /projects/:id/complete and the invoices', () => {
  it('refuses while an invoice is not fully paid, even for a company admin, and says so', async () => {
    const id = await approvedProject(['paid', 'issued'])
    const res = await complete(id)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('COMPLETION_BLOCKED')
    expect(JSON.stringify(res.body.error.details.blockers)).toMatch(/1 invoice is not fully paid yet \(1 issued, unpaid\)/)
    expect(await statusOf(id)).toBe('approved')
  })

  it('closes once every invoice is paid (cancelled and void ones do not count)', async () => {
    const id = await approvedProject(['paid', 'cancelled', 'void'])
    const res = await complete(id)
    expect(res.status).toBe(200)
    expect(await statusOf(id)).toBe('completed')
  })

  it('an admin may still close a project that has no invoices at all', async () => {
    const id = await approvedProject([])
    const res = await complete(id)
    expect(res.status).toBe(200)
    expect(await statusOf(id)).toBe('completed')
  })
})
