import cron from 'node-cron'
import {
  fetchFromExchangeRateAPI,
  fetchFromOpenExchangeRates,
  validateRate,
  type FetchedRate,
} from '@fnc-erp/fx'
import { checkRateStaleness } from '@fnc-erp/fx/staleness'
import { pool, withTransaction, getSystemConfig, startJobRun, finishJobRun, partialJobRun, failJobRun } from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'
import { env } from '@fnc-erp/config'

const log = logger.child({ job: 'fx-sync' })

// ── CORE SYNC FUNCTION ────────────────────────────────────────
// Used by both the scheduled job and the FX_SYNC_REQUESTED outbox handler.
export async function syncFXRates(
  syncType: 'scheduled' | 'manual',
  triggeredBy?: string,
): Promise<{
  status: 'success' | 'partial' | 'failed'
  ratesUpdated: number
  errors: string[]
  syncLogId: string
}> {
  const startTime = Date.now()
  const errors: string[] = []
  let fetchedRates: FetchedRate[] = []
  let source = 'unknown'
  const runId = await startJobRun('fx-sync', { syncType, triggeredBy: triggeredBy ?? null })

  log.info({ syncType, triggeredBy }, 'starting FX rate sync')

  // Prefer DB-stored API keys (set via admin UI) over env vars
  const exchangeRateApiKey =
    (await getSystemConfig('fx.exchange_rate_api_key')) ?? env.EXCHANGE_RATE_API_KEY
  const openExchangeRatesAppId =
    (await getSystemConfig('fx.open_exchange_rates_app_id')) ?? env.OPEN_EXCHANGE_RATES_APP_ID

  // ── Step 1: Primary source ────────────────────────────────
  try {
    if (exchangeRateApiKey) {
      fetchedRates = await fetchFromExchangeRateAPI(exchangeRateApiKey)
      source = 'exchangerate_api'
    } else {
      errors.push('EXCHANGE_RATE_API_KEY not configured — skipping primary source')
    }
  } catch (err: unknown) {
    const msg = `Primary source (ExchangeRate-API) failed: ${err instanceof Error ? err.message : String(err)}`
    errors.push(msg)
    log.warn({ err }, msg)
  }

  // ── Step 2: Fallback source ───────────────────────────────
  if (fetchedRates.length === 0 && openExchangeRatesAppId) {
    try {
      const fallbackRates = await fetchFromOpenExchangeRates(openExchangeRatesAppId)
      if (fallbackRates && fallbackRates.length > 0) {
        fetchedRates = fallbackRates
        source = 'open_exchange_rates'
      }
      log.info('using Open Exchange Rates as fallback')
    } catch (err: unknown) {
      const msg = `Fallback source (Open Exchange Rates) also failed: ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      log.error({ err }, msg)
    }
  }

  // ── Step 3: Create sync log entry ─────────────────────────
  const syncLogResult = await pool.query<{ id: string }>(
    `INSERT INTO fx_rate_sync_log
       (sync_type, triggered_by, source, status,
        rates_fetched, rates_updated, rates_skipped, error_message, duration_ms)
     VALUES ($1,$2,$3,'success',$4::jsonb,0,0,NULL,0)
     RETURNING id`,
    [syncType, triggeredBy ?? null, source, JSON.stringify(fetchedRates)],
  )
  const syncLogId = syncLogResult.rows[0]!['id']

  // ── Step 4: Validate and persist rates ────────────────────
  let ratesUpdated = 0
  let ratesSkipped = 0

  for (const fetched of fetchedRates) {
    const validation = validateRate(fetched.fromCurrency, fetched.toCurrency, fetched.rate)
    if (!validation.valid) {
      errors.push(
        `Rate validation failed for ${fetched.fromCurrency}/${fetched.toCurrency}: ${validation.reason ?? ''}`,
      )
      log.warn(
        { pair: `${fetched.fromCurrency}/${fetched.toCurrency}`, rate: fetched.rate, reason: validation.reason },
        'rate failed validation — skipped',
      )
      ratesSkipped++
      continue
    }

    try {
      await withTransaction(
        { companyId: 'system', userId: 'system', role: 'system_admin' },
        async (client) => {
          // Get previous rate for change calculation
          const prev = await client.query<{ rate: string }>(
            `SELECT rate FROM fx_rates
             WHERE from_currency=$1 AND to_currency=$2
             ORDER BY rate_date DESC LIMIT 1`,
            [fetched.fromCurrency, fetched.toCurrency],
          )

          const previousRate = prev.rows[0] ? parseFloat(prev.rows[0].rate) : null
          const changePct =
            previousRate != null
              ? ((fetched.rate - previousRate) / previousRate) * 100
              : null

          // Upsert rate — skip if same pair+date already exists
          const result = await client.query<{ id: string }>(
            `INSERT INTO fx_rates
               (from_currency, to_currency, rate, rate_date, source, sync_log_id)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (from_currency, to_currency, rate_date)
             DO NOTHING
             RETURNING id`,
            [
              fetched.fromCurrency,
              fetched.toCurrency,
              fetched.rate,
              fetched.rateDate.toISOString().slice(0, 10),
              fetched.source,
              syncLogId,
            ],
          )

          if (result.rows.length === 0) {
            ratesSkipped++
            return
          }
          ratesUpdated++

          // Audit in fx_rate_changes
          await client.query(
            `INSERT INTO fx_rate_changes
               (from_currency, to_currency, rate_date, rate,
                previous_rate, change_pct, source, sync_log_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              fetched.fromCurrency,
              fetched.toCurrency,
              fetched.rateDate.toISOString().slice(0, 10),
              fetched.rate,
              previousRate ?? null,
              changePct != null ? Math.round(changePct * 10000) / 10000 : null,
              fetched.source,
              syncLogId,
            ],
          )

          // Queue movement alert when change >= 5%
          if (changePct != null && Math.abs(changePct) >= 5) {
            log.warn(
              {
                pair: `${fetched.fromCurrency}/${fetched.toCurrency}`,
                previousRate,
                newRate: fetched.rate,
                changePct: changePct.toFixed(2),
              },
              'significant FX rate movement detected',
            )
            await client.query(
              `INSERT INTO service_outbox (service, event_type, payload)
               VALUES ('notifications', 'FX_RATE_MOVEMENT_ALERT', $1::jsonb)`,
              [
                JSON.stringify({
                  pair: `${fetched.fromCurrency}/${fetched.toCurrency}`,
                  previousRate,
                  newRate: fetched.rate,
                  changePct: changePct.toFixed(2),
                  rateDate: fetched.rateDate.toISOString().slice(0, 10),
                }),
              ],
            )
          }
        },
      )
    } catch (err: unknown) {
      const msg = `Failed to persist ${fetched.fromCurrency}/${fetched.toCurrency}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      log.error({ err, pair: `${fetched.fromCurrency}/${fetched.toCurrency}` }, 'failed to persist rate')
    }
  }

  // ── Step 5: Finalise sync log ──────────────────────────────
  const finalStatus: 'success' | 'partial' | 'failed' =
    fetchedRates.length === 0 ? 'failed' : errors.length > 0 ? 'partial' : 'success'

  const durationMs = Date.now() - startTime

  await pool.query(
    `UPDATE fx_rate_sync_log
     SET status=$1, rates_updated=$2, rates_skipped=$3,
         error_message=$4, duration_ms=$5
     WHERE id=$6`,
    [
      finalStatus,
      ratesUpdated,
      ratesSkipped,
      errors.length > 0 ? errors.join('\n') : null,
      durationMs,
      syncLogId,
    ],
  )

  // ── Step 6: Alert on total failure ────────────────────────
  if (finalStatus === 'failed') {
    await notifyAdminsOfSyncFailure(errors, syncLogId)
    await failJobRun(runId, errors.join('; '))
  } else if (finalStatus === 'partial') {
    await partialJobRun(runId, errors.join('; '), { ratesUpdated, ratesSkipped })
  } else {
    await finishJobRun(runId, { ratesUpdated, ratesSkipped })
  }

  log.info(
    { syncType, status: finalStatus, ratesUpdated, ratesSkipped, errors: errors.length, durationMs },
    'FX rate sync complete',
  )

  return { status: finalStatus, ratesUpdated, errors, syncLogId }
}

// ── FAILURE NOTIFICATION ──────────────────────────────────────
async function notifyAdminsOfSyncFailure(errors: string[], syncLogId: string): Promise<void> {
  try {
    const admins = await pool.query<{ id: string; email: string }>(
      `SELECT DISTINCT u.id, u.email
       FROM users u
       JOIN user_company_roles ucr ON ucr.user_id = u.id
       WHERE (ucr.role IN ('system_admin','company_admin')
              OR (ucr.module = 'finance' AND ucr.role = 'module_admin'))
         AND u.is_active = true
         AND u.email IS NOT NULL`,
    )

    for (const admin of admins.rows) {
      await pool.query(
        `INSERT INTO service_outbox (service, event_type, payload)
         VALUES ('notifications','FX_SYNC_FAILED_ALERT',$1::jsonb)`,
        [JSON.stringify({ userId: admin.id, email: admin.email, errors, syncLogId })],
      )
    }
  } catch (err) {
    log.error({ err }, 'failed to notify admins of FX sync failure')
  }
}

// ── SCHEDULED JOBS ────────────────────────────────────────────
// 05:00 UTC = 08:00 Erbil time (UTC+3) — runs once daily
cron.schedule('0 5 * * *', () => {
  void syncFXRates('scheduled').catch((err) => {
    log.error({ err }, 'scheduled FX sync threw unexpected error')
  })
})
log.info({ cron: '0 5 * * *' }, 'FX daily sync cron registered')

// Staleness check: every 6 hours
cron.schedule('0 */6 * * *', () => {
  void runStalenessCheck().catch((err) => {
    log.error({ err }, 'FX staleness check failed')
  })
})
log.info({ cron: '0 */6 * * *' }, 'FX staleness check cron registered')

const TRACKED_PAIRS = [
  { from: 'USD', to: 'IQD' },
  { from: 'EUR', to: 'IQD' },
  { from: 'GBP', to: 'IQD' },
]

async function runStalenessCheck(): Promise<void> {
  const runId = await startJobRun('fx-staleness-check')
  try {
  const companies = await pool.query<{ id: string }>(
    `SELECT id FROM companies WHERE is_active = true`,
  )

  for (const company of companies.rows) {
    const statuses = await checkRateStaleness(company.id, TRACKED_PAIRS)

    for (const status of statuses) {
      if (status.status === 'critical' || status.status === 'missing') {
        await pool.query(
          `INSERT INTO service_outbox (service, event_type, payload)
           VALUES ('notifications','FX_RATE_STALE_ALERT',$1::jsonb)`,
          [
            JSON.stringify({
              companyId: company.id,
              currencyPair: status.currencyPair,
              status: status.status,
              ageHours: status.ageHours,
              lastRate: status.lastRate,
              message: status.message,
            }),
          ],
        )
      }
    }
  }
  await finishJobRun(runId)
  } catch (err) {
    await failJobRun(runId, err instanceof Error ? err.message : String(err))
    throw err
  }
}
