import { type PoolClient } from 'pg'

export const companies = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Nishtimani Yakam',
    legal_name: 'Nishtimani Yakam Company',
    country_code: 'IQ',
    currency_code: 'IQD',
    is_central_warehouse: false,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Nishtimani Factory',
    legal_name: 'Nishtimani Factory',
    country_code: 'IQ',
    currency_code: 'IQD',
    // Holds essentially all real on-hand stock across the group — see
    // migration 280. Set directly here (not left to that migration's own
    // data-fixing UPDATE alone) because migrations always run before seeds:
    // on a fresh DB that UPDATE fires before this row exists and silently
    // matches nothing, leaving the flag at its false default forever. An
    // existing row (ON CONFLICT DO NOTHING below) keeps whatever value it
    // already has, so this never fights the migration on a real deployment.
    is_central_warehouse: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Al Watanyia',
    legal_name: 'Al Watanyia Company',
    country_code: 'IQ',
    currency_code: 'IQD',
    is_central_warehouse: false,
  },
]

export async function seedCompanies(client: PoolClient): Promise<void> {
  for (const company of companies) {
    await client.query(
      `INSERT INTO companies (id, name, legal_name, country_code, currency_code, is_central_warehouse)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        company.id,
        company.name,
        company.legal_name,
        company.country_code,
        company.currency_code,
        company.is_central_warehouse,
      ],
    )
    console.warn(`[seed] Company seeded: ${company.name}`)
  }
}
