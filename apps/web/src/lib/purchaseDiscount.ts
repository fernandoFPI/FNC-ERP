// Price after discount on a purchase (migration 336, playbook #124). The server decides and stores it
// (`services/gateway/src/lib/purchaseDiscount.ts`); this file is the page's mirror, so every screen that shows a purchase's
// price, total or "was" reads it the same way. When `discounted_unit_price` is filled it is the price that counts; the quoted
// `actual_unit_price` is information only. Both are per unit, in the purchase's own currency.

type NumberLike = number | string | null | undefined

function toNumber(value: NumberLike): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : null
}

export interface PurchasePrices {
  actual_unit_price: NumberLike
  discounted_unit_price?: NumberLike
}

/** The price that counts for a purchase: the one after the discount when there is one, otherwise the quoted price. */
export function purchaseUnitPrice(p: PurchasePrices): number {
  return toNumber(p.discounted_unit_price) ?? toNumber(p.actual_unit_price) ?? 0
}

/** True when the buyer recorded a price after a discount on this purchase. */
export function hasDiscount(p: PurchasePrices): boolean {
  return toNumber(p.discounted_unit_price) !== null
}

/**
 * What is wrong with a typed price after discount, as a key (never a sentence: the page translates it), or null when it is fine.
 * An empty box means no discount. A discount can only lower the price: above zero and not higher than the quoted price.
 */
export function discountProblem(quoted: NumberLike, typed: string): 'zero' | 'high' | null {
  if (typed.trim() === '') return null
  const d = parseFloat(typed)
  if (!(d > 0)) return 'zero'
  const q = toNumber(quoted)
  if (q !== null && d > q + 0.00005) return 'high'
  return null
}

/** The saving per unit as a percentage of the quoted price, for display only (never stored). 0 when there is none. */
export function discountPercent(quoted: NumberLike, discounted: NumberLike): number {
  const q = toNumber(quoted)
  const d = toNumber(discounted)
  if (q === null || d === null || !(q > 0) || d >= q) return 0
  return ((q - d) / q) * 100
}
