// REST /projects/material-issues/:id/issue (the route the mobile app calls) must not consume equipment (playbook #107).
// A product flagged "Equipment (must come back)" is lent out; this route queues a stock move and knows nothing about returns, so
// issuing equipment through it would use it up for good. It is refused with a message that says where to issue it; an ordinary
// product is not affected by the new rule (it still fails or passes on stock alone).
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanProjectsData, TEST_COMPANY_ID, TEST_USER_EMAIL } from './setup.js'

const app = createApp()
const SKU = 'MIGUARD-'
let token: string
let projectId: string
let fromId: string
let toId: string
let equipmentId: string
let consumableId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  const code = `TEST-G${String(Date.now()).slice(-7)}`
  const created = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ code, name: code, project_type: 'construction', budget_amount: 0 })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  projectId = (created.body.data as { id: string }).id
  const loc = async (name: string, type: string): Promise<string> =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
        [TEST_COMPANY_ID, `${SKU}${name}-${Date.now()}`, type],
      )
    ).rows[0]!.id
  fromId = await loc('from', 'warehouse')
  toId = await loc('to', 'virtual_out')
  const prod = async (suffix: string, returnable: boolean): Promise<string> =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO products (company_id, sku, name, uom, is_returnable) VALUES ($1,$2,$2,'EA',$3) RETURNING id`,
        [TEST_COMPANY_ID, `${SKU}${suffix}-${Date.now()}`, returnable],
      )
    ).rows[0]!.id
  equipmentId = await prod('eq', true)
  consumableId = await prod('cons', false)
})

afterAll(async () => {
  await pool.query(`DELETE FROM service_outbox WHERE payload->>'source_type' = 'project_issue' AND payload->>'company_id' = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE project_id=$1)`, [projectId])
  await pool.query(`DELETE FROM project_material_issues WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [`${SKU}%`])
  await pool.query(`DELETE FROM stock_locations WHERE name LIKE $1`, [`${SKU}%`])
  await pool.query(`DELETE FROM projects WHERE id=$1`, [projectId])
  await cleanProjectsData()
})

// Made with SQL: the REST create route (POST /projects/:id/material-issues) cannot be used here. Its router is mounted without
// mergeParams, so requireParam('id') always throws "Missing route param: id" and it answers 500 (found while writing this test, not changed).
async function draftIssue(productId: string): Promise<string> {
  const user = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [TEST_USER_EMAIL])
  const issue = await pool.query<{ id: string }>(
    `INSERT INTO project_material_issues (project_id, company_id, issue_number, issue_date, created_by)
     VALUES ($1,$2,$3,'2026-11-19',$4) RETURNING id`,
    [projectId, TEST_COMPANY_ID, `${SKU}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, user.rows[0]!.id],
  )
  await pool.query(
    `INSERT INTO project_material_issue_lines (issue_id, product_id, from_location_id, to_location_id, qty_issued)
     VALUES ($1,$2,$3,$4,1)`,
    [issue.rows[0]!.id, productId, fromId, toId],
  )
  return issue.rows[0]!.id
}
const issue = (id: string) => request(app).post(`/projects/material-issues/${id}/issue`).set('Authorization', `Bearer ${token}`)

describe('REST issue of a Store Out and equipment', () => {
  it('refuses to issue equipment, says where to issue it, and leaves the Store Out a draft with nothing queued', async () => {
    const id = await draftIssue(equipmentId)
    const r = await issue(id)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('EQUIPMENT_NEEDS_STORE_OUT')
    expect(String(r.body.error.message)).toMatch(/Store Out screen/)
    const st = await pool.query<{ status: string }>(`SELECT status FROM project_material_issues WHERE id=$1`, [id])
    expect(st.rows[0]!.status).toBe('draft')
    const queued = await pool.query(`SELECT 1 FROM service_outbox WHERE payload->>'source_id' = $1`, [id])
    expect(queued.rows).toHaveLength(0)
  })

  it('does not change what happens to an ordinary product: it still fails on stock alone, with the stock error', async () => {
    const id = await draftIssue(consumableId)
    const r = await issue(id)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('INSUFFICIENT_STOCK')
  })
})
