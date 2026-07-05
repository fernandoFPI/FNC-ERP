import { Router, type IRouter, type Request, type Response } from 'express'
import crypto from 'crypto'
import { createClient } from 'redis'
import { z } from 'zod'
import { query, withSystemTransaction } from '@fnc-erp/db'
import { hashPassword, validatePasswordStrength, requireAuth } from '@fnc-erp/auth'
import { env, HTTP_STATUS } from '@fnc-erp/config'
import { logAudit } from '@fnc-erp/audit'
import { createServiceLogger } from '@fnc-erp/logger'
import { sendError } from '../lib/errors.js'

const logger = createServiceLogger('auth')

export const passwordResetRouter: IRouter = Router()

const RESET_TOKEN_TTL_SECONDS = 900 // 15 minutes
const RESET_TOKEN_PREFIX = 'pwd_reset:'
const THROTTLE_TTL_SECONDS = 120 // 2 minutes

// Lazy singleton Redis client
let redis: ReturnType<typeof createClient> | null = null

function getRedis() {
  if (!redis) {
    redis = createClient({ url: env.REDIS_URL })
    redis.on('error', (err: unknown) => {
      logger.error({ err }, 'Redis client error in password-reset')
    })
    void redis.connect()
  }
  return redis
}

const forgotSchema = z.object({ email: z.string().email() })
const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

const GENERIC_RESPONSE = {
  success: true,
  data: { message: 'If an account with that email exists, a reset link has been sent.' },
} as const

