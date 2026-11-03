// The Attachments tab lists EVERY file uploaded for a project, not only the ones uploaded through
// itself. Found on AW-PRJ-2026-0080: a document in Client Documents, and the Attachments tab said
// "0 documents" (playbook #52). Real Postgres, one real file per source, so every query in
// lib/projectFiles.ts runs against the real tables (a wrong column would fail here, not in production).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { invalidatePermissionCache } from '@fnc-erp/permissions'
import { resolvers } from '../src/graphql/resolvers.js'
import { PROJECT_FILE_SOURCES, PROJECT_FILE_TABS } from '../src/lib/projectFiles.js'

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const OTHER_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const EMAIL_PREFIX = 'project-files-test-'
const CODE_PREFIX = 'PFTEST-'
const ALL_TABS = [...PROJECT_FILE_TABS]

type Who = 'admin' | 'creator' | 'techMember' | 'commercialMember' | 'pm' | 'techEditor'
const userIds = {} as Record<Who, string>
const employeeIds = {} as Record<'techMember' | 'commercialMember' | 'pm' | 'techEditor', string>
let projectId: string
let otherProjectId: string

interface FileRow {
  source: string
  tab: string
  fileId: string
  filename: string
  title: string
  detail: string | null
  attachmentId: string | null
  sizeBytes: number | null
}

function ctxFor(who: Who, role = 'user', companyId = COMPANY_ID) {
  return { auth: { companyId, userId: userIds[who], role, module: 'all', sessionId: 'pf-test' } } as never
}

const list = (who: Who, role: string, tabs?: string[], project = projectId) =>
  resolvers.Query.projectFiles(null, { projectId: project, ...(tabs ? { tabs } : {}) }, ctxFor(who, role)) as Promise<FileRow[]>

const asAdmin = (tabs?: string[], project = projectId) => list('admin', 'system_admin', tabs, project)

