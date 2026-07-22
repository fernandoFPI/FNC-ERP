import { Router, type Request, type Response, type IRouter } from 'express'
import { z } from 'zod'
import { withTransaction, withSystemTransaction, query } from '@fnc-erp/db'
import {
  verifyPassword,
  hashPassword,
  validatePasswordStrength,
  signMfaTempToken,
  verifyMfaTempToken,
  signDeviceTrustToken,
  verifyDeviceTrustToken,
  verifyRefreshToken,
  signAccessToken,
  encrypt,
  decrypt,
  generateMFASecret,
  verifyMFAToken,
  requireAuth,
} from '@fnc-erp/auth'
import { HTTP_STATUS, ERROR_CODES, AUTH_CONSTANTS, ROLES, env } from '@fnc-erp/config'
import { logAudit } from '@fnc-erp/audit'
import { createSession, hashToken } from '../lib/session.js'
import { sendError, sendValidationError, sendInternalError } from '../lib/errors.js'

export const authRouter: IRouter = Router()

// ── Schemas ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  platform: z.enum(['web', 'mobile']).optional(),
  deviceToken: z.string().optional(),
})

const mfaVerifySchema = z.object({
  tempToken: z.string().min(1),
  totpCode: z.string().length(6),
  trustDevice: z.boolean().optional(),
})

