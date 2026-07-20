// Project workspace capability matrix — the role × module × level defaults from
// the Capability Matrix reference. Consumed by useProjectCapability().
//
// Levels: none < view < edit < approve. Project roles come from a member's
// member_type (technical/commercial/both) plus the derived pm/admin/none.
// Company-wide grants (permission registry: projects.<module>.<action>) and
// per-member overrides layer on top — see useProjectCapability.

export type CapLevel = 'none' | 'view' | 'edit' | 'approve'
export const CAP_RANK: Record<CapLevel, number> = { none: 0, view: 1, edit: 2, approve: 3 }

// Canonical project modules (distinct from tab keys, which are historically named).
export const PROJECT_MODULES = [
  'overview', 'client_documents', 'engineering', 'planning', 'bidding', 'contracts',
  'execution', 'handover', 'procurement', 'cost_control', 'variations', 'risk', 'meetings', 'team', 'attachments',
] as const
export type ProjectModule = typeof PROJECT_MODULES[number]

// Tab keys (as used in ALL_TABS / member overrides) → canonical module keys.
// Note the historical mismatch: rfq_lines tab = engineering docs; engineering tab = planning.
export const TAB_TO_MODULE: Record<string, ProjectModule> = {
  overview: 'overview',
  client_documents: 'client_documents',
  rfq_lines: 'engineering',        // "Preliminary Engineering" tab = doc control
  bidding: 'bidding',
  contracts: 'contracts',
  engineering: 'planning',         // "Planning & Detailed Engineering" tab = schedule
  execution: 'execution',
  handover: 'handover',
  procurement: 'procurement',
  cost_control: 'cost_control',
  variation_orders: 'variations',
  risk_register: 'risk',
  meetings: 'meetings',
  team: 'team',
  attachments: 'attachments',
}

type RoleMap = Partial<Record<ProjectModule, CapLevel>>

// Project Manager — runs the project; approves at the gates.
const PM_MAP: RoleMap = {
  overview: 'edit', client_documents: 'edit', engineering: 'approve', planning: 'edit',
  bidding: 'approve', contracts: 'approve', execution: 'edit', handover: 'approve',
  procurement: 'edit', cost_control: 'approve', variations: 'approve', risk: 'edit',
  meetings: 'edit', team: 'edit', attachments: 'edit',
}
// Engineering / technical — owns design & site quality; reads commercial.
const TECH_MAP: RoleMap = {
  overview: 'view', client_documents: 'edit', engineering: 'edit', planning: 'view',
  bidding: 'view', contracts: 'none', execution: 'edit', handover: 'edit',
  procurement: 'none', cost_control: 'none', variations: 'view', risk: 'edit',
  meetings: 'edit', team: 'none', attachments: 'edit',
}
// Commercial — owns bidding, cost, contracts, variations; reads technical.
const COMM_MAP: RoleMap = {
  overview: 'view', client_documents: 'view', engineering: 'view', planning: 'view',
  bidding: 'edit', contracts: 'edit', execution: 'none', handover: 'none',
  procurement: 'view', cost_control: 'edit', variations: 'edit', risk: 'view',
  meetings: 'edit', team: 'none', attachments: 'edit',
}

const mergeMax = (a: RoleMap, b: RoleMap): RoleMap => {
  const out: RoleMap = {}
  for (const m of PROJECT_MODULES) {
    const av = a[m] ?? 'none'
    const bv = b[m] ?? 'none'
    out[m] = CAP_RANK[av] >= CAP_RANK[bv] ? av : bv
  }
  return out
}

// Role → module → default level. admin bypasses (handled in the hook); none = no access.
export const PROJECT_ROLE_MATRIX: Record<string, RoleMap> = {
  pm: PM_MAP,
  technical: TECH_MAP,
  commercial: COMM_MAP,
  both: mergeMax(TECH_MAP, COMM_MAP),
  none: {},
}
