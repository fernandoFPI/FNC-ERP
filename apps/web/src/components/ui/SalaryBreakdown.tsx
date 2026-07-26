import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface SalaryBreakdownProps {
  basePay: number
  allowances?: { name: string; amount: number; currency: string }[]
  deductions?: { name: string; amount: number; type: string }[]
  overtimeMultiplier?: number
  currency: string
  payType?: 'monthly' | 'daily' | 'hourly'
}

export function SalaryBreakdown({
  basePay,
  allowances = [],
  deductions = [],
  overtimeMultiplier = 1.5,
  currency,
  payType = 'monthly',
}: SalaryBreakdownProps) {
  const { theme } = useTheme()

  const totalAllowances = allowances.reduce((s, a) => s + a.amount, 0)
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0)
  const gross = basePay + totalAllowances
  const net = gross - totalDeductions
  const total = gross || 1

  const baseWidth = (basePay / total) * 100
  const allowWidth = (totalAllowances / total) * 100
  const deductWidth = (totalDeductions / total) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Stacked bar */}
      <div
        style={{
          height: '10px',
          borderRadius: '6px',
          overflow: 'hidden',
          background: theme.border,
          display: 'flex',
        }}
      >
        <div
          style={{ width: `${baseWidth}%`, background: theme.accent, transition: 'width 0.3s' }}
        />
        <div
          style={{ width: `${allowWidth}%`, background: theme.success, transition: 'width 0.3s' }}
        />
        <div
          style={{
            width: `${deductWidth}%`,
            background: theme.danger,
            transition: 'width 0.3s',
            opacity: 0.8,
          }}
        />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {[
          { label: 'Base pay', color: theme.accent, value: basePay },
          ...(totalAllowances > 0
            ? [{ label: 'Allowances', color: theme.success, value: totalAllowances }]
            : []),
          ...(totalDeductions > 0
            ? [{ label: 'Deductions', color: theme.danger, value: -totalDeductions }]
            : []),
        ].map(({ label, color, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
            />
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>{label}</span>
            <span
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                color: value < 0 ? theme.danger : theme.textPrimary,
              }}
            >
              {value.toLocaleString()} {currency}
            </span>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        {[
          { label: 'Gross', value: gross, color: theme.textPrimary },
          { label: 'Deductions', value: totalDeductions, color: theme.danger },
          { label: 'Net pay', value: net, color: theme.accent },
        ].map(({ label, value, color }) => (
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
                fontSize: '15px',
                fontWeight: 700,
                fontFamily: 'monospace',
                color,
                marginTop: '4px',
              }}
            >
              {value.toLocaleString()}{' '}
              <span style={{ fontSize: '11px', fontWeight: 400, color: theme.textMuted }}>
                {currency}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Itemized lists */}
      {allowances.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '6px',
            }}
          >
            Allowances
          </div>
          {allowances.map((a, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                borderBottom: `1px solid ${theme.border}`,
                fontSize: '13px',
              }}
            >
              <span style={{ color: theme.textSecondary }}>{a.name}</span>
              <span style={{ fontFamily: 'monospace', color: theme.success }}>
                {a.amount.toLocaleString()} {a.currency}
              </span>
            </div>
          ))}
        </div>
      )}

      {deductions.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '6px',
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
                padding: '4px 0',
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
      )}

      <div style={{ fontSize: '11px', color: theme.textMuted }}>
        Pay type: <span style={{ color: theme.textSecondary }}>{payType}</span>
        {' · '}OT rate: <span style={{ color: theme.textSecondary }}>{overtimeMultiplier}×</span>
      </div>
    </div>
  )
}
