// What a requisition line's total means (playbook #127): the amount still TO PURCHASE, which is the part of the ordered quantity
// that is not covered from inventory, times the price: (qty_ordered - qty_from_stock) x price. A line covered 100% from stock is
// therefore 0 (nothing is bought), and a line covered 8 of 12 at 11 USD is 4 x 11 = 44, not 12 x 11 = 132.
//
// Until now every pricing step wrote qty_ordered x price, so only a FULLY covered line was zero and a partly covered one counted
// the units that come from the shelf at the purchase price too (NF-REQ-2026-0195: 132 for 4 units to buy). The value of the stock
// part is a separate, display-only figure (store price x quantity from stock) that the page shows next to the total.
//
// ONE rule, written once, used by every statement that sets a requisition line's total, so they cannot drift again (#6, #23).

/** Units still to buy on a line: what was ordered minus what stock covers, never below zero. */
export function toPurchaseQty(ordered: number, fromStock: number): number {
  return Math.max(ordered - fromStock, 0)
}

/**
 * SQL for a requisition line's total inside an UPDATE of po_lines. `price` is the unit price expression to multiply by (the new
 * price as a parameter, or the column). `fromStock` defaults to the row's own qty_from_stock; pass the parameter instead when the
 * same statement is changing it (a column in a SET expression reads the OLD value of the row). `ordered` likewise.
 */
export function toPurchaseTotalSql(opts: {
  price: string
  fromStock?: string
  ordered?: string
}): string {
  const ordered = opts.ordered ?? 'qty_ordered'
  const fromStock = opts.fromStock ?? 'COALESCE(qty_from_stock, 0)'
  return `GREATEST(${ordered} - ${fromStock}, 0) * ${opts.price}`
}
