// 0.1 sweep: payrollTaxReport's rows never carried currency_code through
// to the client, and the frontend then summed gross/tax/SS blind across
// whatever currencies happened to come back. Real-Postgres pattern.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-PAYTAX-TEST-'
const TEST_USER_EMAIL = 'g-payroll-tax-test@fnc-erp.local'

async function makeCompany(): Promise<{ companyId: string; userId: string }> {
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
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'company_admin','all') ON CONFLICT DO NOTHING`,
    [userId, companyId],
  )
  return { companyId, userId }
}

async function makeEmployee(companyId: string, name: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number, status)
     VALUES ($1,$2,'Tester',CURRENT_DATE,$3,'active') RETURNING id`,
    [companyId, name, `${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  return r.rows[0]!.id
}

async function makePayslip(
  companyId: string,
  userId: string,
  employeeId: string,
  opts: { currencyCode: string; grossSalary: number; incomeTax: number; socialSecurity: number },
): Promise<void> {
  const runRes = await pool.query<{ id: string }>(
    `INSERT INTO payroll_runs (company_id, period_name, start_date, end_date, status, created_by)
     VALUES ($1,$2,'2031-05-01','2031-05-31','posted',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}${opts.currencyCode}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, userId],
  )
  const netSalary = opts.grossSalary - opts.incomeTax - opts.socialSecurity
  await pool.query(
    `INSERT INTO payslips
       (payroll_run_id, employee_id, company_id, base_salary, gross_salary, income_tax, social_security, net_salary, currency_code)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8)`,
    [runRes.rows[0]!.id, employeeId, companyId, opts.grossSalary, opts.incomeTax, opts.socialSecurity, netSalary, opts.currencyCode],
  )
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'payroll-tax-test' } }
}

async function cleanup(companyId: string): Promise<void> {
  await pool.query(
    `DELETE FROM payslips WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM payroll_runs WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM employees WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('payrollTaxReport — per currency', () => {
  it('keeps IQD and USD payslips apart', async () => {
    const { companyId, userId } = await makeCompany()
    try {
      const empIqd = await makeEmployee(companyId, 'Iqd')
      const empUsd = await makeEmployee(companyId, 'Usd')
      await makePayslip(companyId, userId, empIqd, {
        currencyCode: 'IQD',
        grossSalary: 1000000,
        incomeTax: 50000,
        socialSecurity: 20000,
      })
      await makePayslip(companyId, userId, empUsd, {
        currencyCode: 'USD',
        grossSalary: 2000,
        incomeTax: 100,
        socialSecurity: 40,
      })

      const iqd = (await resolvers.Query.payrollTaxReport(
        null,
        { fromDate: '2031-05-01', toDate: '2031-05-31' },
        ctxFor(companyId, userId) as never,
      )) as {
        currencyCode: string
        availableCurrencies: string[]
        rows: { grossPay: number; incomeTaxWithheld: number; socialSecurity: number }[]
      }
      expect(iqd.currencyCode).toBe('IQD')
      expect(iqd.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
      expect(iqd.rows).toHaveLength(1)
      expect(iqd.rows[0]!.grossPay).toBe(1000000)

      const usd = (await resolvers.Query.payrollTaxReport(
        null,
        { fromDate: '2031-05-01', toDate: '2031-05-31', currencyCode: 'USD' },
        ctxFor(companyId, userId) as never,
      )) as { rows: { grossPay: number }[] }
      expect(usd.rows).toHaveLength(1)
      expect(usd.rows[0]!.grossPay).toBe(2000)
    } finally {
      await cleanup(companyId)
    }
  })
})
