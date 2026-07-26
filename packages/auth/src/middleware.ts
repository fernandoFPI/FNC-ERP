import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { query } from '@fnc-erp/db'
import { HTTP_STATUS, ERROR_CODES } from '@fnc-erp/config'
import type { AuthContext } from '@fnc-erp/types'
import { verifyAccessToken } from './jwt.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}

function sendUnauthorized(res: Response, code: string, message: string): void {
  res.status(HTTP_STATUS.UNAUTHORIZED).json({
    success: false,
    error: { code, message },
  })
}

function sendForbidden(res: Response, message: string): void {
  res.status(HTTP_STATUS.FORBIDDEN).json({
    success: false,
    error: { code: ERROR_CODES.FORBIDDEN, message },
  })
}

export function requireAuth(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      sendUnauthorized(res, ERROR_CODES.UNAUTHORIZED, 'Authorization header missing or malformed')
      return
    }

    const token = authHeader.slice(7)
    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      sendUnauthorized(res, ERROR_CODES.TOKEN_INVALID, 'Token is invalid or expired')
      return
    }

    // Verify session still exists in DB
    const sessionResult = await query<{ id: string; expires_at: Date }>(
      `SELECT id, expires_at FROM sessions
       WHERE token_hash = encode(digest($1, 'sha256'), 'hex')
       AND expires_at > NOW()`,
      [token],
    ).catch(() => null)

    if (!sessionResult || sessionResult.rowCount === 0) {
      sendUnauthorized(res, ERROR_CODES.TOKEN_EXPIRED, 'Session not found or expired')
      return
    }

    req.auth = {
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      module: payload.module,
      sessionId: payload.sessionId,
      ipAddress: req.ip ?? req.socket.remoteAddress ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    }

    next()
  }
}

export function requireRole(role: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      sendUnauthorized(res, ERROR_CODES.UNAUTHORIZED, 'Not authenticated')
      return
    }
    const roleHierarchy: Record<string, number> = {
      user: 0,
      module_admin: 1,
      company_admin: 2,
      system_admin: 3,
    }
    const userLevel = roleHierarchy[req.auth.role] ?? -1
    const requiredLevel = roleHierarchy[role] ?? 999
    if (userLevel < requiredLevel) {
      sendForbidden(res, 'Insufficient role permissions')
      return
    }
    next()
  }
}

export function requireModule(module: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      sendUnauthorized(res, ERROR_CODES.UNAUTHORIZED, 'Not authenticated')
      return
    }
    if (
      req.auth.module !== module &&
      req.auth.module !== 'all' &&
      req.auth.role !== 'system_admin'
    ) {
      sendForbidden(res, `Access to module '${module}' not permitted`)
      return
    }
    next()
  }
}
