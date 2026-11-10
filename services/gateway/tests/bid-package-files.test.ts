// The Bidding tab's four file areas (Technical, Commercial, Cost Analysis, Clarifications) share one list,
// one upload and one delete. Cost Analysis and Clarifications were added in migration 321; Clarifications
// replaced the Technical Queries screen. Real Postgres through the real ApolloServer({ typeDefs, resolvers }),
// the selection sets the web sends, so a stale schema field or a missing entity type in the CHECK constraint
// fails here and not in the browser (playbook #20, #73).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { invalidatePermissionCache } from '@fnc-erp/permissions'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { BID_PACKAGE_TYPES, bidPackageEntityTypes, bidTypeFromEntityType, parseBidPackageType } from '../src/lib/bidPackages.js'

// The upload notice is fire-and-forget and would write notifications and outbox rows for the test users.
const notifyUpload = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/projectNotify.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/projectNotify.js')>()),
  notifyProjectFileUploadGW: notifyUpload,
}))

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const OTHER_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const EMAIL_PREFIX = 'bid-pkg-test-'
const CODE_PREFIX = 'BPKGTEST-'
const FILE_PREFIX = 'bpkgtest/'

type Who = 'admin' | 'viewer' | 'techEditor' | 'commercialEditor' | 'pm' | 'outsider'
const WHO: Who[] = ['admin', 'viewer', 'techEditor', 'commercialEditor', 'pm', 'outsider']
const userIds = {} as Record<Who, string>
let projectId: string
let otherProjectId: string

type TestCtx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })
const ctxFor = (who: Who, companyId = COMPANY_ID): TestCtx => ({
  auth: { companyId, userId: userIds[who], role: who === 'admin' ? 'system_admin' : 'user', module: 'all', sessionId: 'bpkg-test' },
})

const LIST = `query($projectId: ID!) { bidPackageFiles(projectId: $projectId) { id fileId bidType filename mimeType sizeBytes title description createdAt downloadUrl } }`
const UPLOAD = `mutation($projectId: ID!, $bidType: String!, $fileId: ID!, $title: String, $description: String) {
  uploadBidPackageFile(projectId: $projectId, bidType: $bidType, fileId: $fileId, title: $title, description: $description) { id fileId bidType filename title }
}`
const DELETE = `mutation($attachmentId: ID!, $projectId: ID!) { deleteBidPackageFile(attachmentId: $attachmentId, projectId: $projectId) }`

interface PkgFile { id: string; fileId: string; bidType: string; filename: string; title: string | null }

async function run<T>(who: Who, query: string, variables: Record<string, unknown>, companyId = COMPANY_ID): Promise<T> {
  const res = await server.executeOperation({ query, variables }, { contextValue: ctxFor(who, companyId) })
  if (res.body.kind !== 'single') throw new Error('unexpected response kind')
  const { data, errors } = res.body.singleResult
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
  return data as T
}

const list = async (who: Who, project = projectId, companyId = COMPANY_ID) =>
  (await run<{ bidPackageFiles: PkgFile[] }>(who, LIST, { projectId: project }, companyId)).bidPackageFiles
const upload = async (who: Who, bidType: string, fileId: string, title?: string, project = projectId, companyId = COMPANY_ID) =>
  (await run<{ uploadBidPackageFile: PkgFile[] }>(who, UPLOAD, { projectId: project, bidType, fileId, title }, companyId)).uploadBidPackageFile
const remove = async (who: Who, attachmentId: string, project = projectId) =>
  (await run<{ deleteBidPackageFile: boolean }>(who, DELETE, { attachmentId, projectId: project })).deleteBidPackageFile

