import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PRODUCTS_QUERY,
  STOCK_LOCATIONS_QUERY,
  STOCK_BALANCES_QUERY,
  CREATE_STOCK_ADJUSTMENT,
  STOCK_SNAPSHOT_QUERY,
} from '../../../graphql/inventory'
import { GET_USER_PO_POSITIONS } from '../../../graphql/permissions'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { useToastStore } from '../../../store/toastStore'
import { useAuth } from '../../../hooks/useAuth'
import { usePermission } from '../../../hooks/usePermission'
import type { CreateStockAdjustmentMutation, CreateStockAdjustmentMutationVariables, ProductsQuery, ProductsQueryVariables, StockBalancesQuery, StockBalancesQueryVariables, StockLocationsQuery, StockLocationsQueryVariables } from '../../../graphql/generated'

interface UserPOPosition {
  position: string
  isActive: boolean
  projectId?: string | null
  departmentId?: string | null
}

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

export default function StockAdjustmentForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const { user } = useAuth()
  const { isSystemLevel } = usePermission()

  const { data: posData, loading: posLoading } = useQuery<{
    userPOPositions: UserPOPosition[]
  }>(GET_USER_PO_POSITIONS, {
    variables: { userId: user?.id },
    skip: !user?.id,
    fetchPolicy: 'cache-and-network',
  })
  // Creating an adjustment requires the company-wide Store Keeper position —
  // see createStockAdjustment in services/gateway/src/graphql/resolvers.ts for
  // the matching server-side check. This mirrors it so a user without the
  // position sees a clear reason instead of filling out the whole form only
  // to have the submit fail.
  const hasCompanyWideStoreKeeper = (posData?.userPOPositions ?? []).some(
    (p) => p.position === 'store_keeper' && p.isActive && !p.projectId && !p.departmentId,
  )
  const canAdjust = isSystemLevel || hasCompanyWideStoreKeeper

  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [newQty, setNewQty] = useState('')
  const [unitCost, setUnitCost] = useState('')
  // '' means "follow the product's own currency" — only becomes its own
  // value once the user actually picks a different one here.
  const [costCurrencyOverride, setCostCurrencyOverride] = useState('')
  const [notes, setNotes] = useState('')
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10))

  const { data: productsData } = useQuery<ProductsQuery, ProductsQueryVariables>(PRODUCTS_QUERY, { variables: {} })
  const { data: locationsData } = useQuery<StockLocationsQuery, StockLocationsQueryVariables>(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })
  const { data: balanceData } = useQuery<StockBalancesQuery, StockBalancesQueryVariables>(STOCK_BALANCES_QUERY, {
    variables: { productId, locationId },
    skip: !productId || !locationId,
    fetchPolicy: 'cache-and-network',
  })

  const [createAdjustment, { loading }] = useMutation<CreateStockAdjustmentMutation, CreateStockAdjustmentMutationVariables>(CREATE_STOCK_ADJUSTMENT, {
    refetchQueries: [{ query: STOCK_SNAPSHOT_QUERY }],
  })

  const products: {
    id: string
    sku: string
    name: string
    name_ar?: string | null
    uom: string
    average_cost: string
    cost_currency?: string | null
  }[] = (productsData?.products ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const locations: { id: string; name: string; code: string | null; type: string }[] =
    locationsData?.stockLocations ?? []
  const warehouses = locations.filter((l) => l.type === 'warehouse')

  const currentBalance = balanceData?.stockBalances?.[0]
  const currentQty = parseFloat(String(currentBalance?.qty_on_hand ?? 0))
  const currentCost = parseFloat(String(currentBalance?.average_cost ?? 0))

  const selectedProduct = products.find((p) => p.id === productId)
  const effectiveCostCurrency = costCurrencyOverride || selectedProduct?.cost_currency || ''
  const parsedNewQty = parseFloat(newQty)
  const diff = !isNaN(parsedNewQty) ? parsedNewQty - currentQty : null
  const parsedUnitCost = unitCost !== '' ? parseFloat(unitCost) : null
  // A same-qty submission is only ever a no-op for the quantity side — but
  // if a real cost was entered too, it's a legitimate one-time cost
  // correction (see createStockAdjustment's own diff===0 handling), most
  // useful for stock that arrived at $0 via an uncosted opening
  // balance/adjustment and is only now being priced for the first time.
  // Deliberately NOT gated on differing from currentCost (this location's
  // own average_cost) — the product's unified Cost can already be stale
  // relative to it (e.g. after an interco transfer), so a value that
  // happens to match this location is still a real correction worth
  // sending; the backend's own no-op guard is what actually decides.
  const isCostOnlyCorrection =
    diff === 0 && parsedUnitCost !== null && !isNaN(parsedUnitCost) && parsedUnitCost > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId) {
      addToast({ type: 'error', message: t('inv.adjust.selectAProduct') })
      return
    }
    if (!locationId) {
      addToast({ type: 'error', message: t('inv.adjust.selectALocation') })
      return
    }
    if (newQty === '' || isNaN(parsedNewQty) || parsedNewQty < 0) {
      addToast({ type: 'error', message: t('inv.adjust.enterAValidQuantity0Or') })
      return
    }

    try {
      await createAdjustment({
        variables: {
          input: {
            product_id: productId,
            location_id: locationId,
            new_qty: parsedNewQty,
            unit_cost: unitCost ? parseFloat(unitCost) : undefined,
            // Only meaningful alongside a real unit_cost — the backend
            // ignores it otherwise (see StockAdjustmentInput.currency_code).
            currency_code: unitCost && effectiveCostCurrency ? effectiveCostCurrency : undefined,
            notes: notes || undefined,
            adjustment_date: adjustmentDate,
          },
        },
      })
      addToast({ type: 'success', message: t('inv.adjust.stockAdjustedSuccessfully') })
      navigate('/inventory/balances')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  if (posLoading && !posData) {
    return (
      <div style={{ padding: '24px', margin: '0 auto', maxWidth: '680px' }}>
        <PageHeader
          title={t('inv.adjust.stockAdjustment')}
          subtitle={t('inv.adjust.setTheActualOnHandQuantity')}
          backPath="/inventory/balances"
        />
      </div>
    )
  }

  if (!canAdjust) {
    return (
      <div style={{ padding: '24px', margin: '0 auto', maxWidth: '680px' }}>
        <PageHeader
          title={t('inv.adjust.stockAdjustment')}
          subtitle={t('inv.adjust.setTheActualOnHandQuantity')}
          backPath="/inventory/balances"
        />
        <Card
          style={{
            marginTop: '20px',
            padding: '48px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: theme.dangerBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
            }}
          >
            🔒
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary }}>
            {t('inv.adjust.storeKeeperPositionRequired')}
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted, maxWidth: '380px' }}>
            {t('inv.adjust.creatingStockAdjustmentsRequiresTheCompany')}
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              navigate('/inventory/balances')
            }}
            style={{ marginTop: '4px' }}
          >
            {t('inv.adjust.backToStockBalances')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '680px' }}>
      <PageHeader
        title={t('inv.adjust.stockAdjustment')}
        subtitle={t('inv.adjust.setTheActualOnHandQuantity')}
        backPath="/inventory/balances"
      />

      <form onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}>
        <Card
          style={{
            marginTop: '20px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Product + Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <SearchableSelect
              label={t('inv.adjust.product')}
              value={productId}
              onChange={(value) => {
                setProductId(value)
                setUnitCost('')
              }}
              options={products.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: p.sku,
                keywords: p.name_ar ?? undefined,
              }))}
              placeholder={t('inv.adjust.searchProduct')}
              required
            />

            <Select
              label={t('inv.adjust.location')}
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value)
              }}
              required
            >
              <option value="">{t('inv.adjust.selectLocation')}</option>
              {warehouses.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </Select>
          </div>

          {/* Current balance display */}
          {productId && locationId && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
                display: 'flex',
                gap: '32px',
                fontSize: '13px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  {t('inv.adjust.currentQtyOnHand')}
                </div>
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                  {currentQty.toFixed(4)} {selectedProduct?.uom ?? ''}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  {t('inv.adjust.lastCost')}
                </div>
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                  {currentCost.toFixed(4)} {currentBalance?.last_cost_currency ?? ''}
                </div>
              </div>
              {diff !== null && diff !== 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                    {t('inv.adjust.adjustment')}
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : theme.textMuted,
                    }}
                  >
                    {diff > 0 ? '+' : ''}
                    {diff.toFixed(4)} {selectedProduct?.uom ?? ''}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* New qty + cost + currency + date */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
            <Input
              label={`${t('inv.adjust.newQty')}${selectedProduct ? ` (${selectedProduct.uom})` : ''}`}
              type="number"
              min="0"
              step="0.0001"
              value={newQty}
              onChange={(e) => {
                setNewQty(e.target.value)
              }}
              placeholder={currentQty.toFixed(4)}
              required
            />
            <Input
              label={t('inv.adjust.unitCostOptional')}
              type="number"
              min="0"
              step="0.0001"
              value={unitCost}
              onChange={(e) => {
                setUnitCost(e.target.value)
              }}
              placeholder={currentCost > 0 ? currentCost.toFixed(4) : '0.0000'}
            />
            <Select
              label={t('inv.adjust.costCurrency')}
              value={effectiveCostCurrency}
              onChange={(e) => {
                setCostCurrencyOverride(e.target.value)
              }}
            >
              <option value="">{t('inv.adjust.notSet')}</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Input
              label={t('inv.adjust.adjustmentDate')}
              type="date"
              value={adjustmentDate}
              onChange={(e) => {
                setAdjustmentDate(e.target.value)
              }}
              required
            />
          </div>

          <Textarea
            label={t('inv.adjust.reasonNotes')}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
            }}
            placeholder={t('inv.adjust.eGPhysicalCountOn2026')}
            rows={3}
          />

          {/* Cost-only correction hint */}
          {isCostOnlyCorrection && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '7px',
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
                fontSize: '13px',
                color: theme.textSecondary,
              }}
            >
              {t('inv.adjust.costOnlyNote', {
                from: currentCost.toFixed(4),
                fromCurrency: currentBalance?.last_cost_currency ?? '',
                to: parsedUnitCost.toFixed(4),
                toCurrency: effectiveCostCurrency,
              })}
            </div>
          )}

          {/* Warning if reducing to zero */}
          {diff !== null && diff < 0 && parsedNewQty === 0 && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '7px',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                fontSize: '13px',
                color: '#991b1b',
              }}
            >
              {t('inv.adjust.thisWillZeroOutStockFor')}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                navigate('/inventory/balances')
              }}
            >
              {t('inv.adjust.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={diff === 0 && !isCostOnlyCorrection}
            >
              {diff === null
                ? t('inv.adjust.applyAdjustment')
                : diff === 0
                  ? isCostOnlyCorrection
                    ? t('inv.adjust.updateCostOnly')
                    : t('inv.adjust.noChange')
                  : t('inv.adjust.applyAdjustment', { diff: `${diff > 0 ? '+' : ''}${diff.toFixed(4)}` })}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
