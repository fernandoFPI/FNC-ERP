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
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { TabBar } from '../../../components/ui/TabBar'
import { CONSOLIDATED_BS_QUERY } from '../../../graphql/reporting'

interface BSRow {
  accountType: string
  accountCode: string
  accountName: string
  companies: Record<string, number>
  consolidated: number
  eliminated: number
}

interface BSFlatRow extends BSRow {
  sectionLabel: string
}

interface Company {
  id: string
  name: string
}

interface BSData {
  consolidatedBS: {
    rows: BSRow[]
    companies: Company[]
    currency: string
    availableCurrencies: string[]
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
    isBalanced: boolean
  }
}

export default function ConsolidatedBS() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const [asOfDate, setAsOfDate] = useState(today)
  const [showEliminations, setShowEliminations] = useState(false)
  const [currencyCode, setCurrencyCode] = useState<string | undefined>(undefined)
  const [applied, setApplied] = useState({ asOfDate: today, showEliminations: false })

  const { data, loading, refetch } = useQuery<BSData>(CONSOLIDATED_BS_QUERY, {
    variables: { asOfDate: applied.asOfDate, showEliminations: applied.showEliminations, currencyCode },
  })

  const d = data?.consolidatedBS

  function handleApply() {
    setApplied({ asOfDate, showEliminations })
  }

  const rowsByType =
    d?.rows.reduce<Record<string, BSRow[]>>((acc, row) => {
      const acctType = row.accountType
      if (!acc[acctType]) acc[acctType] = []
      acc[acctType].push(row)
      return acc
    }, {}) ?? {}

  const sectionOrder = [
    'current_assets',
    'non_current_assets',
    'current_liabilities',
    'non_current_liabilities',
    'equity',
  ]

  const sections =
    sectionOrder.filter((s) => rowsByType[s]).length > 0
      ? sectionOrder.filter((s) => rowsByType[s])
      : Object.keys(rowsByType)

  const flatRows: BSFlatRow[] = sections.flatMap((section) =>
    (rowsByType[section] ?? []).map((row) => ({
      ...row,
      sectionLabel: enumLabel(section).replace(/_/g, ' '),
    })),
  )

  const companyColumns: Column<BSFlatRow>[] = (d?.companies ?? []).map((c, ci) => ({
    key: `company_${c.id}`,
    header: c.name,
    mobilePriority: 1 + ci,
    render: (row) => (
      <AmountDisplay amount={row.companies[c.id] ?? 0} currency={d?.currency ?? t('rep.consBs.iqd')} size="sm" />
    ),
  }))

  const columns: Column<BSFlatRow>[] = [
    {
      key: 'account',
      header: t('rep.consBs.account'),
      mobilePrimary: true,
      render: (row) => (
        <>
          <span style={{ fontSize: '11px', color: theme.textMuted, marginInlineEnd: '8px' }}>
            {row.accountCode}
          </span>
          {row.accountName}
        </>
      ),
    },
    ...companyColumns,
    ...(showEliminations
      ? [
          {
            key: 'eliminated',
            header: t('rep.consBs.elim'),
            mobileLabel: t('rep.consBs.elim'),
            mobilePriority: 1 + companyColumns.length,
            render: (row: BSFlatRow) => (
              <span style={{ color: theme.warning }}>
                <AmountDisplay amount={row.eliminated} currency={d?.currency ?? t('rep.consBs.iqd')} size="sm" />
              </span>
            ),
          } as Column<BSFlatRow>,
        ]
      : []),
    {
      key: 'consolidated',
      header: t('rep.consBs.consolidated'),
      mobilePriority: 0,
      render: (row) => (
        <span style={{ fontWeight: 500 }}>
          <AmountDisplay amount={row.consolidated} currency={d?.currency ?? t('rep.consBs.iqd')} size="sm" />
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('rep.consBs.consolidatedBalanceSheet')}
        subtitle={t('rep.consBs.groupAssetsLiabilitiesEquity')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            {t('rep.consBs.refresh')}
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
            <span style={{ fontSize: '12px', color: theme.textMuted }}>{t('rep.consBs.asOfDate')}</span>
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
            {t('rep.consBs.showEliminations')}
          </label>
          <Button variant="primary" size="sm" onClick={handleApply}>
            {t('rep.consBs.apply')}
          </Button>
          {d && (
            <div style={{ marginInlineStart: 'auto' }}>
              <Badge variant={d.isBalanced ? 'success' : 'danger'}>
                {d.isBalanced ? t('rep.consBs.balanced') : t('rep.consBs.imbalanced')}
              </Badge>
            </div>
          )}
        </div>
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
              {t('rep.consBs.totalAssets')}
            </p>
            <AmountDisplay amount={d.totalAssets} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.consBs.totalLiabilities')}
            </p>
            <AmountDisplay amount={d.totalLiabilities} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.consBs.totalEquity')}
            </p>
            <AmountDisplay amount={d.totalEquity} currency={d.currency} size="md" colored />
          </Card>
        </div>
      )}

      {/* Balance Sheet Table */}
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
        ) : flatRows.length ? (
          <Table
            columns={columns}
            data={flatRows}
            getSectionHeader={(row, i) =>
              i === 0 || row.sectionLabel !== flatRows[i - 1].sectionLabel ? row.sectionLabel : null
            }
          />
        ) : (
          <EmptyState
            title={t('rep.consBs.noData')}
            message={t('rep.consBs.selectADateAndApplyTo')}
          />
        )}
      </Card>
    </div>
  )
}
