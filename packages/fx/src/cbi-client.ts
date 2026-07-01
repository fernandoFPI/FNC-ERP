import { logger } from '@fnc-erp/logger'

const log = logger.child({ module: 'cbi-client' })

export interface FetchedRate {
  fromCurrency: string
  toCurrency: string
  rate: number
  rateDate: Date
  source: string
}

// ── RATE VALIDATION ───────────────────────────────────────────
// Sanity bounds for IQD rates (as of 2025).
// Wide enough to accommodate genuine market movements.
const RATE_BOUNDS: Record<string, { min: number; max: number }> = {
  'USD/IQD': { min: 1000, max: 2000 },
  'EUR/IQD': { min: 1000, max: 2500 },
  'GBP/IQD': { min: 1200, max: 3000 },
  'IQD/USD': { min: 0.0004, max: 0.001 },
  'IQD/EUR': { min: 0.0003, max: 0.001 },
  'IQD/GBP': { min: 0.0002, max: 0.001 },
}

export interface RateValidationResult {
  valid: boolean
  reason?: string
}

export function validateRate(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): RateValidationResult {
  if (!rate || rate <= 0) {
    return { valid: false, reason: `Rate must be positive, got: ${rate}` }
  }

  const key = `${fromCurrency}/${toCurrency}`
  const bounds = RATE_BOUNDS[key]
  if (bounds) {
    if (rate < bounds.min || rate > bounds.max) {
      return {
        valid: false,
        reason: `Rate ${rate} for ${key} is outside expected bounds [${bounds.min}, ${bounds.max}]. Manual review required.`,
      }
    }
  }

  return { valid: true }
}

// ── PRIMARY SOURCE: ExchangeRate-API ─────────────────────────
// Free tier: 1500 req/month.  Sign up at https://www.exchangerate-api.com
export async function fetchFromExchangeRateAPI(apiKey: string): Promise<FetchedRate[]> {
  const BASE_CURRENCY = 'IQD'
  const TARGET_CURRENCIES = ['USD', 'EUR', 'GBP']
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${BASE_CURRENCY}`

  log.info({ url: url.replace(apiKey, '***') }, 'fetching rates from ExchangeRate-API')

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })

  if (!response.ok) {
    throw new Error(
      `ExchangeRate-API returned ${response.status}: ${await response.text()}`,
    )
  }

  const data = (await response.json()) as {
    result: string
    time_last_update_utc: string
    conversion_rates: Record<string, number>
  }

  if (data.result !== 'success') {
    throw new Error(`ExchangeRate-API error: ${data.result}`)
  }

  const rateDate = new Date(data.time_last_update_utc)
  const rates: FetchedRate[] = []

  for (const currency of TARGET_CURRENCIES) {
    const iqdPerForeign = data.conversion_rates[currency]
    if (!iqdPerForeign || iqdPerForeign === 0) continue

    // ExchangeRate-API gives IQD→foreign (how many foreign per 1 IQD).
    // Invert to get foreign→IQD (how many IQD per 1 foreign unit).
    const rate = 1 / iqdPerForeign

    rates.push({ fromCurrency: currency, toCurrency: 'IQD', rate, rateDate, source: 'exchangerate_api' })
    rates.push({ fromCurrency: 'IQD', toCurrency: currency, rate: iqdPerForeign, rateDate, source: 'exchangerate_api' })
  }

  log.info({ count: rates.length }, 'rates fetched from ExchangeRate-API')
  return rates
}

// ── SECONDARY SOURCE: Open Exchange Rates ────────────────────
// Free tier: 1000 req/month, USD base only.
// Used as fallback when ExchangeRate-API is unavailable.
export async function fetchFromOpenExchangeRates(appId: string): Promise<FetchedRate[]> {
  const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}&base=USD&symbols=IQD,EUR,GBP`

  log.info('fetching rates from Open Exchange Rates (fallback)')

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })

  if (!response.ok) {
    throw new Error(`Open Exchange Rates returned ${response.status}`)
  }

  const data = (await response.json()) as {
    timestamp: number
    rates: Record<string, number>
  }

  const rateDate = new Date(data.timestamp * 1000)
  const usdToIqd = data.rates['IQD']
  if (!usdToIqd) throw new Error('IQD rate not found in Open Exchange Rates response')

  const rates: FetchedRate[] = []

  rates.push({ fromCurrency: 'USD', toCurrency: 'IQD', rate: usdToIqd, rateDate, source: 'open_exchange_rates' })
  rates.push({ fromCurrency: 'IQD', toCurrency: 'USD', rate: 1 / usdToIqd, rateDate, source: 'open_exchange_rates' })

  if (data.rates['EUR']) {
    const eurToUsd = 1 / data.rates['EUR']
    const eurToIqd = eurToUsd * usdToIqd
    rates.push({ fromCurrency: 'EUR', toCurrency: 'IQD', rate: eurToIqd, rateDate, source: 'open_exchange_rates' })
    rates.push({ fromCurrency: 'IQD', toCurrency: 'EUR', rate: 1 / eurToIqd, rateDate, source: 'open_exchange_rates' })
  }

  if (data.rates['GBP']) {
    const gbpToUsd = 1 / data.rates['GBP']
    const gbpToIqd = gbpToUsd * usdToIqd
    rates.push({ fromCurrency: 'GBP', toCurrency: 'IQD', rate: gbpToIqd, rateDate, source: 'open_exchange_rates' })
    rates.push({ fromCurrency: 'IQD', toCurrency: 'GBP', rate: 1 / gbpToIqd, rateDate, source: 'open_exchange_rates' })
  }

  log.info({ count: rates.length }, 'rates fetched from Open Exchange Rates')
  return rates
}
