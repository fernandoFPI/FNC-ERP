// One advance PER CURRENCY on a purchase order (migration 324, playbook #90).
//
// A PO funded from employee advances used to hold a single `funding_advance_id`, and setPOFunding insisted that advance be
// in the PO's one header currency. A PO whose lines are in IQD and USD (21 were waiting on production on 2026-11-15) could be
// linked to an IQD advance or a USD one, never both. Now Finance chooses one advance for each currency the PO has lines in
// (po_funding_advances), and each line is settled against the advance of its own currency.
//
// Run through the real ApolloServer({ typeDefs, resolvers }) the gateway builds, so the new input type, the new argument and
// the new field are exercised by the schema itself (a resolver called directly skips all of that, playbook #38). Real
// Postgres, two throwaway companies.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { planFundingSlots, advanceProblem, primaryAdvanceId, joinCurrencies } from '../src/lib/poFundingAdvances.js'

const PREFIX = 'G-POFUNDCCY-TEST-'
const EMAILS = { admin: 'g-pofundccy-admin@fnc-erp.local', plain: 'g-pofundccy-plain@fnc-erp.local', other: 'g-pofundccy-other@fnc-erp.local' }

type Who = 'admin' | 'plain' | 'other'
type TestCtx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

let companyId = ''
let otherCompanyId = ''
const ids = { admin: '', plain: '', other: '' }
let vendorId = ''
let costCenterId = ''
let expenseAccount = ''
let cashAccount = ''
let advAccount = ''
const adv: Record<string, string> = {} // advances by key

const ctxOf = (who: Who): TestCtx => ({
  auth: {
    companyId: who === 'other' ? otherCompanyId : companyId,
    userId: ids[who],
    role: who === 'plain' ? 'user' : 'system_admin',
    module: 'all',
    sessionId: `pofundccy-${who}`,
  },
})

async function run(query: string, variables: Record<string, unknown>, who: Who = 'admin') {
  const res = await server.executeOperation({ query, variables }, { contextValue: ctxOf(who) })
  if (res.body.kind !== 'single') throw new Error('unexpected incremental response')
  const { data, errors } = res.body.singleResult
  return { data: data as Record<string, any> | null | undefined, error: errors?.[0]?.message as string | undefined }
}

const SET = `mutation($id: ID!, $src: String!, $one: ID, $many: [POFundingAdvanceInput!]) {
  setPOFunding(id: $id, fundingSource: $src, fundingAdvanceId: $one, fundingAdvances: $many) {
    id funding_source funding_decided funding_advance_id funding_advance_number
    fundingAdvances { currency_code advance_id advance_number employee_name outstanding_amount status }
  }
}`
const COMPLETE = `mutation($id: ID!) { completePO(id: $id) { id status } }`

type Many = { currencyCode: string; advanceId: string }[]
async function setFunding(poId: string, src: string, opts: { one?: string; many?: Many } = {}, who: Who = 'admin') {
  return run(SET, { id: poId, src, one: opts.one ?? null, many: opts.many ?? null }, who)
}

let poSeq = 0
async function makePO(opts: {
  lines: { ccy: string; amount: number }[]
  header?: string
  status?: string
  decided?: boolean
  source?: string
  company?: string
}): Promise<string> {
  poSeq += 1
  const company = opts.company ?? companyId
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, currency_code, base_currency_code, status, purpose, created_by,
                                  funding_source, funding_decided)
     VALUES ($1,$2,$3,$4,'IQD',$5,'stock',$6,$7,$8) RETURNING id`,
    [company, `${PREFIX}${poSeq}`, vendorId, opts.header ?? 'IQD', opts.status ?? 'payment_pending', ids.admin, opts.source ?? 'vendor_ap', opts.decided ?? false],
  )
  let n = 0
  for (const l of opts.lines) {
    n += 1
    await pool.query(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, currency_code, account_id, cost_center_id)
       VALUES ($1,$2,$3,1,$4,$4,$5,$6,$7)`,
      [r.rows[0]!.id, n, `l${n}`, l.amount, l.ccy, expenseAccount, costCenterId],
    )
  }
  return r.rows[0]!.id
}

