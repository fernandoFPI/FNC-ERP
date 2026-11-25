import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../ui/Modal'
import { ActionButton } from '../ui/ActionButton'
import { Input } from '../ui/Input'
import { SearchableSelect } from '../ui/SearchableSelect'
import { useFocusRing } from '../ui/keyboardFocus'
import { menuFocusRing } from '../ui/menuStyles'
import {
  REPLACE_REVIEW_PURCHASES_WITH_STOCK,
  REQUISITION_STOCK_AVAILABILITY_QUERY,
  TAKE_REVIEW_LINE_FROM_STOCK,
} from '../../graphql/requisitions'
import { CENTRAL_WAREHOUSE_LOCATIONS_QUERY, STOCK_LOCATIONS_QUERY } from '../../graphql/inventory'

// Migration 332, playbook #117. In the organizer review he can cover the part of a line that was NOT bought (what is left after
// he lowered a purchase) from stock instead of accepting it as short. The server reserves the stock and checks the rest (the
// quantity, the shelf, who, the stage); a PO Admin approves it with the other changes. This form only asks where and how many.
// The same dialog serves "Use stock instead" (migration 333, playbook #118): the line's purchases and receipts are removed and its whole
// remaining quantity comes from the shelf, so there is no quantity to type, only the shelf.

interface LocationRow {
  id: string
  name: string
  type: string
}

interface Props {
  /** The line to cover; null keeps the dialog closed. `shortfall` is what is left to cover, `location` the shelf the line already draws from. */
  line: { id: string; name: string; shortfall: number; location?: string | null } | null
  /** `take`: cover part of what is not bought. `replace`: stock instead of the purchases (everything still to cover, purchases removed). */
  mode?: 'take' | 'replace'
  requisitionId: string
  onClose: () => void
  /** Called after the stock was taken, so the page reads the requisition again. */
  onDone: () => void
}

const VIRTUAL = ['virtual_in', 'virtual_out']

interface StoreStock {
  locationId: string
  locationName: string
  companyName: string
  qtyAvailable: number
}

interface AvailabilityData {
  requisitionStockAvailability:
    | ({ lineId: string; byLocation: (StoreStock | null)[] | null } | null)[]
    | null
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)

// One store that holds the item: its name, the company it belongs to and how much of it can still be taken. A row that holds
// enough for the quantity says so in the success colour, one that does not says how much is missing; both can be chosen, the
// server stays the judge (it reserves under a row lock).
function StoreRow({
  store,
  need,
  chosen,
  onPick,
}: {
  store: StoreStock
  need: number
  chosen: boolean
  onPick: () => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { ring, handlers } = useFocusRing()
  const enough = store.qtyAvailable + 0.0001 >= need
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onPick}
      {...handlers}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        width: '100%',
        minHeight: '44px',
        padding: '8px 12px',
        borderRadius: '10px',
        border: `1px solid ${chosen ? theme.accentSolid : theme.borderField}`,
        background: chosen ? theme.accentBg : theme.bgSurface,
        color: theme.textPrimary,
        cursor: 'pointer',
        textAlign: 'start',
        fontFamily: 'inherit',
        outline: 'none',
        boxShadow: ring ? menuFocusRing(theme) : 'none',
        touchAction: 'manipulation',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: '13px', fontWeight: 600 }}>{store.locationName}</span>
        <span style={{ fontSize: '12px', color: theme.textSecondary }}>{store.companyName}</span>
      </span>
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          color: enough ? theme.success : theme.warning,
        }}
      >
        {enough
          ? t('req.review.stockWhereEnough', { n: fmt(store.qtyAvailable) })
          : t('req.review.stockWhereNotEnough', {
              n: fmt(store.qtyAvailable),
              need: fmt(need),
            })}
      </span>
    </button>
  )
}

