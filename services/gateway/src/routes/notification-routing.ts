import { Router, type IRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '@fnc-erp/auth'
import { listNotificationRouting, setNotificationRouting, NOTIFICATION_ROUTES } from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'
import type { Request, Response } from 'express'

const log = logger.child({ module: 'notification-routing' })

export const notificationRoutingRouter: IRouter = Router()

const requireAdmin = [requireAuth(), requireRole('system_admin')]

const updateSchema = z.object({
  updates: z.array(
    z.object({
      key: z.string(),
      email_enabled: z.boolean(),
    }),
  ),
})

// GET /api/v1/admin/notification-routing
// Returns all known routes merged with any DB overrides
notificationRoutingRouter.get('/', ...requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await listNotificationRouting()
    const rowMap = new Map(rows.map((r) => [r.key, r]))

    const routes = NOTIFICATION_ROUTES.map((nr) => {
      const row = rowMap.get(nr.key)
      return {
        key: nr.key,
        label: nr.label,
        description: nr.description,
        email_enabled: row?.email_enabled ?? true,
        configured: !!row,
        updated_at: row?.updated_at ?? null,
      }
    })

    res.json({ routes })
  } catch (err) {
    log.error({ err }, 'notification-routing GET failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

// PUT /api/v1/admin/notification-routing
// Bulk update: [{ key, email_enabled }]
notificationRoutingRouter.put('/', ...requireAdmin, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues })
    return
  }

  const validKeys = new Set<string>(NOTIFICATION_ROUTES.map((r) => r.key))
  const userId = req.auth!.userId

  try {
    for (const { key, email_enabled } of parsed.data.updates) {
      if (!validKeys.has(key)) continue
      const nr = NOTIFICATION_ROUTES.find((r) => r.key === key)
      await setNotificationRouting(key, email_enabled, nr?.description ?? null, userId)
    }
    log.info({ userId, count: parsed.data.updates.length }, 'notification routing updated')
    res.json({ ok: true })
  } catch (err) {
    log.error({ err }, 'notification-routing PUT failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})
