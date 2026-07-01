import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'

export const pushRouter: IRouter = Router()

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  user_agent: z.string().optional(),
})

// POST /push/subscribe
pushRouter.post('/subscribe', async (req, res) => {
  const userId = req.auth!.userId
  const parsed = SubscribeSchema.safeParse(req.body)
  if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())

  const { endpoint, p256dh, auth, user_agent } = parsed.data
  try {
    const result = await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = $3, auth = $4, updated_at = NOW()
       RETURNING *`,
      [userId, endpoint, p256dh, auth, user_agent ?? null],
    )
    sendOk(res, result.rows[0]!, 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to save subscription', err) }
})

// DELETE /push/subscribe
pushRouter.delete('/subscribe', async (req, res) => {
  const userId = req.auth!.userId
  const { endpoint } = req.body as { endpoint?: string }
  if (!endpoint) return sendError(res, 400, 'MISSING_ENDPOINT', 'endpoint is required')
  try {
    await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint])
    sendOk(res, { deleted: true })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to remove subscription', err) }
})
