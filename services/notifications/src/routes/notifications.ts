import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { pushToUser } from '../lib/ws-manager.js'

export const notificationsRouter: IRouter = Router()

const CreateNotificationSchema = z.object({
  user_id: z.string().uuid(),
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
})

// GET /notifications — list for authenticated user (unread first)
notificationsRouter.get('/', async (req, res) => {
  try {
    const userId = req.auth!.userId
    const companyId = req.auth!.companyId
    const { unread_only, page = '1', limit = '50' } = req.query
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string)

    let sql = `SELECT * FROM notifications WHERE user_id = $1 AND company_id = $2`
    const params: unknown[] = [userId, companyId]
    let idx = 3
    if (unread_only === 'true') {
      sql += ` AND is_read = FALSE`
    }
    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(parseInt(limit as string), offset)

    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch notifications', err)
  }
})

// POST /notifications — create and push in real time (internal/service use)
notificationsRouter.post('/', async (req, res) => {
  const companyId = req.auth!.companyId
  const parsed = CreateNotificationSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }

  const { user_id, type, title, body, data } = parsed.data
  try {
    const result = await query(
      `INSERT INTO notifications (company_id, user_id, type, title, body, data)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companyId, user_id, type, title, body, data ? JSON.stringify(data) : null],
    )
    const row = result.rows[0]!
    pushToUser(user_id, { event: 'notification', data: row })
    sendOk(res, row, 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create notification', err)
  }
})

// PATCH /notifications/:id/read — mark single notification as read
notificationsRouter.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.auth!.userId
    const result = await query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, userId],
    )
    const row = result.rows[0]
    if (!row) {
      sendError(res, 404, 'NOT_FOUND', 'Notification not found')
      return
    }
    sendOk(res, row)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark as read', err)
  }
})

// POST /notifications/read-all — mark all unread for user as read
notificationsRouter.post('/read-all', async (req, res) => {
  try {
    const userId = req.auth!.userId
    const companyId = req.auth!.companyId
    const result = await query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW()
       WHERE user_id = $1 AND company_id = $2 AND is_read = FALSE`,
      [userId, companyId],
    )
    sendOk(res, { updated: result.rowCount ?? 0 })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark all as read', err)
  }
})

// GET /notifications/unread-count
notificationsRouter.get('/unread-count', async (req, res) => {
  try {
    const userId = req.auth!.userId
    const companyId = req.auth!.companyId
    const result = await query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND company_id = $2 AND is_read = FALSE`,
      [userId, companyId],
    )
    sendOk(res, { count: (result.rows[0] as { count: number }).count })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get unread count', err)
  }
})
