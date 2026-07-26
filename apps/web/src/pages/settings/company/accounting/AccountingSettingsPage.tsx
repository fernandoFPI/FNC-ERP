import { useTheme } from '../../../../theme/ThemeContext'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Card } from '../../../../components/ui/Card'
import { Badge } from '../../../../components/ui/Badge'

const GL_ACCOUNTS = [
  { label: 'Accounts Receivable', code: '1100', description: 'Default AR control account' },
  { label: 'Accounts Payable', code: '2100', description: 'Default AP control account' },
  { label: 'WHT Recoverable', code: '1310', description: 'Client-withheld tax recoverable' },
  {
    label: 'WHT Payable',
    code: '2310',
    description: 'WHT withheld from vendors, payable to tax authority',
  },
  {
    label: 'Payroll Expense',
    code: '5100',
    description: 'Default salaries and wages expense account',
  },
  {
    label: 'Social Security Payable',
    code: '2320',
    description: 'Employee and employer SS contributions payable',
  },
  { label: 'Income Tax Payable', code: '2330', description: 'Corporate income tax payable' },
]

export default function AccountingSettingsPage() {
  const { theme } = useTheme()

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Accounting"
        subtitle="Default GL account mappings for automated journal entries"
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
            Default Account Mapping
          </h3>
          <Badge variant="info" size="sm">
            Auto-configured
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
        Account codes are assigned automatically per company during provisioning. To change default
        account mappings, update the chart of accounts in Finance → Accounts.
      </div>
    </div>
  )
}
