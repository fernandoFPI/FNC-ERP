import i18n from '../../../../i18n'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../../../theme/ThemeContext'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Card } from '../../../../components/ui/Card'
import { Badge } from '../../../../components/ui/Badge'

const GL_ACCOUNTS = [
  { get label() { return i18n.t('settings.accounting.accountsReceivable', { defaultValue: "Accounts Receivable" }) }, code: '1100', get description() { return i18n.t('settings.accounting.defaultArControlAccount', { defaultValue: "Default AR control account" }) } },
  { get label() { return i18n.t('settings.accounting.accountsPayable', { defaultValue: "Accounts Payable" }) }, code: '2100', get description() { return i18n.t('settings.accounting.defaultApControlAccount', { defaultValue: "Default AP control account" }) } },
  { get label() { return i18n.t('settings.accounting.whtRecoverable', { defaultValue: "WHT Recoverable" }) }, code: '1310', get description() { return i18n.t('settings.accounting.clientWithheldTaxRecoverable', { defaultValue: "Client-withheld tax recoverable" }) } },
  {
    get label() { return i18n.t('settings.accounting.whtPayable', { defaultValue: "WHT Payable" }) },
    code: '2310',
    get description() { return i18n.t('settings.accounting.whtWithheldFromVendorsPayableTo', { defaultValue: "WHT withheld from vendors, payable to tax authority" }) },
  },
  {
    get label() { return i18n.t('settings.accounting.payrollExpense', { defaultValue: "Payroll Expense" }) },
    code: '5100',
    get description() { return i18n.t('settings.accounting.defaultSalariesAndWagesExpenseAccount', { defaultValue: "Default salaries and wages expense account" }) },
  },
  {
    get label() { return i18n.t('settings.accounting.socialSecurityPayable', { defaultValue: "Social Security Payable" }) },
    code: '2320',
    get description() { return i18n.t('settings.accounting.employeeAndEmployerSsContributionsPayable', { defaultValue: "Employee and employer SS contributions payable" }) },
  },
  { get label() { return i18n.t('settings.accounting.incomeTaxPayable', { defaultValue: "Income Tax Payable" }) }, code: '2330', get description() { return i18n.t('settings.accounting.corporateIncomeTaxPayable', { defaultValue: "Corporate income tax payable" }) } },
]

export default function AccountingSettingsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('settings.accounting.accounting')}
        subtitle={t('settings.accounting.defaultGlAccountMappingsForAutomated')}
      />

      <Card padding="none" style={{ marginBottom: '16px' }}>
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
            {t('settings.accounting.defaultAccountMapping')}
          </h3>
          <Badge variant="info" size="sm">
            {t('settings.accounting.autoConfigured')}
          </Badge>
        </div>
        {GL_ACCOUNTS.map((acct, i) => (
          <div
            key={acct.code}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 20px',
              borderBottom: i < GL_ACCOUNTS.length - 1 ? `1px solid ${theme.tableBorder}` : 'none',
            }}
          >
            <div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>
                {acct.label}
              </p>
              <p style={{ fontSize: '12px', color: theme.textMuted }}>{acct.description}</p>
            </div>
            <div
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '12px',
                color: theme.accent,
                background: theme.accentBg,
                padding: '4px 10px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
              }}
            >
              {acct.code}
            </div>
          </div>
        ))}
      </Card>

      <div
        style={{
          padding: '14px 18px',
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '10px',
          fontSize: '12px',
          color: theme.textMuted,
        }}
      >
        {t('settings.accounting.accountCodesAreAssignedAutomaticallyPer')}
      </div>
    </div>
  )
}
