// POST /projects must answer only AFTER its transaction has committed (playbook #93).
//
// The route used to send the 201 from inside `withTransaction`'s callback, before the COMMIT. A client that followed up at
// once (the web page opening the new project, a script, a test helper) could reach the next request while the row was still
// uncommitted and get "Project not found". It never showed on a fast local database (a commit takes well under a
// millisecond) and failed a CI deploy gate once, in a test that creates a project and starts it straight away.
//
// A slow COMMIT is made on purpose: a deferred constraint trigger on `projects` sleeps 50 ms when the inserting transaction
// commits, so the window is wide and the test is not left to luck. Against the old code 17 of 20 follow-ups failed.
// The trigger and its function are created for this file only and dropped in afterAll (and at the start, in case a run
// died half way). Files in this service run one after another, so no other test sees the delay.
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanProjectsData } from './setup.js'

const app = createApp()
let token = ''

async function dropSlowCommit(): Promise<void> {
  await pool.query(`DROP TRIGGER IF EXISTS zz_slow_commit ON projects`)
  await pool.query(`DROP FUNCTION IF EXISTS zz_slow_commit()`)
}

beforeAll(async () => {
  token = (await createTestUser()).token
  await dropSlowCommit()
  await pool.query(
    `CREATE FUNCTION zz_slow_commit() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(0.05); RETURN NULL; END $$ LANGUAGE plpgsql`,
  )
  await pool.query(
    `CREATE CONSTRAINT TRIGGER zz_slow_commit AFTER INSERT ON projects
       DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION zz_slow_commit()`,
  )
})

afterAll(async () => {
  await dropSlowCommit()
  await cleanProjectsData()
})

describe('POST /projects answers after the commit', () => {
  it('the project exists for the very next request, even when COMMIT is slow (8 times in a row)', async () => {
    const outcomes: number[] = []
    for (let i = 0; i < 8; i++) {
      const code = `TEST-K${String(Date.now()).slice(-6)}${i}`
      const created = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ code, name: code, project_type: 'construction', budget_amount: 0 })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      const id = (created.body.data as { id: string }).id
      // straight away: no wait between the answer and the next request
      const next = await request(app).get(`/projects/${id}`).set('Authorization', `Bearer ${token}`)
      outcomes.push(next.status)
    }
    expect(outcomes).toEqual([200, 200, 200, 200, 200, 200, 200, 200])
  })

  it('the 201 still carries the created project (id, code, status pending)', async () => {
    const code = `TEST-K${String(Date.now()).slice(-6)}x`
    const created = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code, name: code, project_type: 'construction', budget_amount: 0 })
    expect(created.status).toBe(201)
    const data = created.body.data as { id: string; code: string; status: string }
    expect(data.code).toBe(code)
    expect(data.status).toBe('pending')
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('a refused create still answers with its error and leaves no project behind', async () => {
    const before = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM projects WHERE code LIKE 'TEST-K%'`)
    const res = await request(app).post('/projects').set('Authorization', `Bearer ${token}`).send({ code: 'TEST-K-NONAME' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('MISSING_NAME')
    const after = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM projects WHERE code LIKE 'TEST-K%'`)
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n)
  })
})
