// The GL account and cost center of a PO line that is waiting to be settled against an employee advance.
//
// Settling a line posts a journal line to the line's GL account, and a database trigger (migration 237,
// fn_enforce_postable_account) refuses an account that is not postable, i.e. a header account such as `1000 Assets`. The PO
// page's account picker listed header accounts, the server saved whatever it was sent, and by the time Finance settled the
// advance the PO was closed and the account could not be changed any more, so the first settlement died with the raw
// trigger error as "Failed to create settlement" (playbook #91).
//
// One rule, three readers: the pending-lines list reports each line's problem, the settlement refuses a bundle containing a
// line with one (naming it), and the edit route validates the replacement. All three use the fragments and functions here.
import { query } from '@fnc-erp/db'
import { SETTLEABLE_PO_STATUSES } from './advancePOLines.js'

/**
 * SQL (needs `pl` = po_lines, `coa` = the line's account joined WITH the PO's company, `po` = purchase_orders): why the
 * line's GL account cannot be posted to, or NULL when it can. 'not_found' means the id points at an account of another
 * company (the join is company-scoped), which a settlement must not post to either.
 */
export const ACCOUNT_PROBLEM_SQL = `(CASE WHEN pl.account_id IS NULL THEN 'missing'
                                          WHEN coa.id IS NULL THEN 'not_found'
                                          WHEN NOT coa.is_postable THEN 'not_postable' END)`

/** SQL (needs `pl` and `cc` = the line's cost center joined with the PO's company): why the cost center is unusable. */
export const COST_CENTER_PROBLEM_SQL = `(CASE WHEN pl.cost_center_id IS NULL THEN 'missing'
                                              WHEN cc.id IS NULL THEN 'not_found' END)`

/** The two LEFT JOINs the fragments above need, company-scoped so another company's account never reads as fine. */
export const ACCOUNTING_JOINS_SQL = `
  LEFT JOIN chart_of_accounts coa ON coa.id = pl.account_id AND coa.company_id = po.company_id
  LEFT JOIN cost_centers cc ON cc.id = pl.cost_center_id AND cc.company_id = po.company_id`

export type AccountProblem = 'missing' | 'not_found' | 'not_postable' | null
export type CostCenterProblem = 'missing' | 'not_found' | null

export interface BlockedLineRow {
  po_number: string
  line_number: number | string
  description: string | null
  account_code: string | null
  account_name: string | null
  account_problem: AccountProblem
  cost_center_problem: CostCenterProblem
}

const MAX_LINES_NAMED = 5

function describeLine(r: BlockedLineRow): string | null {
  const reasons: string[] = []
  if (r.account_problem === 'missing') reasons.push('has no GL account')
  else if (r.account_problem === 'not_postable') {
    const account = [r.account_code, r.account_name].filter(Boolean).join(' · ')
    reasons.push(`GL account ${account} is a header account and cannot be posted to`)
  } else if (r.account_problem === 'not_found')
    reasons.push("its GL account is not one of this company's accounts")
  if (r.cost_center_problem === 'missing') reasons.push('has no cost center')
  else if (r.cost_center_problem === 'not_found')
    reasons.push("its cost center is not one of this company's cost centers")
  if (reasons.length === 0) return null
  const what = (r.description ?? '').trim()
  const name = what ? ` (${what.length > 40 ? `${what.slice(0, 37)}...` : what})` : ''
  return `${r.po_number} line ${String(r.line_number)}${name}: ${reasons.join(', ')}`
}

/**
 * The plain sentence that says why a bundle cannot be settled, naming the lines (up to five, then a count), or null when every
 * line can be posted. The settlement route answers 422 with it instead of letting the database trigger raise.
 */
export function blockedLinesMessage(rows: readonly BlockedLineRow[]): string | null {
  const described = rows.map(describeLine).filter((x): x is string => x !== null)
  if (described.length === 0) return null
  const shown = described.slice(0, MAX_LINES_NAMED).join('; ')
  const more =
    described.length > MAX_LINES_NAMED ? `; and ${described.length - MAX_LINES_NAMED} more` : ''
  const lead =
    described.length === 1
      ? '1 selected line cannot be settled yet'
      : `${described.length} selected lines cannot be settled yet`
  return `${lead}: ${shown}${more}. Change the account on the line in the pending list, then settle again.`
}

export interface PendingPOLineRow {
  id: string
  description: string
  qty_ordered: string
  unit_price: string
  total_price: string
  currency_code: string
  line_number: number
  gl_account_id: string | null
  cost_center_id: string | null
  account_code: string | null
  account_name: string | null
  account_problem: AccountProblem
  cost_center_code: string | null
  cost_center_name: string | null
  cost_center_problem: CostCenterProblem
  po_id: string
  po_number: string
  project_id: string | null
  project_code: string | null
  project_name: string | null
}

/**
 * The lines waiting to be settled against this advance: those of the POs that name it for THEIR currency (migration 324),
 * finished (completed or closed) and not yet claimed by a settlement. Scoped to the caller's company on the PO and on the
 * account and cost center read back. Pass `lineId` to read one line (the edit route answers with the refreshed row).
 */
export async function loadPendingPOLines(
  companyId: string,
  advanceId: string,
  lineId?: string,
): Promise<PendingPOLineRow[]> {
  const r = await query<PendingPOLineRow>(
    `SELECT pl.id, pl.description, pl.qty_ordered, pl.unit_price, pl.total_price, pl.currency_code, pl.line_number,
            pl.account_id AS gl_account_id, pl.cost_center_id,
            coa.code AS account_code, coa.name AS account_name, ${ACCOUNT_PROBLEM_SQL} AS account_problem,
            cc.code AS cost_center_code, cc.name AS cost_center_name, ${COST_CENTER_PROBLEM_SQL} AS cost_center_problem,
            po.id AS po_id, po.po_number, po.project_id,
            p.code AS project_code, p.name AS project_name
       FROM po_lines pl
       JOIN purchase_orders po ON po.id = pl.po_id
       -- A line is paid from the advance of ITS OWN currency (po_funding_advances, migration 324): a PO with IQD and USD
       -- lines has an IQD advance and a USD one, and each only ever sees its own currency's lines.
       JOIN po_funding_advances pfa ON pfa.po_id = po.id AND pfa.company_id = po.company_id
                                   AND pfa.advance_id = $2 AND pfa.currency_code = pl.currency_code
       ${ACCOUNTING_JOINS_SQL}
       LEFT JOIN projects p ON p.id = po.project_id
      WHERE po.company_id = $1 AND po.status = ANY($3::text[])
        AND pl.advance_settlement_id IS NULL
        AND ($4::uuid IS NULL OR pl.id = $4::uuid)
      ORDER BY po.po_number, pl.line_number`,
    [companyId, advanceId, [...SETTLEABLE_PO_STATUSES], lineId ?? null],
  )
  return r.rows
}
