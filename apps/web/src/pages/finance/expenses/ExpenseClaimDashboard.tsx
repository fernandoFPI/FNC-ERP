import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface DashboardClaim {
  id: string
  claim_number: string
  employee_id: string
  employee_name: string
  total_amount: number
  currency_code: string
  status: string
  approved_at: string | null
}

interface EmployeeRollup {
  employee_id: string
  employee_name: string
  claim_count: number
  total_outstanding: number
}

interface Dashboard {
  claims: DashboardClaim[]
  by_employee: EmployeeRollup[]
}

export default function ExpenseClaimDashboard() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<Dashboard>('/finance/expense-claims/dashboard')
      setData(res.data)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const totalOutstanding = data?.claims.reduce((s, c) => s + Number(c.total_amount), 0) ?? 0
  const employeeCount = data?.by_employee.length ?? 0
  const claimCount = data?.claims.length ?? 0

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Expense Claims Dashboard"
        subtitle="Company-wide claims approved and awaiting payment, by employee"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate('/finance/expense-claims')
              }}
            >
              ← Back to Expense Claims
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Total Awaiting Payment
          </p>
          <AmountDisplay amount={totalOutstanding} currency="IQD" size="md" colored />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Employees Owed
          </p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: theme.textSecondary }}>
            {employeeCount}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Open Claims
          </p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: theme.textSecondary }}>
            {claimCount}
          </p>
        </Card>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <p
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: theme.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          By Employee
        </p>
        <Card padding="none">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr
                style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}
              >
                {['Employee', 'Claims', 'Outstanding'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '9px 12px',
                      textAlign: i === 0 ? 'left' : 'right',
                      color: theme.textMuted,
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={3}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && !data?.by_employee.length && (
                <tr>
                  <td
                    colSpan={3}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    No claims awaiting payment.
                  </td>
                </tr>
              )}
              {data?.by_employee.map((e) => (
                <tr key={e.employee_id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: theme.textPrimary }}>
                    {e.employee_name}
                  </td>
                  <td
                    style={{ padding: '9px 12px', textAlign: 'right', color: theme.textSecondary }}
                  >
                    {e.claim_count}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <AmountDisplay
                      amount={Number(e.total_outstanding)}
                      currency="IQD"
                      size="sm"
                      colored
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <p
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: theme.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          Open Claims
        </p>
        <Card padding="none">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr
                style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}
              >
                {['Ref', 'Employee', 'Amount', 'Status'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '9px 12px',
                      textAlign: i === 2 ? 'right' : 'left',
                      color: theme.textMuted,
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && !data?.claims.length && (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    No open claims.
                  </td>
                </tr>
              )}
              {data?.claims.map((c) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  onClick={() => {
                    navigate(`/finance/expense-claims/${c.id}`)
                  }}
                >
                  <td
                    style={{
                      padding: '9px 12px',
                      color: theme.accent,
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  >
                    {c.claim_number}
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: theme.textPrimary }}>
                    {c.employee_name}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <AmountDisplay
                      amount={Number(c.total_amount)}
                      currency={c.currency_code}
                      size="sm"
                      colored
                    />
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <Badge variant="warning">Awaiting payment</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
