import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { useToastStore } from '../../../store/toastStore'
import { usePermission } from '../../../hooks/usePermission'
import { MY_PREFERENCES_QUERY, UPDATE_PREFERENCES } from '../../../graphql/settings'

interface MyPreferences {
  themePreference: string | null
  dateFormat: string | null
  numberFormat: string | null
  notificationPreferences: string | null
}

interface PreferencesData {
  myPreferences: MyPreferences
}

interface NotifPrefs {
  email_project_updates: boolean
  email_invoice_alerts: boolean
  email_payroll_reminders: boolean
  email_maintenance_alerts: boolean
  email_fx_alerts: boolean
  in_app_all: boolean
  admin_outbox_failures: boolean
  admin_dlq_alerts: boolean
  admin_system_health: boolean
  // System-admin only
  outbox_dlq_critical_inApp: boolean
  outbox_dlq_critical_email: boolean
  outbox_dlq_high_inApp: boolean
  outbox_dlq_high_email: boolean
  system_health_degraded_inApp: boolean
  system_health_degraded_email: boolean
  new_user_invitation_accepted_inApp: boolean
}

const DEFAULT_PREFS: NotifPrefs = {
  email_project_updates: true,
  email_invoice_alerts: true,
  email_payroll_reminders: true,
  email_maintenance_alerts: false,
  email_fx_alerts: false,
  in_app_all: true,
  admin_outbox_failures: false,
  admin_dlq_alerts: false,
  admin_system_health: false,
  outbox_dlq_critical_inApp: true,
  outbox_dlq_critical_email: true,
  outbox_dlq_high_inApp: true,
  outbox_dlq_high_email: false,
  system_health_degraded_inApp: true,
  system_health_degraded_email: true,
  new_user_invitation_accepted_inApp: true,
}

const NOTIF_ROWS: {
  key: keyof NotifPrefs
  label: string
  description: string
  channel: 'Email' | 'In-App' | 'Admin'
}[] = [
  {
    key: 'email_project_updates',
    label: 'Project Updates',
    description: 'Stage changes and milestone completions',
    channel: 'Email',
  },
  {
    key: 'email_invoice_alerts',
    label: 'Invoice Alerts',
    description: 'Overdue invoices and payment receipts',
    channel: 'Email',
  },
  {
    key: 'email_payroll_reminders',
    label: 'Payroll Reminders',
    description: 'Payroll run and approval reminders',
    channel: 'Email',
  },
  {
    key: 'email_maintenance_alerts',
    label: 'Maintenance Alerts',
    description: 'Equipment maintenance due notifications',
    channel: 'Email',
  },
  {
    key: 'email_fx_alerts',
    label: 'FX Rate Alerts',
    description: 'Significant exchange rate movements',
    channel: 'Email',
  },
  {
    key: 'in_app_all',
    label: 'In-App Notifications',
    description: 'Show all notifications inside the app',
    channel: 'In-App',
  },
  {
    key: 'admin_outbox_failures',
    label: 'Outbox Failures',
    description: 'Alert when events fail all retry attempts and land in DLQ',
    channel: 'Admin',
  },
  {
    key: 'admin_dlq_alerts',
    label: 'DLQ Alerts',
    description: 'Receive alerts when DLQ entries need manual review',
    channel: 'Admin',
  },
  {
    key: 'admin_system_health',
    label: 'System Health',
    description: 'Alert when a service health check goes critical',
    channel: 'Admin',
  },
]

const SYSADMIN_ROWS: {
  key: keyof NotifPrefs
  label: string
  description: string
  channel: 'Email' | 'In-App'
}[] = [
  {
    key: 'outbox_dlq_critical_inApp',
    label: 'DLQ Critical — In-App',
    description: 'In-app alert for critical-priority DLQ events',
    channel: 'In-App',
  },
  {
    key: 'outbox_dlq_critical_email',
    label: 'DLQ Critical — Email',
    description: 'Email alert for critical-priority DLQ events',
    channel: 'Email',
  },
  {
    key: 'outbox_dlq_high_inApp',
    label: 'DLQ High — In-App',
    description: 'In-app alert for high-priority DLQ events',
    channel: 'In-App',
  },
  {
    key: 'outbox_dlq_high_email',
    label: 'DLQ High — Email',
    description: 'Email alert for high-priority DLQ events',
    channel: 'Email',
  },
  {
    key: 'system_health_degraded_inApp',
    label: 'Service Degraded — In-App',
    description: 'In-app alert when any service enters degraded state',
    channel: 'In-App',
  },
  {
    key: 'system_health_degraded_email',
    label: 'Service Degraded — Email',
    description: 'Email alert when any service enters degraded state',
    channel: 'Email',
  },
  {
    key: 'new_user_invitation_accepted_inApp',
    label: 'Invitation Accepted — In-App',
    description: 'In-app alert when a user accepts an invitation',
    channel: 'In-App',
  },
]

