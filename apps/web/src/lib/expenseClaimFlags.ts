// A line of an expense claim can carry a review flag (migration 312): an approver rejected the
// claim and ticked this line with a reason. The flag has three states, mirroring requisitions:
//   open   - raised, the employee has not resubmitted yet
//   fixed  - the employee resubmitted ("addressed"); waiting for the approver to confirm
//   none   - never flagged, or the approver confirmed it ("resolved")
// One place decides which is which, so the claim page, the employee's popup and the editor
// cannot disagree.

export interface LineFlagFields {
  flag_reason?: string | null
  flag_addressed_at?: string | null
  flag_resolved_at?: string | null
}

export type LineFlagState = 'none' | 'open' | 'fixed'

export function lineFlagState(line: LineFlagFields): LineFlagState {
  if (!line.flag_reason || line.flag_resolved_at) return 'none'
  return line.flag_addressed_at ? 'fixed' : 'open'
}