const mfaConfirmSchema = z.object({
  totpCode: z.string().length(6),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

const companySwitchSchema = z.object({
  companyId: z.string().uuid(),
})

// ── Helpers ──────────────────────────────────────────────────────────────────


type UserRow = {
  id: string
  email: string
  password_hash: string
  mfa_enabled: boolean
  mfa_secret: string | null
  failed_login_attempts: number
  locked_until: Date | null
  is_active: boolean
  profile_completed: boolean
  employee_id: string | null
}

type RoleRow = {
  company_id: string
  role: string
  module: string
}

type CompanyRow = {
  id: string
  name: string
  currency_code?: string
}

// ── POST /auth/login ──────────────────────────────────────────────────────────

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    sendValidationError(res, parsed.error.flatten())
    return
  }

  const { email, password, deviceId, deviceName, platform } = parsed.data
  const ipAddress = req.ip ?? req.socket.remoteAddress ?? ''
  const userAgent = req.headers['user-agent'] ?? ''

  try {
    const userResult = await query<UserRow>(
      `SELECT u.id, u.email, u.password_hash, u.mfa_enabled, u.mfa_secret,
              u.failed_login_attempts, u.locked_until, u.is_active, u.profile_completed,
              e.id AS employee_id
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()],
    )

    // Use a constant-time comparison path regardless of whether user exists
    const user = userResult.rows[0] ?? null

    // Check account lock (before password check for locked real accounts)
    // pg returns TIMESTAMPTZ as strings due to custom type parsers, so use Date.parse
    if (user && user.locked_until && Date.parse(String(user.locked_until)) > Date.now()) {
      sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.ACCOUNT_LOCKED, 'Account is temporarily locked due to too many failed login attempts')
      return
    }

    const passwordValid = user ? await verifyPassword(password, user.password_hash) : false

    if (!user || !passwordValid || !user.is_active) {
      // Increment failed attempts for real accounts with wrong passwords
      if (user && !passwordValid) {
        const newAttempts = user.failed_login_attempts + 1
        const lockUntil =
          newAttempts >= AUTH_CONSTANTS.MAX_FAILED_LOGIN_ATTEMPTS
            ? new Date(Date.now() + AUTH_CONSTANTS.LOCKOUT_DURATION_MINUTES * 60 * 1000)
            : null

        await query(
          `UPDATE users
           SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW()
           WHERE id = $3`,
          [newAttempts, lockUntil, user.id],
        )
      }
      // Same error message regardless of reason — no user enumeration
      sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS, 'Email or password is incorrect')
      return
    }

    // If MFA enabled, check for trusted device before requiring OTP
    if (user.mfa_enabled) {
      const { deviceToken } = parsed.data
      const trusted = deviceToken ? verifyDeviceTrustToken(deviceToken) : null
      if (!trusted || trusted.sub !== user.id) {
        const tempToken = signMfaTempToken(user.id)
        res.status(HTTP_STATUS.OK).json({
          success: true,
          data: { requiresMFA: true, tempToken },
        })
        return
      }
      // Device is trusted — fall through to session creation
    }

    // Get user roles — highest role first
    const rolesResult = await query<RoleRow>(
      `SELECT ucr.company_id, ucr.role, ucr.module
       FROM user_company_roles ucr
       WHERE ucr.user_id = $1 AND ucr.is_active = true
       ORDER BY CASE ucr.role
         WHEN 'system_admin'  THEN 1
         WHEN 'company_admin' THEN 2
         WHEN 'module_admin'  THEN 3
         ELSE 4
       END`,
      [user.id],
    )

    const firstRole = rolesResult.rows[0]
    if (!firstRole) {
      sendError(res, HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'No active company roles found')
      return
    }

    const companiesResult = await query<CompanyRow>(
      `SELECT id, name, currency_code FROM companies
       WHERE id = ANY($1::uuid[]) AND is_active = true`,
      [rolesResult.rows.map((r) => r.company_id)],
    )

    const { accessToken, refreshToken } = await withSystemTransaction(async (client) => {
      // ── Concurrent session limit ───────────────────────────────
      const sessionCountResult = await client.query<{ count: string; session_ids: string[] }>(
        `SELECT COUNT(*) AS count,
                array_agg(id ORDER BY created_at ASC) AS session_ids
         FROM sessions
         WHERE user_id=$1 AND expires_at > NOW()`,
        [user.id],
      )
      const sessionCount = parseInt(sessionCountResult.rows[0]?.count ?? '0')
      const sessionIds = sessionCountResult.rows[0]?.session_ids ?? []

      if (sessionCount >= env.MAX_SESSIONS_PER_USER && sessionIds[0]) {
        await client.query(`DELETE FROM sessions WHERE id=$1`, [sessionIds[0]])
      }

      // ── New device detection ────────────────────────────────────
      // Checked against user_known_devices (persists across logout), not the
      // live `sessions` table (hard-deleted on logout — using it here made
      // every post-logout login look like a brand-new device).
      const effectiveDeviceId = deviceId ?? 'web'
      const knownDeviceResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM user_known_devices WHERE user_id=$1 AND device_id=$2`,
        [user.id, effectiveDeviceId],
      )
      const isNewDevice = parseInt(knownDeviceResult.rows[0]?.count ?? '0') === 0

      await client.query(
        `INSERT INTO user_known_devices (user_id, device_id) VALUES ($1,$2)
         ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = NOW()`,
        [user.id, effectiveDeviceId],
      )

      if (isNewDevice) {
        await client.query(
          `INSERT INTO service_outbox (service, event_type, payload)
           VALUES ('notifications','NEW_DEVICE_LOGIN',$1)`,
          [
            JSON.stringify({
              userId: user.id,
              email: user.email,
              deviceName: deviceName ?? 'Unknown device',
              platform: platform ?? 'web',
              ipAddress,
              userAgent,
              loginAt: new Date().toISOString(),
            }),
          ],
        )
      }

      // ── Create session ──────────────────────────────────────────
      const tokens = await createSession({
        client,
        userId: user.id,
        companyId: firstRole.company_id,
        role: firstRole.role,
        module: firstRole.module,
        deviceId,
        deviceName,
        platform,
        ipAddress,
        userAgent,
      })

      await client.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW(), updated_at = NOW() WHERE id = $1`,
        [user.id],
      )

      await logAudit({
        userId: user.id,
        companyId: firstRole.company_id,
        action: 'LOGIN',
        ipAddress,
        userAgent,
        client,
      })

      return tokens
    })

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, mfaEnabled: user.mfa_enabled, profileCompleted: user.profile_completed, employeeId: user.employee_id },
        companies: companiesResult.rows,
      },
    })
  } catch (err) {
    console.error('[auth] login error:', err)
    sendInternalError(res)
  }
})

// ── POST /auth/mfa/verify ─────────────────────────────────────────────────────

authRouter.post('/mfa/verify', async (req: Request, res: Response): Promise<void> => {
  const parsed = mfaVerifySchema.safeParse(req.body)
  if (!parsed.success) {
    sendValidationError(res, parsed.error.flatten())
    return
  }

  const { tempToken, totpCode, trustDevice } = parsed.data
  const ipAddress = req.ip ?? req.socket.remoteAddress ?? ''
  const userAgent = req.headers['user-agent'] ?? ''

  try {
    let tempPayload
    try {
      tempPayload = verifyMfaTempToken(tempToken)
    } catch {
      sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_INVALID, 'Invalid or expired MFA token')
      return
    }

    const userResult = await query<UserRow>(
      `SELECT u.id, u.email, u.mfa_secret, u.mfa_enabled, u.profile_completed, e.id AS employee_id
       FROM users u LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1 AND u.is_active = true`,
      [tempPayload.sub],
    )

    const user = userResult.rows[0]
    if (!user?.mfa_secret) {
      sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'MFA not configured')
      return
    }

    const decryptedSecret = decrypt(user.mfa_secret)
    if (!verifyMFAToken(decryptedSecret, totpCode)) {
      sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.MFA_INVALID, 'Invalid TOTP code')
      return
    }

    const rolesForMfa = await query<RoleRow>(
      `SELECT company_id, role, module FROM user_company_roles
       WHERE user_id = $1 AND is_active = true
       ORDER BY CASE role
         WHEN 'system_admin'  THEN 1
         WHEN 'company_admin' THEN 2
         WHEN 'module_admin'  THEN 3
         ELSE 4
       END`,
      [user.id],
    )

    const firstRole = rolesForMfa.rows[0]
    if (!firstRole) {
      sendError(res, HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'No active company roles found')
      return
    }

    const { accessToken, refreshToken } = await withSystemTransaction(async (client) => {
      const tokens = await createSession({
        client,
        userId: user.id,
        companyId: firstRole.company_id,
        role: firstRole.role,
        module: firstRole.module,
        ipAddress,
        userAgent,
      })

      await client.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW(), updated_at = NOW() WHERE id = $1`,
        [user.id],
      )

      await logAudit({
        userId: user.id,
        companyId: firstRole.company_id,
        action: 'MFA_VERIFIED',
        ipAddress,
        userAgent,
        client,
      })

      return tokens
    })

    const companiesResult = await query<CompanyRow>(
      `SELECT id, name, currency_code FROM companies WHERE id = ANY($1::uuid[]) AND is_active = true`,
      [rolesForMfa.rows.map((r) => r.company_id)],
    )

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, mfaEnabled: user.mfa_enabled, profileCompleted: user.profile_completed, employeeId: user.employee_id },
        companies: companiesResult.rows,
        deviceToken: trustDevice ? signDeviceTrustToken(user.id) : undefined,
      },
    })
  } catch (err) {
    console.error('[auth] mfa/verify error:', err)
    sendInternalError(res)
  }
})

