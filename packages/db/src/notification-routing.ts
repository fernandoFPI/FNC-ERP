import { pool } from './client.js'

export const NOTIFICATION_ROUTES = [
  {
    key: 'email.payslip',
    label: 'Payslip delivery',
    description: 'Email payslips with PDF attachments to employees when a payroll run is processed',
  },
  {
    key: 'email.project_invoice',
    label: 'Project invoice delivery',
    description: 'Email invoices with PDF attachments to clients when a project invoice is issued',
  },
  {
    key: 'email.po_confirmation',
    label: 'PO confirmation to vendor',
    description: 'Email purchase order PDFs to vendors when a PO is approved',
  },
  {
    key: 'email.fx_sync_failed',
    label: 'FX sync failure alert',
    description: 'Email system admins when the automated FX rate sync job fails',
  },
  {
    key: 'email.maintenance_overdue',
    label: 'Maintenance overdue alert',
    description: 'Email rental module admins when equipment maintenance becomes overdue',
  },
  {
    key: 'email.dlq_alert',
    label: 'Dead letter queue alert',
    description:
      'Email system admins when a critical or high-priority outbox event exhausts all retries',
  },
] as const

export type NotificationRouteKey = (typeof NOTIFICATION_ROUTES)[number]['key']

// ── In-memory cache refreshed every 5 minutes ─────────────────
// Avoids a DB round-trip on every email decision. Defaults to true
// (email enabled) if the table is missing or key is unconfigured.
let _cache = new Map<string, boolean>()
let _cacheAt = 0
const CACHE_TTL_MS = 300_000

async function refreshCache(): Promise<void> {
  try {
    const result = await pool.query<{ key: string; email_enabled: boolean }>(
      `SELECT key, email_enabled FROM notification_routing`,
    )
    _cache = new Map(result.rows.map((r) => [r.key, r.email_enabled]))
    _cacheAt = Date.now()
  } catch {
    // Table missing (migration not run) or DB unavailable — leave cache stale
  }
}

export async function isEmailEnabled(key: string): Promise<boolean> {
  if (Date.now() - _cacheAt > CACHE_TTL_MS) {
    await refreshCache()
  }
  // Default true: an unconfigured key means the email is enabled
  return _cache.get(key) ?? true
}

export interface RoutingEntry {
  key: string
  email_enabled: boolean
  description: string | null
  updated_at: string | null
}

export async function listNotificationRouting(): Promise<RoutingEntry[]> {
  const result = await pool.query<RoutingEntry>(
    `SELECT key, email_enabled, description, updated_at FROM notification_routing ORDER BY key`,
  )
  return result.rows
}

export async function setNotificationRouting(
  key: string,
  emailEnabled: boolean,
  description: string | null,
  updatedBy: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO notification_routing (key, email_enabled, description, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET
       email_enabled = EXCLUDED.email_enabled,
       description   = COALESCE(EXCLUDED.description, notification_routing.description),
       updated_by    = EXCLUDED.updated_by,
       updated_at    = NOW()`,
    [key, emailEnabled, description, updatedBy],
  )
  // Invalidate cache so next call reflects the change within the TTL window
  _cacheAt = 0
}
