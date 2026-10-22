// What a po_edit_requests.changes payload records about the PO lines it touches.
//
// The web form sends line edits without the line's name and removals as bare line
// ids. That was fine while the request was pending (the line still exists), but an
// approved removal deletes the line, so the Edit Request History could only ever say
// "1 line removed" and an edit only "line qty ordered 1 -> 540", with no way to tell
// which line. The name is therefore written into the payload when the request is
// submitted, while the line still exists. applyPOEditChanges already accepts a
// removal as either a bare id or an object, and an edit's optional `description`
// was already in its type, so nothing that reads the payload changes behaviour.

// Written as the review note when an edit on a not-yet-approved PO is applied
// straight away. One constant: the INSERT that writes it and the query that
// recognises an auto-applied request must agree, and the web card must not match on
// the English text.
export const AUTO_APPLIED_REVIEW_NOTE = 'Auto-applied — PO not yet approved'
// Same, for a requisition's edit request.
export const AUTO_APPLIED_REQUISITION_REVIEW_NOTE = 'Auto-applied — requisition not yet approved'

// True for a request that was applied on submission because the PO (or requisition) had
// not been approved yet (nobody reviewed it: the requester is recorded as the reviewer).
export function isAutoAppliedEditRequest(r: Record<string, unknown>): boolean {
  const note = r.requisition_id ? AUTO_APPLIED_REQUISITION_REVIEW_NOTE : AUTO_APPLIED_REVIEW_NOTE
  return r.status === 'approved' && r.reviewed_by === r.requested_by && r.review_notes === note
}

export interface PoLineSnapshot {
  id: string
  description: string | null
  qty_ordered: string | number
  unit_price: string | number
  uom: string | null
  currency_code: string | null
}

type RemovedEntry =
  | string
  | {
      id: string
      description?: string
      qty?: number
      unit_price?: number
      uom?: string
      currency_code?: string
    }

interface NameableChanges {
  lines?: {
    edited?: { id: string; description?: string }[]
    removed?: RemovedEntry[]
  }
}

// Returns a copy of `changes` with each edited line's description, and each removed
// line's description / quantity / price / unit, filled in from the lines as they are
// right now. Anything already recorded is kept, and a line id that is not on the PO
// is left exactly as it came.
export function recordLineNamesInEditChanges<T extends NameableChanges>(
  changes: T,
  lines: PoLineSnapshot[],
): T {
  const byId = new Map(lines.map((l) => [l.id, l]))
  const lineChanges = changes.lines
  if (!lineChanges) return changes

  const edited = lineChanges.edited?.map((e) => {
    const line = byId.get(e.id)
    return line?.description && !e.description ? { ...e, description: line.description } : e
  })

  const removed = lineChanges.removed?.map((entry): RemovedEntry => {
    const id = typeof entry === 'string' ? entry : entry.id
    const line = byId.get(id)
    if (!line) return entry
    const snapshot: Exclude<RemovedEntry, string> = {
      id,
      qty: parseFloat(String(line.qty_ordered)),
      unit_price: parseFloat(String(line.unit_price)),
    }
    if (line.description) snapshot.description = line.description
    if (line.uom) snapshot.uom = line.uom
    if (line.currency_code) snapshot.currency_code = line.currency_code
    // whatever the caller already recorded wins
    return typeof entry === 'string' ? snapshot : { ...snapshot, ...entry }
  })

  return {
    ...changes,
    lines: {
      ...lineChanges,
      ...(edited ? { edited } : {}),
      ...(removed ? { removed } : {}),
    },
  }
}
