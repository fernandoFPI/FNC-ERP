// Who to name beside a requisition line's "Handled by" marker (Organizer / Procurement). One rule for every screen that
// shows it, so the Lines table, the Market pricing cards and the Items Bought page cannot name different people.
//
// The marker itself (po_lines.owner_handles) says which side the line was given to; the name says who has actually
// acted on it, in this order:
//   1. whoever recorded a purchase on the line (all of them, if several people did), because that is who really bought it
//      - including a procurement buyer stepping in on a line the organizer took;
//   2. on a line the organizer took, the organizer;
//   3. on a line procurement has, the procurement officer who priced the requisition (null until procurement submitted).
// Returns null when nobody can be named yet, and the marker then stands alone.

export interface LineHandlerLine {
  owner_handles?: boolean | null
  purchases?: { bought_by_name?: string | null }[] | null
}

export interface LineHandlerRequisition {
  organizerName?: string | null
  procurementOfficerName?: string | null
}

export function lineHandlerName(line: LineHandlerLine, req: LineHandlerRequisition): string | null {
  const buyers = [
    ...new Set(
      (line.purchases ?? [])
        .map((p) => p.bought_by_name?.trim())
        .filter((name): name is string => !!name),
    ),
  ]
  if (buyers.length > 0) return buyers.join(', ')
  const fallback = (line.owner_handles ? req.organizerName : req.procurementOfficerName)?.trim()
  return fallback ? fallback : null
}
