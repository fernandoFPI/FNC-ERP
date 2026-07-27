import { pool, getSystemConfig, isEmailEnabled } from '@fnc-erp/db'
import { env } from '@fnc-erp/config'
import { logger } from '@fnc-erp/logger'
import QRCode from 'qrcode'
import { renderHTMLToPDF, renderPayslip, renderInvoice, renderPurchaseOrder } from '@fnc-erp/pdf'
import type { PayslipData, InvoiceData, POData } from '@fnc-erp/pdf'
import type { SmtpConfig } from '@fnc-erp/email'
import {
  sendEmail as _sendEmail,
  renderPayslipEmail,
  renderInvoiceEmail,
  renderPOConfirmationEmail,
  renderPasswordResetEmail,
  renderPasswordChangedEmail,
  renderMFASetupEmail,
  renderNewDeviceLoginEmail,
} from '@fnc-erp/email'
import { uploadBuffer } from '@fnc-erp/storage'
import {
  handleIntercoStockMoveDetected,
  executeIntercoStockTransfer,
} from './interco-stock-transfer.js'

const log = logger.child({ module: 'outbox-processor' })

// ── SMTP CONFIG CACHE ─────────────────────────────────────────
// Refreshed from system_config every 5 minutes so SMTP credential changes
// in the admin UI take effect without restarting the worker.
let _smtpCache: SmtpConfig | null = null
let _smtpCacheAt = 0
const SMTP_TTL_MS = 300_000

async function getSmtpConfigForSend(): Promise<SmtpConfig | null> {
  if (_smtpCache && Date.now() - _smtpCacheAt < SMTP_TTL_MS) return _smtpCache
  try {
    const [host, portStr, secureStr, user, password, fromName, fromAddress, replyTo] =
      await Promise.all([
        getSystemConfig('smtp.host'),
        getSystemConfig('smtp.port'),
        getSystemConfig('smtp.secure'),
        getSystemConfig('smtp.user'),
        getSystemConfig('smtp.password'),
        getSystemConfig('email.from_name'),
        getSystemConfig('email.from_address'),
        getSystemConfig('email.reply_to'),
      ])
    if (host && user && password) {
      const config: SmtpConfig = {
        host,
        port: portStr ? parseInt(portStr, 10) : 465,
        secure: secureStr ? secureStr.toLowerCase() === 'true' : true,
        user,
        password,
      }
      if (fromName) config.fromName = fromName
      if (fromAddress) config.fromAddress = fromAddress
      if (replyTo) config.replyTo = replyTo
      _smtpCache = config
      _smtpCacheAt = Date.now()
      return _smtpCache
    }
  } catch (err) {
    log.warn({ err }, 'failed to load SMTP config from DB — using env fallback')
  }
  _smtpCache = null
  return null
}

async function sendEmail(
  ...args: Parameters<typeof _sendEmail>
): Promise<void> {
  const smtpConfig = await getSmtpConfigForSend()
  await _sendEmail(args[0], smtpConfig)
}

// ── TYPES ─────────────────────────────────────────────────────
interface OutboxRow {
  id: string
  service: string
  event_type: string
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
  last_error: string | null
  error_history: Array<{ attempt: number; error: string; at: string }>
  first_attempted_at: string | null
  created_at: string
  event_priority: string
}

interface StockMovePayload {
  company_id: string
  product_id: string
  warehouse_location_id: string
  qty: number
  unit_cost: number
  currency_code: string
  source_type: string
  source_id: string
  moved_by: string
}

// ── EVENT CONFIG CACHE ────────────────────────────────────────
// Loaded from outbox_event_configs at startup, refreshed every 5 minutes.
// Avoids a DB roundtrip on every processing loop tick.
interface EventConfig {
  maxAttempts: number
  initialRetryDelaySeconds: number
  backoffMultiplier: number
  maxRetryDelaySeconds: number
  dlqPriority: 'critical' | 'high' | 'normal' | 'low'
  alertOnDlq: boolean
}

const DEFAULT_CONFIG: EventConfig = {
  maxAttempts: 5,
  initialRetryDelaySeconds: 5,
  backoffMultiplier: 2,
  maxRetryDelaySeconds: 3600,
  dlqPriority: 'normal',
  alertOnDlq: false,
}

let eventConfigCache = new Map<string, EventConfig>()
let configLoadedAt: Date | null = null
const CONFIG_TTL_MS = 300_000 // 5 minutes

async function getEventConfig(eventType: string): Promise<EventConfig> {
  const now = new Date()
  if (!configLoadedAt || now.getTime() - configLoadedAt.getTime() > CONFIG_TTL_MS) {
    await refreshEventConfigCache()
  }
  return eventConfigCache.get(eventType) ?? DEFAULT_CONFIG
}

async function refreshEventConfigCache(): Promise<void> {
  try {
    const result = await pool.query<{
      event_type: string
      max_attempts: number
      initial_retry_delay_seconds: number
      backoff_multiplier: string
      max_retry_delay_seconds: number
      dlq_priority: string
      alert_on_dlq: boolean
    }>(`
      SELECT event_type, max_attempts, initial_retry_delay_seconds,
             backoff_multiplier, max_retry_delay_seconds,
             dlq_priority, alert_on_dlq
      FROM outbox_event_configs
    `)
    eventConfigCache = new Map(
      result.rows.map((r) => [
        r.event_type,
        {
          maxAttempts: r.max_attempts,
          initialRetryDelaySeconds: r.initial_retry_delay_seconds,
          backoffMultiplier: parseFloat(String(r.backoff_multiplier)),
          maxRetryDelaySeconds: r.max_retry_delay_seconds,
          dlqPriority: r.dlq_priority as EventConfig['dlqPriority'],
          alertOnDlq: r.alert_on_dlq,
        },
      ]),
    )
    configLoadedAt = new Date()
    log.debug({ configCount: eventConfigCache.size }, 'event config cache refreshed')
  } catch (err) {
    log.error({ err }, 'failed to refresh event config cache — using defaults')
  }
}

// Exported so tests can inject mock configs without hitting DB
export function setEventConfigCacheForTest(configs: Map<string, EventConfig>): void {
  eventConfigCache = configs
  configLoadedAt = new Date()
}

// ── RETRY DELAY ───────────────────────────────────────────────
// Exponential backoff with up to 20% random jitter.
// Jitter prevents thundering-herd when multiple events fail simultaneously.
export function calculateNextRetryDelay(attempts: number, config: EventConfig): number {
  const base = config.initialRetryDelaySeconds * Math.pow(config.backoffMultiplier, attempts)
  const capped = Math.min(base, config.maxRetryDelaySeconds)
  const jitter = capped * 0.2 * Math.random()
  return Math.floor(capped + jitter)
}

// ── CIRCUIT BREAKER ───────────────────────────────────────────
// After CIRCUIT_FAILURE_THRESHOLD failures within CIRCUIT_FAILURE_WINDOW_MS,
// the circuit opens and that service's events are skipped for CIRCUIT_OPEN_DURATION_MS.
// Each service has its own independent breaker.
interface CircuitState {
  failures: number
  lastFailureAt: Date | null
  openUntil: Date | null
}

const CIRCUIT_FAILURE_THRESHOLD = 5
const CIRCUIT_FAILURE_WINDOW_MS = 60_000   // 1 minute
const CIRCUIT_OPEN_DURATION_MS = 120_000   // 2 minutes

const circuitBreakers = new Map<string, CircuitState>()

export function isCircuitOpen(service: string): boolean {
  const circuit = circuitBreakers.get(service)
  if (!circuit?.openUntil) return false
  if (new Date() > circuit.openUntil) {
    circuitBreakers.set(service, { failures: 0, lastFailureAt: null, openUntil: null })
    log.info({ service }, 'circuit breaker reset — resuming event processing')
    return false
  }
  return true
}

export function recordCircuitFailure(service: string): void {
  const circuit = circuitBreakers.get(service) ?? {
    failures: 0,
    lastFailureAt: null,
    openUntil: null,
  }

  if (circuit.lastFailureAt) {
    const elapsed = Date.now() - circuit.lastFailureAt.getTime()
    if (elapsed > CIRCUIT_FAILURE_WINDOW_MS) {
      circuit.failures = 0
    }
  }

  circuit.failures++
  circuit.lastFailureAt = new Date()

  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.openUntil = new Date(Date.now() + CIRCUIT_OPEN_DURATION_MS)
    log.warn(
      { service, failures: circuit.failures, openUntil: circuit.openUntil },
      'circuit breaker opened — pausing event processing for service',
    )
  }

  circuitBreakers.set(service, circuit)
}

export function recordCircuitSuccess(service: string): void {
  const circuit = circuitBreakers.get(service)
  if (circuit) {
    circuit.failures = 0
    circuit.lastFailureAt = null
    circuitBreakers.set(service, circuit)
  }
}

// Exported so tests can inspect and reset breakers
export function getCircuitBreakers(): Map<string, CircuitState> {
  return circuitBreakers
}

export function resetCircuitBreaker(service: string): void {
  circuitBreakers.delete(service)
}

// ── DEAD LETTER QUEUE ─────────────────────────────────────────
async function routeToDLQ(event: OutboxRow, config: EventConfig): Promise<void> {
  log.error(
    {
      eventId: event.id,
      eventType: event.event_type,
      service: event.service,
      attempts: event.attempts,
      priority: config.dlqPriority,
      lastError: event.last_error,
    },
    'routing event to dead letter queue',
  )

  await pool.query(
    `INSERT INTO outbox_dead_letters
       (original_outbox_id, service, event_type, payload,
        total_attempts, first_attempted_at, last_attempted_at,
        last_error, error_history, priority, status)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8::jsonb,$9,'pending')`,
    [
      event.id,
      event.service,
      event.event_type,
      JSON.stringify(event.payload),
      event.attempts,
      event.first_attempted_at ?? event.created_at,
      event.last_error ?? 'Unknown error',
      JSON.stringify(event.error_history ?? []),
      config.dlqPriority,
    ],
  )

  // Mark original event as permanently failed (not retried again)
  await pool.query(
    `UPDATE service_outbox SET status='failed' WHERE id=$1`,
    [event.id],
  )

  if (config.alertOnDlq) {
    await alertSystemAdminsOfDLQEntry(event, config)
  }
}