async function makeFile(name: string, companyId = COMPANY_ID): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,$4,'application/pdf',2048,'attachment','uploaded') RETURNING id`,
    [companyId, userIds.admin, `${FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`, name],
  )
  return r.rows[0]!.id
}

async function attachmentRows(entityType?: string): Promise<{ id: string; entity_type: string }[]> {
  const r = await pool.query<{ id: string; entity_type: string }>(
    `SELECT da.id, da.entity_type FROM document_attachments da JOIN files f ON f.id = da.file_id
     WHERE f.file_key LIKE $1 AND da.entity_id = $2 ${entityType ? 'AND da.entity_type = $3' : ''}`,
    entityType ? [`${FILE_PREFIX}%`, projectId, entityType] : [`${FILE_PREFIX}%`, projectId],
  )
  return r.rows
}

const one = async (sql: string, params: unknown[]): Promise<string> => (await pool.query<{ id: string }>(sql, params)).rows[0]!.id

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM document_attachments WHERE file_id IN (SELECT id FROM files WHERE file_key LIKE $1)`, [`${FILE_PREFIX}%`])
  await pool.query(`DELETE FROM files WHERE file_key LIKE $1`, [`${FILE_PREFIX}%`])
  await pool.query(`DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE code LIKE $1)`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM project_activity_log WHERE project_id IN (SELECT id FROM projects WHERE code LIKE $1)`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE company_id=$1 AND first_name LIKE 'BPKGTEST%'`, [COMPANY_ID])
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${EMAIL_PREFIX}%`])
}

async function makeMember(who: Who, type: string | null, asPm = false): Promise<void> {
  const employeeId = await one(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date) VALUES ($1,$2,$3,'Test',CURRENT_DATE) RETURNING id`,
    [COMPANY_ID, userIds[who], `BPKGTEST-${who}`],
  )
  if (asPm) await pool.query(`UPDATE projects SET project_manager_id=$1 WHERE id=$2`, [employeeId, projectId])
  else await pool.query(`INSERT INTO project_members (project_id, employee_id, member_type, is_active) VALUES ($1,$2,$3,true)`, [projectId, employeeId, type])
}

async function grant(who: Who, keys: { key: string; level: 'view' | 'edit' }[]): Promise<void> {
  for (const { key, level } of keys) {
    await pool.query(
      `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level`,
      [userIds[who], COMPANY_ID, key, level],
    )
  }
  await invalidatePermissionCache(userIds[who], COMPANY_ID)
}

const VIEW = { key: 'projects.bidding.view', level: 'view' } as const
const EDIT = { key: 'projects.bidding.edit', level: 'edit' } as const

beforeAll(async () => {
  for (const who of WHO) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [`${EMAIL_PREFIX}${who}@fnc-erp.local`],
    )
    userIds[who] = r.rows[0]!.id
  }
  await cleanup()
  projectId = await one(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,'Bid package test project','ongoing',$3) RETURNING id`,
    [COMPANY_ID, `${CODE_PREFIX}A`, userIds.admin],
  )
  otherProjectId = await one(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,'Other company project','ongoing',$3) RETURNING id`,
    [OTHER_COMPANY_ID, `${CODE_PREFIX}B`, userIds.admin],
  )
  await makeMember('techEditor', 'technical')
  await makeMember('commercialEditor', 'commercial')
  await makeMember('pm', null, true)
  await grant('viewer', [VIEW])
  await grant('techEditor', [VIEW, EDIT])
  await grant('commercialEditor', [VIEW, EDIT])
  await grant('pm', [VIEW, EDIT])
  // 'outsider' holds no bidding permission at all.
})