// ── POST /auth/forgot-password ─────────────────────────────────
passwordResetRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const parsed = forgotSchema.safeParse(req.body)
  if (!parsed.success) {
    res.json(GENERIC_RESPONSE)
    return
  }
  const { email } = parsed.data
  const r = getRedis()

  try {
    const userResult = await query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = $1 AND is_active = true`,
      [email.toLowerCase()],
    )

    if (!userResult.rows[0]) {
      res.json(GENERIC_RESPONSE)
      return
    }

    const userId = userResult.rows[0].id
    const userEmail = userResult.rows[0].email

    // Throttle: prevent a second request within 2 minutes
    const throttleKey = `pwd_reset_throttle:${userId}`
    const throttled = await r.get(throttleKey)
    if (throttled) {
      res.json(GENERIC_RESPONSE)
      return
    }

    const token = crypto.randomBytes(32).toString('hex')
    await r.setEx(
      `${RESET_TOKEN_PREFIX}${token}`,
      RESET_TOKEN_TTL_SECONDS,
      JSON.stringify({ userId, email: userEmail, createdAt: new Date().toISOString() }),
    )
    await r.setEx(throttleKey, THROTTLE_TTL_SECONDS, '1')

    await query(
      `INSERT INTO service_outbox (service, event_type, payload)
       VALUES ('notifications','PASSWORD_RESET_EMAIL',$1)`,
      [
        JSON.stringify({
          userId,
          email: userEmail,
          resetToken: token,
          resetUrl: `${env.FRONTEND_URL}/reset-password?token=${token}`,
          expiresInMinutes: 15,
          ipAddress: req.ip,
        }),
      ],
    )

    await query(
      `INSERT INTO password_reset_audit (user_id, email, ip_address, user_agent, action)
       VALUES ($1,$2,$3,$4,'requested')`,
      [userId, email, req.ip ?? null, req.headers['user-agent'] ?? null],
    )

    res.json(GENERIC_RESPONSE)
  } catch (err) {
    logger.error({ err }, 'forgot-password error')
    res.json(GENERIC_RESPONSE) // never leak errors on this endpoint
  }
})

// ── GET /auth/reset-password/validate ─────────────────────────
passwordResetRouter.get('/reset-password/validate', async (req: Request, res: Response) => {
  const token = req.query['token'] as string | undefined
  if (!token) {
    sendError(res, HTTP_STATUS.BAD_REQUEST, 'MISSING_TOKEN', 'Token is required')
    return
  }

  const r = getRedis()
  const [tokenData, ttl] = await Promise.all([
    r.get(`${RESET_TOKEN_PREFIX}${token}`),
    r.ttl(`${RESET_TOKEN_PREFIX}${token}`),
  ])

  res.json({
    success: true,
    data: { valid: !!tokenData, expiresInSeconds: ttl > 0 ? ttl : 0 },
  })
})

// ── POST /auth/reset-password ──────────────────────────────────
passwordResetRouter.post('/reset-password', async (req: Request, res: Response) => {
  const parsed = resetSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid input')
    return
  }
  const { token, newPassword } = parsed.data

  const strength = validatePasswordStrength(newPassword)
  if (!strength.valid) {
    sendError(res, HTTP_STATUS.BAD_REQUEST, 'WEAK_PASSWORD', strength.reason ?? 'Password is too weak')
    return
  }

  const r = getRedis()
  const tokenKey = `${RESET_TOKEN_PREFIX}${token}`
  const tokenData = await r.get(tokenKey)

  if (!tokenData) {
    await query(
      `INSERT INTO password_reset_audit (email, ip_address, user_agent, action)
       VALUES ('unknown',$1,$2,'invalid_token')`,
      [req.ip ?? null, req.headers['user-agent'] ?? null],
    )
    sendError(
      res,
      HTTP_STATUS.BAD_REQUEST,
      'INVALID_RESET_TOKEN',
      'This reset link is invalid or has expired. Please request a new one.',
    )
    return
  }

  const { userId, email } = JSON.parse(tokenData) as { userId: string; email: string }

  try {
    await withSystemTransaction(async (client) => {
      const passwordHash = await hashPassword(newPassword)

      await client.query(
        `UPDATE users
         SET password_hash=$1, failed_login_attempts=0, locked_until=NULL, updated_at=NOW()
         WHERE id=$2`,
        [passwordHash, userId],
      )

      // Invalidate ALL existing sessions
      await client.query(`DELETE FROM sessions WHERE user_id=$1`, [userId])

      // One-time use: delete token from Redis
      await r.del(tokenKey)

      await client.query(
        `INSERT INTO password_reset_audit (user_id, email, ip_address, user_agent, action)
         VALUES ($1,$2,$3,$4,'completed')`,
        [userId, email, req.ip ?? null, req.headers['user-agent'] ?? null],
      )

      await client.query(
        `INSERT INTO service_outbox (service, event_type, payload)
         VALUES ('notifications','PASSWORD_CHANGED_EMAIL',$1)`,
        [
          JSON.stringify({
            userId,
            email,
            changedAt: new Date().toISOString(),
            ipAddress: req.ip,
          }),
        ],
      )

      await logAudit({
        userId,
        companyId: 'system',
        action: 'UPDATE',
        tableName: 'users',
        recordId: userId,
        newValues: { action: 'PASSWORD_RESET_COMPLETED' },
        client,
      })
    })

    res.json({
      success: true,
      data: { message: 'Password updated successfully. Please log in with your new password.' },
    })
  } catch (err) {
    logger.error({ err }, 'reset-password error')
    sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'Password reset failed')
  }
})

// ── GET /auth/sessions ─────────────────────────────────────────
passwordResetRouter.get('/sessions', requireAuth(), async (req: Request, res: Response) => {
  const auth = req.auth
  if (!auth) { sendError(res, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED', 'Not authenticated'); return }

  try {
    const result = await query<{
      id: string; device_name: string | null; platform: string; ip_address: string | null
      created_at: Date; expires_at: Date
    }>(
      `SELECT id, device_name, platform, ip_address, created_at, expires_at
       FROM sessions
       WHERE user_id=$1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [auth.userId],
    )

    res.json({
      success: true,
      data: result.rows.map((s) => ({
        ...s,
        is_current: s.id === auth.sessionId,
      })),
    })
  } catch (err) {
    logger.error({ err }, 'GET /sessions error')
    sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'Failed to fetch sessions')
  }
})

// ── DELETE /auth/sessions/:sessionId ──────────────────────────
passwordResetRouter.delete('/sessions/:sessionId', requireAuth(), async (req: Request, res: Response) => {
  const auth = req.auth
  if (!auth) { sendError(res, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED', 'Not authenticated'); return }

  const sessionId = req.params['sessionId']!

  if (sessionId === auth.sessionId) {
    sendError(res, HTTP_STATUS.BAD_REQUEST, 'CANNOT_REVOKE_CURRENT', 'Use /auth/logout to end your current session')
    return
  }

  try {
    const result = await query(
      `DELETE FROM sessions WHERE id=$1 AND user_id=$2 RETURNING id`,
      [sessionId, auth.userId],
    )
    if (!result.rows[0]) {
      sendError(res, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', 'Session not found')
      return
    }

    await logAudit({
      userId: auth.userId,
      companyId: auth.companyId,
      action: 'DELETE',
      tableName: 'sessions',
      recordId: sessionId,
      newValues: { action: 'SESSION_REVOKED' },
    })

    res.json({ success: true, data: { sessionId, revoked: true } })
  } catch (err) {
    logger.error({ err }, 'DELETE /sessions error')
    sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'Failed to revoke session')
  }
})
