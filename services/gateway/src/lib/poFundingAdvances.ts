// Which employee advance pays which currency of a purchase order (migration 324).
//
// A PO funded from advances needs ONE ADVANCE PER CURRENCY it has lines in. It used to hold a single
// `funding_advance_id` and setPOFunding insisted that advance be in the PO's one header currency, so a PO with IQD and
// USD lines (21 were waiting on production, 2026-11-15) could be linked to an IQD advance or a USD one, never both.
//
// All the rules live here as plain functions so one test file can pin every one of them and setPOFunding stays a thin
// caller. Nothing is converted between currencies: a line is paid from the advance of its own currency.
import { query } from '@fnc-erp/db'

export interface FundingSlot {
  currencyCode: string
  advanceId: string
}

/** Statuses an advance can be funding a PO in (issued and not fully settled), as the settlement queue reads them. */
export const SETTLEABLE_ADVANCE_STATUSES = ['approved', 'partially_settled']

const CODE = /^[A-Z]{3}$/

/** "IQD", "IQD and USD", "EUR, IQD and USD": how a message names currencies. */
export function joinCurrencies(codes: string[]): string {
  if (codes.length <= 1) return codes.join('')
  return `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`
}

export interface FundingPlanInput {
  /** Distinct currencies of the PO's lines. Empty for a PO that has no lines yet (the header currency stands in). */
  lineCurrencies: string[]
  headerCurrency: string
  /** One advance per currency (what the PO page sends). */
  fundingAdvances?: { currencyCode: string; advanceId: string }[] | null | undefined
  /** The old single-advance argument, still sent by a browser tab opened before this change. */
  fundingAdvanceId?: string | null | undefined
}

/**
 * The advance chosen for each currency of the PO, or the plain sentence that says why the choice is not complete.
 * Every currency the PO has lines in needs exactly one advance, and no advance may be named for a currency it has none in.
 */
export function planFundingSlots(input: FundingPlanInput): FundingSlot[] {
  const wanted = input.lineCurrencies.length
    ? [...new Set(input.lineCurrencies.map((c) => c.trim().toUpperCase()))].sort()
    : [input.headerCurrency.trim().toUpperCase()]

  let slots: FundingSlot[]
  if (input.fundingAdvances && input.fundingAdvances.length > 0) {
    const seen = new Set<string>()
    slots = input.fundingAdvances.map((s) => {
      const code = String(s.currencyCode).trim().toUpperCase()
      if (!CODE.test(code))
        throw new Error('Currency must be a three-letter code such as IQD or USD')
      if (seen.has(code)) throw new Error(`Only one advance can be chosen for ${code}`)
      seen.add(code)
      return { currencyCode: code, advanceId: s.advanceId }
    })
  } else if (input.fundingAdvanceId) {
    // An older tab sends one advance. That is unambiguous only when the PO has one currency.
    if (wanted.length > 1)
      throw new Error(
        `This PO has lines in ${joinCurrencies(wanted)}: choose one advance for each currency`,
      )
    slots = [{ currencyCode: wanted[0], advanceId: input.fundingAdvanceId }]
  } else {
    throw new Error('An advance must be selected when funding source is Employee Advance')
  }

  const extra = slots.map((s) => s.currencyCode).filter((c) => !wanted.includes(c))
  if (extra.length)
    throw new Error(
      `This PO has no ${joinCurrencies(extra)} lines, so it needs no ${joinCurrencies(extra)} advance`,
    )
  const missing = wanted.filter((c) => !slots.some((s) => s.currencyCode === c))
  if (missing.length)
    throw new Error(`Choose an advance for the ${joinCurrencies(missing)} lines of this PO`)

  return slots.sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
}

/**
 * Why this advance cannot fund this currency of the PO, or null. `advance` is what the lookup found (company-scoped),
 * undefined when there was none.
 */
