import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { buildHealthStatus } from '@fnc-erp/db'
import { transactionsRouter } from './routes/transactions.js'
import { stockTransfersRouter } from './routes/stock-transfers.js'
import { intercoAttachmentsRouter } from './routes/attachments.js'

export function createApp(): import('express').Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', async (_req, res) => {
    const health = await buildHealthStatus('interco')
    res.status(health.status === 'down' ? 503 : 200).json(health)
  })

  app.use(requireAuth())

  app.use('/interco/transactions', transactionsRouter)
  app.use('/interco', stockTransfersRouter)
  app.use('/interco/transactions', intercoAttachmentsRouter)

  return app
}
