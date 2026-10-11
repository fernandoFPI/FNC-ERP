import { tl } from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { BOMS_QUERY } from '../../../graphql/manufacturing'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { useProductStoreCategories } from '../../../hooks/useProductStoreCategories'

const FILTER_DEFAULTS = {
  search: '',
  category: '',
  subCategory: '',
  showLowStock: 'false',
  showHasBom: 'false',
}
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import type { BoMsQuery, BoMsQueryVariables, ProductsQuery, ProductsQueryVariables } from '../../../graphql/generated'

interface Product {
  id: string
  sku: string
  name: string
  name_ar?: string | null
  category?: string | null
  sub_category?: string | null
  uom: string
  valuation_method: string
  average_cost: string
  cost_currency?: string | null
  is_active: boolean
  reorder_point?: string | null
  qty_on_hand?: string | null
}

const CATEGORY_OPTIONS = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'finished_goods', label: 'Finished Goods' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'service', label: 'Service' },
]

export default function ProductsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [subCategoryFilter, setSubCategoryFilter] = useState('')
  const [showLowStock, setShowLowStock] = useState(false)
  const [showHasBom, setShowHasBom] = useState(false)
  const currentFilters = {
    search,
    category: categoryFilter,
    subCategory: subCategoryFilter,
    showLowStock: String(showLowStock),
    showHasBom: String(showHasBom),
  }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'products',
    FILTER_DEFAULTS,
  )
  const { categories: storeCategories } = useProductStoreCategories()
  const subCategoryOptions = storeCategories.map((c) => ({ value: c.name, label: c.name }))

  const { data, loading, refetch } = useQuery<ProductsQuery, ProductsQueryVariables>(PRODUCTS_QUERY, {
    variables: { category: categoryFilter || undefined },
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('product', () => void refetch())

  const { data: bomsData } = useQuery<BoMsQuery, BoMsQueryVariables>(BOMS_QUERY, { fetchPolicy: 'cache-and-network' })

  const products: Product[] = (data?.products ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  const bomProductIds = useMemo<Set<string>>(() => {
    const boms: { finished_product_id: string }[] = bomsData?.boms ?? []
    return new Set(boms.map((b) => b.finished_product_id))
  }, [bomsData])
  const lowStockCount = products.filter(
    (p) =>
      p.reorder_point && p.qty_on_hand && parseFloat(p.qty_on_hand) < parseFloat(p.reorder_point),
  ).length
  const filtered = products.filter((p) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !p.sku.toLowerCase().includes(q) &&
        !p.name.toLowerCase().includes(q) &&
        !(p.name_ar ?? '').toLowerCase().includes(q)
      )
        return false
    }
    if (subCategoryFilter && p.sub_category !== subCategoryFilter) return false
    if (showLowStock) {
      const isLow =
        p.reorder_point && p.qty_on_hand && parseFloat(p.qty_on_hand) < parseFloat(p.reorder_point)
      if (!isLow) return false
    }
    if (showHasBom && !bomProductIds.has(p.id)) return false
    return true
  })

  const columns: Column<Product>[] = [
    {
      key: 'sku',
      header: t('inv.products.sku'),
      render: (p) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
          {p.sku}
        </span>
      ),
    },
    {
      key: 'name',
      header: t('inv.products.name'),
      render: (p) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: theme.textPrimary }}>{p.name}</span>
            {bomProductIds.has(p.id) && <Badge variant="accent">{t('inv.products.bom')}</Badge>}
          </div>
          {p.name_ar && (
            <div style={{ color: theme.textMuted, fontSize: '11px', direction: 'rtl', textAlign: 'start' }}>
              {p.name_ar}
            </div>
          )}
          {p.sub_category ? (
            <div style={{ color: theme.textMuted, fontSize: '11px' }}>{p.sub_category}</div>
          ) : (
            p.category && (
              <div style={{ color: theme.textMuted, fontSize: '11px' }}>{p.category}</div>
            )
          )}
        </div>
      ),
    },
    { key: 'uom', header: t('inv.products.uom'), render: (p) => <Badge variant="neutral">{p.uom}</Badge> },
    {
      key: 'valuation_method',
      header: t('inv.products.valuation'),
      render: () => <Badge variant="info">{t('inv.products.lastRecordedCost')}</Badge>,
    },
    {
      key: 'qty_on_hand',
      header: t('inv.products.onHand'),
      render: (p) => {
        const qty = parseFloat(p.qty_on_hand ?? '0')
        const reorder = p.reorder_point ? parseFloat(p.reorder_point) : null
        const isLow = reorder !== null && qty < reorder
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'monospace',
                color: isLow ? '#dc2626' : theme.textPrimary,
                fontWeight: isLow ? 700 : 400,
              }}
            >
              {qty.toLocaleString()}
            </span>
            {isLow && <Badge variant="danger">{t('inv.products.low')}</Badge>}
          </div>
        )
      },
    },
    {
      key: 'average_cost',
      header: t('inv.products.lastCost'),
      render: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
            {parseFloat(p.average_cost).toLocaleString()}
          </span>
          {p.cost_currency ? (
            <span style={{ fontSize: '11px', color: theme.textMuted }}>{p.cost_currency}</span>
          ) : (
            <Badge variant="warning">{t('inv.products.currencyNotSet')}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: t('inv.products.status'),
      render: (p) => (
        <Badge variant={p.is_active ? 'success' : 'neutral'}>
          {p.is_active ? t('inv.products.active') : t('inv.products.inactive')}
        </Badge>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title={t('inv.products.products')}
        subtitle={`${filtered.length} products`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/inventory/products/new')
            }}
          >
            {t('inv.products.newProduct')}
          </Button>
        }
      />

      {lowStockCount > 0 && (
        <div
          style={{
            marginTop: '16px',
            marginBottom: '4px',
            padding: '14px 18px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#991b1b' }}>
            {t('inv.products.lowStock', { count: lowStockCount })}
          </span>
          <button
            onClick={() => {
              setShowLowStock(true)
            }}
            style={{
              marginInlineStart: 'auto',
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid #dc2626',
              background: 'transparent',
              color: '#dc2626',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('inv.products.showOnly')}
          </button>
        </div>
      )}

      <Card style={{ marginTop: '8px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'category',
              label: t('inv.products.category'),
              value: categoryFilter,
              options: CATEGORY_OPTIONS.map((o) => ({ ...o, label: tl('inv.products.categoryOpts', o.value, o.label) })),
              onChange: (v) => {
                setCategoryFilter(v)
                if (v !== 'raw_material') setSubCategoryFilter('')
              },
            },
            ...(categoryFilter === 'raw_material'
              ? [
                  {
                    key: 'sub_category',
                    label: t('inv.products.store'),
                    value: subCategoryFilter,
                    options: subCategoryOptions,
                    onChange: setSubCategoryFilter,
                  },
                ]
              : []),
          ]}
          resultCount={filtered.length}
          onRefresh={() => void refetch()}
        >
          <button
            onClick={() => {
              setShowLowStock((s) => !s)
            }}
            style={{
              background: showLowStock ? theme.warningBg : 'transparent',
              border: `1px solid ${showLowStock ? theme.warning : theme.border}`,
              borderRadius: '6px',
              color: showLowStock ? theme.warning : theme.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
              padding: '4px 10px',
            }}
          >
            {t('inv.products.lowStockOnly')}
          </button>
          <button
            onClick={() => {
              setShowHasBom((s) => !s)
            }}
            style={{
              background: showHasBom ? theme.accentBg : 'transparent',
              border: `1px solid ${showHasBom ? theme.accent : theme.border}`,
              borderRadius: '6px',
              color: showHasBom ? theme.accent : theme.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
              padding: '4px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                background: showHasBom ? theme.accent : theme.textMuted,
              }}
            />
            {t('inv.products.manufacturedOnly')}
          </button>
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
              setCategoryFilter(r.category)
              setSubCategoryFilter(r.subCategory)
              setShowLowStock(r.showLowStock === 'true')
              setShowHasBom(r.showHasBom === 'true')
            }}
            onSave={(name) => {
              savePreset(name, currentFilters)
            }}
            onDelete={deletePreset}
          />
        </FilterBar>
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="id"
          onRowClick={(p) => {
            navigate(`/inventory/products/${p.id}`)
          }}
        />
      </Card>
    </div>
  )
}
