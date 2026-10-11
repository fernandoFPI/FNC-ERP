import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Badge } from '../../../components/ui/Badge'
import { useToastStore } from '../../../store/toastStore'
import { MY_PREFERENCES_QUERY, UPDATE_PREFERENCES } from '../../../graphql/settings'
import { COMPANY_QUERY, UPDATE_COMPANY_CONFIGURATION } from '../../../graphql/admin'
import { useAuthStore } from '../../../store/authStore'
import { SystemConfigForm } from './SystemConfigForm'
import type { CompanyQuery, CompanyQueryVariables, UpdateCompanyConfigurationMutation, UpdateCompanyConfigurationMutationVariables, UpdatePreferencesMutation, UpdatePreferencesMutationVariables } from '../../../graphql/generated'

interface MyPreferences {
  themePreference: string | null
  dateFormat: string | null
  numberFormat: string | null
  notificationPreferences: string | null
}

interface PreferencesData {
  myPreferences: MyPreferences
}

interface FXAlertThresholds {
  usd_iqd_alert_pct: number
  eur_iqd_alert_pct: number
  gbp_iqd_alert_pct: number
  warn_rate_hours: number
  critical_rate_hours: number
}

const DEFAULT_THRESHOLDS: FXAlertThresholds = {
  usd_iqd_alert_pct: 2.0,
  eur_iqd_alert_pct: 2.5,
  gbp_iqd_alert_pct: 3.0,
  warn_rate_hours: 12,
  critical_rate_hours: 24,
}

type Tab = 'profile' | 'fx_thresholds' | 'configuration' | 'interco' | 'branding'

