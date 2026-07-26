import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { createClient } from 'redis'
import { query } from '@fnc-erp/db'
import { env } from '@fnc-erp/config'
import type { AuthContext } from '@fnc-erp/types'
import { ACCESS_LEVEL_ORDER } from './registry.js'
import type { AccessLevel } from './registry.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}

const CACHE_TTL_SECONDS = 300 // 5 minutes

// ── LAZY REDIS CLIENT ─────────────────────────────────────────────────────────

let _redis: ReturnType<typeof createClient> | null = null

async function getRedis(): Promise<ReturnType<typeof createClient>> {
  if (!_redis) {
    _redis = createClient({
      url: env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
      },
    })
    _redis.on('error', (err) => {
      console.error('[permissions] Redis error', err)
    })
    await _redis.connect()
  }
  return _redis
}

// ── TYPES ─────────────────────────────────────────────────────────────────────

export type UserPermissions = Record<string, AccessLevel>

// ── CACHE HELPERS ─────────────────────────────────────────────────────────────

function cacheKey(userId: string, companyId: string): string {
  return `perms:${companyId}:${userId}`
}

export async function loadPermissions(userId: string, companyId: string): Promise<UserPermissions> {
  const redis = await getRedis()
  const cached = await redis.get(cacheKey(userId, companyId)).catch(() => null)

  if (cached) {
    return JSON.parse(cached) as UserPermissions
  }

  const result = await query<{ permission_key: string; access_level: string }>(
    `SELECT permission_key, access_level
     FROM user_permissions
     WHERE user_id = $1 AND company_id = $2`,
    [userId, companyId],
  )

  const perms: UserPermissions = {}
  for (const row of result.rows) {
    perms[row.permission_key] = row.access_level as AccessLevel
  }

  await redis
    .setEx(cacheKey(userId, companyId), CACHE_TTL_SECONDS, JSON.stringify(perms))
    .catch(() => undefined)

  return perms
}

export async function invalidatePermissionCache(userId: string, companyId: string): Promise<void> {
  const redis = await getRedis()
  await redis.del(cacheKey(userId, companyId)).catch(() => undefined)
}

// ── LEVEL COMPARISON ──────────────────────────────────────────────────────────

export function meetsLevel(actual: AccessLevel | undefined, required: AccessLevel): boolean {
  const actualOrder = ACCESS_LEVEL_ORDER[actual ?? 'none'] ?? 0
  const requiredOrder = ACCESS_LEVEL_ORDER[required]
  return actualOrder >= requiredOrder
}

// ── MIDDLEWARE FACTORY ────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      permissionLevel?: AccessLevel
    }
  }
}

export function requirePermission(
  permissionKey: string,
  requiredLevel: AccessLevel,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } })
      return
    }

    // system_admin and company_admin bypass permission checks
    if (req.auth.role === 'system_admin' || req.auth.role === 'company_admin') {
      req.permissionLevel = 'admin'
      next()
      return
    }

    const perms = await loadPermissions(req.auth.userId, req.auth.companyId).catch(
      () => ({}) as UserPermissions,
    )
    const actual = perms[permissionKey]

    if (!meetsLevel(actual, requiredLevel)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Requires '${requiredLevel}' access to '${permissionKey}'`,
        },
      })
      return
    }

    req.permissionLevel = actual
    next()
  }
}
