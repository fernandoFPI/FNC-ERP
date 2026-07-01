import { query } from '@fnc-erp/db'

const COMPANY_PREFIXES: Record<string, string> = {
  '00000000-0000-0000-0000-000000000001': 'NYK',
  '00000000-0000-0000-0000-000000000002': 'NF',
  '00000000-0000-0000-0000-000000000003': 'AWC',
}

export async function generateMONumber(companyId: string): Promise<string> {
  const prefix = COMPANY_PREFIXES[companyId] ?? 'GEN'
  const year = new Date().getFullYear()
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM manufacturing_orders WHERE company_id = $1 AND mo_number LIKE $2`,
    [companyId, `MO-${prefix}-${year}-%`],
  )
  const seq = parseInt(result.rows[0]?.['count'] ?? '0') + 1
  return `MO-${prefix}-${year}-${String(seq).padStart(4, '0')}`
}
