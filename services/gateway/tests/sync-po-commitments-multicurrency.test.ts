// D10: syncPOCommitments used to read purchase_orders.total_amount/
// currency_code as a single pair per PO. Once a mixed-currency PO's
// total_amount became NULL (recalcPOTotalsGW no longer blends currencies),
// writing that NULL into project_committed_costs.committed_amount
// (NUMERIC NOT NULL) would throw on every sync for a project with any
// mixed-currency PO. Fixed to read getPOCurrencyTotals and keep one
// committed_costs row per (PO, currency) — the shape this table already
// uses elsewhere (cost-control reports filter committed_amount by
// currency_code). Real-Postgres pattern, isolated company.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-SYNCPOCOM-TEST-'
const TEST_USER_EMAIL = 'g-sync-po-commitments-test@fnc-erp.local'

async function makeCompanyWithPO(): Promise<{ companyId: string; userId: string; projectId: string; poId: string }> {
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

  const projectRes = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, budget_amount, budget_currency, created_by)
     VALUES ($1,$2,'Test project','ongoing',1000000,'IQD',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}PRJ-${Date.now()}`, userId],
  )
  const projectId = projectRes.rows[0]!.id

  const vendorRes = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
    [companyId, `${NAME_PREFIX}VENDOR-${Date.now()}`],
  )

  const poRes = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders
       (company_id, po_number, vendor_id, currency_code, base_currency_code, status, purpose, project_id, linked_project_id, created_by)
     VALUES ($1,$2,$3,'IQD','IQD','approved','project',$4,$4,$5) RETURNING id`,
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

  return { companyId, userId, projectId, poId }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'system_admin', module: 'all', sessionId: 'sync-po-commitments-test' } }
}

async function cleanup(companyId: string): Promise<void> {
  await pool.query(
    `DELETE FROM project_committed_costs WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [
    companyId,
  ])
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM products WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM projects WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('syncPOCommitments — mixed-currency PO', () => {
  it('writes one committed_costs row per currency instead of throwing on a NULL total_amount', async () => {
    const { companyId, userId, projectId, poId } = await makeCompanyWithPO()
    try {
      await resolvers.Mutation.syncPOCommitments(null, { projectId }, ctxFor(companyId, userId) as never)

      const rows = await pool.query<{ currency_code: string; committed_amount: string }>(
        `SELECT currency_code, committed_amount FROM project_committed_costs WHERE project_id=$1 AND reference_id=$2 ORDER BY currency_code`,
        [projectId, poId],
      )
      expect(rows.rows).toHaveLength(2)
      const iqd = rows.rows.find((r) => r.currency_code === 'IQD')!
      const usd = rows.rows.find((r) => r.currency_code === 'USD')!
      expect(parseFloat(iqd.committed_amount)).toBe(200)
      expect(parseFloat(usd.committed_amount)).toBe(30)

      // Re-running updates both rows in place rather than duplicating them.
      await resolvers.Mutation.syncPOCommitments(null, { projectId }, ctxFor(companyId, userId) as never)
      const rowsAgain = await pool.query<{ id: string }>(
        `SELECT id FROM project_committed_costs WHERE project_id=$1 AND reference_id=$2`,
        [projectId, poId],
      )
      expect(rowsAgain.rows).toHaveLength(2)
    } finally {
      await cleanup(companyId)
    }
  })
})
