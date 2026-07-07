import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { useToastStore } from '../../../store/toastStore'
import { api } from '../../../lib/axios'

interface RouteEntry {
  key: string
  label: string
  description: string
  email_enabled: boolean
  configured: boolean
  updated_at: string | null
}

export default function NotificationRoutingPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [routes, setRoutes] = useState<RouteEntry[]>([])
  const [edits, setEdits] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<{ routes: RouteEntry[] }>('/admin/notification-routing')
      .then((r) => setRoutes(r.data.routes))
      .catch(() => addToast({ type: 'error', message: 'Failed to load notification routing' }))
      .finally(() => setLoading(false))
  }, [addToast])

  useEffect(() => { void load() }, [load])

  function getEnabled(key: string, fallback: boolean): boolean {
    return edits[key] !== undefined ? edits[key]! : fallback
  }

  function toggle(key: string, current: boolean) {
    setEdits((prev) => ({ ...prev, [key]: !current }))
  }

  const hasChanges = Object.keys(edits).length > 0

  async function handleSave() {
    const updates = Object.entries(edits).map(([key, email_enabled]) => ({ key, email_enabled }))
    if (updates.length === 0) return
    setSaving(true)
    try {
      await api.put('/admin/notification-routing', { updates })
      addToast({ type: 'success', message: 'Notification routing saved' })
      setEdits({})
      void load()
    } catch {
      addToast({ type: 'error', message: 'Failed to save routing config' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '820px' }}>
      <PageHeader
        title="Notification Routing"
        subtitle="Control which system events send emails — changes take effect within 5 minutes"
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: '72px', borderRadius: '10px' }} />
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
            {routes.map((route) => {
              const enabled = getEnabled(route.key, route.email_enabled)
              const changed = edits[route.key] !== undefined

              return (
                <Card key={route.key} style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Toggle */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      onClick={() => toggle(route.key, enabled)}
                      style={{
                        flexShrink: 0,
                        width: '40px',
                        height: '22px',
                        borderRadius: '11px',
                        background: enabled ? theme.accent : theme.border,
                        border: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute',
                        top: '3px',
                        left: enabled ? '20px' : '3px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>

                    {/* Label + description */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>
                          {route.label}
                        </span>
                        {changed && <Badge variant="warning" size="sm">Unsaved</Badge>}
                        {!route.configured && !changed && (
                          <Badge variant="neutral" size="sm">Default on</Badge>
                        )}
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: theme.textMuted }}>
                        {route.description}
                      </p>
                    </div>

                    {/* Status pill */}
                    <span style={{
                      flexShrink: 0,
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: '12px',
                      background: enabled ? theme.successBg : theme.bgSurface,
                      color: enabled ? theme.success : theme.textMuted,
                      border: `1px solid ${enabled ? theme.successBorder : theme.border}`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      {enabled ? 'Email on' : 'Email off'}
                    </span>
                  </div>
                </Card>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            {hasChanges && (
              <Button variant="ghost" onClick={() => setEdits({})}>Discard changes</Button>
            )}
            <Button
              variant="primary"
              loading={saving}
              disabled={!hasChanges}
              onClick={() => void handleSave()}
            >
              Save changes
            </Button>
          </div>

          <div style={{
            marginTop: '20px',
            padding: '12px 16px',
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            fontSize: '12px',
            color: theme.textMuted,
          }}>
            <strong>Security emails</strong> (password reset, new device login, MFA setup, user invitations)
            are always sent and cannot be disabled here.
            Disabling an email here only suppresses the outgoing message — the event is still
            processed and in-app notifications are still created.
          </div>
        </>
      )}
    </div>
  )
}
