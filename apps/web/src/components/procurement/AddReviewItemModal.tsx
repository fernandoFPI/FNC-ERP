import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useToastStore } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'
import { Modal } from '../ui/Modal'
import { ActionButton } from '../ui/ActionButton'
import { Input } from '../ui/Input'
import { MoneyField } from '../ui/MoneyField'
import { SearchableSelect } from '../ui/SearchableSelect'
import { ReceiptDropZone } from './ReceiptDropZone'
import { ADD_REVIEW_LINE } from '../../graphql/requisitions'
import { PRODUCTS_QUERY } from '../../graphql/inventory'
import { REQUEST_UPLOAD_URL, VENDORS_QUERY } from '../../graphql/procurement'
import { uploadMimeType, uploadErrorDetail } from '../../lib/uploadMimeType'

// Migration 330, playbook #116. In the organizer review he can add an item that was bought and forgotten: the line and its
// purchase are created together, with the receipt. It skips the inventory check and the pricing steps, so the PO Admin's approval
// is what signs it off. The server checks everything again (vendor, receipt, product, stage, who); this form only asks for it.

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

interface Props {
  open: boolean
  requisitionId: string
  /** The currency to start the price in: the one the requisition's lines already share, if they share one. */
  defaultCurrency?: string
  onClose: () => void
  /** Called after the item was added, so the page reads the requisition again. */
  onAdded: () => void
}

interface ProductRow {
  id: string
  sku: string
  name: string
  name_ar: string | null
  uom: string | null
}
interface VendorRow {
  id: string
  name: string
  is_active: boolean
}

