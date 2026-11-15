// Choosing the GL account and cost center of a PO line (setPOLineAccounting, the PO page's "How was this PO paid?" panel).
//
// The mutation used to save whatever it was sent: a header account such as `1000 Assets` (the first entry of the page's
// picker), an inactive account, or an account / cost center of ANOTHER company (the ids were never checked against the
// caller's company). The mistake only surfaced weeks later, when Finance settled the advance and the database trigger
// (migration 237) refused to post to a header account, by which time the PO was closed and the account could no longer be
// changed (playbook #91). Now the choice is validated when it is made.
//
// Only a CHOICE is judged: an account or cost center that the line already holds and that is sent back unchanged passes. The
// page sends the line's current account along when only the cost center changes, and a line that already holds a bad account
// must still be able to get its cost center fixed first; the settlement refuses the bad account by name, and the Advance page
// can change it.
import { query } from '@fnc-erp/db'

export interface LineAccountingCurrent {
  account_id: string | null
  cost_center_id: string | null
}

export interface AccountRow {
  code: string
  name: string
  is_postable: boolean
  is_active: boolean
}

export interface CostCenterRow {
  code: string
  name: string
  is_active: boolean
}

/** Why this account cannot be chosen for a line, or null. `undefined` means no such account in the caller's company. */
export function accountChoiceProblem(account: AccountRow | undefined): string | null {
  if (!account) return 'GL account not found in this company'
  if (!account.is_postable)
    return `${account.code} · ${account.name} is a header account and cannot be posted to: choose a postable account`
  if (!account.is_active)
    return `${account.code} · ${account.name} is inactive: choose an active account`
  return null
}

/** Why this cost center cannot be chosen, or null. `undefined` means no such cost center in the caller's company. */
export function costCenterChoiceProblem(costCenter: CostCenterRow | undefined): string | null {
  if (!costCenter) return 'Cost center not found in this company'
  if (!costCenter.is_active)
    return `${costCenter.code} · ${costCenter.name} is inactive: choose an active cost center`
  return null
}

/**
 * Throws the plain sentence when a newly chosen account or cost center is not usable. A value that is null (clearing the
 * field) or equal to what the line already holds is not a new choice and passes.
 */
export async function assertLineAccountingChoice(
  companyId: string,
  current: LineAccountingCurrent,
  wanted: { glAccountId: string | null; costCenterId: string | null },
): Promise<void> {
  if (wanted.glAccountId && wanted.glAccountId !== current.account_id) {
    const r = await query<AccountRow>(
      `SELECT code, name, is_postable, is_active FROM chart_of_accounts WHERE id = $1 AND company_id = $2`,
      [wanted.glAccountId, companyId],
    )
    const problem = accountChoiceProblem(r.rows[0])
    if (problem) throw new Error(problem)
  }
  if (wanted.costCenterId && wanted.costCenterId !== current.cost_center_id) {
    const r = await query<CostCenterRow>(
      `SELECT code, name, is_active FROM cost_centers WHERE id = $1 AND company_id = $2`,
      [wanted.costCenterId, companyId],
    )
    const problem = costCenterChoiceProblem(r.rows[0])
    if (problem) throw new Error(problem)
  }
}