beforeEach(async () => {
  notifyUpload.mockClear()
  await pool.query(`DELETE FROM document_attachments WHERE entity_id=$1 AND entity_type LIKE 'bid_package_%'`, [projectId])
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

const TYPES = ['technical', 'commercial', 'cost_analysis', 'clarifications'] as const

describe('bid package types', () => {
  it('maps each type to its own entity type and back, never defaulting', () => {
    expect(Object.fromEntries(TYPES.map((t) => [t, BID_PACKAGE_TYPES[t].entityType]))).toEqual({
      technical: 'bid_package_technical',
      commercial: 'bid_package_commercial',
      cost_analysis: 'bid_package_cost_analysis',
      clarifications: 'bid_package_clarifications',
    })
    for (const t of TYPES) expect(bidTypeFromEntityType(BID_PACKAGE_TYPES[t].entityType)).toBe(t)
    expect(() => bidTypeFromEntityType('tq')).toThrow('Unknown bid package entity type')
    expect(() => bidTypeFromEntityType('bid_package_other')).toThrow('Unknown bid package entity type')
  })

  it('refuses a type it does not know and names the allowed ones', () => {
    expect(() => parseBidPackageType('pricing')).toThrow('technical')
    expect(() => parseBidPackageType('')).toThrow('bidType must be one of')
  })

  it('keeps Commercial and Cost Analysis from a technical-only member and nothing else', () => {
    expect(bidPackageEntityTypes(false)).toEqual(['bid_package_technical', 'bid_package_clarifications'])
    expect(bidPackageEntityTypes(true)).toHaveLength(4)
  })
})

describe('upload, list and delete', () => {
  it.each(TYPES)('%s: uploads a file, lists it under its own type, and deletes it', async (type) => {
    const fileId = await makeFile(`${type}.pdf`)

    const afterUpload = await upload('admin', type, fileId, `${type} file`)

    expect(afterUpload.map((f) => f.bidType)).toEqual([type])
    expect(afterUpload[0]).toMatchObject({ fileId, filename: `${type}.pdf`, title: `${type} file` })
    expect((await attachmentRows()).map((r) => r.entity_type)).toEqual([BID_PACKAGE_TYPES[type].entityType])
    expect((await list('admin')).map((f) => f.bidType)).toEqual([type])

    expect(await remove('admin', afterUpload[0]!.id)).toBe(true)
    expect(await list('admin')).toEqual([])
    expect(await attachmentRows()).toEqual([])
  })

  it('keeps the four areas apart when each holds a file', async () => {
    for (const t of TYPES) await upload('admin', t, await makeFile(`${t}.pdf`), t)

    const files = await list('admin')

    expect(Object.fromEntries(files.map((f) => [f.bidType, f.title]))).toEqual({
      technical: 'technical',
      commercial: 'commercial',
      cost_analysis: 'cost_analysis',
      clarifications: 'clarifications',
    })
  })

  it('uses the file name when no title is given, and tells the team which area it was', async () => {
    const out = await upload('admin', 'cost_analysis', await makeFile('rates.xlsx'))
    expect(out[0]!.title).toBe('rates.xlsx')
    expect(notifyUpload).toHaveBeenCalledTimes(1)
    expect(notifyUpload.mock.calls[0]![3]).toBe('Bid Package File (Cost Analysis)')
  })

  it('refuses an unknown type, and writes nothing', async () => {
    const fileId = await makeFile('x.pdf')
    await expect(upload('admin', 'pricing', fileId)).rejects.toThrow('bidType must be one of')
    await expect(upload('admin', 'tq', fileId)).rejects.toThrow('bidType must be one of')
    expect(await attachmentRows()).toEqual([])
  })

  it("refuses another company's file and another company's project", async () => {
    const foreignFile = await makeFile('foreign.pdf', OTHER_COMPANY_ID)
    await expect(upload('admin', 'clarifications', foreignFile)).rejects.toThrow('File not found')
    const ownFile = await makeFile('own.pdf')
    await expect(upload('admin', 'clarifications', ownFile, undefined, otherProjectId)).rejects.toThrow('Project not found')
    await expect(list('admin', otherProjectId)).rejects.toThrow('Project not found')
    expect(await attachmentRows()).toEqual([])
  })

  it('does not delete a file through a different project id', async () => {
    const out = await upload('admin', 'clarifications', await makeFile('keep.pdf'))
    const other = await one(
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,'Second project','ongoing',$3) RETURNING id`,
      [COMPANY_ID, `${CODE_PREFIX}C`, userIds.admin],
    )
    await remove('admin', out[0]!.id, other)
    expect(await attachmentRows()).toHaveLength(1)
  })

  it('does not list a deleted file', async () => {
    const fileId = await makeFile('gone.pdf')
    await upload('admin', 'technical', fileId)
    await pool.query(`UPDATE files SET status='deleted' WHERE id=$1`, [fileId])
    expect(await list('admin')).toEqual([])
  })
})

describe('who may do what', () => {
  it('a view-only member lists Technical, Commercial and Clarifications but cannot upload or delete', async () => {
    const t = await upload('admin', 'technical', await makeFile('t.pdf'))
    await upload('admin', 'commercial', await makeFile('c.pdf'))
    await upload('admin', 'clarifications', await makeFile('q.pdf'))
    await upload('admin', 'cost_analysis', await makeFile('a.pdf'))

    // A view-only member who is on no project team is not a technical member, so as for Commercial today
    // they see everything the API returns for their role.
    expect((await list('viewer')).map((f) => f.bidType).sort()).toEqual(['clarifications', 'commercial', 'cost_analysis', 'technical'])
    await expect(upload('viewer', 'clarifications', await makeFile('v.pdf'))).rejects.toThrow('edit')
    await expect(remove('viewer', t[0]!.id)).rejects.toThrow('edit')
    expect(await attachmentRows()).toHaveLength(4)
  })

  it('someone with no bidding permission sees and changes nothing', async () => {
    await upload('admin', 'clarifications', await makeFile('q.pdf'))
    await expect(list('outsider')).rejects.toThrow()
    await expect(upload('outsider', 'clarifications', await makeFile('o.pdf'))).rejects.toThrow()
    expect(await attachmentRows()).toHaveLength(1)
  })

  it('a technical member with bidding.edit works with Technical and Clarifications', async () => {
    for (const t of ['technical', 'clarifications'] as const) {
      const out = await upload('techEditor', t, await makeFile(`${t}.pdf`))
      expect(out.map((f) => f.bidType)).toContain(t)
    }
    const files = await list('techEditor')
    expect(files.map((f) => f.bidType).sort()).toEqual(['clarifications', 'technical'])
    expect(await remove('techEditor', files.find((f) => f.bidType === 'clarifications')!.id)).toBe(true)
    expect((await list('techEditor')).map((f) => f.bidType)).toEqual(['technical'])
  })

  // Commercial was hidden by the page only until 2026-11-10; Cost Analysis was server-enforced from the start.
  it.each([
    ['commercial', 'Commercial', 'bid_package_commercial'],
    ['cost_analysis', 'Cost Analysis', 'bid_package_cost_analysis'],
  ] as const)('a technical member does not see, add or delete %s files, even by calling the API', async (type, label, entityType) => {
    const admin = await upload('admin', type, await makeFile(`${type}.xlsx`))
    const id = admin[0]!.id

    expect((await list('techEditor')).map((f) => f.bidType)).not.toContain(type)
    await expect(upload('techEditor', type, await makeFile(`mine-${type}.xlsx`))).rejects.toThrow(`You do not have access to ${label} files`)
    expect(await remove('techEditor', id)).toBe(true) // the call succeeds, but it matched nothing
    expect(await attachmentRows(entityType)).toHaveLength(1)
  })

  it('a technical member also gets nothing back from an upload that is theirs to make', async () => {
    const out = await upload('techEditor', 'technical', await makeFile('t.pdf'))
    await upload('admin', 'cost_analysis', await makeFile('rates.xlsx'))
    await upload('admin', 'commercial', await makeFile('prices.xlsx'))
    expect(out.map((f) => f.bidType)).toEqual(['technical'])
    const again = await upload('techEditor', 'clarifications', await makeFile('q.pdf'))
    expect(again.map((f) => f.bidType).sort()).toEqual(['clarifications', 'technical'])
  })

  it.each(['commercialEditor', 'pm', 'admin'] as const)('%s sees and manages all four areas', async (who) => {
    for (const t of TYPES) await upload(who, t, await makeFile(`${who}-${t}.pdf`))
    const files = await list(who)
    expect(files.map((f) => f.bidType).sort()).toEqual([...TYPES].sort())
    for (const type of ['commercial', 'cost_analysis'] as const) {
      expect(await remove(who, files.find((f) => f.bidType === type)!.id)).toBe(true)
      expect((await list(who)).map((f) => f.bidType)).not.toContain(type)
    }
  })
})

describe('the old Technical Queries API is gone', () => {
  it.each([
    ['query', 'projectTQs(projectId: "00000000-0000-0000-0000-000000000000") { id }'],
    ['mutation', 'createTQ(projectId: "00000000-0000-0000-0000-000000000000", subject: "x") { id }'],
    ['mutation', 'uploadTQFile(tqId: "00000000-0000-0000-0000-000000000000", fileId: "00000000-0000-0000-0000-000000000000") { id }'],
  ])('%s %s no longer exists', async (kind, field) => {
    const res = await server.executeOperation({ query: `${kind} { ${field} }` }, { contextValue: ctxFor('admin') })
    if (res.body.kind !== 'single') throw new Error('unexpected response kind')
    expect(res.body.singleResult.errors?.[0]?.message).toMatch(/Cannot query field/)
  })
})
