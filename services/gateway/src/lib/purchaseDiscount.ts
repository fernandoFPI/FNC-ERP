// Price after discount on a purchase (migration 336, playbook #124).
//
// A purchase (`po_line_purchases`) keeps the unit price the vendor quoted (`actual_unit_price`) and, when the vendor gave a
// discount, the unit price AFTER it (`discounted_unit_price`). When the second is filled it is the price that counts everywhere:
// the purchase total, the child purchase order the fork makes, the tolerance check and the review's totals. The quoted price
// then stays on the purchase as information only. Both are per unit, in the purchase's own currency, and nothing is converted.
//
// ONE rule here, one SQL fragment, so the readers cannot drift (a total computed from the quoted price on one screen and from
// the discounted one on another is the bug this exists to prevent).

type NumberLike = number | string | null | undefined

function toNumber(value: NumberLike): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : null
}

/** SQL for the price that counts on a purchase row aliased `alias` (default `plp`). */
export function effectivePriceSql(alias = 'plp'): string {
  return `COALESCE(${alias}.discounted_unit_price, ${alias}.actual_unit_price)`
}

/** The price that counts: the one after the discount when there is one, otherwise the quoted price. */
export function effectiveUnitPrice(list: NumberLike, discounted: NumberLike): number {
  const d = toNumber(discounted)
  if (d !== null) return d
  return toNumber(list) ?? 0
}

/**
 * What is wrong with a price after discount, in a sentence for the buyer, or null when it is fine (or absent). A discount can only
 * lower the price: it must be above zero and not higher than the quoted price.
 */
export function discountedPriceProblem(list: NumberLike, discounted: NumberLike): string | null {
  const d = toNumber(discounted)
  if (d === null) return null
  const l = toNumber(list)
  if (!(d > 0)) return 'The price after discount must be greater than 0'
  if (l !== null && d > l + 0.00005)
    return 'The price after discount cannot be higher than the price the vendor quoted'
  return null
}
