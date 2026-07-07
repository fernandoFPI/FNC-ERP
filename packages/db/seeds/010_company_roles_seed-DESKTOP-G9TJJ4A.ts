import type { PoolClient } from 'pg'

const COMPANIES = [
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

const VIRTUAL_LOCATIONS = [
  { companyId: '00000000-0000-0000-0000-000000000001', name: 'Virtual Receipts', code: 'VIR-NYK-IN', type: 'virtual_in' },
  { companyId: '00000000-0000-0000-0000-000000000001', name: 'Virtual Consumption', code: 'VIR-NYK-OUT', type: 'virtual_out' },
  { companyId: '00000000-0000-0000-0000-000000000002', name: 'Virtual Receipts', code: 'VIR-NF-IN', type: 'virtual_in' },
  { companyId: '00000000-0000-0000-0000-000000000002', name: 'Virtual Consumption', code: 'VIR-NF-OUT', type: 'virtual_out' },
  { companyId: '00000000-0000-0000-0000-000000000003', name: 'Virtual Receipts', code: 'VIR-AWC-IN', type: 'virtual_in' },
  { companyId: '00000000-0000-0000-0000-000000000003', name: 'Virtual Consumption', code: 'VIR-AWC-OUT', type: 'virtual_out' },
]

export async function seedCompanyRoles(client: PoolClient, adminEmail = 'admin@fnc-erp.local'): Promise<void> {
  // Ensure all three companies exist
  for (const company of COMPANIES) {
    await client.query(
      `INSERT INTO companies (id, name, legal_name, country_code, currency_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [company.id, company.name, company.legal_name, company.country_code, company.currency_code],
    )
  }
  console.warn('[seed] Company upserts confirmed.')

  // Ensure virtual stock locations exist for all companies
  for (const loc of VIRTUAL_LOCATIONS) {
    await client.query(
      `INSERT INTO stock_locations (company_id, name, code, type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, code) DO NOTHING`,
      [loc.companyId, loc.name, loc.code, loc.type],
    )
  }
  console.warn('[seed] Virtual stock locations confirmed for all companies.')

  // Ensure admin user has system_admin role for all companies
  const result = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [adminEmail])
  if ((result.rowCount ?? 0) === 0) {
    console.warn(`[seed] Admin user ${adminEmail} not found — skipping role assignment.`)
    return
  }
  const adminId = result.rows[0]!.id
  for (const company of COMPANIES) {
    await client.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module, is_active)
       VALUES ($1, $2, 'system_admin', 'all', true)
       ON CONFLICT (user_id, company_id, module) DO NOTHING`,
      [adminId, company.id],
    )
  }
  console.warn('[seed] Admin company roles confirmed for all companies.')
}
