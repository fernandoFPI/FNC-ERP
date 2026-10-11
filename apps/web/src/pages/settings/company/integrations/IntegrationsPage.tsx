import { Trans, useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../../theme/ThemeContext'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Card } from '../../../../components/ui/Card'
import { Button } from '../../../../components/ui/Button'
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
      <div
        style={{
          fontSize: '12px',
          fontWeight: 700,
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '16px',
          paddingBottom: '10px',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
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
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [editing, setEditing] = useState(false)

  const currentValue = edits[configKey] ?? entry?.value ?? ''
  const isSensitive = entry?.is_sensitive ?? false
  const hasDbValue = entry?.source === 'db'
  const hasValue = entry?.has_value ?? false

  const displayType = isSensitive && !editing && hasValue ? 'password' : type

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <label style={{ fontSize: '12px', color: theme.textMuted }}>{label}</label>
        {entry?.source === 'db' && (
          <Badge variant="success" size="sm">
            {t('settings.integrations.db')}
          </Badge>
        )}
        {entry?.source === 'env' && (
          <Badge variant="neutral" size="sm">
            {t('settings.integrations.env')}
          </Badge>
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
            onClick={() => {
              setEditing(true)
              onChange(configKey, '')
            }}
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              color: theme.accent,
              background: 'none',
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t('settings.integrations.change')}
          </button>
        )}
        {isSensitive && editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              const newEdits = { ...edits }
              Reflect.deleteProperty(newEdits, configKey)
              onChange(configKey, '•••••')
            }}
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              color: theme.textMuted,
              background: 'none',
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {t('settings.integrations.cancel')}
          </button>
        )}
        {hasDbValue && (
          <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
            {entry.updated_at ? `Updated ${new Date(entry.updated_at).toLocaleDateString()}` : ''}
          </span>
        )}
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [entries, setEntries] = useState<ConfigEntry[]>([])
  const [edits, setEdits] = useState<ConfigMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<{ entries: ConfigEntry[] }>('/admin/system-config')
      .then((r) => {
        setEntries(r.data.entries)
      })
      .catch(() => {
        addToast({ type: 'error', message: t('settings.integrations.failedToLoadSystemConfiguration') })
      })
      .finally(() => {
        setLoading(false)
      })
  }, [addToast])

  useEffect(() => {
    load()
  }, [load])

  function getEntry(key: string): ConfigEntry | undefined {
    return entries.find((e) => e.key === key)
  }

  function handleChange(key: string, value: string) {
    setEdits((prev) => {
      if (value === '•••••') {
        const next = { ...prev }
        Reflect.deleteProperty(next, key)
        return next
      }
      return { ...prev, [key]: value }
    })
  }

  async function handleTestEmail() {
    setTestingEmail(true)
    try {
      const res = await api.post<{ ok: boolean; sentTo: string }>('/admin/system-config/test-email')
      addToast({ type: 'success', message: t('settings.integrations.testEmailSent', { to: res.data.sentTo }) })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      addToast({ type: 'error', message: msg ?? t('settings.integrations.emailTestFailed') })
    } finally {
      setTestingEmail(false)
    }
  }

  async function handleSave() {
    const updates = Object.entries(edits).map(([key, value]) => ({ key, value }))
    if (updates.length === 0) {
      addToast({ type: 'info', message: t('settings.integrations.noChangesToSave') })
      return
    }
    setSaving(true)
    try {
      await api.put('/admin/system-config', { updates })
      addToast({ type: 'success', message: t('settings.integrations.configurationSaved') })
      setEdits({})
      load()
    } catch {
      addToast({ type: 'error', message: t('settings.integrations.failedToSaveConfiguration') })
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
        title={t('settings.integrations.integrationsSystemConfiguration')}
        subtitle={t('settings.integrations.configureExternalServicesChangesTakeEffect')}
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '140px', borderRadius: '12px' }} />
          ))}
        </div>
      ) : (
        <div style={{ marginTop: '20px' }}>
          {/* ── Email (Microsoft Graph API) ─────────────────────── */}
          <Section title={t('settings.integrations.emailMicrosoftGraphApi')}>
            <p style={{ fontSize: '12px', color: theme.textMuted, margin: '-4px 0 4px' }}>
              <Trans i18nKey="settings.integrations.azureNote" components={{ code: <code /> }} />
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <ConfigField
                label={t('settings.integrations.tenantId')}
                {...fieldProps('msgraph.tenant_id', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
              />
              <ConfigField
                label={t('settings.integrations.clientId')}
                {...fieldProps('msgraph.client_id', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <ConfigField
                label={t('settings.integrations.clientSecret')}
                {...fieldProps('msgraph.client_secret', '••••••••')}
              />
              <ConfigField
                label={t('settings.integrations.senderMailbox')}
                {...fieldProps('msgraph.sender_address', 'noreply@example.com')}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <ConfigField label={t('settings.integrations.fromName')} {...fieldProps('email.from_name', 'FNC Group')} />
              <ConfigField
                label={t('settings.integrations.fromAddress')}
                {...fieldProps('email.from_address', 'noreply@example.com')}
              />
              <ConfigField
                label={t('settings.integrations.replyToOptional')}
                {...fieldProps('email.reply_to', 'support@example.com')}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                size="sm"
                loading={testingEmail}
                onClick={() => void handleTestEmail()}
              >
                {t('settings.integrations.sendTestEmail')}
              </Button>
            </div>
          </Section>

          {/* ── App URL ──────────────────────────────────────── */}
          <Section title={t('settings.integrations.application')}>
            <ConfigField
              label={t('settings.integrations.publicAppBaseUrl')}
              {...fieldProps('app.base_url', 'https://erp.yourcompany.com')}
            />
            <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>
              {t('settings.integrations.usedToGenerateQrCodesOn')}
            </p>
          </Section>

          {/* ── FX Rate API ───────────────────────────────────── */}
          <Section title={t('settings.integrations.fxRateApi')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <ConfigField
                label={t('settings.integrations.exchangerateApiKeyPrimary')}
                {...fieldProps(
                  'fx.exchange_rate_api_key',
                  t('settings.integrations.exchangeApiKeyPh'),
                )}
              />
              <ConfigField
                label={t('settings.integrations.openExchangeRatesAppIdFallback')}
                {...fieldProps(
                  'fx.open_exchange_rates_app_id',
                  t('settings.integrations.oxrAppIdPh'),
                )}
              />
            </div>
            <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>
              {t('settings.integrations.usedByTheDailyFxSync')}
            </p>
          </Section>

          {/* ── B2 Storage ────────────────────────────────────── */}
          <Section title={t('settings.integrations.fileStorageBackblazeB2')}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <ConfigField
                label={t('settings.integrations.b2EndpointUrl')}
                {...fieldProps('storage.b2_endpoint', 'https://s3.us-west-004.backblazeb2.com')}
              />
              <ConfigField label={t('settings.integrations.region')} {...fieldProps('storage.b2_region', 'us-west-004')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <ConfigField label={t('settings.integrations.b2KeyId')} {...fieldProps('storage.b2_key_id')} />
              <ConfigField
                label={t('settings.integrations.b2ApplicationKeySecret')}
                {...fieldProps('storage.b2_application_key')}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <ConfigField
                label={t('settings.integrations.bucketName')}
                {...fieldProps('storage.b2_bucket_name', 'fnc-erp-prod')}
              />
              <ConfigField
                label={t('settings.integrations.publicCdnUrlOptional')}
                {...fieldProps('storage.b2_bucket_public_url', 'https://cdn.example.com')}
              />
            </div>
          </Section>

          {/* ── Save bar ─────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              paddingTop: '8px',
              marginTop: '4px',
            }}
          >
            {hasChanges && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEdits({})
                }}
              >
                {t('settings.integrations.discardChanges')}
              </Button>
            )}
            <Button
              variant="primary"
              loading={saving}
              onClick={() => void handleSave()}
              disabled={!hasChanges}
            >
              {t('settings.integrations.saveConfiguration')}
            </Button>
          </div>

          {/* ── Info note ────────────────────────────────────── */}
          <div
            style={{
              marginTop: '20px',
              padding: '12px 16px',
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px',
              fontSize: '12px',
              color: theme.textMuted,
            }}
          >
            <Trans i18nKey="settings.integrations.badgeNote" components={{ strong: <strong /> }} />
          </div>
        </div>
      )}
    </div>
  )
}
