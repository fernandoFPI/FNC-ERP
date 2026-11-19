// The arithmetic and the rules of the Record Goods Receipt form, kept apart from the page so each can be tested on its own
// and so the checklist, the refusal on submit and the action bar all read ONE list (playbook #24 / #97b: a gate and the
// list that mirrors it must not be two copies).

export interface ReceiptLine {
  po_line_id: string
  description: string
  sku: string | null
  ordered_qty: number
  qty_received_so_far: number
  qty_from_stock: number
  qty_to_receive: string
  po_unit_price: number
  // Lines start unselected: the store keeper actively picks which items they are physically receiving.
  selected: boolean
}

/** What is still left to receive on a line: ordered, less what arrived before, less what stock already covers. */
export function remainingQty(line: ReceiptLine): number {
  return Math.max(0, line.ordered_qty - line.qty_received_so_far - line.qty_from_stock)
}

/** A line with nothing left to receive (it arrived in full, or stock covers it). */
export function isLineComplete(line: ReceiptLine): boolean {
  return remainingQty(line) <= 0
}

/**
 * What the quantity box keeps when the person types: anything that is not a number is kept as typed (so the box can be
 * emptied and refilled), a number above what is left is cut to what is left. Nobody can over-receive by a typo.
 */
export function clampReceiveQty(raw: string, max: number): string {
  if (raw === '') return raw
  const n = parseFloat(raw)
  if (Number.isNaN(n)) return raw
  return n > max ? String(max) : raw
}

/** A line that will be received: ticked, with a quantity above zero. */
export function isLineReceiving(line: ReceiptLine): boolean {
  return line.selected && parseFloat(line.qty_to_receive) > 0
}

/** Ticking a line again after its box was emptied or zeroed starts it at everything that is left. */
export function selectLine(line: ReceiptLine, checked: boolean): ReceiptLine {
  const qty =
    checked && !(parseFloat(line.qty_to_receive || '0') > 0)
      ? String(remainingQty(line))
      : line.qty_to_receive
  return { ...line, selected: checked, qty_to_receive: qty }
}

/** "Select all": every line with something left, keeping a quantity the person already typed. */
export function selectAllLines(lines: ReceiptLine[]): ReceiptLine[] {
  return lines.map((l) =>
    remainingQty(l) > 0
      ? {
          ...l,
          selected: true,
          qty_to_receive: parseFloat(l.qty_to_receive || '0') > 0 ? l.qty_to_receive : String(remainingQty(l)),
        }
      : l,
  )
}

export function clearLines(lines: ReceiptLine[]): ReceiptLine[] {
  return lines.map((l) => ({ ...l, selected: false }))
}

export interface ReceiptTotals {
  itemCount: number
  selectedCount: number
  orderedQtyTotal: number
  /** Arrived before, plus what stock already covers. */
  alreadyCoveredQty: number
  receivingNowQty: number
  remainingAfterQty: number
  progressPct: number
}

export function receiptTotals(lines: ReceiptLine[]): ReceiptTotals {
  const orderedQtyTotal = lines.reduce((s, l) => s + l.ordered_qty, 0)
  const alreadyCoveredQty = lines.reduce((s, l) => s + l.qty_received_so_far + l.qty_from_stock, 0)
  const receivingNowQty = lines.reduce(
    (s, l) => s + (l.selected ? parseFloat(l.qty_to_receive || '0') || 0 : 0),
    0,
  )
  return {
    itemCount: lines.length,
    selectedCount: lines.filter((l) => l.selected).length,
    orderedQtyTotal,
    alreadyCoveredQty,
    receivingNowQty,
    remainingAfterQty: Math.max(0, orderedQtyTotal - alreadyCoveredQty - receivingNowQty),
    progressPct:
      orderedQtyTotal > 0
        ? Math.min(100, Math.round(((alreadyCoveredQty + receivingNowQty) / orderedQtyTotal) * 100))
        : 0,
  }
}

export type ReceiptRequirementId = 'receiver' | 'items' | 'destination' | 'vendorReceipt' | 'materials'

export interface ReceiptRequirement {
  id: ReceiptRequirementId
  done: boolean
}

interface RequirementInput {
  /** A project PO delivered straight to the jobsite: no Store In, proof of delivery is attached here instead. */
  isJobsite: boolean
  receiverName: string
  lines: ReceiptLine[]
  /** The buyer's receipt on file, or one added on this page. */
  hasVendorReceipt: boolean
  hasMaterialsPhoto: boolean
  /** A system administrator ticked the override and gave a reason: the photos are declared skipped. */
  photosBypassed: boolean
  /** The receiving location is a TEMPORARY store: the goods are going somewhere else, so a final destination is needed. */
  needsDestination?: boolean
  hasDestination?: boolean
}

/**
 * What the form still needs before it can be saved, in the order the refusal reports it. The page draws this list in its
 * checklist and in the action bar, and `handleSubmit` refuses on the first open item, so they cannot drift:
 *  - Store In: who received the goods, then at least one item;
 *  - jobsite delivery: at least one item, then the vendor receipt, then a photo of the materials (each counts as done
 *    when a system administrator has declared the override).
 */
export function receiptRequirements(input: RequirementInput): ReceiptRequirement[] {
  const items: ReceiptRequirement = { id: 'items', done: input.lines.some(isLineReceiving) }
  if (!input.isJobsite) {
    return [
      { id: 'receiver', done: input.receiverName.trim() !== '' },
      items,
      ...(input.needsDestination ? [{ id: 'destination' as const, done: input.hasDestination === true }] : []),
    ]
  }
  return [
    items,
    { id: 'vendorReceipt', done: input.hasVendorReceipt || input.photosBypassed },
    { id: 'materials', done: input.hasMaterialsPhoto || input.photosBypassed },
  ]
}
