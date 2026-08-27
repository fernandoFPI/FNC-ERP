import { pool } from './client.js'

export const DOC_TYPES = [
  { key: 'rfq', label: 'RFQ Number', defaultPrefix: 'RFQ' },
  { key: 'project', label: 'Project Number', defaultPrefix: 'PRJ' },
  { key: 'purchase_order', label: 'Purchase Order', defaultPrefix: 'PO' },
  { key: 'project_contract', label: 'Project Contract', defaultPrefix: 'CTR' },
  { key: 'project_invoice', label: 'Project Invoice', defaultPrefix: 'INV' },
  { key: 'rental_contract', label: 'Rental Contract', defaultPrefix: 'RC' },
  { key: 'rental_invoice', label: 'Rental Invoice', defaultPrefix: 'RI' },
  { key: 'client_document', label: 'Client Document', defaultPrefix: 'CD' },
  { key: 'employee_advance', label: 'Employee Advance', defaultPrefix: 'ADV' },
  { key: 'advance_settlement', label: 'Advance Settlement', defaultPrefix: 'SET' },
  { key: 'advance_return', label: 'Advance Return', defaultPrefix: 'RET' },
  { key: 'material_issue', label: 'Store Out', defaultPrefix: 'SO' },
  { key: 'product', label: 'Product SKU', defaultPrefix: 'PRD' },
] as const

export type DocType = (typeof DOC_TYPES)[number]['key']

// Product SKU prefixes, keyed by products.sub_category ("store") — continues
// the exact convention already used by the real imported catalog (confirmed
// 1:1 store->prefix correlation across ~6,900 products, zero exceptions, at
// the time this was written — see migration 215_product_sku_store_sequences).
// Each entry gets its own document_sequences row (doc_type 'product_<slug>',
// migration 215), separate from the generic 'product' one above, which is
// only the last-resort fallback for a product created with no category/store
// at all.
export const PRODUCT_STORE_SKU_PREFIXES: Record<string, { prefix: string; slug: string }> = {
  'AC Unit Store': { prefix: 'AC', slug: 'ac' },
  'Cleaning Materials Store': { prefix: 'CLEAN', slug: 'clean' },
  'Ducts Store': { prefix: 'DUCT', slug: 'duct' },
  'Electrical Equipment Store': { prefix: 'ELEC', slug: 'elec' },
  'Factory Store': { prefix: 'FACT', slug: 'fact' },
  'Frame Store': { prefix: 'FRAME', slug: 'frame' },
  'Furniture Store': { prefix: 'FURN', slug: 'furn' },
  'General Construction Store': { prefix: 'CONST', slug: 'const' },
  'General Store': { prefix: 'GEN', slug: 'gen' },
  'Iron Doors Store': { prefix: 'DOOR', slug: 'door' },
  'Old Iron Boards Store': { prefix: 'OIB', slug: 'oib' },
  'Outside Area Cables': { prefix: 'CABLE', slug: 'cable' },
  'Paint Store': { prefix: 'PAINT', slug: 'paint' },
  'Plumbing Store': { prefix: 'PLMB', slug: 'plmb' },
  'PVC & Aluminum Store': { prefix: 'PVCAL', slug: 'pvcal' },
  'PVC Store': { prefix: 'PVC', slug: 'pvc' },
  'Safety Store': { prefix: 'SAFE', slug: 'safe' },
  'Sandwich, Plywood, Vinyl': { prefix: 'SPV', slug: 'spv' },
  'Steel Store': { prefix: 'STEEL', slug: 'steel' },
}

// Fallback prefixes for the (currently almost-unused) non-raw-material
// categories, which have no store to derive a prefix from.
export const PRODUCT_CATEGORY_SKU_PREFIXES: Record<string, { prefix: string; slug: string }> = {
  finished_goods: { prefix: 'FG', slug: 'cat_finished_goods' },
  consumable: { prefix: 'CONS', slug: 'cat_consumable' },
  service: { prefix: 'SVC', slug: 'cat_service' },
}

interface SequenceRow {
  prefix: string
  next_number: number
  pad_length: number
  year_in_number: boolean
  separator: string
}

/**
 * Atomically increments and returns the next formatted document number.
 * Uses a separate pool query (intentionally outside any caller transaction)
 * so the counter commits even if the surrounding transaction rolls back —
 * the same guarantee PostgreSQL sequences give.
 * Falls back to `${fallbackPrefix}-${Date.now()}` when no sequence is configured.
 */
export async function nextDocumentNumber(
  companyId: string,
  docType: string,
  fallbackPrefix?: string,
): Promise<string> {
  try {
    const result = await pool.query<SequenceRow>(
      `UPDATE document_sequences
       SET next_number = next_number + 1, updated_at = NOW()
       WHERE company_id = $1 AND doc_type = $2
       RETURNING prefix, (next_number - 1) AS next_number, pad_length, year_in_number, separator`,
      [companyId, docType],
    )
    if (result.rows.length > 0) {
      const row = result.rows[0]!
      const num = String(row.next_number).padStart(row.pad_length, '0')
      const sep = row.separator
      if (row.year_in_number) {
        const yr = new Date().getFullYear()
        return `${row.prefix}${sep}${yr}${sep}${num}`
      }
      return `${row.prefix}${sep}${num}`
    }
  } catch {
    // DB unavailable or table missing — fall through to timestamp fallback
  }
  const pfx = fallbackPrefix ?? docType.toUpperCase().slice(0, 3)
  return `${pfx}-${Date.now()}`
}

export interface DocumentSequence {
  company_id: string
  doc_type: string
  prefix: string
  next_number: number
  pad_length: number
  year_in_number: boolean
  separator: string
  updated_at: string | null
}

export async function listDocumentSequences(companyId: string): Promise<DocumentSequence[]> {
  const result = await pool.query<DocumentSequence>(
    `SELECT company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator, updated_at
     FROM document_sequences WHERE company_id = $1 ORDER BY doc_type`,
    [companyId],
  )
  return result.rows
}

export async function upsertDocumentSequence(
  companyId: string,
  docType: string,
  data: Pick<
    DocumentSequence,
    'prefix' | 'next_number' | 'pad_length' | 'year_in_number' | 'separator'
  >,
): Promise<DocumentSequence> {
  const result = await pool.query<DocumentSequence>(
    `INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (company_id, doc_type) DO UPDATE SET
       prefix         = EXCLUDED.prefix,
       next_number    = EXCLUDED.next_number,
       pad_length     = EXCLUDED.pad_length,
       year_in_number = EXCLUDED.year_in_number,
       separator      = EXCLUDED.separator,
       updated_at     = NOW()
     RETURNING company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator, updated_at`,
    [
      companyId,
      docType,
      data.prefix,
      data.next_number,
      data.pad_length,
      data.year_in_number,
      data.separator,
    ],
  )
  return result.rows[0]!
}
