// One history of everything that moved stock through a store: Store In (goods receipts), Store Out, store transfers and equipment
// returns. Playbook #109, phase 3 of STORE_OUT_EQUIPMENT_PLAN.md.
//
// Each of those is its own table with its own screen, so "what happened at the Erbil store last week" meant opening four pages. This is
// ONE read over all four (a UNION in a single statement, so the filters and the ordering are applied once, to all of them, and the
// list cannot disagree with a single page about what exists). Nothing is written here and nothing is added up: it is a list.
//
// Tenancy: every branch of the UNION is scoped to the caller's company through its own parent (a receipt through its purchase order,
// the rest through their own company_id). Store In rows also follow the same branch scope as the Store In list (`branchScope`).

export const STORE_DOCUMENT_TYPES = ['store_in', 'store_out', 'transfer', 'return'] as const
export type StoreDocumentType = (typeof STORE_DOCUMENT_TYPES)[number]

export function isStoreDocumentType(v: unknown): v is StoreDocumentType {
  return typeof v === 'string' && (STORE_DOCUMENT_TYPES as readonly string[]).includes(v)
}

/** How many rows one request returns: the newest first. The page says when the list was cut. */
export const STORE_DOCUMENTS_LIMIT = 500

/**
 * $1 company, $2 branch scope for receipts (uuid[] or null), $3 type or '' for all, $4 a location every document must involve (uuid or
 * null), $5 a search pattern (already wrapped in %...%) or null, $6 limit.
 * `location_ids` is every store the document touched: where a receipt went and where it is going, every shelf a Store Out took from,
 * both ends of a transfer, every place a return put equipment back.
 */
export const STORE_DOCUMENTS_SQL = `
  WITH docs AS (
    SELECT 'store_in'::text AS doc_type, r.id, r.receipt_number AS number, r.received_date::text AS doc_date, r.created_at,
           sl.id AS store_id, sl.name AS store_name,
           COALESCE(NULLIF(btrim(r.received_from_name), ''), v.name) AS party,
           po.po_number AS reference,
           (SELECT COUNT(*) FROM po_receipt_lines l WHERE l.receipt_id = r.id)::int AS line_count,
           r.status::text AS status,
           ARRAY[r.warehouse_location_id, r.final_destination_location_id]::uuid[] AS location_ids
      FROM po_receipts r
      JOIN purchase_orders po ON po.id = r.po_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN stock_locations sl ON sl.id = r.warehouse_location_id
     WHERE po.company_id = $1 AND ($2::uuid[] IS NULL OR po.branch_id = ANY($2::uuid[]))
    UNION ALL
    SELECT 'store_out', pmi.id, pmi.issue_number, pmi.issue_date::text, pmi.created_at,
           fl.id, fl.name,
           COALESCE(NULLIF(btrim(pmi.issued_to_name), ''), pr.code, po.po_number),
           COALESCE(po.po_number, pr.code),
           (SELECT COUNT(*) FROM project_material_issue_lines l WHERE l.issue_id = pmi.id)::int,
           pmi.status::text,
           ARRAY(SELECT DISTINCT l.from_location_id FROM project_material_issue_lines l WHERE l.issue_id = pmi.id AND l.from_location_id IS NOT NULL)::uuid[]
      FROM project_material_issues pmi
      LEFT JOIN projects pr ON pr.id = pmi.project_id AND pr.company_id = pmi.company_id
      LEFT JOIN purchase_orders po ON po.id = pmi.po_id AND po.company_id = pmi.company_id
      LEFT JOIN LATERAL (
        SELECT sl.id, sl.name FROM project_material_issue_lines l JOIN stock_locations sl ON sl.id = l.from_location_id
         WHERE l.issue_id = pmi.id ORDER BY l.created_at, l.id LIMIT 1
      ) fl ON true
     WHERE pmi.company_id = $1
    UNION ALL
    SELECT 'transfer', t.id, t.transfer_number, t.transfer_date::text, t.sent_at,
           t.from_location_id, fl.name, tl.name, t.reference,
           (SELECT COUNT(*) FROM stock_transfer_lines l WHERE l.transfer_id = t.id)::int,
           t.status::text,
           ARRAY[t.from_location_id, t.to_location_id]::uuid[]
      FROM stock_transfers t
      JOIN stock_locations fl ON fl.id = t.from_location_id
      JOIN stock_locations tl ON tl.id = t.to_location_id
     WHERE t.company_id = $1
    UNION ALL
    SELECT 'return', er.id, er.return_number, er.return_date::text, er.created_at,
           rl.id, rl.name, er.received_by_name, NULL,
           (SELECT COUNT(*) FROM store_out_return_lines l WHERE l.return_id = er.id)::int,
           'done',
           ARRAY(SELECT DISTINCT l.to_location_id FROM store_out_return_lines l WHERE l.return_id = er.id AND l.to_location_id IS NOT NULL)::uuid[]
      FROM store_out_returns er
      LEFT JOIN LATERAL (
        SELECT sl.id, sl.name FROM store_out_return_lines l JOIN stock_locations sl ON sl.id = l.to_location_id
         WHERE l.return_id = er.id ORDER BY l.created_at, l.id LIMIT 1
      ) rl ON true
     WHERE er.company_id = $1
  )
  SELECT * FROM docs
   WHERE ($3 = '' OR doc_type = $3)
     AND ($4::uuid IS NULL OR $4::uuid = ANY(location_ids))
     AND ($5::text IS NULL OR number ILIKE $5 OR COALESCE(party, '') ILIKE $5 OR COALESCE(reference, '') ILIKE $5)
   ORDER BY doc_date DESC, created_at DESC, id
   LIMIT $6`

export function mapStoreDocumentRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    docType: r.doc_type,
    number: r.number,
    date: r.doc_date,
    storeId: (r.store_id as string | null) ?? null,
    storeName: (r.store_name as string | null) ?? null,
    party: (r.party as string | null) ?? null,
    reference: (r.reference as string | null) ?? null,
    lineCount: Number(r.line_count ?? 0),
    status: r.status,
  }
}

/** Wraps what a person typed as a LIKE pattern, treating `%`, `_` and `\` in it as text. Empty means no search. */
export function searchPattern(text: string | null | undefined): string | null {
  const t = text?.trim() ?? ''
  if (t === '') return null
  return `%${t.replace(/[\\%_]/g, '\\$&')}%`
}
