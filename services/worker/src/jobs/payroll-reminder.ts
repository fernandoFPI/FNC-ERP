import { pool } from '@fnc-erp/db'
import { env } from '@fnc-erp/config'

interface CompanyRow {
  id: string
  name: string
}

interface AdminRow {
  user_id: string
}

/**
 * Fired on the 25th of each month. Creates an in-app notification for every
 * company admin reminding them to run payroll before month-end.
 */
export async function sendPayrollReminders(): Promise<void> {
  console.warn('[worker] Running payroll reminder job')

  const now = new Date()
  const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  // Fetch all active companies
  const companiesResult = await pool.query<CompanyRow>(`SELECT id, name FROM companies WHERE is_active = TRUE`)
  const companies = companiesResult.rows

  for (const company of companies) {
    // Check if there's already a payroll run for this month
    const periodName = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const existing = await pool.query(
      `SELECT id FROM payroll_runs WHERE company_id = $1 AND period_name = $2`,
      [company.id, periodName],
    )
    if ((existing.rowCount ?? 0) > 0) {
      console.warn(`[worker] Payroll already created for ${company.name} (${periodName}), skipping reminder`)
      continue
    }

    // Find company admins to notify
    const admins = await pool.query<AdminRow>(
      `SELECT DISTINCT user_id FROM user_company_roles WHERE company_id = $1 AND role IN ('company_admin','system_admin') AND is_active = TRUE`,
      [company.id],
    )

    for (const admin of admins.rows) {
      await pool.query(
        `INSERT INTO notifications (company_id, user_id, type, title, body)
         VALUES ($1,$2,'PAYROLL_REMINDER','Payroll Reminder',$3)`,
        [company.id, admin.user_id, `Reminder: ${monthName} payroll has not been processed for ${company.name}. Please process before month-end.`],
      )
    }

    console.warn(`[worker] Payroll reminder sent to ${admins.rowCount ?? 0} admins for ${company.name}`)
  }
}
