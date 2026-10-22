// The money effect of a PO / requisition edit request: each currency's total before and
// after, and each line whose total changes.
//
// It is not worked out here. The caller applies the edit with the real
// applyPOEditChanges / applyRequisitionEditChanges (so quantity, price, from-stock and
// currency rules are exactly what approval will do), reads the stored total_price of
// every line before and after, and this module only compares the two. For a pending
// request the apply is rolled back (a dry run); for an approved one the same snapshots
// are taken around the real apply and kept with the request. There is deliberately no
// second implementation of the totals arithmetic to drift from the real one.

export interface QueryExecutor {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>
}

export type EditScope = { poId: string } | { requisitionId: string }

export interface EditLineState {
  id: string
  line_number: number | null
  description: string | null
  currency_code: string
  total: number
}

export interface EditImpact {
  /** One entry per currency present before or after, totals as the database holds them. */
  totals: { currency_code: string; before: string; after: string }[]
  /** Lines added, removed or whose total changed. */
  lines: {
    id: string
    line_number: number | null
    description: string | null
    currency_code: string
    before: number | null
    after: number | null
  }[]
  /** Set when approving would fail right now, with the reason the real apply gave. */
  failure?: string
}

interface LineRow {
  id: string
  line_number: string | number | null
  description: string | null
  currency_code: string | null
  total_price: string | null
}

const where = (scope: EditScope) =>
  'poId' in scope
    ? { clause: 'po_id = $1', id: scope.poId }
    : { clause: 'requisition_id = $1', id: scope.requisitionId }

export interface EditSnapshot {
  lines: EditLineState[]
  /** Per-currency sum of total_price, summed by the database. */
  totals: Map<string, string>
}

export async function snapshotEditLines(
  db: QueryExecutor,
  scope: EditScope,
): Promise<EditSnapshot> {
  const w = where(scope)
  const [lines, totals] = await Promise.all([
    db.query<LineRow>(
      `SELECT id, line_number, description, currency_code, total_price::text AS total_price
       FROM po_lines WHERE ${w.clause} ORDER BY line_number`,
      [w.id],
    ),
    db.query<{ currency_code: string | null; total: string }>(
      `SELECT currency_code, COALESCE(SUM(total_price), 0)::text AS total
       FROM po_lines WHERE ${w.clause} GROUP BY currency_code`,
      [w.id],
    ),
  ])
  return {
    lines: lines.rows.map((r) => ({
      id: r.id,
      line_number: r.line_number == null ? null : Number(r.line_number),
      description: r.description,
      currency_code: r.currency_code ?? 'IQD',
      total: parseFloat(r.total_price ?? '0') || 0,
    })),
    totals: new Map(totals.rows.map((r) => [r.currency_code ?? 'IQD', r.total])),
  }
}

// Compares two snapshots of the same PO / requisition.
export function buildEditImpact(before: EditSnapshot, after: EditSnapshot): EditImpact {
  const currencies = [...new Set([...before.totals.keys(), ...after.totals.keys()])].sort()
  const beforeById = new Map(before.lines.map((l) => [l.id, l]))
  const afterById = new Map(after.lines.map((l) => [l.id, l]))
  const ids = [...new Set([...before.lines.map((l) => l.id), ...after.lines.map((l) => l.id)])]

  const lines: EditImpact['lines'] = []
  for (const id of ids) {
    const b = beforeById.get(id)
    const a = afterById.get(id)
    if (b && a && b.total === a.total) continue
    const ref = a ?? b
    if (!ref) continue
    lines.push({
      id,
      line_number: ref.line_number,
      description: ref.description,
      currency_code: ref.currency_code,
      before: b ? b.total : null,
      after: a ? a.total : null,
    })
  }
  lines.sort((x, y) => (x.line_number ?? 1e9) - (y.line_number ?? 1e9))

  return {
    totals: currencies.map((currency_code) => ({
      currency_code,
      before: before.totals.get(currency_code) ?? '0',
      after: after.totals.get(currency_code) ?? '0',
    })),
    lines,
  }
}
