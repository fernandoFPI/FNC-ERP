// Regression for the notification_preferences double-encoding bug:
// updatePreferences used to JSON.stringify an already-stringified
// notificationPreferences value (the frontend sends JSON.stringify(prefs)),
// so the jsonb column ended up holding a JSON *string* instead of an
// object. Any `->>'key'` lookup against a JSON string always returns NULL,
// which is exactly what notifyDeptHeadsAndAdminsForRequisitionGW's
// admin_requisition_approval opt-out check relies on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_USER_EMAIL = 'user-preferences-test@fnc-erp.local'

let userId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: '00000000-0000-0000-0000-000000000001', userId, role: 'user', module: 'all', sessionId: 'prefs-test' } }
})

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('updatePreferences — notificationPreferences round-trip', () => {
  it('stores notificationPreferences as a real jsonb object, not a double-encoded string', async () => {
    const prefs = { admin_requisition_approval: false, email_fx_alerts: true }
    await resolvers.Mutation.updatePreferences(
      null,
      { input: { notificationPreferences: JSON.stringify(prefs) } },
      ctx as never,
    )

    const row = await pool.query<{ notification_preferences: unknown; top_level_type: string }>(
      `SELECT notification_preferences, jsonb_typeof(notification_preferences) AS top_level_type FROM users WHERE id=$1`,
      [userId],
    )
    expect(row.rows[0]!.top_level_type).toBe('object')

    // The exact bug this guards against: ->> on a double-encoded string
    // always returns NULL, so the opt-out flag would never actually apply.
    const flag = await pool.query<{ opted_out: string | null }>(
      `SELECT notification_preferences->>'admin_requisition_approval' AS opted_out FROM users WHERE id=$1`,
      [userId],
    )
    expect(flag.rows[0]!.opted_out).toBe('false')
  })

  it('myPreferences round-trips the saved object, not a re-stringified copy of it', async () => {
    const prefs = { admin_requisition_approval: true }
    await resolvers.Mutation.updatePreferences(
      null,
      { input: { notificationPreferences: JSON.stringify(prefs) } },
      ctx as never,
    )
    const result = (await resolvers.Query.myPreferences(null, {}, ctx as never)) as {
      notificationPreferences: unknown
    }
    expect(result.notificationPreferences).toEqual(prefs)
  })
})
