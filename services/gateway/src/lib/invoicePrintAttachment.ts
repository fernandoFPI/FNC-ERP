// The one file an invoice can carry to be printed after its last page: a picture or a PDF (a purchase order copy, a
// client's approval, a delivery note). Stored as an ordinary document_attachments row on the invoice
// (entity_type 'project_invoice', no migration), told apart from any other file attached to the invoice by its label.
//
// Why a dedicated path and not the generic attach routes: those check only that the caller is logged in (the gateway's
// /files/attach, and verifyAttachmentEntityOwnershipGW answers `true` for 'project_invoice') or hold *view* access
// (the projects service mount), so anyone could have put a file on an invoice that prints for the client, including
// a file belonging to a different document. Here the caller needs projects.invoices.edit, the invoice must be in their
// company, and the file must be one THEY just uploaded and that nothing else uses (playbook #48, #82).
import { query } from '@fnc-erp/db'

export const INVOICE_PRINT_ATTACHMENT_LABEL = 'invoice_print_page'
export const PRINT_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const
export const PRINT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export interface PrintAttachmentFileRow {
  mime_type: string
  size_bytes: string | number
  status: string
  uploaded_by: string
  category: string
}

// Why this file cannot be the invoice's attachment, in words the person can act on; null when it can.
export function checkPrintAttachmentFile(
  file: PrintAttachmentFileRow,
  callerId: string,
): string | null {
  if (!(PRINT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.mime_type))
    return 'The attachment must be a JPG, PNG or PDF file'
  if (Number(file.size_bytes) > PRINT_ATTACHMENT_MAX_BYTES)
    return `The attachment is larger than ${PRINT_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`
  // 'uploaded' = confirmed and not used by anything yet. A file that is pending (bytes not sent) or already attached
  // to another document is refused, so a file id cannot be borrowed from somewhere else in the company.
  if (file.status !== 'uploaded') return 'This file is not available to attach (upload it again)'
  if (file.uploaded_by !== callerId) return 'You can only attach a file you uploaded yourself'
  if (file.category !== 'attachment') return 'This file was uploaded for something else'
  return null
}

export interface InvoicePrintAttachment {
  id: string
  fileId: string
  filename: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string | null
}

interface Row {
  id: string
  file_id: string
  original_filename: string
  mime_type: string
  size_bytes: string
  created_at: string | null
}

export const mapPrintAttachmentRow = (r: Row): InvoicePrintAttachment => ({
  id: r.id,
  fileId: r.file_id,
  filename: r.original_filename,
  mimeType: r.mime_type,
  sizeBytes: Number(r.size_bytes),
  uploadedAt: r.created_at,
})

// The invoice's attachment, scoped to the company on BOTH the invoice and the file, or null.
export async function getInvoicePrintAttachment(
  invoiceId: string,
  companyId: string,
): Promise<InvoicePrintAttachment | null> {
  const r = await query<Row>(
    `SELECT da.id, f.id AS file_id, f.original_filename, f.mime_type, f.size_bytes, da.created_at
       FROM document_attachments da
       JOIN files f ON f.id = da.file_id AND f.company_id = $3 AND f.status <> 'deleted'
       JOIN project_invoices i ON i.id = da.entity_id AND i.company_id = $3
      WHERE da.entity_type = 'project_invoice' AND da.entity_id = $1 AND da.label = $2
      ORDER BY da.created_at DESC
      LIMIT 1`,
    [invoiceId, INVOICE_PRINT_ATTACHMENT_LABEL, companyId],
  )
  return r.rows.length > 0 ? mapPrintAttachmentRow(r.rows[0]) : null
}
