import type { Request, Response, NextFunction } from 'express'
import { query } from '@fnc-erp/db'
import { HTTP_STATUS, ERROR_CODES } from '@fnc-erp/config'

/**
 * After jwtMiddleware attaches req.auth, verify the companyId in the token
 * actually matches an active role for this user. Prevents replaying tokens
 * for companies the user's access was later revoked from.
 */
export async function entityContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.auth) {
    next()
    return
  }

  try {
    const result = await query(
      `SELECT id FROM user_company_roles
       WHERE user_id = $1 AND company_id = $2 AND is_active = true
       LIMIT 1`,
      [req.auth.userId, req.auth.companyId],
    )

    if ((result.rowCount ?? 0) === 0) {
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Access to this company has been revoked',
        },
      })
      return
    }

    next()
  } catch (err) {
    console.error('[gateway] entityContext error:', err)
    next(err)
  }
}
