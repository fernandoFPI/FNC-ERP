import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PENDING_PRODUCT_CATALOG_ITEMS_QUERY,
  CREATE_PRODUCT_FROM_PENDING_CATALOG_ITEM,
  LINK_PENDING_CATALOG_ITEM_TO_PRODUCT,
  DISMISS_PENDING_CATALOG_ITEM,
  PRODUCTS_QUERY,
  MY_COMPANIES_QUERY,
} from '../../../graphql/inventory'
import { GET_USER_PO_POSITIONS } from '../../../graphql/permissions'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useToastStore } from '../../../store/toastStore'
import { useAuth } from '../../../hooks/useAuth'
import { usePermission } from '../../../hooks/usePermission'
import { useCompanyStore } from '../../../store/companyStore'
import { formatDate } from '../../../lib/format'
import { useProductStoreCategories } from '../../../hooks/useProductStoreCategories'

const ARABIC_RE = /[؀-ۿ]/

interface PendingItem {
  id: string
  po_id: string
  po_number: string
  po_line_id: string
  description: string
  qty?: string | null
  uom?: string | null
  unit_price?: string | null
  currency_code?: string | null
  source: string
  created_at: string
}

interface UserPOPosition {
  position: string
  isActive: boolean
  projectId?: string | null
  departmentId?: string | null
}

interface ProductOption {
  id: string
  name: string
  name_ar?: string | null
  sku: string
}

interface CompanyOption {
  id: string
  name: string
}

