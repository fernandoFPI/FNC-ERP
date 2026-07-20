import cron from 'node-cron'
import { checkConnection, pool, startJobRun, finishJobRun, failJobRun, recordCompletedJobRun } from '@fnc-erp/db'
import { createServiceLogger } from '@fnc-erp/logger'
import { processOutbox } from './jobs/outbox-processor.js'
import { sendPayrollReminders } from './jobs/payroll-reminder.js'
import { sendLowStockAlerts } from './jobs/low-stock-alert.js'
import { processRentalBilling } from './jobs/rental-billing.js'
import { cleanupPendingFiles, reviewUnattachedFiles } from './jobs/file-cleanup.js'
import { sendContractExpiryAlerts } from './jobs/contract-expiry-alerts.js'
import { runMonthlyDepreciation } from './jobs/asset-depreciation.js'
// Side-effect imports: register cron jobs on module load (instrumented internally)
import './jobs/fx-sync.js'
import './jobs/maintenance-alerts.js'
import './jobs/eng-doc-reminders.js'

const log = createServiceLogger('worker')

function wrapCron(jobName: string, fn: () => Promise<void>): () => void {
  return () => {
    void (async () => {
      const runId = await startJobRun(jobName)
      try {
        await fn()
        await finishJobRun(runId)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        await failJobRun(runId, msg).catch(() => {/* ignore secondary failure */})
        log.error({ err, jobName }, `${jobName} job failed`)
      }
    })()
  }
}

async function start() {
  try {
    await checkConnection()
    log.info('Database connection verified')
  } catch (err) {
    log.error({ err }, 'Failed to connect to database')
    process.exit(1)
  }

  // Outbox processor: every 5 seconds — only record when it actually processes events
  const outboxTimer = setInterval(() => {
    const t0 = Date.now()
    void processOutbox()
      .then(async (processed) => {
        if (processed > 0) {
          await recordCompletedJobRun('outbox-processor', 'success', Date.now() - t0, { processed })
        }
      })
      .catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        await recordCompletedJobRun('outbox-processor', 'failed', Date.now() - t0, undefined, msg)
        log.error({ err }, 'Unhandled outbox error')
      })
  }, 5_000)
  log.info('Outbox processor started — polling every 5 seconds')

  // Payroll reminder: 09:00 on the 25th of every month
  cron.schedule('0 9 25 * *', wrapCron('payroll-reminder', sendPayrollReminders))
  log.info({ cron: '0 9 25 * *' }, 'Payroll reminder cron registered')

  // Low-stock alerts: every day at 06:00
  cron.schedule('0 6 * * *', wrapCron('low-stock-alert', sendLowStockAlerts))
  log.info({ cron: '0 6 * * *' }, 'Low-stock alert cron registered')

  // Rental billing: every day at 01:00
  cron.schedule('0 1 * * *', wrapCron('rental-billing', processRentalBilling))
  log.info({ cron: '0 1 * * *' }, 'Rental billing cron registered')

  // Contract expiry alerts: every day at 08:00
  cron.schedule('0 8 * * *', wrapCron('contract-expiry-alerts', sendContractExpiryAlerts))
  log.info({ cron: '0 8 * * *' }, 'Contract expiry alert cron registered')

  // Asset depreciation: 1st of every month at 02:00
  cron.schedule('0 2 1 * *', wrapCron('asset-depreciation', runMonthlyDepreciation))
  log.info({ cron: '0 2 1 * *' }, 'Asset depreciation cron registered')

  // File cleanup: pending files every hour, unattached review daily at 03:00
  cron.schedule('0 * * * *', wrapCron('file-cleanup-pending', cleanupPendingFiles))
  log.info({ cron: '0 * * * *' }, 'File cleanup (pending) cron registered')

  cron.schedule('0 3 * * *', wrapCron('file-cleanup-unattached', reviewUnattachedFiles))
  log.info({ cron: '0 3 * * *' }, 'Unattached file review cron registered')

  const shutdown = async () => {
    log.info('Worker shutting down')
    clearInterval(outboxTimer)
    await pool.end()
    process.exit(0)
  }

  process.on('SIGTERM', () => { void shutdown() })
  process.on('SIGINT', () => { void shutdown() })
}

void start()
