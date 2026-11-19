// Equipment that must come back (Store Out returnables). Playbook #107, STORE_OUT_EQUIPMENT_PLAN.md phase 1.
//
// A Store Out line is either consumption (stock leaves for good, the project is charged) or returnable (equipment: it leaves the
// shelf for a while, costs the project nothing, and comes back through a return that records its condition). While it is out the
// stock sits in the company's Virtual Consumption location, exactly like a consumable, so every stock query that already leaves
// that location out of what is available needs no change; the return moves it back out of there into a real location.
//
// Everything that decides "what is still out" and "who may take it back" lives here, so the Returnables list, its summary, the
// return mutation and the Store Out readers cannot drift (the same family as playbook #24 and #43).

/** How long a returnable item may be out when neither the line nor the product says. */
export const EQUIPMENT_DEFAULT_RETURN_DAYS = 7

export const RETURN_CONDITIONS = ['good', 'needs_repair', 'damaged', 'lost'] as const
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number]

export function isReturnCondition(v: unknown): v is ReturnCondition {
  return typeof v === 'string' && (RETURN_CONDITIONS as readonly string[]).includes(v)
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for a real calendar date written YYYY-MM-DD (2026-02-30 is not one). */
export function isDateOnly(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = DATE_ONLY.exec(v)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  )
}

/**
 * issueDate plus a number of days, as YYYY-MM-DD. Pure calendar arithmetic in UTC: never goes through a local-time Date, so a
 * server in any timezone gives the same answer (a DATE must not be moved by the machine's offset).
 */
export function addDaysToDateOnly(date: string, days: number): string {
  const m = DATE_ONLY.exec(date)
  if (!m) throw new Error(`Not a date: ${date}`)
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days))
  return d.toISOString().slice(0, 10)
}

/** The date a returnable line is due back when nobody typed one: the product's own return period, else a week. */
export function defaultExpectedReturnDate(issueDate: string, productDays: number | null | undefined): string {
  const days = productDays != null && productDays > 0 ? productDays : EQUIPMENT_DEFAULT_RETURN_DAYS
  return addDaysToDateOnly(issueDate, days)
}

export interface IssuedTo {
  employeeId: string | null
  name: string | null
  department: string | null
}

/** Trims the free-text parts of "issued to" and enforces the column sizes; empty becomes null, never an empty string. */
export function cleanIssuedToText(
  value: string | null | undefined,
  label: string,
  max: number,
): string | null {
  if (value == null) return null
  const t = value.trim().replace(/\s+/g, ' ')
  if (t === '') return null
  if (t.length > max) throw new Error(`${label} can be at most ${max} characters`)
  return t
}

/** Quantities are NUMERIC(20,4): anything closer than this to zero is zero. */
export const QTY_EPSILON = 0.0001

/**
 * The Returnables list and its summary read ONE query, so a count and the rows it counts cannot disagree.
 *
 * Scope ($1 = the caller's company): a returnable line of an ISSUED Store Out that belongs to the caller's company (it made the
 * Store Out) OR whose stock came from one of the caller's locations (it holds the equipment, e.g. the central warehouse lending
 * to another company). Anything else is invisible.
 *
 * `can_receive_back` is decided here and nowhere else: only the company that HOLDS the equipment takes it back.
 * A lender sees the borrowing company's name, the person and the department, but never the borrower's project.
 */