export default function PendingCatalogItemsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const { user } = useAuth()
  const { isSystemLevel } = usePermission()
  const activeCompanyId = useCompanyStore((s) => s.activeCompany?.id)

  const { data: posData, loading: posLoading } = useQuery<{
    userPOPositions: UserPOPosition[]
  }>(GET_USER_PO_POSITIONS, {
    variables: { userId: user?.id },
    skip: !user?.id,
    fetchPolicy: 'cache-and-network',
  })
  // Mirrors the server-side check in createProductFromPendingCatalogItem /
  // linkPendingCatalogItemToProduct — see resolvers.ts.
  const hasCompanyWideStoreKeeper = (posData?.userPOPositions ?? []).some(
    (p) => p.position === 'store_keeper' && p.isActive && !p.projectId && !p.departmentId,
  )
  const canResolve = isSystemLevel || hasCompanyWideStoreKeeper

  const { data, loading, refetch } = useQuery<{ pendingProductCatalogItems: PendingItem[] }>(
    PENDING_PRODUCT_CATALOG_ITEMS_QUERY,
    { fetchPolicy: 'cache-and-network', skip: !canResolve },
  )
  const { data: companiesData } = useQuery<{ myCompanies: CompanyOption[] }>(MY_COMPANIES_QUERY, {
    skip: !canResolve,
  })
  const [createProduct, { loading: creating }] = useMutation(
    CREATE_PRODUCT_FROM_PENDING_CATALOG_ITEM,
  )
  const [linkProduct, { loading: linking }] = useMutation(LINK_PENDING_CATALOG_ITEM_TO_PRODUCT)
  const [dismissItem, { loading: dismissing }] = useMutation(DISMISS_PENDING_CATALOG_ITEM)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'new' | 'link' | 'dismiss' | null>(null)
  const [dismissReason, setDismissReason] = useState('')
  const [newForm, setNewForm] = useState({
    name: '',
    name_ar: '',
    category: 'raw_material',
    sub_category: '',
    uom: '',
    sku: '',
  })
  const [linkProductId, setLinkProductId] = useState('')
  // Which company's catalog this resolution should land in — defaults to the
  // pending item's own (current) company; the store keeper can point it at a
  // different company they hold a role in (e.g. the factory that actually
  // carries inventory for a company that doesn't run its own).
  const [targetCompanyId, setTargetCompanyId] = useState('')

  // cache-and-network — without it, reopening the Link panel after
  // resolving an earlier pending item (as new or linked) can keep serving
  // the catalog snapshot from the first time this query ran, missing
  // whatever was just added. The product you're looking for silently isn't
  // in the search dropdown, so the only visible path left is "Catalog as
  // New" — which is how "onion" ends up catalogued three separate times
  // instead of linked twice.
  const {
    data: productsData,
    refetch: refetchProducts,
  } = useQuery<{ products: ProductOption[] }>(PRODUCTS_QUERY, {
    variables: { companyId: targetCompanyId || undefined },
    skip: !canResolve || mode !== 'link',
    fetchPolicy: 'cache-and-network',
  })
  // Reflects whichever company the resolution currently targets — falls back
  // to the caller's own when nothing's been picked yet (panel not open).
  const { categories: storeCategories } = useProductStoreCategories(
    targetCompanyId || activeCompanyId || undefined,
  )

  const items = data?.pendingProductCatalogItems ?? []
  const products = productsData?.products ?? []
  const companies = companiesData?.myCompanies ?? []

  function openNew(item: PendingItem) {
    setExpandedId(item.id)
    setMode('new')
    setTargetCompanyId(activeCompanyId ?? '')
    setNewForm({
      name: item.description,
      name_ar: ARABIC_RE.test(item.description) ? item.description : '',
      category: 'raw_material',
      sub_category: '',
      uom: item.uom ?? 'unit',
      sku: '',
    })
  }

  function openLink(item: PendingItem) {
    setExpandedId(item.id)
    setMode('link')
    setTargetCompanyId(activeCompanyId ?? '')
    setLinkProductId('')
  }

  function openDismiss(item: PendingItem) {
    setExpandedId(item.id)
    setMode('dismiss')
    setDismissReason('')
  }

  function closeExpanded() {
    setExpandedId(null)
    setMode(null)
  }

  async function handleCreate(item: PendingItem) {
    try {
      await createProduct({
        variables: {
          id: item.id,
          input: {
            name: newForm.name.trim(),
            name_ar: newForm.name_ar.trim() || undefined,
            category: newForm.category || undefined,
            sub_category:
              newForm.category === 'raw_material' ? newForm.sub_category || undefined : undefined,
            uom: newForm.uom.trim() || 'unit',
            sku: newForm.sku.trim() || undefined,
          },
          companyId: targetCompanyId && targetCompanyId !== activeCompanyId ? targetCompanyId : undefined,
        },
      })
      addToast({ type: 'success', message: t('inv.catalog.productAddedToCatalog') })
      closeExpanded()
      void refetch()
      // So the very next pending item for the same thing (e.g. another PO's
      // "onion" line) finds this one in the Link Existing dropdown instead
      // of the catalog snapshot from before it existed.
      void refetchProducts()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleLink(item: PendingItem) {
    if (!linkProductId) return
    try {
      await linkProduct({
        variables: {
          id: item.id,
          productId: linkProductId,
          companyId: targetCompanyId && targetCompanyId !== activeCompanyId ? targetCompanyId : undefined,
        },
      })
      addToast({ type: 'success', message: t('inv.catalog.linkedToExistingProduct') })
      closeExpanded()
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleDismiss(item: PendingItem) {
    try {
      await dismissItem({
        variables: { id: item.id, reason: dismissReason.trim() || undefined },
      })
      addToast({ type: 'success', message: t('inv.catalog.dismissed') })
      closeExpanded()
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  if (posLoading && !posData) {
    return (
      <div style={{ padding: '24px' }}>
        <PageHeader
          title={t('inv.catalog.newItemsToCatalog')}
          subtitle={t('inv.catalog.itemsReceivedWithNoMatchingCatalog')}
        />
      </div>
    )
  }

  if (!canResolve) {
    return (
      <div style={{ padding: '24px', margin: '0 auto', maxWidth: '680px' }}>
        <PageHeader
          title={t('inv.catalog.newItemsToCatalog')}
          subtitle={t('inv.catalog.itemsReceivedWithNoMatchingCatalog')}
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
            {t('inv.catalog.storeKeeperPositionRequired')}
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted, maxWidth: '380px' }}>
            {t('inv.catalog.catalogingNewItemsRequiresTheCompany')}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div data-tour="pending-catalog-page" style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        title={t('inv.catalog.newItemsToCatalog')}
        subtitle={t('inv.catalog.awaitingCataloging', { count: items.length })}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            {t('inv.catalog.refresh')}
          </Button>
        }
      />

      {loading && items.length === 0 ? (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: '72px', borderRadius: '10px', animation: 'fnc-shimmer 1.5s ease-in-out infinite' }}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card style={{ marginTop: '20px' }}>
          <EmptyState
            title={t('inv.catalog.nothingToCatalog')}
            message={t('inv.catalog.everyReceivedItemIsAlreadyLinked')}
          />
        </Card>
      ) : (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map((item) => {
            const isExpanded = expandedId === item.id
            return (
              <Card key={item.id} style={{ padding: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                      {item.description}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: theme.textMuted,
                        marginTop: '4px',
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{ cursor: 'pointer', color: theme.accent }}
                        onClick={() => {
                          navigate(`/procurement/purchase-orders/${item.po_id}`)
                        }}
                      >
                        {item.po_number}
                      </span>
                      <span>
                        {item.qty ? parseFloat(item.qty).toLocaleString() : '—'} {item.uom ?? ''}
                      </span>
                      {item.unit_price && (
                        <span>
                          {parseFloat(item.unit_price).toLocaleString()} {item.currency_code}
                        </span>
                      )}
                      <Badge variant="neutral" size="sm">
                        {item.source === 'direct_delivery'
                          ? t('inv.catalog.directToJobsite')
                          : item.source === 'stock_issuance'
                            ? t('inv.catalog.issuedFromStock')
                            : t('inv.catalog.storeIn')}
                      </Badge>
                      <span>{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                  {!isExpanded && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <Button variant="ghost" size="sm" onClick={() => { openDismiss(item); }}>
                        {t('inv.catalog.notACatalogItem')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => { openLink(item); }}>
                        {t('inv.catalog.linkExisting')}
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => { openNew(item); }}>
                        {t('inv.catalog.catalogAsNew')}
                      </Button>
                    </div>
                  )}
                </div>

                {isExpanded && mode === 'new' && (
                  <div
                    style={{
                      marginTop: '14px',
                      paddingTop: '14px',
                      borderTop: `1px solid ${theme.border}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    {companies.length > 1 && (
                      <Select
                        label={t('inv.catalog.catalogCompany')}
                        value={targetCompanyId}
                        onChange={(e) => { setTargetCompanyId(e.target.value); }}
                      >
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    )}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      <Input
                        label={t('inv.catalog.name')}
                        value={newForm.name}
                        onChange={(e) => { setNewForm((f) => ({ ...f, name: e.target.value })); }}
                      />
                      <Input
                        label={t('inv.catalog.nameArabic')}
                        value={newForm.name_ar}
                        onChange={(e) => { setNewForm((f) => ({ ...f, name_ar: e.target.value })); }}
                        placeholder={t('inv.catalog.optional')}
                      />
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      <Select
                        label={t('inv.catalog.category')}
                        value={newForm.category}
                        onChange={(e) => {
                          const val = e.target.value
                          setNewForm((f) => ({
                            ...f,
                            category: val,
                            sub_category: val !== 'raw_material' ? '' : f.sub_category,
                          }))
                        }}
                      >
                        <option value="">{t('inv.catalog.none')}</option>
                        <option value="raw_material">{t('inv.catalog.rawMaterial')}</option>
                        <option value="finished_goods">{t('inv.catalog.finishedGoods')}</option>
                        <option value="consumable">{t('inv.catalog.consumable')}</option>
                        <option value="service">{t('inv.catalog.service')}</option>
                      </Select>
                      {newForm.category === 'raw_material' && (
                        <Select
                          label={t('inv.catalog.storeSubCategory')}
                          value={newForm.sub_category}
                          onChange={(e) =>
                            { setNewForm((f) => ({ ...f, sub_category: e.target.value })); }
                          }
                        >
                          <option value="">{t('inv.catalog.genericSku')}</option>
                          {storeCategories.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      )}
                      <Input
                        label={t('inv.catalog.uom')}
                        value={newForm.uom}
                        onChange={(e) => { setNewForm((f) => ({ ...f, uom: e.target.value })); }}
                      />
                      <Input
                        label={t('inv.catalog.sku')}
                        value={newForm.sku}
                        onChange={(e) => { setNewForm((f) => ({ ...f, sku: e.target.value })); }}
                        placeholder={t('inv.catalog.autoGenerated')}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        variant="primary"
                        loading={creating}
                        disabled={!newForm.name.trim()}
                        onClick={() => void handleCreate(item)}
                      >
                        {t('inv.catalog.addToInventory')}
                      </Button>
                      <Button variant="ghost" onClick={closeExpanded}>
                        {t('inv.catalog.cancel')}
                      </Button>
                    </div>
                  </div>
                )}

                {isExpanded && mode === 'link' && (
                  <div
                    style={{
                      marginTop: '14px',
                      paddingTop: '14px',
                      borderTop: `1px solid ${theme.border}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    {companies.length > 1 && (
                      <Select
                        label={t('inv.catalog.catalogCompany')}
                        value={targetCompanyId}
                        onChange={(e) => {
                          setTargetCompanyId(e.target.value)
                          setLinkProductId('')
                        }}
                      >
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    )}
                    <SearchableSelect
                      value={linkProductId}
                      onChange={setLinkProductId}
                      placeholder={t('inv.catalog.searchByNameOrSku')}
                      options={products.map((p) => ({
                        value: p.id,
                        label: p.name,
                        sublabel: p.sku,
                        keywords: p.name_ar ?? undefined,
                      }))}
                      minDropdownWidth={400}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        variant="primary"
                        loading={linking}
                        disabled={!linkProductId}
                        onClick={() => void handleLink(item)}
                      >
                        {t('inv.catalog.linkProduct')}
                      </Button>
                      <Button variant="ghost" onClick={closeExpanded}>
                        {t('inv.catalog.cancel')}
                      </Button>
                    </div>
                  </div>
                )}

                {isExpanded && mode === 'dismiss' && (
                  <div
                    style={{
                      marginTop: '14px',
                      paddingTop: '14px',
                      borderTop: `1px solid ${theme.border}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      {t('inv.catalog.notACatalogItemHint')}
                    </div>
                    <Textarea
                      label={t('inv.catalog.dismissReasonOptional')}
                      value={dismissReason}
                      onChange={(e) => {
                        setDismissReason(e.target.value)
                      }}
                      rows={2}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button variant="primary" loading={dismissing} onClick={() => void handleDismiss(item)}>
                        {t('inv.catalog.confirmDismiss')}
                      </Button>
                      <Button variant="ghost" onClick={closeExpanded}>
                        {t('inv.catalog.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
