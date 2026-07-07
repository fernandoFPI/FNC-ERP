import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
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

interface PreferencesData { myPreferences: MyPreferences }

const THEMES: { key: ThemeKey; label: string; description: string; preview: string }[] = [
  { key: 'dark-glass', label: 'Dark Glass', description: 'Frosted glass with blue accents', preview: '#0d1117' },
  { key: 'dark-white', label: 'Dark White', description: 'Dark with white highlights', preview: '#1a1a1a' },
  { key: 'light-glass', label: 'Light Glass', description: 'Frosted glass light variant', preview: '#f0f4f8' },
  { key: 'light-flat', label: 'Light Flat', description: 'Clean professional light theme', preview: '#f8fafc' },
]

const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (EU)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
]

const NUMBER_FORMATS = [
  { value: 'en-US', label: '1,234.56 (US)' },
  { value: 'de-DE', label: '1.234,56 (EU)' },
  { value: 'ar-IQ', label: '١٬٢٣٤٫٥٦ (Arabic)' },
]

export default function AppearancePage() {
  const { theme, themeKey, setTheme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const { data, loading } = useQuery<PreferencesData>(MY_PREFERENCES_QUERY)

  const [updatePreferences, { loading: updating }] = useMutation(UPDATE_PREFERENCES, {
    onCompleted: () => addToast({ type: 'success', message: 'Preferences saved' }),
    onError: (e) => addToast({ type: 'error', message: e.message }),
    refetchQueries: [{ query: MY_PREFERENCES_QUERY }],
  })

  const prefs = data?.myPreferences

  function handleThemeChange(key: ThemeKey) {
    setTheme(key)
    updatePreferences({ variables: { input: { themePreference: key } } })
  }

  function handleFormatChange(field: 'dateFormat' | 'numberFormat', value: string) {
    updatePreferences({
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
      <PageHeader title="Appearance" subtitle="Customize the interface theme and formatting" />

      {/* Theme Cards */}
      <Card padding="md" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Theme</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          {THEMES.map(t => {
            const isActive = themeKey === t.key
            return (
              <div
                key={t.key}
                onClick={() => handleThemeChange(t.key)}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: `2px solid ${isActive ? theme.accent : theme.border}`,
                  background: isActive ? theme.accentBg : theme.bgSurfaceHover,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = theme.accentBorder }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = theme.border }}
              >
                <div style={{
                  width: '100%',
                  height: '48px',
                  borderRadius: '8px',
                  background: t.preview,
                  border: `1px solid ${theme.border}`,
                  marginBottom: '10px',
                }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>{t.label}</p>
                    <p style={{ fontSize: '11px', color: theme.textMuted }}>{t.description}</p>
                  </div>
                  {isActive && <Badge variant="accent" size="sm">Active</Badge>}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Formats */}
      <Card padding="md">
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Formats</h3>
        {loading ? (
          <div className="skeleton" style={{ height: '80px', borderRadius: '8px' }} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', maxWidth: '600px' }}>
            <Select
              label="Date Format"
              value={prefs?.dateFormat ?? 'MM/DD/YYYY'}
              onChange={(e) => handleFormatChange('dateFormat', e.target.value)}
              options={DATE_FORMATS}
            />
            <Select
              label="Number Format"
              value={prefs?.numberFormat ?? 'en-US'}
              onChange={(e) => handleFormatChange('numberFormat', e.target.value)}
              options={NUMBER_FORMATS}
            />
          </div>
        )}
        {updating && (
          <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '12px' }}>Saving…</p>
        )}
      </Card>
    </div>
  )
}
