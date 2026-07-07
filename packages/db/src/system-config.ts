import { createDecipheriv } from 'crypto'
import { pool } from './client.js'

const ALGORITHM = 'aes-256-gcm'

function decryptValue(ciphertext: string): string {
  const key = Buffer.from(process.env['ENCRYPTION_KEY'] ?? '', 'hex')
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('invalid ciphertext format')
  const [ivHex, authTagHex, encryptedHex] = parts as [string, string, string]
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'), { authTagLength: 16 })
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(encryptedHex, 'hex')).toString('utf8') + decipher.final('utf8')
}

const ENV_FALLBACKS: Record<string, string | undefined> = {
  'smtp.host':                      process.env['SMTP_HOST'],
  'smtp.port':                      process.env['SMTP_PORT'],
  'smtp.secure':                    process.env['SMTP_SECURE'],
  'smtp.user':                      process.env['SMTP_USER'],
  'smtp.password':                  process.env['SMTP_PASSWORD'],
  'email.from_name':                process.env['EMAIL_FROM_NAME'],
  'email.from_address':             process.env['EMAIL_FROM_ADDRESS'],
  'email.reply_to':                 process.env['EMAIL_REPLY_TO'],
  'app.base_url':                   process.env['APP_BASE_URL'],
  'fx.exchange_rate_api_key':       process.env['EXCHANGE_RATE_API_KEY'],
  'fx.open_exchange_rates_app_id':  process.env['OPEN_EXCHANGE_RATES_APP_ID'],
  'storage.b2_endpoint':            process.env['B2_ENDPOINT'],
  'storage.b2_region':              process.env['B2_REGION'],
  'storage.b2_key_id':              process.env['B2_KEY_ID'],
  'storage.b2_application_key':     process.env['B2_APPLICATION_KEY'],
  'storage.b2_bucket_name':         process.env['B2_BUCKET_NAME'],
  'storage.b2_bucket_public_url':   process.env['B2_BUCKET_PUBLIC_URL'],
}

/**
 * Read a system config value from the database, falling back to the corresponding
 * environment variable if the key has not been configured in the DB.
 * Sensitive values stored in the DB are AES-256-GCM encrypted and are automatically decrypted.
 */
export async function getSystemConfig(key: string): Promise<string | null> {
  try {
    const result = await pool.query<{ value: string; is_sensitive: boolean }>(
      'SELECT value, is_sensitive FROM system_config WHERE key = $1',
      [key],
    )
    if (result.rows.length > 0) {
      const row = result.rows[0]!
      try {
        return row.is_sensitive ? decryptValue(row.value) : row.value
      } catch {
        // Decryption failed (corrupt value or rotated key) — fall through to env
      }
    }
  } catch {
    // DB unavailable or table missing — fall through to env
  }
  return ENV_FALLBACKS[key] ?? null
}
