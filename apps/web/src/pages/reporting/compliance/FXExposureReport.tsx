import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
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
  const { t } = useTranslation()
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const [asOfDate, setAsOfDate] = useState(today)
  const [applied, setApplied] = useState(today)

  const { data, loading, refetch } = useQuery<FXData>(FX_EXPOSURE_QUERY, {
    variables: { asOfDate: applied },
  })

  const d = data?.fxExposureReport

  const columns: Column<FXRow>[] = [
    {
      key: 'currency',
      header: t('rep.fxExposure.currency'),
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.textPrimary, fontWeight: 600, fontSize: '14px' }}>
          {row.currency}
        </span>
      ),
    },
    {
      key: 'openAR',
      header: t('rep.fxExposure.openAr'),
      mobilePriority: 3,
      render: (row) => <AmountDisplay amount={row.openAR} currency={row.currency} size="sm" />,
    },
    {
      key: 'openAP',
      header: t('rep.fxExposure.openAp'),
      mobilePriority: 4,
      render: (row) => <AmountDisplay amount={row.openAP} currency={row.currency} size="sm" />,
    },
    {
      key: 'netExposure',
      header: t('rep.fxExposure.netExposure'),
      mobilePriority: 1,
      render: (row) => (
        <AmountDisplay amount={row.netExposure} currency={row.currency} size="sm" colored />
      ),
    },
    {
      key: 'fxRate',
      header: t('rep.fxExposure.fxRate'),
      mobilePriority: 5,
      render: (row) => (
        <span
          style={{
            color: theme.textSecondary,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
          }}
        >
          {row.fxRate.toFixed(4)}
        </span>
      ),
    },
    {
      key: 'iqdEquivalent',
      header: t('rep.fxExposure.iqdEquivalent'),
      mobilePriority: 2,
      render: (row) => (
        <AmountDisplay amount={row.iqdEquivalent} currency="IQD" size="sm" colored />
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('rep.fxExposure.fxExposureReport')}
        subtitle={t('rep.fxExposure.foreignCurrencyOpenArApPositions')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            {t('rep.fxExposure.refresh')}
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>{t('rep.fxExposure.asOfDate')}</span>
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
            {t('rep.fxExposure.apply')}
          </Button>
          {d && (
            <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>{t('rep.fxExposure.totalIqdExposure')}</span>
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
          <Table columns={columns} data={d.rows} rowKey="currency" />
        ) : (
          <EmptyState
            title={t('rep.fxExposure.noFxExposureData')}
            message={t('rep.fxExposure.selectADateAndApplyTo')}
          />
        )}
      </Card>
    </div>
  )
}
