import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { STOCK_LOCATIONS_QUERY, STORE_DOCUMENTS_QUERY } from '../../../graphql/inventory'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Table } from '../../../components/ui/Table'
import type { Column } from '../../../components/ui/Table'
import { ActionButton } from '../../../components/ui/ActionButton'
import {
  EmptyState,
  FilterChips,
  PageTitle,
  PillSelect,
  SearchBox,
} from '../../../components/procurement/ListKit'
import { enumLabel } from '../../../i18n'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { useTheme } from '../../../theme/ThemeContext'
import type {
  StockLocationsQuery,
  StockLocationsQueryVariables,
  StoreDocumentsQuery,
  StoreDocumentsQueryVariables,
} from '../../../graphql/generated'

type Doc = StoreDocumentsQuery['storeDocuments'][number]

// the most one request returns (lib/storeDocuments.ts STORE_DOCUMENTS_LIMIT): the page only says when the list was cut
const SERVER_LIMIT = 500

const TYPE_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  store_in: 'success',
  store_out: 'warning',
  transfer: 'info',
  return: 'neutral',
}
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  confirmed: 'success',
  issued: 'success',
  received: 'success',
  done: 'success',
  draft: 'warning',
  received_short: 'warning',
  in_transit: 'info',
  cancelled: 'neutral',
  reversed: 'danger',
}

/** Where a click on a document goes: its own page when it has one, else the page that works with that kind of document. */
function destinationOf(d: Doc): string {
  switch (d.docType) {
    case 'store_in':
      return `/inventory/store-in/${d.id}`
    case 'store_out':
      return `/inventory/store-out/${d.id}`
    case 'transfer':
      // the Temp Store page opens this transfer's details straight away
      return `/inventory/temp-store?transfer=${d.id}`
    default:
      return '/inventory/returnables'
  }
}