export default function CompanySettingsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const companyId = useAuthStore((s) => s.user?.companyId)
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  const [thresholds, setThresholds] = useState<FXAlertThresholds>(DEFAULT_THRESHOLDS)
  const [fxValidationError, setFxValidationError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [emailFrom, setEmailFrom] = useState('')
  const [emailSig, setEmailSig] = useState('')

  const { data, loading } = useQuery<PreferencesData>(MY_PREFERENCES_QUERY)
  const { data: companyData } = useQuery<CompanyQuery, CompanyQueryVariables>(COMPANY_QUERY, {
    variables: { id: companyId ?? '' },
    skip: !companyId,
  })
  const company = companyData?.company

  const [updatePreferences, { loading: saving }] = useMutation<UpdatePreferencesMutation, UpdatePreferencesMutationVariables>(UPDATE_PREFERENCES, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('settings.company.settingsSaved') })
      setDirty(false)
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
    refetchQueries: [{ query: MY_PREFERENCES_QUERY }],
  })

  const [updateConfig, { loading: savingConfig }] = useMutation<UpdateCompanyConfigurationMutation, UpdateCompanyConfigurationMutationVariables>(UPDATE_COMPANY_CONFIGURATION, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('settings.company.brandingSettingsSaved') })
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  useEffect(() => {
    if (data?.myPreferences.notificationPreferences) {
      try {
        const parsed = JSON.parse(data.myPreferences.notificationPreferences) as {
          fx?: FXAlertThresholds
        }
        if (parsed.fx) setThresholds({ ...DEFAULT_THRESHOLDS, ...parsed.fx })
      } catch {
        /* keep defaults */
      }
    }
  }, [data])

  useEffect(() => {
    if (company?.configuration) {
      setEmailFrom(company.configuration.companyEmailFrom ?? '')
      setEmailSig(company.configuration.companyEmailSignature ?? '')
    }
  }, [company])

  function handleFXChange(key: keyof FXAlertThresholds, value: string) {
    const next = { ...thresholds, [key]: parseFloat(value) || 0 }
    setThresholds(next)
    setDirty(true)
    // Cross-field validation
    if (next.warn_rate_hours >= next.critical_rate_hours && next.critical_rate_hours > 0) {
      setFxValidationError(t('settings.company.warnLtCritical'))
    } else {
      setFxValidationError(null)
    }
  }

  function handleSaveFX() {
    if (fxValidationError) return
    if (thresholds.warn_rate_hours >= thresholds.critical_rate_hours) {
      setFxValidationError(t('settings.company.warnLtCritical'))
      return
    }
    const prefs = data?.myPreferences
    let existingNotif: Record<string, unknown> = {}
    try {
      existingNotif = prefs?.notificationPreferences
        ? (JSON.parse(prefs.notificationPreferences) as Record<string, unknown>)
        : {}
    } catch {
      /**/
    }
    void updatePreferences({
      variables: {
        input: {
          themePreference: prefs?.themePreference ?? null,
          dateFormat: prefs?.dateFormat ?? null,
          numberFormat: prefs?.numberFormat ?? null,
          notificationPreferences: JSON.stringify({ ...existingNotif, fx: thresholds }),
        },
      },
    })
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: t('settings.company.profile') },
    { key: 'fx_thresholds', label: t('settings.company.fxThresholds') },
    { key: 'configuration', label: t('settings.company.configuration') },
    { key: 'interco', label: t('settings.company.interCompany') },
    { key: 'branding', label: t('settings.company.brandingEmail') },
  ]

  const FX_PAIRS: {
    key: keyof FXAlertThresholds
    label: string
    description: string
    suffix: string
  }[] = [
    {
      key: 'usd_iqd_alert_pct',
      label: t('settings.company.usdIqdAlertThreshold'),
      description: t('settings.company.alertWhenRateMovesMoreThan'),
      suffix: '%',
    },
    {
      key: 'eur_iqd_alert_pct',
      label: t('settings.company.eurIqdAlertThreshold'),
      description: t('settings.company.alertWhenRateMovesMoreThan'),
      suffix: '%',
    },
    {
      key: 'gbp_iqd_alert_pct',
      label: t('settings.company.gbpIqdAlertThreshold'),
      description: t('settings.company.alertWhenRateMovesMoreThan'),
      suffix: '%',
    },
    {
      key: 'warn_rate_hours',
      label: t('settings.company.warnAfterHours'),
      description: t('settings.company.emitAWarningAlertWhenRate'),
      suffix: 'hrs',
    },
    {
      key: 'critical_rate_hours',
      label: t('settings.company.criticalAfterHours'),
      description: t('settings.company.escalateToCriticalWhenRateIs'),
      suffix: 'hrs',
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader title={t('settings.company.companySettings')} subtitle={t('settings.company.groupLevelAndCompanyConfiguration')} />

      <div
        style={{
          display: 'flex',
          gap: '2px',
          borderBottom: `1px solid ${theme.border}`,
          margin: '16px 0',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key)
            }}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              color: activeTab === t.key ? theme.accent : theme.textMuted,
              borderBottom:
                activeTab === t.key ? `2px solid ${theme.accent}` : '2px solid transparent',
              fontWeight: activeTab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />}

      {!loading && activeTab === 'profile' && (
        <Card style={{ padding: '20px' }}>
          {!company ? (
            <div style={{ color: theme.textMuted, fontSize: '13px' }}>
              {t('settings.company.companyInformationNotAvailable')}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              {[
                [t('settings.company.fName'), company.name],
                [t('settings.company.fLegal'), company.legalName],
                [t('settings.company.fCountry'), company.countryCode],
                [t('settings.company.fCity'), company.city],
                [t('settings.company.fCurrency'), company.currencyCode],
                [t('settings.company.fPhone'), company.phone],
                [t('settings.company.fEmail'), company.email],
                [t('settings.company.fVat'), company.vatNumber],
                [t('settings.company.fReg'), company.registrationNumber],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                    {k}
                  </div>
                  <div style={{ fontSize: '13px', color: theme.textPrimary }}>{v ?? '—'}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!loading && activeTab === 'fx_thresholds' && (
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
              {t('settings.company.fxRateAlertThresholds')}
            </div>
            <Badge variant="info" size="sm">
              {t('settings.company.adminOnly')}
            </Badge>
          </div>
          <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '20px' }}>
            {t('settings.company.percentagesAreTheMinimumChangeThat')}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
            }}
          >
            {FX_PAIRS.map((pair) => (
              <div key={pair.key}>
                <Input
                  label={pair.label}
                  type="number"
                  step="0.1"
                  min="0"
                  value={String(thresholds[pair.key])}
                  onChange={(e) => {
                    handleFXChange(pair.key, e.target.value)
                  }}
                  suffix={
                    <span style={{ color: theme.textMuted, fontSize: '12px' }}>{pair.suffix}</span>
                  }
                />
                <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                  {pair.description}
                </p>
              </div>
            ))}
          </div>
          {fxValidationError && (
            <div
              style={{
                marginTop: '12px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: theme.dangerBg,
                border: `1px solid ${theme.danger}`,
                fontSize: '12px',
                color: theme.danger,
              }}
            >
              {fxValidationError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!dirty || !!fxValidationError}
              onClick={handleSaveFX}
            >
              {t('settings.company.saveThresholds')}
            </Button>
          </div>
        </Card>
      )}

      {!loading && activeTab === 'configuration' && companyId && (
        <SystemConfigForm
          companyId={companyId}
          initialValues={company?.configuration ?? {}}
          onSaved={() => {
            addToast({ type: 'success', message: t('settings.company.configurationSaved') })
          }}
        />
      )}

      {!loading && activeTab === 'interco' && (
        <Card style={{ padding: '20px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '12px',
            }}
          >
            {t('settings.company.interCompanyTransferPricing')}
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            {t('settings.company.methodLabel')}{' '}
            <span style={{ color: theme.textPrimary }}>
              {company?.intercoTransferPricingMethod?.replace(/_/g, ' ') ?? t('settings.company.notConfigured')}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '12px' }}>
            {t('settings.company.interCompanySettingsAreManagedBy')}
          </div>
        </Card>
      )}

      {!loading && activeTab === 'branding' && companyId && (
        <Card style={{ padding: '20px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '16px',
            }}
          >
            {t('settings.company.emailBranding')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {t('settings.company.fromAddress')}
              </label>
              <input
                value={emailFrom}
                onChange={(e) => {
                  setEmailFrom(e.target.value)
                }}
                placeholder={t('settings.company.noreplyCompanyCom')}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  color: theme.textPrimary,
                  fontSize: '13px',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {t('settings.company.emailSignature')}
              </label>
              <textarea
                value={emailSig}
                onChange={(e) => {
                  setEmailSig(e.target.value)
                }}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  color: theme.textPrimary,
                  fontSize: '13px',
                  resize: 'vertical',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                size="sm"
                loading={savingConfig}
                onClick={() =>
                  void updateConfig({
                    variables: {
                      companyId,
                      input: {
                        company_email_from: emailFrom || undefined,
                        company_email_signature: emailSig || undefined,
                      },
                    },
                  })
                }
              >
                {t('settings.company.saveBranding')}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
