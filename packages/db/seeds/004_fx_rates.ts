import type { PoolClient } from 'pg'

const rates = [
  { from: 'USD', to: 'IQD', rate: 1310.0, date: '2025-01-01' },
  { from: 'EUR', to: 'IQD', rate: 1425.0, date: '2025-01-01' },
  { from: 'GBP', to: 'IQD', rate: 1650.0, date: '2025-01-01' },
  { from: 'IQD', to: 'USD', rate: 0.000763, date: '2025-01-01' },
  { from: 'IQD', to: 'EUR', rate: 0.000702, date: '2025-01-01' },
  { from: 'IQD', to: 'GBP', rate: 0.000606, date: '2025-01-01' },
]

export async function seedFxRates(client: PoolClient): Promise<void> {
  for (const r of rates) {
    await client.query(
      `INSERT INTO fx_rates (from_currency, to_currency, rate, rate_date, source)
       VALUES ($1, $2, $3, $4, 'manual')
       ON CONFLICT (from_currency, to_currency, rate_date)
       DO UPDATE SET rate = EXCLUDED.rate`,
      [r.from, r.to, r.rate, r.date],
    )
  }
  console.warn('[seed] FX rates seeded.')
}
