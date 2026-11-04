// Invoice lines and their review flags (migration 313), as the app reads them.
//
// One query and one mapper for an invoice's lines, shared by the `projectInvoice` query and the
// re-fetch inside `updateProjectInvoice`: both used to carry their own copy of the mapping, and a
// field added to one reads as empty on the other (the same trap as invoiceHeader.ts). The public
// verification route (routes/verify.ts) deliberately does NOT use this: the flags and the
// rejection are internal review notes, and the QR page is not behind a login.

import { query } from '@fnc-erp/db'

type Row = Record<string, unknown>

/** An invoice's lines in order, with the name of whoever flagged each one. */
export const INVOICE_LINES_SQL = `SELECT l.*,
       COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email) AS flagged_by_name
     FROM project_invoice_lines l
     LEFT JOIN users u ON u.id = l.flagged_by
     WHERE l.invoice_id = $1
     ORDER BY l.line_number`

const textOrNull = (v: unknown): string | null => (v == null ? null : String(v))

export function mapInvoiceLine(l: Row) {
  return {
    id: l.id,
    lineNumber: l.line_number,
    description: l.description,
    sourceType: l.source_type,
    qty: parseFloat(String(l.qty)),
    unitCost: parseFloat(String(l.unit_cost)),
    subtotal: parseFloat(String(l.subtotal)),
    marginPct: parseFloat(String(l.margin_pct)),
    marginAmount: parseFloat(String(l.margin_amount)),
    taxPct: parseFloat(String(l.tax_pct ?? 0)),
    taxAmount: parseFloat(String(l.tax_amount ?? 0)),
    lineTotal: parseFloat(String(l.line_total)),
    moComponents: l.mo_components ?? null,
    flagReason: textOrNull(l.flag_reason),
    flaggedAt: textOrNull(l.flagged_at),
    flaggedByName: textOrNull(l.flagged_by_name),
    flagAddressedAt: textOrNull(l.flag_addressed_at),
    flagResolvedAt: textOrNull(l.flag_resolved_at),
  }
}

/** The last rejection of an invoice (who, when, why): history, kept after it is resubmitted. */
export async function invoiceRejectionFields(i: Row): Promise<{
  rejectionReason: string | null
  rejectedAt: string | null
  rejectedByName: string | null
}> {
  let rejectedByName: string | null = null
  if (i.rejected_by) {
    const u = await query<{ name: string | null }>(
      `SELECT COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS name
       FROM users WHERE id = $1`,
      [i.rejected_by],
    )
    rejectedByName = u.rows[0]?.name ?? null
  }
  return {
    rejectionReason: textOrNull(i.rejection_reason),
    rejectedAt: textOrNull(i.rejected_at),
    rejectedByName,
  }
}

/** One flagged field of the invoice's printed header (migration 314): Bill To, Due Date, ... */
export interface InvoiceHeaderFlagRow {
  field: string
  reason: string
  flaggedAt: string | null
  flaggedByName: string | null
  addressedAt: string | null
  resolvedAt: string | null
}

/** The header flags of one invoice, in the order they were raised. Internal review notes, like the line
 *  flags: shared by the two app readers, never read by the public verification route. */
export async function invoiceHeaderFlagFields(
  invoiceId: unknown,
): Promise<{ headerFlags: InvoiceHeaderFlagRow[] }> {
  const r = await query<Row>(
    `SELECT hf.field, hf.flag_reason, hf.flagged_at, hf.flag_addressed_at, hf.flag_resolved_at,
            COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email) AS flagged_by_name
     FROM project_invoice_header_flags hf
     LEFT JOIN users u ON u.id = hf.flagged_by
     WHERE hf.invoice_id = $1
     ORDER BY hf.flagged_at, hf.field`,
    [invoiceId],
  )
  return {
    headerFlags: r.rows.map((h) => ({
      field: String(h.field),
      reason: String(h.flag_reason),
      flaggedAt: textOrNull(h.flagged_at),
      flaggedByName: textOrNull(h.flagged_by_name),
      addressedAt: textOrNull(h.flag_addressed_at),
      resolvedAt: textOrNull(h.flag_resolved_at),
    })),
  }
}
