// What a Store Out (and a return of its stock) costs a project, and in WHICH currency (playbook #94).
//
// issueMaterialIssue used to write one project_cost_actuals row per Store Out, always labelled 'IQD', and a return of stock
// offset it with another 'IQD' literal. A Store Out line has a unit cost but no currency, and most of what the group issues
// is priced in USD, so the project's USD Actual was understated and its IQD Actual overstated by the same amount
// (NY-PRJ-2026-0032: 174 USD-priced lines, 2,470.57 USD, inside a 99,835.60 "IQD" row).
//
// The currency of a line is the cost currency of its PRODUCT (`products.cost_currency`: the one Cost the group corrects and
// the one the domain rules call the trusted one, not the label of a stock location). A product with no cost currency stays
// 'IQD', exactly as before: nothing is ever guessed. Nothing is converted, and one Store Out of USD and IQD items gets one
// cost row per currency (migration 325: unique on source_id + currency_code).
//
// One SQL fragment decides the currency for the confirm AND the return, so the two cannot drift.

import type { PoolClient } from '@fnc-erp/db'
import type { RunQuery } from './costControlPurchases.js'

/** What a product with no cost currency is booked in: today's label, kept so nothing changes for those products. */
export const STOCK_COST_FALLBACK_CURRENCY = 'IQD'

/**
 * SQL expression for the cost currency of a product, for a table alias of `products` in scope. Empty or missing is the
 * fallback; the code is upper-cased and trimmed so a stray space or lower case cannot create a second "currency".
 */
export function stockCostCurrencySql(productAlias: string): string {
  return `COALESCE(NULLIF(btrim(upper(${productAlias}.cost_currency)), ''), '${STOCK_COST_FALLBACK_CURRENCY}')`
}

export interface StockIssueCostRow {
  currency_code: string
  /** NUMERIC kept as text, summed in SQL. */
  amount: string
}

/** What a Store Out costs, one entry per currency, from its own lines. Only currencies with something to charge. */
export async function stockIssueCostByCurrency(
  run: RunQuery,
  issueId: string,
): Promise<StockIssueCostRow[]> {
  const r = await run(
    `SELECT ${stockCostCurrencySql('pr')} AS currency_code, SUM(il.total_cost)::text AS amount
       -- currency-safe: GROUP BY 1 is the currency expression above, one total per product cost currency
       FROM project_material_issue_lines il
       LEFT JOIN products pr ON pr.id = il.product_id
      WHERE il.issue_id = $1
      GROUP BY 1
     HAVING SUM(il.total_cost) > 0
      ORDER BY 1`,
    [issueId],
  )
  return r.rows as StockIssueCostRow[]
}

/**
 * Books a confirmed Store Out's cost on its project, one row per currency. Idempotent: a second call for the same Store Out
 * updates the rows instead of doubling them, and removes a currency the Store Out no longer has. Runs on the confirming
 * transaction's own client, so it commits or rolls back with the stock move.
 */
export async function bookStockIssueCost(
  client: Pick<PoolClient, 'query'>,
  projectId: string,
  issueId: string,
): Promise<StockIssueCostRow[]> {
  const rows = await stockIssueCostByCurrency((text, params) => client.query(text, params), issueId)
  for (const row of rows) {
    await client.query(
      `INSERT INTO project_cost_actuals (project_id, source_type, source_id, cost_category, amount, currency_code, entry_date)
       VALUES ($1, 'stock_issue', $2, 'materials', $3::numeric, $4, NOW()::date)
       ON CONFLICT (source_id, currency_code) WHERE source_type = 'stock_issue' AND source_id IS NOT NULL
       DO UPDATE SET amount = EXCLUDED.amount`,
      [projectId, issueId, row.amount, row.currency_code],
    )
  }
  await client.query(
    `DELETE FROM project_cost_actuals
      WHERE source_type = 'stock_issue' AND source_id = $1 AND currency_code <> ALL($2::text[])`,
    [issueId, rows.map((r) => r.currency_code)],
  )
  return rows
}
