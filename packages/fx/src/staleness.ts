import { query } from '@fnc-erp/db'

export interface RateStalenessStatus {
  currencyPair: string
  lastRateDate: Date | null
  ageHours: number | null
  status: 'fresh' | 'warn' | 'critical' | 'missing'
  lastRate: number | null
  message: string
}

export async function checkRateStaleness(
  companyId: string,
  currencyPairs: { from: string; to: string }[],
): Promise<RateStalenessStatus[]> {
  const configResult = await query<{ warn_after_hours: number; critical_after_hours: number }>(
    `SELECT warn_after_hours, critical_after_hours
     FROM fx_rate_alert_config
     WHERE company_id = $1`,
    [companyId],
  )
  const warnAfterHours = configResult.rows[0]?.warn_after_hours ?? 48
  const criticalAfterHours = configResult.rows[0]?.critical_after_hours ?? 96

  const statuses: RateStalenessStatus[] = []

  for (const pair of currencyPairs) {
    const result = await query<{ rate: string; rate_date: string }>(
      `SELECT rate, rate_date
       FROM fx_rates
       WHERE from_currency = $1 AND to_currency = $2
       ORDER BY rate_date DESC
       LIMIT 1`,
      [pair.from, pair.to],
    )

    const latest = result.rows[0]

    if (!latest) {
      statuses.push({
        currencyPair: `${pair.from}/${pair.to}`,
        lastRateDate: null,
        ageHours: null,
        status: 'missing',
        lastRate: null,
        message: `No ${pair.from}/${pair.to} rate found. Please enter a rate manually.`,
      })
      continue
    }

    const rateDate = new Date(latest.rate_date)
    const ageHours = (Date.now() - rateDate.getTime()) / 3_600_000

    let status: RateStalenessStatus['status']
    let message: string

    if (ageHours >= criticalAfterHours) {
      status = 'critical'
      message = `${pair.from}/${pair.to} rate is ${Math.floor(ageHours)} hours old. Financial entries using this rate may be inaccurate.`
    } else if (ageHours >= warnAfterHours) {
      status = 'warn'
      message = `${pair.from}/${pair.to} rate is ${Math.floor(ageHours)} hours old. Consider updating.`
    } else {
      status = 'fresh'
      message = `${pair.from}/${pair.to} rate is current.`
    }

    statuses.push({
      currencyPair: `${pair.from}/${pair.to}`,
      lastRateDate: rateDate,
      ageHours: Math.round(ageHours * 10) / 10,
      status,
      lastRate: parseFloat(latest.rate),
      message,
    })
  }

  return statuses
}

export async function getLastKnownRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<{ rate: number; rateDate: Date; ageHours: number } | null> {
  const result = await query<{ rate: string; rate_date: string }>(
    `SELECT rate, rate_date
     FROM fx_rates
     WHERE from_currency = $1 AND to_currency = $2
     ORDER BY rate_date DESC
     LIMIT 1`,
    [fromCurrency, toCurrency],
  )

  if (!result.rows[0]) return null

  const rateDate = new Date(result.rows[0].rate_date)
  const ageHours = (Date.now() - rateDate.getTime()) / 3_600_000

  return {
    rate: parseFloat(result.rows[0].rate),
    rateDate,
    ageHours: Math.round(ageHours * 10) / 10,
  }
}
