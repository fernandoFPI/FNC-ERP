import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PENDING_PRODUCT_CATALOG_ITEMS_QUERY,
  CREATE_PRODUCT_FROM_PENDING_CATALOG_ITEM,
  LINK_PENDING_CATALOG_ITEM_TO_PRODUCT,
  PRODUCTS_QUERY,
} from '../../../graphql/inventory'
import { GET_USER_PO_POSITIONS } from '../../../graphql/permissions'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Input } from '../../../components/ui/Input'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useToastStore } from '../../../store/toastStore'
import { useAuth } from '../../../hooks/useAuth'
import { usePermission } from '../../../hooks/usePermission'
import { formatDate } from '../../../lib/format'

// Matches the real store list in use across the product catalog — see
// ProductForm.tsx, which uses the same list for the same reason (each
// entry drives SKU auto-generation via PRODUCT_STORE_SKU_PREFIXES).
const RAW_MATERIAL_SUB_CATEGORIES = [
  'AC Unit Store',
  'Cleaning Materials Store',
  'Ducts Store',
  'Electrical Equipment Store',
  'Factory Store',
  'Frame Store',
  'Furniture Store',
  'General Construction Store',
  'General Store',
  'Iron Doors Store',
  'Old Iron Boards Store',
  'Outside Area Cables',
  'Paint Store',
  'Plumbing Store',
  'PVC & Aluminum Store',
  'PVC Store',
  'Safety Store',
  'Sandwich, Plywood, Vinyl',
  'Steel Store',
]

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

export default function PendingCatalogItemsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
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
  const { data: productsData } = useQuery<{ products: ProductOption[] }>(PRODUCTS_QUERY, {
    skip: !canResolve,
  })
  const [createProduct, { loading: creating }] = useMutation(
    CREATE_PRODUCT_FROM_PENDING_CATALOG_ITEM,
  )
  const [linkProduct, { loading: linking }] = useMutation(LINK_PENDING_CATALOG_ITEM_TO_PRODUCT)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'new' | 'link' | null>(null)
  const [newForm, setNewForm] = useState({
    name: '',
    name_ar: '',
    category: 'raw_material',
    sub_category: '',
    uom: '',
    sku: '',
  })
  const [linkProductId, setLinkProductId] = useState('')

  const items = data?.pendingProductCatalogItems ?? []
  const products = productsData?.products ?? []

  function openNew(item: PendingItem) {
    setExpandedId(item.id)
    setMode('new')
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
    setLinkProductId('')
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
        },
      })
      addToast({ type: 'success', message: 'Product added to catalog' })
      closeExpanded()
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleLink(item: PendingItem) {
    if (!linkProductId) return
    try {
      await linkProduct({ variables: { id: item.id, productId: linkProductId } })
      addToast({ type: 'success', message: 'Linked to existing product' })
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
          title="New Items to Catalog"
          subtitle="Items received with no matching catalog product"
        />
      </div>
    )
  }

  if (!canResolve) {
    return (
      <div style={{ padding: '24px', margin: '0 auto', maxWidth: '680px' }}>
        <PageHeader
          title="New Items to Catalog"
          subtitle="Items received with no matching catalog product"
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
            Store Keeper Position Required
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted, maxWidth: '380px' }}>
            Cataloging new items requires the company-wide Store Keeper position. Contact your
            administrator to be assigned this position.
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div data-tour="pending-catalog-page" style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        title="New Items to Catalog"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'} awaiting cataloging`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            Refresh
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
            title="Nothing to catalog"
            message="Every received item is already linked to a catalog product."
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
                          ? 'Direct to Jobsite'
                          : item.source === 'stock_issuance'
                            ? 'Issued from Stock'
                            : 'Store In'}
                      </Badge>
                      <span>{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                  {!isExpanded && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <Button variant="secondary" size="sm" onClick={() => openLink(item)}>
                        Link Existing
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => openNew(item)}>
                        Catalog as New
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
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      <Input
                        label="Name"
                        value={newForm.name}
                        onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                      />
                      <Input
                        label="Name (Arabic)"
                        value={newForm.name_ar}
                        onChange={(e) => setNewForm((f) => ({ ...f, name_ar: e.target.value }))}
                        placeholder="Optional"
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
                        label="Category"
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
                        <option value="">— None —</option>
                        <option value="raw_material">Raw Material</option>
                        <option value="finished_goods">Finished Goods</option>
                        <option value="consumable">Consumable</option>
                        <option value="service">Service</option>
                      </Select>
                      {newForm.category === 'raw_material' && (
                        <Select
                          label="Store / Sub-category"
                          value={newForm.sub_category}
                          onChange={(e) =>
                            setNewForm((f) => ({ ...f, sub_category: e.target.value }))
                          }
                        >
                          <option value="">— Generic SKU —</option>
                          {RAW_MATERIAL_SUB_CATEGORIES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      )}
                      <Input
                        label="UOM"
                        value={newForm.uom}
                        onChange={(e) => setNewForm((f) => ({ ...f, uom: e.target.value }))}
                      />
                      <Input
                        label="SKU"
                        value={newForm.sku}
                        onChange={(e) => setNewForm((f) => ({ ...f, sku: e.target.value }))}
                        placeholder="Auto-generated"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        variant="primary"
                        loading={creating}
                        disabled={!newForm.name.trim()}
                        onClick={() => void handleCreate(item)}
                      >
                        Add to Inventory
                      </Button>
                      <Button variant="ghost" onClick={closeExpanded}>
                        Cancel
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
                    <SearchableSelect
                      value={linkProductId}
                      onChange={setLinkProductId}
                      placeholder="Search by name or SKU…"
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
                        Link Product
                      </Button>
                      <Button variant="ghost" onClick={closeExpanded}>
                        Cancel
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
