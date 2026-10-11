import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Select } from '../../../components/ui/Select'
import { useToastStore } from '../../../store/toastStore'
import { MY_PREFERENCES_QUERY, UPDATE_PREFERENCES } from '../../../graphql/settings'
import type { ThemeKey } from '../../../theme/tokens'

interface MyPreferences {
  themePreference: string | null
  dateFormat: string | null
  numberFormat: string | null
  notificationPreferences: string | null
}

interface PreferencesData {
  myPreferences: MyPreferences
}

const THEMES: { key: ThemeKey; label: string; description: string; preview: string }[] = [
  {
    key: 'light-flat',
    get label() { return i18n.t('settings.appearance.lightFlat', { defaultValue: "Light Flat" }) },
    get description() { return i18n.t('settings.appearance.cleanWhiteMaximumReadability', { defaultValue: "Clean white, maximum readability" }) },
    preview: '#f4f6f8',
  },
  { key: 'black', get label() { return i18n.t('settings.appearance.black', { defaultValue: "Black" }) }, get description() { return i18n.t('settings.appearance.pureBlackMaximumContrast', { defaultValue: "Pure black, maximum contrast" }) }, preview: '#1c1e21' },
]

const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', get label() { return i18n.t('settings.appearance.mmDdYyyyUs', { defaultValue: "MM/DD/YYYY (US)" }) } },
  { value: 'DD/MM/YYYY', get label() { return i18n.t('settings.appearance.ddMmYyyyEu', { defaultValue: "DD/MM/YYYY (EU)" }) } },
  { value: 'YYYY-MM-DD', get label() { return i18n.t('settings.appearance.yyyyMmDdIso', { defaultValue: "YYYY-MM-DD (ISO)" }) } },
]

const NUMBER_FORMATS = [
  { value: 'en-US', get label() { return i18n.t('settings.appearance.123456Us', { defaultValue: "1,234.56 (US)" }) } },
  { value: 'de-DE', get label() { return i18n.t('settings.appearance.123456Eu', { defaultValue: "1.234,56 (EU)" }) } },
  { value: 'ar-IQ', get label() { return i18n.t('settings.appearance.arabic', { defaultValue: "١٬٢٣٤٫٥٦ (Arabic)" }) } },
]

export default function AppearancePage() {
  const { t } = useTranslation()
  const { theme, themeKey, setTheme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const { data, loading } = useQuery<PreferencesData>(MY_PREFERENCES_QUERY)

  const [updatePreferences, { loading: updating }] = useMutation(UPDATE_PREFERENCES, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('settings.appearance.preferencesSaved') })
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
    refetchQueries: [{ query: MY_PREFERENCES_QUERY }],
  })

  const prefs = data?.myPreferences

  function handleThemeChange(key: ThemeKey) {
    setTheme(key)
    void updatePreferences({ variables: { input: { themePreference: key } } })
  }

  function handleFormatChange(field: 'dateFormat' | 'numberFormat', value: string) {
    void updatePreferences({
      variables: {
        input: {
          themePreference: prefs?.themePreference ?? themeKey,
          dateFormat: field === 'dateFormat' ? value : (prefs?.dateFormat ?? 'MM/DD/YYYY'),
          numberFormat: field === 'numberFormat' ? value : (prefs?.numberFormat ?? 'en-US'),
        },
      },
    })
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader title={t('settings.appearance.appearance')} subtitle={t('settings.appearance.customizeTheInterfaceThemeAndFormatting')} />

      {/* Theme Cards */}
      <Card padding="md" style={{ marginBottom: '20px' }}>
        <h3
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: theme.textPrimary,
            marginBottom: '16px',
          }}
        >
          {t('settings.appearance.theme')}
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
          }}
        >
          {THEMES.map((th) => {
            const isActive = themeKey === th.key
            return (
              <div
                key={th.key}
                onClick={() => {
                  handleThemeChange(th.key)
                }}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: `2px solid ${isActive ? theme.accent : theme.border}`,
                  background: isActive ? theme.accentBg : theme.bgSurfaceHover,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = theme.accentBorder
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = theme.border
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '8px',
                    background: th.preview,
                    border: `1px solid ${theme.border}`,
                    marginBottom: '10px',
                  }}
                />
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                      {th.label}
                    </p>
                    <p style={{ fontSize: '11px', color: theme.textMuted }}>{th.description}</p>
                  </div>
                  {isActive && (
                    <Badge variant="accent" size="sm">
                      {t('settings.appearance.active')}
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Formats */}
      <Card padding="md">
        <h3
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: theme.textPrimary,
            marginBottom: '16px',
          }}
        >
          {t('settings.appearance.formats')}
        </h3>
        {loading ? (
          <div className="skeleton" style={{ height: '80px', borderRadius: '8px' }} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              maxWidth: '600px',
            }}
          >
            <Select
              label={t('settings.appearance.dateFormat')}
              value={prefs?.dateFormat ?? 'MM/DD/YYYY'}
              onChange={(e) => {
                handleFormatChange('dateFormat', e.target.value)
              }}
              options={DATE_FORMATS}
            />
            <Select
              label={t('settings.appearance.numberFormat')}
              value={prefs?.numberFormat ?? 'en-US'}
              onChange={(e) => {
                handleFormatChange('numberFormat', e.target.value)
              }}
              options={NUMBER_FORMATS}
            />
          </div>
        )}
        {updating && (
          <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '12px' }}>{t('settings.appearance.saving')}</p>
        )}
      </Card>
    </div>
  )
}
