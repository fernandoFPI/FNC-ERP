// Choosing the GL account and cost center of a PO line on the PO page (setPOLineAccounting), playbook #91.
//
// The mutation saved whatever it was sent: a header account such as `1000 Assets` (the first entry of the page's picker) was
// accepted, and so were an inactive account and an account or cost center of ANOTHER company. The mistake only surfaced when
// Finance settled the advance and the database trigger refused to post to a header account, after the PO was closed. Now the
// choice is validated when it is made. Real Postgres, real resolver, two throwaway companies.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { accountChoiceProblem, costCenterChoiceProblem } from '../src/lib/poLineAccounting.js'

const PREFIX = 'G-LINEACC-TEST-'
const EMAILS = { admin: 'g-lineacc-admin@fnc-erp.local', plain: 'g-lineacc-plain@fnc-erp.local', other: 'g-lineacc-other@fnc-erp.local' }

let companyId = ''
let otherCompanyId = ''
const ids = { admin: '', plain: '', other: '' }
let vendorId = ''
let goodAccount = ''
let goodAccount2 = ''
let headerAccount = ''
let nonPostableAccount = ''
let inactiveAccount = ''
let foreignAccount = ''
let goodCc = ''
let goodCc2 = ''
let inactiveCc = ''
let foreignCc = ''
let poId = ''
let otherPoId = ''
let lineId = ''
let otherPoLineId = ''

type Who = 'admin' | 'plain' | 'other'
const ctxOf = (who: Who) =>
  ({
    auth: {
      companyId: who === 'other' ? otherCompanyId : companyId,
      userId: ids[who],
      role: who === 'plain' ? 'user' : 'system_admin',
      module: 'all',
      sessionId: `lineacc-${who}`,
    },
  }) as never

const classify = (args: { glAccountId?: string | null; costCenterId?: string | null; po?: string; line?: string }, who: Who = 'admin') =>
  resolvers.Mutation.setPOLineAccounting(
    null,
    { poId: args.po ?? poId, lineId: args.line ?? lineId, glAccountId: args.glAccountId, costCenterId: args.costCenterId },
    ctxOf(who),
  ) as Promise<{ account_id: string | null; cost_center_id: string | null; account_code: string | null; account_name: string | null; cost_center_code: string | null; cost_center_name: string | null }>

const lineNow = async (id = lineId) =>
  (await pool.query<{ account_id: string | null; cost_center_id: string | null }>(`SELECT account_id, cost_center_id FROM po_lines WHERE id=$1`, [id])).rows[0]!
async function resetLine(account: string | null, cc: string | null) {
  await pool.query(`UPDATE po_lines SET account_id=$1, cost_center_id=$2 WHERE id=$3`, [account, cc, lineId])
}

async function cleanup(): Promise<void> {
  const companies = (await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name LIKE $1`, [`${PREFIX}%`])).rows.map((r) => r.id)
  for (const c of companies) {
    await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM vendors WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM cost_centers WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM companies WHERE id=$1`, [c])
  }
  await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [Object.values(EMAILS)])
}