export default function StoreHistoryPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const navigate = useNavigate()
  const [type, setType] = useState('')
  const [storeId, setStoreId] = useState('')
  const [search, setSearch] = useState('')

  const { data, loading, error } = useQuery<StoreDocumentsQuery, StoreDocumentsQueryVariables>(
    STORE_DOCUMENTS_QUERY,
    {
      variables: {
        type: type || undefined,
        locationId: storeId || undefined,
        search: search.trim() || undefined,
      },
      fetchPolicy: 'cache-and-network',
    },
  )
  const { data: locationsData } = useQuery<StockLocationsQuery, StockLocationsQueryVariables>(
    STOCK_LOCATIONS_QUERY,
    {
      variables: { isActive: true },
    },
  )

  const docs = data?.storeDocuments ?? []
  const typeOptions = [
    { value: 'store_in', label: t('inv.history.typeStoreIn') },
    { value: 'store_out', label: t('inv.history.typeStoreOut') },
    { value: 'transfer', label: t('inv.history.typeTransfer') },
    { value: 'return', label: t('inv.history.typeReturn') },
  ]
  const storeOptions = useMemo(
    () =>
      (locationsData?.stockLocations ?? [])
        .filter((l) => l.type !== 'virtual_in' && l.type !== 'virtual_out')
        .map((l) => ({ value: l.id, label: l.name })),
    [locationsData, t],
  )
  const typeLabel = (v: string) => typeOptions.find((o) => o.value === v)?.label ?? v
  const statusLabel = (s: string) => t(`inv.history.status.${s}`, { defaultValue: enumLabel(s) })

  const columns: Column<Doc>[] = [
    {
      key: 'number',
      header: t('inv.history.colNumber'),
      width: '140px',
      render: (d) => (
        <span
          style={{ fontWeight: 600, color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}
        >
          {d.number}
        </span>
      ),
    },
    {
      key: 'docType',
      header: t('inv.history.colType'),
      width: '160px',
      render: (d) => (
        <Badge variant={TYPE_VARIANT[d.docType] ?? 'neutral'}>{typeLabel(d.docType)}</Badge>
      ),
    },
    {
      key: 'date',
      header: t('inv.history.colDate'),
      width: '110px',
      render: (d) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{d.date}</span>,
    },
    {
      key: 'storeName',
      header: t('inv.history.colStore'),
      render: (d) => <span style={{ color: theme.textSecondary }}>{d.storeName ?? '—'}</span>,
    },
    {
      key: 'party',
      header: t('inv.history.colParty'),
      render: (d) => (
        <div>
          <div style={{ color: theme.textPrimary }}>{d.party ?? '—'}</div>
          {d.reference && (
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>{d.reference}</div>
          )}
        </div>
      ),
    },
    {
      key: 'lineCount',
      header: t('inv.history.colLines'),
      width: '80px',
      render: (d) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{d.lineCount}</span>,
    },
    {
      key: 'status',
      header: t('inv.history.colStatus'),
      width: '150px',
      render: (d) => (
        <Badge variant={STATUS_VARIANT[d.status] ?? 'neutral'}>{statusLabel(d.status)}</Badge>
      ),
    },
  ]

  const chips = [
    ...(type !== ''
      ? [
          {
            key: 'type',
            label: t('inv.history.filterType'),
            value: typeLabel(type),
            onRemove: () => {
              setType('')
            },
          },
        ]
      : []),
    ...(storeId !== ''
      ? [
          {
            key: 'store',
            label: t('inv.history.filterStore'),
            value: storeOptions.find((o) => o.value === storeId)?.label,
            onRemove: () => {
              setStoreId('')
            },
          },
        ]
      : []),
    ...(search.trim() !== ''
      ? [
          {
            key: 'search',
            label: t('inv.history.searchLabel'),
            value: search.trim(),
            onRemove: () => {
              setSearch('')
            },
          },
        ]
      : []),
  ]
  const clearAll = () => {
    setType('')
    setStoreId('')
    setSearch('')
  }
  const showEmpty = !loading && !error && docs.length === 0

  return (
    <div
      style={{ padding: isPhone ? '12px 16px 24px' : '24px', margin: '0 auto', maxWidth: '2400px' }}
    >
      <PageTitle icon="doc" title={t('inv.history.title')} subtitle={t('inv.history.subtitle')} />

      <Card
        padding="md"
        style={{
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          ...(isPhone
            ? {
                padding: 0,
                background: 'transparent',
                border: 'none',
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                overflow: 'visible',
              }
            : {}),
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={t('inv.history.searchPlaceholder')}
          />
          <PillSelect
            label={t('inv.history.filterType')}
            value={type}
            options={typeOptions}
            onChange={setType}
          />
          <PillSelect
            label={t('inv.history.filterStore')}
            value={storeId}
            options={storeOptions}
            onChange={setStoreId}
          />
        </div>

        {chips.length > 0 && (
          <FilterChips chips={chips} onClearAll={clearAll} clearAllLabel={t('common.clearAll')} />
        )}

        <div style={{ marginTop: '14px' }}>
          {error ? (
            <EmptyState icon="alert" title={t('inv.history.loadFailed')} hint={error.message} />
          ) : showEmpty ? (
            <EmptyState
              icon="doc"
              title={
                chips.length > 0 ? t('inv.history.emptyFiltered') : t('inv.history.emptyTitle')
              }
              hint={chips.length > 0 ? undefined : t('inv.history.emptyHint')}
              action={
                chips.length > 0 ? (
                  <ActionButton variant="outline" size="sm" onClick={clearAll}>
                    {t('common.clearAll')}
                  </ActionButton>
                ) : undefined
              }
            />
          ) : (
            <Table<Doc>
              readable
              columns={columns}
              data={docs}
              rowKey="id"
              loading={loading && docs.length === 0}
              onRowClick={(d) => {
                navigate(destinationOf(d))
              }}
            />
          )}
          {docs.length >= SERVER_LIMIT && (
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: theme.textSecondary }}>
              {t('inv.history.cut', { count: SERVER_LIMIT })}
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
