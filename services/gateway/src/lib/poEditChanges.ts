// What a po_edit_requests.changes payload records about the PO lines it touches.
//
// The web form sends line edits without the line's name and removals as bare line
// ids. That was fine while the request was pending (the line still exists), but an
// approved removal deletes the line, so the Edit Request History could only ever say
// "1 line removed" and an edit only "line qty ordered 1 -> 540", with no way to tell
// which line. The line's index, name and details are therefore written into the
// payload when the request is submitted, while the line still exists.
// applyPOEditChanges already accepts a removal as either a bare id or an object, and
// an edit's optional `description` was already in its type, so nothing that reads the
// payload changes behaviour; the extra keys (`touched`, `impact`) are ignored by it.

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
  line_number: string | number | null
  description: string | null
  qty_ordered: string | number
  unit_price: string | number
  uom: string | null
  currency_code: string | null
  total_price: string | number | null
}

type RemovedEntry =
  | string
  | {
      id: string
      line_number?: number
      description?: string
      qty?: number
      unit_price?: number
      uom?: string
      currency_code?: string
    }

// A touched line as it was when the request was submitted.
export interface TouchedLine {
  id: string
  line_number: number
  description: string | null
  qty: number
  unit_price: number
  uom: string | null
  currency_code: string | null
  total: number
}

interface NameableChanges {
  lines?: {
    edited?: { id: string; description?: string }[]
    removed?: RemovedEntry[]
  }
}

const toNumber = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0))
  return Number.isFinite(n) ? n : 0
}

// Returns a copy of `changes` with each edited line's description, each removed line's
// index / description / quantity / price / unit, and a `touched` list holding every
// edited or removed line as it is right now. Anything already recorded is kept, and a
// line id that is not on the PO is left exactly as it came.
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
      qty: toNumber(line.qty_ordered),
      unit_price: toNumber(line.unit_price),
    }
    if (line.line_number != null) snapshot.line_number = toNumber(line.line_number)
    if (line.description) snapshot.description = line.description
    if (line.uom) snapshot.uom = line.uom
    if (line.currency_code) snapshot.currency_code = line.currency_code
    // whatever the caller already recorded wins
    return typeof entry === 'string' ? snapshot : { ...snapshot, ...entry }
  })

  const touchedIds = [
    ...new Set([
      ...(edited ?? []).map((e) => e.id),
      ...(removed ?? []).map((r) => (typeof r === 'string' ? r : r.id)),
    ]),
  ]
  const touched: TouchedLine[] = touchedIds.flatMap((id) => {
    const l = byId.get(id)
    return l
      ? [
          {
            id,
            line_number: toNumber(l.line_number),
            description: l.description,
            qty: toNumber(l.qty_ordered),
            unit_price: toNumber(l.unit_price),
            uom: l.uom,
            currency_code: l.currency_code,
            total: toNumber(l.total_price),
          },
        ]
      : []
  })

  return {
    ...changes,
    ...(touched.length > 0 ? { touched } : {}),
    lines: {
      ...lineChanges,
      ...(edited ? { edited } : {}),
      ...(removed ? { removed } : {}),
    },
  }
}
