// useProjectCapability — the single resolver for "what can this user do in this
// project module". Unifies the four inputs that used to be scattered across
// ProjectDetail (role default, per-member override, company-wide grant, phase gate)
// into one place. Consume via `cap.can('bidding', 'edit')` / `cap.level('bidding')`.
//
// Resolution order (highest wins), then phase-gated:
//   1. admin (system/company/projects.admin) → approve everywhere
//   2. per-member override for the module (edit/view/none/approve) → authoritative
//   3. max( company-wide registry grant , project-role default )
//   4. phase gate: if the module isn't available in the current phase → none
//
// Wiring the UI to this hook is Phase 3 (Adaptive UI); this is the foundation.

import { usePermission } from './usePermission'
import {
  CAP_RANK, PROJECT_ROLE_MATRIX, type CapLevel, type ProjectModule,
} from '../lib/projectCapabilityMatrix'

export type { CapLevel, ProjectModule }
export type ProjectRoleKey = 'admin' | 'pm' | 'technical' | 'commercial' | 'both' | 'none'

type GlobalCan = (key: string, min: 'view' | 'edit' | 'approve' | 'admin') => boolean

export interface ProjectCapabilityCtx {
  /** system_admin / company_admin, or a project-admin grant */
  isAdmin: boolean
  /** derived project role (pm / technical / commercial / both / none) */
  projectRole: ProjectRoleKey
  /** per-member overrides, keyed by canonical module → 'none'|'view'|'edit'|'approve' */
  overrides: Record<string, string>
  /** optional phase gate: return false to hide a module in the current phase */
  isModuleInPhase?: (module: ProjectModule) => boolean
}

const asLevel = (s: string | undefined): CapLevel | null =>
  s === 'none' || s === 'view' || s === 'edit' || s === 'approve' ? s : null

/**
 * Pure resolver — safe to call anywhere (incl. after an early return), unlike a
 * hook. Pass the caller's `globalCan` (from usePermission) and `isSystemLevel`.
 */
export function resolveProjectCapability(
  ctx: ProjectCapabilityCtx & { globalCan: GlobalCan; isSystemLevel: boolean },
) {
  // Company-wide grant from the permission registry (projects.<module>.<action>).
  const registryLevel = (module: string): CapLevel => {
    const base = `projects.${module}`
    if (ctx.globalCan(`${base}.approve`, 'approve')) return 'approve'
    if (ctx.globalCan(`${base}.edit`, 'edit')) return 'edit'
    if (ctx.globalCan(`${base}.view`, 'view')) return 'view'
    return 'none'
  }

  const rawLevel = (module: ProjectModule): CapLevel => {
    if (ctx.isAdmin || ctx.isSystemLevel) return 'approve'
    const override = asLevel(ctx.overrides[module])
    if (override) return override
    const roleLevel = PROJECT_ROLE_MATRIX[ctx.projectRole]?.[module] ?? 'none'
    const grantLevel = registryLevel(module)
    return CAP_RANK[grantLevel] >= CAP_RANK[roleLevel] ? grantLevel : roleLevel
  }

  const level = (module: ProjectModule): CapLevel => {
    if (ctx.isModuleInPhase && !ctx.isModuleInPhase(module)) return 'none'
    return rawLevel(module)
  }
  const can = (module: ProjectModule, min: CapLevel = 'view'): boolean =>
    CAP_RANK[level(module)] >= CAP_RANK[min]

  return { level, can }
}

/** Hook wrapper for consumers that can call it at the top of a component. */
export function useProjectCapability(ctx: ProjectCapabilityCtx) {
  const { can: globalCan, isSystemLevel } = usePermission()
  return resolveProjectCapability({ ...ctx, globalCan, isSystemLevel })
}
