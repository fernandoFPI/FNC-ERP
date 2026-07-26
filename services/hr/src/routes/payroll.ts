import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const payrollRouter: IRouter = Router()

const CreateRunSchema = z.object({
  period_name: z.string().min(1).max(50),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

payrollRouter.get('/', requirePermission('payroll.runs.view', 'view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM payroll_runs WHERE company_id = $1 ORDER BY start_date DESC`,
      [req.auth!.companyId],
    )
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch payroll runs', err)
  }
})

payrollRouter.get('/:id', requirePermission('payroll.runs.view', 'view'), async (req, res) => {
  try {
    const result = await query(`SELECT * FROM payroll_runs WHERE id = $1 AND company_id = $2`, [
      req.params['id'],
      req.auth!.companyId,
    ])
    const row = result.rows[0]
    if (!row) {
      sendError(res, 404, 'NOT_FOUND', 'Payroll run not found')
      return
    }
    sendOk(res, row)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch payroll run', err)
  }
})

payrollRouter.get(
  '/:id/payslips',
  requirePermission('payroll.runs.view', 'view'),
  async (req, res) => {
    try {
      const run = await query(`SELECT id FROM payroll_runs WHERE id = $1 AND company_id = $2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!run.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Payroll run not found')
        return
      }
      const result = await query(
        `SELECT ps.*, e.first_name || ' ' || e.last_name AS employee_name, e.employee_number
       FROM payslips ps JOIN employees e ON e.id = ps.employee_id
       WHERE ps.payroll_run_id = $1 ORDER BY e.last_name, e.first_name`,
        [req.params['id']],
      )
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch payslips', err)
    }
  },
)

payrollRouter.post('/', requirePermission('payroll.runs.edit', 'edit'), async (req, res) => {
  const parsed = CreateRunSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }
  try {
    const { period_name, start_date, end_date } = parsed.data
    const result = await query(
      `INSERT INTO payroll_runs (company_id, period_name, start_date, end_date, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.auth!.companyId, period_name, start_date, end_date, req.auth!.userId],
    )
    sendOk(res, result.rows[0]!, 201)
  } catch (err) {
    const e = err as { code?: string }
    if (e.code === '23505') {
      sendError(res, 409, 'DUPLICATE', 'Payroll run for this period already exists')
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create payroll run', err)
  }
})

// POST /:id/process — compute payslips for all active employees
payrollRouter.post(
  '/:id/process',
  requirePermission('payroll.runs.approve', 'approve'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    try {
      const runResult = await query(
        `SELECT * FROM payroll_runs WHERE id = $1 AND company_id = $2`,
        [req.params['id'], companyId],
      )
      const run = runResult.rows[0] as
        | {
            id: string
            status: string
            start_date: string
            end_date: string
            period_name: string
          }
        | undefined
      if (!run) {
        sendError(res, 404, 'NOT_FOUND', 'Payroll run not found')
        return
      }
      if (run.status !== 'draft') {
        sendError(res, 409, 'WRONG_STATUS', `Cannot process run in status: ${run.status}`)
        return
      }

      const processedRun = await withTransaction(
        { companyId, userId: req.auth!.userId, role: 'company_admin' },
        async (client) => {
          await client.query(
            `UPDATE payroll_runs SET status = 'processing', processed_by = $1, updated_at = NOW() WHERE id = $2`,
            [req.auth!.userId, run.id],
          )

          // Fetch all active employees with current salary config
          const emps = await client.query<{
            id: string
            first_name: string
            last_name: string
            base_salary: string
            currency_code: string
            housing_allowance: string
            transport_allowance: string
            other_allowances: string
            income_tax_pct: string
            social_security_pct: string
          }>(
            `SELECT e.id, e.first_name, e.last_name,
           sc.base_salary, sc.currency_code, sc.housing_allowance, sc.transport_allowance,
           sc.other_allowances, sc.income_tax_pct, sc.social_security_pct
           FROM employees e
           JOIN salary_configs sc ON sc.employee_id = e.id AND sc.effective_to IS NULL
           WHERE e.company_id = $1 AND e.status = 'active'`,
            [companyId],
          )

          let totalGross = 0
          let totalNet = 0
          let totalDeductions = 0

          for (const emp of emps.rows) {
            // Fetch overtime hours for this period
            const otResult = await client.query<{ total_ot: string }>(
              `SELECT COALESCE(SUM(overtime_hours), 0) AS total_ot
             FROM overtime_logs
             WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3`,
              [emp.id, run.start_date, run.end_date],
            )
            const overtimeHours = parseFloat((otResult.rows[0] as { total_ot: string }).total_ot)

            // Fetch approved leave days for this period
            const leaveResult = await client.query<{ leave_days: string }>(
              `SELECT COALESCE(SUM(total_days), 0) AS leave_days
             FROM leave_requests
             WHERE employee_id = $1 AND status = 'approved'
               AND start_date <= $3 AND end_date >= $2`,
              [emp.id, run.start_date, run.end_date],
            )
            const leaveDays = parseFloat((leaveResult.rows[0] as { leave_days: string }).leave_days)

            const baseSalary = parseFloat(emp.base_salary)
            const housingAllowance = parseFloat(emp.housing_allowance)
            const transportAllowance = parseFloat(emp.transport_allowance)
            const otherAllowances = parseFloat(emp.other_allowances)
            const incomeTaxPct = parseFloat(emp.income_tax_pct)
            const ssPct = parseFloat(emp.social_security_pct)

            // Daily rate for overtime (monthly / 30 / 8 hours * 1.5 OT multiplier)
            const dailyRate = baseSalary / 30
            const hourlyRate = dailyRate / 8
            const overtimePay = Math.round(overtimeHours * hourlyRate * 1.5 * 10000) / 10000

            const grossSalary =
              Math.round(
                (baseSalary +
                  housingAllowance +
                  transportAllowance +
                  otherAllowances +
                  overtimePay) *
                  10000,
              ) / 10000
            const incomeTax = Math.round(grossSalary * incomeTaxPct * 10000) / 10000
            const socialSecurity = Math.round(baseSalary * ssPct * 10000) / 10000

            // Apply any pending salary deduction requests for this employee
            const deductionResult = await client.query<{ id: string; amount: string }>(
              `SELECT id, amount FROM salary_deduction_requests
             WHERE employee_id=$1 AND company_id=$2 AND status='pending'`,
              [emp.id, companyId],
            )
            const otherDeductions = deductionResult.rows.reduce(
              (sum, d) => sum + parseFloat(d.amount),
              0,
            )

            const netSalary =
              Math.round((grossSalary - incomeTax - socialSecurity - otherDeductions) * 10000) /
              10000

            totalGross += grossSalary
            totalNet += netSalary
            totalDeductions += incomeTax + socialSecurity + otherDeductions

            const payslipResult = await client.query(
              `INSERT INTO payslips (payroll_run_id, employee_id, company_id, base_salary, housing_allowance,
             transport_allowance, other_allowances, overtime_hours, overtime_pay, gross_salary,
             income_tax, social_security, other_deductions, net_salary, currency_code, leave_days)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (payroll_run_id, employee_id) DO UPDATE SET
             gross_salary = EXCLUDED.gross_salary, net_salary = EXCLUDED.net_salary,
             overtime_hours = EXCLUDED.overtime_hours, overtime_pay = EXCLUDED.overtime_pay,
             income_tax = EXCLUDED.income_tax, social_security = EXCLUDED.social_security,
             other_deductions = EXCLUDED.other_deductions,
             leave_days = EXCLUDED.leave_days, updated_at = NOW()
             RETURNING id`,
              [
                run.id,
                emp.id,
                companyId,
                baseSalary,
                housingAllowance,
                transportAllowance,
                otherAllowances,
                overtimeHours,
                overtimePay,
                grossSalary,
                incomeTax,
                socialSecurity,
                Math.round(otherDeductions * 10000) / 10000,
                netSalary,
                emp.currency_code,
                leaveDays,
              ],
            )
            const payslipId = (payslipResult.rows[0] as { id: string }).id

            // Mark deduction requests as applied
            if (deductionResult.rows.length > 0) {
              const deductionIds = deductionResult.rows.map((d) => d.id)
              await client.query(
                `UPDATE salary_deduction_requests
               SET status='applied', applied_payroll_run_id=$1, applied_at=now(), updated_at=now()
               WHERE id = ANY($2::uuid[])`,
                [run.id, deductionIds],
              )
              void payslipId
            }
          }

          await client.query(
            `UPDATE payroll_runs SET status = 'approved', total_gross = $1, total_net = $2,
           total_deductions = $3, updated_at = NOW() WHERE id = $4`,
            [
              Math.round(totalGross * 10000) / 10000,
              Math.round(totalNet * 10000) / 10000,
              Math.round(totalDeductions * 10000) / 10000,
              run.id,
            ],
          )

          await logAudit({
            companyId,
            userId: req.auth!.userId,
            action: 'UPDATE',
            tableName: 'payroll_runs',
            recordId: run.id,
            newValues: { status: 'approved' },
            client,
          })

          await client.query(
            `INSERT INTO service_outbox (service, event_type, payload)
           VALUES ('finance', 'PAYROLL_JOURNAL_REQUESTED', $1)`,
            [
              JSON.stringify({
                payroll_run_id: run.id,
                company_id: companyId,
                period_name: run.period_name,
                total_gross: Math.round(totalGross * 10000) / 10000,
                total_net: Math.round(totalNet * 10000) / 10000,
                total_deductions: Math.round(totalDeductions * 10000) / 10000,
                end_date: run.end_date,
              }),
            ],
          )

          const updated = await client.query(`SELECT * FROM payroll_runs WHERE id = $1`, [run.id])
          return updated.rows[0]!
        },
      )

      sendOk(res, processedRun)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to process payroll run', err)
    }
  },
)

// POST /:id/cancel
payrollRouter.post(
  '/:id/cancel',
  requirePermission('payroll.runs.approve', 'approve'),
  async (req, res) => {
    try {
      const result = await query(
        `UPDATE payroll_runs SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status NOT IN ('posted','cancelled') RETURNING *`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Payroll run not found or cannot be cancelled')
        return
      }
      sendOk(res, result.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel payroll run', err)
    }
  },
)
