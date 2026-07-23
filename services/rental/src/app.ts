import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { assetsRouter } from './routes/assets.js'
import { contractsRouter } from './routes/contracts.js'
import { rentalContractAttachmentsRouter } from './routes/attachments.js'
import { usageLogsRouter } from './routes/usage-logs.js'
import { maintenanceRouter, getUpcomingMaintenance } from './routes/maintenance.js'
import { locationRouter, getFleetLocations } from './routes/location-tracking.js'
import { conditionReportsRouter, getOpenConditionReports } from './routes/condition-reports.js'

export function createApp(): express.Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', (_req, res) => { res.json({ status: 'ok', service: 'rental' }) })

  app.use(requireAuth())

  // ── Existing routes ────────────────────────────────────────
  app.use('/rental/assets', assetsRouter)
  app.use('/rental/contracts', contractsRouter)
  app.use('/rental', contractsRouter)
  app.use('/rental/contracts', rentalContractAttachmentsRouter)

  // ── Static fleet/dashboard routes BEFORE parameterised :id routes ──
  app.get('/rental/maintenance/upcoming', getUpcomingMaintenance)
  app.get('/rental/assets/locations', getFleetLocations)
  app.get('/rental/condition-reports/open', getOpenConditionReports)

  // ── Parameterised per-asset routes ────────────────────────
  app.use('/rental/assets/:id/usage', usageLogsRouter)
  app.use('/rental/assets/:id/maintenance', maintenanceRouter)
  app.use('/rental/assets/:id/location', locationRouter)
  app.use('/rental/assets/:id/condition-reports', conditionReportsRouter)

  return app
}
