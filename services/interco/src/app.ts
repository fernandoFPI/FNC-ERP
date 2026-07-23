import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { transactionsRouter } from './routes/transactions.js'
import { stockTransfersRouter } from './routes/stock-transfers.js'
import { intercoAttachmentsRouter } from './routes/attachments.js'

export function createApp(): import('express').Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', (_req, res) => { res.json({ status: 'ok', service: 'interco' }) })

  app.use(requireAuth())

  app.use('/interco/transactions', transactionsRouter)
  app.use('/interco', stockTransfersRouter)
  app.use('/interco/transactions', intercoAttachmentsRouter)

  return app
}
