// The one place that decides which currency a PO line is shown (and edited) in.
//
// A line is stored in po_lines.currency_code. That is the column the per-currency totals group by, the
// purchases, the jobsite cost rows and the completion journal all follow, so what the screen prints must be the
// same column. The page used to print `market_price_currency ?? requested_currency_code ?? po.currency_code`
// instead and never looked at the stored one: a line added after approval (stored IQD, no market or requested
// currency) was printed in the PO header's currency (USD) while the Order total counted it as IQD, and the Edit PO
// form started from that wrong value, so "change it to USD" compared USD with USD and saved nothing.
//
// The other columns stay only as a fallback for a line whose stored currency was not loaded.
export interface LineCurrencyFields {
  currency_code?: string | null
  market_price_currency?: string | null
  requested_currency_code?: string | null
}

export function poLineCurrency(line: LineCurrencyFields, poCurrency: string): string {
  // a blank code counts as no code, which `??` would not
  const codes = [line.currency_code, line.market_price_currency, line.requested_currency_code]
  return codes.map((c) => c?.trim()).find((c) => !!c) ?? poCurrency
}
