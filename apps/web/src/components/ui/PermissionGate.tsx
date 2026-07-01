import React from 'react'
import { usePermission } from '../../hooks/usePermission'
import type { AccessLevel } from '../../hooks/usePermission'

interface PermissionGateProps {
  permission?: string
  minLevel?: Exclude<AccessLevel, 'none'>
  anyOf?: string[]
  allOf?: string[]
  fallback?: React.ReactNode
  children: React.ReactNode
}

export function PermissionGate({
  permission = '',
  minLevel = 'view',
  anyOf,
  allOf,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { can, canAny, canAll } = usePermission()

  let allowed = false

  if (anyOf) {
    allowed = canAny(anyOf, minLevel)
  } else if (allOf) {
    allowed = canAll(allOf, minLevel)
  } else {
    allowed = can(permission, minLevel)
  }

  return allowed ? <>{children}</> : <>{fallback}</>
}
