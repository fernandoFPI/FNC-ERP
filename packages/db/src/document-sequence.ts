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
] as const

export type DocType = (typeof DOC_TYPES)[number]['key']

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
