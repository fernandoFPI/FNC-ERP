import { lazy, Suspense } from 'react'
import { usePermission } from '../hooks/usePermission'
import { Spinner } from '../components/ui/Spinner'

const ForbiddenPage = lazy(() => import('../pages/errors/ForbiddenPage'))

interface PermissionRouteProps {
  permKey: string
  minLevel?: 'view' | 'edit' | 'approve' | 'admin'
  children: React.ReactNode
}

export function PermissionRoute({
  permKey,
  minLevel = 'view',
  children,
}: PermissionRouteProps) {
  const { can } = usePermission()

  if (!can(permKey, minLevel)) {
    return (
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Spinner size="lg" /></div>}>
        <ForbiddenPage />
      </Suspense>
    )
  }

  return <>{children}</>
}
