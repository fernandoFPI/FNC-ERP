// Project lifecycle phase keys the gateway accepts. The phases themselves are company
// config (`lifecycle_phases`, migrations 166 / 175 / 319); these keys are the fixed
// vocabulary behind them, used by the admin override. A test reads every key found in
// `lifecycle_phases` and fails if one is missing here, so a phase added by a future
// migration cannot be silently refused by `adminSetPhase` (it was, for 'financing',
// the moment it existed only in the migration).
export const PROJECT_LIFECYCLE_PHASE_KEYS = [
  'enquiry',
  'scope_review',
  'bidding',
  'client_approval',
  'execution',
  'financing',
  'closeout',
] as const

export type ProjectLifecyclePhaseKey = (typeof PROJECT_LIFECYCLE_PHASE_KEYS)[number]

export function isProjectLifecyclePhaseKey(v: string): v is ProjectLifecyclePhaseKey {
  return (PROJECT_LIFECYCLE_PHASE_KEYS as readonly string[]).includes(v)
}