async function makeFile(name: string, opts: { companyId?: string; status?: string } = {}): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,$4,'application/pdf',2048,'attachment',$5) RETURNING id`,
    [opts.companyId ?? COMPANY_ID, userIds.admin, `pftest/${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`, name, opts.status ?? 'uploaded'],
  )
  return r.rows[0]!.id
}

async function attach(fileId: string, entityType: string, entityId: string, label?: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO document_attachments (file_id, entity_type, entity_id, label, uploaded_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [fileId, entityType, entityId, label ?? null, userIds.admin],
  )
  return r.rows[0]!.id
}

const one = async (sql: string, params: unknown[]): Promise<string> =>
  (await pool.query<{ id: string }>(sql, params)).rows[0]!.id

// One real file for each source, keyed by source key.
const fileOf: Record<string, string> = {}
let attachmentRowId: string

async function seedEverySource(): Promise<void> {
  const f = async (key: string, name = `${key}.pdf`) => (fileOf[key] = await makeFile(name))

  attachmentRowId = await attach(await f('attachments', 'plan.pdf'), 'project', projectId, '[Technical] plan.pdf')

  await pool.query(
    `INSERT INTO project_client_documents (project_id, title, file_id, document_number, revision, category) VALUES ($1,'Tender drawing',$2,'CD-001','B','rfq_tender')`,
    [projectId, await f('client_documents')],
  )
  await pool.query(
    `INSERT INTO engineering_documents (project_id, company_id, ref_number, discipline, doc_type, seq_no, title, file_id, revision)
     VALUES ($1,$2,'ENG-001','architectural','drawing',1,'Floor plan',$3,'A')`,
    [projectId, COMPANY_ID, await f('engineering')],
  )
  await attach(
    await f('rfq_phase'),
    'rfq_phase',
    await one(`INSERT INTO rfq_phases (project_id, phase_type) VALUES ($1,'engineering') RETURNING id`, [projectId]),
  )
  await pool.query(
    `INSERT INTO project_drawings (project_id, drawing_number, title, file_id) VALUES ($1,'DWG-1','Section',$2)`,
    [projectId, await f('drawings')],
  )
  await attach(await f('bid_technical'), 'bid_package_technical', projectId)
  await attach(await f('bid_commercial'), 'bid_package_commercial', projectId)
  await attach(
    await f('bid_deliverables'),
    'bid_deliverable',
    await one(`INSERT INTO bid_deliverables (project_id, name) VALUES ($1,'Method statement') RETURNING id`, [projectId]),
  )
  await pool.query(
    `INSERT INTO bid_supplier_quotations (project_id, supplier_name, item_description, file_id) VALUES ($1,'Acme Steel','Rebar',$2)`,
    [projectId, await f('bid_quotations')],
  )
  await attach(
    await f('tq'),
    'tq',
    await one(`INSERT INTO project_tqs (project_id, tq_number, subject) VALUES ($1,'TQ-001','Clarify') RETURNING id`, [projectId]),
  )
  const meetingId = await one(
    `INSERT INTO project_meetings (project_id, meeting_number, title, meeting_date) VALUES ($1,'MOM-001','Kick-off',CURRENT_DATE) RETURNING id`,
    [projectId],
  )
  await pool.query(`INSERT INTO project_meeting_attachments (meeting_id, file_id, title) VALUES ($1,$2,'Minutes')`, [
    meetingId,
    await f('meetings'),
  ])
  const contractId = await one(
    `INSERT INTO project_contracts (project_id, company_id, contract_number, contract_name, client_name, contract_value, contract_date, created_by)
     VALUES ($1,$2,'CTR-001','Main contract','Client',1000,CURRENT_DATE,$3) RETURNING id`,
    [projectId, COMPANY_ID, userIds.admin],
  )
  await attach(await f('contract_documents'), 'project_contract', contractId)
  const invoiceId = await one(
    `INSERT INTO project_invoices (contract_id, project_id, company_id, invoice_number, billing_method, invoice_date, due_date, created_by)
     VALUES ($1,$2,$3,'INV-001','fixed_lump_sum',CURRENT_DATE,CURRENT_DATE,$4) RETURNING id`,
    [contractId, projectId, COMPANY_ID, userIds.admin],
  )
  await attach(await f('invoice_documents'), 'project_invoice', invoiceId)
  await attach(
    await f('handover_certificates'),
    'handover_cert',
    await one(
      `INSERT INTO project_handover_certificates (project_id, certificate_no, title) VALUES ($1,'HC-1','Practical completion') RETURNING id`,
      [projectId],
    ),
  )
  const punchId = await one(
    `INSERT INTO project_punch_items (project_id, punch_no, category, title) VALUES ($1,'PL-001','A','Paint touch-up') RETURNING id`,
    [projectId],
  )
  await pool.query(`INSERT INTO project_punch_photos (punch_id, file_id, caption) VALUES ($1,$2,'Wall')`, [
    punchId,
    await f('punch_photos'),
  ])
  await attach(
    await f('rfis'),
    'rfi',
    await one(`INSERT INTO project_rfis (project_id, rfi_number, subject) VALUES ($1,'RFI-001','Query') RETURNING id`, [projectId]),
  )
  await attach(
    await f('site_instructions'),
    'site_instruction',
    await one(`INSERT INTO project_site_instructions (project_id, si_number, subject) VALUES ($1,'SI-001','Change') RETURNING id`, [projectId]),
  )
  await attach(
    await f('inspection_requests'),
    'inspection_request',
    await one(`INSERT INTO project_inspection_requests (project_id, ir_number, title) VALUES ($1,'IR-001','Rebar') RETURNING id`, [projectId]),
  )
  await attach(
    await f('ncrs'),
    'ncr',
    await one(`INSERT INTO project_ncrs (project_id, ncr_number, title, description) VALUES ($1,'NCR-001','Crack','x') RETURNING id`, [projectId]),
  )
  await attach(
    await f('hse_records'),
    'hse_record',
    await one(`INSERT INTO project_hse_records (project_id, record_type, title) VALUES ($1,'incident','Slip') RETURNING id`, [projectId]),
  )
  await attach(
    await f('daily_reports'),
    'daily_report',
    await one(`INSERT INTO project_daily_reports (project_id, report_number, company_id) VALUES ($1,'DR-001',$2) RETURNING id`, [projectId, COMPANY_ID]),
  )
  const transmittalId = await one(
    `INSERT INTO project_transmittals (project_id, transmittal_number, title) VALUES ($1,'TR-001','Issue') RETURNING id`,
    [projectId],
  )
  await attach(await f('transmittals'), 'transmittal', transmittalId)
  // A second file of the same source, as a transmittal ITEM (the source has two kinds of file).
  fileOf['transmittal_item'] = await makeFile('transmittal_item.pdf')
  await pool.query(`INSERT INTO project_transmittal_items (transmittal_id, document_title, file_id) VALUES ($1,'Spec book',$2)`, [
    transmittalId,
    fileOf['transmittal_item'],
  ])
}

async function cleanup(): Promise<void> {
  const projects = `SELECT id FROM projects WHERE code LIKE $1`
  const p = [`${CODE_PREFIX}%`]
  await pool.query(
    `DELETE FROM document_attachments WHERE file_id IN (SELECT id FROM files WHERE file_key LIKE 'pftest/%')`,
  )
  for (const [table, col] of [
    ['project_transmittal_items', `transmittal_id IN (SELECT id FROM project_transmittals WHERE project_id IN (${projects}))`],
    ['project_punch_photos', `punch_id IN (SELECT id FROM project_punch_items WHERE project_id IN (${projects}))`],
    ['project_meeting_attachments', `meeting_id IN (SELECT id FROM project_meetings WHERE project_id IN (${projects}))`],
    ['project_invoices', `project_id IN (${projects})`],
    ['project_contracts', `project_id IN (${projects})`],
    ['project_client_documents', `project_id IN (${projects})`],
    ['engineering_documents', `project_id IN (${projects})`],
    ['project_drawings', `project_id IN (${projects})`],
    ['bid_supplier_quotations', `project_id IN (${projects})`],
    ['bid_deliverables', `project_id IN (${projects})`],
    ['rfq_phases', `project_id IN (${projects})`],
    ['project_tqs', `project_id IN (${projects})`],
    ['project_meetings', `project_id IN (${projects})`],
    ['project_handover_certificates', `project_id IN (${projects})`],
    ['project_punch_items', `project_id IN (${projects})`],
    ['project_rfis', `project_id IN (${projects})`],
    ['project_site_instructions', `project_id IN (${projects})`],
    ['project_inspection_requests', `project_id IN (${projects})`],
    ['project_ncrs', `project_id IN (${projects})`],
    ['project_hse_records', `project_id IN (${projects})`],
    ['project_daily_reports', `project_id IN (${projects})`],
    ['project_transmittals', `project_id IN (${projects})`],
    ['project_members', `project_id IN (${projects})`],
  ] as const) {
    await pool.query(`DELETE FROM ${table} WHERE ${col}`, p)
  }
  await pool.query(`DELETE FROM files WHERE file_key LIKE 'pftest/%'`)
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, p)
  await pool.query(`DELETE FROM employees WHERE company_id=$1 AND first_name LIKE 'PFTEST%'`, [COMPANY_ID])
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${EMAIL_PREFIX}%`])
}

