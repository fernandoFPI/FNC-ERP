// The Performance tab of an employee (lib/employeePerformance.ts). Real Postgres through the real resolvers: the logs are written the way the
// workflow writes them, then the tab's figures are read back and compared with what the story above them says they must be.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  fillTrend,
  groupSendBacks,
  lastMonths,
  normalizePerformanceDays,
  summariseAudit,
  SEND_BACK_ACTIONS,
} from '../src/lib/employeePerformance.js'

const COMPANY = '00000000-0000-0000-0000-000000000001'
const TAG = 'PERF-'
const EMAIL = (n: string) => `perf-test-${n}@fnc-erp.local`

type Ctx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('expected a value')
  return v
}
const ctxOf = (userId: string, role = 'user', companyId = COMPANY): Ctx => ({ auth: { companyId, userId, role, module: 'all', sessionId: 'perf-test' } })

interface Perf {
  employeeId: string
  linked: boolean
  days: number | null
  requisitions: { organized: number; completed: number; inProgress: number; cancelled: number; sentBack: number }
  sentBackStages: { key: string; count: number; examples: { number: string; note: string | null }[] }[]
  workSentBack: { key: string; count: number }[]
  trend: { month: string; total: number; sentBack: number }[]
  audit: { passedFirst: number; returned: number; passedAfterReturn: number }
  claims: { key: string; filed: number; rejected: number }[]
  approver: { key: string; approved: number; sentBack: number; medianHours: number | null }[]
}

let uO: string // the employee under test: organizes requisitions, prices, files claims
let uX: string // another organizer
let uP: string // a pricer who is not the organizer
let uA: string // an approver
let uHr: string // holds hr.employees.performance
let uMgr: string // the employee's direct manager
let uPlain: string // nobody
let uAdmin: string
let eO: string
let eA: string
let eMgr: string
let eUnlinked: string
let otherCompany: string
let otherAdmin: string
let vendorId: string
const reqs: Record<string, string> = {}

