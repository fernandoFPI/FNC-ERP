import { useAuthStore } from '../store/authStore'

export type AccessLevel = 'none' | 'view' | 'edit' | 'approve' | 'admin'

const LEVEL_RANK: Record<AccessLevel, number> = {
  none: 0, view: 1, edit: 2, approve: 3, admin: 4,
}

export function usePermission() {
  const user = useAuthStore((s) => s.user)

  const isSystemLevel =
    user?.role === 'system_admin' || user?.role === 'company_admin'

  function can(
    permissionKey: string,
    minLevel: Exclude<AccessLevel, 'none'> = 'view',
  ): boolean {
    if (!user) return false
    if (isSystemLevel) return true
    const userLevel = (user.permissions?.[permissionKey] ?? 'none') as AccessLevel
    return LEVEL_RANK[userLevel] >= LEVEL_RANK[minLevel]
  }

  function canAny(
    keys: string[],
    minLevel: Exclude<AccessLevel, 'none'> = 'view',
  ): boolean {
    return keys.some((k) => can(k, minLevel))
  }

  function canAll(
    keys: string[],
    minLevel: Exclude<AccessLevel, 'none'> = 'view',
  ): boolean {
    return keys.every((k) => can(k, minLevel))
  }

  return { can, canAny, canAll, isSystemLevel }
}
