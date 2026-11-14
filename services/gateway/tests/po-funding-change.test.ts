// Changing how a PO is funded while it is still waiting (setPOFunding).
//
// The choice used to be final after one click ("Funding source has already been set for this PO"). Every PO starts as
// vendor AP (the column default), and Finance confirms it once the PO reaches payment pending, so a cash purchase confirmed
// as vendor AP could not be moved to the employee advance that paid for it (NY-PO-2026-0090). Now a decided funding can be
// changed until the PO is completed, as long as nothing has used it: no line settled against an advance, no vendor invoice
// (other than a cancelled one). Every change is recorded with the old and the new value. Real Postgres, real resolver.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const PREFIX = 'G-POFUND-TEST-'
const EMAILS = { admin: 'g-pofund-admin@fnc-erp.local', plain: 'g-pofund-plain@fnc-erp.local', other: 'g-pofund-other@fnc-erp.local' }

let companyId = ''
let otherCompanyId = ''
const ids = { admin: '', plain: '', other: '' }
let advIqd = ''
let advIqd2 = ''
let advUsd = ''
let advDraft = ''
let vendorId = ''
let employeeId = ''
let cashAccount = ''
let advAccount = ''

const ctxOf = (who: 'admin' | 'plain' | 'other') =>
  ({
    auth: {
      companyId: who === 'other' ? otherCompanyId : companyId,
      userId: ids[who],
      role: who === 'plain' ? 'user' : 'system_admin',
      module: 'all',
      sessionId: `pofund-${who}`,
    },
  }) as never

