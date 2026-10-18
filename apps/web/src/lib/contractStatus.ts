// The statuses a project contract can have: exactly what
// project_contracts.status accepts (migration 021 CHECK). The inline contract form
// in ProjectDetail once offered 'suspended' and 'terminated' instead of
// 'cancelled'; the database rejected both, so picking either failed on save
// (playbook entry 30). 'Terminated' is what 'cancelled' means here.
export const CONTRACT_STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const

export type ContractStatus = (typeof CONTRACT_STATUSES)[number]
