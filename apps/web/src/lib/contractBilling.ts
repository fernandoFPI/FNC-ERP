import i18n from '../i18n'

// The billing methods a project contract can have, and the only place the web
// app lists them. These are exactly the four values
// project_contracts.default_billing_method accepts (migration 021 CHECK) and
// the only four the invoicing engine (packages/billing) can bill. Both contract
// forms (the standalone ContractForm and the inline form in ProjectDetail's
// Contract Management tab) must offer this list and nothing else: the inline
// form once carried its own list (lump_sum, remeasure, unit_rate,
// milestone_based, hybrid), and the gateway's updateProjectContract silently
// saves any value it doesn't recognise as fixed_lump_sum, so picking one of
// those looked like "billing method isn't changing".
export const CONTRACT_BILLING_METHODS: { value: string; label: string }[] = [
  {
    value: 'fixed_lump_sum',
    get label() {
      return i18n.t('proj.contractForm.fixedLumpSum', { defaultValue: 'Fixed Lump Sum' })
    },
  },
  {
    value: 'milestone',
    get label() {
      return i18n.t('proj.contractForm.milestone', { defaultValue: 'Milestone' })
    },
  },
  {
    value: 'cost_plus',
    get label() {
      return i18n.t('proj.contractForm.costPlusTimeMaterial', {
        defaultValue: 'Cost Plus (Time & Material)',
      })
    },
  },
  {
    value: 'progress',
    get label() {
      return i18n.t('proj.contractForm.progressPercentage', {
        defaultValue: 'Progress (Percentage)',
      })
    },
  },
]

export const DEFAULT_CONTRACT_BILLING_METHOD = 'fixed_lump_sum'
