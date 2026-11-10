// The rule for closing a project out of the Financing phase, shared by the gateway
// (GraphQL completeProject) and the projects service (REST /projects/:id/complete)
// so the two cannot drift.
//
// A project may be closed only when it has at least one invoice and every invoice
// is settled. "Settled" means paid, or never going to be paid (cancelled / void).
//
//   * Any invoice still open (draft, review, approved, issued, partial) blocks the
//     close for EVERYONE, administrators included.
//   * A project with no invoices at all (or only cancelled / void ones) blocks the
//     close for everyone except an administrator, who may close it on purpose.
//
// The web page keeps a mirror of the two status lists (apps/web/src/lib/projectFinancing.ts);
// a test in the web app reads this file and fails if they differ.

import { query } from './client.js'

/**
 * The invoice statuses that mean "still to be paid", in the order a message lists them.
 * Together with 'paid' and DEAD_INVOICE_STATUSES this must cover project_invoices_status_check
 * (migration 060); a test fails until a status added to that constraint is classified here.
 * The rule below does not depend on this list for safety: it is an allow-list of what SETTLES
 * an invoice (paid, or dead), so a status nobody classified blocks the close, it never lets it through.
 */
export const OPEN_INVOICE_STATUSES = ['draft', 'review', 'approved', 'issued', 'partial'] as const
/** The one status that means the invoice has been paid in full. */
export const PAID_INVOICE_STATUS = 'paid'
/** Invoice statuses that will never be paid and so never block (nor count as an invoice). */
export const DEAD_INVOICE_STATUSES = ['cancelled', 'void'] as const

export interface ProjectCloseoutInvoiceState {
  /** Invoices that are not cancelled or void. */
  live: number
  /** Live invoices that are not paid yet, by status. */
  openByStatus: Record<string, number>
  open: number
}

/** Turn "how many invoices have each status" into the state the rule reads. Pure, so it can be tested with any status. */
export function summariseInvoiceStatusCounts(
  rows: { status: string; n: string | number }[],
): ProjectCloseoutInvoiceState {
  const openByStatus: Record<string, number> = {}
  let live = 0
  let open = 0
  for (const row of rows) {
    const n = Number(row.n)
    if ((DEAD_INVOICE_STATUSES as readonly string[]).includes(row.status)) continue
    live += n
    // Anything that is not paid blocks, including a status this file has never heard of.
    if (row.status !== PAID_INVOICE_STATUS) {
      openByStatus[row.status] = (openByStatus[row.status] ?? 0) + n
      open += n
    }
  }
  return { live, openByStatus, open }
}

export async function getProjectCloseoutInvoiceState(
  projectId: string,
  companyId: string,
): Promise<ProjectCloseoutInvoiceState> {
  const r = await query<{ status: string; n: string }>(
    `SELECT status, COUNT(*)::text AS n
       FROM project_invoices
      WHERE project_id = $1 AND company_id = $2
      GROUP BY status`,
    [projectId, companyId],
  )
  return summariseInvoiceStatusCounts(r.rows)
}

const STATUS_WORDS: Record<string, string> = {
  draft: 'draft',
  review: 'in review',
  approved: 'approved, not issued',
  issued: 'issued, unpaid',
  partial: 'partly paid',
}

/**
 * Why this project cannot be closed, in plain words, or null when it can.
 * `isAdmin` only matters for a project with no invoices; it never excuses an unpaid one.
 */
export function projectCloseoutBlocker(
  state: ProjectCloseoutInvoiceState,
  isAdmin: boolean,
): string | null {
  if (state.open > 0) {
    // Known statuses first, in a fixed order; an unclassified one still shows, by its raw name.
    const ordered = [
      ...OPEN_INVOICE_STATUSES.filter((s) => (state.openByStatus[s] ?? 0) > 0),
      ...Object.keys(state.openByStatus).filter(
        (s) => !(OPEN_INVOICE_STATUSES as readonly string[]).includes(s),
      ),
    ]
    const parts = ordered.map((s) => `${state.openByStatus[s]} ${STATUS_WORDS[s] ?? s}`)
    const noun = state.open === 1 ? 'invoice is' : 'invoices are'
    return `Cannot close the project: ${state.open} ${noun} not fully paid yet (${parts.join(', ')}). Close it once every invoice is paid.`
  }
  if (state.live === 0 && !isAdmin) {
    return 'Cannot close the project: it has no invoices. Issue and collect its invoices first, or ask an administrator to close it.'
  }
  return null
}
