// G5: service_outbox.max_attempts always defaulted to 5 at every INSERT site
// (nothing ever set it explicitly), while outbox_event_configs says 7 for
// the critical financial events. The processor's poll query filters on the
// ROW's own max_attempts, so a critical event silently stopped being
// retried 2 attempts short of its configured limit, and never reached the
// DLQ. Fixed in migration 302 with a BEFORE INSERT trigger that copies the
// matching outbox_event_configs.max_attempts onto the new row. Real-Postgres
// pattern — a trigger can't be verified against a mocked DB (playbook #14).
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'

const UNCONFIGURED_EVENT_TYPE = 'G5_TEST_UNCONFIGURED_EVENT_TYPE'

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM service_outbox WHERE event_type IN ('PAYROLL_JOURNAL_REQUESTED', $1) AND payload->>'g5_test' = 'true'`,
    [UNCONFIGURED_EVENT_TYPE],
  )
}

afterAll(async () => {
  await cleanup()
  await pool.end()
})

describe('trg_sync_outbox_max_attempts', () => {
  it('copies the configured max_attempts onto a new row for a configured event type', async () => {
    const configRes = await pool.query<{ max_attempts: number }>(
      `SELECT max_attempts FROM outbox_event_configs WHERE event_type='PAYROLL_JOURNAL_REQUESTED'`,
    )
    expect(configRes.rows[0]?.max_attempts).toBe(7)

    const r = await pool.query<{ max_attempts: number }>(
      `INSERT INTO service_outbox (service, event_type, payload) VALUES ('finance','PAYROLL_JOURNAL_REQUESTED','{"g5_test":true}') RETURNING max_attempts`,
    )
    expect(r.rows[0]!.max_attempts).toBe(7)
  })

  it('leaves the table default for an event type with no configured row', async () => {
    const configRes = await pool.query(
      `SELECT 1 FROM outbox_event_configs WHERE event_type=$1`,
      [UNCONFIGURED_EVENT_TYPE],
    )
    expect(configRes.rows.length).toBe(0)

    const r = await pool.query<{ max_attempts: number }>(
      `INSERT INTO service_outbox (service, event_type, payload) VALUES ('finance',$1,'{"g5_test":true}') RETURNING max_attempts`,
      [UNCONFIGURED_EVENT_TYPE],
    )
    expect(r.rows[0]!.max_attempts).toBe(5)
  })

  it('leaves no existing row stuck below its own event type\'s configured max_attempts', async () => {
    const stuck = await pool.query(
      `SELECT so.id, so.event_type, so.max_attempts, oec.max_attempts AS configured
       FROM service_outbox so
       JOIN outbox_event_configs oec ON oec.event_type = so.event_type
       WHERE so.max_attempts < oec.max_attempts`,
    )
    expect(stuck.rows).toEqual([])
  })
})
