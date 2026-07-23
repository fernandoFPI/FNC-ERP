import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { entityRouter } from './routes/entity.js'
import { consolidatedRouter } from './routes/consolidated.js'
import { projectsReportRouter } from './routes/projects.js'
import { hrReportRouter } from './routes/hr.js'
import { complianceRouter } from './routes/compliance.js'
import { exportsRouter } from './routes/exports.js'

export function createApp(): express.Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', (_req, res) => { res.json({ status: 'ok', service: 'reporting' }) })

  app.use(requireAuth())

  app.use('/reporting', entityRouter)
  app.use('/reporting/consolidated', consolidatedRouter)
  app.use('/reporting/projects', projectsReportRouter)
  app.use('/reporting', hrReportRouter)
  app.use('/reporting/compliance', complianceRouter)
  app.use('/reporting/exports', exportsRouter)

  return app
}
