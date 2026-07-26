import { Router, type IRouter, type Request, type Response } from 'express'
import { randomBytes } from 'crypto'
import { query, withSystemTransaction } from '@fnc-erp/db'
import { hashPassword, validatePasswordStrength, requireAuth, requireRole } from '@fnc-erp/auth'
import { logAudit } from '@fnc-erp/audit'
import { createServiceLogger } from '@fnc-erp/logger'
import { env } from '@fnc-erp/config'
import { sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const userManagementRouter: IRouter = Router()

const log = createServiceLogger('user-management')

function secureToken(bytes = 48): string {
  return randomBytes(bytes).toString('hex')
}

// ── GET /auth/users ────────────────────────────────────────────────────────────
// List all users with their role assignments.

userManagementRouter.get(
  '/',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        search,
        is_active,
        company_id,
        page = '1',
        limit = '50',
      } = req.query as Record<string, string>
      const offset = (parseInt(page) - 1) * parseInt(limit)
      const conditions: string[] = []
      const countValues: unknown[] = []
      const listValues: unknown[] = []
      let p = 0

      if (search) {
        conditions.push(`u.email ILIKE $${++p}`)
        countValues.push(`%${search}%`)
        listValues.push(`%${search}%`)
      }
      if (is_active !== undefined) {
        conditions.push(`u.is_active = $${++p}`)
        countValues.push(is_active === 'true')
        listValues.push(is_active === 'true')
      }
      if (company_id) {
        conditions.push(
          `EXISTS (SELECT 1 FROM user_company_roles ucr2 WHERE ucr2.user_id = u.id AND ucr2.company_id = $${++p})`,
        )
        countValues.push(company_id)
        listValues.push(company_id)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      listValues.push(parseInt(limit), offset)

      const [users, total] = await Promise.all([
        query(
          `SELECT
             u.id, u.email, u.is_active, u.mfa_enabled,
             u.last_login_at, u.failed_login_attempts,
             u.locked_until, u.created_at,
             u.theme_preference, u.date_format, u.number_format,
             COALESCE(
               json_agg(
                 json_build_object(
                   'companyId',   ucr.company_id,
                   'companyName', c.name,
                   'role',        ucr.role,
                   'module',      ucr.module,
                   'isActive',    ucr.is_active
                 )
               ) FILTER (WHERE ucr.id IS NOT NULL),
               '[]'
             ) AS roles
           FROM users u
           LEFT JOIN user_company_roles ucr ON ucr.user_id = u.id
           LEFT JOIN companies c ON c.id = ucr.company_id
           ${where}
           GROUP BY u.id
           ORDER BY u.created_at DESC
           LIMIT $${p + 1} OFFSET $${p + 2}`,
          listValues,
        ),
        query(`SELECT COUNT(*) FROM users u ${where}`, countValues),
      ])

      res.json({
        success: true,
        data: users.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(String(total.rows[0]?.['count'] ?? 0)),
          totalPages: Math.ceil(parseInt(String(total.rows[0]?.['count'] ?? 0)) / parseInt(limit)),
        },
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list users', err)
    }
  },
)

// ── GET /auth/users/:id ────────────────────────────────────────────────────────

userManagementRouter.get(
  '/:id',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await query(
        `SELECT
           u.id, u.email, u.is_active, u.mfa_enabled,
           u.last_login_at, u.failed_login_attempts,
           u.locked_until, u.created_at, u.updated_at,
           u.theme_preference, u.date_format, u.number_format,
           COALESCE(
             json_agg(
               json_build_object(
                 'id',          ucr.id,
                 'companyId',   ucr.company_id,
                 'companyName', c.name,
                 'role',        ucr.role,
                 'module',      ucr.module,
                 'isActive',    ucr.is_active,
                 'createdAt',   ucr.created_at
               )
             ) FILTER (WHERE ucr.id IS NOT NULL),
             '[]'
           ) AS roles
         FROM users u
         LEFT JOIN user_company_roles ucr ON ucr.user_id = u.id
         LEFT JOIN companies c ON c.id = ucr.company_id
         WHERE u.id = $1
         GROUP BY u.id`,
        [req.params['id']],
      )

      if (!result.rows[0]) {
        sendError(res, 404, 'USER_NOT_FOUND', 'User not found')
        return
      }

      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch user', err)
    }
  },
)

