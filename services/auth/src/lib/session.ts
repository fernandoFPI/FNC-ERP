import { createHash } from 'crypto'
import type { PoolClient } from '@fnc-erp/db'
import { env } from '@fnc-erp/config'
import { signAccessToken, signRefreshToken } from '@fnc-erp/auth'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface CreateSessionParams {
  client: PoolClient
  userId: string
  companyId: string
  role: string
  module: string
  deviceId?: string | undefined
  deviceName?: string | undefined
  platform?: 'web' | 'mobile' | undefined
  ipAddress?: string | undefined
  userAgent?: string | undefined
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
  sessionId: string
}

export async function createSession(params: CreateSessionParams): Promise<SessionTokens> {
  const accessExpiresInMs = parseExpiry(env.JWT_ACCESS_EXPIRES_IN)
  const refreshExpiresInMs = parseExpiry(env.JWT_REFRESH_EXPIRES_IN)

  const sessionId = crypto.randomUUID()

  const accessToken = signAccessToken({
    userId: params.userId,
    sessionId,
    companyId: params.companyId,
    role: params.role,
    module: params.module,
  })
  const refreshToken = signRefreshToken({ userId: params.userId, sessionId })

  const expiresAt = new Date(Date.now() + accessExpiresInMs)
  const refreshExpiresAt = new Date(Date.now() + refreshExpiresInMs)

  await params.client.query(
    `INSERT INTO sessions
       (id, user_id, token_hash, refresh_token_hash, device_id, device_name,
        platform, ip_address, user_agent, expires_at, refresh_expires_at, company_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9, $10, $11, $12)`,
    [
      sessionId,
      params.userId,
      hashToken(accessToken),
      hashToken(refreshToken),
      params.deviceId ?? null,
      params.deviceName ?? null,
      params.platform ?? 'web',
      params.ipAddress ?? null,
      params.userAgent ?? null,
      expiresAt,
      refreshExpiresAt,
      params.companyId,
    ],
  )

  return { accessToken, refreshToken, sessionId }
}

function parseExpiry(expiry: string): number {
  const unit = expiry.slice(-1)
  const value = parseInt(expiry.slice(0, -1), 10)
  switch (unit) {
    case 's': return value * 1000
    case 'm': return value * 60 * 1000
    case 'h': return value * 60 * 60 * 1000
    case 'd': return value * 24 * 60 * 60 * 1000
    default:  return 15 * 60 * 1000
  }
}