// ── POST /auth/mfa/setup ──────────────────────────────────────────────────────

authRouter.post('/mfa/setup', requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const auth = req.auth
  if (!auth) { sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not authenticated'); return }

  try {
    const userResult = await query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [auth.userId],
    )
    const user = userResult.rows[0]
    if (!user) { sendError(res, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'User not found'); return }

    const { secret, otpauthUrl } = generateMFASecret(user.email)
    const encryptedSecret = encrypt(secret)

    await query(
      `UPDATE users SET mfa_secret = $1, updated_at = NOW() WHERE id = $2`,
      [encryptedSecret, auth.userId],
    )

    await logAudit({
      userId: auth.userId,
      companyId: auth.companyId,
      action: 'MFA_SETUP',
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
    })

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { secret, otpauthUrl },
    })
  } catch (err) {
    console.error('[auth] mfa/setup error:', err)
    sendInternalError(res)
  }
})

// ── POST /auth/mfa/confirm ────────────────────────────────────────────────────

authRouter.post('/mfa/confirm', requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const auth = req.auth
  if (!auth) { sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not authenticated'); return }

  const parsed = mfaConfirmSchema.safeParse(req.body)
  if (!parsed.success) { sendValidationError(res, parsed.error.flatten()); return }

  try {
    const userResult = await query<{ mfa_secret: string | null }>(
      `SELECT mfa_secret FROM users WHERE id = $1`,
      [auth.userId],
    )
    const user = userResult.rows[0]
    if (!user?.mfa_secret) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'MFA setup not initiated')
      return
    }

    const decryptedSecret = decrypt(user.mfa_secret)
    if (!verifyMFAToken(decryptedSecret, parsed.data.totpCode)) {
      sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.MFA_INVALID, 'Invalid TOTP code')
      return
    }

    await query(
      `UPDATE users SET mfa_enabled = true, updated_at = NOW() WHERE id = $1`,
      [auth.userId],
    )

    await logAudit({
      userId: auth.userId,
      companyId: auth.companyId,
      action: 'MFA_ENABLED',
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
    })

    res.status(HTTP_STATUS.OK).json({ success: true, data: { mfaEnabled: true } })
  } catch (err) {
    console.error('[auth] mfa/confirm error:', err)
    sendInternalError(res)
  }
})