export function AddReviewItemModal({
  open,
  requisitionId,
  defaultCurrency,
  onClose,
  onAdded,
}: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const accessToken = useAuthStore((s) => s.accessToken)

  const [productId, setProductId] = useState('')
  const [description, setDescription] = useState('')
  const [qty, setQty] = useState('1')
  const [uom, setUom] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency ?? 'IQD')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  // The catalog the requisition form offers: this company's products and the central warehouse's. Only asked for while the
  // dialog is open, so the review page does not load thousands of products for a click that may never come.
  const { data: productsData } = useQuery<{ products: (ProductRow | null)[] | null }>(
    PRODUCTS_QUERY,
    {
      variables: { includeCentralWarehouse: true },
      skip: !open,
    },
  )
  const { data: vendorsData } = useQuery<{ vendors: (VendorRow | null)[] | null }>(VENDORS_QUERY, {
    skip: !open,
  })
  const [requestUploadUrl] = useMutation<{ requestUploadUrl: { fileId: string } }>(
    REQUEST_UPLOAD_URL,
  )
  const [addLine] = useMutation(ADD_REVIEW_LINE)

  const products = useMemo(
    () => (productsData?.products ?? []).filter((p): p is ProductRow => p !== null),
    [productsData],
  )
  const productOptions = useMemo(
    () => [
      { value: '', label: t('req.review.addCustomItem') },
      ...products.map((p) => ({
        value: p.id,
        label: p.name,
        sublabel: p.sku,
        keywords: p.name_ar ?? undefined,
      })),
    ],
    [products, t],
  )
  const vendorOptions = useMemo(
    () =>
      (vendorsData?.vendors ?? [])
        .filter((v): v is VendorRow => v?.is_active === true)
        .map((v) => ({ value: v.id, label: v.name })),
    [vendorsData],
  )

  const reset = () => {
    setProductId('')
    setDescription('')
    setQty('1')
    setUom('')
    setVendorId('')
    setPrice('')
    setCurrency(defaultCurrency ?? 'IQD')
    setFile(null)
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const pickProduct = (id: string) => {
    setProductId(id)
    const p = products.find((x) => x.id === id)
    // A catalog item names the line and brings its unit, both still editable.
    if (p) {
      setDescription('')
      if (!uom.trim() && p.uom) setUom(p.uom)
    }
  }

  async function upload(f: File): Promise<string> {
    const { data } = await requestUploadUrl({
      variables: {
        filename: f.name,
        mimeType: uploadMimeType(f),
        sizeBytes: f.size,
        category: 'attachment',
      },
    })
    const fileId = data?.requestUploadUrl.fileId
    if (!fileId) throw new Error(t('req.bought.couldNotPrepareUpload'))
    const apiBase = import.meta.env.VITE_API_URL
    const res = await fetch(`${apiBase}/api/v1/files/${fileId}/content`, {
      method: 'POST',
      body: f,
      headers: {
        'Content-Type': uploadMimeType(f),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new Error(body.error?.message ?? res.statusText)
    }
    return fileId
  }

  const fail = (message: string) => {
    addToast({ message, type: 'error' })
  }

  async function save() {
    const quantity = parseFloat(qty)
    const unitPrice = parseFloat(price)
    if (!productId && !description.trim()) {
      fail(t('req.review.addErrName'))
      return
    }
    if (!(quantity > 0)) {
      fail(t('req.review.addErrQty'))
      return
    }
    if (!vendorId) {
      fail(t('req.review.addErrVendor'))
      return
    }
    if (!(unitPrice > 0)) {
      fail(t('req.review.addErrPrice'))
      return
    }
    if (!file) {
      fail(t('req.review.addErrReceipt'))
      return
    }
    setBusy(true)
    let receiptFileId: string
    try {
      receiptFileId = await upload(file)
    } catch (e) {
      setBusy(false)
      fail(
        t('req.review.addErrUpload', {
          reason: uploadErrorDetail(e) ?? (e instanceof Error ? e.message : String(e)),
        }),
      )
      return
    }
    try {
      await addLine({
        variables: {
          input: {
            requisitionId,
            productId: productId || undefined,
            description: description.trim() || undefined,
            qty: quantity,
            uom: uom.trim() || undefined,
            vendorId,
            actualUnitPrice: unitPrice,
            currencyCode: currency,
            receiptFileId,
          },
        },
      })
    } catch (e) {
      setBusy(false)
      fail(e instanceof Error ? e.message : String(e))
      return
    }
    setBusy(false)
    addToast({ message: t('req.review.toastAdded'), type: 'success' })
    reset()
    onAdded()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('req.review.addTitle')}
      size="md"
      footer={
        <>
          <ActionButton variant="outline" onClick={close} disabled={busy}>
            {t('req.review.cancel')}
          </ActionButton>
          <ActionButton
            variant="solid"
            loading={busy}
            onClick={() => {
              void save()
            }}
          >
            {t('req.review.addSave')}
          </ActionButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '13px', color: theme.textSecondary }}>
          {t('req.review.addIntro')}
        </div>
        <SearchableSelect
          field
          label={t('req.review.addItemLabel')}
          value={productId}
          onChange={pickProduct}
          options={productOptions}
        />
        <Input
          field
          label={t('req.review.addNameLabel')}
          placeholder={t('req.review.addNamePlaceholder')}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
          }}
        />
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}
        >
          <Input
            field
            label={t('req.review.addQtyLabel')}
            type="number"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value)
            }}
          />
          <Input
            field
            label={t('req.review.addUnitLabel')}
            placeholder="unit"
            value={uom}
            onChange={(e) => {
              setUom(e.target.value)
            }}
          />
        </div>
        <SearchableSelect
          field
          label={t('req.review.addVendorLabel')}
          placeholder={t('req.review.addVendorPlaceholder')}
          value={vendorId}
          onChange={setVendorId}
          options={vendorOptions}
        />
        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: theme.textSecondary,
              marginBottom: '6px',
            }}
          >
            {t('req.review.addPriceLabel')}
          </div>
          <MoneyField
            value={price}
            onChange={setPrice}
            ariaLabel={t('req.review.addPriceLabel')}
            currency={currency}
            onCurrencyChange={setCurrency}
            currencies={CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]}
            currencyAriaLabel={t('req.review.addCurrencyAria')}
          />
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
            {t('req.review.addReceiptLabel')}
          </div>
          <ReceiptDropZone
            files={file ? [file] : []}
            // One receipt per purchase: a file picked or dropped later replaces the first.
            onAdd={(added) => {
              setFile(added.at(-1) ?? null)
            }}
            onRemove={() => {
              setFile(null)
            }}
            onClear={() => {
              setFile(null)
            }}
            browseLabel={t('req.review.addBrowse')}
            addMoreLabel={t('req.review.addMore')}
            hint={t('req.review.addReceiptHint')}
            clearLabel={t('req.review.addClear')}
            removeLabel={(name) => t('req.review.addRemoveFile', { name })}
            disabled={busy}
          />
        </div>
      </div>
    </Modal>
  )
}