// ── POST /auth/users ────────────────────────────────────────────────────────────
// Direct creation (with password) or invitation dispatch.

userManagementRouter.post(
  '/',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    const {
      email,
      password,
      company_id,
      role,
      module: roleModule,
      send_invitation = false,
    } = req.body as {
      email?: string
      password?: string
      company_id?: string
      role?: string
      module?: string
      send_invitation?: boolean
    }

    if (!email?.includes('@')) {
      sendError(res, 400, 'INVALID_EMAIL', 'Valid email address required')
      return
    }

    try {
      const existing = await query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase()])
      if (existing.rows[0]) {
        sendError(res, 409, 'EMAIL_TAKEN', 'A user with this email already exists')
        return
      }

      if (send_invitation) {
        await dispatchInvitation(req, res, { email, company_id, role, module: roleModule })
        return
      }

      if (!password || password.length < 8) {
        sendError(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters')
        return
      }

      const strength = validatePasswordStrength(password)
      if (!strength.valid) {
        sendError(res, 400, 'WEAK_PASSWORD', strength.reason ?? 'Password too weak')
        return
      }

      const passwordHash = await hashPassword(password)

      const userId = await withSystemTransaction(async (client) => {
        const user = await client.query(
          `INSERT INTO users (email, password_hash, is_active, mfa_enabled)
           VALUES ($1, $2, true, false)
           RETURNING id, email, is_active, created_at`,
          [email.toLowerCase(), passwordHash],
        )
        const uid: string = user.rows[0]?.id

        if (company_id && role) {
          await client.query(
            `INSERT INTO user_company_roles (user_id, company_id, role, module, is_active)
             VALUES ($1, $2, $3, $4, true)`,
            [uid, company_id, role, roleModule ?? null],
          )
        }

        await logAudit({
          userId: req.auth!.userId,
          companyId: undefined,
          action: 'USER_CREATED',
          tableName: 'users',
          recordId: uid,
          newValues: { email, company_id, role },
          ipAddress: req.ip ?? undefined,
          userAgent: String(req.headers['user-agent'] ?? ''),
          client,
        })

        log.info({ userId: uid, email, createdBy: req.auth!.userId }, 'user created')
        return uid
      })

      const user = await query(`SELECT id, email, is_active, created_at FROM users WHERE id = $1`, [
        userId,
      ])
      res.status(201).json({ success: true, data: user.rows[0] })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create user', err)
    }
  },
)

// ── GET /auth/users/accept-invitation/validate ────────────────────────────────
// Public — validates an invitation token and returns invite metadata.

userManagementRouter.get(
  '/accept-invitation/validate',
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.query as { token?: string }

    if (!token) {
      sendError(res, 400, 'MISSING_TOKEN', 'Token is required')
      return
    }

    try {
      const result = await query(
        `SELECT ui.email, ui.role, ui.expires_at,
              c.name AS company_name,
              COALESCE(u.first_name || ' ' || u.last_name, u.email) AS invited_by_email
       FROM user_invitations ui
       LEFT JOIN companies c ON c.id = ui.company_id
       LEFT JOIN users u ON u.id = ui.invited_by
       WHERE ui.token = $1 AND ui.status = 'pending' AND ui.expires_at > NOW()`,
        [token],
      )

      if (!result.rows[0]) {
        sendError(res, 400, 'INVALID_TOKEN', 'Invitation token is invalid or has expired')
        return
      }

      const inv = result.rows[0]
      res.json({
        success: true,
        data: {
          email: inv['email'] as string,
          companyName: (inv['company_name'] as string | null) ?? 'FNC ERP',
          invitedByName: (inv['invited_by_email'] as string | null) ?? 'an administrator',
          role: inv['role'] as string | null,
          expiresAt: inv['expires_at'] as string,
        },
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to validate invitation', err)
    }
  },
)

// ── POST /auth/users/invite ────────────────────────────────────────────────────
// Send an invitation email — user sets their own password on acceptance.
// Must be registered BEFORE /:id to avoid route shadowing.

userManagementRouter.post(
  '/invite',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    const { email, company_id, role, module: roleModule } = req.body as Record<string, string>
    await dispatchInvitation(req, res, { email, company_id, role, module: roleModule })
  },
)

