// Choosing which employee advance pays a purchase order (PO page, "How was this PO paid?").
//
// A PO needs ONE ADVANCE PER CURRENCY its lines are in (migration 324, playbook #90): a PO with IQD and USD lines is paid
// from an IQD advance and a USD one, and each line is settled against the advance of its own currency. It used to be one
// advance for the whole PO, accepted only in the PO's header currency, so a mixed PO could be linked to one currency and the
// other had nothing to pay it. These are the rules the page applies; the server (gateway `lib/poFundingAdvances.ts`)
// enforces the same ones and is the authority.
import { poLineCurrency, type LineCurrencyFields } from './poLineCurrency'

/** Statuses an advance can fund a PO in: issued and not fully settled (the server's SETTLEABLE_ADVANCE_STATUSES). */
export const SETTLEABLE_ADVANCE_STATUSES = ['approved', 'partially_settled']

export interface FundingAdvanceOption {
  id: string
  advance_number: string
  outstanding_amount: number | string
  currency_code: string
  status: string
}

/** advance id chosen for each currency, by currency code */
export type FundingSelection = Record<string, string>

/**
 * The currencies this PO needs an advance for: those of its lines, alphabetical, one each. A PO with no lines yet stands in
 * its header currency (the server does the same). The line's stored currency decides, as everywhere else on the page.
 */
export function fundingCurrencies(po: {
  currency_code: string
  lines?: readonly LineCurrencyFields[] | null
}): string[] {
  const header = po.currency_code.trim().toUpperCase()
  const codes = (po.lines ?? []).map((l) => poLineCurrency(l, header).trim().toUpperCase())
  return codes.length > 0 ? [...new Set(codes)].sort() : [header]
}

/** The employee's advances that can pay this currency: usable and in exactly that currency, never converted. */
export function advancesForCurrency(
  advances: readonly FundingAdvanceOption[],
  currency: string,
): FundingAdvanceOption[] {
  return advances.filter(
    (a) =>
      SETTLEABLE_ADVANCE_STATUSES.includes(a.status) &&
      a.currency_code.trim().toUpperCase() === currency,
  )
}

/**
 * The selection after the list of advances (or the PO's currencies) changed: a choice that is still on offer stays, a
 * currency with exactly one advance on offer takes it (nothing to decide), anything else is left empty for a person.
 */
export function autoSelectAdvances(
  currencies: readonly string[],
  advances: readonly FundingAdvanceOption[],
  previous: FundingSelection,
): FundingSelection {
  const next: FundingSelection = {}
  for (const currency of currencies) {
    const options = advancesForCurrency(advances, currency)
    const kept = previous[currency]
    if (kept && options.some((a) => a.id === kept)) next[currency] = kept
    else if (options.length === 1) next[currency] = options[0].id
  }
  return next
}

/** True once every currency of the PO has an advance chosen. */
export function fundingSelectionComplete(
  currencies: readonly string[],
  selection: FundingSelection,
): boolean {
  return currencies.length > 0 && currencies.every((c) => !!selection[c])
}

/** What setPOFunding takes: one entry per currency, in the PO's currency order. */
export function fundingAdvancesInput(
  currencies: readonly string[],
  selection: FundingSelection,
): { currencyCode: string; advanceId: string }[] {
  return currencies.flatMap((currencyCode) => {
    const advanceId = selection[currencyCode]
    return advanceId ? [{ currencyCode, advanceId }] : []
  })
}
