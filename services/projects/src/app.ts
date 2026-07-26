import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { buildHealthStatus } from '@fnc-erp/db'
import { projectsRouter } from './routes/projects.js'
import { contractsRouter } from './routes/contracts.js'
import { milestonesRouter } from './routes/milestones.js'
import { materialIssuesRouter } from './routes/material-issues.js'
import { invoicesRouter } from './routes/invoices.js'
import { paymentsRouter } from './routes/payments.js'
import { projectAttachmentsRouter, contractAttachmentsRouter, invoiceAttachmentsRouter } from './routes/attachments.js'

export function createApp(): express.Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', async (_req, res) => {
    const health = await buildHealthStatus('projects')
    res.status(health.status === 'down' ? 503 : 200).json(health)
  })

  app.use(requireAuth())

  app.use('/projects', projectsRouter)
  app.use('/projects/contracts', contractsRouter)
  // Milestones nested under contracts
  app.use('/projects/contracts/:id/milestones', milestonesRouter)
  // Material issues: list/create under project, detail/actions at top level
  app.use('/projects/:id/material-issues', materialIssuesRouter)
  app.use('/projects', materialIssuesRouter)
  // Invoices + payments
  app.use('/projects/invoices', invoicesRouter)
  app.use('/projects/invoices/:id/payments', paymentsRouter)
  app.use('/projects', projectAttachmentsRouter)
  app.use('/projects/contracts', contractAttachmentsRouter)
  app.use('/projects/invoices', invoiceAttachmentsRouter)

  return app
}
