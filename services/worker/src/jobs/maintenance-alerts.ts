import cron from 'node-cron'
import { pool, startJobRun, finishJobRun, failJobRun } from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'

const log = logger.child({ job: 'maintenance-alerts' })

// Daily 07:00 — check all assets for upcoming or overdue maintenance
cron.schedule('0 7 * * *', () => {
  void runMaintenanceDueCheck().catch((err: unknown) => {
    log.error({ err }, 'maintenance due check job failed')
  })
})

// Daily 08:00 — mark scheduled records as overdue when past due_date
cron.schedule('0 8 * * *', () => {
  void markOverdueRecords().catch((err: unknown) => {
    log.error({ err }, 'maintenance overdue marking job failed')
  })
})

export async function runMaintenanceDueCheck(): Promise<void> {
  const runId = await startJobRun('maintenance-due-check')
  log.info('running maintenance alert check')
  try {

  const dueSoon = await pool.query<Record<string, unknown>>(`
    SELECT
      ea.id          AS asset_id,
      ea.name        AS asset_name,
      ea.asset_number,
      ea.company_id,
      ms.name        AS schedule_name,
      ms.maintenance_type,
      ms.warn_before_hours,
      ms.warn_before_days,
      eas.total_hours_operated,
      eas.next_maintenance_due_hours,
      eas.next_maintenance_due_date,
      eas.next_maintenance_due_hours - eas.total_hours_operated AS hours_remaining,
      eas.next_maintenance_due_date  - NOW()::DATE              AS days_remaining
    FROM equipment_asset_stats eas
    JOIN equipment_assets ea ON ea.id = eas.asset_id
    JOIN maintenance_schedules ms ON ms.id = eas.next_maintenance_schedule_id
    WHERE ea.is_active = true
      AND ea.status != 'maintenance'
      AND (
        (eas.next_maintenance_due_hours IS NOT NULL
         AND eas.next_maintenance_due_hours - eas.total_hours_operated
             <= ms.warn_before_hours)
        OR
        (eas.next_maintenance_due_date IS NOT NULL
         AND eas.next_maintenance_due_date - NOW()::DATE <= ms.warn_before_days)
      )
      AND NOT EXISTS (
        SELECT 1 FROM maintenance_records mr
        WHERE mr.asset_id = ea.id AND mr.status = 'scheduled'
      )
  `)

  for (const asset of dueSoon.rows) {
    const hoursRemaining = asset['hours_remaining'] != null ? Number(asset['hours_remaining']) : null
    const daysRemaining  = asset['days_remaining']  != null ? Number(asset['days_remaining'])  : null

    const isOverdue =
      (hoursRemaining !== null && hoursRemaining <= 0) ||
      (daysRemaining  !== null && daysRemaining  <= 0)

    const urgency = isOverdue ? 'overdue' : 'due_soon'

    log.warn({
      assetId: asset['asset_id'],
      assetName: asset['asset_name'],
      scheduleName: asset['schedule_name'],
      urgency,
      hoursRemaining,
      daysRemaining,
    }, `maintenance ${urgency}`)

    await pool.query(
      `UPDATE equipment_asset_stats
       SET maintenance_status = $1, updated_at = NOW()
       WHERE asset_id = $2`,
      [urgency, asset['asset_id']],
    )

    await pool.query(
      `INSERT INTO service_outbox (service, event_type, payload)
       VALUES ('notifications','MAINTENANCE_DUE_ALERT',$1::jsonb)`,
      [JSON.stringify({
        assetId:         asset['asset_id'],
        assetName:       asset['asset_name'],
        assetNumber:     asset['asset_number'],
        companyId:       asset['company_id'],
        scheduleName:    asset['schedule_name'],
        maintenanceType: asset['maintenance_type'],
        urgency,
        hoursRemaining,
        daysRemaining,
      })],
    )
  }

  log.info({ alertsSent: dueSoon.rows.length }, 'maintenance alert check complete')
  await finishJobRun(runId, { alertsSent: dueSoon.rows.length })
  } catch (err) {
    await failJobRun(runId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

export async function markOverdueRecords(): Promise<void> {
  const runId = await startJobRun('maintenance-overdue-mark')
  try {
    const result = await pool.query<{ id: string; asset_id: string }>(
      `UPDATE maintenance_records
       SET status = 'overdue', updated_at = NOW()
       WHERE status = 'scheduled'
         AND due_date < NOW()::DATE
       RETURNING id, asset_id`,
    )

    if (result.rows.length > 0) {
      log.warn({
        count: result.rows.length,
        records: result.rows.map((r) => r.id),
      }, 'maintenance records marked overdue')
    }
    await finishJobRun(runId, { markedOverdue: result.rows.length })
  } catch (err) {
    await failJobRun(runId, err instanceof Error ? err.message : String(err))
    throw err
  }
}