// ── POST /auth/accept-invitation ──────────────────────────────────────────────
// Public — no JWT required. Token in body.

userManagementRouter.post(
  '/accept-invitation',
  async (req: Request, res: Response): Promise<void> => {
    const { token, password, confirmPassword } = req.body as Record<string, string>

    if (!token || !password) {
      sendError(res, 400, 'MISSING_FIELDS', 'Token and password are required')
      return
    }

    if (password !== confirmPassword) {
      sendError(res, 400, 'PASSWORD_MISMATCH', 'Passwords do not match')
      return
    }

    const strength = validatePasswordStrength(password)
    if (!strength.valid) {
      sendError(res, 400, 'WEAK_PASSWORD', strength.reason ?? 'Password too weak')
      return
    }

    try {
      const invResult = await query(
        `SELECT * FROM user_invitations WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
        [token],
      )

      if (!invResult.rows[0]) {
        sendError(res, 400, 'INVALID_INVITATION', 'This invitation link is invalid or has expired')
        return
      }

      const inv = invResult.rows[0]
      const invEmail = inv['email'] as string
      const invCompanyId = inv['company_id'] as string | null
      const invRole = inv['role'] as string | null
      const invModule = inv['module'] as string | null
      const invId = inv['id'] as string

      const existing = await query(`SELECT id FROM users WHERE email = $1`, [invEmail])
      if (existing.rows[0]) {
        sendError(
          res,
          409,
          'EMAIL_TAKEN',
          'An account with this email already exists. Please log in instead.',
        )
        return
      }

      const passwordHash = await hashPassword(password)

      await withSystemTransaction(async (client) => {
        const user = await client.query(
          `INSERT INTO users (email, password_hash, is_active, mfa_enabled)
         VALUES ($1, $2, true, false)
         RETURNING id`,
          [invEmail, passwordHash],
        )
        const userId: string = user.rows[0]?.id

        if (invCompanyId && invRole) {
          await client.query(
            `INSERT INTO user_company_roles (user_id, company_id, role, module, is_active)
           VALUES ($1, $2, $3, $4, true)`,
            [userId, invCompanyId, invRole, invModule],
          )
        }

        await client.query(
          `UPDATE user_invitations
         SET status = 'accepted', accepted_at = NOW(), created_user_id = $1
         WHERE id = $2`,
          [userId, invId],
        )

        await logAudit({
          userId,
          companyId: undefined,
          action: 'INVITATION_ACCEPTED',
          tableName: 'users',
          recordId: userId,
          newValues: { email: invEmail },
          client,
        })

        log.info({ userId, email: invEmail }, 'invitation accepted — user created')
      })

      res.json({
        success: true,
        data: { message: 'Account created successfully. You can now log in.' },
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to accept invitation', err)
    }
  },
)

// ── PATCH /auth/users/:id ──────────────────────────────────────────────────────

userManagementRouter.patch(
  '/:id',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    const { is_active, email } = req.body as { is_active?: boolean; email?: string }

    if (email !== undefined && !email.includes('@')) {
      sendError(res, 400, 'INVALID_EMAIL', 'Valid email required')
      return
    }

    try {
      await withSystemTransaction(async (client) => {
        const setClauses: string[] = []
        const values: unknown[] = []
        let p = 0

        if (email !== undefined) {
          setClauses.push(`email = $${++p}`)
          values.push(email.toLowerCase())
        }
        if (is_active !== undefined) {
          setClauses.push(`is_active = $${++p}`)
          values.push(is_active)
        }

        if (setClauses.length === 0) {
          sendError(res, 400, 'NO_CHANGES', 'No fields to update')
          return
        }

        setClauses.push('updated_at = NOW()')
        values.push(req.params['id'])

        await client.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $${p + 1}`, values)

        if (is_active === false) {
          await client.query(`DELETE FROM sessions WHERE user_id = $1`, [req.params['id']])
        }

        await logAudit({
          userId: req.auth!.userId,
          companyId: undefined,
          action: is_active === false ? 'USER_DEACTIVATED' : 'USER_UPDATED',
          tableName: 'users',
          recordId: req.params['id'],
          newValues: { is_active, email },
          ipAddress: req.ip ?? undefined,
          userAgent: String(req.headers['user-agent'] ?? ''),
          client,
        })
      })

      res.json({ success: true, data: { message: 'User updated' } })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update user', err)
    }
  },
)

