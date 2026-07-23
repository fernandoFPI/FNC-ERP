import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { notificationsRouter } from './routes/notifications.js'
import { pushRouter } from './routes/push.js'

export function createApp(): import('express').Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'notifications', timestamp: new Date().toISOString() })
  })

  app.use(requireAuth())

  app.use('/notifications', notificationsRouter)
  app.use('/notifications/push', pushRouter)

  return app
}
