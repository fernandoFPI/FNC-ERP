import { pool, firstRowOrThrow, type PoolClient } from './client.js'

export const DOC_TYPES = [
  { key: 'rfq', label: 'RFQ Number', defaultPrefix: 'RFQ' },
  { key: 'project', label: 'Project Number', defaultPrefix: 'PRJ' },
  { key: 'purchase_order', label: 'Purchase Order', defaultPrefix: 'PO' },
  { key: 'requisition', label: 'Requisition', defaultPrefix: 'REQ' },
  { key: 'project_contract', label: 'Project Contract', defaultPrefix: 'CTR' },
  { key: 'project_invoice', label: 'Project Invoice', defaultPrefix: 'INV' },
  { key: 'rental_contract', label: 'Rental Contract', defaultPrefix: 'RC' },
  { key: 'rental_invoice', label: 'Rental Invoice', defaultPrefix: 'RI' },
  { key: 'client_document', label: 'Client Document', defaultPrefix: 'CD' },
  { key: 'employee_advance', label: 'Employee Advance', defaultPrefix: 'ADV' },
  { key: 'advance_settlement', label: 'Advance Settlement', defaultPrefix: 'SET' },
  { key: 'advance_return', label: 'Advance Return', defaultPrefix: 'RET' },
  { key: 'expense_claim', label: 'Expense Claim', defaultPrefix: 'EXP' },
  { key: 'material_issue', label: 'Store Out', defaultPrefix: 'SO' },
  { key: 'store_in', label: 'Store In', defaultPrefix: 'RCPT' },
  { key: 'product', label: 'Product SKU', defaultPrefix: 'PRD' },
  { key: 'daily_report', label: 'Daily Progress Report', defaultPrefix: 'DPR' },
] as const

export type DocType = (typeof DOC_TYPES)[number]['key']

// Product SKU prefixes keyed by products.sub_category ("store") used to be a
// static map here (see migration 215_product_sku_store_sequences for the
// original 1:1 store->prefix correlation this continues). It's now the
// product_store_categories table instead (migration 252), which admins
// manage themselves at Settings -> Store Categories — see
// getProductStoreCategoryPrefix in product-store-category.ts.

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

// How a rule writes a number: PREFIX SEP [YEAR SEP] zero-padded number. The one place that decides it, used by every
// generator below, so the Settings > Document Numbering preview and the numbers actually issued cannot differ.
export function formatDocumentNumber(
  rule: Pick<SequenceRow, 'prefix' | 'pad_length' | 'year_in_number' | 'separator'>,
  n: number,
  year: number = new Date().getFullYear(),
): string {
  const num = String(n).padStart(rule.pad_length, '0')
  const sep = rule.separator
  if (rule.year_in_number) return `${rule.prefix}${sep}${year}${sep}${num}`
  return `${rule.prefix}${sep}${num}`
}

// A Postgres regular expression matching every number this rule can issue (its own prefix, separator and, when it carries
// one, the given year, then digits). Prefix and separator are literal text typed by an admin, so they are escaped.
export function documentNumberPattern(
  rule: Pick<SequenceRow, 'prefix' | 'year_in_number' | 'separator'>,
  year: number = new Date().getFullYear(),
): string {
  const head = rule.year_in_number
    ? `${rule.prefix}${rule.separator}${year}${rule.separator}`
    : `${rule.prefix}${rule.separator}`
  return `^${head.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')}[0-9]+$`
}

/**
 * The next number of a document type, taken INSIDE the caller's transaction (unlike nextDocumentNumber below), for a
 * document whose table has a unique number per company. The counter is read and advanced under a row lock, so a failed
 * save gives the number back, and it never issues a number that already exists: `highestExisting` is handed the pattern of
 * this rule's numbers and answers the highest one in use (0 for none), so an admin lowering the counter, or numbers
 * created before the rule, cannot cause a duplicate. Returns null when the company has no rule for the type, and the
 * caller decides what that means.
 */
export async function nextDocumentNumberInTransaction(
  client: PoolClient,
  companyId: string,
  docType: string,
  highestExisting: (pattern: string) => Promise<number>,
): Promise<string | null> {
  const res = await client.query<SequenceRow>(
    `SELECT prefix, next_number, pad_length, year_in_number, separator
       FROM document_sequences WHERE company_id = $1 AND doc_type = $2 FOR UPDATE`,
    [companyId, docType],
  )
  const rule = res.rows[0]
  if (!rule) return null
  const year = new Date().getFullYear()
  const existing = await highestExisting(documentNumberPattern(rule, year))
  const n = Math.max(Number(rule.next_number), existing + 1)
  await client.query(
    `UPDATE document_sequences SET next_number = $3, updated_at = NOW() WHERE company_id = $1 AND doc_type = $2`,
    [companyId, docType, n + 1],
  )
  return formatDocumentNumber(rule, n, year)
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
      const row = firstRowOrThrow(result)
      return formatDocumentNumber(row, row.next_number)
    }
  } catch {
    // DB unavailable or table missing — fall through to timestamp fallback
  }
  const pfx = fallbackPrefix ?? docType.toUpperCase().slice(0, 3)
  // A random suffix alongside the millisecond timestamp — not just cosmetic.
  // A caller creating several documents of the same type back-to-back in one
  // call (e.g. finishBuyingRequisition forking one child PO per vendor) can
  // easily call this twice within the same millisecond, and Date.now() alone
  // would then return an identical value both times, colliding on the
  // document table's own unique document-number constraint.
  return `${pfx}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
  return firstRowOrThrow(result)
}
