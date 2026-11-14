import i18n from '../i18n'

// One name for each state of an employee advance, used by the Requisitions list, My Advances, the Finance advances
// list and the advance page, so a status cannot read differently from one screen to the next.
//
//   pending_approval --(manager approves)--> pending_issue --(cashbox handler issues)--> approved
//
// `approved` keeps its old meaning in the database, "paid out and open for settlement", which is why it reads
// "Issued" here: the manager's approval is `pending_issue`.
export const ADVANCE_STATUS_DEFAULT_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  pending_issue: 'Awaiting Cash Issue',
  approved: 'Issued',
  partially_settled: 'Partly Settled',
  settled: 'Settled',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export function advanceStatusLabel(status: string): string {
  return i18n.t(`req.advanceStatus.${status}`, {
    defaultValue: ADVANCE_STATUS_DEFAULT_LABELS[status] ?? status,
  })
}

// Advances that are still in progress (everything but the finished and the stopped ones).
export const ADVANCE_OPEN_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'pending_approval',
  'pending_issue',
  'approved',
  'partially_settled',
])
