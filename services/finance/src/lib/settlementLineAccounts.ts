// Which GL accounts and cost centers an advance settlement may post to (playbook #91).
//
// A settlement posts a journal line to each line's GL account, and the database trigger (migration 237,
// fn_enforce_postable_account) refuses a header account such as `1000 Assets`. The PO-line settlement was fixed first; the
// manual "New Settlement" form had the same hole on its own path: its dropdown listed the whole chart, `POST /settlements`
// stored whatever account it was sent (another company's too), and `POST /settlements/:id/approve` posted to it and died in the
// trigger as a bare 500. These are the rules for every one of those places, in one file, so the edit route, the manual create
// and the approve cannot drift apart (#23).
//
// Two kinds of judgement, on purpose:
//  - a CHOICE (create, and the edit route): the account must exist in the company, be postable and be active; the cost center
//    must exist in the company and be active;
//  - a POSTING (approve): only what the database would refuse, because the settlement may have been drafted before these rules
//    existed and an account deactivated since is still postable. Judging old data by the new choice rules would block drafts the
//    database accepts.

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

/** What the route answers: an HTTP status, a stable code and a sentence a person can act on. */
export interface Refusal {
  status: number
  code: string
  message: string
}

/** A way to run SQL: a transaction client's `query`, or the shared pool's. */
export type RunSql = (
  sql: string,
  params: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>

/** Why this account cannot be CHOSEN, or null. `undefined` means no such account in the caller's company. */
export function accountChoice(account: AccountRow | undefined): Refusal | null {
  if (!account)
    return { status: 400, code: 'INVALID_ACCOUNT', message: 'GL account not found in this company' }
  if (!account.is_postable)
    return {
      status: 422,
      code: 'ACCOUNT_NOT_POSTABLE',
      message: `${account.code} · ${account.name} is a header account and cannot be posted to: choose a postable account`,
    }
  if (!account.is_active)
    return {
      status: 400,
      code: 'ACCOUNT_INACTIVE',
      message: `${account.code} · ${account.name} is inactive: choose an active account`,
    }
  return null
}

/** Why this cost center cannot be CHOSEN, or null. `undefined` means no such cost center in the caller's company. */
export function costCenterChoice(costCenter: CostCenterRow | undefined): Refusal | null {
  if (!costCenter)
    return {
      status: 400,
      code: 'INVALID_COST_CENTER',
      message: 'Cost center not found in this company',
    }
  if (!costCenter.is_active)
    return {
      status: 400,
      code: 'COST_CENTER_INACTIVE',
      message: `${costCenter.code} · ${costCenter.name} is inactive: choose an active cost center`,
    }
  return null
}

const MAX_LINES_NAMED = 5

function lineLabel(index: number, description: string | null | undefined): string {
  const what = (description ?? '').trim()
  return `Line ${index + 1}${what ? ` (${what.length > 40 ? `${what.slice(0, 37)}...` : what})` : ''}`
}

function joinNamed(problems: string[]): string {
  const shown = problems.slice(0, MAX_LINES_NAMED).join('; ')
  const more =
    problems.length > MAX_LINES_NAMED ? `; and ${problems.length - MAX_LINES_NAMED} more` : ''
  return `${shown}${more}`
}

export interface SettlementLineInput {
  gl_account_id: string | null
  cost_center_id: string | null
  description?: string | null
}

async function loadAccounts(
  run: RunSql,
  companyId: string,
  ids: string[],
): Promise<Map<string, AccountRow>> {
  if (ids.length === 0) return new Map()
  const r = await run(
    `SELECT id, code, name, is_postable, is_active FROM chart_of_accounts WHERE id = ANY($1::uuid[]) AND company_id = $2`,
    [ids, companyId],
  )
  return new Map(r.rows.map((x) => [String(x['id']), x as unknown as AccountRow]))
}

/**
 * Judges the lines of a manual settlement when it is CREATED. Every line is checked and every problem is named (five, then a
 * count); the status and code are those of the first one. null when every line can be used.
 */
export async function manualLinesRefusal(
  run: RunSql,
  companyId: string,
  lines: readonly SettlementLineInput[],
): Promise<Refusal | null> {
  const accounts = await loadAccounts(run, companyId, [
    ...new Set(lines.map((l) => l.gl_account_id).filter((x): x is string => !!x)),
  ])
  const costCenterIds = [
    ...new Set(lines.map((l) => l.cost_center_id).filter((x): x is string => !!x)),
  ]
  const costCenters = new Map<string, CostCenterRow>()
  if (costCenterIds.length > 0) {
    const r = await run(
      `SELECT id, code, name, is_active FROM cost_centers WHERE id = ANY($1::uuid[]) AND company_id = $2`,
      [costCenterIds, companyId],
    )
    for (const x of r.rows) costCenters.set(String(x['id']), x as unknown as CostCenterRow)
  }
  const found: { refusal: Refusal; text: string }[] = []
  lines.forEach((line, i) => {
    const refusal =
      accountChoice(line.gl_account_id ? accounts.get(line.gl_account_id) : undefined) ??
      costCenterChoice(line.cost_center_id ? costCenters.get(line.cost_center_id) : undefined)
    if (refusal)
      found.push({ refusal, text: `${lineLabel(i, line.description)}: ${refusal.message}` })
  })
  const first = found[0]
  if (!first) return null
  return {
    status: first.refusal.status,
    code: first.refusal.code,
    message:
      found.length === 1
        ? first.text
        : `${found.length} lines cannot be used: ${joinNamed(found.map((f) => f.text))}`,
  }
}

/**
 * Judges the lines of a settlement that is about to be POSTED (approve): only what the database would refuse, i.e. an account
 * that is not postable or not this company's. null when every line can be posted.
 */
export async function postedLinesRefusal(
  run: RunSql,
  companyId: string,
  lines: readonly SettlementLineInput[],
): Promise<Refusal | null> {
  const accounts = await loadAccounts(run, companyId, [
    ...new Set(lines.map((l) => l.gl_account_id).filter((x): x is string => !!x)),
  ])
  const problems: string[] = []
  lines.forEach((line, i) => {
    const account = line.gl_account_id ? accounts.get(line.gl_account_id) : undefined
    let why: string | null = null
    if (!line.gl_account_id) why = 'has no GL account'
    else if (!account) why = "its GL account is not one of this company's accounts"
    else if (!account.is_postable)
      why = `GL account ${account.code} · ${account.name} is a header account and cannot be posted to`
    if (why) problems.push(`${lineLabel(i, line.description)}: ${why}`)
  })
  if (problems.length === 0) return null
  const lead =
    problems.length === 1 ? '1 line cannot be posted' : `${problems.length} lines cannot be posted`
  return {
    status: 422,
    code: 'LINES_NEED_ACCOUNTING',
    message: `${lead}: ${joinNamed(problems)}. Reject this settlement and create it again with a postable account.`,
  }
}

/** The credit side of every settlement is the advance's own account: the trigger refuses a header account there too. */
export function advanceAccountRefusal(
  account: { code: string; name: string; is_postable: boolean } | undefined,
): Refusal | null {
  if (account?.is_postable) return null
  const label = account
    ? `${account.code} · ${account.name} is a header account`
    : "it is not one of this company's accounts"
  return {
    status: 422,
    code: 'ADVANCE_ACCOUNT_NOT_POSTABLE',
    message: `This advance's own account cannot be posted to (${label}). Ask Finance to set a postable advance account for this employee.`,
  }
}
