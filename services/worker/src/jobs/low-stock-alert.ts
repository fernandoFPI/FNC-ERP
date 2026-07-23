import { pool } from '@fnc-erp/db'

interface LowStockRow {
  company_id: string
  company_name: string
  product_id: string
  product_name: string
  qty_on_hand: number
  reorder_point: number
}

interface AdminRow {
  user_id: string
}

/**
 * Checks all products against their reorder_point. Sends an in-app notification
 * to company admins for any product below its threshold.
 * Designed to be called by a cron job (e.g. daily at 06:00).
 */
export async function sendLowStockAlerts(): Promise<void> {
  console.warn('[worker] Running low-stock alert job')

  const result = await pool.query<LowStockRow>(`
    SELECT p.company_id, c.name AS company_name,
           p.id AS product_id, p.name AS product_name,
           COALESCE(sb.qty_on_hand, 0) AS qty_on_hand,
           p.reorder_point
    FROM products p
    JOIN companies c ON c.id = p.company_id
    LEFT JOIN stock_balances sb ON sb.product_id = p.id
    WHERE p.is_active = TRUE
      AND p.reorder_point IS NOT NULL
      AND COALESCE(sb.qty_on_hand, 0) <= p.reorder_point
  `)

  if (result.rowCount === 0) {
    console.warn('[worker] No low-stock products found')
    return
  }

  // Group by company for bulk notification
  const byCompany = new Map<string, LowStockRow[]>()
  for (const row of result.rows) {
    const existing = byCompany.get(row.company_id) ?? []
    existing.push(row)
    byCompany.set(row.company_id, existing)
  }

  for (const [companyId, items] of byCompany) {
    const companyName = items[0]!.company_name

    const admins = await pool.query<AdminRow>(
      `SELECT DISTINCT user_id FROM user_company_roles WHERE company_id = $1 AND role IN ('company_admin','system_admin') AND is_active = TRUE`,
      [companyId],
    )

    for (const admin of admins.rows) {
      const productList = items.map(i => `${i.product_name} (${i.qty_on_hand} ≤ ${i.reorder_point})`).join(', ')
      await pool.query(
        `INSERT INTO notifications (company_id, user_id, type, title, body, data)
         VALUES ($1,$2,'LOW_STOCK_ALERT','Low Stock Alert',$3,$4)`,
        [
          companyId, admin.user_id,
          `${items.length} product(s) at or below reorder point in ${companyName}: ${productList}`,
          JSON.stringify({ product_ids: items.map(i => i.product_id) }),
        ],
      )
    }
    console.warn(`[worker] Low-stock alerts sent for ${items.length} products in ${companyName}`)
  }
}
