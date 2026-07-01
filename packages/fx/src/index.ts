export {
  resolveTransferPrice,
  TransferPricingError,
  type TransferPricingMethod,
  type TransferPriceResult,
  type ResolveTransferPriceParams,
} from './transfer-pricing.js'

export {
  fetchFromExchangeRateAPI,
  fetchFromOpenExchangeRates,
  validateRate,
  type FetchedRate,
  type RateValidationResult,
} from './cbi-client.js'

export {
  checkRateStaleness,
  getLastKnownRate,
  type RateStalenessStatus,
} from './staleness.js'

import { query } from '@fnc-erp/db'

export class FXRateNotFoundError extends Error {
  constructor(
    public readonly fromCurrency: string,
    public readonly toCurrency: string,
    public readonly onDate: Date,
  ) {
    super(
      `No FX rate found for ${fromCurrency}/${toCurrency} on or before ${onDate.toISOString().slice(0, 10)}`,
    )
    this.name = 'FXRateNotFoundError'
  }
}

interface FXRateRow {
  rate: string
  rate_date: string
}

// ── getRate ───────────────────────────────────────────────────
// Returns the rate as a plain number (backward-compatible).
// All existing callers (journals.ts, etc.) use this signature.
export async function getRate(
  fromCurrency: string,
  toCurrency: string,
  onDate: Date,
): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  const dateStr = onDate.toISOString().slice(0, 10)

  const result = await query<FXRateRow>(
    `SELECT rate, rate_date
     FROM fx_rates
     WHERE from_currency = $1
       AND to_currency   = $2
       AND rate_date    <= $3
     ORDER BY rate_date DESC
     LIMIT 1`,
    [fromCurrency, toCurrency, dateStr],
  )

  const row = result.rows[0]
  if (!row) throw new FXRateNotFoundError(fromCurrency, toCurrency, onDate)

  return parseFloat(row.rate)
}

// ── getRateWithMeta ───────────────────────────────────────────
// Returns rate plus staleness metadata.
// Used by the finance service staleness check and new FX workflows.
export async function getRateWithMeta(
  fromCurrency: string,
  toCurrency: string,
  onDate: Date,
): Promise<{ rate: number; rateDate: Date; isStale: boolean; ageHours: number }> {
  if (fromCurrency === toCurrency) {
    return { rate: 1, rateDate: onDate, isStale: false, ageHours: 0 }
  }

  const dateStr = onDate.toISOString().slice(0, 10)

  const result = await query<FXRateRow>(
    `SELECT rate, rate_date
     FROM fx_rates
     WHERE from_currency = $1
       AND to_currency   = $2
       AND rate_date    <= $3
     ORDER BY rate_date DESC
     LIMIT 1`,
    [fromCurrency, toCurrency, dateStr],
  )

  const row = result.rows[0]
  if (!row) throw new FXRateNotFoundError(fromCurrency, toCurrency, onDate)

  const rateDate = new Date(row.rate_date)
  const ageHours = (onDate.getTime() - rateDate.getTime()) / 3_600_000

  return {
    rate: parseFloat(row.rate),
    rateDate,
    isStale: ageHours > 48,
    ageHours: Math.round(ageHours * 10) / 10,
  }
}

// ── convert ───────────────────────────────────────────────────
// Original convert — backward-compatible.
export async function convert(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  onDate: Date,
): Promise<{ convertedAmount: number; rate: number; rateDate: Date }> {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, rate: 1, rateDate: onDate }
  }

  const dateStr = onDate.toISOString().slice(0, 10)

  const result = await query<FXRateRow>(
    `SELECT rate, rate_date
     FROM fx_rates
     WHERE from_currency = $1
       AND to_currency   = $2
       AND rate_date    <= $3
     ORDER BY rate_date DESC
     LIMIT 1`,
    [fromCurrency, toCurrency, dateStr],
  )

  const row = result.rows[0]
  if (!row) throw new FXRateNotFoundError(fromCurrency, toCurrency, onDate)

  const rate = parseFloat(row.rate)
  return {
    convertedAmount: Math.round(amount * rate * 10000) / 10000,
    rate,
    rateDate: new Date(row.rate_date),
  }
}

export async function seedDevRates(): Promise<void> {
  const rates = [
    { from: 'USD', to: 'IQD', rate: 1310.0, date: '2025-01-01' },
    { from: 'EUR', to: 'IQD', rate: 1425.0, date: '2025-01-01' },
    { from: 'GBP', to: 'IQD', rate: 1650.0, date: '2025-01-01' },
    { from: 'IQD', to: 'USD', rate: 0.000763, date: '2025-01-01' },
    { from: 'IQD', to: 'EUR', rate: 0.000702, date: '2025-01-01' },
    { from: 'IQD', to: 'GBP', rate: 0.000606, date: '2025-01-01' },
  ]

  for (const r of rates) {
    await query(
      `INSERT INTO fx_rates (from_currency, to_currency, rate, rate_date, source)
       VALUES ($1, $2, $3, $4, 'manual')
       ON CONFLICT (from_currency, to_currency, rate_date) DO UPDATE SET rate = EXCLUDED.rate`,
      [r.from, r.to, r.rate, r.date],
    )
  }
}
