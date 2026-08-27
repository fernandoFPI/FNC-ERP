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

interface Product {
  id: string
  sku: string
  name: string
  name_ar?: string | null
  category?: string
  sub_category?: string
  uom: string
  valuation_method: string
  average_cost: string
  is_active: boolean
  reorder_point?: string
  qty_on_hand?: string
}

const CATEGORY_OPTIONS = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'finished_goods', label: 'Finished Goods' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'service', label: 'Service' },
]

// Matches the real store list in use across the product catalog — see the
// same list in ProductForm.tsx / PRODUCT_STORE_SKU_PREFIXES in @fnc-erp/db.
const RAW_MATERIAL_SUB_CATEGORIES = [
  { value: 'AC Unit Store', label: 'AC Unit Store' },
  { value: 'Cleaning Materials Store', label: 'Cleaning Materials Store' },
  { value: 'Ducts Store', label: 'Ducts Store' },
  { value: 'Electrical Equipment Store', label: 'Electrical Equipment Store' },
  { value: 'Factory Store', label: 'Factory Store' },
  { value: 'Frame Store', label: 'Frame Store' },
  { value: 'Furniture Store', label: 'Furniture Store' },
  { value: 'General Construction Store', label: 'General Construction Store' },
  { value: 'General Store', label: 'General Store' },
  { value: 'Iron Doors Store', label: 'Iron Doors Store' },
  { value: 'Old Iron Boards Store', label: 'Old Iron Boards Store' },
  { value: 'Outside Area Cables', label: 'Outside Area Cables' },
  { value: 'Paint Store', label: 'Paint Store' },
  { value: 'Plumbing Store', label: 'Plumbing Store' },
  { value: 'PVC & Aluminum Store', label: 'PVC & Aluminum Store' },
  { value: 'PVC Store', label: 'PVC Store' },
  { value: 'Safety Store', label: 'Safety Store' },
  { value: 'Sandwich, Plywood, Vinyl', label: 'Sandwich, Plywood, Vinyl' },
  { value: 'Steel Store', label: 'Steel Store' },
]

export default function ProductsPage() {
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

  const { data, loading, refetch } = useQuery(PRODUCTS_QUERY, {
    variables: { category: categoryFilter || undefined },
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('product', () => void refetch())

  const { data: bomsData } = useQuery(BOMS_QUERY, { fetchPolicy: 'cache-and-network' })

  const products: Product[] = data?.products ?? []

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
      header: 'SKU',
      render: (p) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
          {p.sku}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (p) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: theme.textPrimary }}>{p.name}</span>
            {bomProductIds.has(p.id) && <Badge variant="accent">BOM</Badge>}
          </div>
          {p.name_ar && (
            <div style={{ color: theme.textMuted, fontSize: '11px', direction: 'rtl', textAlign: 'left' }}>
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
    { key: 'uom', header: 'UOM', render: (p) => <Badge variant="neutral">{p.uom}</Badge> },
    {
      key: 'valuation_method',
      header: 'Valuation',
      render: (p) => <Badge variant="info">{p.valuation_method}</Badge>,
    },
    {
      key: 'qty_on_hand',
      header: 'On Hand',
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
            {isLow && <Badge variant="danger">Low</Badge>}
          </div>
        )
      },
    },
    {
      key: 'average_cost',
      header: 'Last Cost',
      render: (p) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {parseFloat(p.average_cost).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (p) => (
        <Badge variant={p.is_active ? 'success' : 'neutral'}>
          {p.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Products"
        subtitle={`${filtered.length} products`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/inventory/products/new')
            }}
          >
            New Product
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
            {lowStockCount} product{lowStockCount !== 1 ? 's' : ''} below reorder point
          </span>
          <button
            onClick={() => {
              setShowLowStock(true)
            }}
            style={{
              marginLeft: 'auto',
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
            Show only
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
              label: 'Category',
              value: categoryFilter,
              options: CATEGORY_OPTIONS,
              onChange: (v) => {
                setCategoryFilter(v)
                if (v !== 'raw_material') setSubCategoryFilter('')
              },
            },
            ...(categoryFilter === 'raw_material'
              ? [
                  {
                    key: 'sub_category',
                    label: 'Store',
                    value: subCategoryFilter,
                    options: RAW_MATERIAL_SUB_CATEGORIES,
                    onChange: setSubCategoryFilter,
                  },
                ]
              : []),
          ]}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        >
          <button
            onClick={() => {
              setShowLowStock((s) => !s)
            }}
            style={{
              background: showLowStock ? (theme.warningBg ?? theme.accentBg) : 'transparent',
              border: `1px solid ${showLowStock ? theme.warning : theme.border}`,
              borderRadius: '6px',
              color: showLowStock ? theme.warning : theme.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
              padding: '4px 10px',
            }}
          >
            Low Stock Only
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
            Manufactured Only
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
