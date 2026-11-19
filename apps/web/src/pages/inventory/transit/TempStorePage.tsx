import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@apollo/client'
import { useSearchParams } from 'react-router-dom'
import {
  CANCEL_STORE_TRANSFER,
  CREATE_STORE_TRANSFER,
  PRODUCTS_QUERY,
  RECEIVE_STORE_TRANSFER,
  STOCK_LOCATIONS_QUERY,
  STORE_TRANSFERS_QUERY,
  TEMP_STORE_ITEMS_QUERY,
  TEMP_STORE_SUMMARY_QUERY,
} from '../../../graphql/inventory'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Checkbox } from '../../../components/ui/Checkbox'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Table } from '../../../components/ui/Table'
import type { Column } from '../../../components/ui/Table'
import { ActionButton } from '../../../components/ui/ActionButton'
import { EmptyState, KpiRow, KpiTile, PageTitle } from '../../../components/procurement/ListKit'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'
import { TransferDialog } from './TransferDialog'
import type { TransferDraft, TransferPayload } from './TransferDialog'
import { TransferDetailDialog } from './TransferDetailDialog'
import { ReceiveTransferDialog } from './ReceiveTransferDialog'
import type { ReceivePayload } from './ReceiveTransferDialog'
import type {
  CancelStoreTransferMutation,
  CancelStoreTransferMutationVariables,
  CreateStoreTransferMutation,
  CreateStoreTransferMutationVariables,
  ProductsQuery,
  ProductsQueryVariables,
  ReceiveStoreTransferMutation,
  ReceiveStoreTransferMutationVariables,
  StockLocationsQuery,
  StockLocationsQueryVariables,
  StoreTransfersQuery,
  StoreTransfersQueryVariables,
  TempStoreItemsQuery,
  TempStoreSummaryQuery,
} from '../../../graphql/generated'

type Waiting = TempStoreItemsQuery['tempStoreItems'][number]
type Transfer = StoreTransfersQuery['storeTransfers'][number]

// the limit the server flags goods at (lib/storeTransfers.ts TEMP_WAIT_DAYS); the page only prints it, the server decides "late"
const TEMP_WAIT_DAYS = 7
const keyOf = (w: { productId: string; locationId: string }) => `${w.productId}|${w.locationId}`
const fmtQty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 })