beforeAll(async () => {
  await cleanup()
  const mkCompany = async (tag: string) =>
    (
      await pool.query<{ id: string }>(`INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`, [
        `${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ])
    ).rows[0]!.id
  companyId = await mkCompany('A')
  otherCompanyId = await mkCompany('B')
  const mkUser = async (email: string, company: string, role: string) => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used') ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [email],
    )
    await pool.query(`INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,$3,'all') ON CONFLICT DO NOTHING`, [u.rows[0]!.id, company, role])
    return u.rows[0]!.id
  }
  ids.admin = await mkUser(EMAILS.admin, companyId, 'system_admin')
  ids.plain = await mkUser(EMAILS.plain, companyId, 'user')
  ids.other = await mkUser(EMAILS.other, otherCompanyId, 'system_admin')
  vendorId = (await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [companyId, `${PREFIX}VENDOR`])).rows[0]!.id
  const acct = async (company: string, code: string, name: string, o: { header?: boolean; postable?: boolean; active?: boolean } = {}) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_header, is_postable, is_active)
         VALUES ($1,$2,$3,'expense',$4,$5,$6) RETURNING id`,
        [company, code, name, o.header ?? false, o.header ? false : (o.postable ?? true), o.active ?? true],
      )
    ).rows[0]!.id
  goodAccount = await acct(companyId, '4811', 'Materials')
  goodAccount2 = await acct(companyId, '4812', 'Tools')
  headerAccount = await acct(companyId, '4800', 'Assets-like header', { header: true })
  nonPostableAccount = await acct(companyId, '4815', 'Non-postable detail', { postable: false })
  inactiveAccount = await acct(companyId, '4816', 'Inactive account', { active: false })
  foreignAccount = await acct(otherCompanyId, '4811', 'Foreign materials')
  const cc = async (company: string, code: string, active = true) =>
    (
      await pool.query<{ id: string }>(`INSERT INTO cost_centers (company_id, code, name, type, is_active) VALUES ($1,$2,$3,'overhead',$4) RETURNING id`, [
        company,
        code,
        `Cost center ${code}`,
        active,
      ])
    ).rows[0]!.id
  goodCc = await cc(companyId, 'CC1')
  goodCc2 = await cc(companyId, 'CC2')
  inactiveCc = await cc(companyId, 'CCI', false)
  foreignCc = await cc(otherCompanyId, 'CCF')
  const mkPO = async (company: string, n: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO purchase_orders (company_id, po_number, vendor_id, currency_code, base_currency_code, status, purpose, created_by, funding_source, funding_decided)
         VALUES ($1,$2,$3,'IQD','IQD','payment_pending','stock',$4,'employee_advance',true) RETURNING id`,
        [company, `${PREFIX}${n}`, vendorId, ids.admin],
      )
    ).rows[0]!.id
  poId = await mkPO(companyId, '1')
  otherPoId = await mkPO(companyId, '2')
  const mkLine = async (po: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, currency_code) VALUES ($1,1,'a line',1,100,100,'IQD') RETURNING id`,
        [po],
      )
    ).rows[0]!.id
  lineId = await mkLine(poId)
  otherPoLineId = await mkLine(otherPoId)
})

afterAll(async () => {
  await cleanup()
  await pool.end()
})

describe('the plain sentences (pure)', () => {
  const acct = (over: Partial<{ code: string; name: string; is_postable: boolean; is_active: boolean }> = {}) => ({ code: '1000', name: 'Assets', is_postable: true, is_active: true, ...over })
  it('an account is usable only when it exists in the company, is postable and is active', () => {
    expect(accountChoiceProblem(acct())).toBeNull()
    expect(accountChoiceProblem(undefined)).toBe('GL account not found in this company')
    expect(accountChoiceProblem(acct({ is_postable: false }))).toBe('1000 · Assets is a header account and cannot be posted to: choose a postable account')
    expect(accountChoiceProblem(acct({ is_active: false }))).toBe('1000 · Assets is inactive: choose an active account')
  })
  it('postable is judged before active (a header account is the more useful thing to say)', () => {
    expect(accountChoiceProblem(acct({ is_postable: false, is_active: false }))).toMatch(/header account/)
  })
  it('a cost center is usable only when it exists in the company and is active', () => {
    expect(costCenterChoiceProblem({ code: 'CC1', name: 'Site', is_active: true })).toBeNull()
    expect(costCenterChoiceProblem(undefined)).toBe('Cost center not found in this company')
    expect(costCenterChoiceProblem({ code: 'CC1', name: 'Site', is_active: false })).toBe('CC1 · Site is inactive: choose an active cost center')
  })
})

describe('choosing a GL account', () => {
  it('a postable, active account of the company is saved and read back with its code and name', async () => {
    await resetLine(null, null)
    const r = await classify({ glAccountId: goodAccount, costCenterId: goodCc })
    expect([r.account_id, r.account_code, r.account_name]).toEqual([goodAccount, '4811', 'Materials'])
    expect([r.cost_center_id, r.cost_center_code, r.cost_center_name]).toEqual([goodCc, 'CC1', 'Cost center CC1'])
    expect(await lineNow()).toEqual({ account_id: goodAccount, cost_center_id: goodCc })
  })

  it('a header account is refused with the reason, and the line keeps what it had', async () => {
    await resetLine(goodAccount, goodCc)
    await expect(classify({ glAccountId: headerAccount, costCenterId: goodCc })).rejects.toThrow(/4800 · .*Assets-like header is a header account and cannot be posted to: choose a postable account/)
    expect(await lineNow()).toEqual({ account_id: goodAccount, cost_center_id: goodCc })
  })

  it('a postable-less account that is not a header is refused the same way', async () => {
    await resetLine(goodAccount, goodCc)
    await expect(classify({ glAccountId: nonPostableAccount, costCenterId: goodCc })).rejects.toThrow(/is a header account and cannot be posted to/)
    expect(await lineNow()).toEqual({ account_id: goodAccount, cost_center_id: goodCc })
  })

  it('an inactive account is refused', async () => {
    await resetLine(goodAccount, goodCc)
    await expect(classify({ glAccountId: inactiveAccount, costCenterId: goodCc })).rejects.toThrow(/is inactive: choose an active account/)
    expect(await lineNow()).toEqual({ account_id: goodAccount, cost_center_id: goodCc })
  })

  it("another company's account, and one that does not exist, are refused as not found", async () => {
    await resetLine(goodAccount, goodCc)
    await expect(classify({ glAccountId: foreignAccount, costCenterId: goodCc })).rejects.toThrow(/GL account not found in this company/)
    await expect(classify({ glAccountId: '00000000-0000-0000-0000-00000000dead', costCenterId: goodCc })).rejects.toThrow(/GL account not found in this company/)
    expect(await lineNow()).toEqual({ account_id: goodAccount, cost_center_id: goodCc })
  })

  it('clearing the account (null) is still allowed, as before', async () => {
    await resetLine(goodAccount, goodCc)
    const r = await classify({ glAccountId: null, costCenterId: goodCc })
    expect(r.account_id).toBeNull()
    expect(await lineNow()).toEqual({ account_id: null, cost_center_id: goodCc })
  })
})

