import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@apollo/client'
import {
  CREATE_EQUIPMENT_RETURN,
  RETURNABLE_ITEMS_QUERY,
  RETURNABLE_ITEMS_SUMMARY_QUERY,
  STOCK_LOCATIONS_QUERY,
} from '../../../graphql/inventory'
import { Modal } from '../../../components/ui/Modal'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Input } from '../../../components/ui/Input'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { Table } from '../../../components/ui/Table'
import type { Column } from '../../../components/ui/Table'
import { ActionButton } from '../../../components/ui/ActionButton'
import { ChipButton } from '../../../components/ui/ChipButton'
import { QuantityStepper } from '../../../components/ui/QuantityStepper'
import {
  EmptyState,
  FilterChips,
  KpiRow,
  KpiTile,
  PageTitle,
  PersonCell,
  PillSelect,
  SearchBox,
} from '../../../components/procurement/ListKit'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'
import { receivableLocations } from '../../../lib/receivingLocations'
import type {
  CreateEquipmentReturnMutation,
  CreateEquipmentReturnMutationVariables,
  ReturnableItemsQuery,
  ReturnableItemsQueryVariables,
  ReturnableItemsSummaryQuery,
  StockLocationsQuery,
  StockLocationsQueryVariables,
} from '../../../graphql/generated'

type Item = ReturnableItemsQuery['returnableItems'][number]
type Filter = 'open' | 'overdue' | 'all'
type Condition = 'good' | 'needs_repair' | 'damaged' | 'lost'

const STATUS_VARIANT: Record<string, 'warning' | 'danger' | 'success'> = {
  out: 'warning',
  overdue: 'danger',
  returned: 'success',
}

const fmtQty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 })

