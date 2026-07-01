import { authenticator } from 'otplib'

authenticator.options = { window: 1 }

export interface MFASetupResult {
  secret: string
  otpauthUrl: string
}

export function generateMFASecret(email: string, issuer = 'FNC ERP'): MFASetupResult {
  const secret = authenticator.generateSecret()
  const otpauthUrl = authenticator.keyuri(email, issuer, secret)
  return { secret, otpauthUrl }
}

export function verifyMFAToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret })
  } catch {
    return false
  }
}
