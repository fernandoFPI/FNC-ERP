// Covers the new "Finance decides funding" flow: an expense claim no longer
// picks reimburse/advance/petty_cash at submission (RequisitionForm.tsx no
// longer has a "Paid" dropdown) — it submits plain, gets a legitimacy
// approve (submitted -> approved, no posting), then a Finance audit pass/
// fail (approved -> audited, or back to draft on fail), then Finance picks
// the funding source via POST /:id/post-payment (only reachable from
// 'audited'), which is the step that actually posts money. Same
// real-Postgres + supertest pattern as petty-cash.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser, cleanFinanceData, getAccountId } from './setup.js'

const app = createApp()
let token: string
let testUserId: string
let employeeId: string
let cashAccountId: string
let categoryGlAccountId: string
let advanceAssetAccountId: string
let costCenterId: string
let categoryId: string
let floatId: string
let advanceId: string

async function cleanFixtures(): Promise<void> {
  await pool.query(`DELETE FROM expense_claim_lines WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_claims WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM advance_settlement_lines WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM advance_settlements WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM employee_advances WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM petty_cash_transactions WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM petty_cash_floats WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_categories WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM company_default_cash_accounts WHERE company_id=$1`, [TEST_COMPANY_ID])
  // journal_lines.cost_center_id has no ON DELETE CASCADE — the posted
  // advance-settlement JE in this file's own tests references the test cost
  // center, so it must go before cost_centers itself (cleanFinanceData's own
  // later journal_entries/journal_lines wipe runs after this and becomes a
  // harmless no-op for these rows).
  await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM cost_centers WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM employees WHERE employee_number='EXP-FUNDING-TEST'`)
}

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  testUserId = user.userId

  cashAccountId = await getAccountId('1100')
  await pool.query(`UPDATE chart_of_accounts SET account_category='CASH' WHERE id=$1`, [cashAccountId])
  categoryGlAccountId = await getAccountId('5700')
  advanceAssetAccountId = await getAccountId('1200')

  await cleanFixtures()

  const empRes = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Expense','Tester',CURRENT_DATE,'EXP-FUNDING-TEST')
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, testUserId],
  )
  employeeId = empRes.rows[0]!.id

  await pool.query(
    `INSERT INTO company_default_cash_accounts (company_id, currency_code, account_id) VALUES ($1,'IQD',$2)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET account_id = EXCLUDED.account_id`,
    [TEST_COMPANY_ID, cashAccountId],
  )

  const catRes = await pool.query<{ id: string }>(
    `INSERT INTO expense_categories (company_id, name, gl_account_id) VALUES ($1,'Funding Test Category',$2) RETURNING id`,
    [TEST_COMPANY_ID, categoryGlAccountId],
  )
  categoryId = catRes.rows[0]!.id

  const floatRes = await pool.query<{ id: string }>(
    `INSERT INTO petty_cash_floats (company_id, name, currency_code, authorized_limit, current_balance, gl_account_id, is_active)
     VALUES ($1,'Funding Test Float','IQD',1000000,100000,$2,true) RETURNING id`,
    [TEST_COMPANY_ID, cashAccountId],
  )
  floatId = floatRes.rows[0]!.id

  const ccRes = await pool.query<{ id: string }>(
    `INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,'FND-TEST','Funding Test CC','overhead') RETURNING id`,
    [TEST_COMPANY_ID],
  )
  costCenterId = ccRes.rows[0]!.id

  const advRes = await pool.query<{ id: string }>(
    `INSERT INTO employee_advances
       (company_id, advance_number, employee_id, employee_name, currency_code, fx_rate, amount,
        cash_account_id, advance_account_id, cost_center_id, status)
     VALUES ($1,$2,$3,'Expense Tester','IQD',1,500000,$4,$5,$6,'approved') RETURNING id`,
    [TEST_COMPANY_ID, `ADV-FND-TEST-${Date.now()}`, employeeId, cashAccountId, advanceAssetAccountId, costCenterId],
  )
  advanceId = advRes.rows[0]!.id
})

afterAll(async () => {
  await cleanFixtures()
  await cleanFinanceData()
  await pool.end()
})

async function submitClaim(amount: number): Promise<{ id: string; lineId: string }> {
  const res = await request(app)
    .post('/finance/expense-claims/request-self')
    .set('Authorization', `Bearer ${token}`)
    .send({
      currency_code: 'IQD',
      lines: [{ expense_date: '2026-01-10', category_id: categoryId, description: 'Test expense', amount }],
    })
  expect(res.status).toBe(201)
  expect(res.body.data.status).toBe('submitted')
  expect(res.body.data.reimbursement_account_id).toBeNull()
  return { id: res.body.data.id as string, lineId: res.body.data.lines[0].id as string }
}

// approve -> pass-audit, the two steps every post-payment test needs to get
// a claim to 'audited' first.
async function approveAndAudit(id: string): Promise<void> {
  const approveRes = await request(app)
    .post(`/finance/expense-claims/${id}/approve`)
    .set('Authorization', `Bearer ${token}`)
  expect(approveRes.status).toBe(200)
  expect(approveRes.body.data.status).toBe('approved')
  const auditRes = await request(app)
    .post(`/finance/expense-claims/${id}/pass-audit`)
    .set('Authorization', `Bearer ${token}`)
  expect(auditRes.status).toBe(200)
  expect(auditRes.body.data.status).toBe('audited')
}

describe('Expense claim funding flow', () => {
  it('submits without a reimbursement account, approves with no posting, audits, then posts via reimburse', async () => {
    const { id } = await submitClaim(10000)

    const approveRes = await request(app)
      .post(`/finance/expense-claims/${id}/approve`)
      .set('Authorization', `Bearer ${token}`)
    expect(approveRes.status).toBe(200)
    expect(approveRes.body.data.status).toBe('approved')
    expect(approveRes.body.data.journal_entry_id).toBeNull()

    const auditRes = await request(app)
      .post(`/finance/expense-claims/${id}/pass-audit`)
      .set('Authorization', `Bearer ${token}`)
    expect(auditRes.status).toBe(200)
    expect(auditRes.body.data.status).toBe('audited')
    expect(auditRes.body.data.audited_by).toBe(testUserId)

    const postRes = await request(app)
      .post(`/finance/expense-claims/${id}/post-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ funding_source: 'reimburse' })
    expect(postRes.status).toBe(200)
    expect(postRes.body.data.status).toBe('posted')
    expect(postRes.body.data.funding_source).toBe('reimburse')
    expect(postRes.body.data.reimbursement_account_id).toBe(cashAccountId)
    expect(postRes.body.data.journal_entry_id).not.toBeNull()

    const lines = await pool.query(
      `SELECT debit, credit FROM journal_lines WHERE journal_entry_id=$1`,
      [postRes.body.data.journal_entry_id],
    )
    const totalDebit = lines.rows.reduce((s, r) => s + Number(r.debit), 0)
    const totalCredit = lines.rows.reduce((s, r) => s + Number(r.credit), 0)
    expect(totalDebit).toBeCloseTo(totalCredit, 5)
    expect(totalDebit).toBeCloseTo(10000, 5)
  })

  it('posts via petty cash — decrements the float and logs a transaction', async () => {
    const before = await pool.query<{ current_balance: string }>(
      `SELECT current_balance FROM petty_cash_floats WHERE id=$1`,
      [floatId],
    )
    const balanceBefore = Number(before.rows[0]!.current_balance)

    const { id } = await submitClaim(15000)
    await approveAndAudit(id)

    const optionsRes = await request(app)
      .get(`/finance/expense-claims/${id}/funding-options`)
      .set('Authorization', `Bearer ${token}`)
    expect(optionsRes.status).toBe(200)
    expect(optionsRes.body.data.petty_cash_floats.some((f: { id: string }) => f.id === floatId)).toBe(true)
    expect(optionsRes.body.data.advances.some((a: { id: string }) => a.id === advanceId)).toBe(true)

    const postRes = await request(app)
      .post(`/finance/expense-claims/${id}/post-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ funding_source: 'petty_cash', petty_cash_float_id: floatId })
    expect(postRes.status).toBe(200)
    expect(postRes.body.data.funding_source).toBe('petty_cash')
    expect(postRes.body.data.petty_cash_float_id).toBe(floatId)

    const after = await pool.query<{ current_balance: string }>(
      `SELECT current_balance FROM petty_cash_floats WHERE id=$1`,
      [floatId],
    )
    expect(Number(after.rows[0]!.current_balance)).toBeCloseTo(balanceBefore - 15000, 5)

    const txn = await pool.query(
      `SELECT amount, transaction_type, journal_entry_id FROM petty_cash_transactions WHERE float_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [floatId],
    )
    expect(Number(txn.rows[0]!.amount)).toBeCloseTo(15000, 5)
    expect(txn.rows[0]!.transaction_type).toBe('spend')
    expect(txn.rows[0]!.journal_entry_id).toBe(postRes.body.data.journal_entry_id)
  })

  it('rejects petty cash posting when the float balance is insufficient', async () => {
    const { id } = await submitClaim(999999999)
    await approveAndAudit(id)

    const postRes = await request(app)
      .post(`/finance/expense-claims/${id}/post-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ funding_source: 'petty_cash', petty_cash_float_id: floatId })
    expect(postRes.status).toBe(422)
    expect(postRes.body.error.code).toBe('INSUFFICIENT_BALANCE')

    // The claim must stay 'audited' — a rejected posting attempt is not a
    // partial state change.
    const claimRes = await request(app)
      .get(`/finance/expense-claims/${id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(claimRes.body.data.status).toBe('audited')
  })

  it('posts via advance settlement — creates a real advance_settlements record and clears outstanding', async () => {
    const advBefore = await pool.query<{ settled_amount: string; outstanding_amount: string }>(
      `SELECT settled_amount, outstanding_amount FROM employee_advances WHERE id=$1`,
      [advanceId],
    )
    const outstandingBefore = Number(advBefore.rows[0]!.outstanding_amount)

    const { id } = await submitClaim(20000)
    await approveAndAudit(id)

    const postRes = await request(app)
      .post(`/finance/expense-claims/${id}/post-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ funding_source: 'advance', advance_id: advanceId })
    expect(postRes.status).toBe(200)
    expect(postRes.body.data.funding_source).toBe('advance')
    expect(postRes.body.data.settled_via_settlement_id).not.toBeNull()

    const settlement = await pool.query(
      `SELECT status, total_amount, advance_id FROM advance_settlements WHERE id=$1`,
      [postRes.body.data.settled_via_settlement_id],
    )
    expect(settlement.rows[0]!.status).toBe('approved')
    expect(Number(settlement.rows[0]!.total_amount)).toBeCloseTo(20000, 5)
    expect(settlement.rows[0]!.advance_id).toBe(advanceId)

    const settlementLines = await pool.query(
      `SELECT amount, cost_center_id, gl_account_id FROM advance_settlement_lines WHERE settlement_id=$1`,
      [postRes.body.data.settled_via_settlement_id],
    )
    expect(settlementLines.rows.length).toBe(1)
    expect(settlementLines.rows[0]!.cost_center_id).toBe(costCenterId)
    expect(settlementLines.rows[0]!.gl_account_id).toBe(categoryGlAccountId)

    const advAfter = await pool.query<{ settled_amount: string; outstanding_amount: string }>(
      `SELECT settled_amount, outstanding_amount FROM employee_advances WHERE id=$1`,
      [advanceId],
    )
    expect(Number(advAfter.rows[0]!.outstanding_amount)).toBeCloseTo(outstandingBefore - 20000, 5)
  })

  it('allows reject at submitted, and also at approved (Finance can still bounce it back before posting)', async () => {
    const claim1 = await submitClaim(5000)
    const rejectAtSubmitted = await request(app)
      .post(`/finance/expense-claims/${claim1.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Not a valid business expense' })
    expect(rejectAtSubmitted.status).toBe(200)
    expect(rejectAtSubmitted.body.data.status).toBe('rejected')

    const claim2 = await submitClaim(5000)
    await request(app).post(`/finance/expense-claims/${claim2.id}/approve`).set('Authorization', `Bearer ${token}`)
    const rejectAtApproved = await request(app)
      .post(`/finance/expense-claims/${claim2.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong cost center, resubmit' })
    expect(rejectAtApproved.status).toBe(200)
    expect(rejectAtApproved.body.data.status).toBe('rejected')
  })

  it('post-payment is unreachable from approved — audited is required first', async () => {
    const { id } = await submitClaim(5000)
    await request(app).post(`/finance/expense-claims/${id}/approve`).set('Authorization', `Bearer ${token}`)

    const postRes = await request(app)
      .post(`/finance/expense-claims/${id}/post-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ funding_source: 'reimburse' })
    expect(postRes.status).toBe(409)
    expect(postRes.body.error.code).toBe('INVALID_STATUS')
  })

  it('fail-audit sends an approved claim back to draft, editable, then resubmits through the normal path', async () => {
    const { id, lineId } = await submitClaim(8000)
    await request(app).post(`/finance/expense-claims/${id}/approve`).set('Authorization', `Bearer ${token}`)

    const failRes = await request(app)
      .post(`/finance/expense-claims/${id}/fail-audit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong category — resubmit under Fuel' })
    expect(failRes.status).toBe(200)
    expect(failRes.body.data.status).toBe('draft')
    expect(failRes.body.data.audit_fail_reason).toBe('Wrong category — resubmit under Fuel')

    // Draft and editable — PUT /:id only allows this from 'draft'.
    const getRes = await request(app)
      .get(`/finance/expense-claims/${id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(getRes.body.data.status).toBe('draft')

    const editRes = await request(app)
      .put(`/finance/expense-claims/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        employee_id: employeeId,
        employee_name: 'Expense Tester',
        currency_code: 'IQD',
        lines: [{ id: lineId, expense_date: '2026-01-10', category_id: categoryId, description: 'Corrected', amount: 9000 }],
      })
    expect(editRes.status).toBe(200)
    expect(editRes.body.data.total_amount).toBe('9000.00')

    // Normal path again, no special-casing: submit -> approve -> pass-audit.
    const resubmitRes = await request(app)
      .post(`/finance/expense-claims/${id}/submit`)
      .set('Authorization', `Bearer ${token}`)
    expect(resubmitRes.status).toBe(200)
    expect(resubmitRes.body.data.status).toBe('submitted')
    await approveAndAudit(id)
  })
})
