import { type PoolClient } from 'pg'

const ADMIN_ID = '00000000-0000-0000-0000-000000000099' // placeholder; updated at runtime

const sampleProjects = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000001', // Nishtimani Yakam
    code: 'PRJ-NYK-001',
    name: 'Erbil Residential Complex Phase 1',
    project_type: 'construction',
    budget_amount: 500_000_000,
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    company_id: '00000000-0000-0000-0000-000000000002', // Nishtimani Factory
    code: 'PRJ-NF-001',
    name: 'Prefab Units Production Batch 1',
    project_type: 'manufacturing',
    budget_amount: 150_000_000,
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    company_id: '00000000-0000-0000-0000-000000000003', // Al Watanyia
    code: 'PRJ-AWC-001',
    name: 'Baghdad Office Tower EPC',
    project_type: 'epc',
    budget_amount: 2_000_000_000,
  },
]

export async function seedProjects(client: PoolClient, adminId: string): Promise<void> {
  for (const p of sampleProjects) {
    await client.query(
      `INSERT INTO projects
         (id, company_id, code, name, project_type, budget_amount, budget_currency, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,'IQD',$7,'pending')
       ON CONFLICT (company_id, code) DO NOTHING`,
      [p.id, p.company_id, p.code, p.name, p.project_type, p.budget_amount, adminId],
    )
    console.warn(`[seed] Project seeded: ${p.name}`)
  }
}
