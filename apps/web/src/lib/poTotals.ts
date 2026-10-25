// One rule for showing a purchase order's total on any screen.
//
// purchase_orders.total_amount is NULL when the PO's lines span more than one
// currency, and when it has no lines (migration 308, recalcPOTotalsGW): under
// the no-currency-exchange policy there is no single correct number. The only
// figure that is right for every PO is currencyTotals -- one entry per
// currency, never summed across currencies. Every screen that used to read
// total_amount + currency_code goes through here so none of them re-invents
// (and gets wrong) the NULL case.
//
// currencyTotals wins whenever the query asked for it, even when it is empty
// (a PO with no lines, or a viewer who isn't allowed to see totals: the
// resolver redacts total_amount to '0' for them and sends []). The single
// total_amount/currency_code pair is only a fallback for a payload that never
// requested currencyTotals at all.

export interface PoCurrencyTotalLike {
  currency_code: string
  subtotal: string | number
}

export interface PoTotalSource {
  total_amount?: string | number | null
  currency_code?: string | null
  currencyTotals?: readonly PoCurrencyTotalLike[] | null
}

export interface PoTotalEntry {
  currencyCode: string
  amount: number
}

function toAmount(v: string | number | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

export function poTotalEntries(po: PoTotalSource): PoTotalEntry[] {
  if (po.currencyTotals != null) {
    const out: PoTotalEntry[] = []
    for (const ct of po.currencyTotals) {
      const amount = toAmount(ct.subtotal)
      if (amount != null) out.push({ currencyCode: ct.currency_code, amount })
    }
    return out
  }
  const amount = toAmount(po.total_amount)
  if (amount != null && po.currency_code) return [{ currencyCode: po.currency_code, amount }]
  return []
}

// "200 IQD + 30 USD" style one-liner for places with no room to stack. The
// "+" only separates the per-currency figures; they are never added together.
export function poTotalsText(
  po: PoTotalSource,
  format: (amount: number, currencyCode: string) => string,
  empty = '—',
): string {
  const entries = poTotalEntries(po)
  if (entries.length === 0) return empty
  return entries.map((e) => format(e.amount, e.currencyCode)).join(' + ')
}
