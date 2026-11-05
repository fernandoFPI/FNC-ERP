// A wire-transfer invoice prints its "Banking Information" block from the bank account chosen on the invoice
// (project_invoices.bank_account_id). Nothing sets that account when an invoice is created, so someone has to pick it, and
// when nobody does the block silently disappears from the preview and the print while "Please transfer payment within N
// days" stays, which is how NY-INV-2026-0004 went out without banking details. An invoice that is paid by wire must have
// an active account before it moves forward; a cash invoice needs none.
//
// One check, used by every route that moves an invoice forward (submit for review, approve, issue), so they cannot drift.
import { query } from '@fnc-erp/db'

export const BANK_ACCOUNT_REQUIRED = 'BANK_ACCOUNT_REQUIRED'

export interface InvoiceBankCheck {
  /** The invoice's current status, so a caller can keep its own wrong-status error ahead of this one. */
  status: string
  /** Why the invoice cannot move forward, in words for the person; null when it can. */
  problem: string | null
}

const NO_ACCOUNT =
  'Choose a bank account for this invoice (or set the payment type to Cash) before going further. Without one it prints no banking information.'
const INACTIVE_ACCOUNT =
  'The bank account chosen for this invoice is no longer active. Choose another one before going further, or it prints no banking information.'

/** Null when the invoice does not exist in this company (the caller's own not-found handling then applies). */
export async function invoiceBankCheck(
  invoiceId: string,
  companyId: string,
): Promise<InvoiceBankCheck | null> {
  const r = await query<{
    status: string
    payment_type: string
    bank_account_id: string | null
    is_active: boolean | null
  }>(
    `SELECT pi.status, pi.payment_type, pi.bank_account_id, ba.is_active
       FROM project_invoices pi
       LEFT JOIN bank_accounts ba ON ba.id = pi.bank_account_id
      WHERE pi.id = $1 AND pi.company_id = $2`,
    [invoiceId, companyId],
  )
  const row = r.rows[0]
  if (!row) return null
  if (row.payment_type === 'cash') return { status: row.status, problem: null }
  if (!row.bank_account_id) return { status: row.status, problem: NO_ACCOUNT }
  if (!row.is_active) return { status: row.status, problem: INACTIVE_ACCOUNT }
  return { status: row.status, problem: null }
}
