// Billing methods, and the two different lists that are allowed where.
//
// INVOICES can only be raised as one of four methods: project_invoices.
// billing_method accepts only these (migration 021 CHECK) and the invoicing
// engine (packages/billing) can only build lines for these four.
export const INVOICE_BILLING_METHODS = [
  'fixed_lump_sum',
  'milestone',
  'cost_plus',
  'progress',
] as const

// CONTRACTS may also be tagged with the commercial types remeasure, unit_rate
// and hybrid (migration 306). That is a label on the contract only: nothing reads
// project_contracts.default_billing_method to drive billing, and every invoice
// is still raised as one of the four invoice methods above.
export const CONTRACT_BILLING_METHODS = [
  ...INVOICE_BILLING_METHODS,
  'remeasure',
  'unit_rate',
  'hybrid',
] as const

type InvoiceBillingMethod = (typeof INVOICE_BILLING_METHODS)[number]
type ContractBillingMethod = (typeof CONTRACT_BILLING_METHODS)[number]

// Older UI spellings (the invoice builder still says fixed / time_material /
// percentage) mapped onto the stored values.
const INVOICE_ALIASES: Record<string, InvoiceBillingMethod> = {
  fixed: 'fixed_lump_sum',
  fixed_lump_sum: 'fixed_lump_sum',
  milestone: 'milestone',
  time_material: 'cost_plus',
  cost_plus: 'cost_plus',
  percentage: 'progress',
  progress: 'progress',
}

const CONTRACT_ALIASES: Record<string, ContractBillingMethod> = {
  ...INVOICE_ALIASES,
  remeasure: 'remeasure',
  unit_rate: 'unit_rate',
  hybrid: 'hybrid',
}

function resolveFrom<T extends string>(
  aliases: Record<string, T>,
  allowed: readonly string[],
  value: unknown,
): T {
  const method = typeof value === 'string' ? aliases[value] : undefined
  if (!method) {
    throw new Error(`Unknown billing method "${String(value)}". Allowed: ${allowed.join(', ')}.`)
  }
  return method
}

// Both reject anything they don't recognise instead of quietly storing
// 'fixed_lump_sum'. The resolvers used to fall back to fixed_lump_sum for an
// unknown value, so a form offering a value the system can't store saved without
// error and the field simply never changed (playbook entry 30).
export function resolveContractBillingMethod(value: unknown): ContractBillingMethod {
  return resolveFrom(CONTRACT_ALIASES, CONTRACT_BILLING_METHODS, value)
}

export function resolveInvoiceBillingMethod(value: unknown): InvoiceBillingMethod {
  return resolveFrom(INVOICE_ALIASES, INVOICE_BILLING_METHODS, value)
}
