import { query, type PoolClient } from '@fnc-erp/db'

export interface AuditParams {
  userId: string
  companyId: string | undefined
  action: string
  tableName?: string | undefined
  recordId?: string | undefined
  oldValues?: Record<string, unknown> | undefined
  newValues?: Record<string, unknown> | undefined
  ipAddress?: string | undefined
  userAgent?: string | undefined
  client?: PoolClient | undefined
}

const INSERT_SQL = `
  INSERT INTO audit_log
    (user_id, company_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9)
`

export async function logAudit(params: AuditParams): Promise<void> {
  const values = [
    params.userId || null,
    params.companyId || null,
    params.action,
    params.tableName ?? null,
    params.recordId ?? null,
    params.oldValues ? JSON.stringify(params.oldValues) : null,
    params.newValues ? JSON.stringify(params.newValues) : null,
    params.ipAddress ?? null,
    params.userAgent ?? null,
  ]

  try {
    if (params.client) {
      await params.client.query(INSERT_SQL, values)
    } else {
      await query(INSERT_SQL, values)
    }
  } catch (err) {
    // Audit failure must never break the main operation
    console.error('[audit] Failed to write audit log:', err)
  }
}
