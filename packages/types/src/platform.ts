export interface Company {
  id: string
  name: string
  legalName: string
  countryCode: string
  currencyCode: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface User {
  id: string
  email: string
  mfaEnabled: boolean
  deviceFingerprint?: string | undefined
  failedLoginAttempts: number
  lockedUntil?: Date | undefined
  lastLogin?: Date | undefined
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface UserCompanyRole {
  id: string
  userId: string
  companyId: string
  role: string
  module: string
  isActive: boolean
  createdAt: Date
}

export interface Session {
  id: string
  userId: string
  tokenHash: string
  refreshTokenHash: string
  deviceId?: string | undefined
  deviceName?: string | undefined
  platform: 'web' | 'mobile'
  ipAddress?: string | undefined
  userAgent?: string | undefined
  expiresAt: Date
  refreshExpiresAt: Date
  createdAt: Date
}

export interface AuditLogEntry {
  id: string
  userId?: string | undefined
  companyId?: string | undefined
  action: string
  tableName?: string | undefined
  recordId?: string | undefined
  oldValues?: Record<string, unknown> | undefined
  newValues?: Record<string, unknown> | undefined
  ipAddress?: string | undefined
  userAgent?: string | undefined
  createdAt: Date
}
