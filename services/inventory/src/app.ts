import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { buildHealthStatus } from '@fnc-erp/db'
import { productsRouter } from './routes/products.js'
import { locationsRouter } from './routes/locations.js'
import { lotsRouter } from './routes/lots.js'
import { movesRouter } from './routes/moves.js'
import { balancesRouter } from './routes/balances.js'

export function createApp(): import('express').Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', async (_req, res) => {
    const health = await buildHealthStatus('inventory')
    res.status(health.status === 'down' ? 503 : 200).json(health)
  })

  app.use(requireAuth())

  app.use('/inventory/products', productsRouter)
  app.use('/inventory/locations', locationsRouter)
  app.use('/inventory/lots', lotsRouter)
  app.use('/inventory/moves', movesRouter)
  app.use('/inventory/balances', balancesRouter)

  return app
}
