import { Router } from 'express'
import type { IRouter, Request, Response } from 'express'
import { timingSafeEqual } from 'crypto'
import { env } from '@fnc-erp/config'
import { publishSessionsChanged, publishOutboxUpdated, publishEntityChanged } from '../graphql/pubsub.js'

// Lets other services (auth, worker) push a live-update signal into the
// gateway's in-process PubSub without the gateway having to poll them.
// Not user-facing — authenticated with the shared SERVICE_TOKEN, not a JWT,
// so it's mounted before the gateway's blanket JWT-validation middleware
// (see services/gateway/src/app.ts, same spot /health is mounted).
export const internalEventsRouter: IRouter = Router()

function isValidServiceToken(candidate: string | undefined): boolean {
  if (!candidate) return false
  const expected = Buffer.from(env.SERVICE_TOKEN)
  const actual = Buffer.from(candidate)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

internalEventsRouter.post('/sessions-changed', (req: Request, res: Response) => {
  if (!isValidServiceToken(req.headers['x-service-token'] as string | undefined)) {
    res.status(401).json({ error: 'UNAUTHORIZED' })
    return
  }
  const { userId } = req.body as { userId?: string }
  if (!userId) {
    res.status(400).json({ error: 'MISSING_USER_ID' })
    return
  }
  publishSessionsChanged(userId).catch(() => {
    /* best-effort — a missed live-update signal isn't worth failing the caller's request over */
  })
  res.json({ ok: true })
})

internalEventsRouter.post('/outbox-updated', (req: Request, res: Response) => {
  if (!isValidServiceToken(req.headers['x-service-token'] as string | undefined)) {
    res.status(401).json({ error: 'UNAUTHORIZED' })
    return
  }
  publishOutboxUpdated().catch(() => {
    /* best-effort */
  })
  res.json({ ok: true })
})

internalEventsRouter.post('/entity-changed', (req: Request, res: Response) => {
  if (!isValidServiceToken(req.headers['x-service-token'] as string | undefined)) {
    res.status(401).json({ error: 'UNAUTHORIZED' })
    return
  }
  const { companyId, entityType, entityId, action } = req.body as {
    companyId?: string
    entityType?: string
    entityId?: string
    action?: string
  }
  if (!companyId || !entityType || !entityId || !action) {
    res.status(400).json({ error: 'MISSING_FIELDS' })
    return
  }
  publishEntityChanged(companyId, entityType, entityId, action as 'created' | 'updated' | 'deleted').catch(
    () => {
      /* best-effort */
    },
  )
  res.json({ ok: true })
})