async function member(who: 'techMember' | 'commercialMember' | 'pm' | 'techEditor', type: string | null): Promise<void> {
  employeeIds[who] = await one(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date) VALUES ($1,$2,$3,'Test',CURRENT_DATE) RETURNING id`,
    [COMPANY_ID, userIds[who], `PFTEST-${who}`],
  )
  if (who === 'pm') {
    await pool.query(`UPDATE projects SET project_manager_id=$1 WHERE id=$2`, [employeeIds[who], projectId])
  } else {
    await pool.query(`INSERT INTO project_members (project_id, employee_id, member_type, is_active) VALUES ($1,$2,$3,true)`, [
      projectId,
      employeeIds[who],
      type,
    ])
  }
}

const grant = async (who: Who, keys: string[]) => {
  for (const key of keys) {
    await pool.query(
      `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level`,
      [userIds[who], COMPANY_ID, key, key === 'projects.edit' ? 'edit' : 'view'],
    )
  }
  await invalidatePermissionCache(userIds[who], COMPANY_ID)
}

beforeAll(async () => {
  for (const who of ['admin', 'creator', 'techMember', 'commercialMember', 'pm', 'techEditor'] as const) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [`${EMAIL_PREFIX}${who}@fnc-erp.local`],
    )
    userIds[who] = r.rows[0]!.id
  }
  await cleanup()
  projectId = await one(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,'Files test project','ongoing',$3) RETURNING id`,
    [COMPANY_ID, `${CODE_PREFIX}A`, userIds.creator],
  )
  otherProjectId = await one(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,'Other company project','ongoing',$3) RETURNING id`,
    [OTHER_COMPANY_ID, `${CODE_PREFIX}B`, userIds.admin],
  )
  await seedEverySource()
  await member('techMember', 'technical')
  await member('commercialMember', 'commercial')
  await member('pm', null)
  await member('techEditor', 'technical')
  const viewAllTabs = [
    'projects.view',
    'projects.attachments.view',
    'projects.client_documents.view',
    'projects.engineering.view',
    'projects.bidding.view',
    'projects.meetings.view',
    'projects.contracts.view',
    'projects.handover.view',
    'projects.execution.view',
  ]
  await grant('techMember', viewAllTabs)
  await grant('commercialMember', viewAllTabs)
  await grant('pm', viewAllTabs)
  await grant('techEditor', [...viewAllTabs, 'projects.edit'])
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

// The one file each source has in this test (transmittals has two).
const EXPECTED_SOURCES = PROJECT_FILE_SOURCES.map((s) => s.key)

describe('projectFiles - everything uploaded for a project', () => {
  it('lists a file from every source that takes uploads, each tagged with its tab', async () => {
    const rows = await asAdmin(ALL_TABS)

    const bySource = new Map<string, FileRow[]>()
    for (const r of rows) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r])
    // Every registered source returned its file (daily_reports has no machinery photo here: it needs a PO).
    for (const key of EXPECTED_SOURCES) expect(bySource.has(key), `source ${key}`).toBe(true)
    expect(bySource.get('transmittals')).toHaveLength(2)
    for (const s of PROJECT_FILE_SOURCES) {
      for (const r of bySource.get(s.key) ?? []) expect(r.tab, s.key).toBe(s.tab)
    }
    // No source other than the registered ones, and nothing twice.
    expect(rows.length).toBe(EXPECTED_SOURCES.length + 1)
    expect(new Set(rows.map((r) => r.fileId)).size).toBe(rows.length)
  })

  it('reads each source\'s own title and detail (the document, its number and revision)', async () => {
    const rows = await asAdmin(ALL_TABS)
    const get = (key: string) => rows.find((r) => r.source === key)!
    expect(get('client_documents')).toMatchObject({ title: 'Tender drawing', detail: 'CD-001 · Rev B' })
    expect(get('engineering')).toMatchObject({ title: 'Floor plan', detail: 'ENG-001 · Rev A' })
    expect(get('drawings')).toMatchObject({ title: 'Section', detail: 'DWG-1' })
    expect(get('meetings')).toMatchObject({ title: 'Minutes', detail: 'MOM-001' })
    expect(get('bid_quotations')).toMatchObject({ title: 'Acme Steel', detail: 'Rebar' })
    expect(get('bid_deliverables').detail).toBe('Method statement')
    expect(get('attachments').title).toBe('[Technical] plan.pdf')
    expect(get('attachments').sizeBytes).toBe(2048)
  })

  it("only the Attachments tab's own uploads carry an id that can be removed from that tab", async () => {
    const rows = await asAdmin(ALL_TABS)
    expect(rows.find((r) => r.source === 'attachments')!.attachmentId).toBe(attachmentRowId)
    expect(rows.filter((r) => r.source !== 'attachments').every((r) => r.attachmentId === null)).toBe(true)
  })

  it.each(PROJECT_FILE_TABS)('asking for only the %s tab returns only that tab\'s files', async (tab) => {
    const rows = await asAdmin([tab])
    const expectedKeys = PROJECT_FILE_SOURCES.filter((s) => s.tab === tab).map((s) => s.key)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.tab === tab)).toBe(true)
    expect(new Set(rows.map((r) => r.source))).toEqual(new Set(expectedKeys))
  })

  it('with no tabs named, returns just the Attachments tab\'s own uploads (the old behaviour)', async () => {
    const rows = await asAdmin()
    expect(rows.map((r) => r.source)).toEqual(['attachments'])
  })

  it('ignores a tab name it does not know', async () => {
    const rows = await asAdmin(['attachments', 'not_a_tab', 'procurement'])
    expect(rows.map((r) => r.source)).toEqual(['attachments'])
  })

  it('leaves out a deleted file, and a file that belongs to another company', async () => {
    const deleted = await makeFile('gone.pdf', { status: 'deleted' })
    const foreign = await makeFile('foreign.pdf', { companyId: OTHER_COMPANY_ID })
    await attach(deleted, 'project', projectId, 'gone')
    await attach(foreign, 'project', projectId, 'foreign')

    const rows = await asAdmin(['attachments'])

    expect(rows.map((r) => r.title)).toEqual(['[Technical] plan.pdf'])
  })

  it('lists newest first', async () => {
    const old = await makeFile('old.pdf')
    const id = await attach(old, 'project', projectId, 'oldest')
    await pool.query(`UPDATE document_attachments SET created_at = NOW() - interval '10 days' WHERE id=$1`, [id])
    const fresh = await makeFile('fresh.pdf')
    await attach(fresh, 'project', projectId, 'newest')

    const rows = await asAdmin(['attachments'])

    expect(rows[0]!.title).toBe('newest')
    expect(rows[rows.length - 1]!.title).toBe('oldest')
  })

  it("refuses a project of another company, even for an administrator", async () => {
    await expect(asAdmin(['attachments'], otherProjectId)).rejects.toThrow('Project not found')
  })
})

describe('projectFiles - who sees which tab\'s files', () => {
  it('a creator with no tab permission sees nothing, not even the Attachments tab\'s own uploads', async () => {
    // The project's own creator may open the project, but each tab's files need that tab's permission.
    const rows = await list('creator', 'user', ALL_TABS)
    expect(rows).toEqual([])
  })

  it("shows a tab's files only to someone holding that tab's own permission", async () => {
    await grant('creator', ['projects.client_documents.view', 'projects.meetings.view'])

    const rows = await list('creator', 'user', ALL_TABS)

    expect(new Set(rows.map((r) => r.tab))).toEqual(new Set(['client_documents', 'meetings']))
  })

  it('keeps bid-pricing files from a technical team member, and shows the rest of the same tabs', async () => {
    const rows = await list('techMember', 'user', ALL_TABS)
    const sources = new Set(rows.map((r) => r.source))

    for (const hidden of ['bid_commercial', 'bid_quotations', 'contract_documents', 'invoice_documents'])
      expect(sources.has(hidden), hidden).toBe(false)
    for (const shown of ['bid_technical', 'bid_deliverables', 'tq', 'client_documents', 'engineering', 'meetings', 'rfis'])
      expect(sources.has(shown), shown).toBe(true)
  })

  it('shows everything to a commercial member, to the PM, and to a technical member who also holds projects.edit', async () => {
    const everything = (await asAdmin(ALL_TABS)).length
    for (const [who] of [['commercialMember'], ['pm'], ['techEditor']] as const) {
      const rows = await list(who, 'user', ALL_TABS)
      const sources = new Set(rows.map((r) => r.source))
      for (const key of ['bid_commercial', 'bid_quotations', 'contract_documents', 'invoice_documents'])
        expect(sources.has(key), `${who} ${key}`).toBe(true)
      expect(rows.length, who).toBe(everything)
    }
  })

  it('refuses someone who has no relationship to the project and no projects.view', async () => {
    await expect(list('creator', 'user', ALL_TABS, otherProjectId)).rejects.toThrow()
  })
})
