// The currency a Store In (a confirmed receipt) books its cost in.
//
// The cost it writes is `unit_price x fx_rate_to_base`. A line converted at receipt (a rate other than 1, the flow
// before the requisition split) really is in the company's base currency. A line with no rate (everything since)
// is in its own currency and nothing was converted. The label has to follow the number. It used to be neither: the
// stock move was inserted with no currency at all, so it took the column default 'IQD', and the product's cost was
// recorded against the base currency whatever the line was in. A 6.25 USD line therefore became 6.25 IQD on the
// location's last cost and on the product (142 of 485 Store In moves in eight weeks, 37 product costs). Nothing is
// converted here: this only says what currency the figure already is in.
export function receiptCostCurrency(
  lineCurrency: string | null | undefined,
  fxRateToBase: number,
  baseCurrency: string,
): string {
  if (fxRateToBase !== 1) return baseCurrency
  const own = lineCurrency?.trim().toUpperCase()
  return own ? own : baseCurrency // an empty string counts as "no currency", which ?? would not
}
