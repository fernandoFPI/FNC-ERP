import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { productsRouter } from './routes/products.js'
import { locationsRouter } from './routes/locations.js'
import { lotsRouter } from './routes/lots.js'
import { movesRouter } from './routes/moves.js'
import { balancesRouter } from './routes/balances.js'

export function createApp(): import('express').Express {
  const app = express()
  app.disable('etag')
  app.use(express.json())

  app.get('/health', (_req, res) => { res.json({ status: 'ok', service: 'inventory' }) })

  app.use(requireAuth())

  app.use('/inventory/products', productsRouter)
  app.use('/inventory/locations', locationsRouter)
  app.use('/inventory/lots', lotsRouter)
  app.use('/inventory/moves', movesRouter)
  app.use('/inventory/balances', balancesRouter)

  return app
}