export const RETURNABLE_ITEMS_BASE_SQL = `
  -- currency-safe: every SUM here is a quantity of units, not money
  SELECT il.id AS issue_line_id, pmi.id AS issue_id, pmi.issue_number, pmi.issue_date::text AS issue_date,
         pmi.company_id AS issue_company_id, loc.company_id AS owner_company_id,
         (loc.company_id <> pmi.company_id) AS is_loan,
         borrower.name AS borrower_company_name, lender.name AS owner_company_name,
         pmi.issued_to_name, pmi.department, pmi.po_id, pmi.requisition_id,
         CASE WHEN pmi.company_id = $1 THEN proj.code END AS project_code,
         CASE WHEN pmi.company_id = $1 THEN proj.name END AS project_name,
         il.product_id, pr.name AS product_name, pr.name_ar AS product_name_ar, pr.sku, pr.uom,
         COALESCE(pr.is_returnable, false) AS product_is_equipment,
         il.qty_issued::numeric AS qty_issued, il.expected_return_date::text AS expected_return_date, il.serial_note,
         COALESCE(ret.qty_returned, 0) AS qty_returned, COALESCE(ret.qty_lost, 0) AS qty_lost,
         ret.last_return_date::text AS last_return_date,
         il.qty_issued - COALESCE(ret.qty_returned, 0) - COALESCE(ret.qty_lost, 0) AS qty_outstanding,
         il.from_location_id, loc.name AS store_name,
         (loc.company_id = $1) AS can_receive_back
    FROM project_material_issue_lines il
    JOIN project_material_issues pmi ON pmi.id = il.issue_id AND pmi.status = 'issued'
    JOIN stock_locations loc ON loc.id = il.from_location_id
    LEFT JOIN products pr ON pr.id = il.product_id
    LEFT JOIN projects proj ON proj.id = pmi.project_id AND proj.company_id = pmi.company_id
    LEFT JOIN companies borrower ON borrower.id = pmi.company_id
    LEFT JOIN companies lender ON lender.id = loc.company_id
    LEFT JOIN (
      SELECT rl.issue_line_id,
             SUM(rl.qty_returned) FILTER (WHERE rl.condition <> 'lost') AS qty_returned,
             SUM(rl.qty_returned) FILTER (WHERE rl.condition = 'lost') AS qty_lost,
             MAX(r.return_date) AS last_return_date
        FROM store_out_return_lines rl
        JOIN store_out_returns r ON r.id = rl.return_id
       GROUP BY rl.issue_line_id
    ) ret ON ret.issue_line_id = il.id
   WHERE il.is_returnable AND (pmi.company_id = $1 OR loc.company_id = $1)`

/** open = something is still out; overdue = still out and past its date; all = also what has been returned. */
export type ReturnableFilter = 'open' | 'overdue' | 'all'

export function isReturnableFilter(v: unknown): v is ReturnableFilter {
  return v === 'open' || v === 'overdue' || v === 'all'
}

/** The row-level state, derived in SQL from the base rows so the list filter and the summary use the same words. */
export const RETURNABLE_STATUS_SQL = `
  CASE WHEN b.qty_outstanding <= ${QTY_EPSILON} THEN 'returned'
       WHEN b.expected_return_date IS NOT NULL AND b.expected_return_date::date < CURRENT_DATE THEN 'overdue'
       ELSE 'out' END`

export function returnableItemsSql(filter: ReturnableFilter, withSearch: boolean): string {
  const where: string[] = []
  if (filter === 'open') where.push(`b.qty_outstanding > ${QTY_EPSILON}`)
  if (filter === 'overdue')
    where.push(
      `b.qty_outstanding > ${QTY_EPSILON} AND b.expected_return_date IS NOT NULL AND b.expected_return_date::date < CURRENT_DATE`,
    )
  if (withSearch)
    where.push(
      `(b.issue_number ILIKE $2 OR COALESCE(b.issued_to_name, '') ILIKE $2 OR COALESCE(b.product_name, '') ILIKE $2
        OR COALESCE(b.sku, '') ILIKE $2 OR COALESCE(b.department, '') ILIKE $2 OR COALESCE(b.serial_note, '') ILIKE $2)`,
    )
  return `SELECT b.*, ${RETURNABLE_STATUS_SQL} AS status,
            CASE WHEN b.qty_outstanding > ${QTY_EPSILON} AND b.expected_return_date IS NOT NULL
                 THEN GREATEST(CURRENT_DATE - b.expected_return_date::date, 0) END AS days_overdue
       FROM (${RETURNABLE_ITEMS_BASE_SQL}) b
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY (b.qty_outstanding <= ${QTY_EPSILON}), b.expected_return_date NULLS LAST, b.issue_date DESC, b.issue_number
      LIMIT 500`
}

