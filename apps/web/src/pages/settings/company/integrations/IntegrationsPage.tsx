import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../../theme/ThemeContext'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Card } from '../../../../components/ui/Card'
import { Button } from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { Badge } from '../../../../components/ui/Badge'
import { useToastStore } from '../../../../store/toastStore'
import { api } from '../../../../lib/axios'

interface ConfigEntry {
  key: string
  value: string
  is_sensitive: boolean
  description: string | null
  updated_at: string | null
  source: 'db' | 'env' | 'unset'
  has_value: boolean
}

type ConfigMap = Record<string, string>

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <Card style={{ padding: '20px', marginBottom: '16px' }}>
      <div style={{
        fontSize: '12px', fontWeight: 700, color: theme.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px',
        paddingBottom: '10px', borderBottom: `1px solid ${theme.border}`,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </Card>
  )
}

function ConfigField({
  label,
  configKey,
  entry,
  edits,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  configKey: string
  entry: ConfigEntry | undefined
  edits: ConfigMap
  onChange: (key: string, value: string) => void
  type?: string
  placeholder?: string
}) {
  const { theme } = useTheme()
  const [editing, setEditing] = useState(false)

  const currentValue = edits[configKey] !== undefined ? edits[configKey] : (entry?.value ?? '')
  const isSensitive = entry?.is_sensitive ?? false
  const hasDbValue = entry?.source === 'db'
  const hasValue = entry?.has_value ?? false

  const displayType = isSensitive && !editing && hasValue ? 'password' : type

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <label style={{ fontSize: '12px', color: theme.textMuted }}>{label}</label>
        {entry?.source === 'db' && (
          <Badge variant="success" size="sm">DB</Badge>
        )}
        {entry?.source === 'env' && (
          <Badge variant="neutral" size="sm">env</Badge>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type={displayType}
          value={isSensitive && !editing && hasValue ? '•••••' : currentValue}
          readOnly={isSensitive && !editing}
          onChange={(e) => {
            if (!isSensitive || editing) onChange(configKey, e.target.value)
          }}
          onClick={() => {
            if (isSensitive && !editing) {
              setEditing(true)
              onChange(configKey, '')
            }
          }}
          placeholder={placeholder ?? entry?.description ?? ''}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: '6px',
            border: `1px solid ${theme.border}`,
            background: isSensitive && !editing && hasValue ? theme.bgSurface : theme.bgSurface,
            color: theme.textPrimary,
            fontSize: '13px',
            cursor: isSensitive && !editing && hasValue ? 'pointer' : 'text',
          }}
        />
        {isSensitive && hasValue && !editing && (
          <button
            type="button"
            onClick={() => { setEditing(true); onChange(configKey, '') }}
            style={{
              padding: '6px 10px', fontSize: '12px', color: theme.accent,
              background: 'none', border: `1px solid ${theme.border}`,
              borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Change
          </button>
        )}
        {isSensitive && editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              const newEdits = { ...edits }
              delete newEdits[configKey]
              onChange(configKey, '•••••')
            }}
            style={{
              padding: '6px 10px', fontSize: '12px', color: theme.textMuted,
              background: 'none', border: `1px solid ${theme.border}`,
              borderRadius: '6px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
        {hasDbValue && (
          <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
            {entry?.updated_at ? `Updated ${new Date(entry.updated_at).toLocaleDateString()}` : ''}
          </span>
        )}
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [entries, setEntries] = useState<ConfigEntry[]>([])
  const [edits, setEdits] = useState<ConfigMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<{ entries: ConfigEntry[] }>('/admin/system-config')
      .then((r) => setEntries(r.data.entries))
      .catch(() => addToast({ type: 'error', message: 'Failed to load system configuration' }))
      .finally(() => setLoading(false))
  }, [addToast])

  useEffect(() => { void load() }, [load])

  function getEntry(key: string): ConfigEntry | undefined {
    return entries.find((e) => e.key === key)
  }

  function handleChange(key: string, value: string) {
    setEdits((prev) => {
      if (value === '•••••') {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: value }
    })
  }

  async function handleTestSmtp() {
    setTestingSmtp(true)
    try {
      const res = await api.post<{ ok: boolean; sentTo: string }>('/admin/system-config/test-smtp')
      addToast({ type: 'success', message: `Test email sent to ${res.data.sentTo}` })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      addToast({ type: 'error', message: msg ?? 'SMTP test failed — check your settings' })
    } finally {
      setTestingSmtp(false)
    }
  }

  async function handleSave() {
    const updates = Object.entries(edits).map(([key, value]) => ({ key, value }))
    if (updates.length === 0) {
      addToast({ type: 'info', message: 'No changes to save' })
      return
    }
    setSaving(true)
    try {
      await api.put('/admin/system-config', { updates })
      addToast({ type: 'success', message: 'Configuration saved' })
      setEdits({})
      void load()
    } catch {
      addToast({ type: 'error', message: 'Failed to save configuration' })
    } finally {
      setSaving(false)
    }
  }

  const fieldProps = (key: string, placeholder?: string, type?: string) => ({
    configKey: key,
    entry: getEntry(key),
    edits,
    onChange: handleChange,
    type,
    placeholder,
  })

  const hasChanges = Object.keys(edits).length > 0

  return (
    <div style={{ padding: '24px', maxWidth: '820px' }}>
      <PageHeader
        title="Integrations & System Configuration"
        subtitle="Configure external services — changes take effect immediately without server restart"
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '140px', borderRadius: '12px' }} />
          ))}
        </div>
      ) : (
        <div style={{ marginTop: '20px' }}>

          {/* ── SMTP ─────────────────────────────────────────── */}
          <Section title="Email Server (SMTP)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: '12px' }}>
              <ConfigField label="SMTP Host" {...fieldProps('smtp.host', 'mail.example.com')} />
              <ConfigField label="Port" {...fieldProps('smtp.port', '465', 'number')} />
              <ConfigField label="Secure (TLS)" {...fieldProps('smtp.secure', 'true or false')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <ConfigField label="SMTP Username" {...fieldProps('smtp.user', 'user@example.com')} />
              <ConfigField label="SMTP Password" {...fieldProps('smtp.password', '••••••••')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <ConfigField label="From Name" {...fieldProps('email.from_name', 'FNC Group')} />
              <ConfigField label="From Address" {...fieldProps('email.from_address', 'noreply@example.com')} />
              <ConfigField label="Reply-To (optional)" {...fieldProps('email.reply_to', 'support@example.com')} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" loading={testingSmtp} onClick={() => void handleTestSmtp()}>
                Send Test Email
              </Button>
            </div>
          </Section>

          {/* ── App URL ──────────────────────────────────────── */}
          <Section title="Application">
            <ConfigField
              label="Public App Base URL"
              {...fieldProps('app.base_url', 'https://erp.yourcompany.com')}
            />
            <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>
              Used to generate QR codes on invoice PDFs and links in outgoing emails.
            </p>
          </Section>

          {/* ── FX Rate API ───────────────────────────────────── */}
          <Section title="FX Rate API">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <ConfigField
                label="ExchangeRate-API Key (primary)"
                {...fieldProps('fx.exchange_rate_api_key', 'Your API key from exchangerate-api.com')}
              />
              <ConfigField
                label="Open Exchange Rates App ID (fallback)"
                {...fieldProps('fx.open_exchange_rates_app_id', 'Your App ID from openexchangerates.org')}
              />
            </div>
            <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>
              Used by the daily FX sync job. The primary key is tried first; the fallback is used if the primary fails.
            </p>
          </Section>

          {/* ── B2 Storage ────────────────────────────────────── */}
          <Section title="File Storage (Backblaze B2)">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <ConfigField label="B2 Endpoint URL" {...fieldProps('storage.b2_endpoint', 'https://s3.us-west-004.backblazeb2.com')} />
              <ConfigField label="Region" {...fieldProps('storage.b2_region', 'us-west-004')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <ConfigField label="B2 Key ID" {...fieldProps('storage.b2_key_id')} />
              <ConfigField label="B2 Application Key (secret)" {...fieldProps('storage.b2_application_key')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <ConfigField label="Bucket Name" {...fieldProps('storage.b2_bucket_name', 'fnc-erp-prod')} />
              <ConfigField label="Public CDN URL (optional)" {...fieldProps('storage.b2_bucket_public_url', 'https://cdn.example.com')} />
            </div>
          </Section>

          {/* ── Save bar ─────────────────────────────────────── */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: '12px',
            paddingTop: '8px', marginTop: '4px',
          }}>
            {hasChanges && (
              <Button
                variant="ghost"
                onClick={() => setEdits({})}
              >
                Discard changes
              </Button>
            )}
            <Button
              variant="primary"
              loading={saving}
              onClick={() => void handleSave()}
              disabled={!hasChanges}
            >
              Save configuration
            </Button>
          </div>

          {/* ── Info note ────────────────────────────────────── */}
          <div style={{
            marginTop: '20px',
            padding: '12px 16px',
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            fontSize: '12px',
            color: theme.textMuted,
          }}>
            <strong>DB</strong> badge = value stored in database (overrides .env).&nbsp;
            <strong>env</strong> badge = read from the server environment file.&nbsp;
            Changes saved here take effect within 5 minutes for background workers (FX sync, email).
            Infrastructure settings (DATABASE_URL, JWT_SECRET, service ports) are intentionally not configurable here.
          </div>
        </div>
      )}
    </div>
  )
}