// ── POST /auth/refresh ────────────────────────────────────────────────────────

authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const parsed = refreshSchema.safeParse(req.body)
  if (!parsed.success) { sendValidationError(res, parsed.error.flatten()); return }

  const { refreshToken } = parsed.data

  try {
    let payload
    try {
      payload = verifyRefreshToken(refreshToken)
    } catch {
      sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_EXPIRED, 'Refresh token invalid or expired')
      return
    }

    const sessionResult = await query<{
      id: string
      user_id: string
      company_id: string | null
      refresh_expires_at: Date
    }>(
      `SELECT s.id, s.user_id, s.company_id, s.refresh_expires_at
       FROM sessions s
       WHERE s.refresh_token_hash = $1
       AND s.refresh_expires_at > NOW()`,
      [hashToken(refreshToken)],
    )

    const session = sessionResult.rows[0]
    if (!session) {
      sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_EXPIRED, 'Session not found or expired')
      return
    }

    // Re-use the company this session was last active in, so a token refresh
    // never silently switches the user back to a "default" company.
    // Falls back to highest-priority role only if that company access was revoked.
    let role: RoleRow | undefined
    if (session.company_id) {
      const activeRoleResult = await query<RoleRow>(
        `SELECT company_id, role, module FROM user_company_roles
         WHERE user_id = $1 AND company_id = $2 AND is_active = true
         LIMIT 1`,
        [session.user_id, session.company_id],
      )
      role = activeRoleResult.rows[0]
    }
    if (!role) {
      const rolesResult = await query<RoleRow>(
        `SELECT company_id, role, module FROM user_company_roles
         WHERE user_id = $1 AND is_active = true
         ORDER BY CASE role
           WHEN 'system_admin'  THEN 1
           WHEN 'company_admin' THEN 2
           WHEN 'module_admin'  THEN 3
           ELSE 4
         END
         LIMIT 1`,
        [session.user_id],
      )
      role = rolesResult.rows[0]
    }
    if (!role) {
      sendError(res, HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'No active roles')
      return
    }

    const newAccessToken = signAccessToken({
      userId: session.user_id,
      sessionId: payload.sessionId,
      companyId: role.company_id,
      role: role.role,
      module: role.module,
    })

    // Update stored access token hash, active company, and last_active timestamp
    await query(
      `UPDATE sessions SET token_hash = $1, company_id = $2, expires_at = NOW() + INTERVAL '15 minutes', last_active = NOW() WHERE id = $3`,
      [hashToken(newAccessToken), role.company_id, session.id],
    )

    res.status(HTTP_STATUS.OK).json({ success: true, data: { accessToken: newAccessToken } })
  } catch (err) {
    console.error('[auth] refresh error:', err)
    sendInternalError(res)
  }
})

// ── POST /auth/logout ─────────────────────────────────────────────────────────

authRouter.post('/logout', requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const auth = req.auth
  if (!auth) { sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not authenticated'); return }

  try {
    await withSystemTransaction(async (client) => {
      await client.query(`DELETE FROM sessions WHERE id = $1`, [auth.sessionId])
      await logAudit({
        userId: auth.userId,
        companyId: auth.companyId,
        action: 'LOGOUT',
        ipAddress: auth.ipAddress,
        userAgent: auth.userAgent,
        client,
      })
    })

    res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'Logged out' } })
  } catch (err) {
    console.error('[auth] logout error:', err)
    sendInternalError(res)
  }
})

// ── POST /auth/logout-all ─────────────────────────────────────────────────────

