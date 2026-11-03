// The client-facing block at the top of a project invoice: Contract No., Bill To, Deliver To,
// Date of Delivery and Period of Performance (migration 311).
//
// One place decides what each field holds, because three code paths build the invoice shape
// (the `projectInvoice` query, the re-fetch inside `updateProjectInvoice`, and the public
// verification route) and a field added to only some of them reads as empty on the others.
//
// A stored NULL means "never set": the value is derived from the project, so invoices created
// before the columns existed print a useful header. A stored empty string means the person
// cleared the text on purpose and it stays blank. (A DATE column cannot hold '', so clearing
// Date of Delivery falls back to the project's actual end date, which is the same fact.)

export interface InvoiceHeaderFields {
  clientContractNo: string | null
  billToAddress: string | null
  deliverToAddress: string | null
  deliveryDate: string | null
  periodOfPerformance: string | null
}

export type InvoiceHeaderInput = { [K in keyof InvoiceHeaderFields]?: string | null }

type Row = Record<string, unknown>

/** The project columns the derivation reads, to append to a SELECT that already joins `projects p`
 *  and `project_contracts pc`. */
export const INVOICE_HEADER_PROJECT_COLUMNS = `
  p.rfq_number AS project_rfq_number, p.project_location, p.client_contact AS project_client_contact,
  p.client_name AS project_client_name, p.planned_start_date, p.planned_end_date, p.actual_end_date`

/** Same columns for a lookup by contract (the create form's prefill). */
export const INVOICE_HEADER_DEFAULTS_SQL = `
  SELECT pc.client_name, ${INVOICE_HEADER_PROJECT_COLUMNS}
    FROM project_contracts pc
    JOIN projects p ON p.id = pc.project_id AND p.company_id = pc.company_id
   WHERE pc.id = $1 AND pc.company_id = $2`

export const INVOICE_HEADER_LIMITS = {
  clientContractNo: 200,
  billToAddress: 1000,
  deliverToAddress: 1000,
  periodOfPerformance: 200,
} as const

const FIELD_LABELS: Record<keyof InvoiceHeaderFields, string> = {
  clientContractNo: 'Contract No.',
  billToAddress: 'Bill To',
  deliverToAddress: 'Deliver To',
  deliveryDate: 'Date of Delivery',
  periodOfPerformance: 'Period of Performance',
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** 'YYYY-MM-DD' from a DATE value; the pg type parsers hand DATE columns over as plain strings. */
function ymd(v: unknown): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? ''))
  return m ? m[1] : null
}

function dmy(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** What the project says about each field. Nothing here is invented: a project with no
 *  location, contact, RFQ # or dates yields nulls and the printed invoice shows a dash. */
export function deriveInvoiceHeaderDefaults(row: Row): InvoiceHeaderFields {
  const client = text(row.client_name) ?? text(row.project_client_name)
  const contact = text(row.project_client_contact)
  const location = text(row.project_location)
  const start = ymd(row.planned_start_date)
  const end = ymd(row.planned_end_date)
  const join = (parts: (string | null)[]): string | null => {
    const lines = parts.filter((p): p is string => p !== null)
    return lines.length > 0 ? lines.join('\n') : null
  }
  return {
    clientContractNo: text(row.project_rfq_number),
    billToAddress: join([client, contact ? `Attention: ${contact}` : null]),
    deliverToAddress: join([client, location]),
    deliveryDate: ymd(row.actual_end_date),
    periodOfPerformance: start && end ? `${dmy(start)} – ${dmy(end)}` : null,
  }
}

/** Stored value, or the derived one where nothing was ever stored. */
export function resolveInvoiceHeader(row: Row): InvoiceHeaderFields {
  const derived = deriveInvoiceHeaderDefaults(row)
  const pick = (stored: unknown, fallback: string | null): string | null =>
    stored === null || stored === undefined ? fallback : String(stored)
  return {
    clientContractNo: pick(row.client_contract_no, derived.clientContractNo),
    billToAddress: pick(row.bill_to_address, derived.billToAddress),
    deliverToAddress: pick(row.deliver_to_address, derived.deliverToAddress),
    deliveryDate: ymd(row.delivery_date) ?? derived.deliveryDate,
    periodOfPerformance: pick(row.period_of_performance, derived.periodOfPerformance),
  }
}

/** Validates what a client sent. Absent keys stay absent (the caller decides: derive on create,
 *  leave alone on update). A present text is trimmed and may be '' (cleared on purpose); a present
 *  date is '' / null (cleared) or a real calendar date. */
export function normalizeInvoiceHeaderInput(input: Record<string, unknown>): InvoiceHeaderInput {
  const out: InvoiceHeaderInput = {}
  for (const key of [
    'clientContractNo',
    'billToAddress',
    'deliverToAddress',
    'periodOfPerformance',
  ] as const) {
    const v = input[key]
    if (v === undefined) continue
    const s = v === null ? '' : String(v).replace(/\r\n?/g, '\n').trim()
    const max = INVOICE_HEADER_LIMITS[key]
    if (s.length > max) throw new Error(`${FIELD_LABELS[key]} is too long (max ${max} characters)`)
    out[key] = s
  }
  if (input.deliveryDate !== undefined) {
    const raw = input.deliveryDate === null ? '' : String(input.deliveryDate).trim()
    if (raw === '') {
      out.deliveryDate = null
    } else {
      const d = ymd(raw)
      if (
        !d ||
        Number.isNaN(Date.parse(`${d}T00:00:00Z`)) ||
        new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d
      ) {
        throw new Error('Date of Delivery must be a valid date (YYYY-MM-DD)')
      }
      out.deliveryDate = d
    }
  }
  return out
}

/** Values to store when an invoice is created: what the person typed, and for anything not sent,
 *  what the project says. */
export function invoiceHeaderForCreate(
  input: Record<string, unknown>,
  projectRow: Row,
): InvoiceHeaderFields {
  const given = normalizeInvoiceHeaderInput(input)
  const derived = deriveInvoiceHeaderDefaults(projectRow)
  return {
    clientContractNo: given.clientContractNo ?? derived.clientContractNo,
    billToAddress: given.billToAddress ?? derived.billToAddress,
    deliverToAddress: given.deliverToAddress ?? derived.deliverToAddress,
    deliveryDate: given.deliveryDate === undefined ? derived.deliveryDate : given.deliveryDate,
    periodOfPerformance: given.periodOfPerformance ?? derived.periodOfPerformance,
  }
}