async function alertSystemAdminsOfDLQEntry(
  event: OutboxRow,
  config: EventConfig,
): Promise<void> {
  try {
    const admins = await pool.query<{ id: string; email: string; company_id: string }>(
      `SELECT DISTINCT u.id, u.email, ucr.company_id
       FROM users u
       JOIN user_company_roles ucr ON ucr.user_id = u.id
       WHERE ucr.role = 'system_admin'
         AND u.is_active = true
         AND u.email IS NOT NULL`,
    )

    const priorityLabel = config.dlqPriority.toUpperCase()
    const subject = `[${priorityLabel}] FNC ERP — Outbox event failed: ${event.event_type}`

    for (const admin of admins.rows) {
      // In-app notification (best-effort)
      await pool
        .query(
          `INSERT INTO notifications
             (user_id, company_id, type, title, body, data, push_sent)
           VALUES ($1,$2,'OUTBOX_DLQ_ALERT',$3,$4,$5::jsonb,false)`,
          [
            admin.id,
            admin.company_id,
            `${priorityLabel}: Outbox event failed`,
            `Event: ${event.event_type}\nAttempts: ${event.attempts}\nError: ${String(event.last_error ?? '').substring(0, 200)}`,
            JSON.stringify({
              event_id: event.id,
              event_type: event.event_type,
              priority: config.dlqPriority,
            }),
          ],
        )
        .catch((err: unknown) =>
          log.error({ err, adminId: admin.id }, 'failed to insert DLQ in-app notification'),
        )

      // Email only for critical and high, and only if routing allows
      if ((config.dlqPriority === 'critical' || config.dlqPriority === 'high') && await isEmailEnabled('email.dlq_alert')) {
        const criticalNote =
          config.dlqPriority === 'critical'
            ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 16px;margin-top:16px">
                 <p style="font-size:13px;color:#dc2626;margin:0;font-weight:600">
                   This is a financial integrity event. Failure to resolve this may result
                   in accounting discrepancies. Review and resolve immediately.
                 </p>
               </div>`
            : ''

        await sendEmail({
          to: admin.email,
          subject,
          html: `
            <div style="font-family:Arial;max-width:600px;margin:0 auto">
              <div style="background:#dc2626;color:white;padding:16px 24px">
                <h1 style="margin:0;font-size:18px">
                  &#9888; ${priorityLabel} &#8212; Outbox Event Failed
                </h1>
              </div>
              <div style="padding:24px;background:white">
                <p style="font-size:14px;color:#374151">
                  A <strong>${config.dlqPriority} priority</strong> outbox event has
                  exhausted all retry attempts and requires immediate attention.
                </p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0">
                  <tr style="background:#f9fafb">
                    <td style="padding:8px 12px;font-size:12px;color:#6b7280;width:40%">Event type</td>
                    <td style="padding:8px 12px;font-size:13px;font-weight:600">${event.event_type}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 12px;font-size:12px;color:#6b7280">Service</td>
                    <td style="padding:8px 12px;font-size:13px">${event.service}</td>
                  </tr>
                  <tr style="background:#f9fafb">
                    <td style="padding:8px 12px;font-size:12px;color:#6b7280">Total attempts</td>
                    <td style="padding:8px 12px;font-size:13px">${event.attempts}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 12px;font-size:12px;color:#6b7280">Last error</td>
                    <td style="padding:8px 12px;font-size:13px;color:#dc2626">
                      ${String(event.last_error ?? 'Unknown').substring(0, 300)}
                    </td>
                  </tr>
                  <tr style="background:#f9fafb">
                    <td style="padding:8px 12px;font-size:12px;color:#6b7280">Event ID</td>
                    <td style="padding:8px 12px;font-size:11px;font-family:monospace">${event.id}</td>
                  </tr>
                </table>
                <p style="font-size:13px;color:#374151">
                  Log in to FNC ERP and navigate to
                  <strong>Admin &#8594; Outbox Monitor</strong> to inspect and retry.
                </p>
                ${criticalNote}
              </div>
            </div>
          `,
        }).catch((err: unknown) =>
          log.error({ err, adminEmail: admin.email }, 'failed to send DLQ alert email'),
        )
      }
    }
  } catch (err) {
    // Never let alert failure break the DLQ routing
    log.error({ err, eventId: event.id }, 'failed to alert admins of DLQ entry')
  }
}

// ── MAIN PROCESSING LOOP ──────────────────────────────────────
export async function processOutbox(): Promise<number> {
  const client = await pool.connect()
  let events: OutboxRow[] = []

  try {
    await client.query('BEGIN')

    const result = await client.query<OutboxRow>(`
      SELECT id, service, event_type, payload, attempts, max_attempts,
             last_error, error_history, first_attempted_at, created_at, event_priority
      FROM service_outbox
      WHERE status IN ('pending','failed')
        AND attempts < max_attempts
        AND next_retry_at <= NOW()
      ORDER BY
        CASE event_priority
          WHEN 'critical' THEN 1
          WHEN 'high'     THEN 2
          WHEN 'normal'   THEN 3
          WHEN 'low'      THEN 4
          ELSE 5
        END,
        created_at ASC
      LIMIT 20
      FOR UPDATE SKIP LOCKED
    `)

    events = result.rows
    if (events.length === 0) {
      await client.query('ROLLBACK')
      return 0
    }

    // Mark all as processing and record first_attempted_at before releasing lock
    for (const event of events) {
      await client.query(
        `UPDATE service_outbox
         SET status='processing',
             attempts = attempts + 1,
             first_attempted_at = COALESCE(first_attempted_at, NOW())
         WHERE id=$1`,
        [event.id],
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch { /* ignore */ }
    log.error({ err }, 'outbox processor lock/batch error')
    client.release()
    return 0
  } finally {
    client.release()
  }

  log.debug({ count: events.length }, 'processing outbox batch')
  const batchSize = events.length

  for (const event of events) {
    if (isCircuitOpen(event.service)) {
      log.debug(
        { service: event.service, eventId: event.id },
        'circuit open — skipping event',
      )
      // Reset to pending so it's not stuck in processing
      await pool.query(
        `UPDATE service_outbox SET status='pending', attempts=attempts-1 WHERE id=$1`,
        [event.id],
      )
      continue
    }

    const config = await getEventConfig(event.event_type)
    const updatedAttempts = event.attempts + 1

    try {
      await deliverEvent(event)

      await pool.query(
        `UPDATE service_outbox SET status='delivered', processed_at=NOW() WHERE id=$1`,
        [event.id],
      )

      recordCircuitSuccess(event.service)
      log.info(
        { eventId: event.id, eventType: event.event_type, attempts: updatedAttempts },
        'outbox event delivered',
      )
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      const errorHistory = [
        ...(event.error_history ?? []),
        {
          attempt: updatedAttempts,
          error: errorMessage.substring(0, 500),
          at: new Date().toISOString(),
        },
      ]

      recordCircuitFailure(event.service)

      const hasExhaustedRetries = updatedAttempts >= config.maxAttempts

      if (hasExhaustedRetries) {
        const failedEvent: OutboxRow = {
          ...event,
          attempts: updatedAttempts,
          last_error: errorMessage,
          error_history: errorHistory,
        }
        await routeToDLQ(failedEvent, config)
      } else {
        const retryDelaySecs = calculateNextRetryDelay(updatedAttempts, config)
        const nextRetryAt = new Date(Date.now() + retryDelaySecs * 1000)

        await pool.query(
          `UPDATE service_outbox
           SET status='failed',
               last_error=$1,
               error_history=$2::jsonb,
               next_retry_at=$3
           WHERE id=$4`,
          [
            errorMessage.substring(0, 1000),
            JSON.stringify(errorHistory),
            nextRetryAt,
            event.id,
          ],
        )

        log.warn(
          {
            eventId: event.id,
            eventType: event.event_type,
            attempt: updatedAttempts,
            maxAttempts: config.maxAttempts,
            nextRetryAt,
            retryDelaySecs,
            error: errorMessage.substring(0, 200),
          },
          'outbox event failed — scheduled for retry',
        )
      }
    }
  }
  return batchSize
}

// ── EVENT DELIVERY ────────────────────────────────────────────
async function deliverEvent(event: OutboxRow): Promise<void> {
  switch (event.service) {
    case 'inventory':
      await deliverToInventory(event)
      break
    case 'finance':
      await deliverToFinance(event)
      break
    case 'reporting':
      await deliverToReporting(event)
      break
    case 'interco':
      await deliverToInterco(event)
      break
    case 'notifications':
      await deliverToNotifications(event)
      break
    case 'worker':
      await deliverToWorker(event)
      break
    default:
      throw new Error(`Unknown outbox target service: ${event.service}`)
  }
}

// ── Inventory ─────────────────────────────────────────────────
async function deliverToInventory(event: OutboxRow): Promise<void> {
  if (event.event_type !== 'STOCK_MOVE_REQUESTED') return

  const p = event.payload as unknown as StockMovePayload

  const locResult = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id = $1 AND type = 'virtual_in' LIMIT 1`,
    [p.company_id],
  )
  const fromLocationId = locResult.rows[0]?.id
  if (!fromLocationId) {
    throw new Error(`No virtual_in location found for company ${p.company_id}`)
  }

  const response = await fetch(`${env.INVENTORY_SERVICE_URL}/inventory/moves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SERVICE_TOKEN}`,
      'x-user-id': p.moved_by,
      'x-company-id': p.company_id,
      'x-role': 'admin',
      'x-module': 'all',
      'x-session-id': 'worker',
    },
    body: JSON.stringify({
      product_id: p.product_id,
      from_location_id: fromLocationId,
      to_location_id: p.warehouse_location_id,
      qty: p.qty,
      unit_cost: p.unit_cost,
      currency_code: p.currency_code,
      source_type: p.source_type,
      source_id: p.source_id,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Inventory service returned ${String(response.status)}: ${text}`)
  }
}

// ── Finance ───────────────────────────────────────────────────
interface InvoiceJournalPayload {
  company_id: string
  invoice_id: string
  gross_total: string | number
  retention_amount: string | number
  net_payable: string | number
  currency_code: string
  invoice_date: string
}

interface PaymentJournalPayload {
  company_id: string
  invoice_id: string
  amount: string | number
  currency_code: string
  payment_date: string
  wht_applies?: boolean
  wht_scenario?: string | null
  wht_amount?: string | number
}

interface VendorInvoiceJournalPayload {
  invoice_id: string
  company_id: string
  vendor_id: string
  total_amount: string | number
  currency_code: string
  invoice_date: string
}

interface VendorPaymentJournalPayload {
  paymentId: string
  netPayable?: number
  invoiceId: string
  vendorId: string
  poIds?: string[]
  amount: string | number
  whtApplies?: boolean
  whtAmount?: string | number
  currencyCode: string
  paymentDate: string
  companyId: string
  isFullyPaid?: boolean
}

async function deliverToFinance(event: OutboxRow): Promise<void> {
  switch (event.event_type) {
    case 'PROJECT_INVOICE_JOURNAL_REQUESTED':
      await createInvoiceJournal(event.payload as unknown as InvoiceJournalPayload)
      break
    case 'INVOICE_PAYMENT_JOURNAL_REQUESTED':
      await createPaymentJournal(event.payload as unknown as PaymentJournalPayload)
      break
    case 'VENDOR_INVOICE_JOURNAL_REQUESTED':
      await createVendorInvoiceJournal(event.payload as unknown as VendorInvoiceJournalPayload)
      break
    case 'VENDOR_PAYMENT_JOURNAL_REQUESTED':
      await createVendorPaymentJournal(event.payload as unknown as VendorPaymentJournalPayload)
      break
    case 'MO_JOURNAL_REQUESTED':
      await createMOJournal(event.payload as unknown as MOJournalPayload)
      break
    case 'RENTAL_INVOICE_JOURNAL_REQUESTED':
      await createRentalInvoiceJournal(event.payload as unknown as RentalInvoiceJournalPayload)
      break
    case 'PAYROLL_JOURNAL_REQUESTED':
      await createPayrollJournal(event.payload as unknown as PayrollJournalPayload)
      break
    default:
      throw new Error(`Unknown finance event: ${event.event_type}`)
  }
}

async function createInvoiceJournal(p: InvoiceJournalPayload): Promise<void> {
  const grossTotal = parseFloat(String(p.gross_total))
  const retentionAmount = parseFloat(String(p.retention_amount))
  const netPayable = parseFloat(String(p.net_payable))

  const accounts = await pool.query<{ id: string; code: string }>(
    `SELECT id, code FROM chart_of_accounts WHERE company_id=$1 AND is_active=true
     AND (code LIKE '12%' OR code LIKE '22%' OR code LIKE '41%') ORDER BY code`,
    [p.company_id],
  )

  const arAccount = accounts.rows.find((a) => a['code'].startsWith('12'))
  const retentionAccount = accounts.rows.find((a) => a['code'].startsWith('22'))
  const revenueAccount = accounts.rows.find((a) => a['code'].startsWith('41'))
  if (!arAccount || !revenueAccount) {
    throw new Error(`Missing required GL accounts for company ${p.company_id}`)
  }

  // Look up project's analytic account to tag on revenue line
  const invRes = await pool.query<{ analytic_account_id: string | null; invoice_number: string }>(
    `SELECT p.analytic_account_id, pi.invoice_number
     FROM project_invoices pi
     JOIN projects p ON p.id = pi.project_id
     WHERE pi.id = $1`,
    [p.invoice_id],
  )
  const analyticAccountId = invRes.rows[0]?.['analytic_account_id'] ?? null
  const invoiceNumber = invRes.rows[0]?.['invoice_number'] ?? p.invoice_id

  // FX conversion to company base currency (IQD)
  let fxRate = 1.0
  if (p.currency_code !== 'IQD') {
    const fxRes = await pool.query<{ rate: string }>(
      `SELECT rate FROM fx_rates WHERE from_currency=$1 AND to_currency='IQD' ORDER BY rate_date DESC LIMIT 1`,
      [p.currency_code],
    )
    fxRate = fxRes.rows[0] ? parseFloat(String(fxRes.rows[0]['rate'])) : 1.0
  }

  const createdBy = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)
  const userId = createdBy.rows[0]?.['id'] ?? ''

  const jeResult = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, source_id, created_by)
     VALUES ($1,$2,'Project invoice',CURRENT_DATE,'posted','project_invoice',$3,$4) RETURNING id`,
    [p.company_id, invoiceNumber, p.invoice_id, userId],
  )
  const jeId = jeResult.rows[0]!['id']

  // DR: Accounts Receivable (no analytic tag — AR is not a project cost/revenue)
  if (netPayable > 0) {
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
       VALUES ($1,$2,$3,0,$4,$5,ROUND($3*$5,4))`,
      [jeId, arAccount['id'], netPayable, p.currency_code, fxRate],
    )
  }
  if (retentionAmount > 0 && retentionAccount) {
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
       VALUES ($1,$2,$3,0,$4,$5,ROUND($3*$5,4))`,
      [jeId, retentionAccount['id'], retentionAmount, p.currency_code, fxRate],
    )
  }
  // CR: Revenue — tag with project analytic account so it shows up in project journal
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, analytic_account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
     VALUES ($1,$2,$3,0,$4,$5,$6,ROUND($4*$6,4))`,
    [jeId, revenueAccount['id'], analyticAccountId, grossTotal, p.currency_code, fxRate],
  )

  await pool.query(`UPDATE project_invoices SET journal_entry_id=$1 WHERE id=$2`, [jeId, p.invoice_id])
  log.info({ jeId, invoiceId: p.invoice_id }, 'invoice GL journal created')
}

async function createPaymentJournal(p: PaymentJournalPayload): Promise<void> {
  const cashAmount = parseFloat(String(p.amount))
  const whtAmount  = p.wht_applies ? parseFloat(String(p.wht_amount ?? 0)) : 0
  const arCredit   = cashAmount + whtAmount  // total AR cleared = cash + WHT portion

  const accounts = await pool.query<{ id: string; code: string }>(
    `SELECT id, code FROM chart_of_accounts WHERE company_id=$1 AND is_active=true
     AND (code LIKE '11%' OR code LIKE '12%' OR code LIKE '13%'
          OR code LIKE '23%' OR code LIKE '61%') ORDER BY code`,
    [p.company_id],
  )
  const cashAccount    = accounts.rows.find((a) => a['code'].startsWith('11'))
  const arAccount      = accounts.rows.find((a) => a['code'].startsWith('12'))
  const whtRecoverable = accounts.rows.find((a) => a['code'] === '1390')
  const whtPayable     = accounts.rows.find((a) => a['code'] === '2390')
  const whtExpense     = accounts.rows.find((a) => a['code'] === '6100')
  if (!cashAccount || !arAccount) {
    throw new Error(`Missing cash/AR accounts for company ${p.company_id}`)
  }

  const createdBy = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)
  const userId = createdBy.rows[0]?.['id'] ?? ''

  const jeResult = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, source_id, created_by)
     VALUES ($1,'PAY-' || LEFT($2::text,8),'Invoice payment',$3,'posted','invoice_payment',$2::uuid,$4) RETURNING id`,
    [p.company_id, p.invoice_id, p.payment_date, userId],
  )
  const jeId = jeResult.rows[0]!['id']

  if (!p.wht_applies || whtAmount === 0) {
    // Simple: Dr Cash / Cr AR
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
       VALUES ($1,$2,$3,0,$4,$3), ($1,$5,0,$3,$4,$3)`,
      [jeId, cashAccount['id'], cashAmount, p.currency_code, arAccount['id']],
    )
  } else if (p.wht_scenario === 'client_withholds' && whtRecoverable) {
    // Scenario A: Dr Cash + Dr WHT Recoverable / Cr AR (full gross)
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
       VALUES ($1,$2,$3,0,$4,$3), ($1,$5,$6,0,$4,$6), ($1,$7,0,$8,$4,$8)`,
      [jeId, cashAccount['id'], cashAmount, p.currency_code,
       whtRecoverable['id'], whtAmount, arAccount['id'], arCredit],
    )
  } else if (p.wht_scenario === 'fnc_pays' && whtPayable && whtExpense) {
    // Scenario B: Dr Cash / Cr AR, AND Dr WHT Expense / Cr WHT Payable
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
       VALUES ($1,$2,$3,0,$4,$3), ($1,$5,0,$3,$4,$3),
              ($1,$6,$7,0,$4,$7), ($1,$8,0,$7,$4,$7)`,
      [jeId, cashAccount['id'], cashAmount, p.currency_code,
       arAccount['id'], whtExpense['id'], whtAmount, whtPayable['id']],
    )
  } else {
    // Fallback: simple Dr Cash / Cr AR (WHT accounts not seeded yet)
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
       VALUES ($1,$2,$3,0,$4,$3), ($1,$5,0,$3,$4,$3)`,
      [jeId, cashAccount['id'], cashAmount, p.currency_code, arAccount['id']],
    )
  }

  log.info({ jeId, invoiceId: p.invoice_id, whtScenario: p.wht_scenario }, 'AR payment GL journal created')
}

