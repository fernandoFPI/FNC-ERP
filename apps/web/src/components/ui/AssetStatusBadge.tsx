import { useEffect } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Badge } from './Badge'

type AssetStatus = 'available' | 'rented' | 'maintenance' | 'retired' | 'reserved'
type MaintenanceStatus = 'ok' | 'due_soon' | 'overdue' | 'in_progress'

interface Props {
  status: AssetStatus
  maintenanceStatus?: MaintenanceStatus
}

const STATUS_VARIANT: Record<AssetStatus, 'success' | 'info' | 'warning' | 'neutral' | 'accent'> = {
  available: 'success',
  rented: 'accent',
  maintenance: 'warning',
  retired: 'neutral',
  reserved: 'info',
}

const MAINTENANCE_VARIANT: Record<MaintenanceStatus, 'success' | 'warning' | 'danger' | 'info'> = {
  ok: 'success',
  due_soon: 'warning',
  overdue: 'danger',
  in_progress: 'info',
}

const MAINTENANCE_LABEL: Record<MaintenanceStatus, string> = {
  ok: 'Maintenance OK',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  in_progress: 'In Progress',
}

function injectPulseKeyframes() {
  if (document.getElementById('fnc-pulse-style')) return
  const style = document.createElement('style')
  style.id = 'fnc-pulse-style'
  style.textContent = `@keyframes fnc-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.06); } }`
  document.head.appendChild(style)
}

export function AssetStatusBadge({ status, maintenanceStatus }: Props) {
  const { theme } = useTheme()

  useEffect(() => {
    if (maintenanceStatus === 'overdue') injectPulseKeyframes()
  }, [maintenanceStatus])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <Badge variant={STATUS_VARIANT[status] ?? 'neutral'}>{status.replace('_', ' ')}</Badge>
      {maintenanceStatus && maintenanceStatus !== 'ok' && (
        maintenanceStatus === 'overdue' ? (
          <span style={{ animation: 'fnc-pulse 1.8s ease-in-out infinite', display: 'inline-flex' }}>
            <Badge variant="danger">{MAINTENANCE_LABEL[maintenanceStatus]}</Badge>
          </span>
        ) : (
          <Badge variant={MAINTENANCE_VARIANT[maintenanceStatus]}>
            {MAINTENANCE_LABEL[maintenanceStatus]}
          </Badge>
        )
      )}
      {maintenanceStatus === 'ok' && (
        <span style={{ fontSize: '11px', color: theme.success }}>✓</span>
      )}
    </div>
  )
}