export const RETURNABLE_SUMMARY_SQL = `
  SELECT COUNT(*) FILTER (WHERE b.qty_outstanding > ${QTY_EPSILON})::int AS open_lines,
         COUNT(*) FILTER (WHERE b.qty_outstanding > ${QTY_EPSILON} AND b.expected_return_date IS NOT NULL
                            AND b.expected_return_date::date < CURRENT_DATE)::int AS overdue_lines,
         COUNT(*) FILTER (WHERE b.qty_outstanding > ${QTY_EPSILON} AND b.expected_return_date IS NOT NULL
                            AND b.expected_return_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2)::int AS due_soon_lines,
         -- currency-safe: quantities, not money
         COALESCE(SUM(b.qty_outstanding) FILTER (WHERE b.qty_outstanding > ${QTY_EPSILON}), 0)::text AS units_out
    FROM (${RETURNABLE_ITEMS_BASE_SQL}) b`

/** The Store Out line's returnable fields, for the JSON the Store Out readers build (one fragment, so the readers agree). */
export const ISSUE_LINE_EQUIPMENT_JSON = `
  'isReturnable', pmil.is_returnable,
  'expectedReturnDate', pmil.expected_return_date,
  'serialNote', pmil.serial_note,
  'qtyReturned', COALESCE((SELECT SUM(rl.qty_returned) FROM store_out_return_lines rl WHERE rl.issue_line_id = pmil.id), 0)`

/** The Store Out header's "issued to" fields, in the shape the GraphQL type uses. */
export function issuedToFields(row: Record<string, unknown>): {
  issuedToName: string | null
  issuedToEmployeeId: string | null
  department: string | null
} {
  return {
    issuedToName: (row.issued_to_name as string | null | undefined) ?? null,
    issuedToEmployeeId: (row.issued_to_employee_id as string | null | undefined) ?? null,
    department: (row.department as string | null | undefined) ?? null,
  }
}

/** One row of returnableItemsSql, in the shape the ReturnableItem GraphQL type uses (NUMERIC arrives as text). */
export function mapReturnableItemRow(r: Record<string, unknown>) {
  const n = (v: unknown): number => parseFloat(String(v ?? 0)) || 0
  return {
    issueLineId: r.issue_line_id,
    issueId: r.issue_id,
    issueNumber: r.issue_number,
    issueDate: r.issue_date,
    productId: r.product_id,
    productName: (r.product_name as string | null) ?? null,
    productNameAr: (r.product_name_ar as string | null) ?? null,
    sku: (r.sku as string | null) ?? null,
    uom: (r.uom as string | null) ?? null,
    isEquipment: r.product_is_equipment === true,
    qtyIssued: n(r.qty_issued),
    qtyReturned: n(r.qty_returned),
    qtyLost: n(r.qty_lost),
    qtyOutstanding: Math.max(n(r.qty_outstanding), 0),
    expectedReturnDate: (r.expected_return_date as string | null) ?? null,
    daysOverdue: r.days_overdue == null ? null : Number(r.days_overdue),
    status: r.status,
    serialNote: (r.serial_note as string | null) ?? null,
    issuedToName: (r.issued_to_name as string | null) ?? null,
    department: (r.department as string | null) ?? null,
    projectCode: (r.project_code as string | null) ?? null,
    projectName: (r.project_name as string | null) ?? null,
    storeName: (r.store_name as string | null) ?? null,
    fromLocationId: (r.from_location_id as string | null) ?? null,
    isLoan: r.is_loan === true,
    ownerCompanyName: (r.owner_company_name as string | null) ?? null,
    borrowerCompanyName: (r.borrower_company_name as string | null) ?? null,
    lastReturnDate: (r.last_return_date as string | null) ?? null,
    canReceiveBack: r.can_receive_back === true,
  }
}

/** A product's "may be out for N days": null for "not set" (a week applies), else a whole number from 1 to 3650. */
export function productReturnDays(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 3650)
    throw new Error('Return period must be a whole number of days between 1 and 3650')
  return n
}