async function createVendorInvoiceJournal(p: VendorInvoiceJournalPayload): Promise<void> {
  const totalAmount = parseFloat(String(p.total_amount))
  if (totalAmount <= 0) return

  const accounts = await pool.query<{ id: string; code: string }>(
    `SELECT id, code FROM chart_of_accounts WHERE company_id=$1 AND is_active=true
     AND (code LIKE '20%' OR code LIKE '21%' OR code LIKE '50%' OR code LIKE '51%') ORDER BY code`,
    [p.company_id],
  )
  const apAccount      = accounts.rows.find((a) => a['code'].startsWith('20') || a['code'].startsWith('21'))
  const expenseAccount = accounts.rows.find((a) => a['code'].startsWith('50') || a['code'].startsWith('51'))
  if (!apAccount || !expenseAccount) {
    throw new Error(`Missing AP/expense GL accounts for company ${p.company_id}`)
  }

  const sysUser = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)
  const userId = sysUser.rows[0]?.['id'] ?? ''

  // FX conversion
  let fxRate = 1.0
  if (p.currency_code !== 'IQD') {
    const fxRes = await pool.query<{ rate: string }>(
      `SELECT rate FROM fx_rates WHERE from_currency=$1 AND to_currency='IQD' ORDER BY rate_date DESC LIMIT 1`,
      [p.currency_code],
    )
    fxRate = fxRes.rows[0] ? parseFloat(String(fxRes.rows[0]['rate'])) : 1.0
  }

  const jeResult = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, source_id, created_by)
     VALUES ($1,'APINV-'||LEFT($2::text,8),'Vendor invoice approved',$3,'posted','vendor_invoice',$2::uuid,$4) RETURNING id`,
    [p.company_id, p.invoice_id, p.invoice_date, userId],
  )
  const jeId = jeResult.rows[0]!['id']

  // Dr Expense (cost) / Cr Accounts Payable
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
     VALUES ($1,$2,$3,0,$4,$5,ROUND($3*$5,4)), ($1,$6,0,$3,$4,$5,ROUND($3*$5,4))`,
    [jeId, expenseAccount['id'], totalAmount, p.currency_code, fxRate, apAccount['id']],
  )

  log.info({ jeId, invoiceId: p.invoice_id }, 'vendor invoice AP journal created')
}

