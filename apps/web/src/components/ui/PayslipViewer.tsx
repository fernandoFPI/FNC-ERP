import React from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../theme/ThemeContext'
import { PayrollSummaryCard } from './PayrollSummaryCard'
import { Button } from './Button'
import { PAYSLIP_QUERY } from '../../graphql/payroll'

interface PayslipViewerProps {
  payrollLineId: string
  employeeId: string
}

export function PayslipViewer({ payrollLineId }: PayslipViewerProps) {
  const { theme } = useTheme()

  const { data, loading } = useQuery(PAYSLIP_QUERY, {
    variables: { id: payrollLineId },
    skip: !payrollLineId,
  })

  const line = data?.payslip

  if (loading || !line) {
    return (
      <div style={{ padding: '24px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height: '16px',
              borderRadius: '4px',
              marginBottom: '12px',
              width: `${50 + ((i * 8) % 40)}%`,
            }}
          />
        ))}
      </div>
    )
  }

  const currency: string = line.currency_code ?? 'IQD'
  const grossPay: number = parseFloat(line.gross_salary ?? '0')
  const totalDeductions: number =
    parseFloat(line.income_tax ?? '0') +
    parseFloat(line.social_security ?? '0') +
    parseFloat(line.other_deductions ?? '0')
  const netPay: number = parseFloat(line.net_salary ?? '0')

  const earnings = [
    { name: 'Base salary', amount: parseFloat(line.base_salary ?? '0') },
    line.housing_allowance && parseFloat(line.housing_allowance) > 0
      ? { name: 'Housing allowance', amount: parseFloat(line.housing_allowance) }
      : null,
    line.transport_allowance && parseFloat(line.transport_allowance) > 0
      ? { name: 'Transport allowance', amount: parseFloat(line.transport_allowance) }
      : null,
    line.other_allowances && parseFloat(line.other_allowances) > 0
      ? { name: 'Other allowances', amount: parseFloat(line.other_allowances) }
      : null,
    line.overtime_pay && parseFloat(line.overtime_pay) > 0
      ? { name: `Overtime (${line.overtime_hours}h)`, amount: parseFloat(line.overtime_pay) }
      : null,
  ].filter(Boolean) as { name: string; amount: number }[]

  const deductions = [
    line.income_tax && parseFloat(line.income_tax) > 0
      ? { name: 'Income tax', amount: parseFloat(line.income_tax) }
      : null,
    line.social_security && parseFloat(line.social_security) > 0
      ? { name: 'Social security', amount: parseFloat(line.social_security) }
      : null,
    line.other_deductions && parseFloat(line.other_deductions) > 0
      ? { name: 'Other deductions', amount: parseFloat(line.other_deductions) }
      : null,
  ].filter(Boolean) as { name: string; amount: number }[]

  return (
    <div style={{ padding: '0', fontFamily: 'inherit' }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: theme.textPrimary }}>
            {line.employee_name ?? '—'}
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            {line.employee_number ?? ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>Working days</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            {line.working_days ?? '—'}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Attendance summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { label: 'Days present', value: line.working_days ?? '—' },
            { label: 'Days absent', value: line.absent_days ?? '—' },
            { label: 'Leave days', value: line.leave_days ?? '—' },
            {
              label: 'OT hours',
              value: line.overtime_hours ? `${parseFloat(line.overtime_hours).toFixed(1)}h` : '—',
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  color: theme.textPrimary,
                  marginTop: '4px',
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Earnings and deductions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
              }}
            >
              Earnings
            </div>
            {earnings.map((e, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: `1px solid ${theme.border}`,
                  fontSize: '13px',
                }}
              >
                <span style={{ color: theme.textSecondary }}>{e.name}</span>
                <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>
                  {e.amount.toLocaleString()} {currency}
                </span>
              </div>
            ))}
          </div>
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
              }}
            >
              Deductions
            </div>
            {deductions.map((d, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: `1px solid ${theme.border}`,
                  fontSize: '13px',
                }}
              >
                <span style={{ color: theme.textSecondary }}>{d.name}</span>
                <span style={{ fontFamily: 'monospace', color: theme.danger }}>
                  -{d.amount.toLocaleString()} {currency}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <PayrollSummaryCard
            label="Gross pay"
            amount={grossPay}
            currency={currency}
            variant="highlight"
          />
          <PayrollSummaryCard
            label="Total deductions"
            amount={totalDeductions}
            currency={currency}
            variant="deduction"
          />
          <PayrollSummaryCard label="Net pay" amount={netPay} currency={currency} variant="net" />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              window.print()
            }}
          >
            Print
          </Button>
        </div>
      </div>
    </div>
  )
}
