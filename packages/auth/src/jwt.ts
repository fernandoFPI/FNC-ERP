import jwt from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import { env, ERROR_CODES, AUTH_CONSTANTS } from '@fnc-erp/config'
import type { JwtAccessPayload, JwtRefreshPayload, JwtMfaTempPayload } from '@fnc-erp/types'

type ExpiresIn = Exclude<SignOptions['expiresIn'], undefined>

export function signAccessToken(payload: {
  userId: string
  sessionId: string
  companyId: string
  role: string
  module: string
  impersonatedBy?: string
}): string {
  const data: Omit<JwtAccessPayload, 'sub'> & { sub: string } = {
    sub: payload.userId,
    sessionId: payload.sessionId,
    companyId: payload.companyId,
    role: payload.role,
    module: payload.module,
    type: 'access',
    ...(payload.impersonatedBy ? { impersonatedBy: payload.impersonatedBy } : {}),
  }
  return jwt.sign(data, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as ExpiresIn,
  })
}

export function signRefreshToken(payload: { userId: string; sessionId: string }): string {
  const data: Omit<JwtRefreshPayload, 'sub'> & { sub: string } = {
    sub: payload.userId,
    sessionId: payload.sessionId,
    type: 'refresh',
  }
  return jwt.sign(data, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as ExpiresIn,
  })
}

export function signMfaTempToken(userId: string): string {
  const data: Omit<JwtMfaTempPayload, 'sub'> & { sub: string } = {
    sub: userId,
    type: 'mfa_temp',
  }
  return jwt.sign(data, env.JWT_SECRET, {
    expiresIn: AUTH_CONSTANTS.MFA_TEMP_TOKEN_EXPIRES_IN as ExpiresIn,
  })
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtAccessPayload
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type')
    }
    return decoded
  } catch {
    throw Object.assign(new Error('Access token invalid or expired'), {
      code: ERROR_CODES.TOKEN_INVALID,
    })
  }
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtRefreshPayload
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type')
    }
    return decoded
  } catch {
    throw Object.assign(new Error('Refresh token invalid or expired'), {
      code: ERROR_CODES.TOKEN_EXPIRED,
    })
  }
}

export function verifyMfaTempToken(token: string): JwtMfaTempPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtMfaTempPayload
    if (decoded.type !== 'mfa_temp') {
      throw new Error('Invalid token type')
    }
    return decoded
  } catch {
    throw Object.assign(new Error('MFA temp token invalid or expired'), {
      code: ERROR_CODES.TOKEN_INVALID,
    })
  }
}

export function signDeviceTrustToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'device_trust' }, env.JWT_SECRET, { expiresIn: '30d' })
}

export function verifyDeviceTrustToken(token: string): { sub: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string; type: string }
    if (decoded.type !== 'device_trust') return null
    return decoded
  } catch {
    return null
  }
}