async function createVendorPaymentJournal(p: VendorPaymentJournalPayload): Promise<void> {
  const paymentAmount  = parseFloat(String(p.amount))
  const totalWht       = p.whtApplies ? parseFloat(String(p.whtAmount ?? 0)) : 0
  const netPayable     = p.netPayable && p.netPayable > 0 ? p.netPayable : null

  // WHT is applied proportionally to this payment's share of the net payable.
  // This prevents the full invoice WHT from being booked on every partial payment.
  const proportionalWht = (p.whtApplies && totalWht > 0 && netPayable)
    ? Math.round((paymentAmount / netPayable) * totalWht * 100) / 100
    : 0
  const apDebit = paymentAmount + proportionalWht

  const accounts = await pool.query<{ id: string; code: string }>(
    `SELECT id, code FROM chart_of_accounts WHERE company_id=$1 AND is_active=true
     AND (code LIKE '11%' OR code LIKE '20%' OR code LIKE '21%' OR code LIKE '23%') ORDER BY code`,
    [p.companyId],
  )
  const cashAccount = accounts.rows.find((a) => a['code'].startsWith('11'))
  const apAccount   = accounts.rows.find((a) => a['code'].startsWith('20') || a['code'].startsWith('21'))
  const whtPayable  = accounts.rows.find((a) => a['code'] === '2390')

  if (!cashAccount || !apAccount) {
    throw new Error(`Missing cash/AP accounts for company ${p.companyId}`)
  }

  const sysUser = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)
  const userId = sysUser.rows[0]?.['id'] ?? ''

  const jeResult = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, source_id, created_by)
     VALUES ($1,'APPAY-'||LEFT($2::text,8),'Vendor payment',$3,'draft','vendor_payment',$4,$5) RETURNING id`,
    [p.companyId, p.paymentId, p.paymentDate, p.paymentId, userId],
  )
  const jeId = jeResult.rows[0]!['id']

  if (!p.whtApplies || proportionalWht === 0 || !whtPayable) {
    // Simple: Dr AP / Cr Cash
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
       VALUES ($1,$2,$3,0,$4,$3), ($1,$5,0,$3,$4,$3)`,
      [jeId, apAccount['id'], paymentAmount, p.currencyCode, cashAccount['id']],
    )
  } else {
    // Proportional WHT: Dr AP (payment + proportional WHT) / Cr Cash (payment) / Cr WHT Payable (proportional WHT)
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
       VALUES ($1,$2,$3,0,$4,$3), ($1,$5,0,$6,$4,$6), ($1,$7,0,$8,$4,$8)`,
      [jeId, apAccount['id'], apDebit, p.currencyCode,
       cashAccount['id'], paymentAmount, whtPayable['id'], proportionalWht],
    )
  }

  // Track which journal owns this payment (enables combine + post flow)
  await pool.query(`UPDATE vendor_payments SET journal_entry_id=$1 WHERE id=$2`, [jeId, p.paymentId])

  // Link journal entry to all source POs
  if (p.poIds && p.poIds.length > 0) {
    for (const poId of p.poIds) {
      await pool.query(
        `INSERT INTO journal_po_links (journal_entry_id, po_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [jeId, poId],
      )
    }
  }

  log.info({ jeId, paymentId: p.paymentId, invoiceId: p.invoiceId }, 'vendor payment AP journal created')
}

interface MOJournalPayload {
  mo_id: string
  company_id: string
  material_cost: number
  labour_cost: number
  actual_cost: number
  qty_produced: number
  product_id: string
  analytic_account_id?: string
}

async function createMOJournal(p: MOJournalPayload): Promise<void> {
  const actualCost = parseFloat(String(p.actual_cost))
  if (actualCost <= 0) return

  // WIP / Finished Goods account (13x), Raw Materials / WIP expense (51x or 50x)
  const accounts = await pool.query<{ id: string; code: string }>(
    `SELECT id, code FROM chart_of_accounts
     WHERE company_id=$1 AND is_active=true
       AND (code LIKE '13%' OR code LIKE '51%' OR code LIKE '50%')
     ORDER BY code`,
    [p.company_id],
  )
  const inventoryAccount = accounts.rows.find((a) => a['code'].startsWith('13'))
  const costAccount = accounts.rows.find((a) => a['code'].startsWith('51')) ??
                      accounts.rows.find((a) => a['code'].startsWith('50'))

  if (!inventoryAccount || !costAccount) {
    throw new Error(`Missing inventory/cost GL accounts for company ${p.company_id}`)
  }

  const sysUser = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)
  const userId = sysUser.rows[0]?.['id'] ?? ''

  const jeResult = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries
       (company_id, reference, description, entry_date, status, source_type, source_id, created_by)
     VALUES ($1,'MO-'||LEFT($2::text,8),'Manufacturing order completion',CURRENT_DATE,'posted','manufacturing_order',$2::uuid,$3)
     RETURNING id`,
    [p.company_id, p.mo_id, userId],
  )
  const jeId = jeResult.rows[0]!['id']

  // Dr Inventory (finished goods in), Cr Production Cost (materials + labour consumed)
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,$3,0,'IQD',$3), ($1,$4,0,$3,'IQD',$3)`,
    [jeId, inventoryAccount['id'], actualCost, costAccount['id']],
  )

  await pool.query(
    `UPDATE manufacturing_orders SET journal_entry_id=$1 WHERE id=$2`,
    [jeId, p.mo_id],
  )
  log.info({ jeId, moId: p.mo_id }, 'MO GL journal created')
}

interface RentalInvoiceJournalPayload {
  invoice_id: string
  contract_id: string
  company_id: string
  amount: number
  revenue_account_id?: string
  analytic_account_id?: string
}

async function createRentalInvoiceJournal(p: RentalInvoiceJournalPayload): Promise<void> {
  const amount = parseFloat(String(p.amount))
  if (amount <= 0) return

  // AR account (12x), Rental Revenue fallback (42x or 41x)
  const accounts = await pool.query<{ id: string; code: string }>(
    `SELECT id, code FROM chart_of_accounts
     WHERE company_id=$1 AND is_active=true
       AND (code LIKE '12%' OR code LIKE '42%' OR code LIKE '41%')
     ORDER BY code`,
    [p.company_id],
  )
  const arAccount = accounts.rows.find((a) => a['code'].startsWith('12'))
  const revenueAccount = p.revenue_account_id
    ? { id: p.revenue_account_id }
    : (accounts.rows.find((a) => a['code'].startsWith('42')) ??
       accounts.rows.find((a) => a['code'].startsWith('41')))

  if (!arAccount || !revenueAccount) {
    throw new Error(`Missing AR/revenue GL accounts for company ${p.company_id}`)
  }

  const sysUser = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)
  const userId = sysUser.rows[0]?.['id'] ?? ''

  const jeResult = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries
       (company_id, reference, description, entry_date, status, source_type, source_id, created_by)
     VALUES ($1,'RNT-'||LEFT($2::text,8),'Rental invoice',CURRENT_DATE,'posted','rental_invoice',$2::uuid,$3)
     RETURNING id`,
    [p.company_id, p.invoice_id, userId],
  )
  const jeId = jeResult.rows[0]!['id']

  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,$3,0,'IQD',$3), ($1,$4,0,$3,'IQD',$3)`,
    [jeId, arAccount['id'], amount, revenueAccount['id']],
  )

  await pool.query(`UPDATE rental_invoices SET journal_entry_id=$1 WHERE id=$2`, [jeId, p.invoice_id])
  log.info({ jeId, invoiceId: p.invoice_id }, 'rental invoice GL journal created')
}

interface PayrollJournalPayload {
  payroll_run_id:   string
  company_id:       string
  period_name:      string
  total_gross:      number
  total_net:        number
  total_deductions: number
  end_date:         string
}

