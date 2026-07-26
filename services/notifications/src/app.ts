import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { buildHealthStatus } from '@fnc-erp/db'
import { notificationsRouter } from './routes/notifications.js'
import { pushRouter } from './routes/push.js'

export function createApp(): import('express').Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', async (_req, res) => {
    const health = await buildHealthStatus('notifications')
    res.status(health.status === 'down' ? 503 : 200).json(health)
  })

  app.use(requireAuth())

  app.use('/notifications', notificationsRouter)
  app.use('/notifications/push', pushRouter)

  return app
}
