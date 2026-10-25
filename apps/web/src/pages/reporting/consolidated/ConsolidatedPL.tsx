import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { ConsolidatedFinancialTable } from '../../../components/ui/ConsolidatedFinancialTable'
import { TabBar } from '../../../components/ui/TabBar'
import { CONSOLIDATED_PL_QUERY } from '../../../graphql/reporting'

interface PLRow {
  accountType: string
  accountCode: string
  accountName: string
  companies: Record<string, number>
  consolidated: number
  eliminated: number
}

interface Company {
  id: string
  name: string
}

interface PLData {
  consolidatedPL: {
    rows: PLRow[]
    companies: Company[]
    currency: string
    availableCurrencies: string[]
    totalRevenue: number
    totalExpenses: number
    netProfit: number
  }
}

export default function ConsolidatedPL() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const todayStr = today.toISOString().slice(0, 10)

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(todayStr)
  const [showEliminations, setShowEliminations] = useState(false)
  const [showPriorPeriod, setShowPriorPeriod] = useState(false)
  const [currencyCode, setCurrencyCode] = useState<string | undefined>(undefined)
  const [applied, setApplied] = useState({
    fromDate: firstOfMonth,
    toDate: todayStr,
    showEliminations: false,
  })

  // Compute prior period dates (same duration, one period earlier)
  const priorFromDate = (() => {
    const d = new Date(applied.fromDate)
    const span = new Date(applied.toDate).getTime() - d.getTime()
    const prior = new Date(d.getTime() - span - 86400000)
    return prior.toISOString().slice(0, 10)
  })()
  const priorToDate = (() => {
    const d = new Date(applied.fromDate)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const { data, loading, refetch } = useQuery<PLData>(CONSOLIDATED_PL_QUERY, {
    variables: {
      fromDate: applied.fromDate,
      toDate: applied.toDate,
      showEliminations: applied.showEliminations,
      currencyCode,
    },
  })

  const { data: priorDataRaw, loading: priorLoading } = useQuery<PLData>(CONSOLIDATED_PL_QUERY, {
    variables: {
      fromDate: priorFromDate,
      toDate: priorToDate,
      showEliminations: applied.showEliminations,
      currencyCode,
    },
    skip: !showPriorPeriod,
  })

  const d = data?.consolidatedPL
  const prior = priorDataRaw?.consolidatedPL

  function handleApply() {
    setApplied({ fromDate, toDate, showEliminations })
  }

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.borderInput}`,
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '12px',
    color: theme.textSecondary,
    fontFamily: 'inherit',
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('rep.consPl.consolidatedPL')}
        subtitle={t('rep.consPl.groupProfitLossStatement')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            {t('rep.consPl.refresh')}
          </Button>
        }
      />

      {(d?.availableCurrencies.length ?? 0) > 1 && (
        <Card padding="none" style={{ marginBottom: '16px' }}>
          <TabBar
            tabs={d!.availableCurrencies.map((c) => ({ key: c, label: c }))}
            active={d!.currency}
            onChange={setCurrencyCode}
          />
        </Card>
      )}

      {/* Filter Panel */}
      <Card padding="sm" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>{t('rep.consPl.from')}</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value)
              }}
              style={inputStyle}
            />
            <span style={{ fontSize: '12px', color: theme.textMuted }}>{t('rep.consPl.to')}</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value)
              }}
              style={inputStyle}
            />
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: theme.textSecondary,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={showEliminations}
              onChange={(e) => {
                setShowEliminations(e.target.checked)
              }}
            />
            {t('rep.consPl.showEliminations')}
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: theme.textSecondary,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={showPriorPeriod}
              onChange={(e) => {
                setShowPriorPeriod(e.target.checked)
              }}
            />
            {t('rep.consPl.comparePriorPeriod')}
          </label>
          <Button variant="primary" size="sm" onClick={handleApply}>
            {t('rep.consPl.apply')}
          </Button>
          {d && (
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: '16px' }}>
              <div style={{ textAlign: 'end' }}>
                <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>
                  {t('rep.consPl.netProfit')}
                </p>
                <Badge variant={d.netProfit >= 0 ? 'success' : 'danger'}>
                  <AmountDisplay amount={d.netProfit} currency={d.currency} size="sm" />
                </Badge>
              </div>
            </div>
          )}
        </div>
        {showPriorPeriod && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>{t('rep.consPl.priorPeriod', { priorFromDate, priorToDate })}</div>
        )}
      </Card>

      {/* Summary KPIs */}
      {d && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.consPl.totalRevenue')}
            </p>
            <AmountDisplay amount={d.totalRevenue} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.consPl.totalExpenses')}
            </p>
            <AmountDisplay amount={d.totalExpenses} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.consPl.netProfit')}
            </p>
            <AmountDisplay amount={d.netProfit} currency={d.currency} size="md" colored />
          </Card>
        </div>
      )}

      {/* Financial Table */}
      <Card padding="none">
        <ConsolidatedFinancialTable
          data={d?.rows ?? []}
          companies={d?.companies ?? []}
          currency={d?.currency ?? t('rep.consPl.iqd')}
          showEliminations={applied.showEliminations}
          loading={loading || (showPriorPeriod && priorLoading)}
          priorData={showPriorPeriod ? prior?.rows : undefined}
        />
      </Card>
    </div>
  )
}
