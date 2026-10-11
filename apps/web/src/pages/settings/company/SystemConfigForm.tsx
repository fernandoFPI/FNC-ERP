import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useMutation } from '@apollo/client'
import { UPDATE_COMPANY_CONFIGURATION } from '../../../graphql/admin'
import { useTheme } from '../../../theme/ThemeContext'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'

interface SystemConfig {
  defaultCurrency?: string
  fiscalYearStartMonth?: number
  fiscalYearStartDay?: number
  defaultPaymentTermsDays?: number
  defaultPOCurrency?: string
  incomeTaxEnabled?: boolean
  socialSecurityRate?: number
  employerSocialSecurityRate?: number
  defaultWHTRate?: number
  companyEmailFrom?: string | null
  companyEmailSignature?: string | null
  setupCompleted?: boolean
}

interface Props {
  companyId: string
  initialValues: SystemConfig
  onSaved?: () => void
}

export function SystemConfigForm({ companyId, initialValues, onSaved }: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [values, setValues] = useState<SystemConfig>(initialValues)
  const [saved, setSaved] = useState(false)

  const [updateConfig, { loading }] = useMutation(UPDATE_COMPANY_CONFIGURATION, {
    onCompleted: () => {
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
      }, 2500)
      onSaved?.()
    },
  })

  const set = (key: keyof SystemConfig, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const numField = (label: string, key: keyof SystemConfig, placeholder?: string) => (
    <div>
      <label
        style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}
      >
        {label}
      </label>
      <input
        type="number"
        value={(values[key] as number | undefined) ?? ''}
        onChange={(e) => {
          set(key, parseFloat(e.target.value))
        }}
        placeholder={placeholder}
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
  )

  const textField = (label: string, key: keyof SystemConfig, placeholder?: string) => (
    <div>
      <label
        style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}
      >
        {label}
      </label>
      <input
        type="text"
        value={(values[key] as string | undefined) ?? ''}
        onChange={(e) => {
          set(key, e.target.value)
        }}
        placeholder={placeholder}
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
  )

  const section = (title: string) => (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 700,
        color: theme.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginTop: '20px',
        marginBottom: '10px',
      }}
    >
      {title}
    </div>
  )

  return (
    <Card style={{ padding: '24px' }}>
      {section(t('settings.sysconfig.fiscalYear'))}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        {numField(t('settings.sysconfig.startMonth'), 'fiscalYearStartMonth', '1')}
        {numField(t('settings.sysconfig.startDay'), 'fiscalYearStartDay', '1')}
      </div>

      {section(t('settings.sysconfig.currencyDefaults'))}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        {textField(t('settings.sysconfig.defaultCurrency'), 'defaultCurrency', 'USD')}
        {textField(t('settings.sysconfig.defaultPoCurrency'), 'defaultPOCurrency', 'USD')}
        {numField(t('settings.sysconfig.defaultTerms'), 'defaultPaymentTermsDays', '30')}
      </div>

      {section(t('settings.sysconfig.iraqTax'))}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <input
          type="checkbox"
          id="income-tax"
          checked={values.incomeTaxEnabled ?? false}
          onChange={(e) => {
            set('incomeTaxEnabled', e.target.checked)
          }}
        />
        <label htmlFor="income-tax" style={{ fontSize: '13px', color: theme.textPrimary }}>
          {t('settings.sysconfig.incomeTaxEnabled')}
        </label>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        {numField(t('settings.sysconfig.empSs'), 'socialSecurityRate', '5')}
        {numField(t('settings.sysconfig.erSs'), 'employerSocialSecurityRate', '12')}
      </div>

      {section(t('settings.sysconfig.whtDefault'))}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        {numField(t('settings.sysconfig.whtRate'), 'defaultWHTRate', '3')}
      </div>

      {section(t('settings.sysconfig.emailConfig'))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {textField(t('settings.sysconfig.fromAddress'), 'companyEmailFrom', 'noreply@company.com')}
        <div>
          <label
            style={{
              fontSize: '12px',
              color: theme.textMuted,
              display: 'block',
              marginBottom: '4px',
            }}
          >
            {t('settings.sysconfig.emailSignature')}
          </label>
          <textarea
            value={values.companyEmailSignature ?? ''}
            onChange={(e) => {
              set('companyEmailSignature', e.target.value)
            }}
            rows={3}
            placeholder={t('settings.sysconfig.appendedToAllOutgoingEmails')}
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
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
        {saved && (
          <span style={{ fontSize: '12px', color: theme.accent, alignSelf: 'center' }}>{t('settings.sysconfig.saved')}</span>
        )}
        <Button
          variant="primary"
          loading={loading}
          onClick={() => void updateConfig({ variables: { companyId, input: values } })}
        >
          {t('settings.sysconfig.saveConfiguration')}
        </Button>
      </div>
    </Card>
  )
}
