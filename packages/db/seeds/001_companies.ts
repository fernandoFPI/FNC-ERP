import { type PoolClient } from 'pg'

export const companies = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Nishtimani Yakam',
    legal_name: 'Nishtimani Yakam Company',
    country_code: 'IQ',
    currency_code: 'IQD',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Nishtimani Factory',
    legal_name: 'Nishtimani Factory',
    country_code: 'IQ',
    currency_code: 'IQD',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Al Watanyia',
    legal_name: 'Al Watanyia Company',
    country_code: 'IQ',
    currency_code: 'IQD',
  },
]

export async function seedCompanies(client: PoolClient): Promise<void> {
  for (const company of companies) {
    await client.query(
      `INSERT INTO companies (id, name, legal_name, country_code, currency_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [company.id, company.name, company.legal_name, company.country_code, company.currency_code],
    )
    console.warn(`[seed] Company seeded: ${company.name}`)
  }
}
