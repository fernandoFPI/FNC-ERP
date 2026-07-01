export interface JWTPayload {
  sub: string        // userId
  sessionId: string
  role: string       // system_admin | company_admin | module_admin | user
  companyId: string
  module: string
  type: string
  exp: number
  iat: number
}

export function decodeJWT(token: string): JWTPayload | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    return JSON.parse(atob(part)) as JWTPayload
  } catch {
    return null
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token)
  if (!payload) return true
  // 30-second buffer before actual expiry
  return Date.now() >= payload.exp * 1000 - 30_000
}
