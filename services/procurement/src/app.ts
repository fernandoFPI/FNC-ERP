import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
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

  app.get('/health', (_req, res) => { res.json({ status: 'ok', service: 'procurement' }) })

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
