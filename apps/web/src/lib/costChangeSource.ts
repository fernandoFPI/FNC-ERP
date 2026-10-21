// Where a parked product cost change (product_cost_change_requests) came from.
// The vocabulary is product_cost_change_requests.source_type, written by
// recordProductCostChange in the gateway (one call site per value): the Cost Change
// Approvals page reads it to say what triggered a request, what rejecting it
// leaves alone, and where to go to see the original.

export const COST_CHANGE_SOURCE_TYPES = [
  'po_receipt',
  'po_market_pricing',
  'requisition_market_pricing',
  'catalog_link',
  'stock_adjustment',
  'cost_correction',
  'manual_edit',
] as const

export type CostChangeSourceType = (typeof COST_CHANGE_SOURCE_TYPES)[number]

export function isCostChangeSourceType(value: string): value is CostChangeSourceType {
  return (COST_CHANGE_SOURCE_TYPES as readonly string[]).includes(value)
}

// What source_id points at, as a web route. Receipts, catalog links and PO market
// pricing carry a purchase order id, requisition market pricing a requisition id;
// stock adjustments and manual edits carry none.
export function costChangeSourcePath(
  sourceType: string,
  sourceId: string | null | undefined,
): string | null {
  if (!sourceId) return null
  switch (sourceType) {
    case 'po_receipt':
    case 'catalog_link':
    case 'po_market_pricing':
      return `/procurement/purchase-orders/${sourceId}`
    case 'requisition_market_pricing':
      return `/procurement/requisitions/${sourceId}`
    default:
      return null
  }
}