const rowsOf = async (poId: string) =>
  (await pool.query<{ currency_code: string; advance_id: string }>(
    `SELECT currency_code, advance_id FROM po_funding_advances WHERE po_id=$1 ORDER BY currency_code`,
    [poId],
  )).rows.map((r) => [r.currency_code.trim(), r.advance_id])
const fundingOf = async (poId: string) =>
  (await pool.query<{ funding_source: string; funding_advance_id: string | null; funding_decided: boolean }>(
    `SELECT funding_source, funding_advance_id, funding_decided FROM purchase_orders WHERE id=$1`,
    [poId],
  )).rows[0]!
const auditOf = async (poId: string) =>
  (await pool.query<{ old_values: Record<string, any>; new_values: Record<string, any> }>(
    `SELECT old_values, new_values FROM audit_log WHERE table_name='purchase_orders' AND record_id=$1 AND new_values ? 'funding_source' ORDER BY created_at, id`,
    [poId],
  )).rows

async function cleanup(): Promise<void> {
  const companies = (await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name LIKE $1`, [`${PREFIX}%`])).rows.map((r) => r.id)
  for (const c of companies) {
    await pool.query(`UPDATE po_lines SET advance_settlement_id = NULL WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM advance_settlements WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM audit_log WHERE company_id=$1 AND table_name='purchase_orders'`, [c])
    await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [c]) // takes po_funding_advances with it
    await pool.query(`DELETE FROM employee_advances WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM employees WHERE company_id=$1`, [c])
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
      await pool.query<{ id: string }>(
        `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
        [`${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
      )
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
  const acct = async (company: string, code: string, name: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active) VALUES ($1,$2,$3,'asset',true,true) RETURNING id`,
        [company, code, name],
      )
    ).rows[0]!.id
  cashAccount = await acct(companyId, '1100', 'Cash')
  advAccount = await acct(companyId, '1200', 'Employee advances')
  expenseAccount = await acct(companyId, '5100', 'Expense')
  const cashB = await acct(otherCompanyId, '1100', 'Cash B')
  const advB = await acct(otherCompanyId, '1200', 'Employee advances B')
  costCenterId = (
    await pool.query<{ id: string }>(`INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'CC','overhead') RETURNING id`, [companyId, `${PREFIX}CC`])
  ).rows[0]!.id
  const mkEmployee = async (company: string, tag: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number, status) VALUES ($1,'Fund','Tester',CURRENT_DATE,$2,'active') RETURNING id`,
        [company, `${PREFIX}${tag}-${Date.now()}`],
      )
    ).rows[0]!.id
  const employeeId = await mkEmployee(companyId, 'A')
  const employeeB = await mkEmployee(otherCompanyId, 'B')
  const mkAdvance = async (key: string, ccy: string, status: string, company = companyId) => {
    adv[key] = (
      await pool.query<{ id: string }>(
        // outstanding_amount is a generated column (amount - settled - returned), so it is not inserted
        `INSERT INTO employee_advances (company_id, advance_number, employee_id, employee_name, currency_code, amount, cash_account_id, advance_account_id, status)
         VALUES ($1,$2,$3,'Fund Tester',$4,1000000,$5,$6,$7) RETURNING id`,
        [company, `${PREFIX}${key}`, company === companyId ? employeeId : employeeB, ccy, company === companyId ? cashAccount : cashB, company === companyId ? advAccount : advB, status],
      )
    ).rows[0]!.id
  }
  await mkAdvance('IQD1', 'IQD', 'approved')
  await mkAdvance('IQD2', 'IQD', 'partially_settled')
  await mkAdvance('USD1', 'USD', 'approved')
  await mkAdvance('USD2', 'USD', 'approved')
  await mkAdvance('EUR1', 'EUR', 'approved')
  await mkAdvance('DRAFT', 'IQD', 'draft')
  await mkAdvance('USDDRAFT', 'USD', 'draft')
  await mkAdvance('FOREIGNUSD', 'USD', 'approved', otherCompanyId)
})

afterAll(async () => {
  await cleanup()
  await pool.end()
})

describe('the planning rules, on their own', () => {
  const base = { headerCurrency: 'IQD' }
  it('one advance per currency of the lines is a complete plan, sorted by currency', () => {
    expect(
      planFundingSlots({ ...base, lineCurrencies: ['IQD', 'USD'], fundingAdvances: [{ currencyCode: 'usd', advanceId: 'u' }, { currencyCode: 'IQD', advanceId: 'i' }] }),
    ).toEqual([{ currencyCode: 'IQD', advanceId: 'i' }, { currencyCode: 'USD', advanceId: 'u' }])
  })
  it('names what is missing, what is extra and what is chosen twice', () => {
    expect(() => planFundingSlots({ ...base, lineCurrencies: ['IQD', 'USD'], fundingAdvances: [{ currencyCode: 'IQD', advanceId: 'i' }] })).toThrow(/Choose an advance for the USD lines/)
    expect(() => planFundingSlots({ ...base, lineCurrencies: ['IQD'], fundingAdvances: [{ currencyCode: 'IQD', advanceId: 'i' }, { currencyCode: 'EUR', advanceId: 'e' }] })).toThrow(/no EUR lines/)
    expect(() => planFundingSlots({ ...base, lineCurrencies: ['IQD'], fundingAdvances: [{ currencyCode: 'IQD', advanceId: 'i' }, { currencyCode: 'IQD', advanceId: 'j' }] })).toThrow(/Only one advance can be chosen for IQD/)
    expect(() => planFundingSlots({ ...base, lineCurrencies: ['IQD'], fundingAdvances: [{ currencyCode: 'IQ', advanceId: 'i' }] })).toThrow(/three-letter/)
    expect(() => planFundingSlots({ ...base, lineCurrencies: ['IQD'] })).toThrow(/advance must be selected/)
  })
  it('the single-advance argument works for one currency (or none yet, then the header) and not for several', () => {
    expect(planFundingSlots({ ...base, lineCurrencies: ['USD'], fundingAdvanceId: 'u' })).toEqual([{ currencyCode: 'USD', advanceId: 'u' }])
    expect(planFundingSlots({ ...base, lineCurrencies: [], fundingAdvanceId: 'i' })).toEqual([{ currencyCode: 'IQD', advanceId: 'i' }])
    expect(() => planFundingSlots({ ...base, lineCurrencies: ['IQD', 'USD'], fundingAdvanceId: 'i' })).toThrow(/lines in IQD and USD: choose one advance for each currency/)
  })
  it('an advance is judged on existing, usable and in the currency of its slot', () => {
    const slot = { currencyCode: 'USD', advanceId: 'u' }
    expect(advanceProblem(undefined, slot)).toMatch(/not found/)
    expect(advanceProblem({ status: 'draft', currency_code: 'USD' }, slot)).toMatch(/settleable/)
    expect(advanceProblem({ status: 'approved', currency_code: 'IQD', advance_number: 'A-1' }, slot)).toMatch(/currency must match.*USD lines need a USD advance, A-1 is in IQD/)
    expect(advanceProblem({ status: 'partially_settled', currency_code: 'USD ' }, slot)).toBeNull()
  })
  it('the legacy column takes the header currency advance, else the first', () => {
    const slots = [{ currencyCode: 'IQD', advanceId: 'i' }, { currencyCode: 'USD', advanceId: 'u' }]
    expect(primaryAdvanceId(slots, 'USD')).toBe('u')
    expect(primaryAdvanceId(slots, 'iqd')).toBe('i')
    expect(primaryAdvanceId(slots, 'EUR')).toBe('i')
    expect(primaryAdvanceId([], 'IQD')).toBeNull()
  })
  it('lists currencies in plain words', () => {
    expect(joinCurrencies(['IQD'])).toBe('IQD')
    expect(joinCurrencies(['IQD', 'USD'])).toBe('IQD and USD')
    expect(joinCurrencies(['EUR', 'IQD', 'USD'])).toBe('EUR, IQD and USD')
  })
})

describe('a PO with lines in two currencies takes one advance for each', () => {
  it('saves both, the page reads both, and the legacy column holds the header currency one', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 100 }, { ccy: 'USD', amount: 5 }, { ccy: 'USD', amount: 7 }], header: 'USD' })
    const res = await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }] })
    expect(res.error).toBeUndefined()
    const out = res.data!.setPOFunding
    expect(out.funding_source).toBe('employee_advance')
    expect(out.funding_decided).toBe(true)
    expect(out.funding_advance_id).toBe(adv.USD1) // header USD
    expect(out.fundingAdvances.map((f: any) => [f.currency_code, f.advance_id, f.advance_number, f.status])).toEqual([
      ['IQD', adv.IQD1, `${PREFIX}IQD1`, 'approved'],
      ['USD', adv.USD1, `${PREFIX}USD1`, 'approved'],
    ])
    expect(await rowsOf(po)).toEqual([['IQD', adv.IQD1], ['USD', adv.USD1]])
    expect(out.fundingAdvances[0].outstanding_amount).toBe('1000000.00')
  })

  it('the primary is the first by currency when the header currency has no advance of its own', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }], header: 'EUR' })
    await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'USD', advanceId: adv.USD1! }, { currencyCode: 'IQD', advanceId: adv.IQD1! }] })
    expect((await fundingOf(po)).funding_advance_id).toBe(adv.IQD1)
  })

  it('records the advance of each currency in the audit row, before and after', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }] })
    const a = await auditOf(po)
    expect(a).toHaveLength(1)
    expect(a[0]!.old_values.funding_advances).toEqual([])
    expect(a[0]!.new_values.funding_advances).toEqual([
      { currency_code: 'IQD', advance_id: adv.IQD1 },
      { currency_code: 'USD', advance_id: adv.USD1 },
    ])
  })

  it('needs an advance for every currency: with only the IQD one nothing is saved', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    const res = await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }] })
    expect(res.error).toMatch(/Choose an advance for the USD lines of this PO/)
    expect(await rowsOf(po)).toEqual([])
    expect((await fundingOf(po)).funding_decided).toBe(false)
    expect(await auditOf(po)).toHaveLength(0)
  })

  it('refuses an advance named for a currency the PO has no lines in', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    const res = await setFunding(po, 'employee_advance', {
      many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }, { currencyCode: 'EUR', advanceId: adv.EUR1! }],
    })
    expect(res.error).toMatch(/no EUR lines/)
    expect(await rowsOf(po)).toEqual([])
  })

  it('refuses an advance in the wrong currency for its slot, naming both', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    const res = await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.IQD2! }] })
    expect(res.error).toMatch(/currency must match the selected advance’s currency \(USD lines need a USD advance, .*IQD2 is in IQD\)/)
    expect(await rowsOf(po)).toEqual([])
  })

  it('refuses two advances for one currency', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    const res = await setFunding(po, 'employee_advance', {
      many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'IQD', advanceId: adv.IQD2! }, { currencyCode: 'USD', advanceId: adv.USD1! }],
    })
    expect(res.error).toMatch(/Only one advance can be chosen for IQD/)
  })

  it('refuses an advance that cannot be used, in either currency, and leaves the old funding exactly as it was', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }], decided: true, source: 'vendor_ap' })
    const res = await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USDDRAFT! }] })
    expect(res.error).toMatch(/not in a settleable state/)
    expect(await fundingOf(po)).toEqual({ funding_source: 'vendor_ap', funding_advance_id: null, funding_decided: true })
    expect(await rowsOf(po)).toEqual([])
    expect(await auditOf(po)).toHaveLength(0)
  })

  it("never uses another company's advance: it is simply not found", async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    const res = await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.FOREIGNUSD! }] })
    expect(res.error).toMatch(/Selected advance not found/)
    expect(await rowsOf(po)).toEqual([])
  })

  it('the older single-advance argument is refused for it, with the reason', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    const res = await setFunding(po, 'employee_advance', { one: adv.IQD1! })
    expect(res.error).toMatch(/lines in IQD and USD: choose one advance for each currency/)
    expect(await rowsOf(po)).toEqual([])
  })
})

describe('a PO in one currency behaves as before', () => {
  it('the older single-advance argument still works and writes the one row', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'IQD', amount: 2 }] })
    const res = await setFunding(po, 'employee_advance', { one: adv.IQD1! })
    expect(res.error).toBeUndefined()
    expect(res.data!.setPOFunding.funding_advance_id).toBe(adv.IQD1)
    expect(await rowsOf(po)).toEqual([['IQD', adv.IQD1]])
  })

  it('the list form works for it too', async () => {
    const po = await makePO({ lines: [{ ccy: 'USD', amount: 1 }], header: 'USD' })
    const res = await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'USD', advanceId: adv.USD1! }] })
    expect(res.error).toBeUndefined()
    expect(await rowsOf(po)).toEqual([['USD', adv.USD1]])
  })

  it("a USD advance on an all-IQD PO is refused even when the header says USD: the lines decide, not the header", async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }], header: 'USD' })
    const res = await setFunding(po, 'employee_advance', { one: adv.USD1! })
    expect(res.error).toMatch(/currency must match/)
  })

  it('a PO with no lines yet falls back to its header currency', async () => {
    const po = await makePO({ lines: [], header: 'IQD' })
    expect((await setFunding(po, 'employee_advance', { one: adv.USD1! })).error).toMatch(/currency must match/)
    expect((await setFunding(po, 'employee_advance', { one: adv.IQD1! })).error).toBeUndefined()
    expect(await rowsOf(po)).toEqual([['IQD', adv.IQD1]])
  })
})

describe('changing and clearing', () => {
  it('replaces both rows, and the audit row holds the old pair and the new pair', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }] })
    const res = await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD2! }, { currencyCode: 'USD', advanceId: adv.USD2! }] })
    expect(res.error).toBeUndefined()
    expect(await rowsOf(po)).toEqual([['IQD', adv.IQD2], ['USD', adv.USD2]])
    expect((await fundingOf(po)).funding_advance_id).toBe(adv.IQD2)
    const a = await auditOf(po)
    expect(a).toHaveLength(2)
    expect(a[1]!.old_values.funding_advances).toEqual([{ currency_code: 'IQD', advance_id: adv.IQD1 }, { currency_code: 'USD', advance_id: adv.USD1 }])
    expect(a[1]!.new_values.funding_advances).toEqual([{ currency_code: 'IQD', advance_id: adv.IQD2 }, { currency_code: 'USD', advance_id: adv.USD2 }])
  })

  it('changing only the USD advance leaves the IQD one in place', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }] })
    await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD2! }] })
    expect(await rowsOf(po)).toEqual([['IQD', adv.IQD1], ['USD', adv.USD2]])
  })

  it('switching to vendor AP removes every row and clears the legacy column, even if the page still sends advances', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }] })
    const res = await setFunding(po, 'vendor_ap', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }] })
    expect(res.error).toBeUndefined()
    expect(await rowsOf(po)).toEqual([])
    expect(await fundingOf(po)).toEqual({ funding_source: 'vendor_ap', funding_advance_id: null, funding_decided: true })
    expect(res.data!.setPOFunding.fundingAdvances).toEqual([])
  })

  it("a change another session made to only the USD advance is seen, not overwritten", async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }] })
    // Another session replaces the USD advance (and only that: the PO's primary advance does not change) but has not committed.
    // setFunding reads the committed state, then waits for the PO row; once the other change commits, what it read is stale.
    const other = await pool.connect()
    try {
      await other.query('BEGIN')
      await other.query(`SELECT id FROM purchase_orders WHERE id=$1 FOR UPDATE`, [po])
      await other.query(`UPDATE po_funding_advances SET advance_id=$2 WHERE po_id=$1 AND currency_code='USD'`, [po, adv.USD2])
      const attempt = setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD2! }, { currencyCode: 'USD', advanceId: adv.USD1! }] }).then((r) => r.error ?? 'saved')
      await new Promise((r) => setTimeout(r, 700))
      await other.query('COMMIT')
      expect(await attempt).toMatch(/changed by someone else/)
    } finally {
      other.release()
    }
    expect(await rowsOf(po)).toEqual([['IQD', adv.IQD1], ['USD', adv.USD2]]) // the other session's change stands
    expect(await auditOf(po)).toHaveLength(1) // only the first funding was recorded
  })

  it('only Finance may do it, and only in the PO’s own company', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    const many = [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }]
    expect((await setFunding(po, 'employee_advance', { many }, 'plain')).error).toMatch(/Finance approval permission required/)
    expect((await setFunding(po, 'employee_advance', { many }, 'other')).error).toMatch(/PO not found/)
    expect(await rowsOf(po)).toEqual([])
  })
})

describe('the page reads the advances through the PO', () => {
  it('purchaseOrder(id) returns them, and the primary one still fills the old fields', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }] })
    const res = await run(
      `query($id: ID!) { purchaseOrder(id: $id) { id funding_advance_id funding_advance_number fundingAdvances { currency_code advance_number } } }`,
      { id: po },
    )
    expect(res.error).toBeUndefined()
    expect(res.data!.purchaseOrder.funding_advance_number).toBe(`${PREFIX}IQD1`)
    expect(res.data!.purchaseOrder.fundingAdvances).toEqual([
      { currency_code: 'IQD', advance_number: `${PREFIX}IQD1` },
      { currency_code: 'USD', advance_number: `${PREFIX}USD1` },
    ])
  })

  it('shows nothing of another company: the field is scoped to the caller’s company on the link and the advance', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }], header: 'IQD' })
    await setFunding(po, 'employee_advance', { one: adv.IQD1! })
    const fieldResolver = (resolvers as any).PurchaseOrder.fundingAdvances as (p: { id: string }, a: unknown, c: TestCtx) => Promise<unknown[]>
    expect(await fieldResolver({ id: po }, {}, ctxOf('admin'))).toHaveLength(1)
    expect(await fieldResolver({ id: po }, {}, ctxOf('other'))).toEqual([])
  })

  it('a PO that is not funded from advances has an empty list, not an error', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }] })
    await setFunding(po, 'vendor_ap')
    const res = await run(`query($id: ID!) { purchaseOrder(id: $id) { fundingAdvances { currency_code } } }`, { id: po })
    expect(res.error).toBeUndefined()
    expect(res.data!.purchaseOrder.fundingAdvances).toEqual([])
  })
})

describe('completing the PO', () => {
  it('is refused while a currency has lines but no advance, naming it (a line added in a new currency after the funding)', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }] })
    await setFunding(po, 'employee_advance', { one: adv.IQD1! })
    await pool.query(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, currency_code, account_id, cost_center_id)
       VALUES ($1,2,'late usd',1,10,10,'USD',$2,$3)`,
      [po, expenseAccount, costCenterId],
    )
    const res = await run(COMPLETE, { id: po })
    expect(res.error).toMatch(/Cannot complete: this PO has USD lines but no USD advance is linked/)
    expect(res.error).toMatch(/Change funding source/)
    expect((await pool.query(`SELECT status FROM purchase_orders WHERE id=$1`, [po])).rows[0].status).toBe('payment_pending')
  })

  it('goes through once every currency has its advance, and then the PO is closed', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    await setFunding(po, 'employee_advance', { many: [{ currencyCode: 'IQD', advanceId: adv.IQD1! }, { currencyCode: 'USD', advanceId: adv.USD1! }] })
    const res = await run(COMPLETE, { id: po })
    expect(res.error).toBeUndefined()
    expect(res.data!.completePO.status).toBe('closed')
  })

  it('a vendor-AP PO is not asked for an advance', async () => {
    const po = await makePO({ lines: [{ ccy: 'IQD', amount: 1 }, { ccy: 'USD', amount: 1 }] })
    await setFunding(po, 'vendor_ap')
    const res = await run(COMPLETE, { id: po })
    expect(res.error ?? '').not.toMatch(/advance is linked/)
  })
})