export function advanceProblem(
  advance: { status: string; currency_code: string; advance_number?: string } | undefined,
  slot: FundingSlot,
): string | null {
  if (!advance) return 'Selected advance not found'
  if (!SETTLEABLE_ADVANCE_STATUSES.includes(advance.status))
    return 'Selected advance is not in a settleable state'
  const advanceCurrency = String(advance.currency_code).trim()
  if (advanceCurrency !== slot.currencyCode)
    return `PO currency must match the selected advance’s currency (${slot.currencyCode} lines need a ${slot.currencyCode} advance${
      advance.advance_number ? `, ${advance.advance_number} is in ${advanceCurrency}` : ''
    })`
  return null
}

/**
 * The advance that goes in the legacy `purchase_orders.funding_advance_id` column: the one in the header currency, else
 * the first by currency. Everything that still reads that column (the PO page link, the list joins) keeps working.
 */
export function primaryAdvanceId(slots: FundingSlot[], headerCurrency: string): string | null {
  if (slots.length === 0) return null
  const header = headerCurrency.trim().toUpperCase()
  return (slots.find((s) => s.currencyCode === header) ?? slots[0]).advanceId
}

/** SQL text (for a `purchase_orders` row aliased `poAlias`): the PO's advances as `IQD:<id>,USD:<id>`, '' when none. The
 *  UPDATE in setPOFunding compares it with what the request read, so a change that touched only the second advance is
 *  caught as well as one that touched the primary. */
export const poFundingFingerprintSql = (poAlias: string): string =>
  `COALESCE((SELECT string_agg(f.currency_code || ':' || f.advance_id::text, ',' ORDER BY f.currency_code)
               FROM po_funding_advances f WHERE f.po_id = ${poAlias}.id), '')`

/** SQL for the same rows as JSON, for the audit record. */
export const poFundingRowsSql = (poAlias: string): string =>
  `(SELECT COALESCE(json_agg(json_build_object('currency_code', f.currency_code, 'advance_id', f.advance_id)
                             ORDER BY f.currency_code), '[]'::json)
      FROM po_funding_advances f WHERE f.po_id = ${poAlias}.id)`

/** Distinct currencies of a PO's lines, alphabetical. */
export async function poLineCurrencies(poId: string): Promise<string[]> {
  const r = await query<{ currency_code: string }>(
    `SELECT DISTINCT currency_code FROM po_lines WHERE po_id = $1 ORDER BY 1`,
    [poId],
  )
  return r.rows.map((x) => String(x.currency_code).trim())
}

/** Currencies the PO has lines in but no linked advance for: those lines could never be settled. */
export async function uncoveredFundingCurrencies(poId: string): Promise<string[]> {
  const r = await query<{ currency_code: string }>(
    `SELECT DISTINCT pl.currency_code FROM po_lines pl
      WHERE pl.po_id = $1
        AND NOT EXISTS (SELECT 1 FROM po_funding_advances f WHERE f.po_id = pl.po_id AND f.currency_code = pl.currency_code)
      ORDER BY 1`,
    [poId],
  )
  return r.rows.map((x) => String(x.currency_code).trim())
}

export interface POFundingAdvanceRow {
  currency_code: string
  advance_id: string
  advance_number: string
  employee_name: string | null
  outstanding_amount: string | null
  status: string
}

/** What `PurchaseOrder.fundingAdvances` returns: one row per currency, scoped to the caller's company on both sides. */
export async function getPOFundingAdvances(
  poId: string,
  companyId: string,
): Promise<POFundingAdvanceRow[]> {
  const r = await query<POFundingAdvanceRow>(
    `SELECT f.currency_code, f.advance_id, a.advance_number, a.employee_name,
            a.outstanding_amount::text AS outstanding_amount, a.status
       FROM po_funding_advances f
       JOIN employee_advances a ON a.id = f.advance_id AND a.company_id = f.company_id
      WHERE f.po_id = $1 AND f.company_id = $2
      ORDER BY f.currency_code`,
    [poId, companyId],
  )
  return r.rows.map((x) => ({ ...x, currency_code: String(x.currency_code).trim() }))
}
