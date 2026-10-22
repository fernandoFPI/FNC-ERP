// Turns the stored changes of a PO edit request (po_edit_requests.changes) into
// something a reviewer can read: which line each change is about (its index, name and
// details), what was added, what was removed, how much a price or quantity moved, and what
// it does to the totals. The payload has been written in three generations, and all three
// are still in the database:
//   - edited lines with no name, removed lines as bare ids (the web form, until the
//     gateway began recording names at submission);
//   - edited lines with a `description`, removed lines as objects (requisition form,
//     admin corrections);
//   - everything above plus `touched` (each touched line's index and details as it was) and,
//     once applied, `impact` (the totals before and after).
// Whatever was not recorded is resolved against the PO's current lines; once an approved
// removal has deleted the line that is no longer possible and the field stays null.

export interface CurrentLine {
  id: string
  description?: string | null
  line_number?: number | string | null
}

export interface LineDetails {
  qty: number | null
  unitPrice: number | null
  uom: string | null
  currency: string | null
  total: number | null
}

export interface FieldChange {
  field: string
  from: unknown
  to: unknown
  /** How far a price or quantity moved, in percent. Null for anything else, or when there was no starting value. */
  pct: number | null
}

export interface EditedLine {
  lineId: string
  lineNumber: number | null
  name: string | null
  details: LineDetails | null
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
  lineNumber: number | null
  name: string | null
  details: LineDetails | null
}

export interface ImpactView {
  /** One per currency present before or after. */
  totals: { currency: string; before: number; after: number; delta: number }[]
  /** Lines added, removed or whose total changed. */
  lines: {
    id: string
    lineNumber: number | null
    description: string | null
    currency: string
    before: number | null
    after: number | null
  }[]
  /** Why approving would fail right now, when it would. */
  failure: string | null
}

export interface EditSummary {
  header: FieldChange[]
  edited: EditedLine[]
  added: AddedLine[]
  removed: RemovedLine[]
  /** Totals before and after, when recorded with the request. */
  impact: ImpactView | null
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

// The fields where "how much did it move" means something.
const PCT_FIELDS = new Set([
  'qty_ordered',
  'qty_from_stock',
  'unit_price',
  'actual_unit_price',
  'store_price',
])

export function pctChange(field: string, from: unknown, to: unknown): number | null {
  if (!PCT_FIELDS.has(field)) return null
  const a = num(from)
  const b = num(to)
  if (a === null || b === null || a <= 0) return null
  return ((b - a) / a) * 100
}

// Reads the impact the gateway returns (pending, dry-run) or recorded (reviewed).
export function toImpactView(raw: unknown): ImpactView | null {
  if (!isObj(raw)) return null
  const totals = (Array.isArray(raw.totals) ? raw.totals : []).filter(isObj).map((t) => {
    const before = num(t.before) ?? 0
    const after = num(t.after) ?? 0
    return { currency: String(t.currency_code ?? ''), before, after, delta: after - before }
  })
  const lines = (Array.isArray(raw.lines) ? raw.lines : []).filter(isObj).map((l) => ({
    id: String(l.id ?? ''),
    lineNumber: num(l.line_number),
    description: text(l.description),
    currency: String(l.currency_code ?? ''),
    before: num(l.before),
    after: num(l.after),
  }))
  const failure = text(raw.failure)
  if (totals.length === 0 && lines.length === 0 && !failure) return null
  return { totals, lines, failure }
}

const detailsOf = (t: Obj | undefined): LineDetails | null =>
  t
    ? {
        qty: num(t.qty),
        unitPrice: num(t.unit_price),
        uom: text(t.uom),
        currency: text(t.currency_code),
        total: num(t.total),
      }
    : null

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
  const onPo = new Map(currentLines.map((l) => [l.id, l]))
  const touched = new Map(
    (Array.isArray(root.touched) ? root.touched : []).filter(isObj).map((t) => [String(t.id), t]),
  )
  const lineNumberOf = (id: string, recorded?: unknown): number | null =>
    num(recorded) ?? num(touched.get(id)?.line_number) ?? num(onPo.get(id)?.line_number)

  const header: FieldChange[] = isObj(root.header)
    ? Object.entries(root.header).map(([field, diff]) => {
        const from = isObj(diff) ? diff.from : undefined
        const to = isObj(diff) ? diff.to : undefined
        return { field, from, to, pct: null }
      })
    : []

  const lines = isObj(root.lines) ? root.lines : {}

  // Group edits by line, in the order the lines first appear.
  const editedById = new Map<
    string,
    { changes: FieldChange[]; recordedName: string | null; nameBefore: string | null }
  >()
  for (const e of Array.isArray(lines.edited) ? lines.edited : []) {
    if (!isObj(e)) continue
    const lineId = String(e.id ?? '')
    let group = editedById.get(lineId)
    if (!group) {
      group = { changes: [], recordedName: null, nameBefore: null }
      editedById.set(lineId, group)
    }
    group.recordedName ??= text(e.description)
    if (e.field === 'description') group.nameBefore ??= text(e.from)
    const field = String(e.field ?? '')
    group.changes.push({ field, from: e.from, to: e.to, pct: pctChange(field, e.from, e.to) })
  }
  const edited: EditedLine[] = [...editedById.entries()].map(([lineId, g]) => ({
    lineId,
    lineNumber: lineNumberOf(lineId),
    // the name recorded at submission, else what the line was called before a rename in this
    // same request, else what it was recorded as, else what it is called on the PO now
    name:
      g.recordedName ??
      g.nameBefore ??
      text(touched.get(lineId)?.description) ??
      text(onPo.get(lineId)?.description) ??
      null,
    details: detailsOf(touched.get(lineId)),
    changes: g.changes,
  }))

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
      const fromTouched = detailsOf(touched.get(lineId))
      return {
        lineId,
        lineNumber: lineNumberOf(lineId, r.line_number),
        name:
          text(r.description) ??
          text(touched.get(lineId)?.description) ??
          text(onPo.get(lineId)?.description) ??
          null,
        details: {
          qty: num(r.qty) ?? fromTouched?.qty ?? null,
          unitPrice: num(r.unit_price) ?? fromTouched?.unitPrice ?? null,
          uom: text(r.uom) ?? fromTouched?.uom ?? null,
          currency: text(r.currency_code) ?? fromTouched?.currency ?? null,
          total: fromTouched?.total ?? null,
        },
      }
    }
    const lineId = String(r)
    return {
      lineId,
      lineNumber: lineNumberOf(lineId),
      name: text(touched.get(lineId)?.description) ?? text(onPo.get(lineId)?.description) ?? null,
      details: detailsOf(touched.get(lineId)),
    }
  })

  return {
    header,
    edited,
    added,
    removed,
    impact: toImpactView(root.impact),
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
