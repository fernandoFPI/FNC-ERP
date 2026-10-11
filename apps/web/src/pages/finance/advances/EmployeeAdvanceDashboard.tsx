import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface DashboardAdvance {
  id: string
  advance_number: string
  employee_id: string
  employee_name: string
  amount: number
  settled_amount: number
  returned_amount: number
  outstanding_amount: number
  currency_code: string
  status: string
  approved_at: string | null
}

interface EmployeeRollup {
  employee_id: string
  employee_name: string
  advance_count: number
  total_issued: number
  total_settled: number
  total_returned: number
  total_outstanding: number
}

interface Dashboard {
  advances: DashboardAdvance[]
  by_employee: EmployeeRollup[]
}

const STATUS_BADGE: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  approved: 'warning',
  partially_settled: 'warning',
}

export default function EmployeeAdvanceDashboard() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<Dashboard>('/finance/advances/dashboard')
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

  const totalOutstanding = data?.advances.reduce((s, a) => s + Number(a.outstanding_amount), 0) ?? 0
  const employeeCount = data?.by_employee.length ?? 0
  const advanceCount = data?.advances.length ?? 0

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('fin.advDash.advancesDashboard')}
        subtitle={t('fin.advDash.companyWideOutstandingCashAdvancesBy')}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate('/finance/advances')
              }}
            >
              {t('fin.advDash.backToAdvances')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              {t('fin.advDash.refresh')}
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
            {t('fin.advDash.totalOutstanding')}
          </p>
          <AmountDisplay amount={totalOutstanding} currency="IQD" size="md" colored />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.advDash.employeesHoldingAdvances')}
          </p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: theme.textSecondary }}>
            {employeeCount}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.advDash.openAdvances')}
          </p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: theme.textSecondary }}>
            {advanceCount}
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
          {t('fin.advDash.byEmployee')}
        </p>
        <Card padding="none">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr
                style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}
              >
                {[t('fin.advDash.employee'), t('fin.advDash.advances'), t('fin.advDash.issued'), t('fin.advDash.settled'), t('fin.advDash.returned'), t('fin.advDash.outstanding')].map(
                  (h, i) => (
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
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    {t('fin.advDash.loading')}
                  </td>
                </tr>
              )}
              {!loading && !data?.by_employee.length && (
                <tr>
                  <td
                    colSpan={6}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    {t('fin.advDash.noOutstandingAdvances')}
                  </td>
                </tr>
              )}
              {data?.by_employee.map((e) => (
                <tr key={e.employee_id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: theme.textPrimary }}>
                    {e.employee_name}
                  </td>
                  <td
                    style={{ padding: '9px 12px', textAlign: 'end', color: theme.textSecondary }}
                  >
                    {e.advance_count}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'end' }}>
                    <AmountDisplay amount={Number(e.total_issued)} currency="IQD" size="sm" />
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'end' }}>
                    <AmountDisplay amount={Number(e.total_settled)} currency="IQD" size="sm" />
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'end' }}>
                    <AmountDisplay amount={Number(e.total_returned)} currency="IQD" size="sm" />
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'end' }}>
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
          {t('fin.advDash.openAdvances')}
        </p>
        <Card padding="none">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr
                style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}
              >
                {[t('fin.advDash.ref'), t('fin.advDash.employee'), t('fin.advDash.amount'), t('fin.advDash.settled'), t('fin.advDash.returned'), t('fin.advDash.outstanding'), t('fin.advDash.status')].map(
                  (h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: '9px 12px',
                        textAlign: i >= 2 && i <= 5 ? 'right' : 'left',
                        color: theme.textMuted,
                        fontWeight: 500,
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    {t('fin.advDash.loading')}
                  </td>
                </tr>
              )}
              {!loading && !data?.advances.length && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    {t('fin.advDash.noOpenAdvances')}
                  </td>
                </tr>
              )}
              {data?.advances.map((a) => (
                <tr
                  key={a.id}
                  style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  onClick={() => {
                    navigate(`/finance/advances/${a.id}`)
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
                    {a.advance_number}
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: theme.textPrimary }}>
                    {a.employee_name}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'end' }}>
                    <AmountDisplay amount={Number(a.amount)} currency={a.currency_code} size="sm" />
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'end' }}>
                    <AmountDisplay
                      amount={Number(a.settled_amount)}
                      currency={a.currency_code}
                      size="sm"
                    />
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'end' }}>
                    <AmountDisplay
                      amount={Number(a.returned_amount)}
                      currency={a.currency_code}
                      size="sm"
                    />
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'end' }}>
                    <AmountDisplay
                      amount={Number(a.outstanding_amount)}
                      currency={a.currency_code}
                      size="sm"
                      colored
                    />
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <Badge variant={STATUS_BADGE[a.status] ?? 'neutral'}>
                      {a.status.replace(/_/g, ' ')}
                    </Badge>
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
