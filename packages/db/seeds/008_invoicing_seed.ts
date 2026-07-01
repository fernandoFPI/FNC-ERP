import { type PoolClient } from 'pg'

// Project IDs created in seed 007
const PROJECTS = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000001',
    contract_number: 'CNT-NYK-2025-001',
    contract_name: 'Erbil Residential Complex — Main Contract',
    client_name: 'Erbil Development Authority',
    contract_value: 500_000_000,
    milestones: [
      { name: 'Site preparation and foundation', sequence: 1, billable_amount: 100_000_000 },
      { name: 'Structure and superstructure', sequence: 2, billable_amount: 200_000_000 },
      { name: 'MEP and finishing', sequence: 3, billable_amount: 150_000_000 },
      { name: 'Handover and retention release', sequence: 4, billable_amount: 50_000_000 },
    ],
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    company_id: '00000000-0000-0000-0000-000000000002',
    contract_number: 'CNT-NF-2025-001',
    contract_name: 'Prefab Units Production Contract',
    client_name: 'Nishtimani Group HQ',
    contract_value: 150_000_000,
    milestones: [
      { name: 'Design and engineering sign-off', sequence: 1, billable_amount: 15_000_000 },
      { name: 'First 50 units delivered', sequence: 2, billable_amount: 65_000_000 },
      { name: 'Remaining units and handover', sequence: 3, billable_amount: 70_000_000 },
    ],
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    company_id: '00000000-0000-0000-0000-000000000003',
    contract_number: 'CNT-AWC-2025-001',
    contract_name: 'Baghdad Office Tower EPC — Main Contract',
    client_name: 'Baghdad Investment Authority',
    contract_value: 2_000_000_000,
    milestones: [
      { name: 'Foundation and piling', sequence: 1, billable_amount: 300_000_000 },
      { name: 'Structure to level 10', sequence: 2, billable_amount: 500_000_000 },
      { name: 'Structure to level 20 (top)', sequence: 3, billable_amount: 500_000_000 },
      { name: 'MEP rough-in', sequence: 4, billable_amount: 400_000_000 },
      { name: 'Fit-out and finishing', sequence: 5, billable_amount: 200_000_000 },
      { name: 'Handover and retention release', sequence: 6, billable_amount: 100_000_000 },
    ],
  },
]

export async function seedInvoicing(client: PoolClient, adminId: string): Promise<void> {
  for (const p of PROJECTS) {
    // Check project exists (seed 007 may not have run in test env)
    const proj = await client.query('SELECT id FROM projects WHERE id=$1', [p.id])
    if (!proj.rows[0]) {
      console.warn(`[seed] Skipping invoicing seed for project ${p.id} — project not found`)
      continue
    }

    // Create contract
    const contractResult = await client.query<{ id: string }>(
      `INSERT INTO project_contracts
         (project_id, company_id, contract_number, contract_name, client_name,
          contract_value, currency_code, default_billing_method, retention_pct,
          payment_terms_days, contract_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'IQD','milestone',0.10,30,CURRENT_DATE,$7)
       ON CONFLICT (company_id, contract_number) DO NOTHING RETURNING id`,
      [
        p.id,
        p.company_id,
        p.contract_number,
        p.contract_name,
        p.client_name,
        p.contract_value,
        adminId,
      ],
    )

    if (!contractResult.rows[0]) {
      // Already exists — skip milestones too
      console.warn(`[seed] Contract ${p.contract_number} already exists, skipping`)
      continue
    }

    const contractId = contractResult.rows[0].id
    console.warn(`[seed] Contract seeded: ${p.contract_name}`)

    for (const m of p.milestones) {
      await client.query(
        `INSERT INTO project_milestones
           (contract_id, project_id, name, sequence, billable_amount, currency_code, status)
         VALUES ($1,$2,$3,$4,$5,'IQD',
           CASE WHEN $4 = 1 THEN 'reached' ELSE 'pending' END)
         ON CONFLICT DO NOTHING`,
        [contractId, p.id, m.name, m.sequence, m.billable_amount],
      )
      console.warn(
        `[seed] Milestone seeded: ${m.name} (${m.sequence === 1 ? 'reached' : 'pending'})`,
      )
    }
  }
}
