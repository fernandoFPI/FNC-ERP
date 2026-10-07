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
  created_at: string
  approved_at: string | null
}

interface EmployeeRollup {
  employee_id: string
  employee_name: string
  currency_code: string
  claim_count: number
  total_amount: number
}

interface Dashboard {
  claims: DashboardClaim[]
  by_employee: EmployeeRollup[]
}

// Groups rows that may be split per-currency (either every claim for the
// overall KPI, or one employee's per-currency rollup rows) into one
// subtotal per currency actually present — no conversion, so adding a USD
// figure onto an IQD one would be meaningless. IQD first, rest alphabetical,
// matching the same convention already used on the Journal Entries page.
function sumByCurrency<T extends { currency_code: string; total_amount: number }>(
  rows: T[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    out[r.currency_code] = (out[r.currency_code] ?? 0) + Number(r.total_amount)
  }
  return out
}

function sortedCurrencies(amounts: Record<string, number>): string[] {
  return Object.keys(amounts).sort((a, b) => (a === 'IQD' ? -1 : b === 'IQD' ? 1 : a.localeCompare(b)))
}

interface EmployeeRow {
  employee_id: string
  employee_name: string
  claim_count: number
  amounts: Record<string, number>
}

const STATUS_BADGE: Record<string, { variant: 'neutral' | 'info' | 'success' | 'danger' | 'warning'; label: string }> = {
  draft: { variant: 'neutral', label: 'Draft' },
  submitted: { variant: 'info', label: 'Pending approval' },
  approved: { variant: 'warning', label: 'Awaiting funding decision' },
  posted: { variant: 'warning', label: 'Awaiting payment' },
  paid: { variant: 'success', label: 'Paid' },
  rejected: { variant: 'danger', label: 'Rejected' },
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

  const totalByCurrency = sumByCurrency(data?.claims ?? [])
  const totalCurrencies = sortedCurrencies(totalByCurrency)
  const employeeCount = new Set((data?.by_employee ?? []).map((e) => e.employee_id)).size
  const claimCount = data?.claims.length ?? 0

  // Re-groups the (possibly per-currency-split) by_employee rows from the
  // backend into one visual row per employee, each with its own per-currency
  // amount breakdown — the claim count is a real total across currencies,
  // the amount deliberately isn't collapsed into one.
  const employeeRows: EmployeeRow[] = []
  for (const e of data?.by_employee ?? []) {
    let row = employeeRows.find((r) => r.employee_id === e.employee_id)
    if (!row) {
      row = { employee_id: e.employee_id, employee_name: e.employee_name, claim_count: 0, amounts: {} }
      employeeRows.push(row)
    }
    row.claim_count += e.claim_count
    row.amounts[e.currency_code] = (row.amounts[e.currency_code] ?? 0) + Number(e.total_amount)
  }
  employeeRows.sort((a, b) => {
    const totalA = Object.values(a.amounts).reduce((s, v) => s + v, 0)
    const totalB = Object.values(b.amounts).reduce((s, v) => s + v, 0)
    return totalB - totalA
  })

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Expense Claims Dashboard"
        subtitle="Every expense claim, by employee"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate('/procurement/requisitions')
              }}
            >
              ← Back to Requisitions
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
            Total Claimed
          </p>
          {totalCurrencies.length === 0 ? (
            <AmountDisplay amount={0} currency="IQD" size="md" colored />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {totalCurrencies.map((currency) => (
                <AmountDisplay
                  key={currency}
                  amount={totalByCurrency[currency] ?? 0}
                  currency={currency}
                  size="md"
                  colored
                />
              ))}
            </div>
          )}
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Employees
          </p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: theme.textSecondary }}>
            {employeeCount}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Total Claims
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
                {['Employee', 'Claims', 'Total Amount'].map((h, i) => (
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
              {!loading && !employeeRows.length && (
                <tr>
                  <td
                    colSpan={3}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    No claims yet.
                  </td>
                </tr>
              )}
              {employeeRows.map((e) => (
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
                      {sortedCurrencies(e.amounts).map((currency) => (
                        <AmountDisplay
                          key={currency}
                          amount={e.amounts[currency] ?? 0}
                          currency={currency}
                          size="sm"
                          colored
                        />
                      ))}
                    </div>
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
          All Claims
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
                    No claims yet.
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
                    <Badge variant={STATUS_BADGE[c.status]?.variant ?? 'neutral'}>
                      {STATUS_BADGE[c.status]?.label ?? c.status}
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
