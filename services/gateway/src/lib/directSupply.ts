// Direct supply: a requisition whose purpose is 'direct_supply'. It is always tied to a project, always
// delivered straight to the jobsite, and it skips every pricing step. The Est. Unit Price typed when the
// requisition is created is the price the approver sees and, once approved, the price Items Bought judges
// each purchase against (approveRequisition freezes unit_price into approved_unit_price).
//
//   draft > pending_approval > items_bought > organizer_review (> review_approval) > sourcing > completed
//
// Not to be confused with the project TYPE of the same name (migration 291), a project created straight into
// Execution. A direct supply requisition can be raised for any project.

export const DIRECT_SUPPLY_PURPOSE = 'direct_supply'

// Nothing is kept in stock for a direct supply, so the goods never pass through a Store In.
export const DIRECT_SUPPLY_DESTINATION = 'jobsite'

export function isDirectSupply(purpose: string | null | undefined): boolean {
  return purpose === DIRECT_SUPPLY_PURPOSE
}

// The purpose a child purchase order is created with when Finish Buying forks it. purchase_orders.purpose only
// allows 'project', 'manufacturing' and 'stock' (migration 047), and everything that makes a jobsite delivery
// work (recordDirectDelivery, the receipt form, the project cost) asks for a PO whose purpose is 'project'. So the
// requisition keeps 'direct_supply' for its own screens and its purchase orders are plain project POs: storing
// 'direct_supply' on the PO would fail the CHECK at Finish Buying, after all the buying was done.
export function childPurchaseOrderPurpose(requisitionPurpose: string | null | undefined): string {
  if (isDirectSupply(requisitionPurpose)) return 'project'
  return requisitionPurpose ?? 'stock'
}

// What is wrong with a direct supply requisition that is about to be created, or null. A project is required, and
// every line names its currency: there is no pricing step to set it later, and a line quietly stored as IQD would
// make Items Bought skip the price check for a purchase made in any other currency (playbook #74).
export function directSupplyCreateProblem(input: {
  project_id?: string | null
  lines: { requested_currency_code?: string | null }[]
}): string | null {
  if (!input.project_id) return 'A direct supply requisition must be tied to a project'
  const missing = input.lines.findIndex((l) => !(l.requested_currency_code ?? '').trim())
  if (missing >= 0) return `Choose a currency for line ${missing + 1}`
  return null
}

// What is wrong with a direct supply requisition that is about to be submitted for approval, or null. The
// estimate is the only price anyone will see before the buying starts, so every line needs a quantity and a
// price above zero (a zero estimate would also make every purchase look over tolerance).
export function directSupplySubmitProblem(
  req: { purpose: string | null; project_id: string | null },
  lines: {
    description: string | null
    qty_ordered: string | number
    unit_price: string | number
  }[],
): string | null {
  if (!isDirectSupply(req.purpose))
    return 'Only a direct supply requisition is submitted for approval this way'
  if (!req.project_id) return 'A direct supply requisition must be tied to a project'
  if (lines.length === 0) return 'A requisition needs at least one line'
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const name = l.description ? ` (${l.description})` : ''
    if (!(Number(l.qty_ordered) > 0)) return `Line ${i + 1}${name} needs a quantity above zero`
    if (!(Number(l.unit_price) > 0))
      return `Line ${i + 1}${name} needs an estimated unit price above zero`
  }
  return null
}
