import cron from 'node-cron'
import { checkConnection, pool } from '@fnc-erp/db'
import { createServiceLogger } from '@fnc-erp/logger'
import { processOutbox } from './jobs/outbox-processor.js'
import { sendPayrollReminders } from './jobs/payroll-reminder.js'
import { sendLowStockAlerts } from './jobs/low-stock-alert.js'
import { processRentalBilling } from './jobs/rental-billing.js'
import { cleanupPendingFiles, reviewUnattachedFiles } from './jobs/file-cleanup.js'
import { sendContractExpiryAlerts } from './jobs/contract-expiry-alerts.js'
// Side-effect imports: register cron jobs on module load
import './jobs/fx-sync.js'
import './jobs/maintenance-alerts.js'

const log = createServiceLogger('worker')

async function start() {
  try {
    await checkConnection()
    log.info('Database connection verified')
  } catch (err) {
    log.error({ err }, 'Failed to connect to database')
    process.exit(1)
  }

  // Outbox processor: every 5 seconds
  const outboxTimer = setInterval(() => {
    void processOutbox().catch((err) => {
      log.error({ err }, 'Unhandled outbox error')
    })
  }, 5_000)
  log.info('Outbox processor started — polling every 5 seconds')

  // Payroll reminder: 09:00 on the 25th of every month
  cron.schedule('0 9 25 * *', () => {
    void sendPayrollReminders().catch((err) => {
      log.error({ err }, 'Payroll reminder job failed')
    })
  })
  log.info({ cron: '0 9 25 * *' }, 'Payroll reminder cron registered')

  // Low-stock alerts: every day at 06:00
  cron.schedule('0 6 * * *', () => {
    void sendLowStockAlerts().catch((err) => {
      log.error({ err }, 'Low-stock alert job failed')
    })
  })
  log.info({ cron: '0 6 * * *' }, 'Low-stock alert cron registered')

  // Rental billing: every day at 01:00
  cron.schedule('0 1 * * *', () => {
    void processRentalBilling().catch((err) => {
      log.error({ err }, 'Rental billing job failed')
    })
  })
  log.info({ cron: '0 1 * * *' }, 'Rental billing cron registered')

  // Contract expiry alerts: every day at 08:00
  cron.schedule('0 8 * * *', () => {
    void sendContractExpiryAlerts().catch((err) => {
      log.error({ err }, 'Contract expiry alert job failed')
    })
  })
  log.info({ cron: '0 8 * * *' }, 'Contract expiry alert cron registered')

  // File cleanup: pending files every hour, unattached review daily at 03:00
  cron.schedule('0 * * * *', () => {
    void cleanupPendingFiles().catch((err) => { log.error({ err }, 'File cleanup job failed') })
  })
  log.info({ cron: '0 * * * *' }, 'File cleanup (pending) cron registered')

  cron.schedule('0 3 * * *', () => {
    void reviewUnattachedFiles().catch((err) => { log.error({ err }, 'Unattached file review job failed') })
  })
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
