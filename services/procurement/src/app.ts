import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { buildHealthStatus } from '@fnc-erp/db'
import { vendorsRouter } from './routes/vendors.js'
import { ordersRouter } from './routes/orders.js'
import { receiptsRouter } from './routes/receipts.js'
import { poAttachmentsRouter, poReceiptAttachmentsRouter, vendorAttachmentsRouter } from './routes/attachments.js'
import { returnsRouter } from './routes/returns.js'

export function createApp(): import('express').Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', async (_req, res) => {
    const health = await buildHealthStatus('procurement')
    res.status(health.status === 'down' ? 503 : 200).json(health)
  })

  app.use(requireAuth())

  app.use('/procurement/vendors', vendorsRouter)
  app.use('/procurement/vendors', vendorAttachmentsRouter)
  app.use('/procurement/orders', ordersRouter)
  app.use('/procurement/purchase-orders', ordersRouter)
  app.use('/procurement/orders', poAttachmentsRouter)
  app.use('/procurement/purchase-orders', poAttachmentsRouter)
  app.use('/procurement/orders', receiptsRouter)
  app.use('/procurement/purchase-orders', receiptsRouter)
  app.use('/procurement/receipts', poReceiptAttachmentsRouter)
  app.use('/procurement/purchase-orders/:poId/returns', returnsRouter)
  app.use('/procurement/orders/:poId/returns', returnsRouter)

  return app
}