let poSeq = 0
async function makePO(status: string, over: { decided?: boolean; source?: string; advance?: string | null } = {}): Promise<string> {
  poSeq += 1
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, currency_code, base_currency_code, status, purpose, created_by,
                                  funding_source, funding_decided, funding_advance_id)
     VALUES ($1,$2,$3,'IQD','IQD',$4,'stock',$5,$6,$7,$8) RETURNING id`,
    [companyId, `${PREFIX}${poSeq}`, vendorId, status, ids.admin, over.source ?? 'vendor_ap', over.decided ?? false, over.advance ?? null],
  )
  return r.rows[0]!.id
}
const fundingOf = async (poId: string) =>
  (await pool.query<{ funding_source: string; funding_advance_id: string | null; funding_decided: boolean }>(
    `SELECT funding_source, funding_advance_id, funding_decided FROM purchase_orders WHERE id=$1`,
    [poId],
  )).rows[0]!
const auditOf = async (poId: string) =>
  (await pool.query<{ old_values: Record<string, unknown>; new_values: Record<string, unknown>; user_id: string }>(
    `SELECT old_values, new_values, user_id FROM audit_log WHERE table_name='purchase_orders' AND record_id=$1 AND new_values ? 'funding_source' ORDER BY created_at, id`,
    [poId],
  )).rows
const setFunding = (poId: string, fundingSource: string, fundingAdvanceId?: string, who: 'admin' | 'plain' | 'other' = 'admin') =>
  resolvers.Mutation.setPOFunding(null, { id: poId, fundingSource, fundingAdvanceId }, ctxOf(who))

async function cleanup(): Promise<void> {
  const companies = (await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name LIKE $1`, [`${PREFIX}%`])).rows.map((r) => r.id)
  for (const c of companies) {
    await pool.query(`UPDATE po_lines SET advance_settlement_id = NULL WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM vendor_invoice_lines WHERE vendor_invoice_id IN (SELECT id FROM vendor_invoices WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM vendor_invoices WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM advance_settlements WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM audit_log WHERE company_id=$1 AND table_name='purchase_orders'`, [c])
    await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM employee_advances WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM employees WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM vendors WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM companies WHERE id=$1`, [c])
  }
  await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [Object.values(EMAILS)])
}

beforeAll(async () => {
  await cleanup()
  const mk = async (tag: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
        [`${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
      )
    ).rows[0]!.id
  companyId = await mk('A')
  otherCompanyId = await mk('B')
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
  const acct = async (code: string, name: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active) VALUES ($1,$2,$3,'asset',true,true) RETURNING id`,
        [companyId, code, name],
      )
    ).rows[0]!.id
  cashAccount = await acct('1100', 'Cash')
  advAccount = await acct('1200', 'Employee advances')
  employeeId = (
    await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number, status) VALUES ($1,'Fund','Tester',CURRENT_DATE,$2,'active') RETURNING id`,
      [companyId, `${PREFIX}${Date.now()}`],
    )
  ).rows[0]!.id
  const mkAdvance = async (tag: string, ccy: string, status: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO employee_advances (company_id, advance_number, employee_id, employee_name, currency_code, amount, cash_account_id, advance_account_id, status)
         VALUES ($1,$2,$3,'Fund Tester',$4,1000000,$5,$6,$7) RETURNING id`,
        [companyId, `${PREFIX}${tag}`, employeeId, ccy, cashAccount, advAccount, status],
      )
    ).rows[0]!.id
  advIqd = await mkAdvance('IQD1', 'IQD', 'approved')
  advIqd2 = await mkAdvance('IQD2', 'IQD', 'partially_settled')
  advUsd = await mkAdvance('USD1', 'USD', 'approved')
  advDraft = await mkAdvance('DRAFT', 'IQD', 'draft')
})

afterAll(async () => {
  await cleanup()
  await pool.end()
})

describe('the first decision is unchanged', () => {
  it('an undecided PO takes vendor AP or an advance, and is recorded', async () => {
    const po = await makePO('payment_pending')
    await setFunding(po, 'vendor_ap')
    expect(await fundingOf(po)).toEqual({ funding_source: 'vendor_ap', funding_advance_id: null, funding_decided: true })
    const a = await auditOf(po)
    expect(a).toHaveLength(1)
    expect(a[0]!.old_values).toMatchObject({ funding_decided: false })
    expect(a[0]!.new_values).toMatchObject({ funding_source: 'vendor_ap', funding_decided: true })
    expect(a[0]!.user_id).toBe(ids.admin)
  })

  it('an advance is required for employee advance funding, and must be usable and in the PO\'s currency', async () => {
    const po = await makePO('payment_pending')
    await expect(setFunding(po, 'employee_advance')).rejects.toThrow(/advance must be selected/i)
    await expect(setFunding(po, 'employee_advance', advDraft)).rejects.toThrow(/not in a settleable state/i)
    await expect(setFunding(po, 'employee_advance', advUsd)).rejects.toThrow(/currency must match/i)
    await expect(setFunding(po, 'employee_advance', '00000000-0000-0000-0000-00000000dead')).rejects.toThrow(/not found/i)
    await expect(setFunding(po, 'petty_cash')).rejects.toThrow(/vendor_ap or employee_advance/)
    expect((await fundingOf(po)).funding_decided).toBe(false)
  })
})

describe('a decided funding can be changed while the PO is waiting', () => {
  it('vendor AP to an employee advance (the cash purchase confirmed as AP by mistake)', async () => {
    const po = await makePO('payment_pending', { decided: true, source: 'vendor_ap' })
    await setFunding(po, 'employee_advance', advIqd)
    expect(await fundingOf(po)).toEqual({ funding_source: 'employee_advance', funding_advance_id: advIqd, funding_decided: true })
    const a = await auditOf(po)
    expect(a).toHaveLength(1)
    expect(a[0]!.old_values).toEqual({ funding_source: 'vendor_ap', funding_advance_id: null, funding_decided: true })
    expect(a[0]!.new_values).toEqual({ funding_source: 'employee_advance', funding_advance_id: advIqd, funding_decided: true })
  })

  it('an employee advance to vendor AP clears the advance', async () => {
    const po = await makePO('payment_pending', { decided: true, source: 'employee_advance', advance: advIqd })
    // even if the page still sends the advance it had picked, vendor AP never keeps one
    await setFunding(po, 'vendor_ap', advIqd2)
    expect(await fundingOf(po)).toEqual({ funding_source: 'vendor_ap', funding_advance_id: null, funding_decided: true })
  })

  it('one advance to another, and each change is its own audit row, oldest first', async () => {
    const po = await makePO('payment_pending', { decided: true, source: 'employee_advance', advance: advIqd })
    await setFunding(po, 'employee_advance', advIqd2)
    await setFunding(po, 'vendor_ap')
    expect((await fundingOf(po)).funding_advance_id).toBeNull()
    const a = await auditOf(po)
    expect(a.map((r) => [r.old_values.funding_advance_id, r.new_values.funding_advance_id])).toEqual([
      [advIqd, advIqd2],
      [advIqd2, null],
    ])
  })

  it('the old-flow stage (invoiced) can be changed too', async () => {
    const po = await makePO('invoiced', { decided: true, source: 'vendor_ap' })
    await setFunding(po, 'employee_advance', advIqd)
    expect((await fundingOf(po)).funding_source).toBe('employee_advance')
  })

  it('the checks still apply when changing: an unusable advance leaves the old funding exactly as it was', async () => {
    const po = await makePO('payment_pending', { decided: true, source: 'vendor_ap' })
    await expect(setFunding(po, 'employee_advance', advDraft)).rejects.toThrow(/not in a settleable state/i)
    await expect(setFunding(po, 'employee_advance', advUsd)).rejects.toThrow(/currency must match/i)
    expect(await fundingOf(po)).toEqual({ funding_source: 'vendor_ap', funding_advance_id: null, funding_decided: true })
    expect(await auditOf(po)).toHaveLength(0)
  })
})

describe('two people changing it at once', () => {
  it('the second change is refused instead of silently overwriting the first', async () => {
    const po = await makePO('payment_pending', { decided: true, source: 'vendor_ap' })
    // Another session has changed the PO but not committed yet: setPOFunding reads the committed state (vendor AP), then its
    // write waits on that row lock; once the other change commits, the write no longer matches what was read.
    const other = await pool.connect()
    try {
      await other.query('BEGIN')
      await other.query(`UPDATE purchase_orders SET funding_source='employee_advance', funding_advance_id=$2 WHERE id=$1`, [po, advIqd2])
      const attempt = setFunding(po, 'vendor_ap').then(
        () => 'saved',
        (e: Error) => e.message,
      )
      await new Promise((r) => setTimeout(r, 700))
      await other.query('COMMIT')
      expect(await attempt).toMatch(/changed by someone else/)
    } finally {
      other.release()
    }
    expect(await fundingOf(po)).toEqual({ funding_source: 'employee_advance', funding_advance_id: advIqd2, funding_decided: true })
    expect(await auditOf(po)).toHaveLength(0) // nothing was recorded for the change that did not happen
  })
})

describe('two people changing only the advance at once', () => {
  it('the source is the same on both sides, only the advance differs, and the second change is still refused', async () => {
    const po = await makePO('payment_pending', { decided: true, source: 'employee_advance', advance: advIqd })
    const other = await pool.connect()
    try {
      await other.query('BEGIN')
      await other.query(`UPDATE purchase_orders SET funding_advance_id=$2 WHERE id=$1`, [po, advIqd2]) // still employee_advance
      const attempt = setFunding(po, 'vendor_ap').then(
        () => 'saved',
        (e: Error) => e.message,
      )
      await new Promise((r) => setTimeout(r, 700))
      await other.query('COMMIT')
      expect(await attempt).toMatch(/changed by someone else/)
    } finally {
      other.release()
    }
    expect(await fundingOf(po)).toEqual({ funding_source: 'employee_advance', funding_advance_id: advIqd2, funding_decided: true })
  })
})

describe('what stops a change', () => {
  it('a PO that is completed or closed is final', async () => {
    for (const status of ['completed', 'closed']) {
      const po = await makePO(status, { decided: true, source: 'vendor_ap' })
      await expect(setFunding(po, 'employee_advance', advIqd), status).rejects.toThrow(/must be in invoiced status/i)
      expect((await fundingOf(po)).funding_source).toBe('vendor_ap')
    }
  })

  it('a vendor invoice in AP stops it (a cancelled one does not)', async () => {
    const po = await makePO('payment_pending', { decided: true, source: 'vendor_ap' })
    const inv = await pool.query<{ id: string }>(
      `INSERT INTO vendor_invoices (company_id, vendor_id, po_id, invoice_number, invoice_date, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,CURRENT_DATE,'draft',$5) RETURNING id`,
      [companyId, vendorId, po, `${PREFIX}INV-1`, ids.admin],
    )
    await expect(setFunding(po, 'employee_advance', advIqd)).rejects.toThrow(/vendor invoice already exists/i)
    expect((await fundingOf(po)).funding_source).toBe('vendor_ap')
    await pool.query(`UPDATE vendor_invoices SET status='cancelled' WHERE id=$1`, [inv.rows[0]!.id])
    await setFunding(po, 'employee_advance', advIqd)
    expect((await fundingOf(po)).funding_source).toBe('employee_advance')
  })

  it('a line already settled against an advance stops it', async () => {
    const po = await makePO('payment_pending', { decided: true, source: 'employee_advance', advance: advIqd })
    const line = await pool.query<{ id: string }>(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, currency_code) VALUES ($1,1,'l',1,10,10,'IQD') RETURNING id`,
      [po],
    )
    const s = await pool.query<{ id: string }>(
      `INSERT INTO advance_settlements (company_id, settlement_number, advance_id, employee_id, employee_name, currency_code, total_amount, status)
       VALUES ($1,$2,$3,$4,'Fund Tester','IQD',10,'approved') RETURNING id`,
      [companyId, `${PREFIX}SET-1`, advIqd, employeeId],
    )
    await pool.query(`UPDATE po_lines SET advance_settlement_id=$1 WHERE id=$2`, [s.rows[0]!.id, line.rows[0]!.id])
    await expect(setFunding(po, 'vendor_ap')).rejects.toThrow(/already settled against an advance/i)
    expect((await fundingOf(po)).funding_source).toBe('employee_advance')
  })

  it('only Finance (finance.ap.approve) may change it, and only in the PO\'s own company', async () => {
    const po = await makePO('payment_pending', { decided: true, source: 'vendor_ap' })
    await expect(setFunding(po, 'employee_advance', advIqd, 'plain')).rejects.toThrow(/Finance approval permission required/)
    await expect(setFunding(po, 'employee_advance', advIqd, 'other')).rejects.toThrow(/PO not found/)
    expect(await fundingOf(po)).toEqual({ funding_source: 'vendor_ap', funding_advance_id: null, funding_decided: true })
    expect(await auditOf(po)).toHaveLength(0)
  })
})