export function TakeFromStockModal({ line, mode = 'take', requisitionId, onClose, onDone }: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const open = line !== null

  const [qty, setQty] = useState('')
  const [locationId, setLocationId] = useState('')

  // The same two lists "resolve from stock" at Items Bought offers: this company's real places and the central warehouse's. Only
  // asked for while the dialog is open.
  const { data: own } = useQuery<{ stockLocations: (LocationRow | null)[] | null }>(
    STOCK_LOCATIONS_QUERY,
    { variables: { isActive: true }, skip: !open },
  )
  const { data: central } = useQuery<{ centralWarehouseLocations: (LocationRow | null)[] | null }>(
    CENTRAL_WAREHOUSE_LOCATIONS_QUERY,
    { variables: { isActive: true }, skip: !open },
  )
  // Where this item is actually in stock, with how much can still be taken: the same answer the inventory check uses (this company's
  // places, the central warehouse's and the companies the caller works in). Read for the requisition and picked out by line.
  const { data: availability, loading: loadingAvailability } = useQuery<AvailabilityData>(
    REQUISITION_STOCK_AVAILABILITY_QUERY,
    { variables: { requisitionId }, skip: !open, fetchPolicy: 'network-only' },
  )
  const stores = useMemo(() => {
    const row = (availability?.requisitionStockAvailability ?? []).find(
      (r) => r !== null && r.lineId === line?.id,
    )
    return (row?.byLocation ?? [])
      .filter((s): s is StoreStock => s !== null && s.qtyAvailable > 0)
      .sort((a, b) => b.qtyAvailable - a.qtyAvailable)
  }, [availability, line?.id])
  const stockById = useMemo(() => new Map(stores.map((s) => [s.locationId, s])), [stores])
  const options = useMemo(() => {
    const real = (rows: (LocationRow | null)[] | null | undefined) =>
      (rows ?? []).filter((l): l is LocationRow => l !== null && !VIRTUAL.includes(l.type))
    // A place that holds the item says how much, and comes first.
    const withStock = (id: string, label: string) => {
      const s = stockById.get(id)
      return s
        ? `${label} · ${t('req.review.stockWhereEnough', { n: fmt(s.qtyAvailable) })}`
        : label
    }
    const all = [
      ...real(own?.stockLocations).map((l) => ({ value: l.id, label: withStock(l.id, l.name) })),
      ...real(central?.centralWarehouseLocations).map((l) => ({
        value: l.id,
        label: withStock(l.id, t('req.bought.centralWarehouseSuffix', { name: l.name })),
      })),
    ]
    return [
      ...all.filter((o) => stockById.has(o.value)),
      ...all.filter((o) => !stockById.has(o.value)),
    ]
  }, [own, central, stockById, t])

  const finished = () => {
    addToast({
      message:
        mode === 'replace' ? t('req.review.toastStockReplaced') : t('req.review.toastStockTaken'),
      type: 'success',
    })
    reset()
    onDone()
    onClose()
  }
  const failed = (e: { message: string }) => {
    addToast({ message: e.message, type: 'error' })
  }
  const [take, { loading: taking }] = useMutation(TAKE_REVIEW_LINE_FROM_STOCK, {
    onCompleted: finished,
    onError: failed,
  })
  const [replace, { loading: replacing }] = useMutation(REPLACE_REVIEW_PURCHASES_WITH_STOCK, {
    onCompleted: finished,
    onError: failed,
  })
  const loading = taking || replacing

  const reset = () => {
    setQty('')
    setLocationId('')
  }
  const close = () => {
    if (loading) return
    reset()
    onClose()
  }

  // The line starts on its own number and, when it already draws from a shelf, on that shelf (it keeps one).
  const quantity = qty === '' ? (line?.shortfall ?? 0) : parseFloat(qty)
  const chosenLocation = locationId !== '' ? locationId : (line?.location ?? '')
  const submit = () => {
    if (!line) return
    if (mode === 'replace') {
      if (!(quantity > 0)) {
        addToast({ message: t('req.review.stockErrQty'), type: 'error' })
        return
      }
      if (quantity > line.shortfall + 0.0001) {
        addToast({
          message: t('req.review.stockErrTooMuch', { n: line.shortfall }),
          type: 'error',
        })
        return
      }
      if (!chosenLocation) {
        addToast({ message: t('req.review.stockErrLocation'), type: 'error' })
        return
      }
      // The whole remaining quantity is sent as "no quantity" (the full replacement); less covers only that part.
      void replace({
        variables: {
          requisitionId,
          lineId: line.id,
          sourceLocationId: chosenLocation,
          ...(quantity < line.shortfall - 0.0001 ? { qty: quantity } : {}),
        },
      })
      return
    }
    if (!(quantity > 0)) {
      addToast({ message: t('req.review.stockErrQty'), type: 'error' })
      return
    }
    if (quantity > line.shortfall + 0.0001) {
      addToast({
        message: t('req.review.stockErrTooMuch', { n: line.shortfall }),
        type: 'error',
      })
      return
    }
    if (!chosenLocation) {
      addToast({ message: t('req.review.stockErrLocation'), type: 'error' })
      return
    }
    void take({
      variables: {
        requisitionId,
        lineId: line.id,
        sourceLocationId: chosenLocation,
        qty: quantity,
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        mode === 'replace'
          ? t('req.review.replaceTitle', { item: line?.name ?? '' })
          : t('req.review.stockTitle', { item: line?.name ?? '' })
      }
      size="md"
      footer={
        <>
          <ActionButton variant="outline" onClick={close}>
            {t('req.review.cancel')}
          </ActionButton>
          <ActionButton variant="solid" loading={loading} onClick={submit}>
            {mode === 'replace' ? t('req.review.replaceConfirm') : t('req.review.stockConfirm')}
          </ActionButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '13px', color: theme.textSecondary }}>
          {mode === 'replace'
            ? t('req.review.replaceIntro', { n: line?.shortfall ?? 0 })
            : t('req.review.stockIntro', { n: line?.shortfall ?? 0 })}
        </div>
        {stores.length > 0 && (
          <div
            role="radiogroup"
            aria-label={t('req.review.stockWhereHeading')}
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            <div style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>
              {t('req.review.stockWhereHeading')}
            </div>
            {stores.map((s) => (
              <StoreRow
                key={s.locationId}
                store={s}
                need={!(quantity > 0) ? (line?.shortfall ?? 0) : quantity}
                chosen={chosenLocation === s.locationId}
                onPick={() => {
                  setLocationId(s.locationId)
                }}
              />
            ))}
          </div>
        )}
        {open && !loadingAvailability && availability && stores.length === 0 && (
          <div
            style={{
              fontSize: '13px',
              color: theme.warning,
              padding: '10px 12px',
              borderRadius: '10px',
              border: `1px solid ${theme.warning}`,
            }}
          >
            {t('req.review.stockWhereNone')}
          </div>
        )}
        <SearchableSelect
          field
          label={t('req.review.stockLocationLabel')}
          placeholder={t('req.review.stockLocationPlaceholder')}
          value={chosenLocation}
          onChange={setLocationId}
          options={options}
        />
        <Input
          field
          label={
            mode === 'replace' ? t('req.review.replaceQtyLabel') : t('req.review.stockQtyLabel')
          }
          type="number"
          value={qty === '' ? String(line?.shortfall ?? '') : qty}
          onChange={(e) => {
            setQty(e.target.value)
          }}
        />
        {mode === 'replace' && quantity > 0 && quantity <= (line?.shortfall ?? 0) + 0.0001 && (
          <div data-testid="replace-hint" style={{ fontSize: '13px', color: theme.textSecondary }}>
            {quantity >= (line?.shortfall ?? 0) - 0.0001
              ? t('req.review.replaceHintAll', { n: fmt(line?.shortfall ?? 0) })
              : t('req.review.replaceHintPart', {
                  n: fmt(quantity),
                  rest: fmt((line?.shortfall ?? 0) - quantity),
                })}
          </div>
        )}
        <div style={{ fontSize: '13px', color: theme.textSecondary }}>
          {t('req.review.stockNote')}
        </div>
      </div>
    </Modal>
  )
}