async function mkUser(n: string): Promise<string> {
  const r = await pool.query<{ id: string }>(`INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used') RETURNING id`, [EMAIL(n)])
  return must(r.rows[0]).id
}
async function mkEmp(company: string, user: string | null, first: string, manager: string | null = null): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, manager_id) VALUES ($1,$2,$3,'Perf',CURRENT_DATE,$4) RETURNING id`,
    [company, user, `${TAG}${first}`, manager],
  )
  return must(r.rows[0]).id
}
/** hoursAgo: how long before now the row was written (a requisition made `ageDays` ago has its rows after it). */
async function mkReq(key: string, organizer: string, status: string, ageDays = 0, company = COMPANY): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO requisitions (company_id, requisition_number, organizer_id, status, created_at) VALUES ($1,$2,$3,$4, NOW() - make_interval(days => $5)) RETURNING id`,
    [company, `${TAG}${key}`, organizer, status, ageDays],
  )
  reqs[key] = must(r.rows[0]).id
  return reqs[key]
}
async function log(req: string, action: string, from: string, to: string, actor: string, hoursAgo: number, notes: string | null = null): Promise<void> {
  await pool.query(
    `INSERT INTO requisition_approval_log (requisition_id, from_status, to_status, action, actor_id, notes, created_at) VALUES ($1,$2,$3,$4,$5,$6, NOW() - make_interval(hours => $7))`,
    [req, from, to, action, actor, notes, hoursAgo],
  )
}
async function mkLine(req: string, n: number, extra = ''): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (requisition_id, description, line_number, qty_ordered, unit_price, total_price, uom, currency_code${extra ? ', ' + extra.split('=')[0] : ''})
     VALUES ($1,'x',$2,1,1,1,'unit','USD'${extra ? ', ' + extra.split('=')[1] : ''}) RETURNING id`,
    [req, n],
  )
  return must(r.rows[0]).id
}
async function mkPurchase(line: string, boughtBy: string, over: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO po_line_purchases (po_line_id, vendor_id, currency_code, qty, actual_unit_price, bought_by, over_tolerance) VALUES ($1,$2,'USD',1,1,$3,$4)`,
    [line, vendorId, boughtBy, over],
  )
}
async function mkPo(key: string, organizer: string, actions: [string, number][]): Promise<void> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, created_by, organizer_id) VALUES ($1,$2,$3,'finance_review','USD','project',$4,$4) RETURNING id`,
    [COMPANY, `${TAG}${key}`, vendorId, organizer],
  )
  const id = must(r.rows[0]).id
  for (const [action, hoursAgo] of actions) {
    await pool.query(
      `INSERT INTO po_approval_log (po_id, from_status, to_status, action, actor_id, created_at) VALUES ($1,'finance_review','x',$2,$3, NOW() - make_interval(hours => $4))`,
      [id, action, organizer, hoursAgo],
    )
  }
}
async function mkClaim(n: string, emp: string, status: string, opts: { rejected?: boolean; approvedBy?: string; rejectedBy?: string; submittedHoursAgo?: number; company?: string } = {}): Promise<void> {
  const submitted = status === 'draft' ? null : (opts.submittedHoursAgo ?? 1)
  await pool.query(
    `INSERT INTO expense_claims (company_id, claim_number, employee_id, employee_name, status, submitted_at, rejected_at, rejected_by, approved_by, approved_at)
     VALUES ($1,$2,$3,'x',$4, CASE WHEN $5::int IS NULL THEN NULL ELSE NOW() - make_interval(hours => $5::int) END, $6, $7, $8, $9)`,
    [opts.company ?? COMPANY, `${TAG}${n}`, emp, status, submitted, opts.rejected ? new Date() : null, opts.rejectedBy ?? null, opts.approvedBy ?? null, opts.approvedBy ? new Date() : null],
  )
}
async function mkAdvance(n: string, emp: string, status: string): Promise<void> {
  await pool.query(
    `INSERT INTO employee_advances (company_id, advance_number, employee_id, employee_name, amount, cash_account_id, advance_account_id, status, submitted_at)
     VALUES ($1,$2,$3,'x',100,(SELECT id FROM chart_of_accounts LIMIT 1),(SELECT id FROM chart_of_accounts LIMIT 1),$4::varchar, CASE WHEN $4::varchar = 'draft' THEN NULL ELSE NOW() END)`,
    [COMPANY, `${TAG}${n}`, emp, status],
  )
}

const perf = async (employeeId: string, days: number | null | undefined, as: Ctx): Promise<Perf | null> =>
  (await resolvers.Query.employeePerformance(null, { employeeId, days }, as as never)) as Perf | null
const canView = async (employeeId: string, as: Ctx): Promise<boolean> =>
  (await resolvers.Query.canViewEmployeePerformance(null, { employeeId }, as as never)) as boolean
const stage = (p: Perf, key: string) => must(p.sentBackStages.find((s) => s.key === key))
const work = (p: Perf, key: string) => must(p.workSentBack.find((w) => w.key === key)).count

async function cleanup(): Promise<void> {
  const myReqs = `SELECT id FROM requisitions WHERE requisition_number LIKE $1`
  const myPos = `SELECT id FROM purchase_orders WHERE po_number LIKE $1`
  const like = [`${TAG}%`]
  await pool.query(`DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE requisition_id IN (${myReqs}))`, like)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${myReqs})`, like)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${myReqs})`, like)
  await pool.query(`DELETE FROM requisitions WHERE requisition_number LIKE $1`, like)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${myPos})`, like)
  await pool.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, like)
  await pool.query(`DELETE FROM expense_claims WHERE claim_number LIKE $1`, like)
  await pool.query(`DELETE FROM employee_advances WHERE advance_number LIKE $1`, like)
  await pool.query(`UPDATE employees SET manager_id = NULL WHERE first_name LIKE $1`, like)
  await pool.query(`DELETE FROM employees WHERE first_name LIKE $1`, like)
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'perf-test-%')`)
  await pool.query(`DELETE FROM users WHERE email LIKE 'perf-test-%'`)
  await pool.query(`DELETE FROM vendors WHERE name LIKE $1`, like)
  await pool.query(`DELETE FROM companies WHERE name LIKE $1`, like)
}

beforeAll(async () => {
  await cleanup()
  uO = await mkUser('o')
  uX = await mkUser('x')
  uP = await mkUser('p')
  uA = await mkUser('a')
  uHr = await mkUser('hr')
  uMgr = await mkUser('mgr')
  uPlain = await mkUser('plain')
  uAdmin = await mkUser('admin')
  otherAdmin = await mkUser('other-admin')
  const oc = await pool.query<{ id: string }>(`INSERT INTO companies (name, legal_name) VALUES ($1,$1) RETURNING id`, [`${TAG}Other Co`])
  otherCompany = must(oc.rows[0]).id
  await pool.query(`INSERT INTO user_permissions (user_id, company_id, permission_key, access_level) VALUES ($1,$2,'hr.employees.performance','view')`, [uHr, COMPANY])
  eMgr = await mkEmp(COMPANY, uMgr, 'Manager')
  eO = await mkEmp(COMPANY, uO, 'Employee', eMgr)
  eA = await mkEmp(COMPANY, uA, 'Approver')
  eUnlinked = await mkEmp(COMPANY, null, 'Unlinked')
  vendorId = must((await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [COMPANY, `${TAG}Vendor`])).rows[0]).id

  // R1 completed, R2 cancelled (sent back once), R3 in progress (sent back three ways), R4 a draft. All organized by O.
  await mkReq('R1', uO, 'completed')
  await mkReq('R2', uO, 'cancelled')
  await mkReq('R3', uO, 'sourcing')
  await mkReq('R4', uO, 'draft')
  // R2: O submitted it for approval 6 hours ago; the approver sent it back to Draft 2 hours ago. Credit for that step is O's.
  await log(reqs.R2!, 'submit_for_approval', 'price_verification', 'pending_approval', uO, 6)
  await log(reqs.R2!, 'reject', 'pending_approval', 'draft', uA, 2, 'wrong project')
  // A returned PO is Finance's decision about the purchase, not the approver's rejection: counted as a Finance return, never as a send-back by A.
  await log(reqs.R2!, 'reopen_review', 'sourcing', 'organizer_review', uA, 1, 'finance returned PO')
  // R3: priced by P (not O). The approver sent it back to Market pricing (P's step, not O's), later O submitted his review and it was
  // sent back to him, Finance returned a PO, and O sent it back to the buyers himself (that one is nobody's rejection).
  await log(reqs.R3!, 'submit_for_approval', 'price_verification', 'pending_approval', uP, 20)
  await log(reqs.R3!, 'reject_to_market_pricing', 'pending_approval', 'market_pricing', uA, 16, 'price too high')
  await log(reqs.R3!, 'edit_applied', 'organizer_review', 'organizer_review', uX, 12)
  await log(reqs.R3!, 'submit_review', 'organizer_review', 'review_approval', uO, 10)
  await log(reqs.R3!, 'reject_review', 'review_approval', 'organizer_review', uA, 6, 'explain the change')
  await log(reqs.R3!, 'reopen_review', 'sourcing', 'organizer_review', uO, 4, 'finance returned PO')
  await log(reqs.R3!, 'send_back_to_buying', 'organizer_review', 'items_bought', uO, 3)
  // R5: someone else's requisition whose market pricing O submitted; the verifier sent it back. An edit by a third person sits between
  // the submission and the rejection and must not take the credit.
  await mkReq('R5', uX, 'market_pricing')
  await log(reqs.R5!, 'submit_to_price_verification', 'market_pricing', 'price_verification', uO, 30)
  await log(reqs.R5!, 'edit_applied', 'price_verification', 'price_verification', uP, 29)
  await log(reqs.R5!, 'reject_verification_to_market_pricing', 'price_verification', 'market_pricing', uA, 28, 'quote missing')
  // An old requisition of O's with a send-back, outside every period but all time.
  // A deleted requisition is nobody's record: it counts for nothing, send-back or not.
  await mkReq('RDEL', uO, 'deleted')
  await log(reqs.RDEL!, 'reject', 'pending_approval', 'draft', uA, 1, 'deleted one')
  await mkReq('OLD', uO, 'completed', 200)
  await log(reqs.OLD!, 'reject_to_inventory_check', 'pending_approval', 'inventory_check', uA, 200 * 24 - 10)

  // Lines: two flagged on R3 (O's), one flagged on R5 (not O's); purchases by O, one over tolerance; one over tolerance by someone else.
  const l1 = await mkLine(reqs.R3!, 1, 'flagged_at=NOW()')
  const l2 = await mkLine(reqs.R3!, 2, 'flagged_at=NOW()')
  const l3 = await mkLine(reqs.R3!, 3)
  const l5 = await mkLine(reqs.R5!, 1, 'flagged_at=NOW()')
  await mkPurchase(l1, uO, true)
  await mkPurchase(l2, uO, false)
  await mkPurchase(l3, uX, true)
  await mkPurchase(l5, uX, true)

  // Finance's decisions on O's purchase orders: P1 passed first time, P2 returned then passed, P3 returned and still waiting, P4 undecided.
  await mkPo('P1', uO, [['pass_audit', 5]])
  await mkPo('P2', uO, [['fail_audit', 9], ['pass_audit', 3]])
  await mkPo('P3', uO, [['return_to_organizer', 8]])
  await mkPo('P4', uO, [])

  // Claims of O's employee record: four filed (two rejected, one of them filed again), a draft, and somebody else's.
  await mkClaim('C1', eO, 'submitted')
  await mkClaim('C2', eO, 'approved', { approvedBy: uA, submittedHoursAgo: 3 })
  await mkClaim('C3', eO, 'rejected', { rejected: true, rejectedBy: uA, submittedHoursAgo: 5 })
  await mkClaim('C4', eO, 'draft')
  // rejected once, fixed and filed again: still a rejection that happened
  await mkClaim('C6', eO, 'submitted', { rejected: true })
  await mkClaim('C5', eA, 'submitted')
  await mkAdvance('A1', eO, 'pending_approval')
  await mkAdvance('A2', eO, 'draft')
  await mkClaim('U1', eUnlinked, 'submitted')
  // The same people's records in ANOTHER company must count for nothing here: a requisition O organized there that was sent back and rejected,
  // a claim filed for O's employee id there, and a claim A approved there.
  const rOther = await mkReq('ROTHER', uO, 'draft', 0, otherCompany)
  await log(rOther, 'submit_for_approval', 'price_verification', 'pending_approval', uO, 5)
  await log(rOther, 'reject', 'pending_approval', 'draft', uA, 1, 'other company')
  await mkClaim('COTHER', eO, 'rejected', { rejected: true, rejectedBy: uA, company: otherCompany })
  await mkClaim('COTHER2', eA, 'approved', { approvedBy: uA, company: otherCompany })
})

afterAll(async () => {
  await cleanup()
})

describe('the pure rules', () => {
  it('accepts only the three periods or none', () => {
    expect(normalizePerformanceDays(undefined)).toBeNull()
    expect(normalizePerformanceDays(null)).toBeNull()
    expect(normalizePerformanceDays(30)).toBe(30)
    expect(normalizePerformanceDays(90)).toBe(90)
    expect(normalizePerformanceDays(365)).toBe(365)
    expect(() => normalizePerformanceDays(45)).toThrow(/30, 90 or 365/)
  })

  it('does not count the organizer sending a requisition back to the buyers as a rejection', () => {
    expect(SEND_BACK_ACTIONS).not.toContain('send_back_to_buying')
    expect(SEND_BACK_ACTIONS).toContain('reject_review')
    expect(SEND_BACK_ACTIONS).toContain('reopen_review')
  })

  it('groups send-backs by where they went, in a fixed order, with at most five examples', () => {
    const ev = Array.from({ length: 7 }, (_, i) => ({ action: 'reject', requisitionId: `r${i}`, number: `N${i}`, note: null }))
    ev.push({ action: 'reject_review', requisitionId: 'rx', number: 'NX', note: 'why' })
    const g = groupSendBacks(ev)
    expect(g.map((s) => s.key)).toEqual(['draft', 'inventory_check', 'store_pricing', 'market_pricing', 'organizer_review', 'finance_return'])
    expect(g[0]).toMatchObject({ key: 'draft', count: 7 })
    expect(g[0]!.examples).toHaveLength(5)
    expect(g[4]).toMatchObject({ key: 'organizer_review', count: 1, examples: [{ number: 'NX', note: 'why' }] })
    expect(groupSendBacks([{ action: 'something_else', requisitionId: 'r', number: 'N', note: null }]).every((s) => s.count === 0)).toBe(true)
  })

  it('classifies audit results: first time, returned and still waiting, passed after a return', () => {
    const t = (h: number) => new Date(Date.now() - h * 3600_000)
    expect(
      summariseAudit([
        { passed: true, firstPass: t(1), firstReturn: null },
        { passed: true, firstPass: t(1), firstReturn: t(5) },
        { passed: true, firstPass: t(5), firstReturn: t(1) }, // a return AFTER the first pass does not make the first pass a second try
        { passed: false, firstPass: null, firstReturn: t(2) },
      ]),
    ).toEqual({ passedFirst: 2, returned: 1, passedAfterReturn: 1 })
  })

  it('lists the last n months and puts quiet months in as zeros', () => {
    expect(lastMonths(new Date(Date.UTC(2026, 1, 15)), 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(fillTrend(['2026-01', '2026-02'], [{ month: '2026-02', total: 3, sentBack: 1 }])).toEqual([
      { month: '2026-01', total: 0, sentBack: 0 },
      { month: '2026-02', total: 3, sentBack: 1 },
    ])
  })
})

describe('the tab for an employee who organizes requisitions', () => {
  it('counts what they organized and how it ended (90 days leaves out the old one)', async () => {
    const p = must(await perf(eO, 90, ctxOf(uAdmin, 'system_admin')))
    expect(p.linked).toBe(true)
    expect(p.requisitions).toEqual({ organized: 4, completed: 1, cancelled: 1, inProgress: 2, sentBack: 2 })
  })

  it('counts send-backs by where they went, with the requisition numbers and the reason', async () => {
    const p = must(await perf(eO, 90, ctxOf(uAdmin, 'system_admin')))
    expect(stage(p, 'draft')).toMatchObject({ count: 1, examples: [{ number: `${TAG}R2`, note: 'wrong project' }] })
    expect(stage(p, 'market_pricing').count).toBe(1)
    expect(stage(p, 'organizer_review')).toMatchObject({ count: 1, examples: [{ number: `${TAG}R3`, note: 'explain the change' }] })
    expect(stage(p, 'finance_return').count).toBe(2)
    expect(stage(p, 'inventory_check').count).toBe(0)
    // R5 belongs to someone else, and send_back_to_buying is not a rejection: nothing else is counted
    expect(p.sentBackStages.reduce((n, s) => n + s.count, 0)).toBe(5)
  })

  it('credits a rejection to whoever did the rejected step, not to the organizer by default', async () => {
    const p = must(await perf(eO, 90, ctxOf(uAdmin, 'system_admin')))
    // R5's pricing was submitted by O: credited to O although X organizes R5
    expect(work(p, 'pricing_rejected')).toBe(1)
    // R2's price verification was submitted by O: credited to O
    expect(work(p, 'verification_rejected')).toBe(1)
    // R3's review was submitted by O
    expect(work(p, 'review_rejected')).toBe(1)
    // R3's verification was submitted by P, so it is P's, not O's, even though O organizes R3
    const pp = must(await perf(await mkEmp(COMPANY, uP, 'Pricer'), 90, ctxOf(uAdmin, 'system_admin')))
    expect(work(pp, 'verification_rejected')).toBe(1)
    expect(work(pp, 'pricing_rejected')).toBe(0)
  })

  it('does not let an edit between a submission and its rejection take the credit', async () => {
    // R5 has an edit_applied by P between O's submission and the rejection. P must get nothing for R5.
    const pEmp = must((await pool.query<{ id: string }>(`SELECT id FROM employees WHERE user_id=$1`, [uP])).rows[0]).id
    const pp = must(await perf(pEmp, 90, ctxOf(uAdmin, 'system_admin')))
    expect(work(pp, 'pricing_rejected')).toBe(0)
  })

  it('counts over-tolerance purchases they recorded and lines flagged on their requisitions', async () => {
    const p = must(await perf(eO, 90, ctxOf(uAdmin, 'system_admin')))
    expect(work(p, 'over_tolerance')).toBe(1)
    expect(work(p, 'lines_flagged')).toBe(2)
  })

  it("reads Finance's decisions on their purchase orders", async () => {
    const p = must(await perf(eO, 90, ctxOf(uAdmin, 'system_admin')))
    expect(p.audit).toEqual({ passedFirst: 1, returned: 1, passedAfterReturn: 1 })
    expect(work(p, 'audit_returned')).toBe(2)
  })

  it('counts the claims and advances filed for the employee, not drafts and not other people', async () => {
    const p = must(await perf(eO, 90, ctxOf(uAdmin, 'system_admin')))
    expect(p.claims).toEqual([
      { key: 'expense_claim', filed: 4, rejected: 2 },
      { key: 'advance_request', filed: 1, rejected: 0 },
    ])
  })

  it('has no approver section for someone who decided nothing', async () => {
    const p = must(await perf(eO, 90, ctxOf(uAdmin, 'system_admin')))
    expect(p.approver).toEqual([])
  })

  it('puts the months on the trend, the sent-back share counted by month created', async () => {
    const p = must(await perf(eO, 90, ctxOf(uAdmin, 'system_admin')))
    expect(p.trend).toHaveLength(6)
    expect(must(p.trend.at(-1))).toMatchObject({ total: 4, sentBack: 2 })
    const all = must(await perf(eO, null, ctxOf(uAdmin, 'system_admin')))
    expect(all.trend).toHaveLength(12)
    expect(all.trend.reduce((n, m) => n + m.total, 0)).toBe(5)
  })

  it('takes the old requisition in when asked for all time, and not for 30 days', async () => {
    const all = must(await perf(eO, null, ctxOf(uAdmin, 'system_admin')))
    expect(all.requisitions.organized).toBe(5)
    expect(all.requisitions.sentBack).toBe(3)
    expect(stage(all, 'inventory_check').count).toBe(1)
    const month = must(await perf(eO, 30, ctxOf(uAdmin, 'system_admin')))
    expect(month.requisitions.organized).toBe(4)
    expect(stage(month, 'inventory_check').count).toBe(0)
  })

  it('refuses a period that is not offered', async () => {
    await expect(perf(eO, 45, ctxOf(uAdmin, 'system_admin'))).rejects.toThrow(/30, 90 or 365/)
  })
})

describe('the tab for someone who approves things', () => {
  it('counts decisions and the median wait, per kind', async () => {
    // A approved R? none; A sent back R2 (submitted 6h before the entry... decided 2h ago: waited 4h) and R3 twice and R5 once.
    const p = must(await perf(eA, 90, ctxOf(uAdmin, 'system_admin')))
    const req = must(p.approver.find((a) => a.key === 'requisition'))
    expect(req.approved).toBe(0)
    // R2 reject, R3 reject_to_market_pricing, R3 reject_review, R5 reject_verification, and the deleted requisition's reject (a decision A really
    // made). The two Finance returns A logged are not A's decisions.
    expect(req.sentBack).toBe(5)
    expect(req.medianHours).not.toBeNull()
    const claims = must(p.approver.find((a) => a.key === 'expense_claim'))
    expect(claims.approved).toBe(1)
    expect(claims.sentBack).toBe(1)
    expect(must(claims.medianHours)).toBeGreaterThan(2.5)
    expect(must(claims.medianHours)).toBeLessThan(5.5)
    expect(p.approver.find((a) => a.key === 'advance_request')).toBeUndefined()
  })
})

describe('an employee with no login', () => {
  it('says so, still counts their claims, and shows no requisition figures', async () => {
    const p = must(await perf(eUnlinked, 90, ctxOf(uAdmin, 'system_admin')))
    expect(p.linked).toBe(false)
    expect(p.requisitions.organized).toBe(0)
    expect(p.claims[0]).toEqual({ key: 'expense_claim', filed: 1, rejected: 0 })
  })
})

describe('who may open the tab', () => {
  it('lets administrators, permission holders and the direct manager in', async () => {
    for (const c of [ctxOf(uAdmin, 'system_admin'), ctxOf(uAdmin, 'company_admin'), ctxOf(uHr), ctxOf(uMgr)]) {
      expect(await canView(eO, c)).toBe(true)
      expect(must(await perf(eO, 90, c)).requisitions.organized).toBe(4)
    }
  })

  it('refuses an ordinary user, and the employee themselves', async () => {
    for (const c of [ctxOf(uPlain), ctxOf(uO)]) {
      expect(await canView(eO, c)).toBe(false)
      await expect(perf(eO, 90, c)).rejects.toThrow(/hr\.employees\.performance/)
    }
  })

  it("does not make a manager of one person the manager of everyone", async () => {
    expect(await canView(eA, ctxOf(uMgr))).toBe(false)
    await expect(perf(eA, 90, ctxOf(uMgr))).rejects.toThrow(/hr\.employees\.performance/)
  })

  it("answers 'no' and nothing for another company's administrator, and for an id that is not an employee", async () => {
    const other = ctxOf(otherAdmin, 'system_admin', otherCompany)
    expect(await canView(eO, other)).toBe(false)
    expect(await perf(eO, 90, other)).toBeNull()
    expect(await perf('not-a-uuid', 90, ctxOf(uAdmin, 'system_admin'))).toBeNull()
    expect(await canView('00000000-0000-0000-0000-00000000dead', ctxOf(uAdmin, 'system_admin'))).toBe(false)
  })

  it('sees nothing without a session', async () => {
    expect(await resolvers.Query.employeePerformance(null, { employeeId: eO }, { auth: null } as never)).toBeNull()
    expect(await resolvers.Query.canViewEmployeePerformance(null, { employeeId: eO }, { auth: null } as never)).toBe(false)
  })
})
