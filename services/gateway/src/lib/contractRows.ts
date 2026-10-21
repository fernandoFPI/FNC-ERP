// How a project_milestones / project_invoices row is returned inside a ProjectContract.
// One copy, used by both the single-contract query (projectContract) and the list
// query (projectContracts): the list used to return `milestones: []` and
// `invoices: []` without ever reading the tables, so the project's Contract
// Management tab never showed a milestone or an invoice (playbook entry 34). Two
// hand-written mappings is how that kind of gap gets in, so there is one.
//
// pg returns NUMERIC as a string, so every amount (and project_milestones.sequence,
// NUMERIC since migration 307) is parsed here.

export function mapContractMilestone(m: Record<string, unknown>) {
  return {
    id: m.id,
    name: m.name,
    sequence: parseFloat(String(m.sequence)),
    billableAmount: parseFloat(String(m.billable_amount)),
    currencyCode: String(m.currency_code).trim(),
    status: m.status,
    reachedAt: m.reached_at ?? null,
  }
}

export function mapContractInvoice(i: Record<string, unknown>) {
  return {
    id: i.id,
    invoiceNumber: i.invoice_number,
    billingMethod: i.billing_method,
    displayMode: i.display_mode,
    grossTotal: parseFloat(String(i.gross_total)),
    retentionAmount: parseFloat(String(i.retention_amount)),
    netPayable: parseFloat(String(i.net_payable)),
    status: i.status,
    invoiceDate: i.invoice_date,
    dueDate: i.due_date,
    lines: [],
    payments: [],
  }
}

// Groups rows by their contract_id, keeping the order the query returned them in.
export function groupByContract(
  rows: Record<string, unknown>[],
): Map<string, Record<string, unknown>[]> {
  const out = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const key = String(row.contract_id)
    const list = out.get(key)
    if (list) list.push(row)
    else out.set(key, [row])
  }
  return out
}
