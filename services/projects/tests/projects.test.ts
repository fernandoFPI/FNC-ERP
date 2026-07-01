import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { createApp } from '../src/app.js'
import { createTestUser, cleanProjectsData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
let token: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
})

afterAll(async () => {
  await cleanProjectsData()
})

describe('Project lifecycle', () => {
  let projectId: string

  it('creates project with auto-generated analytic account', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'TEST-001',
        name: 'Test Construction Project',
        project_type: 'construction',
        budget_amount: 100_000_000,
        budget_currency: 'IQD',
        budget_lines: [
          { category: 'materials', budgeted_amount: 60_000_000 },
          { category: 'labour', budgeted_amount: 40_000_000 },
        ],
      })
    expect(res.status).toBe(201)
    expect(res.body.data.code).toBe('TEST-001')
    expect(res.body.data.analytic_account_id).toBeTruthy()
    projectId = res.body.data.id as string
  })

  it('fetches project list filtered by company', async () => {
    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const codes = (res.body.data as Array<{ code: string }>).map(p => p.code)
    expect(codes).toContain('TEST-001')
  })

  it('fetches project by id with stages and budget lines', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(projectId)
    expect(Array.isArray(res.body.data.budget_lines)).toBe(true)
    expect(res.body.data.budget_lines).toHaveLength(2)
  })

  it('full lifecycle: draft → pending → active → submitted → completed → closed', async () => {
    // submit for approval
    let res = await request(app).post(`/projects/${projectId}/submit-for-approval`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('pending')

    // activate
    res = await request(app).post(`/projects/${projectId}/activate`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('active')

    // submit for handover
    res = await request(app).post(`/projects/${projectId}/submit-for-handover`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('submitted')

    // complete
    res = await request(app).post(`/projects/${projectId}/complete`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('completed')

    // close (no stages, so should succeed)
    res = await request(app).post(`/projects/${projectId}/close`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('closed')
  })

  it('blocks close when open stages exist', async () => {
    // Create a new project and add an open stage then try to close
    const createRes = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'TEST-002', name: 'Test with Stages', project_type: 'construction', budget_amount: 0 })
    const pid = (createRes.body.data as { id: string }).id

    // Add a stage
    await request(app)
      .post(`/projects/${pid}/stages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Phase 1', sequence: 1 })

    // Move to completed state first
    await request(app).post(`/projects/${pid}/submit-for-approval`).set('Authorization', `Bearer ${token}`)
    await request(app).post(`/projects/${pid}/activate`).set('Authorization', `Bearer ${token}`)
    await request(app).post(`/projects/${pid}/submit-for-handover`).set('Authorization', `Bearer ${token}`)
    await request(app).post(`/projects/${pid}/complete`).set('Authorization', `Bearer ${token}`)

    // Try to close — should fail (pending stage)
    const closeRes = await request(app).post(`/projects/${pid}/close`).set('Authorization', `Bearer ${token}`)
    expect(closeRes.status).toBe(409)
    expect(closeRes.body.error.code).toBe('OPEN_STAGES')
  })

  it('rejects invalid workflow transitions', async () => {
    const createRes = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'TEST-003', name: 'Workflow Test', project_type: 'internal', budget_amount: 0 })
    const pid = (createRes.body.data as { id: string }).id

    // Can't close from draft
    const res = await request(app).post(`/projects/${pid}/close`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(409)
  })

  it('returns budget vs actual report', async () => {
    const createRes = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'TEST-004', name: 'Budget Test', project_type: 'construction', budget_amount: 50_000_000,
        budget_lines: [{ category: 'materials', budgeted_amount: 30_000_000 }],
      })
    const pid = (createRes.body.data as { id: string }).id
    const res = await request(app).get(`/projects/${pid}/budget`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('returns profitability from view', async () => {
    const createRes = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'TEST-005', name: 'Prof Test', project_type: 'epc', budget_amount: 10_000_000 })
    const pid = (createRes.body.data as { id: string }).id
    const res = await request(app).get(`/projects/${pid}/profitability`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('project_id')
    expect(res.body.data).toHaveProperty('budget_remaining')
  })
})
