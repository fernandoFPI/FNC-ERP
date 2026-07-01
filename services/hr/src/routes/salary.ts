import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const salaryRouter: IRouter = Router()

const SalaryConfigSchema = z.object({
  employee_id: z.string().uuid(),
  base_salary: z.number().nonnegative(),
  currency_code: z.string().length(3).default('IQD'),
  housing_allowance: z.number().nonnegative().default(0),
  transport_allowance: z.number().nonnegative().default(0),
  other_allowances: z.number().nonnegative().default(0),
  income_tax_pct: z.number().min(0).max(1).default(0),
  social_security_pct: z.number().min(0).max(1).default(0),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

salaryRouter.get('/:employeeId', requirePermission('hr.salary.view', 'view'), async (req, res) => {
  try {
    const emp = await query(
      `SELECT id FROM employees WHERE id = $1 AND company_id = $2`,
      [req.params['employeeId'], req.auth!.companyId],
    )
    if (!emp.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Employee not found')
    const result = await query(
      `SELECT * FROM salary_configs WHERE employee_id = $1 ORDER BY effective_from DESC`,
      [req.params['employeeId']],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch salary configs', err) }
})

salaryRouter.get('/:employeeId/current', requirePermission('hr.salary.view', 'view'), async (req, res) => {
  try {
    const emp = await query(
      `SELECT id FROM employees WHERE id = $1 AND company_id = $2`,
      [req.params['employeeId'], req.auth!.companyId],
    )
    if (!emp.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Employee not found')
    const result = await query(
      `SELECT * FROM salary_configs WHERE employee_id = $1 AND effective_to IS NULL`,
      [req.params['employeeId']],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'No active salary config')
    sendOk(res, result.rows[0]!)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch salary config', err) }
})

// POST — creates new salary config, closes previous one
salaryRouter.post('/', requirePermission('hr.salary.edit', 'edit'), async (req, res) => {
  const parsed = SalaryConfigSchema.safeParse(req.body)
  if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())

  const d = parsed.data
  const companyId = req.auth!.companyId

  try {
    // Verify employee belongs to company
    const emp = await query(`SELECT id FROM employees WHERE id = $1 AND company_id = $2`, [d.employee_id, companyId])
    if (!emp.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Employee not found')

    const newConfig = await withTransaction(
      { companyId, userId: req.auth!.userId, role: 'company_admin' },
      async (client) => {
        // Close existing active config — PostgreSQL handles date arithmetic to avoid JS timezone issues
        await client.query(
          `UPDATE salary_configs SET effective_to = ($1::date - 1), updated_at = NOW()
           WHERE employee_id = $2 AND effective_to IS NULL`,
          [d.effective_from, d.employee_id],
        )
        const result = await client.query(
          `INSERT INTO salary_configs (employee_id, company_id, base_salary, currency_code,
           housing_allowance, transport_allowance, other_allowances, income_tax_pct, social_security_pct,
           effective_from, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [d.employee_id, companyId, d.base_salary, d.currency_code,
           d.housing_allowance, d.transport_allowance, d.other_allowances,
           d.income_tax_pct, d.social_security_pct, d.effective_from, req.auth!.userId],
        )
        return result.rows[0]!
      },
    )
    sendOk(res, newConfig, 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create salary config', err) }
})
