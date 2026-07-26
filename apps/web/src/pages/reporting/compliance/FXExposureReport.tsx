import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FX_EXPOSURE_QUERY } from '../../../graphql/reporting'

interface FXRow {
  currency: string
  openAR: number
  openAP: number
  netExposure: number
  fxRate: number
  iqdEquivalent: number
}

interface FXData {
  fxExposureReport: {
    rows: FXRow[]
    totalIQDExposure: number
  }
}

export default function FXExposureReport() {
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const [asOfDate, setAsOfDate] = useState(today)
  const [applied, setApplied] = useState(today)
  const [companyId] = useState('1')

  const { data, loading, refetch } = useQuery<FXData>(FX_EXPOSURE_QUERY, {
    variables: { asOfDate: applied, companyId },
  })

  const d = data?.fxExposureReport

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="FX Exposure Report"
        subtitle="Foreign currency open AR/AP positions"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refetch()
            }}
          >
            Refresh
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>As of Date</span>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => {
              setAsOfDate(e.target.value)
            }}
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.borderInput}`,
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              color: theme.textSecondary,
              fontFamily: 'inherit',
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setApplied(asOfDate)
            }}
          >
            Apply
          </Button>
          {d && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>Total IQD Exposure:</span>
              <AmountDisplay amount={d.totalIQDExposure} currency="IQD" size="md" colored />
            </div>
          )}
        </div>
      </Card>

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '40px', borderRadius: '6px', marginBottom: '8px' }}
              />
            ))}
          </div>
        ) : d?.rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {[
                    'Currency',
                    'Open AR',
                    'Open AP',
                    'Net Exposure',
                    'FX Rate',
                    'IQD Equivalent',
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 14px',
                        textAlign: i === 0 ? 'left' : 'right',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: `1px solid ${theme.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.tableRowHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <td
                      style={{
                        padding: '12px 14px',
                        color: theme.textPrimary,
                        fontWeight: 600,
                        fontSize: '14px',
                      }}
                    >
                      {row.currency}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.openAR} currency={row.currency} size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.openAP} currency={row.currency} size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 500 }}>
                      <AmountDisplay
                        amount={row.netExposure}
                        currency={row.currency}
                        size="sm"
                        colored
                      />
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        textAlign: 'right',
                        color: theme.textSecondary,
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: '12px',
                      }}
                    >
                      {row.fxRate.toFixed(4)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 500 }}>
                      <AmountDisplay amount={row.iqdEquivalent} currency="IQD" size="sm" colored />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No FX exposure data"
            message="Select a date and apply to load exposure report."
          />
        )}
      </Card>
    </div>
  )
}