export default function NotificationPreferencesPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const { isSystemLevel, can } = usePermission()
  const isAdmin = isSystemLevel
  const isSysAdmin = can('admin.system.view')

  const [localPrefs, setLocalPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)
  const [dirty, setDirty] = useState(false)

  const { data, loading } = useQuery<PreferencesData>(MY_PREFERENCES_QUERY)

  const [updatePreferences, { loading: saving }] = useMutation(UPDATE_PREFERENCES, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Notification preferences saved' })
      setDirty(false)
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
    refetchQueries: [{ query: MY_PREFERENCES_QUERY }],
  })

  useEffect(() => {
    if (data?.myPreferences.notificationPreferences) {
      try {
        const parsed = JSON.parse(data.myPreferences.notificationPreferences) as NotifPrefs
        setLocalPrefs({ ...DEFAULT_PREFS, ...parsed })
      } catch {
        // keep defaults
      }
    }
  }, [data])

  function toggle(key: keyof NotifPrefs) {
    setLocalPrefs((p) => ({ ...p, [key]: !p[key] }))
    setDirty(true)
  }

  function handleSave() {
    const prefs = data?.myPreferences
    updatePreferences({
      variables: {
        input: {
          themePreference: prefs?.themePreference ?? null,
          dateFormat: prefs?.dateFormat ?? null,
          numberFormat: prefs?.numberFormat ?? null,
          notificationPreferences: JSON.stringify(localPrefs),
        },
      },
    })
  }

  const grouped: Record<string, typeof NOTIF_ROWS> = {
    Email: NOTIF_ROWS.filter((r) => r.channel === 'Email'),
    'In-App': NOTIF_ROWS.filter((r) => r.channel === 'In-App'),
    ...(isAdmin ? { 'Admin Alerts': NOTIF_ROWS.filter((r) => r.channel === 'Admin') } : {}),
  }

  function renderToggle(key: keyof NotifPrefs) {
    return (
      <div
        onClick={() => {
          toggle(key)
        }}
        style={{
          width: '42px',
          height: '24px',
          borderRadius: '12px',
          background: localPrefs[key] ? theme.accent : theme.border,
          cursor: 'pointer',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '3px',
            left: localPrefs[key] ? '21px' : '3px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Notifications"
        subtitle="Control which notifications you receive and how"
        actions={
          dirty ? (
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              Save Changes
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
      ) : (
        <>
          {Object.entries(grouped).map(([channel, rows]) => (
            <Card key={channel} padding="none" style={{ marginBottom: '16px' }}>
              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                  {channel}
                </h3>
                <Badge variant={channel === 'Admin Alerts' ? 'warning' : 'neutral'} size="sm">
                  {channel === 'Admin Alerts' ? 'Admin only' : `${rows.length} types`}
                </Badge>
              </div>
              {rows.map((row, i) => (
                <div
                  key={row.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 20px',
                    borderBottom: i < rows.length - 1 ? `1px solid ${theme.tableBorder}` : 'none',
                  }}
                >
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>
                      {row.label}
                    </p>
                    <p style={{ fontSize: '12px', color: theme.textMuted }}>{row.description}</p>
                  </div>
                  {renderToggle(row.key)}
                </div>
              ))}
            </Card>
          ))}

          {/* System-admin-only section */}
          {isSysAdmin && (
            <div style={{ marginTop: '8px' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}
              >
                <div style={{ flex: 1, height: '1px', background: theme.border }} />
                <Badge variant="danger" size="sm">
                  System Admin Only
                </Badge>
                <div style={{ flex: 1, height: '1px', background: theme.border }} />
              </div>
              <Card
                padding="none"
                style={{ border: `1px solid ${theme.warningBorder ?? theme.border}` }}
              >
                <div
                  style={{
                    padding: '12px 20px',
                    borderBottom: `1px solid ${theme.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: theme.warningBg ?? theme.bgSurface,
                    borderRadius: '12px 12px 0 0',
                  }}
                >
                  <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                    Platform Operations
                  </h3>
                  <Badge variant="danger" size="sm">
                    System admin only
                  </Badge>
                </div>
                {SYSADMIN_ROWS.map((row, i) => (
                  <div
                    key={row.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 20px',
                      borderBottom:
                        i < SYSADMIN_ROWS.length - 1 ? `1px solid ${theme.tableBorder}` : 'none',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '2px',
                        }}
                      >
                        <p style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>
                          {row.label}
                        </p>
                        <Badge variant={row.channel === 'Email' ? 'info' : 'neutral'} size="sm">
                          {row.channel}
                        </Badge>
                      </div>
                      <p style={{ fontSize: '12px', color: theme.textMuted }}>{row.description}</p>
                    </div>
                    {renderToggle(row.key)}
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
