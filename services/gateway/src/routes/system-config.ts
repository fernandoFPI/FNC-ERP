import { Router } from 'express'
import type { IRouter, Request, Response } from 'express'
import { z } from 'zod'
import { createCipheriv, randomBytes } from 'crypto'
import { requireAuth, requireRole } from '@fnc-erp/auth'
import { pool, getSystemConfig } from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'
import { sendEmail, type SmtpConfig } from '@fnc-erp/email'

export const systemConfigRouter: IRouter = Router()
const log = logger.child({ module: 'system-config' })

const requireAdmin = [requireAuth(), requireRole('system_admin')]

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function encryptValue(plaintext: string): string {
  const key = Buffer.from(process.env['ENCRYPTION_KEY'] ?? '', 'hex')
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

interface ConfigKeyDef {
  key: string
  description: string
  is_sensitive: boolean
  envKey?: string
}

const KNOWN_KEYS: ConfigKeyDef[] = [
  { key: 'smtp.host',                    description: 'SMTP server hostname',                              is_sensitive: false, envKey: 'SMTP_HOST' },
  { key: 'smtp.port',                    description: 'SMTP server port (e.g. 465, 587)',                   is_sensitive: false, envKey: 'SMTP_PORT' },
  { key: 'smtp.secure',                  description: 'Use TLS — true or false',                            is_sensitive: false, envKey: 'SMTP_SECURE' },
  { key: 'smtp.user',                    description: 'SMTP login username',                               is_sensitive: false, envKey: 'SMTP_USER' },
  { key: 'smtp.password',               description: 'SMTP login password',                               is_sensitive: true,  envKey: 'SMTP_PASSWORD' },
  { key: 'email.from_name',             description: 'Sender display name',                               is_sensitive: false, envKey: 'EMAIL_FROM_NAME' },
  { key: 'email.from_address',          description: 'Sender email address',                              is_sensitive: false, envKey: 'EMAIL_FROM_ADDRESS' },
  { key: 'email.reply_to',             description: 'Reply-to address (optional)',                        is_sensitive: false, envKey: 'EMAIL_REPLY_TO' },
  { key: 'app.base_url',                description: 'Public app base URL (used in QR codes, email links)', is_sensitive: false, envKey: 'APP_BASE_URL' },
  { key: 'fx.exchange_rate_api_key',    description: 'ExchangeRate-API.com API key',                      is_sensitive: true,  envKey: 'EXCHANGE_RATE_API_KEY' },
  { key: 'fx.open_exchange_rates_app_id', description: 'Open Exchange Rates App ID (fallback FX source)', is_sensitive: true,  envKey: 'OPEN_EXCHANGE_RATES_APP_ID' },
  { key: 'storage.b2_endpoint',         description: 'Backblaze B2 S3-compatible endpoint URL',           is_sensitive: false, envKey: 'B2_ENDPOINT' },
  { key: 'storage.b2_region',           description: 'B2 bucket region',                                  is_sensitive: false, envKey: 'B2_REGION' },
  { key: 'storage.b2_key_id',           description: 'B2 key ID',                                         is_sensitive: true,  envKey: 'B2_KEY_ID' },
  { key: 'storage.b2_application_key',  description: 'B2 application key (secret)',                       is_sensitive: true,  envKey: 'B2_APPLICATION_KEY' },
  { key: 'storage.b2_bucket_name',      description: 'B2 bucket name',                                    is_sensitive: false, envKey: 'B2_BUCKET_NAME' },
  { key: 'storage.b2_bucket_public_url', description: 'Public CDN URL for B2 bucket (optional)',         is_sensitive: false, envKey: 'B2_BUCKET_PUBLIC_URL' },
]

const SENSITIVE_KEYS = new Set(KNOWN_KEYS.filter((k) => k.is_sensitive).map((k) => k.key))

// ── GET /api/v1/admin/system-config ──────────────────────────
systemConfigRouter.get('/', ...requireAdmin, async (_req: Request, res: Response) => {
  // Read from DB — if the table doesn't exist yet (migration not yet run),
  // fall through gracefully and show env-sourced values.
  type DbRow = { key: string; value: string; is_sensitive: boolean; description: string | null; updated_at: string }
  let dbRows: DbRow[] = []
  try {
    const dbResult = await pool.query<DbRow>(
      'SELECT key, value, is_sensitive, description, updated_at FROM system_config',
    )
    dbRows = dbResult.rows
  } catch {
    // Table may not exist yet — serve env-only values
    log.warn('system_config table not found — run migration 104 to enable DB-stored settings')
  }

  const dbMap = new Map(dbRows.map((r) => [r.key, r]))

  const entries = KNOWN_KEYS.map((def) => {
    const dbRow = dbMap.get(def.key)
    const envVal = def.envKey ? (process.env[def.envKey] ?? '') : ''

    if (dbRow) {
      return {
        key: def.key,
        value: def.is_sensitive ? '•••••' : dbRow.value,
        is_sensitive: def.is_sensitive,
        description: def.description,
        updated_at: dbRow.updated_at,
        source: 'db' as const,
        has_value: true,
      }
    }
    return {
      key: def.key,
      value: def.is_sensitive ? (envVal ? '•••••' : '') : envVal,
      is_sensitive: def.is_sensitive,
      description: def.description,
      updated_at: null,
      source: envVal ? ('env' as const) : ('unset' as const),
      has_value: Boolean(envVal),
    }
  })

  res.json({ entries })
})

const UpdateSchema = z.object({
  updates: z.array(
    z.object({
      key: z.string().min(1).max(100),
      value: z.string(),
    }),
  ).min(1).max(50),
})

// ── PUT /api/v1/admin/system-config ──────────────────────────
systemConfigRouter.put('/', ...requireAdmin, async (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    return
  }

  const userId = req.auth?.userId ?? null

  try {
    for (const { key, value } of parsed.data.updates) {
      // Skip sentinel — means the client left a sensitive field unchanged
      if (value === '•••••') continue
      // Skip empty values for unknown keys
      if (!value && !KNOWN_KEYS.find((k) => k.key === key)) continue

      const isSensitive = SENSITIVE_KEYS.has(key)
      const storedValue = isSensitive ? encryptValue(value) : value
      const def = KNOWN_KEYS.find((k) => k.key === key)

      await pool.query(
        `INSERT INTO system_config (key, value, is_sensitive, description, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, NOW(), $5)
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value,
               is_sensitive = EXCLUDED.is_sensitive,
               description = EXCLUDED.description,
               updated_at = NOW(),
               updated_by = EXCLUDED.updated_by`,
        [key, storedValue, isSensitive, def?.description ?? null, userId],
      )
    }

    log.info({ userId, keys: parsed.data.updates.map((u) => u.key) }, 'system config updated')
    res.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('system_config') && msg.includes('does not exist')) {
      res.status(503).json({ error: 'MIGRATION_PENDING', message: 'Run migration 104 first: pnpm migrate' })
      return
    }
    log.error({ err }, 'failed to update system config')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

// ── POST /api/v1/admin/system-config/test-smtp ────────────────
systemConfigRouter.post('/test-smtp', ...requireAdmin, async (req: Request, res: Response) => {
  try {
    // Get admin's email address to send the test to
    const userResult = await pool.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [req.auth!.userId],
    )
    const toEmail = userResult.rows[0]?.email
    if (!toEmail) {
      res.status(400).json({ error: 'NO_EMAIL', message: 'Your user account has no email address' })
      return
    }

    // Read SMTP config: DB first, env fallback (getSystemConfig handles both)
    const [host, portStr, secureStr, user, password, fromName, fromAddress] = await Promise.all([
      getSystemConfig('smtp.host'),
      getSystemConfig('smtp.port'),
      getSystemConfig('smtp.secure'),
      getSystemConfig('smtp.user'),
      getSystemConfig('smtp.password'),
      getSystemConfig('email.from_name'),
      getSystemConfig('email.from_address'),
    ])

    if (!host || !user || !password) {
      res.status(400).json({ error: 'SMTP_NOT_CONFIGURED', message: 'SMTP host, username and password are required' })
      return
    }

    const smtpConfig: SmtpConfig = {
      host,
      port: portStr ? parseInt(portStr, 10) : 465,
      secure: secureStr ? secureStr.toLowerCase() === 'true' : true,
      user,
      password,
    }
    if (fromName) smtpConfig.fromName = fromName
    if (fromAddress) smtpConfig.fromAddress = fromAddress

    await sendEmail(
      {
        to: toEmail,
        subject: 'FNC ERP — SMTP Test Email',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <h2 style="color:#16a34a;margin-bottom:8px">✓ SMTP is working</h2>
            <p style="color:#374151;font-size:14px;margin:0">
              This test email was sent from the FNC ERP System Configuration page.
              If you received it, your SMTP settings are correct.
            </p>
            <div style="margin-top:20px;padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:12px;color:#6b7280">
              <strong>Host:</strong> ${host}:${smtpConfig.port} (${smtpConfig.secure ? 'TLS' : 'STARTTLS'})<br/>
              <strong>User:</strong> ${user}
            </div>
          </div>
        `,
      },
      smtpConfig,
    )

    log.info({ userId: req.auth!.userId, toEmail }, 'SMTP test email sent')
    res.json({ ok: true, sentTo: toEmail })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn({ err }, 'SMTP test email failed')
    res.status(400).json({ error: 'SMTP_ERROR', message })
  }
})