async function createPayrollJournal(p: PayrollJournalPayload): Promise<void> {
  const totalGross       = parseFloat(String(p.total_gross))
  const totalNet         = parseFloat(String(p.total_net))
  const totalDeductions  = parseFloat(String(p.total_deductions))

  if (totalGross <= 0) return

  // Rounding sanity check: gross must equal net + deductions within 1 fils
  if (Math.abs(totalGross - totalNet - totalDeductions) > 0.01) {
    throw new Error(
      `Payroll totals out of balance for run ${p.payroll_run_id}: ` +
      `gross=${totalGross} net=${totalNet} deductions=${totalDeductions}`,
    )
  }

  // Idempotency: skip if a journal was already created (outbox retry path)
  const existing = await pool.query<{ journal_entry_id: string | null }>(
    `SELECT journal_entry_id FROM payroll_runs WHERE id = $1`,
    [p.payroll_run_id],
  )
  if (existing.rows[0]?.['journal_entry_id']) {
    log.warn({ runId: p.payroll_run_id }, 'payroll journal already exists — skipping duplicate')
    return
  }

  // Required GL accounts: 60x expense, 26x net-salaries payable, 25x tax/SS payable
  // (2400 is reserved for Intercompany Payable across all companies)
  const accounts = await pool.query<{ id: string; code: string }>(
    `SELECT id, code FROM chart_of_accounts
     WHERE company_id = $1 AND is_active = true
       AND (code LIKE '60%' OR code LIKE '26%' OR code LIKE '25%')
     ORDER BY code`,
    [p.company_id],
  )
  const salaryExpense   = accounts.rows.find((a) => a['code'].startsWith('60'))
  const salariesPayable = accounts.rows.find((a) => a['code'].startsWith('26'))
  const taxSSPayable    = accounts.rows.find((a) => a['code'].startsWith('25'))

  if (!salaryExpense || !salariesPayable || !taxSSPayable) {
    throw new Error(
      `Missing payroll GL accounts for company ${p.company_id} — ` +
      `need 60x (salary expense), 26x (accrued salaries payable), 25x (payroll tax/SS payable)`,
    )
  }

  const sysUser = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)
  const userId = sysUser.rows[0]?.['id'] ?? ''

  const jeResult = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries
       (company_id, reference, description, entry_date, status, source_type, source_id, created_by)
     VALUES ($1, 'PAYR-' || LEFT($2::text, 8), $3, $4::date, 'posted', 'payroll_run', $2::uuid, $5)
     RETURNING id`,
    [p.company_id, p.payroll_run_id, `Payroll expense — ${p.period_name}`, p.end_date, userId],
  )
  const jeId = jeResult.rows[0]!['id']

  // Dr Salary & Wages Expense (gross)
  // Cr Accrued Salaries Payable (net take-home)
  // Cr Payroll Tax & SS Payable (income tax + social security withheld)
  await pool.query(
    `INSERT INTO journal_lines
       (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1, $2, $3, 0,   'IQD', $3),
            ($1, $4, 0,  $5,  'IQD', $5),
            ($1, $6, 0,  $7,  'IQD', $7)`,
    [jeId,
     salaryExpense['id'],   totalGross,
     salariesPayable['id'], totalNet,
     taxSSPayable['id'],    totalDeductions],
  )

  await pool.query(
    `UPDATE payroll_runs
     SET journal_entry_id = $1, status = 'posted', updated_at = NOW()
     WHERE id = $2`,
    [jeId, p.payroll_run_id],
  )

  log.info({ jeId, runId: p.payroll_run_id, period: p.period_name }, 'payroll GL journal created')
}

// ── Interco ───────────────────────────────────────────────────
async function deliverToInterco(event: OutboxRow): Promise<void> {
  switch (event.event_type) {
    case 'INTERCO_STOCK_MOVE_DETECTED':
      await handleIntercoStockMoveDetected(
        event.payload as unknown as Parameters<typeof handleIntercoStockMoveDetected>[0],
      )
      break
    case 'INTERCO_STOCK_TRANSFER_EXECUTE':
      await executeIntercoStockTransfer(
        event.payload as unknown as Parameters<typeof executeIntercoStockTransfer>[0],
      )
      break
    default:
      throw new Error(`Unknown interco event: ${event.event_type}`)
  }
}

// ── Reporting: PDF generation ─────────────────────────────────
async function deliverToReporting(event: OutboxRow): Promise<void> {
  const p = event.payload as Record<string, string>

  switch (event.event_type) {
    case 'PROJECT_INVOICE_PDF_REQUESTED':
      await handleInvoicePDF(p['invoice_id']!, p['company_id']!)
      break
    case 'PAYSLIP_GENERATION_REQUESTED':
      await handlePayslipPDF(
        p['payroll_line_id']!,
        p['payroll_run_id']!,
        p['employee_id']!,
        p['company_id']!,
      )
      break
    case 'PO_PDF_REQUESTED':
      await handlePOPDF(p['po_id']!, p['company_id']!)
      break
    default:
      log.warn({ eventType: event.event_type }, 'unknown reporting event')
  }
}

async function handlePayslipPDF(
  payrollLineId: string,
  payrollRunId: string,
  employeeId: string,
  companyId: string,
): Promise<void> {
  const data = await fetchPayslipData(payrollLineId)
  const html = renderPayslip(data)
  const pdfBuffer = await renderHTMLToPDF(html)

  const fileKey = `${companyId}/${env.PDF_STORAGE_FOLDER}/payslips/${payrollRunId}/${employeeId}.pdf`
  await uploadBuffer(pdfBuffer, fileKey, 'application/pdf')

  await pool.query(
    `UPDATE payslips SET pdf_path=$1, pdf_generated_at=NOW() WHERE payroll_run_id=$2 AND employee_id=$3`,
    [fileKey, payrollRunId, employeeId],
  )

  if (data.employee.email && await isEmailEnabled('email.payslip')) {
    const emailHtml = renderPayslipEmail({
      employeeName: data.employee.name,
      period: data.payrollRun.name,
      netPay: data.net.netPay.toLocaleString(),
      currency: data.net.currency,
      companyName: data.company.name,
    })

    await sendEmail({
      to: data.employee.email,
      subject: `Your payslip — ${data.payrollRun.name}`,
      html: emailHtml,
      attachments: [
        {
          filename: `Payslip-${data.payrollRun.name}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })

    await pool.query(
      `UPDATE payslips SET sent_to_email=$1, sent_at=NOW() WHERE payroll_run_id=$2 AND employee_id=$3`,
      [data.employee.email, payrollRunId, employeeId],
    )
  }

  log.info({ payrollLineId }, 'payslip generated and sent')
}

