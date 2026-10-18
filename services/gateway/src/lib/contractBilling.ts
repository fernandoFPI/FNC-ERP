// The billing methods a project contract / invoice can have. project_contracts.
// default_billing_method and project_invoices.billing_method only accept these
// four values (migration 021 CHECK), and the invoicing engine (packages/billing)
// can only bill these four.
export const BILLING_METHODS = ['fixed_lump_sum', 'milestone', 'cost_plus', 'progress'] as const

// Older UI spellings (the invoice builder still says fixed / time_material /
// percentage) mapped onto the four stored values.
const BILLING_METHOD_ALIASES: Record<string, (typeof BILLING_METHODS)[number]> = {
  fixed: 'fixed_lump_sum',
  fixed_lump_sum: 'fixed_lump_sum',
  milestone: 'milestone',
  time_material: 'cost_plus',
  cost_plus: 'cost_plus',
  percentage: 'progress',
  progress: 'progress',
}

// Rejects anything it doesn't recognise instead of quietly storing
// 'fixed_lump_sum'. The resolvers used to fall back to fixed_lump_sum for an
// unknown value, so a form offering a value the system can't store saved
// without error and the field simply never changed (playbook entry 30).
export function resolveBillingMethod(value: unknown): (typeof BILLING_METHODS)[number] {
  const method = typeof value === 'string' ? BILLING_METHOD_ALIASES[value] : undefined
  if (!method) {
    throw new Error(
      `Unknown billing method "${String(value)}". Allowed: ${BILLING_METHODS.join(', ')}.`,
    )
  }
  return method
}
