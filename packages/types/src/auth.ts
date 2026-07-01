export interface AuthContext {
  userId: string
  companyId: string
  role: string
  module: string
  sessionId: string
  ipAddress: string
  userAgent: string
}

export interface JwtAccessPayload {
  sub: string
  sessionId: string
  companyId: string
  role: string
  module: string
  type: 'access'
}

export interface JwtRefreshPayload {
  sub: string
  sessionId: string
  type: 'refresh'
}

export interface JwtMfaTempPayload {
  sub: string
  type: 'mfa_temp'
}

export interface LoginRequest {
  email: string
  password: string
  deviceId?: string | undefined
  deviceName?: string | undefined
  platform?: 'web' | 'mobile' | undefined
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    mfaEnabled: boolean
  }
  companies: Array<{
    id: string
    name: string
  }>
}

export interface MfaRequiredResponse {
  requiresMFA: true
  tempToken: string
}
