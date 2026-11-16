// The kinds of cost a project's ledger holds, named once for every screen that shows them (the cost ledger list and the cost
// summary cards on a project's analytic account page, playbook #95).
//
// `source_type` of a ledger row says where the cost came from: the four ways cost reaches the ledger without a journal (a
// jobsite delivery, a Store Out, a return of stock, a vendor return), then the journal sources. A kind nobody has named shows
// its own words, never a blank and never a raw translation key.

export const COST_SOURCE_KEYS: Record<string, string> = {
  po_direct_delivery: 'fin.analyticDetail.costSourceDelivery',
  stock_issue: 'fin.analyticDetail.costSourceStockIssue',
  material_return: 'fin.analyticDetail.costSourceMaterialReturn',
  po_vendor_return: 'fin.analyticDetail.costSourceVendorReturn',
  mo_completion: 'fin.analyticDetail.moCompletion',
  po_completion: 'fin.analyticDetail.poCompletion',
  interco_transaction: 'fin.analyticDetail.intercoTransaction',
  manual: 'fin.analyticDetail.manual',
  combined: 'fin.analyticDetail.costSourceCombined',
}

// the order the summary lists the kinds in: what physically reached the project first, journals after
const KIND_ORDER = ['po_direct_delivery', 'stock_issue', 'material_return', 'po_vendor_return']

function rank(sourceType: string | null): number {
  if (sourceType === null) return KIND_ORDER.length + 2
  const i = KIND_ORDER.indexOf(sourceType)
  return i === -1 ? KIND_ORDER.length : i
}

/** The kinds in a fixed order: known physical kinds first, other kinds by name, a cost with no source last. */
export function orderCostKinds<T extends { sourceType: string | null }>(kinds: readonly T[]): T[] {
  return [...kinds].sort((a, b) => {
    const byRank = rank(a.sourceType) - rank(b.sourceType)
    if (byRank !== 0) return byRank
    return (a.sourceType ?? '').localeCompare(b.sourceType ?? '')
  })
}
