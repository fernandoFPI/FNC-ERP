// Turns the stored changes of a PO edit request (po_edit_requests.changes) into
// something a reviewer can read: which line each change is about, what was added,
// what was removed. The payload has been written in three generations, and all three
// are still in the database:
//   - edited lines with no name, removed lines as bare ids (the web form, until the
//     gateway began recording names at submission);
//   - edited lines with a `description`, removed lines as objects (requisition form,
//     admin corrections, and every request submitted since);
//   - added lines as full objects (always).
// A bare removed id is resolved against the PO's current lines; once an approved
// removal has deleted the line, that is no longer possible and the name stays null.

export interface CurrentLine {
  id: string
  description?: string | null
}

export interface FieldChange {
  field: string
  from: unknown
  to: unknown
}

export interface EditedLine {
  lineId: string
  name: string | null
  changes: FieldChange[]
}

export interface AddedLine {
  description: string | null
  qty: number | null
  unitPrice: number | null
  uom: string | null
  currency: string | null
}

export interface RemovedLine {
  lineId: string
  name: string | null
  qty: number | null
  unitPrice: number | null
  uom: string | null
  currency: string | null
}

export interface EditSummary {
  header: FieldChange[]
  edited: EditedLine[]
  added: AddedLine[]
  removed: RemovedLine[]
  /** Every individual change: each header field, each edited field, each added and removed line. */
  total: number
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export function describeEditChanges(
  rawChanges: string | null | undefined,
  currentLines: CurrentLine[],
): EditSummary {
  let parsed: unknown = null
  try {
    parsed = rawChanges ? JSON.parse(rawChanges) : null
  } catch {
    /* an unreadable payload shows as "no detail" rather than breaking the page */
  }
  const root: Obj = isObj(parsed) ? parsed : {}
  const nameOnPo = new Map(currentLines.map((l) => [l.id, text(l.description)]))

  const header: FieldChange[] = isObj(root.header)
    ? Object.entries(root.header).map(([field, diff]) => ({
        field,
        from: isObj(diff) ? diff.from : undefined,
        to: isObj(diff) ? diff.to : undefined,
      }))
    : []

  const lines = isObj(root.lines) ? root.lines : {}

  // Group edits by line, in the order the lines first appear.
  const editedById = new Map<
    string,
    EditedLine & { recordedName: string | null; nameBefore: string | null }
  >()
  for (const e of Array.isArray(lines.edited) ? lines.edited : []) {
    if (!isObj(e)) continue
    const lineId = String(e.id ?? '')
    let group = editedById.get(lineId)
    if (!group) {
      group = { lineId, name: null, changes: [], recordedName: null, nameBefore: null }
      editedById.set(lineId, group)
    }
    group.recordedName ??= text(e.description)
    if (e.field === 'description') group.nameBefore ??= text(e.from)
    group.changes.push({ field: String(e.field ?? ''), from: e.from, to: e.to })
  }
  const edited: EditedLine[] = [...editedById.values()].map(
    ({ lineId, changes, recordedName, nameBefore }) => ({
      lineId,
      // the name recorded at submission, else what the line was called before a rename
      // in this same request, else what it is called on the PO now
      name: recordedName ?? nameBefore ?? nameOnPo.get(lineId) ?? null,
      changes,
    }),
  )

  const added: AddedLine[] = (Array.isArray(lines.added) ? lines.added : [])
    .filter(isObj)
    .map((l) => ({
      description: text(l.description),
      qty: num(l.qty ?? l.qty_ordered),
      unitPrice: num(l.unit_price),
      uom: text(l.uom),
      currency: text(l.currency_code),
    }))

  const removed: RemovedLine[] = (Array.isArray(lines.removed) ? lines.removed : []).map((r) => {
    if (isObj(r)) {
      const lineId = String(r.id ?? '')
      return {
        lineId,
        name: text(r.description) ?? nameOnPo.get(lineId) ?? null,
        qty: num(r.qty),
        unitPrice: num(r.unit_price),
        uom: text(r.uom),
        currency: text(r.currency_code),
      }
    }
    const lineId = String(r)
    return {
      lineId,
      name: nameOnPo.get(lineId) ?? null,
      qty: null,
      unitPrice: null,
      uom: null,
      currency: null,
    }
  })

  return {
    header,
    edited,
    added,
    removed,
    total:
      header.length +
      edited.reduce((n, l) => n + l.changes.length, 0) +
      added.length +
      removed.length,
  }
}

// The fields whose values are numbers worth formatting (thousands separators, no
// trailing zeros: "1.0000" -> "1").
const NUMERIC_FIELDS = new Set([
  'qty_ordered',
  'qty_from_stock',
  'unit_price',
  'actual_unit_price',
  'store_price',
])

export function formatEditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (NUMERIC_FIELDS.has(field)) {
    const n = num(value)
    if (n !== null) return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function formatEditNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}
