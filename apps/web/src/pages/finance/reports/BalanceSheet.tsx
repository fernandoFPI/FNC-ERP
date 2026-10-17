import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { BALANCE_SHEET_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Badge } from '../../../components/ui/Badge'
import { TabBar } from '../../../components/ui/TabBar'
import type { BalanceSheetQuery, BalanceSheetQueryVariables } from '../../../graphql/generated'

interface BSLine {
  account_id: string
  code: string
  name: string
  currency_code: string
  amount: string
}

export default function BalanceSheet() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [queried, setQueried] = useState(false)
  const [currency, setCurrency] = useState<string | null>(null)

  const { data, loading, refetch } = useQuery<BalanceSheetQuery, BalanceSheetQueryVariables>(BALANCE_SHEET_QUERY, {
    variables: { asOfDate },
    skip: !queried,
    fetchPolicy: 'network-only',
  })

  const report = data?.balanceSheet
  // Never blended across currencies (no currency exchange anywhere) — a
  // selector picks which currency's figures are shown. isBalanced is
  // already checked per currency by the resolver.
  const currencies = report
    ? [...new Set([...report.assets, ...report.liabilities, ...report.equity].map((l) => l.currency_code))].sort()
    : []
  const activeCurrency = currency ?? currencies[0] ?? 'IQD'
  const assets = (report?.assets ?? []).filter((l) => l.currency_code === activeCurrency)
  const liabilities = (report?.liabilities ?? []).filter((l) => l.currency_code === activeCurrency)
  const equity = (report?.equity ?? []).filter((l) => l.currency_code === activeCurrency)
  const totalAssetsForCurrency = parseFloat(
    report?.totalAssets.find((c) => c.currency_code === activeCurrency)?.amount ?? '0',
  )
  const totalLiabilitiesForCurrency = parseFloat(
    report?.totalLiabilities.find((c) => c.currency_code === activeCurrency)?.amount ?? '0',
  )
  const totalEquityForCurrency = parseFloat(
    report?.totalEquity.find((c) => c.currency_code === activeCurrency)?.amount ?? '0',
  )
  const retainedEarningsForCurrency = parseFloat(
    report?.retainedEarnings.find((c) => c.currency_code === activeCurrency)?.amount ?? '0',
  )

  function run() {
    if (queried) void refetch()
    else setQueried(true)
  }

  function Section({ title, lines, color }: { title: string; lines: BSLine[]; color: string }) {
    const total = lines.reduce((s, l) => s + parseFloat(l.amount || '0'), 0)
    return (
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            fontWeight: 600,
            color: theme.textPrimary,
            fontSize: '14px',
            marginBottom: '8px',
            borderBottom: `2px solid ${color}`,
            paddingBottom: '6px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{title}</span>
          <span style={{ fontFamily: 'monospace', color }}>{total.toLocaleString()}</span>
        </div>
        {lines.map((l) => (
          <div
            key={l.account_id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: 'monospace',
                  color: theme.textMuted,
                  fontSize: '12px',
                  marginInlineEnd: '8px',
                }}
              >
                {l.code}
              </span>
              <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{l.name}</span>
            </div>
            <span style={{ fontFamily: 'monospace', color: theme.textPrimary, fontSize: '13px' }}>
              {parseFloat(l.amount).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader title={t('fin.bs.balanceSheet')} subtitle={t('fin.bs.financialPosition')} />

      <Card style={{ marginTop: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', padding: '16px', alignItems: 'flex-end' }}>
          <Input
            label={t('fin.bs.asOfDate')}
            type="date"
            value={asOfDate}
            onChange={(e) => {
              setAsOfDate(e.target.value)
            }}
          />
          <Button variant="primary" onClick={run} loading={loading}>
            {t('fin.bs.runReport')}
          </Button>
        </div>
      </Card>

      {currencies.length > 1 && (
        <Card style={{ marginBottom: '16px' }}>
          <TabBar
            tabs={currencies.map((c) => ({ key: c, label: c }))}
            active={activeCurrency}
            onChange={setCurrency}
          />
        </Card>
      )}

      {report && (
        <>
          {/* Balanced indicator */}
          <div style={{ marginBottom: '12px' }}>
            <Badge variant={report.isBalanced ? 'success' : 'danger'}>
              {report.isBalanced ? t('fin.bs.balanced') : t('fin.bs.unbalancedCheckForErrors')}
            </Badge>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Card style={{ padding: '24px' }}>
              <Section title={t('fin.bs.assets')} lines={assets} color={theme.success} />
              <div
                style={{
                  borderTop: `2px solid ${theme.border}`,
                  paddingTop: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                }}
              >
                <span style={{ color: theme.textPrimary }}>{t('fin.bs.totalAssets')}</span>
                <span style={{ fontFamily: 'monospace', color: theme.success }}>
                  {totalAssetsForCurrency.toLocaleString()}
                </span>
              </div>
            </Card>

            <div>
              <Card style={{ padding: '24px', marginBottom: '16px' }}>
                <Section title={t('fin.bs.liabilities')} lines={liabilities} color={theme.danger} />
                <div
                  style={{
                    borderTop: `2px solid ${theme.border}`,
                    paddingTop: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: theme.textPrimary }}>{t('fin.bs.totalLiabilities')}</span>
                  <span style={{ fontFamily: 'monospace', color: theme.danger }}>
                    {totalLiabilitiesForCurrency.toLocaleString()}
                  </span>
                </div>
              </Card>

              <Card style={{ padding: '24px' }}>
                <Section title={t('fin.bs.equity')} lines={equity} color={theme.accent} />
                {/* Retained earnings = net P&L not yet closed to an equity account */}
                {retainedEarningsForCurrency !== 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          color: theme.textMuted,
                          fontSize: '12px',
                          marginInlineEnd: '8px',
                        }}
                      >
                        —
                      </span>
                      <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
                        {t('fin.bs.retainedEarningsCurrentPeriod')}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        color: retainedEarningsForCurrency >= 0 ? theme.success : theme.danger,
                        fontSize: '13px',
                      }}
                    >
                      {retainedEarningsForCurrency.toLocaleString()}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    borderTop: `2px solid ${theme.border}`,
                    paddingTop: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: theme.textPrimary }}>{t('fin.bs.totalEquity')}</span>
                  <span style={{ fontFamily: 'monospace', color: theme.accent }}>
                    {totalEquityForCurrency.toLocaleString()}
                  </span>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
