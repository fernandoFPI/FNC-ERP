// Covers two new pieces added for the Journal Entries page redesign:
// 1. journal_entry as an attachable entity (verifyAttachmentEntityOwnershipGW
//    + attachFile/detachFile) — previously unwired, so a journal entry could
//    never have a file attached at all.
// 2. The auditTrail query, including its explicit tableName allow-list —
//    it must never become a free-form "read any table's audit history"
//    lookup just because a caller passes a different tableName string.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'journal-entry-attach-audit-test@fnc-erp.local'
const REF_PREFIX = 'JEATEST-'

let userId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeJournalEntry(): Promise<string> {
  const reference = `${REF_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, entry_date, created_by) VALUES ($1,$2,CURRENT_DATE,$3) RETURNING id`,
    [TEST_COMPANY_ID, reference, userId],
  )
  return r.rows[0]!.id
}

async function makeUploadedFile(): Promise<string> {
  const key = `jea-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'note.pdf','application/pdf',2048,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key],
  )
  return r.rows[0]!.id
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM document_attachments WHERE entity_type='journal_entry' AND entity_id IN (SELECT id FROM journal_entries WHERE company_id=$1 AND reference LIKE $2)`,
    [TEST_COMPANY_ID, `${REF_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM audit_log WHERE table_name='journal_entries' AND record_id IN (SELECT id FROM journal_entries WHERE company_id=$1 AND reference LIKE $2)`,
    [TEST_COMPANY_ID, `${REF_PREFIX}%`],
  )
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1 AND reference LIKE $2`, [TEST_COMPANY_ID, `${REF_PREFIX}%`])
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE 'jea-test-%'`, [TEST_COMPANY_ID])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'jea-test' } }
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('journal_entry attachments', () => {
  it('can attach and detach a file on a journal entry', async () => {
    const journalEntryId = await makeJournalEntry()
    const fileId = await makeUploadedFile()

    const attachResult = await resolvers.Mutation.attachFile(
      null,
      { fileId, entityType: 'journal_entry', entityId: journalEntryId },
      ctx as never,
    )
    const attachmentId = (attachResult as { id: string }).id
    expect(attachmentId).toBeTruthy()

    const list = await resolvers.Query.entityAttachments(
      null,
      { entityType: 'journal_entry', entityId: journalEntryId },
      ctx as never,
    )
    expect((list as unknown[]).length).toBe(1)

    const detached = await resolvers.Mutation.detachFile(
      null,
      { attachmentId, entityType: 'journal_entry', entityId: journalEntryId },
      ctx as never,
    )
    expect(detached).toBe(true)
  })

  it('refuses to attach to a journal entry in a different company', async () => {
    const journalEntryId = await makeJournalEntry()
    const fileId = await makeUploadedFile()
    const otherCompanyCtx = { auth: { ...ctx.auth, companyId: '00000000-0000-0000-0000-000000000002' } }

    await expect(
      resolvers.Mutation.attachFile(null, { fileId, entityType: 'journal_entry', entityId: journalEntryId }, otherCompanyCtx as never),
    ).rejects.toThrow()
  })
})

describe('auditTrail', () => {
  it('returns real audit_log entries for a journal entry, newest first', async () => {
    const journalEntryId = await makeJournalEntry()
    await pool.query(
      `INSERT INTO audit_log (user_id, company_id, action, table_name, record_id, old_values, new_values, created_at)
       VALUES ($1,$2,'UPDATE','journal_entries',$3,'{"status":"draft"}','{"status":"posted"}',NOW() - INTERVAL '1 hour')`,
      [userId, TEST_COMPANY_ID, journalEntryId],
    )
    await pool.query(
      `INSERT INTO audit_log (user_id, company_id, action, table_name, record_id, old_values, new_values, created_at)
       VALUES ($1,$2,'UPDATE','journal_entries',$3,'{"status":"posted"}','{"status":"cancelled"}',NOW())`,
      [userId, TEST_COMPANY_ID, journalEntryId],
    )

    const trail = await resolvers.Query.auditTrail(
      null,
      { tableName: 'journal_entries', recordId: journalEntryId },
      ctx as never,
    )
    const rows = trail as { action: string; newValues: string | null }[]
    expect(rows.length).toBe(2)
    expect(rows[0]!.action).toBe('UPDATE')
    expect(JSON.parse(rows[0]!.newValues ?? '{}')).toEqual({ status: 'cancelled' })
    expect(JSON.parse(rows[1]!.newValues ?? '{}')).toEqual({ status: 'posted' })
  })

  it('never returns rows for a tableName outside the allow-list', async () => {
    const trail = await resolvers.Query.auditTrail(null, { tableName: 'users', recordId: userId }, ctx as never)
    expect(trail).toEqual([])
  })

  it('never returns another company\'s audit rows for the same record id', async () => {
    const journalEntryId = await makeJournalEntry()
    await pool.query(
      `INSERT INTO audit_log (user_id, company_id, action, table_name, record_id, new_values)
       VALUES ($1,$2,'UPDATE','journal_entries',$3,'{"status":"posted"}')`,
      [userId, TEST_COMPANY_ID, journalEntryId],
    )
    const otherCompanyCtx = { auth: { ...ctx.auth, companyId: '00000000-0000-0000-0000-000000000002' } }
    const trail = await resolvers.Query.auditTrail(
      null,
      { tableName: 'journal_entries', recordId: journalEntryId },
      otherCompanyCtx as never,
    )
    expect(trail).toEqual([])
  })
})