describe('choosing a cost center', () => {
  it("another company's, an inactive one and one that does not exist are refused", async () => {
    await resetLine(goodAccount, goodCc)
    await expect(classify({ glAccountId: goodAccount, costCenterId: foreignCc })).rejects.toThrow(/Cost center not found in this company/)
    await expect(classify({ glAccountId: goodAccount, costCenterId: inactiveCc })).rejects.toThrow(/is inactive: choose an active cost center/)
    await expect(classify({ glAccountId: goodAccount, costCenterId: '00000000-0000-0000-0000-00000000dead' })).rejects.toThrow(/Cost center not found/)
    expect(await lineNow()).toEqual({ account_id: goodAccount, cost_center_id: goodCc })
  })

  it('a valid change is saved', async () => {
    await resetLine(goodAccount, goodCc)
    await classify({ glAccountId: goodAccount2, costCenterId: goodCc2 })
    expect(await lineNow()).toEqual({ account_id: goodAccount2, cost_center_id: goodCc2 })
  })
})

describe('a value the line already holds is not a new choice', () => {
  it('changing only the cost center works for a line that still holds a header account (the page sends the old account back)', async () => {
    await resetLine(headerAccount, goodCc)
    const r = await classify({ glAccountId: headerAccount, costCenterId: goodCc2 })
    expect(r.cost_center_id).toBe(goodCc2)
    expect(await lineNow()).toEqual({ account_id: headerAccount, cost_center_id: goodCc2 }) // the account is not hidden or fixed behind the user's back
  })

  it('but choosing the header account on a line that does NOT hold it is refused', async () => {
    await resetLine(goodAccount, goodCc)
    await expect(classify({ glAccountId: headerAccount, costCenterId: goodCc })).rejects.toThrow(/header account/)
  })

  it('a cost center the line already holds passes even if it has since been deactivated', async () => {
    await resetLine(goodAccount, inactiveCc)
    const r = await classify({ glAccountId: goodAccount2, costCenterId: inactiveCc })
    expect([r.account_id, r.cost_center_id]).toEqual([goodAccount2, inactiveCc])
  })
})

describe('the rest of the mutation is as before', () => {
  it("a line of another PO is 'not found' and nothing is validated against it", async () => {
    await expect(classify({ glAccountId: goodAccount, costCenterId: goodCc, line: otherPoLineId })).rejects.toThrow(/PO line not found/)
  })

  it('only Finance (finance.ap.approve) may classify, and only in the PO’s own company', async () => {
    await resetLine(goodAccount, goodCc)
    await expect(classify({ glAccountId: goodAccount2, costCenterId: goodCc2 }, 'plain')).rejects.toThrow(/Finance approval permission required/)
    await expect(classify({ glAccountId: goodAccount2, costCenterId: goodCc2 }, 'other')).rejects.toThrow(/PO not found/)
    expect(await lineNow()).toEqual({ account_id: goodAccount, cost_center_id: goodCc })
  })

  it('a PO that is not at invoiced / payment pending cannot be classified', async () => {
    await pool.query(`UPDATE purchase_orders SET status='closed' WHERE id=$1`, [poId])
    try {
      await expect(classify({ glAccountId: goodAccount2, costCenterId: goodCc2 })).rejects.toThrow(/must be invoiced/)
    } finally {
      await pool.query(`UPDATE purchase_orders SET status='payment_pending' WHERE id=$1`, [poId])
    }
  })
})
