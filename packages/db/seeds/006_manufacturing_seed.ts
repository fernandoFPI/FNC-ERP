import { type PoolClient } from 'pg'

const FACTORY_COMPANY_ID = '00000000-0000-0000-0000-000000000002'

const workCenters = [
  { id: '20000000-0000-0000-0000-000000000001', code: 'WC-STEEL', name: 'Steel Fabrication', cost_per_hour: 25000 },
  { id: '20000000-0000-0000-0000-000000000002', code: 'WC-WELD',  name: 'Welding Bay',       cost_per_hour: 20000 },
  { id: '20000000-0000-0000-0000-000000000003', code: 'WC-ASSEM', name: 'Assembly Line',     cost_per_hour: 15000 },
  { id: '20000000-0000-0000-0000-000000000004', code: 'WC-FINISH',name: 'Finishing',         cost_per_hour: 12000 },
]

export async function seedManufacturing(client: PoolClient): Promise<void> {
  for (const wc of workCenters) {
    await client.query(
      `INSERT INTO work_centers (id, company_id, code, name, cost_per_hour, currency_code, capacity_hours_per_day)
       VALUES ($1, $2, $3, $4, $5, 'IQD', 8)
       ON CONFLICT (company_id, code) DO NOTHING`,
      [wc.id, FACTORY_COMPANY_ID, wc.code, wc.name, wc.cost_per_hour],
    )
    console.warn(`[seed] Work center seeded: ${wc.name}`)
  }
}
