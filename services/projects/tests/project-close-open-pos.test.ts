// REST /projects: what counts as an "open purchase order" (playbook #92).
//
// The completion blocker and the list's open_po_count each carried their own `status NOT IN ('completed','deleted')`, a
// list from before the requisition split. A PO of the current flow ends as `closed`, so a project whose POs were all
// received and paid still reported "N open purchase order(s) must be completed first" and could not be completed through
// this route. One shared rule now (packages/db poStatus.ts; the gateway side is covered by
// services/gateway/tests/project-open-po-rule.test.ts): closed, completed, cancelled and deleted POs are finished.
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanProjectsData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
let token: string
let userId: string
let seq = 0
const projectIds: string[] = []

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  userId = user.userId
})

afterAll(async () => {
  if (projectIds.length > 0) {
    await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id = ANY($1::uuid[]))`, [projectIds])
    await pool.query(`DELETE FROM purchase_orders WHERE project_id = ANY($1::uuid[])`, [projectIds])
    await pool.query(`DELETE FROM project_invoices WHERE project_id = ANY($1::uuid[])`, [projectIds])
    await pool.query(`DELETE FROM project_contracts WHERE project_id = ANY($1::uuid[])`, [projectIds])
  }
  await cleanProjectsData()
})

// A project at 'approved' with one PAID invoice (so the invoice rule is satisfied and only the PO rule can block), plus a
// purchase order in each of the given statuses.
async function approvedProject(poStatuses: string[]): Promise<{ id: string; code: string }> {
  // Short on purpose: the analytic account code is "PRJ-" + this and is a varchar(20).
  const code = `TEST-O${String(Date.now()).slice(-6)}${++seq}`
  const created = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ code, name: code, project_type: 'construction', budget_amount: 0 })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  const id = (created.body.data as { id: string }).id
  projectIds.push(id)
  for (const step of ['start', 'submit', 'approve']) {
    const r = await request(app).post(`/projects/${id}/${step}`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
  }
  const c = await pool.query<{ id: string }>(
    `INSERT INTO project_contracts
       (project_id, company_id, contract_number, contract_name, client_name, contract_value, currency_code, contract_date, created_by)
     VALUES ($1,$2,$3,'Open PO Test Contract','Open PO Test Client',1000,'USD','2031-01-01',$4) RETURNING id`,
    [id, TEST_COMPANY_ID, `${code}-C`, userId],
  )
  await pool.query(
    `INSERT INTO project_invoices
       (contract_id, project_id, company_id, invoice_number, billing_method, net_payable, currency_code, status, invoice_date, due_date, created_by)
     VALUES ($1,$2,$3,$4,'milestone',100,'USD','paid',CURRENT_DATE,CURRENT_DATE + 30,$5)`,
    [c.rows[0]!.id, id, TEST_COMPANY_ID, `${code}-I0`, userId],
  )
  for (const [i, status] of poStatuses.entries()) {
    await pool.query(
      `INSERT INTO purchase_orders (company_id, po_number, currency_code, base_currency_code, status, purpose, project_id, linked_project_id, created_by)
       VALUES ($1,$2,'USD','IQD',$3,'project',$4,$4,$5)`,
      [TEST_COMPANY_ID, `${code}-PO${i}`, status, id, userId],
    )
  }
  return { id, code }
}

const complete = (id: string) => request(app).post(`/projects/${id}/complete`).set('Authorization', `Bearer ${token}`)
const statusOf = async (id: string) => (await pool.query<{ status: string }>(`SELECT status FROM projects WHERE id=$1`, [id])).rows[0]!.status

describe('POST /projects/:id/complete and purchase orders', () => {
  it('is not blocked by finished POs: closed, completed, cancelled and deleted', async () => {
    const { id } = await approvedProject(['closed', 'closed', 'completed', 'cancelled', 'deleted'])
    const res = await complete(id)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(await statusOf(id)).toBe('completed')
  })

  it('is blocked by a PO that still needs something, and the message counts only those', async () => {
    const { id } = await approvedProject(['closed', 'approved', 'pending_approval', 'cancelled'])
    const res = await complete(id)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('COMPLETION_BLOCKED')
    expect(JSON.stringify(res.body.error.details.blockers)).toMatch(/2 open purchase order\(s\) must be completed first/)
    expect(await statusOf(id)).toBe('approved')
  })

  it('a rejected PO can be reopened, so it still blocks', async () => {
    const { id } = await approvedProject(['closed', 'rejected'])
    const res = await complete(id)
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body.error.details.blockers)).toMatch(/1 open purchase order\(s\)/)
  })
})

describe('GET /projects: open_po_count', () => {
  it('counts only the POs that still need something', async () => {
    const { code } = await approvedProject(['closed', 'closed', 'approved', 'goods_received', 'cancelled'])
    const res = await request(app).get('/projects').query({ search: code }).set('Authorization', `Bearer ${token}`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    // sendOk wraps { data, pagination }
    const rows = (res.body.data.data as { code: string; open_po_count: string | number }[]).filter((p) => p.code === code)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0]!.open_po_count)).toBe(2)
  })

  it('the detail route counts the same', async () => {
    const { id } = await approvedProject(['closed', 'payment_pending', 'deleted'])
    const res = await request(app).get(`/projects/${id}`).set('Authorization', `Bearer ${token}`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(Number((res.body.data as { open_po_count: string | number }).open_po_count)).toBe(1)
  })
})
