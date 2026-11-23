import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../ui/Modal'
import { ActionButton } from '../ui/ActionButton'
import { Input } from '../ui/Input'
import { SearchableSelect } from '../ui/SearchableSelect'
import { TAKE_REVIEW_LINE_FROM_STOCK } from '../../graphql/requisitions'
import { CENTRAL_WAREHOUSE_LOCATIONS_QUERY, STOCK_LOCATIONS_QUERY } from '../../graphql/inventory'

// Migration 332, playbook #117. In the organizer review he can cover the part of a line that was NOT bought (what is left after
// he lowered a purchase) from stock instead of accepting it as short. The server reserves the stock and checks the rest (the
// quantity, the shelf, who, the stage); a PO Admin approves it with the other changes. This form only asks where and how many.

interface LocationRow {
  id: string
  name: string
  type: string
}

interface Props {
  /** The line to cover; null keeps the dialog closed. `shortfall` is what is left to cover, `location` the shelf the line already draws from. */
  line: { id: string; name: string; shortfall: number; location?: string | null } | null
  requisitionId: string
  onClose: () => void
  /** Called after the stock was taken, so the page reads the requisition again. */
  onDone: () => void
}

const VIRTUAL = ['virtual_in', 'virtual_out']

export function TakeFromStockModal({ line, requisitionId, onClose, onDone }: Props) {
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
  const options = useMemo(() => {
    const real = (rows: (LocationRow | null)[] | null | undefined) =>
      (rows ?? []).filter((l): l is LocationRow => l !== null && !VIRTUAL.includes(l.type))
    return [
      ...real(own?.stockLocations).map((l) => ({ value: l.id, label: l.name })),
      ...real(central?.centralWarehouseLocations).map((l) => ({
        value: l.id,
        label: t('req.bought.centralWarehouseSuffix', { name: l.name }),
      })),
    ]
  }, [own, central, t])

  const [take, { loading }] = useMutation(TAKE_REVIEW_LINE_FROM_STOCK, {
    onCompleted: () => {
      addToast({ message: t('req.review.toastStockTaken'), type: 'success' })
      reset()
      onDone()
      onClose()
    },
    onError: (e) => {
      addToast({ message: e.message, type: 'error' })
    },
  })

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
      title={t('req.review.stockTitle', { item: line?.name ?? '' })}
      size="md"
      footer={
        <>
          <ActionButton variant="outline" onClick={close}>
            {t('req.review.cancel')}
          </ActionButton>
          <ActionButton variant="solid" loading={loading} onClick={submit}>
            {t('req.review.stockConfirm')}
          </ActionButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '13px', color: theme.textSecondary }}>
          {t('req.review.stockIntro', { n: line?.shortfall ?? 0 })}
        </div>
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
          label={t('req.review.stockQtyLabel')}
          type="number"
          value={qty === '' ? String(line?.shortfall ?? '') : qty}
          onChange={(e) => {
            setQty(e.target.value)
          }}
        />
        <div style={{ fontSize: '13px', color: theme.textSecondary }}>
          {t('req.review.stockNote')}
        </div>
      </div>
    </Modal>
  )
}
