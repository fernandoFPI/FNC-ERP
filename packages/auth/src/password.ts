import bcrypt from 'bcrypt'
import { AUTH_CONSTANTS } from '@fnc-erp/config'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, AUTH_CONSTANTS.BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export interface PasswordStrengthResult {
  valid: boolean
  reason?: string
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long' }
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one uppercase letter' }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one number' }
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one special character' }
  }
  return { valid: true }
}
