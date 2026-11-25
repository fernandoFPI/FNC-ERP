// Organizer review, "use stock instead" (playbook #120): the pure rules, so a test can pin each one.

export interface PurchaseToReduce {
  id: string
  qty: number
}

export interface ReductionStep {
  id: string
  /** The purchase's quantity before, and after: null when nothing is left of it (the purchase is removed). */
  before: number
  after: number | null
}

const EPS = 0.00005

/**
 * Takes `reduceBy` units off the purchases, the one listed FIRST first (the caller lists the newest first), and removes a purchase
 * that nothing is left of. Never takes more than the purchases hold. The sum of what it takes off is `min(reduceBy, total bought)`.
 */
export function planPurchaseReduction(
  purchases: PurchaseToReduce[],
  reduceBy: number,
): ReductionStep[] {
  const steps: ReductionStep[] = []
  let left = reduceBy
  for (const p of purchases) {
    if (!(left > EPS)) break
    const take = Math.min(p.qty, left)
    const after = p.qty - take
    steps.push({ id: p.id, before: p.qty, after: after < EPS ? null : after })
    left -= take
  }
  return steps
}

/**
 * How the quantity the organizer wants from stock splits: first the part that was never bought (the shortfall), which needs no
 * purchase to change, then the rest comes off the purchases. Taking everything left to cover (`all`) removes every purchase.
 */
export function splitStockQuantity(opts: { toCover: number; bought: number; take: number }): {
  all: boolean
  take: number
  shortfall: number
  reduceBy: number
} {
  const all = opts.take >= opts.toCover - 0.0001
  const take = all ? opts.toCover : opts.take
  const shortfall = Math.max(opts.toCover - opts.bought, 0)
  return { all, take, shortfall, reduceBy: all ? opts.bought : Math.max(take - shortfall, 0) }
}

export interface UndoCheckInput {
  /** What the line covers from stock now, and what it covered right after the operation being undone. */
  lineFromStockNow: number
  lineFromStockAfter: number
  /** Purchases the operation reduced: the quantity each holds now (null when it is gone) against the one it was left with. */
  reduced: { id: string; now: number | null; after: number }[]
}

/**
 * Undo reverses the LAST operation only if nothing touched the line since: otherwise putting the old rows back would overwrite
 * what the organizer did afterwards. Returns the reason it cannot be undone, or null.
 */
export function undoBlockedReason(i: UndoCheckInput): string | null {
  if (Math.abs(i.lineFromStockNow - i.lineFromStockAfter) > 0.0001)
    return 'the quantity covered from stock was changed after it was used'
  for (const r of i.reduced)
    if (r.now === null || Math.abs(r.now - r.after) > 0.0001)
      return 'a purchase on the line was changed after the stock was used'
  return null
}