export default function ReturnablesPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const addToast = useToastStore((s) => s.addToast)

  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')

  // Receive-back dialog
  const [target, setTarget] = useState<Item | null>(null)
  const [qty, setQty] = useState('')
  const [condition, setCondition] = useState<Condition>('good')
  const [locationId, setLocationId] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [remarks, setRemarks] = useState('')

  const listVariables: ReturnableItemsQueryVariables = {
    status: filter,
    search: search.trim() || undefined,
  }
  const { data, loading, error, refetch } = useQuery<
    ReturnableItemsQuery,
    ReturnableItemsQueryVariables
  >(RETURNABLE_ITEMS_QUERY, { variables: listVariables, fetchPolicy: 'cache-and-network' })
  const { data: summaryData, refetch: refetchSummary } = useQuery<ReturnableItemsSummaryQuery>(
    RETURNABLE_ITEMS_SUMMARY_QUERY,
    { fetchPolicy: 'cache-and-network' },
  )
  const { data: locationsData } = useQuery<StockLocationsQuery, StockLocationsQueryVariables>(
    STOCK_LOCATIONS_QUERY,
    { variables: { isActive: true } },
  )

  const items = data?.returnableItems ?? []
  const summary = summaryData?.returnableItemsSummary
  const locationOptions = useMemo(
    () =>
      receivableLocations(locationsData?.stockLocations ?? []).map((l) => ({
        value: l.id,
        label: l.code ? `${l.name} (${l.code})` : l.name,
      })),
    [locationsData],
  )

  const [createReturn, { loading: saving }] = useMutation<
    CreateEquipmentReturnMutation,
    CreateEquipmentReturnMutationVariables
  >(CREATE_EQUIPMENT_RETURN, {
    onCompleted: (res) => {
      addToast({
        type: 'success',
        message: t('inv.returnables.returnedToast', {
          number: res.createEquipmentReturn.returnNumber,
        }),
      })
      setTarget(null)
      void refetch()
      void refetchSummary()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  function openDialog(item: Item) {
    setTarget(item)
    setQty(String(item.qtyOutstanding))
    setCondition('good')
    // Back where it came from when that is a place equipment may go back to; otherwise the person picks.
    setLocationId(
      locationOptions.some((o) => o.value === item.fromLocationId)
        ? (item.fromLocationId ?? '')
        : '',
    )
    setReceivedBy('')
    setRemarks('')
  }

  const qtyNumber = parseFloat(qty)
  const isLost = condition === 'lost'
  const qtyValid = target !== null && qtyNumber > 0 && qtyNumber <= target.qtyOutstanding + 0.0001
  const canConfirm =
    target !== null && qtyValid && (isLost ? remarks.trim() !== '' : locationId !== '') && !saving

  function confirm() {
    if (!target || !canConfirm) return
    void createReturn({
      variables: {
        input: {
          receivedByName: receivedBy.trim() || undefined,
          lines: [
            {
              issueLineId: target.issueLineId,
              qtyReturned: qtyNumber,
              condition,
              toLocationId: isLost ? undefined : locationId,
              remarks: remarks.trim() || undefined,
            },
          ],
        },
      },
    })
  }

  const statusText = (r: Item) =>
    r.status === 'overdue'
      ? t('inv.returnables.statusOverdue', { days: r.daysOverdue ?? 0 })
      : r.status === 'returned'
        ? t('inv.returnables.statusReturned')
        : t('inv.returnables.statusOut')

  const receiveAction = (r: Item) =>
    r.qtyOutstanding > 0 ? (
      r.canReceiveBack ? (
        <ActionButton
          variant="solid"
          size="sm"
          onClick={() => {
            openDialog(r)
          }}
        >
          {t('inv.returnables.receiveBack')}
        </ActionButton>
      ) : (
        <span style={{ fontSize: '12px', color: theme.textSecondary }}>
          {t('inv.returnables.onlyLender', { company: r.ownerCompanyName ?? '' })}
        </span>
      )
    ) : null

  const loanNote = (r: Item) =>
    r.isLoan ? (
      <div style={{ fontSize: '12px', color: theme.textSecondary }}>
        {r.canReceiveBack
          ? t('inv.returnables.lentTo', { company: r.borrowerCompanyName ?? '' })
          : t('inv.returnables.lentFrom', { company: r.ownerCompanyName ?? '' })}
      </div>
    ) : null

  const columns: Column<Item>[] = [
    {
      key: 'status',
      header: t('inv.returnables.colStatus'),
      width: '140px',
      render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>{statusText(r)}</Badge>,
    },
    {
      key: 'issueNumber',
      header: t('inv.returnables.colVoucher'),
      width: '120px',
      render: (r) => (
        <span
          style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: theme.textPrimary }}
        >
          {r.issueNumber}
        </span>
      ),
    },
    {
      key: 'productName',
      header: t('inv.returnables.colItem'),
      render: (r) => (
        <div>
          <div style={{ color: theme.textPrimary, fontWeight: 600 }}>
            {r.productName ?? r.productId}
          </div>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>
            {[r.sku, r.serialNote].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      key: 'issuedToName',
      header: t('inv.returnables.colIssuedTo'),
      render: (r) => (
        <div>
          <PersonCell name={r.issuedToName} />
          {loanNote(r)}
        </div>
      ),
    },
    {
      key: 'department',
      header: t('inv.returnables.colWhere'),
      render: (r) => (
        <span style={{ color: theme.textSecondary }}>
          {[r.department, r.projectCode].filter(Boolean).join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'storeName',
      header: t('inv.returnables.colStore'),
      render: (r) => <span style={{ color: theme.textSecondary }}>{r.storeName ?? '—'}</span>,
    },
    {
      key: 'issueDate',
      header: t('inv.returnables.colIssued'),
      width: '110px',
      render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.issueDate}</span>,
    },
    {
      key: 'qtyIssued',
      header: t('inv.returnables.colOut'),
      width: '90px',
      render: (r) => (
        <span
          style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: theme.textPrimary }}
        >
          {fmtQty(r.qtyIssued)} {r.uom ?? ''}
        </span>
      ),
    },
    {
      key: 'qtyReturned',
      header: t('inv.returnables.colBack'),
      width: '90px',
      render: (r) => (
        <div style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtQty(r.qtyReturned)}
          {r.qtyLost > 0 && (
            <div style={{ fontSize: '12px', color: theme.danger }}>
              {t('inv.returnables.lostCount', { count: r.qtyLost })}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'expectedReturnDate',
      header: t('inv.returnables.colDue'),
      width: '110px',
      render: (r) => (
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: r.status === 'overdue' ? 600 : 400,
            color: r.status === 'overdue' ? theme.danger : theme.textPrimary,
          }}
        >
          {r.expectedReturnDate ?? '—'}
        </span>
      ),
    },
    {
      key: '_action',
      header: '',
      width: '140px',
      render: receiveAction,
    },
  ]

  const filterOptions = [
    { value: 'open', label: t('inv.returnables.filterOpen') },
    { value: 'overdue', label: t('inv.returnables.filterOverdue') },
    { value: 'all', label: t('inv.returnables.filterAll') },
  ]
  const conditionOptions: { value: Condition; label: string }[] = [
    { value: 'good', label: t('inv.returnables.conditionGood') },
    { value: 'needs_repair', label: t('inv.returnables.conditionNeedsRepair') },
    { value: 'damaged', label: t('inv.returnables.conditionDamaged') },
    { value: 'lost', label: t('inv.returnables.conditionLost') },
  ]

  // Every applied filter is a chip that can be taken off, including the one a tile set.
  const chips = [
    ...(filter !== 'open'
      ? [
          {
            key: 'status',
            label: t('inv.returnables.filterLabel'),
            value: filterOptions.find((o) => o.value === filter)?.label,
            onRemove: () => {
              setFilter('open')
            },
          },
        ]
      : []),
    ...(search.trim() !== ''
      ? [
          {
            key: 'search',
            label: t('inv.returnables.searchLabel'),
            value: search.trim(),
            onRemove: () => {
              setSearch('')
            },
          },
        ]
      : []),
  ]
  const clearAll = () => {
    setFilter('open')
    setSearch('')
  }

  const showEmpty = !loading && !error && items.length === 0

  return (
    <div
      style={{ padding: isPhone ? '12px 16px 24px' : '24px', margin: '0 auto', maxWidth: '2400px' }}
    >
      <PageTitle
        icon="refresh"
        title={t('inv.returnables.title')}
        subtitle={t('inv.returnables.subtitle')}
      />

      <KpiRow>
        <KpiTile
          tone="warning"
          icon="clock"
          label={t('inv.returnables.kpiOpen')}
          value={summary?.openLines ?? 0}
          sub={t('inv.returnables.kpiOpenSub')}
          active={filter === 'open'}
          onClick={() => {
            setFilter('open')
          }}
        />
        <KpiTile
          tone="danger"
          icon="alert"
          label={t('inv.returnables.kpiOverdue')}
          value={summary?.overdueLines ?? 0}
          sub={t('inv.returnables.kpiOverdueSub')}
          active={filter === 'overdue'}
          onClick={() => {
            setFilter('overdue')
          }}
        />
        <KpiTile
          tone="info"
          icon="doc"
          label={t('inv.returnables.kpiDueSoon')}
          value={summary?.dueSoonLines ?? 0}
          sub={t('inv.returnables.kpiDueSoonSub')}
        />
        <KpiTile
          tone="accent"
          icon="truck"
          label={t('inv.returnables.kpiUnitsOut')}
          value={fmtQty(summary?.unitsOut ?? 0)}
          sub={t('inv.returnables.kpiUnitsOutSub')}
        />
      </KpiRow>

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
            placeholder={t('inv.returnables.searchPlaceholder')}
          />
          <PillSelect
            label={t('inv.returnables.filterLabel')}
            value={filter}
            options={filterOptions}
            onChange={(v) => {
              setFilter((v || 'open') as Filter)
            }}
          />
        </div>

        {chips.length > 0 && (
          <FilterChips chips={chips} onClearAll={clearAll} clearAllLabel={t('common.clearAll')} />
        )}

        <div style={{ marginTop: '14px' }}>
          {error ? (
            <EmptyState icon="alert" title={t('inv.returnables.loadFailed')} hint={error.message} />
          ) : showEmpty ? (
            <EmptyState
              icon="check"
              title={
                chips.length > 0
                  ? t('inv.returnables.emptyFiltered')
                  : t('inv.returnables.emptyTitle')
              }
              hint={chips.length > 0 ? undefined : t('inv.returnables.emptyHint')}
              action={
                chips.length > 0 ? (
                  <ActionButton variant="outline" size="sm" onClick={clearAll}>
                    {t('common.clearAll')}
                  </ActionButton>
                ) : undefined
              }
            />
          ) : (
            <Table<Item>
              readable
              columns={columns}
              data={items}
              rowKey="issueLineId"
              loading={loading && items.length === 0}
              getRowStyle={(r) =>
                r.status === 'overdue' ? { borderInlineStart: `3px solid ${theme.danger}` } : {}
              }
            />
          )}
        </div>
      </Card>

      <Modal
        open={target !== null}
        onClose={() => {
          setTarget(null)
        }}
        title={t('inv.returnables.dialogTitle', { item: target?.productName ?? '' })}
        description={
          target
            ? t('inv.returnables.dialogOutstanding', {
                who: target.issuedToName ?? '—',
                voucher: target.issueNumber,
                qty: fmtQty(target.qtyOutstanding),
              })
            : undefined
        }
        size="md"
        footer={
          <>
            <ActionButton
              variant="outline"
              onClick={() => {
                setTarget(null)
              }}
            >
              {t('inv.returnables.cancel')}
            </ActionButton>
            <ActionButton variant="solid" disabled={!canConfirm} loading={saving} onClick={confirm}>
              {t('inv.returnables.confirm')}
            </ActionButton>
          </>
        }
      >
        {target && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: theme.textSecondary,
                  marginBottom: '6px',
                }}
              >
                {t('inv.returnables.qtyReturned')}
              </div>
              <QuantityStepper
                value={qty}
                onChange={setQty}
                ariaLabel={t('inv.returnables.qtyReturned')}
                decreaseLabel={t('inv.returnables.decrease')}
                increaseLabel={t('inv.returnables.increase')}
                min={0}
                max={target.qtyOutstanding}
                step={1}
              />
              {qty !== '' && !qtyValid && (
                <div style={{ fontSize: '12px', color: theme.danger, marginTop: '4px' }}>
                  {t('inv.returnables.qtyInvalid', { max: fmtQty(target.qtyOutstanding) })}
                </div>
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: theme.textSecondary,
                  marginBottom: '6px',
                }}
              >
                {t('inv.returnables.condition')}
              </div>
              <div
                role="group"
                aria-label={t('inv.returnables.condition')}
                style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
              >
                {conditionOptions.map((o) => (
                  <ChipButton
                    key={o.value}
                    selected={condition === o.value}
                    onClick={() => {
                      setCondition(o.value)
                    }}
                  >
                    {o.label}
                  </ChipButton>
                ))}
              </div>
            </div>
            {!isLost && (
              <SearchableSelect
                field
                label={t('inv.returnables.returnTo')}
                value={locationId}
                onChange={setLocationId}
                options={locationOptions}
                placeholder={t('inv.returnables.selectLocation')}
              />
            )}
            <Input
              field
              label={t('inv.returnables.receivedBy')}
              value={receivedBy}
              onChange={(e) => {
                setReceivedBy(e.target.value)
              }}
            />
            <div style={{ gridColumn: '1 / -1' }}>
              <Textarea
                field
                label={isLost ? t('inv.returnables.remarksLost') : t('inv.returnables.remarks')}
                value={remarks}
                rows={2}
                onChange={(e) => {
                  setRemarks(e.target.value)
                }}
              />
            </div>
            {isLost && (
              <p
                style={{
                  gridColumn: '1 / -1',
                  margin: 0,
                  padding: '10px 12px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: theme.danger,
                  background: theme.dangerBg,
                  border: `1px solid ${theme.dangerBorder}`,
                }}
              >
                {target.isLoan
                  ? t('inv.returnables.lostLoanWarning')
                  : t('inv.returnables.lostWarning')}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
