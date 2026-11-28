// Finance sends a purchase order that failed its review back to the requisition's Organizer Review, and the PO keeps its number
// (migration 337, playbook #129). The PO is not undone: it stays where it is, locked in status `returned_to_organizer`, and when
// the review is approved again the organizer's changes are applied to this same PO. The rules that do not need the database
// live here so they are tested on their own.

/** The PO's status while its requisition's review is reopened for it. */
export const RETURNED_TO_ORGANIZER = 'returned_to_organizer'

/** The one sentence for every action the reopened review does not offer (stock changes, going back to the buyers, a new vendor). */
export function reopenedNotAvailable(what: string): string {
  return `${what} is not available while the review is reopened for a purchase order Finance sent back. Make the change as an administrator's edit request, or ask Finance to pass the purchase order as it is.`
}

const EPS = 0.00005

/**
 * After a reopened review is approved, does this PO line need a new goods receipt? Yes when the review raised its quantity or
 * added it, and what was received so far no longer covers the new quantity. A line that was already short before (accepted short)
 * and was not touched does not send the PO back to receiving.
 */
export function lineNeedsNewReceipt(input: {
  oldQty: number
  newQty: number
  received: number
  added: boolean
}): boolean {
  const raised = input.added || input.newQty - input.oldQty > EPS
  return raised && input.newQty - input.received > EPS
}

/**
 * Where the PO goes when the reopened review ends. A raised or added quantity needs a new receipt, so the PO goes back to
 * Goods received (where Record Receipt is available) and reaches Finance review again through Send to Finance Audit; anything
 * else returns straight to Finance review.
 */
export function returnTargetStatus(
  anyLineNeedsReceipt: boolean,
): 'goods_received' | 'finance_review' {
  return anyLineNeedsReceipt ? 'goods_received' : 'finance_review'
}

/** A purchase's change is applied to its PO line only when something that counts changed. */
export function purchaseChangesLine(
  line: { qty: number; price: number; currency: string },
  purchase: { qty: number; price: number; currency: string },
): boolean {
  return (
    Math.abs(line.qty - purchase.qty) > EPS ||
    Math.abs(line.price - purchase.price) > EPS ||
    line.currency !== purchase.currency
  )
}
