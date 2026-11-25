// The organizer review step (migration 329, playbook #115): after Items Bought and before any purchase order exists,
// the organizer double-checks what was bought. If he changes a purchase's quantity or price, or he recorded any of the
// purchases himself, a PO Admin must approve before the child purchase orders are created.
//
// The rules live here, as plain functions, so the mutations, the page's flags and the queue all use the same ones and one
// test file pins each (the queue is SQL, so it carries a copy of canApproveReview that its own test checks).

export const REVIEW_STATUSES = ['organizer_review', 'review_approval'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export function isReviewStatus(status: string | null | undefined): status is ReviewStatus {
  return status === 'organizer_review' || status === 'review_approval'
}

/** Who may edit, confirm, submit or send back: the requisition's organizer, or a procurement admin acting for him. */
export function canActOnReview(opts: {
  callerId: string
  callerIsAdmin: boolean
  organizerId: string | null
}): boolean {
  return opts.callerIsAdmin || (opts.organizerId !== null && opts.organizerId === opts.callerId)
}

/**
 * Who may approve or reject the changes: a PO Admin or a procurement admin. An organizer who is one of those may approve his
 * own review (the user's decision, 2026-11-25: the earlier rule that sent it to somebody else is gone); an organizer who is
 * neither still cannot, so the approval is never just the organizer's own say-so.
 */
export function canApproveReview(opts: {
  callerId: string
  callerIsAdmin: boolean
  callerIsPoAdmin: boolean
  organizerId: string | null
}): boolean {
  return opts.callerIsAdmin || opts.callerIsPoAdmin
}

export interface ReviewCounts {
  /** purchases whose quantity or price the organizer changed in this review */
  edited: number
  /** purchases the organizer recorded himself */
  organizerBought: number
  /** over-tolerance purchases nobody has signed off (an edit can bring one back) */
  unsignedTolerance: number
  /** lines the organizer added in this review (migration 330): they never went through the inventory check or the pricing steps */
  added: number
  /** lines the organizer removed in this review (migration 330) */
  removed: number
  /** lines the organizer took part of from stock instead of buying it in this review (migration 332) */
  stocked: number
}

/** A PO Admin is needed for any change (a purchase edited, an item added or removed), for the organizer's own purchases, and while a tolerance sign-off is missing. */
export function reviewNeedsApproval(c: ReviewCounts): boolean {
  return (
    c.edited > 0 ||
    c.organizerBought > 0 ||
    c.unsignedTolerance > 0 ||
    c.added > 0 ||
    c.removed > 0 ||
    c.stocked > 0
  )
}

/** Why the organizer is asked for a PO Admin, in words (null when he can confirm alone). */
export function reviewApprovalReason(c: ReviewCounts): string | null {
  const reasons: string[] = []
  if (c.edited > 0)
    reasons.push(`${c.edited} purchase${c.edited === 1 ? ' was' : 's were'} changed`)
  if (c.added > 0) reasons.push(`${c.added} item${c.added === 1 ? ' was' : 's were'} added`)
  if (c.removed > 0)
    reasons.push(`${c.removed} item${c.removed === 1 ? ' was' : 's were'} removed`)
  if (c.stocked > 0)
    reasons.push(`${c.stocked} item${c.stocked === 1 ? ' was' : 's were'} taken from stock`)
  if (c.organizerBought > 0)
    reasons.push(
      `the organizer recorded ${c.organizerBought === 1 ? 'a purchase' : `${c.organizerBought} purchases`} himself`,
    )
  if (c.unsignedTolerance > 0)
    reasons.push(
      `${c.unsignedTolerance} over-tolerance purchase${c.unsignedTolerance === 1 ? ' needs' : 's need'} a sign-off`,
    )
  return reasons.length === 0 ? null : reasons.join('; ')
}

/**
 * The values to keep as "was" after an edit. The first edit remembers what the purchase held when the review began; an edit
 * back to those values leaves the purchase unchanged (both null), so it does not count as a change.
 */
export function nextReviewOriginals(opts: {
  current: { qty: number; price: number; currency?: string }
  originals: { qty: number | null; price: number | null; currency?: string | null }
  next: { qty: number; price: number; currency?: string }
}): { qty: number | null; price: number | null; currency: string | null } {
  const baseQty = opts.originals.qty ?? opts.current.qty
  const basePrice = opts.originals.price ?? opts.current.price
  // A purchase's currency is changed only when the edit names one; no currency on either side means "not touched".
  const baseCurrency = opts.originals.currency ?? opts.current.currency ?? null
  const nextCurrency = opts.next.currency ?? opts.current.currency ?? null
  const same = (a: number, b: number) => Math.abs(a - b) < 0.00005
  if (same(opts.next.qty, baseQty) && same(opts.next.price, basePrice) && nextCurrency === baseCurrency)
    return { qty: null, price: null, currency: null }
  return { qty: baseQty, price: basePrice, currency: baseCurrency }
}

/** One line of the approval-log note for an edit, e.g. `Pipe: qty 5 → 4, price 10 → 11 USD`, or `currency USD → IQD`. */
export function describeReviewEdit(opts: {
  description: string
  currency: string
  before: { qty: number; price: number; currency?: string }
  after: { qty: number; price: number; currency?: string }
}): string {
  const parts: string[] = []
  if (opts.before.qty !== opts.after.qty) parts.push(`qty ${opts.before.qty} → ${opts.after.qty}`)
  const currencyChanged =
    opts.before.currency !== undefined &&
    opts.after.currency !== undefined &&
    opts.before.currency !== opts.after.currency
  if (opts.before.price !== opts.after.price)
    parts.push(
      `price ${opts.before.price}${currencyChanged ? ` ${opts.before.currency}` : ''} → ${opts.after.price} ${opts.after.currency ?? opts.currency}`,
    )
  if (currencyChanged && opts.before.price === opts.after.price)
    parts.push(`currency ${opts.before.currency} → ${opts.after.currency}`)
  return `${opts.description || 'Item'}: ${parts.join(', ')}`
}

/**
 * What the fork does with a line's quantity when the organizer changed what was bought (playbook #116). The line's ORDERED
 * quantity follows the purchases: bought more than ordered raises it to what was bought plus what stock covers; bought less
 * leaves the shortfall as an accepted short (the same thing "marked short" means at Items Bought). Both are changes a PO Admin
 * approved, so nothing is refused for being over or under the order.
 */
export function settleLineQuantity(opts: { ordered: number; fromStock: number; bought: number }): {
  ordered: number
  short: boolean
} {
  const covered = opts.bought + opts.fromStock
  const eps = 0.0001
  if (covered > opts.ordered + eps) return { ordered: covered, short: false }
  return { ordered: opts.ordered, short: covered < opts.ordered - eps }
}

// ── The store keeper's sign-off on items taken from stock (migration 335, playbook #123) ─────────────────────────────────
// While a requisition waits in Re-approval, a line the organizer took from stock needs the store keeper's approval before the
// PO Admin / administrator may approve. The store keeper cannot send the review back: a "no" is a reason the administrator
// reads, and the administrator, who has the final say, sends it back to the organizer.

export type StockReviewStatus = 'pending' | 'approved' | 'rejected'

/** The store keeper has something to sign off when the review took any item from stock. */
export function reviewNeedsStoreKeeper(c: ReviewCounts): boolean {
  return c.stocked > 0
}

/** The stored value (NULL until decided, and again after every new submission) as the status the page and the gate read. */
export function stockReviewStatus(stored: string | null | undefined): StockReviewStatus {
  return stored === 'approved' || stored === 'rejected' ? stored : 'pending'
}

/** Why the administrator may not approve yet, in words; null when nothing stands in the way. */
export function stockGateReason(opts: {
  needed: boolean
  status: StockReviewStatus
  reason?: string | null | undefined
}): string | null {
  if (!opts.needed || opts.status === 'approved') return null
  if (opts.status === 'rejected')
    return `The store keeper rejected the items taken from stock${opts.reason ? `: ${opts.reason}` : ''}. Send it back to the organizer`
  return 'The store keeper has to approve the items taken from stock first'
}