async function handleInvoicePDF(invoiceId: string, companyId: string): Promise<void> {
  const data = await fetchInvoiceData(invoiceId, companyId)

  const tokenRow = await pool.query<{ verification_token: string }>(
    `SELECT verification_token FROM project_invoices WHERE id=$1`,
    [invoiceId],
  )
  const token = tokenRow.rows[0]?.verification_token
  let qrCodeDataUrl: string | undefined
  if (token && process.env['APP_BASE_URL']) {
    const verifyUrl = `${process.env['APP_BASE_URL']}/verify/${token}`
    qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 120,
      margin: 1,
      color: { dark: '#1a3c5e', light: '#ffffff' },
    })
  }

  const html = renderInvoice({ ...data, ...(qrCodeDataUrl ? { qrCodeDataUrl } : {}) })
  const pdfBuffer = await renderHTMLToPDF(html)

  const fileKey = `${companyId}/${env.PDF_STORAGE_FOLDER}/invoices/${invoiceId}.pdf`
  await uploadBuffer(pdfBuffer, fileKey, 'application/pdf')

  await pool.query(
    `UPDATE project_invoices SET pdf_path=$1, pdf_generated_at=NOW() WHERE id=$2`,
    [fileKey, invoiceId],
  )

  if (data.client.email && await isEmailEnabled('email.project_invoice')) {
    const emailHtml = renderInvoiceEmail({
      clientName: data.client.name,
      invoiceNumber: data.invoice.number,
      projectName: data.invoice.projectName,
      netPayable: data.totals.netPayable.toLocaleString(),
      currency: data.totals.currency,
      dueDate: data.invoice.dueDate,
      companyName: data.company.name,
    })

    await sendEmail({
      to: data.client.email,
      subject: `Invoice ${data.invoice.number} — ${data.invoice.projectName}`,
      html: emailHtml,
      attachments: [
        {
          filename: `Invoice-${data.invoice.number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })
  }

  log.info({ invoiceId }, 'invoice PDF generated')
}

async function handlePOPDF(poId: string, companyId: string): Promise<void> {
  const data = await fetchPOData(poId, companyId)
  const html = renderPurchaseOrder(data)
  const pdfBuffer = await renderHTMLToPDF(html)

  const fileKey = `${companyId}/${env.PDF_STORAGE_FOLDER}/purchase-orders/${poId}.pdf`
  await uploadBuffer(pdfBuffer, fileKey, 'application/pdf')

  await pool.query(`UPDATE purchase_orders SET pdf_path=$1 WHERE id=$2`, [fileKey, poId])

  if (data.vendor.email && await isEmailEnabled('email.po_confirmation')) {
    const emailHtml = renderPOConfirmationEmail({
      vendorName: data.vendor.name,
      poNumber: data.po.number,
      totalAmount: data.totals.total.toLocaleString(),
      currency: data.totals.currency,
      ...(data.po.expectedDeliveryDate ? { expectedDelivery: data.po.expectedDeliveryDate } : {}),
      companyName: data.company.name,
      companyCity: data.company.city,
    })

    await sendEmail({
      to: data.vendor.email,
      subject: `Purchase Order ${data.po.number} — ${data.company.name}`,
      html: emailHtml,
      attachments: [
        {
          filename: `PO-${data.po.number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })
  }

  log.info({ poId }, 'PO PDF generated and sent to vendor')
}

// ── Notifications: auth emails ────────────────────────────────
async function deliverToNotifications(event: OutboxRow): Promise<void> {
  const p = event.payload as Record<string, unknown>

  switch (event.event_type) {
    case 'PASSWORD_RESET_EMAIL': {
      const html = renderPasswordResetEmail({
        resetUrl: String(p['resetUrl']),
        expiresInMinutes: Number(p['expiresInMinutes'] ?? 15),
        ipAddress: String(p['ipAddress'] ?? 'unknown'),
      })
      await sendEmail({
        to: String(p['email']),
        subject: 'FNC ERP — Password Reset Request',
        html,
      })
      break
    }
    case 'PASSWORD_CHANGED_EMAIL': {
      const html = renderPasswordChangedEmail({
        changedAt: new Date(String(p['changedAt'])).toLocaleString('en-GB'),
        ipAddress: String(p['ipAddress'] ?? 'unknown'),
      })
      await sendEmail({
        to: String(p['email']),
        subject: 'FNC ERP — Your Password Was Changed',
        html,
      })
      break
    }
    case 'NEW_DEVICE_LOGIN': {
      const html = renderNewDeviceLoginEmail({
        deviceName: String(p['deviceName'] ?? 'Unknown'),
        platform: String(p['platform'] ?? 'web'),
        ipAddress: String(p['ipAddress'] ?? 'unknown'),
        loginAt: String(p['loginAt']),
      })
      await sendEmail({
        to: String(p['email']),
        subject: 'FNC ERP — New Device Login Detected',
        html,
      })
      break
    }
    case 'MFA_SETUP_EMAIL': {
      const html = renderMFASetupEmail({
        employeeName: String(p['employeeName'] ?? 'User'),
      })
      await sendEmail({
        to: String(p['email']),
        subject: 'FNC ERP — Two-Factor Authentication Enabled',
        html,
      })
      break
    }
    case 'FX_SYNC_FAILED_ALERT': {
      if (!(await isEmailEnabled('email.fx_sync_failed'))) break
      const emailHtml = `
        <div style="font-family:Arial;max-width:600px;margin:0 auto">
          <div style="background:#d97706;color:white;padding:16px 24px">
            <h1 style="margin:0;font-size:18px">&#9888; FX Rate Sync Failed</h1>
          </div>
          <div style="padding:24px;background:white">
            <p style="font-size:14px;color:#374151">
              The automated FX rate sync failed. Exchange rates may become stale.
            </p>
            <div style="background:#fef3c7;border:1px solid #fcd34d;
                        border-radius:6px;padding:12px 16px;margin:16px 0">
              <p style="font-size:13px;color:#92400e;font-weight:600;margin:0 0 8px">Errors:</p>
              <ul style="font-size:12px;color:#78350f;margin:0;padding-left:16px">
                ${(Array.isArray(p['errors']) ? (p['errors'] as string[]) : []).map((e) => `<li>${e}</li>`).join('')}
              </ul>
            </div>
            <p style="font-size:13px;color:#374151">
              Please update rates manually via
              <strong>Finance &#8594; FX Rates &#8594; Add Rate</strong>
              or trigger a manual sync.
            </p>
          </div>
        </div>
      `
      await sendEmail({
        to: String(p['email']),
        subject: 'FNC ERP — FX Rate Sync Failed',
        html: emailHtml,
      })
      break
    }
    case 'FX_RATE_STALE_ALERT': {
      const admins = await pool.query<{ id: string }>(
        `SELECT DISTINCT u.id
         FROM users u
         JOIN user_company_roles ucr ON ucr.user_id = u.id
         WHERE ucr.company_id = $1
           AND (ucr.role IN ('company_admin')
                OR (ucr.module = 'finance' AND ucr.role = 'module_admin'))
           AND u.is_active = true`,
        [p['companyId']],
      )
      for (const admin of admins.rows) {
        await pool.query(
          `INSERT INTO notifications
             (user_id, company_id, type, title, body, data)
           VALUES ($1,$2,'FX_RATE_STALE',$3,$4,$5::jsonb)`,
          [
            admin.id,
            p['companyId'],
            `FX rate ${String(p['status'])}: ${String(p['currencyPair'])}`,
            String(p['message']),
            JSON.stringify({ currencyPair: p['currencyPair'], ageHours: p['ageHours'] }),
          ],
        )
      }
      break
    }
    case 'FX_RATE_MOVEMENT_ALERT': {
      const admins = await pool.query<{ id: string }>(
        `SELECT DISTINCT u.id
         FROM users u
         JOIN user_company_roles ucr ON ucr.user_id = u.id
         WHERE ucr.module = 'finance'
           AND ucr.role IN ('module_admin','company_admin','system_admin')
           AND u.is_active = true`,
      )
      for (const admin of admins.rows) {
        await pool.query(
          `INSERT INTO notifications
             (user_id, type, title, body, data)
           VALUES ($1,'FX_RATE_MOVEMENT',$2,$3,$4::jsonb)`,
          [
            admin.id,
            `Large FX movement: ${String(p['pair'])}`,
            `${String(p['pair'])} moved ${String(p['changePct'])}% (${String(p['previousRate'])} &#8594; ${String(p['newRate'])})`,
            JSON.stringify(p),
          ],
        )
      }
      break
    }
    case 'MAINTENANCE_DUE_ALERT': {
      const p = event.payload as Record<string, unknown>
      const admins = await pool.query<{ id: string; email: string }>(
        `SELECT DISTINCT u.id, u.email
         FROM users u
         JOIN user_company_roles ucr ON ucr.user_id = u.id
         WHERE ucr.company_id = $1
           AND (ucr.role IN ('company_admin','system_admin')
                OR (ucr.module = 'rental' AND ucr.role = 'module_admin'))
           AND u.is_active = true`,
        [p['companyId']],
      )

      const urgencyLabel = p['urgency'] === 'overdue' ? '🔴 OVERDUE' : '🟡 Due Soon'
      const hoursRemaining = p['hoursRemaining'] != null ? Number(p['hoursRemaining']) : null
      const daysRemaining  = p['daysRemaining']  != null ? Number(p['daysRemaining'])  : null
      const detail = hoursRemaining !== null
        ? `${Math.abs(hoursRemaining).toFixed(1)} hours ${p['urgency'] === 'overdue' ? 'overdue' : 'remaining'}`
        : `${Math.abs(daysRemaining ?? 0)} days ${p['urgency'] === 'overdue' ? 'overdue' : 'remaining'}`

      for (const admin of admins.rows) {
        await pool
          .query(
            `INSERT INTO notifications
               (user_id, company_id, type, title, body, data, push_sent)
             VALUES ($1,$2,'MAINTENANCE_DUE',$3,$4,$5::jsonb,false)`,
            [
              admin.id, p['companyId'],
              `${urgencyLabel}: ${String(p['assetName'])} — ${String(p['scheduleName'])}`,
              `${String(p['assetNumber'])} — ${String(p['maintenanceType'])} — ${detail}`,
              JSON.stringify(p),
            ],
          )
          .catch((err: unknown) =>
            log.error({ err, adminId: admin.id }, 'failed to insert maintenance alert notification'),
          )

        if (p['urgency'] === 'overdue' && await isEmailEnabled('email.maintenance_overdue')) {
          await sendEmail({
            to: admin.email,
            subject: `[OVERDUE] Maintenance required: ${String(p['assetName'])} — ${String(p['scheduleName'])}`,
            html: `
              <div style="font-family:Arial;max-width:600px;margin:0 auto">
                <div style="background:#dc2626;color:white;padding:16px 24px">
                  <h1 style="margin:0;font-size:18px">🔴 Maintenance Overdue</h1>
                </div>
                <div style="padding:24px">
                  <table style="width:100%;border-collapse:collapse">
                    <tr style="background:#f9fafb">
                      <td style="padding:8px 12px;font-size:12px;color:#6b7280;width:40%">Asset</td>
                      <td style="padding:8px 12px;font-size:13px;font-weight:600">${String(p['assetName'])}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 12px;font-size:12px;color:#6b7280">Asset number</td>
                      <td style="padding:8px 12px;font-size:13px">${String(p['assetNumber'])}</td>
                    </tr>
                    <tr style="background:#f9fafb">
                      <td style="padding:8px 12px;font-size:12px;color:#6b7280">Maintenance</td>
                      <td style="padding:8px 12px;font-size:13px">${String(p['scheduleName'])}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 12px;font-size:12px;color:#6b7280">Status</td>
                      <td style="padding:8px 12px;font-size:13px;color:#dc2626;font-weight:600">${detail}</td>
                    </tr>
                  </table>
                  <p style="font-size:13px;color:#374151;margin-top:16px">
                    Please schedule maintenance immediately to avoid equipment damage
                    and ensure rental contract compliance.
                  </p>
                </div>
              </div>
            `,
          }).catch((err: unknown) =>
            log.error({ err, adminEmail: admin.email }, 'failed to send maintenance overdue email'),
          )
        }
      }
      break
    }

    case 'ASSET_CONDITION_ALERT': {
      const p = event.payload as Record<string, unknown>
      const admins = await pool.query<{ id: string; email: string }>(
        `SELECT DISTINCT u.id, u.email
         FROM users u
         JOIN user_company_roles ucr ON ucr.user_id = u.id
         WHERE ucr.company_id = $1
           AND (ucr.role IN ('company_admin','system_admin')
                OR (ucr.module = 'rental' AND ucr.role = 'module_admin'))
           AND u.is_active = true`,
        [p['companyId']],
      )

      const conditionLabel = p['condition'] === 'critical' ? '🔴 CRITICAL' : '🟠 Poor'
      const assetResult = await pool.query<{ name: string; asset_number: string }>(
        `SELECT name, asset_number FROM equipment_assets WHERE id = $1`,
        [p['assetId']],
      )
      const asset = assetResult.rows[0]

      for (const admin of admins.rows) {
        await pool
          .query(
            `INSERT INTO notifications
               (user_id, company_id, type, title, body, data, push_sent)
             VALUES ($1,$2,'ASSET_CONDITION_ALERT',$3,$4,$5::jsonb,false)`,
            [
              admin.id, p['companyId'],
              `${conditionLabel}: ${asset?.name ?? String(p['assetId'])} condition report`,
              String(p['issues'] ?? 'No issue description provided'),
              JSON.stringify(p),
            ],
          )
          .catch((err: unknown) =>
            log.error({ err, adminId: admin.id }, 'failed to insert condition alert notification'),
          )
      }
      break
    }

    case 'USER_INVITATION_EMAIL': {
      // Look up the inviter's display name
      let inviterName = 'An administrator'
      if (p['invitedBy']) {
        const inviterRes = await pool.query<{ first_name: string | null; last_name: string | null; email: string }>(
          `SELECT first_name, last_name, email FROM users WHERE id=$1`, [String(p['invitedBy'])]
        )
        const inviter = inviterRes.rows[0]
        if (inviter) {
          inviterName = (inviter.first_name && inviter.last_name)
            ? `${inviter.first_name} ${inviter.last_name}`
            : inviter.email
        }
      }
      const inviteHtml = `
        <div style="font-family:Arial;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;color:white;padding:16px 24px">
            <h1 style="margin:0;font-size:18px">You've been invited to FNC ERP</h1>
          </div>
          <div style="padding:24px;background:white">
            <p style="font-size:14px;color:#374151">
              Hello,<br/><br/>
              <strong>${inviterName}</strong> has invited you
              to join <strong>${String(p['companyName'] ?? 'FNC ERP')}</strong>.
            </p>
            <p style="font-size:14px;color:#374151">
              Click the button below to accept your invitation and set up your account.
              This link expires in <strong>7 days</strong>.
            </p>
            <div style="text-align:center;margin:32px 0">
              <a href="${String(p['invitationUrl'])}"
                 style="background:#1e3a5f;color:white;padding:12px 28px;
                        border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">
                Accept Invitation
              </a>
            </div>
            <p style="font-size:12px;color:#9ca3af">
              If you weren't expecting this invitation, you can safely ignore this email.
              The link will expire automatically.
            </p>
          </div>
        </div>
      `
      await sendEmail({
        to: String(p['email']),
        subject: `You've been invited to FNC ERP — ${String(p['companyName'] ?? '')}`,
        html: inviteHtml,
      })
      break
    }
    case 'MILESTONE_REACHED':
    case 'BACKUP_FAILED':
      log.info({ eventType: event.event_type }, 'in-app notification event — no email needed')
      break

    // ── PO workflow notifications ─────────────────────────────────────────────
    // Payload from notifyPositionHolders/notifyDeptHeadsAndAdmins: { userId, poId, type, title, body }
    // Payload from new direct inserts: { userId, companyId, poId, poNumber, title, body }
    // companyId absent in legacy payloads → look up from purchase_orders
    case 'PO_INVENTORY_CHECK_REQUIRED':
    case 'PO_STORE_PRICING_REQUIRED':
    case 'PO_MARKET_PRICING_REQUIRED':
    case 'PO_PRICE_VERIFICATION_REQUIRED':
    case 'PO_APPROVAL_REQUIRED':
    case 'PO_PRICING_REJECTED':
    case 'PO_SENT_TO_AUDIT':
    case 'PO_AUDIT_PASSED':
    case 'PO_AUDIT_FAILED':
    case 'PO_COMPLETED':
    case 'PO_CANCELLED':
    case 'PO_RECEIVER_ASSIGNED':
    case 'PO_GOODS_RECEIVED':
    case 'PO_EDIT_REQUEST_SUBMITTED':
    case 'PO_EDIT_REQUEST_APPROVED':
    case 'PO_EDIT_REQUEST_REJECTED': {
      let companyId = p['companyId'] as string | undefined
      if (!companyId && p['poId']) {
        const coRes = await pool.query<{ company_id: string }>(
          `SELECT company_id FROM purchase_orders WHERE id=$1`, [String(p['poId'])]
        )
        companyId = coRes.rows[0]?.company_id
      }
      if (!companyId) {
        log.warn({ poId: p['poId'], eventType: event.event_type }, 'no company_id for PO notification — skipping')
        break
      }
      await pool.query(
        `INSERT INTO notifications (user_id, company_id, type, title, body, data, push_sent)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,false)`,
        [String(p['userId']), companyId, event.event_type,
         String(p['title'] ?? ''), String(p['body'] ?? ''),
         JSON.stringify({ poId: p['poId'], poNumber: p['poNumber'] })]
      )
      break
    }

    case 'PO_APPROVED_NOTIFICATION': {
      const coRes = await pool.query<{ company_id: string; po_number: string }>(
        `SELECT company_id, po_number FROM purchase_orders WHERE id=$1`, [String(p['poId'])]
      )
      const { company_id, po_number } = coRes.rows[0] ?? {}
      if (!company_id) break
      const num = String(p['poNumber'] ?? po_number ?? '')
      await pool.query(
        `INSERT INTO notifications (user_id, company_id, type, title, body, data, push_sent)
         VALUES ($1,$2,'PO_APPROVED',$3,$4,$5::jsonb,false)`,
        [String(p['userId']), company_id,
         `PO Approved: ${num}`,
         `Your purchase order ${num} has been approved`,
         JSON.stringify({ poId: p['poId'], poNumber: num })]
      )
      break
    }

    case 'PO_REJECTED_NOTIFICATION': {
      const coRes = await pool.query<{ company_id: string; po_number: string }>(
        `SELECT company_id, po_number FROM purchase_orders WHERE id=$1`, [String(p['poId'])]
      )
      const { company_id, po_number } = coRes.rows[0] ?? {}
      if (!company_id) break
      const num = String(po_number ?? '')
      await pool.query(
        `INSERT INTO notifications (user_id, company_id, type, title, body, data, push_sent)
         VALUES ($1,$2,'PO_REJECTED',$3,$4,$5::jsonb,false)`,
        [String(p['userId']), company_id,
         `PO Rejected: ${num}`,
         `Your purchase order ${num} was rejected${p['reason'] ? ': ' + String(p['reason']) : ''}`,
         JSON.stringify({ poId: p['poId'], poNumber: num, reason: p['reason'] })]
      )
      break
    }

    // ── Project team notifications ─────────────────────────────────────────────
    // Payload from notifyProjectTeam: { userId, projectId, type, title, body } — no companyId
    case 'PROJECT_STARTED':
    case 'PROJECT_ON_HOLD':
    case 'PROJECT_RESUMED':
    case 'PROJECT_REJECTED_BACK':
    case 'PROJECT_CANCELLED':
    case 'PROJECT_APPROVED':
    case 'PROJECT_COMPLETED':
    case 'PROJECT_CANCELLED_AFTER_APPROVAL':
    case 'PROJECT_STAGE_COMPLETED': {
      const projRes = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM projects WHERE id=$1`, [String(p['projectId'])]
      )
      const projCompanyId = projRes.rows[0]?.company_id
      if (!projCompanyId) {
        log.warn({ projectId: p['projectId'] }, 'project not found for notification — skipping')
        break
      }
      await pool.query(
        `INSERT INTO notifications (user_id, company_id, type, title, body, data, push_sent)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,false)`,
        [String(p['userId']), projCompanyId, event.event_type,
         String(p['title'] ?? ''), String(p['body'] ?? ''),
         JSON.stringify({ projectId: p['projectId'] })]
      )
      break
    }

    // ── Project admin/member notifications (unified payload with companyId) ──────
    case 'PROJECT_SUBMITTED':
    case 'PROJECT_MEMBER_ADDED':
    case 'PROJECT_MEMBER_REMOVED':
    // ── Manufacturing order notifications ─────────────────────────────────────
    case 'MO_CREATED':
    case 'MO_CONFIRMED':
    case 'MO_STARTED':
    case 'MO_COMPLETED':
    case 'MO_CANCELLED':
    // ── Rental contract & invoice notifications ────────────────────────────────
    case 'RENTAL_CONTRACT_ACTIVATED':
    case 'RENTAL_CONTRACT_COMPLETED':
    case 'RENTAL_CONTRACT_CANCELLED':
    case 'RENTAL_INVOICE_ISSUED':
    case 'RENTAL_INVOICE_PAID':
    case 'MAINTENANCE_STARTED':
    case 'MAINTENANCE_COMPLETED':
    // ── HR notifications ──────────────────────────────────────────────────────
    case 'EMPLOYEE_TERMINATED':
    case 'LEAVE_REQUEST_SUBMITTED':
    case 'LEAVE_REQUEST_APPROVED':
    case 'LEAVE_REQUEST_REJECTED':
    // ── Finance notifications ─────────────────────────────────────────────────
    case 'VENDOR_INVOICE_CANCELLED':
    case 'VENDOR_PAYMENT_RECORDED':
    case 'PAYMENT_VOUCHER_APPROVED':
    case 'PAYMENT_VOUCHER_PAID':
    case 'JOURNAL_POSTED':
    case 'JOURNAL_AUDITED':
    case 'JOURNAL_CANCELLED': {
      // All these events carry userId + companyId + title + body + data in the payload
      await pool.query(
        `INSERT INTO notifications (user_id, company_id, type, title, body, data, push_sent)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,false)`,
        [String(p['userId']), String(p['companyId']), event.event_type,
         String(p['title'] ?? ''), String(p['body'] ?? ''),
         JSON.stringify(p['data'] ?? {})]
      )
      break
    }

    // ── Vendor invoice notifications (legacy payloads — companyId absent) ──────
    case 'VENDOR_INVOICE_APPROVAL_REQUIRED':
    case 'VENDOR_INVOICE_APPROVED_NOTIFICATION':
    case 'VENDOR_INVOICE_REJECTED_NOTIFICATION': {
      const viRes = await pool.query<{ company_id: string; invoice_number: string }>(
        `SELECT company_id, invoice_number FROM vendor_invoices WHERE id=$1`, [String(p['invoiceId'])]
      )
      const { company_id, invoice_number } = viRes.rows[0] ?? {}
      if (!company_id) { log.warn({ invoiceId: p['invoiceId'] }, 'vendor invoice not found for notification'); break }
      const num = String(p['invoiceNumber'] ?? invoice_number ?? '')
      const evTitle = event.event_type === 'VENDOR_INVOICE_APPROVAL_REQUIRED'
        ? `Invoice pending approval: ${num}`
        : event.event_type === 'VENDOR_INVOICE_APPROVED_NOTIFICATION'
          ? `Invoice approved: ${num}`
          : `Invoice rejected: ${num}`
      const evBody = event.event_type === 'VENDOR_INVOICE_APPROVAL_REQUIRED'
        ? `Vendor invoice ${num} has been submitted and requires your approval`
        : event.event_type === 'VENDOR_INVOICE_APPROVED_NOTIFICATION'
          ? `Vendor invoice ${num} has been approved`
          : `Vendor invoice ${num} was rejected${p['reason'] ? ': ' + String(p['reason']) : ''}`
      await pool.query(
        `INSERT INTO notifications (user_id, company_id, type, title, body, data, push_sent)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,false)`,
        [String(p['userId']), company_id, event.event_type, evTitle, evBody,
         JSON.stringify({ invoiceId: p['invoiceId'], invoiceNumber: num })]
      )
      break
    }

    default:
      log.warn({ eventType: event.event_type }, 'unknown notification event')
  }
}

// ── Worker self-dispatch ──────────────────────────────────────
async function deliverToWorker(event: OutboxRow): Promise<void> {
  switch (event.event_type) {
    case 'FX_SYNC_REQUESTED': {
      const p = event.payload as { triggeredBy?: string; syncType?: 'manual' | 'scheduled' }
      // Dynamic import avoids loading fx-sync cron registrations during tests
      const { syncFXRates } = await import('./fx-sync.js')
      await syncFXRates(p.syncType ?? 'manual', p.triggeredBy)
      break
    }
    default:
      throw new Error(`Unknown worker event: ${event.event_type}`)
  }
}

// ── Data fetchers ─────────────────────────────────────────────
async function fetchPayslipData(payrollLineId: string): Promise<PayslipData> {
  const row = await pool.query<Record<string, unknown>>(
    `SELECT
       ps.payroll_run_id, ps.employee_id, ps.company_id,
       ps.base_salary, ps.housing_allowance, ps.transport_allowance,
       ps.other_allowances, ps.overtime_hours, ps.overtime_pay,
       ps.gross_salary, ps.income_tax, ps.social_security,
       ps.net_salary, ps.currency_code, ps.leave_days,
       e.first_name || ' ' || e.last_name AS employee_name,
       e.employee_number, e.email AS employee_email, e.bank_account,
       d.name AS department_name,
       j.title AS job_title,
       pr.period_name, pr.start_date, pr.end_date,
       c.name AS company_name, c.legal_name, c.city, c.country
     FROM payslips ps
     JOIN employees e ON e.id = ps.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN job_positions j ON j.id = e.job_position_id
     JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
     JOIN companies c ON c.id = ps.company_id
     WHERE ps.id = $1`,
    [payrollLineId],
  )

  const r = row.rows[0]
  if (!r) throw new Error(`Payslip not found: ${payrollLineId}`)

  const currency = String(r['currency_code'])
  const basePay = parseFloat(String(r['base_salary']))
  const housingAllowance = parseFloat(String(r['housing_allowance'] ?? '0'))
  const transportAllowance = parseFloat(String(r['transport_allowance'] ?? '0'))
  const overtimePay = parseFloat(String(r['overtime_pay'] ?? '0'))
  const grossPay = parseFloat(String(r['gross_salary']))
  const incomeTax = parseFloat(String(r['income_tax'] ?? '0'))
  const socialSecurity = parseFloat(String(r['social_security'] ?? '0'))
  const netPay = parseFloat(String(r['net_salary']))
  const leaveDays = parseFloat(String(r['leave_days'] ?? '0'))
  const overtimeHours = parseFloat(String(r['overtime_hours'] ?? '0'))

  const workingDays = 22
  const daysPresent = workingDays - Math.round(leaveDays)

  return {
    company: {
      name: String(r['company_name']),
      legalName: String(r['legal_name'] ?? r['company_name']),
      city: String(r['city'] ?? ''),
      country: String(r['country'] ?? 'Iraq'),
    },
    employee: {
      name: String(r['employee_name']),
      employeeNumber: String(r['employee_number']),
      jobTitle: String(r['job_title'] ?? ''),
      department: String(r['department_name'] ?? ''),
      ...(r['employee_email'] ? { email: String(r['employee_email']) } : {}),
      ...(r['bank_account'] ? { bankAccount: String(r['bank_account']) } : {}),
    },
    payrollRun: {
      name: String(r['period_name']),
      periodStart: String(r['start_date']),
      periodEnd: String(r['end_date']),
    },
    earnings: {
      basePay,
      allowances: [
        ...(housingAllowance > 0 ? [{ name: 'Housing allowance', amount: housingAllowance }] : []),
        ...(transportAllowance > 0
          ? [{ name: 'Transport allowance', amount: transportAllowance }]
          : []),
      ],
      overtimePay,
      grossPay,
      currency,
    },
    deductions: {
      incomeTax,
      socialSecurity,
      others: [],
      totalDeductions: incomeTax + socialSecurity,
    },
    net: {
      netPay,
      currency,
      netPayIQD: currency === 'IQD' ? netPay : 0,
      fxRate: 1,
    },
    daysAttendance: {
      workingDays,
      daysPresent,
      daysAbsent: workingDays - daysPresent,
      overtimeHours,
    },
  } as PayslipData
}

async function fetchInvoiceData(invoiceId: string, companyId: string): Promise<InvoiceData> {
  const invRow = await pool.query<Record<string, unknown>>(
    `SELECT pi.*,
            pc.contract_number, pc.payment_terms_days, pc.retention_pct, pc.client_name,
            p.code AS project_code, p.name AS project_name,
            c.name AS company_name, c.legal_name, c.city, c.country
     FROM project_invoices pi
     JOIN project_contracts pc ON pc.id = pi.contract_id
     JOIN projects p ON p.id = pi.project_id
     JOIN companies c ON c.id = pi.company_id
     WHERE pi.id = $1 AND pi.company_id = $2`,
    [invoiceId, companyId],
  )
  const inv = invRow.rows[0]
  if (!inv) throw new Error(`Invoice not found: ${invoiceId}`)

  const linesRows = await pool.query<Record<string, unknown>>(
    `SELECT * FROM project_invoice_lines WHERE invoice_id = $1 ORDER BY line_number`,
    [invoiceId],
  )

  const lines = linesRows.rows.map((l) => ({
    lineNumber: Number(l['line_number']),
    description: String(l['description']),
    qty: parseFloat(String(l['qty'])),
    unitCost: parseFloat(String(l['unit_cost'])),
    subtotal: parseFloat(String(l['subtotal'])),
    marginPct: parseFloat(String(l['margin_pct'] ?? '0')),
    marginAmount: parseFloat(String(l['margin_amount'] ?? '0')),
    lineTotal: parseFloat(String(l['line_total'])),
    currency: String(l['currency_code']),
    ...(l['mo_components']
      ? {
          components: JSON.parse(
            String(l['mo_components']),
          ) as InvoiceData['lines'][0]['components'],
        }
      : {}),
  }))

  const retentionPct = parseFloat(String(inv['retention_pct'] ?? '0'))

  return {
    company: {
      name: String(inv['company_name']),
      legalName: String(inv['legal_name'] ?? inv['company_name']),
      city: String(inv['city'] ?? ''),
      country: String(inv['country'] ?? 'Iraq'),
    },
    client: {
      name: String(inv['client_name'] ?? 'Client'),
    },
    invoice: {
      number: String(inv['invoice_number']),
      date: String(inv['invoice_date']),
      dueDate: String(inv['due_date']),
      status: String(inv['status']),
      billingMethod: String(inv['billing_method']),
      projectCode: String(inv['project_code']),
      projectName: String(inv['project_name']),
      contractNumber: String(inv['contract_number']),
    },
    lines,
    totals: {
      subtotal: parseFloat(String(inv['subtotal'])),
      marginTotal: parseFloat(String(inv['margin_total'] ?? '0')),
      grossTotal: parseFloat(String(inv['gross_total'])),
      retentionAmount: parseFloat(String(inv['retention_amount'] ?? '0')),
      retentionPct,
      netPayable: parseFloat(String(inv['net_payable'])),
      currency: String(inv['currency_code']),
    },
    paymentTerms: Number(inv['payment_terms_days'] ?? 30),
    ...(inv['notes'] ? { notes: String(inv['notes']) } : {}),
  } as InvoiceData
}

async function fetchPOData(poId: string, companyId: string): Promise<POData> {
  const poRow = await pool.query<Record<string, unknown>>(
    `SELECT po.*,
            v.name AS vendor_name, v.legal_name AS vendor_legal_name,
            v.address AS vendor_address, v.contact_email AS vendor_email,
            u.first_name || ' ' || u.last_name AS approver_name,
            c.name AS company_name, c.legal_name, c.city, c.country
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     LEFT JOIN users u ON u.id = po.approved_by
     JOIN companies c ON c.id = po.company_id
     WHERE po.id = $1 AND po.company_id = $2`,
    [poId, companyId],
  )
  const po = poRow.rows[0]
  if (!po) throw new Error(`Purchase order not found: ${poId}`)

  const linesRows = await pool.query<Record<string, unknown>>(
    `SELECT * FROM po_lines WHERE po_id = $1 ORDER BY line_number`,
    [poId],
  )

  const lines: POData['lines'] = linesRows.rows.map((l) => ({
    lineNumber: Number(l['line_number']),
    description: String(l['description']),
    qty: parseFloat(String(l['qty_ordered'])),
    uom: String(l['uom'] ?? 'unit'),
    unitPrice: parseFloat(String(l['unit_price'])),
    totalPrice: parseFloat(String(l['qty_ordered'])) * parseFloat(String(l['unit_price'])),
    currency: String(l['currency_code']),
  }))

  const subtotal = lines.reduce((s: number, l: POData['lines'][0]) => s + l.totalPrice, 0)
  const currency = String(po['currency_code'])

  return {
    company: {
      name: String(po['company_name']),
      legalName: String(po['legal_name'] ?? po['company_name']),
      city: String(po['city'] ?? ''),
      country: String(po['country'] ?? 'Iraq'),
    },
    vendor: {
      name: String(po['vendor_name']),
      ...(po['vendor_legal_name'] ? { legalName: String(po['vendor_legal_name']) } : {}),
      ...(po['vendor_address'] ? { address: String(po['vendor_address']) } : {}),
      ...(po['vendor_email'] ? { email: String(po['vendor_email']) } : {}),
    },
    po: {
      number: String(po['po_number']),
      date: String(po['created_at']).slice(0, 10),
      ...(po['expected_delivery_date']
        ? { expectedDeliveryDate: String(po['expected_delivery_date']) }
        : {}),
      status: String(po['status']),
      currency,
      ...(po['notes'] ? { notes: String(po['notes']) } : {}),
    },
    lines,
    totals: {
      subtotal,
      taxAmount: 0,
      total: subtotal,
      currency,
    },
    ...(po['approver_name'] ? { approvedBy: String(po['approver_name']) } : {}),
    ...(po['approved_at'] ? { approvedAt: String(po['approved_at']).slice(0, 10) } : {}),
  } as POData
}
