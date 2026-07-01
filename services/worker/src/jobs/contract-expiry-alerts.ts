import { pool } from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'

const log = logger.child({ job: 'contract-expiry-alerts' })

interface ExpiringContract {
  id: string
  company_id: string
  contract_number: string
  client_name: string | null
  end_date: string
  days_remaining: number
}

interface AdminRow {
  user_id: string
}

/**
 * Runs daily at 08:00.
 * Finds active rental contracts expiring within 30 days and notifies
 * finance/rental admins. Fires a second, more urgent alert at 7 days.
 */
export async function sendContractExpiryAlerts(): Promise<void> {
  log.info('running contract expiry alert check')

  const result = await pool.query<ExpiringContract>(`
    SELECT
      rc.id,
      rc.company_id,
      rc.contract_number,
      rc.client_name,
      rc.end_date::text AS end_date,
      (rc.end_date - NOW()::DATE)::int AS days_remaining
    FROM rental_contracts rc
    WHERE rc.status = 'active'
      AND rc.end_date IS NOT NULL
      AND (rc.end_date - NOW()::DATE) BETWEEN 0 AND 30
  `)

  if (result.rowCount === 0) {
    log.info('no contracts expiring within 30 days')
    return
  }

  for (const contract of result.rows) {
    const daysLeft = contract.days_remaining
    const isUrgent = daysLeft <= 7

    // Only send the 30-day alert on the exact day it crosses 30, and daily from 7 days onward
    const shouldNotify = daysLeft <= 7 || daysLeft === 30 || daysLeft === 14

    if (!shouldNotify) continue

    const admins = await pool.query<AdminRow>(
      `SELECT DISTINCT u.id AS user_id
       FROM users u
       JOIN user_company_roles ucr ON ucr.user_id = u.id
       WHERE ucr.company_id = $1
         AND (ucr.role IN ('company_admin', 'system_admin')
              OR (ucr.module = 'rental' AND ucr.role IN ('module_admin', 'module_user'))
              OR (ucr.module = 'finance' AND ucr.role IN ('module_admin', 'module_user')))
         AND u.is_active = true`,
      [contract.company_id],
    )

    const clientLabel = contract.client_name ? ` — ${contract.client_name}` : ''
    const urgencyLabel = daysLeft === 0 ? 'expires today' : `expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
    const title = isUrgent
      ? `Urgent: Contract ${contract.contract_number} ${urgencyLabel}`
      : `Contract expiring soon: ${contract.contract_number}`
    const body = `Rental contract ${contract.contract_number}${clientLabel} ${urgencyLabel} (${contract.end_date}). Please review and take action.`

    for (const admin of admins.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, company_id, type, title, body, data, push_sent)
         VALUES ($1,$2,'CONTRACT_EXPIRY_ALERT',$3,$4,$5::jsonb,false)`,
        [
          admin.user_id, contract.company_id, title, body,
          JSON.stringify({
            contractId: contract.id,
            contractNumber: contract.contract_number,
            endDate: contract.end_date,
            daysRemaining: daysLeft,
          }),
        ],
      ).catch((err: unknown) =>
        log.error({ err, contractId: contract.id, userId: admin.user_id }, 'failed to insert contract expiry notification'),
      )
    }

    log.info({ contractId: contract.id, contractNumber: contract.contract_number, daysRemaining: daysLeft }, 'contract expiry alert sent')
  }

  log.info({ checked: result.rowCount }, 'contract expiry alert check complete')
}
