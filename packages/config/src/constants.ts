export const COMPANIES = {
  YAKAM: 'nishtimani-yakam',
  FACTORY: 'nishtimani-factory',
  WATANYIA: 'al-watanyia',
} as const

export type CompanySlug = (typeof COMPANIES)[keyof typeof COMPANIES]

export const ROLES = {
  SYSTEM_ADMIN: 'system_admin',
  COMPANY_ADMIN: 'company_admin',
  MODULE_ADMIN: 'module_admin',
  USER: 'user',
} as const

export type RoleSlug = (typeof ROLES)[keyof typeof ROLES]

export const MODULES = {
  FINANCE: 'finance',
  PROCUREMENT: 'procurement',
  HR: 'hr',
  INVENTORY: 'inventory',
  PROJECTS: 'projects',
  MANUFACTURING: 'manufacturing',
  ADMIN: 'admin',
  ALL: 'all',
} as const

export type ModuleSlug = (typeof MODULES)[keyof typeof MODULES]

export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  MFA_SETUP: 'MFA_SETUP',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_VERIFIED: 'MFA_VERIFIED',
  COMPANY_SWITCH: 'COMPANY_SWITCH',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

export const AUTH_CONSTANTS = {
  MAX_FAILED_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 30,
  MFA_TEMP_TOKEN_EXPIRES_IN: '5m',
  BCRYPT_ROUNDS: 12,
} as const

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_INVALID: 'MFA_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// Iraqi withholding tax rates per transaction type
export const WITHHOLDING_TAX_RATES = {
  SERVICES_DOMESTIC:  0.03,
  SERVICES_FOREIGN:   0.15,
  CONSTRUCTION:       0.02,
  EQUIPMENT_RENTAL:   0.05,
  PROFESSIONAL_FEES:  0.05,
} as const

export const FUNCTIONAL_CURRENCY = 'IQD' as const
export const SUPPORTED_CURRENCIES = ['IQD', 'USD', 'EUR', 'GBP'] as const
