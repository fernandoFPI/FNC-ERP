import type { PoolClient } from 'pg'

const COMPANY_IDS = {
  YAKAM: '00000000-0000-0000-0000-000000000001',
  FACTORY: '00000000-0000-0000-0000-000000000002',
  WATANYIA: '00000000-0000-0000-0000-000000000003',
}

interface LocationDef {
  companyKey: keyof typeof COMPANY_IDS
  name: string
  code: string
  type: 'warehouse' | 'site' | 'transit' | 'virtual_in' | 'virtual_out'
}

const locations: LocationDef[] = [
  // Nishtimani Factory
  { companyKey: 'FACTORY', name: 'Main Warehouse', code: 'WH-NF-01', type: 'warehouse' },
  { companyKey: 'FACTORY', name: 'Virtual Receipts', code: 'VIR-NF-IN', type: 'virtual_in' },
  { companyKey: 'FACTORY', name: 'Virtual Consumption', code: 'VIR-NF-OUT', type: 'virtual_out' },
  { companyKey: 'FACTORY', name: 'Transit (Factory → Site)', code: 'TRANSIT-01', type: 'transit' },
  // Nishtimani Yakam
  { companyKey: 'YAKAM', name: 'Main Warehouse', code: 'WH-NYK-01', type: 'warehouse' },
  { companyKey: 'YAKAM', name: 'Site Store', code: 'SITE-NYK-01', type: 'site' },
  { companyKey: 'YAKAM', name: 'Virtual Receipts', code: 'VIR-NYK-IN', type: 'virtual_in' },
  { companyKey: 'YAKAM', name: 'Virtual Consumption', code: 'VIR-NYK-OUT', type: 'virtual_out' },
  // Al Watanyia
  { companyKey: 'WATANYIA', name: 'Baghdad Site Store', code: 'SITE-AWC-01', type: 'site' },
  { companyKey: 'WATANYIA', name: 'Virtual Receipts', code: 'VIR-AWC-IN', type: 'virtual_in' },
]

export async function seedStockLocations(client: PoolClient): Promise<void> {
  for (const loc of locations) {
    const companyId = COMPANY_IDS[loc.companyKey]
    await client.query(
      `INSERT INTO stock_locations (company_id, name, code, type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, code) DO NOTHING`,
      [companyId, loc.name, loc.code, loc.type],
    )
  }
  console.warn('[seed] Stock locations seeded.')
}