authRouter.post('/logout-all', requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const auth = req.auth
  if (!auth) { sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not authenticated'); return }

  try {
    await withSystemTransaction(async (client) => {
      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [auth.userId])
      await logAudit({
        userId: auth.userId,
        companyId: auth.companyId,
        action: 'LOGOUT_ALL',
        ipAddress: auth.ipAddress,
        userAgent: auth.userAgent,
        client,
      })
    })

    res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'All sessions terminated' } })
  } catch (err) {
    console.error('[auth] logout-all error:', err)
    sendInternalError(res)
  }
})

// ── GET /auth/me ──────────────────────────────────────────────────────────────

authRouter.get('/me', requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const auth = req.auth
  if (!auth) { sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not authenticated'); return }

  try {
    const userResult = await query<{ id: string; email: string; mfa_enabled: boolean; last_login: Date | null; created_at: Date; employee_id: string | null }>(
      `SELECT u.id, u.email, u.mfa_enabled, u.last_login, u.created_at, e.id AS employee_id
       FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE u.id = $1`,
      [auth.userId],
    )
    const user = userResult.rows[0]
    if (!user) { sendError(res, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'User not found'); return }

    const rolesResult = await query<RoleRow & { company_name: string }>(
      `SELECT ucr.company_id, ucr.role, ucr.module, c.name AS company_name
       FROM user_company_roles ucr
       JOIN companies c ON c.id = ucr.company_id
       WHERE ucr.user_id = $1 AND ucr.is_active = true`,
      [user.id],
    )

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        employeeId: user.employee_id,
        mfaEnabled: user.mfa_enabled,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        roles: rolesResult.rows.map((r) => ({
          companyId: r.company_id,
          companyName: r.company_name,
          role: r.role,
          module: r.module,
        })),
      },
    })
  } catch (err) {
    console.error('[auth] /me error:', err)
    sendInternalError(res)
  }
})

// ── GET /auth/me/companies ────────────────────────────────────────────────────

authRouter.get('/me/companies', requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const auth = req.auth
  if (!auth) { sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not authenticated'); return }

  try {
    const result = await query<CompanyRow>(
      `SELECT DISTINCT c.id, c.name, c.currency_code
       FROM companies c
       JOIN user_company_roles ucr ON ucr.company_id = c.id
       WHERE ucr.user_id = $1
         AND ucr.is_active = true
         AND c.is_active = true
       ORDER BY c.name`,
      [auth.userId],
    )

    res.status(HTTP_STATUS.OK).json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[auth] /me/companies error:', err)
    sendInternalError(res)
  }
})

// ── POST /auth/company/switch ─────────────────────────────────────────────────

authRouter.post('/company/switch', requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const auth = req.auth
  if (!auth) { sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not authenticated'); return }

  const parsed = companySwitchSchema.safeParse(req.body)
  if (!parsed.success) { sendValidationError(res, parsed.error.flatten()); return }

  const { companyId } = parsed.data

  try {
    const roleResult = await query<RoleRow>(
      `SELECT company_id, role, module FROM user_company_roles
       WHERE user_id = $1 AND company_id = $2 AND is_active = true
       LIMIT 1`,
      [auth.userId, companyId],
    )

    if (roleResult.rowCount === 0) {
      sendError(res, HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'You do not have access to this company')
      return
    }

    const role = roleResult.rows[0]!
    const newAccessToken = signAccessToken({
      userId: auth.userId,
      sessionId: auth.sessionId,
      companyId: role.company_id,
      role: role.role,
      module: role.module,
    })

    // Update the session token hash, active company, and last_active timestamp
    await query(
      `UPDATE sessions SET token_hash = $1, company_id = $2, expires_at = NOW() + INTERVAL '15 minutes', last_active = NOW() WHERE id = $3`,
      [hashToken(newAccessToken), role.company_id, auth.sessionId],
    )

    await logAudit({
      userId: auth.userId,
      companyId,
      action: 'COMPANY_SWITCH',
      newValues: { companyId },
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
    })

    res.status(HTTP_STATUS.OK).json({ success: true, data: { accessToken: newAccessToken } })
  } catch (err) {
    console.error('[auth] company/switch error:', err)
    sendInternalError(res)
  }
})