// ── POST /auth/users/:id/unlock ────────────────────────────────────────────────

userManagementRouter.post(
  '/:id/unlock',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
        [req.params['id']],
      )
      await logAudit({
        userId: req.auth!.userId,
        companyId: undefined,
        action: 'USER_UNLOCKED',
        tableName: 'users',
        recordId: req.params['id'],
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      })
      res.json({ success: true, data: { message: 'User account unlocked' } })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to unlock user', err)
    }
  },
)

// ── POST /auth/users/:id/set-password ─────────────────────────────────────────

userManagementRouter.post(
  '/:id/set-password',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    const { newPassword } = req.body as { newPassword?: string }

    if (!newPassword || newPassword.length < 8) {
      sendError(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters')
      return
    }

    const strength = validatePasswordStrength(newPassword)
    if (!strength.valid) {
      sendError(res, 400, 'WEAK_PASSWORD', strength.reason ?? 'Password too weak')
      return
    }

    try {
      const exists = await query(`SELECT id FROM users WHERE id = $1`, [req.params['id']])
      if (!exists.rows[0]) {
        sendError(res, 404, 'USER_NOT_FOUND', 'User not found')
        return
      }

      const passwordHash = await hashPassword(newPassword)

      await withSystemTransaction(async (client) => {
        await client.query(
          `UPDATE users
           SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
           WHERE id = $2`,
          [passwordHash, req.params['id']],
        )
        await client.query(`DELETE FROM sessions WHERE user_id = $1`, [req.params['id']])
        await logAudit({
          userId: req.auth!.userId,
          companyId: undefined,
          action: 'USER_PASSWORD_CHANGED_BY_ADMIN',
          tableName: 'users',
          recordId: req.params['id'],
          ipAddress: req.ip ?? undefined,
          userAgent: String(req.headers['user-agent'] ?? ''),
          client,
        })
      })

      log.info(
        { targetUserId: req.params['id'], changedBy: req.auth!.userId },
        'admin set user password',
      )
      res.json({
        success: true,
        data: { message: 'Password updated. All sessions have been revoked.' },
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to set password', err)
    }
  },
)

// ── POST /auth/users/:id/reset-mfa ────────────────────────────────────────────

userManagementRouter.post(
  '/:id/reset-mfa',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await withSystemTransaction(async (client) => {
        await client.query(
          `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, updated_at = NOW() WHERE id = $1`,
          [req.params['id']],
        )
        await client.query(`DELETE FROM sessions WHERE user_id = $1`, [req.params['id']])
        await logAudit({
          userId: req.auth!.userId,
          companyId: undefined,
          action: 'USER_MFA_RESET',
          tableName: 'users',
          recordId: req.params['id'],
          ipAddress: req.ip ?? undefined,
          userAgent: String(req.headers['user-agent'] ?? ''),
          client,
        })
      })
      res.json({ success: true, data: { message: 'MFA reset. User must re-enroll.' } })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reset MFA', err)
    }
  },
)

// ── GET /auth/users/:id/sessions ──────────────────────────────────────────────