export default function TempStorePage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const addToast = useToastStore((s) => s.addToast)

  const {
    data: itemsData,
    loading: itemsLoading,
    refetch: refetchItems,
  } = useQuery<TempStoreItemsQuery>(TEMP_STORE_ITEMS_QUERY, { fetchPolicy: 'cache-and-network' })
  const { data: summaryData, refetch: refetchSummary } = useQuery<TempStoreSummaryQuery>(
    TEMP_STORE_SUMMARY_QUERY,
    { fetchPolicy: 'cache-and-network' },
  )
  const {
    data: transfersData,
    loading: transfersLoading,
    refetch: refetchTransfers,
  } = useQuery<StoreTransfersQuery, StoreTransfersQueryVariables>(STORE_TRANSFERS_QUERY, {
    variables: { status: 'all' },
    fetchPolicy: 'cache-and-network',
  })
  const { data: locationsData } = useQuery<StockLocationsQuery, StockLocationsQueryVariables>(
    STOCK_LOCATIONS_QUERY,
    { variables: { isActive: true } },
  )
  const { data: productsData } = useQuery<ProductsQuery, ProductsQueryVariables>(PRODUCTS_QUERY, {
    variables: {},
  })

  const waiting = itemsData?.tempStoreItems ?? []
  const summary = summaryData?.tempStoreSummary
  const transfers = transfersData?.storeTransfers ?? []
  const inTransit = transfers.filter((x) => x.status === 'in_transit')
  const recent = transfers
    .filter((x) => x.status === 'received' || x.status === 'received_short')
    .slice(0, 8)
  const locations = locationsData?.stockLocations ?? []
  const products = useMemo(
    () => (productsData?.products ?? []).filter((p): p is NonNullable<typeof p> => p !== null),
    [productsData],
  )

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<TransferDraft | null>(null)
  const [receiving, setReceiving] = useState<Transfer | null>(null)
  const [cancelling, setCancelling] = useState<Transfer | null>(null)

  // The transfer whose details are open lives in the address (?transfer=<id>): a click on a received transfer here and a click on a
  // transfer in Store History both land on the same window, a link can be shared, and Back closes it. Most transfers are in the
  // list above (the newest 200); an older one, reached from Store History, is fetched by its id.
  const [searchParams, setSearchParams] = useSearchParams()
  const detailId = searchParams.get('transfer')
  const listed = detailId ? transfers.find((x) => x.id === detailId) : undefined
  const { data: oneData, loading: oneLoading } = useQuery<
    StoreTransfersQuery,
    StoreTransfersQueryVariables
  >(STORE_TRANSFERS_QUERY, {
    variables: { status: 'all', id: detailId ?? undefined },
    skip: !detailId || listed !== undefined,
  })
  const viewing: Transfer | null = detailId ? (listed ?? oneData?.storeTransfers[0] ?? null) : null
  function openDetails(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('transfer', id)
    setSearchParams(next)
  }
  function closeDetails() {
    const next = new URLSearchParams(searchParams)
    next.delete('transfer')
    setSearchParams(next, { replace: true })
  }
  // A link to a transfer that does not exist (or belongs to another company) says so instead of opening nothing.
  const notFound =
    detailId !== null && listed === undefined && !oneLoading && oneData?.storeTransfers.length === 0
  useEffect(() => {
    if (notFound) {
      addToast({ type: 'error', message: t('inv.transit.detailNotFound') })
      closeDetails()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notFound])

  const refreshAll = () => {
    void refetchItems()
    void refetchSummary()
    void refetchTransfers()
  }
  const onError = (e: Error) => {
    addToast({ type: 'error', message: e.message })
  }
  const [createTransfer, { loading: sending }] = useMutation<
    CreateStoreTransferMutation,
    CreateStoreTransferMutationVariables
  >(CREATE_STORE_TRANSFER, {
    onCompleted: (r) => {
      addToast({
        type: 'success',
        message: t('inv.transit.sentToast', { number: r.createStoreTransfer.transferNumber }),
      })
      setDialogOpen(false)
      setSelected(new Set())
      refreshAll()
    },
    onError,
  })
  const [receiveTransfer, { loading: receivingNow }] = useMutation<
    ReceiveStoreTransferMutation,
    ReceiveStoreTransferMutationVariables
  >(RECEIVE_STORE_TRANSFER, {
    onCompleted: (r) => {
      addToast({
        type: 'success',
        message: t('inv.transit.receivedToast', { number: r.receiveStoreTransfer.transferNumber }),
      })
      setReceiving(null)
      refreshAll()
    },
    onError,
  })
  const [cancelTransfer, { loading: cancellingNow }] = useMutation<
    CancelStoreTransferMutation,
    CancelStoreTransferMutationVariables
  >(CANCEL_STORE_TRANSFER, {
    onCompleted: (r) => {
      addToast({
        type: 'success',
        message: t('inv.transit.cancelledToast', { number: r.cancelStoreTransfer.transferNumber }),
      })
      setCancelling(null)
      refreshAll()
    },
    onError: (e) => {
      setCancelling(null)
      onError(e)
    },
  })

  function openNew(from?: TransferDraft) {
    setDraft(from ?? null)
    setDialogOpen(true)
  }

  // "Send selected": items of ONE temporary store go together; the destination is filled in when they all share one.
  function sendSelected() {
    const rows = waiting.filter((w) => selected.has(keyOf(w)))
    if (rows.length === 0) return
    const stores = new Set(rows.map((r) => r.locationId))
    if (stores.size > 1) {
      addToast({ type: 'error', message: t('inv.transit.oneStoreAtATime') })
      return
    }
    const dests = new Set(rows.map((r) => r.destinationLocationId ?? ''))
    openNew({
      fromLocationId: rows[0]?.locationId ?? '',
      toLocationId: dests.size === 1 ? ([...dests][0] ?? '') : '',
      lines: rows.map((r) => ({ productId: r.productId, qty: String(r.qty), remarks: '' })),
    })
  }

  const allSelected = waiting.length > 0 && waiting.every((w) => selected.has(keyOf(w)))
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(waiting.map(keyOf)))
  }
  const toggleOne = (w: Waiting) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(keyOf(w))) next.delete(keyOf(w))
      else next.add(keyOf(w))
      return next
    })
  }

  const statusBadge = (s: string) =>
    s === 'in_transit' ? (
      <Badge variant="info">{t('inv.transit.statusInTransit')}</Badge>
    ) : s === 'received' ? (
      <Badge variant="success">{t('inv.transit.statusReceived')}</Badge>
    ) : s === 'received_short' ? (
      <Badge variant="warning">{t('inv.transit.statusShort')}</Badge>
    ) : (
      <Badge variant="neutral">{t('inv.transit.statusCancelled')}</Badge>
    )

  const waitingColumns: Column<Waiting>[] = [
    {
      key: '_pick',
      header: (
        <Checkbox
          ariaLabel={t('inv.transit.selectAll')}
          checked={allSelected}
          indeterminate={!allSelected && selected.size > 0}
          onChange={toggleAll}
        />
      ) as unknown as string,
      width: '44px',
      render: (w) => (
        <Checkbox
          ariaLabel={t('inv.transit.selectRow', { name: w.productName ?? w.productId })}
          checked={selected.has(keyOf(w))}
          onChange={() => {
            toggleOne(w)
          }}
        />
      ),
    },
    {
      key: 'status',
      header: t('inv.transit.colStatus'),
      width: '170px',
      render: (w) =>
        w.late ? (
          <Badge variant="danger">{t('inv.transit.waitingDays', { count: w.daysWaiting })}</Badge>
        ) : (
          <Badge variant="warning">{t('inv.transit.awaitingDispatch')}</Badge>
        ),
    },
    {
      key: 'locationName',
      header: t('inv.transit.colStore'),
      render: (w) => <span style={{ color: theme.textSecondary }}>{w.locationName ?? '—'}</span>,
    },
    {
      key: 'productName',
      header: t('inv.transit.colItem'),
      render: (w) => (
        <div>
          <div style={{ color: theme.textPrimary, fontWeight: 600 }}>
            {w.productName ?? w.productId}
          </div>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>{w.sku ?? ''}</div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: t('inv.transit.colQty'),
      width: '100px',
      render: (w) => (
        <span
          style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: theme.textPrimary }}
        >
          {fmtQty(w.qty)} {w.uom ?? ''}
        </span>
      ),
    },
    {
      key: 'since',
      header: t('inv.transit.colSince'),
      width: '110px',
      render: (w) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{w.since ?? '—'}</span>,
    },
    {
      key: 'poNumbers',
      header: t('inv.transit.colSource'),
      render: (w) => (
        <div>
          <div style={{ color: theme.textPrimary }}>{w.poNumbers ?? '—'}</div>
          {w.suppliers && (
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>{w.suppliers}</div>
          )}
        </div>
      ),
    },
    {
      key: 'destinationName',
      header: t('inv.transit.colDestination'),
      render: (w) => <span style={{ color: theme.textSecondary }}>{w.destinationName ?? '—'}</span>,
    },
  ]

  const route = (x: Transfer) => (
    <span style={{ color: theme.textPrimary }}>
      {x.fromLocationName ?? '—'} → {x.toLocationName ?? '—'}
    </span>
  )
  const itemsText = (x: Transfer) => (
    <div>
      {x.lines.map((l) => (
        <div key={l.id} style={{ fontSize: '13px', color: theme.textPrimary }}>
          {fmtQty(l.qtySent)} {l.uom ?? ''} {l.productName ?? l.productId}
        </div>
      ))}
    </div>
  )

  const transitColumns: Column<Transfer>[] = [
    {
      key: 'transferNumber',
      header: t('inv.transit.colTransfer'),
      width: '120px',
      render: (x) => (
        <span style={{ fontWeight: 600, color: theme.textPrimary }}>{x.transferNumber}</span>
      ),
    },
    { key: 'route', header: t('inv.transit.colRoute'), render: route },
    {
      key: 'transferDate',
      header: t('inv.transit.colSent'),
      width: '110px',
      render: (x) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{x.transferDate}</span>,
    },
    {
      key: 'daysInTransit',
      header: t('inv.transit.colDays'),
      width: '70px',
      render: (x) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{x.daysInTransit ?? 0}</span>
      ),
    },
    { key: 'items', header: t('inv.transit.colItems'), render: itemsText },
    {
      key: 'driverName',
      header: t('inv.transit.colDriver'),
      render: (x) => (
        <div>
          <div style={{ color: theme.textPrimary }}>{x.driverName ?? '—'}</div>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>
            {[x.vehicleNo, x.waybillNo].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      key: '_action',
      header: '',
      width: '230px',
      render: (x) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <ActionButton
            variant="solid"
            size="sm"
            onClick={() => {
              setReceiving(x)
            }}
          >
            {t('inv.transit.receive')}
          </ActionButton>
          <ActionButton
            variant="outline"
            size="sm"
            onClick={() => {
              setCancelling(x)
            }}
          >
            {t('inv.transit.cancelTransfer')}
          </ActionButton>
        </div>
      ),
    },
  ]
  const recentColumns: Column<Transfer>[] = [
    {
      key: 'transferNumber',
      header: t('inv.transit.colTransfer'),
      width: '120px',
      render: (x) => (
        <span style={{ fontWeight: 600, color: theme.textPrimary }}>{x.transferNumber}</span>
      ),
    },
    { key: 'route', header: t('inv.transit.colRoute'), render: route },
    {
      key: 'transferDate',
      header: t('inv.transit.colSent'),
      width: '110px',
      render: (x) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{x.transferDate}</span>,
    },
    {
      key: 'receivedDate',
      header: t('inv.transit.colReceived'),
      width: '110px',
      render: (x) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{x.receivedDate ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: t('inv.transit.colStatus'),
      width: '150px',
      render: (x) => statusBadge(x.status),
    },
  ]

  const cardStyle = { borderRadius: '14px', marginBottom: '18px' } as const

  return (
    <div
      style={{ padding: isPhone ? '12px 16px 24px' : '24px', margin: '0 auto', maxWidth: '2400px' }}
    >
      <PageTitle
        icon="truck"
        title={t('inv.transit.title')}
        subtitle={t('inv.transit.subtitle')}
        actions={
          <ActionButton
            variant="solid"
            onClick={() => {
              openNew()
            }}
          >
            {t('inv.transit.newTransfer')}
          </ActionButton>
        }
      />

      <KpiRow>
        <KpiTile
          tone="warning"
          icon="clock"
          label={t('inv.transit.kpiWaiting')}
          value={summary?.itemsWaiting ?? 0}
          sub={t('inv.transit.kpiWaitingSub')}
        />
        <KpiTile
          tone="danger"
          icon="alert"
          label={t('inv.transit.kpiLate')}
          value={summary?.waitingTooLong ?? 0}
          sub={t('inv.transit.kpiLateSub', { days: TEMP_WAIT_DAYS })}
        />
        <KpiTile
          tone="info"
          icon="truck"
          label={t('inv.transit.kpiTransit')}
          value={summary?.inTransit ?? 0}
          sub={t('inv.transit.kpiTransitSub')}
        />
        <KpiTile
          tone="accent"
          icon="doc"
          label={t('inv.transit.kpiOldest')}
          value={summary?.oldestDays ?? 0}
          sub={t('inv.transit.kpiOldestSub')}
        />
      </KpiRow>

      <Card padding="md" style={cardStyle}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>
              {t('inv.transit.waitingTitle')}
            </div>
            <div style={{ fontSize: '13px', color: theme.textSecondary }}>
              {t('inv.transit.waitingHint')}
            </div>
          </div>
          <ActionButton variant="solid" disabled={selected.size === 0} onClick={sendSelected}>
            {t('inv.transit.sendSelected')}
            {selected.size > 0 ? ` (${selected.size})` : ''}
          </ActionButton>
        </div>
        {!itemsLoading && waiting.length === 0 ? (
          <EmptyState
            icon="check"
            title={t('inv.transit.waitingEmpty')}
            hint={t('inv.transit.waitingEmptyHint')}
          />
        ) : (
          <Table<Waiting>
            readable
            columns={waitingColumns}
            data={waiting}
            rowKey="productId"
            loading={itemsLoading && waiting.length === 0}
            getRowStyle={(w) => (w.late ? { borderInlineStart: `3px solid ${theme.danger}` } : {})}
          />
        )}
      </Card>

      <Card padding="md" style={cardStyle}>
        <div
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: theme.textPrimary,
            marginBottom: '12px',
          }}
        >
          {t('inv.transit.transitTitle')}
        </div>
        {!transfersLoading && inTransit.length === 0 ? (
          <EmptyState icon="truck" title={t('inv.transit.transitEmpty')} />
        ) : (
          <Table<Transfer>
            readable
            columns={transitColumns}
            data={inTransit}
            rowKey="id"
            loading={transfersLoading && inTransit.length === 0}
          />
        )}
      </Card>

      <Card padding="md" style={cardStyle}>
        <div
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: theme.textPrimary,
            marginBottom: '12px',
          }}
        >
          {t('inv.transit.recentTitle')}
        </div>
        {!transfersLoading && recent.length === 0 ? (
          <EmptyState icon="doc" title={t('inv.transit.recentEmpty')} />
        ) : (
          <Table<Transfer>
            readable
            columns={recentColumns}
            data={recent}
            rowKey="id"
            loading={transfersLoading && recent.length === 0}
            onRowClick={(x) => {
              openDetails(x.id)
            }}
          />
        )}
      </Card>

      <TransferDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
        }}
        locations={locations}
        products={products}
        initial={draft}
        saving={sending}
        onSend={(payload: TransferPayload) => {
          void createTransfer({ variables: { input: payload } })
        }}
      />

      <ReceiveTransferDialog
        transfer={receiving}
        saving={receivingNow}
        onClose={() => {
          setReceiving(null)
        }}
        onReceive={(id: string, payload: ReceivePayload) => {
          void receiveTransfer({ variables: { id, input: payload } })
        }}
      />

      <TransferDetailDialog transfer={viewing} onClose={closeDetails} />

      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => {
          setCancelling(null)
        }}
        onConfirm={() => {
          if (cancelling) void cancelTransfer({ variables: { id: cancelling.id } })
        }}
        title={t('inv.transit.cancelConfirmTitle', { number: cancelling?.transferNumber ?? '' })}
        message={t('inv.transit.cancelConfirmBody', { store: cancelling?.fromLocationName ?? '' })}
        confirmLabel={t('inv.transit.cancelTransfer')}
        confirmVariant="danger"
        loading={cancellingNow}
      />
    </div>
  )
}
