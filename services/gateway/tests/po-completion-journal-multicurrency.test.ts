// D10: postPOCompletionJournal used to read purchase_orders.total_amount —
// a single, fx_rate_to_base-converted figure. Once that conversion was
// removed (recalcPOTotalsGW writes NULL for a PO whose lines span more
// than one currency_code), this function's parseFloat(total_amount ?? 0)
// silently treated every mixed-currency PO as a zero-cost PO and skipped
// posting a journal entirely — no error, no log, the project cost just
// never showed up. Fixed to post one self-contained journal_entries row
// per currency present on the PO, each balanced in its own currency, no
// fx conversion. Real-Postgres pattern, isolated company (own companyId)
// per project-profitability-per-currency.test.ts.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-POCOMPJ-TEST-'
const TEST_USER_EMAIL = 'g-po-completion-journal-test@fnc-erp.local'

async function makeCompanyWithPO(): Promise<{
  companyId: string
  userId: string
  poId: string
}> {
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  const companyId = companyRes.rows[0]!.id

  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  const userId = userR.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
    [userId, companyId],
  )

  const expenseRes = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES ($1,'5100','Project Expense','expense',true,true) RETURNING id`,
    [companyId],
  )
  const apRes = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES ($1,'2100','Accounts Payable','liability',true,true) RETURNING id`,
    [companyId],
  )
  // Company-wide (currency_code IS NULL) rows — resolvePostingAccount
  // matches these for any currency, so one row each covers both IQD and
  // USD without needing a currency-specific override.
  await pool.query(
    `INSERT INTO company_posting_accounts (company_id, role, currency_code, account_id, created_by, updated_by)
     VALUES ($1,'expense_default',NULL,$2,$3,$3)`,
    [companyId, expenseRes.rows[0]!.id, userId],
  )
  await pool.query(
    `INSERT INTO company_posting_accounts (company_id, role, currency_code, account_id, created_by, updated_by)
     VALUES ($1,'ap',NULL,$2,$3,$3)`,
    [companyId, apRes.rows[0]!.id, userId],
  )

  const analyticRes = await pool.query<{ id: string }>(
    `INSERT INTO analytic_accounts (company_id, code, name) VALUES ($1,$2,'Test analytic') RETURNING id`,
    [companyId, `AA-${Date.now().toString(36)}`],
  )
  const projectRes = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, budget_amount, budget_currency, analytic_account_id, created_by)
     VALUES ($1,$2,'Test project','ongoing',1000000,'IQD',$3,$4) RETURNING id`,
    [companyId, `${NAME_PREFIX}PRJ-${Date.now()}`, analyticRes.rows[0]!.id, userId],
  )
  const projectId = projectRes.rows[0]!.id

  const vendorRes = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
    [companyId, `${NAME_PREFIX}VENDOR-${Date.now()}`],
  )

  const poRes = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders
       (company_id, po_number, vendor_id, currency_code, base_currency_code, status, purpose,
        project_id, linked_project_id, created_by, organizer_id, funding_decided)
     VALUES ($1,$2,$3,'IQD','IQD','invoiced','project',$4,$4,$5,$5,true) RETURNING id`,
    [companyId, `${NAME_PREFIX}PO-${Date.now()}`, vendorRes.rows[0]!.id, projectId, userId],
  )
  const poId = poRes.rows[0]!.id

  const productIqd = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [companyId, `${NAME_PREFIX}SKU-IQD-${Date.now()}`],
  )
  const productUsd = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [companyId, `${NAME_PREFIX}SKU-USD-${Date.now()}`],
  )
  await pool.query(
    `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price, currency_code)
     VALUES ($1,1,'iqd line',$2,2,100,200,'IQD')`,
    [poId, productIqd.rows[0]!.id],
  )
  await pool.query(
    `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price, currency_code)
     VALUES ($1,2,'usd line',$2,3,10,30,'USD')`,
    [poId, productUsd.rows[0]!.id],
  )

  return { companyId, userId, poId }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'system_admin', module: 'all', sessionId: 'po-completion-journal-test' } }
}

async function cleanup(companyId: string): Promise<void> {
  await pool.query(
    `DELETE FROM journal_po_links WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(
    `DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [
    companyId,
  ])
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM products WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM projects WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM analytic_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM company_posting_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('completePO — postPOCompletionJournal with a mixed-currency PO', () => {
  it('posts one balanced journal entry per currency, both linked to the PO', async () => {
    const { companyId, userId, poId } = await makeCompanyWithPO()
    try {
      await resolvers.Mutation.completePO(null, { id: poId }, ctxFor(companyId, userId) as never)

      const journals = await pool.query<{ id: string; reference: string }>(
        `SELECT id, reference FROM journal_entries WHERE source_type='po_completion' AND source_id=$1 ORDER BY reference`,
        [poId],
      )
      expect(journals.rows).toHaveLength(2)

      const links = await pool.query<{ journal_entry_id: string }>(
        `SELECT journal_entry_id FROM journal_po_links WHERE po_id=$1`,
        [poId],
      )
      expect(links.rows.map((r) => r.journal_entry_id).sort()).toEqual(
        journals.rows.map((r) => r.id).sort(),
      )

      for (const je of journals.rows) {
        const lines = await pool.query<{
          debit: string
          credit: string
          currency_code: string
          amount_company_currency: string
        }>(`SELECT debit, credit, currency_code, amount_company_currency FROM journal_lines WHERE journal_entry_id=$1`, [
          je.id,
        ])
        expect(lines.rows).toHaveLength(2)
        const ccy = lines.rows[0]!.currency_code
        expect(lines.rows.every((l) => l.currency_code === ccy)).toBe(true)
        const totalDebit = lines.rows.reduce((s, l) => s + parseFloat(l.debit), 0)
        const totalCredit = lines.rows.reduce((s, l) => s + parseFloat(l.credit), 0)
        expect(totalDebit).toBe(totalCredit) // balanced
        // No fx conversion: amount_company_currency equals the line's own amount.
        for (const l of lines.rows) {
          expect(parseFloat(l.amount_company_currency)).toBe(Math.max(parseFloat(l.debit), parseFloat(l.credit)))
        }
        if (ccy === 'IQD') expect(totalDebit).toBe(200)
        if (ccy === 'USD') expect(totalDebit).toBe(30)
      }
      const references = journals.rows.map((j) => j.reference)
      expect(references.some((r) => r.includes('-IQD'))).toBe(true)
      expect(references.some((r) => r.includes('-USD'))).toBe(true)
    } finally {
      await cleanup(companyId)
    }
  })
})