userManagementRouter.get(
  '/:id/sessions',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await query(
        `SELECT id, device_name, platform, ip_address, created_at, expires_at
         FROM sessions
         WHERE user_id = $1 AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [req.params['id']],
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list sessions', err)
    }
  },
)

// ── DELETE /auth/users/:id/sessions/:sessionId ────────────────────────────────

userManagementRouter.delete(
  '/:id/sessions/:sessionId',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await query(`DELETE FROM sessions WHERE id = $1 AND user_id = $2`, [
        req.params['sessionId'],
        req.params['id'],
      ])
      await logAudit({
        userId: req.auth!.userId,
        companyId: undefined,
        action: 'SESSION_REVOKED_BY_ADMIN',
        tableName: 'sessions',
        recordId: req.params['sessionId'],
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      })
      res.json({ success: true, data: { message: 'Session revoked' } })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to revoke session', err)
    }
  },
)

// ── DELETE /auth/users/:id/sessions — revoke all ──────────────────────────────

userManagementRouter.delete(
  '/:id/sessions',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.users.edit', 'edit'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await query(`DELETE FROM sessions WHERE user_id = $1`, [req.params['id']])
      await logAudit({
        userId: req.auth!.userId,
        companyId: undefined,
        action: 'ALL_SESSIONS_REVOKED_BY_ADMIN',
        tableName: 'sessions',
        recordId: req.params['id'],
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      })
      res.json({ success: true, data: { message: 'All sessions revoked' } })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to revoke sessions', err)
    }
  },
)

// ── Shared invitation helper ───────────────────────────────────────────────────

async function dispatchInvitation(
  req: Request,
  res: Response,
  data: {
    email: string | undefined
    company_id: string | undefined
    role: string | undefined
    module: string | undefined
  },
): Promise<void> {
  const { email, company_id, role, module: roleModule } = data

  if (!email?.includes('@')) {
    sendError(res, 400, 'INVALID_EMAIL', 'Valid email address required')
    return
  }

  try {
    const existing = await query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase()])
    if (existing.rows[0]) {
      sendError(res, 409, 'EMAIL_TAKEN', 'A user with this email already exists')
      return
    }

    // Cancel any pending invitations for this email
    await query(
      `UPDATE user_invitations SET status = 'cancelled' WHERE email = $1 AND status = 'pending'`,
      [email.toLowerCase()],
    )

    const token = secureToken(48)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    let companyName: string | null = null
    if (company_id) {
      const co = await query(`SELECT name FROM companies WHERE id = $1`, [company_id])
      companyName = (co.rows[0]?.['name'] as string) ?? null
    }

    await withSystemTransaction(async (client) => {
      await client.query(
        `INSERT INTO user_invitations
           (email, invited_by, company_id, role, module, token, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          email.toLowerCase(),
          req.auth!.userId,
          company_id ?? null,
          role ?? null,
          roleModule ?? null,
          token,
          expiresAt,
        ],
      )

      await client.query(
        `INSERT INTO service_outbox (service, event_type, payload)
         VALUES ('notifications', 'USER_INVITATION_EMAIL', $1)`,
        [
          JSON.stringify({
            email: email.toLowerCase(),
            invitedBy: req.auth!.userId,
            invitationUrl: `${env.FRONTEND_URL}/accept-invitation?token=${token}`,
            expiresAt: expiresAt.toISOString(),
            companyName,
            role: role ?? null,
          }),
        ],
      )

      await logAudit({
        userId: req.auth!.userId,
        companyId: undefined,
        action: 'USER_INVITED',
        tableName: 'user_invitations',
        recordId: token,
        newValues: { email, company_id, role },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        client,
      })
    })

    log.info({ email, invitedBy: req.auth!.userId }, 'user invitation sent')
    res.status(201).json({
      success: true,
      data: {
        message: `Invitation sent to ${email}. Link expires in 7 days.`,
        expiresAt: expiresAt.toISOString(),
      },
    })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to send invitation', err)
  }
}
