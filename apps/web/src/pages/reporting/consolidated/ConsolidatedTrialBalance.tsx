import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Grid } from '../../../components/ui/Grid'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { TabBar } from '../../../components/ui/TabBar'
import { CONSOLIDATED_TB_QUERY } from '../../../graphql/reporting'

interface TBRow {
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

interface TBData {
  consolidatedTrialBalance: {
    rows: TBRow[]
    companies: Company[]
    currency: string
    availableCurrencies: string[]
    totalDebits: number
    totalCredits: number
    isBalanced: boolean
  }
}

export default function ConsolidatedTrialBalance() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const [asOfDate, setAsOfDate] = useState(today)
  const [applied, setApplied] = useState(today)
  const [currencyCode, setCurrencyCode] = useState<string | undefined>(undefined)

  const { data, loading, refetch } = useQuery<TBData>(CONSOLIDATED_TB_QUERY, {
    variables: { asOfDate: applied, currencyCode },
  })

  const d = data?.consolidatedTrialBalance

  function handleApply() {
    setApplied(asOfDate)
  }

  const companyColumns: Column<TBRow>[] = (d?.companies ?? []).map((c, ci) => ({
    key: `company_${c.id}`,
    header: c.name,
    mobilePriority: 3 + ci,
    render: (row) => (
      <AmountDisplay amount={row.companies[c.id] ?? 0} currency={d?.currency ?? t('rep.consTb.iqd')} size="sm" />
    ),
  }))

  const columns: Column<TBRow>[] = [
    {
      key: 'accountName',
      header: t('rep.consTb.account'),
      mobilePrimary: true,
      render: (row) => row.accountName,
    },
    {
      key: 'accountCode',
      header: t('rep.consTb.code'),
      mobileSecondary: true,
      render: (row) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{row.accountCode}</span>
      ),
    },
    {
      key: 'accountType',
      header: t('rep.consTb.type'),
      mobilePriority: 2,
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {enumLabel(row.accountType)}
        </Badge>
      ),
    },
    ...companyColumns,
    {
      key: 'consolidated',
      header: t('rep.consTb.consolidated'),
      mobilePriority: 1,
      render: (row) => (
        <span style={{ fontWeight: 500 }}>
          <AmountDisplay
            amount={row.consolidated}
            currency={d?.currency ?? t('rep.consTb.iqd')}
            size="sm"
            colored
          />
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('rep.consTb.consolidatedTrialBalance')}
        subtitle={t('rep.consTb.groupWideDebitCreditBalances')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            {t('rep.consTb.refresh')}
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
            <span style={{ fontSize: '12px', color: theme.textMuted }}>{t('rep.consTb.asOfDate')}</span>
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
          </div>
          <Button variant="primary" size="sm" onClick={handleApply}>
            {t('rep.consTb.apply')}
          </Button>
          {d && (
            <div style={{ marginInlineStart: 'auto' }}>
              <Badge variant={d.isBalanced ? 'success' : 'danger'}>
                {d.isBalanced ? t('rep.consTb.balanced') : t('rep.consTb.outOfBalance')}
              </Badge>
            </div>
          )}
        </div>
      </Card>

      {/* Summary */}
      {d && (
        <Grid cols={2} tabletCols={2} phoneCols={1} gap={12} style={{ marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.consTb.totalDebits')}
            </p>
            <AmountDisplay amount={d.totalDebits} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.consTb.totalCredits')}
            </p>
            <AmountDisplay amount={d.totalCredits} currency={d.currency} size="md" />
          </Card>
        </Grid>
      )}

      {/* TB Table */}
      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '36px', borderRadius: '6px', marginBottom: '6px' }}
              />
            ))}
          </div>
        ) : d?.rows.length ? (
          <Table columns={columns} data={d.rows} />
        ) : (
          <EmptyState title={t('rep.consTb.noData')} message={t('rep.consTb.selectADateAndApplyTo')} />
        )}
      </Card>
    </div>
  )
}
