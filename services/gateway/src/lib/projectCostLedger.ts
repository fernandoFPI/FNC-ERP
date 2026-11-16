// A project's cost ledger, as a list (playbook #92).
//
// A project's cost lives in `project_cost_actuals`, read through `v_project_cost_by_currency` (migration 304: posted journals
// only): jobsite deliveries, Store Outs, returns and any posted journal line tagged with the project's analytic account. The
// analytic account page used to list ONLY tagged journal lines, and almost nothing is tagged on purpose (an advance
// settlement of a delivery that is already booked must not tag the project a second time, playbook #84b), so the page of
// every project with real cost said "No journal lines yet". This is the missing list.
//
// Rules:
//  * the caller proves they may see the project (`requireProjectViewGW`) before calling this; the queries are scoped to the
//    company on the project and on every document they name, so a reference never reveals another company's number;
//  * a row whose journal is not posted is not listed, exactly like the view the header reads (the totals come FROM the view,
//    and a test checks that the listed rows add up to them);
//  * money is NUMERIC kept as text, per currency, never converted or added across currencies.

import type { RunQuery } from './costControlPurchases.js'

export const PROJECT_COST_LEDGER_LIMIT = 500

export interface ProjectCostLedgerEntry {
  id: string
  entry_date: string | null
  source_type: string | null
  cost_category: string | null
  amount: string
  currency_code: string
  reference: string | null
}

export interface ProjectCostLedgerTotal {
  currency_code: string
  amount: string
}

/** What one kind of cost (jobsite deliveries, Store Outs, returns, posted journals ...) adds up to, in one currency. */
export interface ProjectCostLedgerKindTotal {
  currency_code: string
  source_type: string | null
  amount: string
  entry_count: number
}

export interface ProjectCostLedger {
  entries: ProjectCostLedgerEntry[]
  totals: ProjectCostLedgerTotal[]
  /**
   * The same money as `totals`, split by kind. Summed in SQL over ALL rows (never from `entries`, which is cut at the limit),
   * so for every currency the kinds add up to that currency's total.
   */
  byKind: ProjectCostLedgerKindTotal[]
  /** More rows exist than were listed; the totals still count all of them. */
  truncated: boolean
}

export async function projectCostLedger(
  run: RunQuery,
  projectId: string,
  companyId: string,
  limit: number = PROJECT_COST_LEDGER_LIMIT,
): Promise<ProjectCostLedger> {
  // one more than the limit, to know whether the list was cut
  const entriesRes = await run(
    `SELECT pca.id::text AS id, pca.entry_date::text AS entry_date, pca.source_type, pca.cost_category,
            pca.amount::text AS amount, pca.currency_code::text AS currency_code,
            COALESCE(
              CASE pca.source_type
                WHEN 'po_direct_delivery' THEN
                  (SELECT po.po_number || ' / line ' || pl.line_number
                     FROM po_lines pl JOIN purchase_orders po ON po.id = pl.po_id
                    WHERE pl.id = pca.source_id AND po.company_id = $2)
                WHEN 'stock_issue' THEN
                  (SELECT pmi.issue_number FROM project_material_issues pmi
                    WHERE pmi.id = pca.source_id AND pmi.company_id = $2)
                WHEN 'material_return' THEN
                  (SELECT pmr.return_number FROM project_material_returns pmr
                    WHERE pmr.id = pca.source_id AND pmr.company_id = $2)
                WHEN 'po_vendor_return' THEN
                  (SELECT r.return_number FROM po_return_items ri JOIN po_returns r ON r.id = ri.return_id
                    WHERE ri.id = pca.source_id AND r.company_id = $2)
              END,
              je.reference
            ) AS reference
       FROM project_cost_actuals pca
       JOIN projects p ON p.id = pca.project_id AND p.company_id = $2
       LEFT JOIN journal_lines jl ON jl.id = pca.journal_line_id
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE pca.project_id = $1
        -- the same rule as v_project_cost_by_currency (migration 304): a journal-backed row counts once its journal is posted
        AND (pca.journal_line_id IS NULL OR je.status = 'posted')
      ORDER BY pca.entry_date DESC, pca.created_at DESC, pca.id
      LIMIT $3`,
    [projectId, companyId, limit + 1],
  )
  const totalsRes = await run(
    `SELECT v.currency_code::text AS currency_code, SUM(v.amount)::text AS amount
       FROM v_project_cost_by_currency v
       JOIN projects p ON p.id = v.project_id AND p.company_id = $2
      WHERE v.project_id = $1
      GROUP BY v.currency_code
      ORDER BY v.currency_code`,
    [projectId, companyId],
  )
  // the same view and the same company scope as the totals, one more grouping level: per currency and per kind
  const kindsRes = await run(
    `SELECT v.currency_code::text AS currency_code, v.source_type, SUM(v.amount)::text AS amount, COUNT(*)::int AS entry_count
       FROM v_project_cost_by_currency v
       JOIN projects p ON p.id = v.project_id AND p.company_id = $2
      WHERE v.project_id = $1
      GROUP BY v.currency_code, v.source_type
      ORDER BY v.currency_code, v.source_type`,
    [projectId, companyId],
  )
  const rows = entriesRes.rows as ProjectCostLedgerEntry[]
  return {
    entries: rows.slice(0, limit),
    totals: totalsRes.rows as ProjectCostLedgerTotal[],
    byKind: kindsRes.rows as ProjectCostLedgerKindTotal[],
    truncated: rows.length > limit,
  }
}
