import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { buildHealthStatus } from '@fnc-erp/db'
import { workCentersRouter } from './routes/work-centers.js'
import { bomsRouter } from './routes/boms.js'
import { ordersRouter } from './routes/orders.js'
import { moAttachmentsRouter } from './routes/attachments.js'

export function createApp(): express.Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', async (_req, res) => {
    const health = await buildHealthStatus('manufacturing')
    res.status(health.status === 'down' ? 503 : 200).json(health)
  })

  app.use(requireAuth())

  app.use('/manufacturing/work-centers', workCentersRouter)
  app.use('/manufacturing/boms', bomsRouter)
  app.use('/manufacturing/orders', ordersRouter)
  app.use('/manufacturing/orders', moAttachmentsRouter)

  return app
}
