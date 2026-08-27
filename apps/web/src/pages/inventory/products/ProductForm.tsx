import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PRODUCT_QUERY,
  PRODUCTS_QUERY,
  CREATE_PRODUCT,
  UPDATE_PRODUCT,
} from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Textarea } from '../../../components/ui/Textarea'
import { Checkbox } from '../../../components/ui/Checkbox'
import { useToastStore } from '../../../store/toastStore'

// Matches the real store list in use across the product catalog — each of
// these has its own SKU prefix (see PRODUCT_STORE_SKU_PREFIXES in
// @fnc-erp/db) that a new product's SKU is auto-generated from.
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

export default function ProductForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({
    sku: '',
    name: '',
    name_ar: '',
    description: '',
    // Defaults to Raw Material since that's what ~99.9% of real products
    // are — otherwise the Store dropdown (which only shows for that
    // category, and is what actually drives SKU auto-generation) stays
    // hidden until the user picks it manually, which isn't obvious.
    category: 'raw_material',
    sub_category: '',
    uom: 'pc',
    valuation_method: 'avco',
    standard_cost: '0',
    reorder_point: '',
    reorder_qty: '',
    is_active: true,
  })

  const { data: productData } = useQuery(PRODUCT_QUERY, {
    variables: { id },
    skip: !isEdit,
  })

  useEffect(() => {
    const p = productData?.product
    if (!p) return
    setForm({
      sku: p.sku ?? '',
      name: p.name ?? '',
      name_ar: p.name_ar ?? '',
      description: p.description ?? '',
      category: p.category ?? '',
      sub_category: p.sub_category ?? '',
      uom: p.uom ?? 'pc',
      valuation_method: p.valuation_method ?? 'avco',
      standard_cost: String(p.standard_cost ?? '0'),
      reorder_point: p.reorder_point ? String(p.reorder_point) : '',
      reorder_qty: p.reorder_qty ? String(p.reorder_qty) : '',
      is_active: p.is_active ?? true,
    })
  }, [productData])

  const [createProduct, { loading: creating }] = useMutation(CREATE_PRODUCT)
  const [updateProduct, { loading: updating }] = useMutation(UPDATE_PRODUCT)

  const field =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const input = {
        sku: form.sku.trim() || undefined,
        name: form.name,
        name_ar: form.name_ar || undefined,
        description: form.description || undefined,
        category: form.category || undefined,
        sub_category: form.sub_category || undefined,
        uom: form.uom,
        valuation_method: form.valuation_method,
        standard_cost: parseFloat(form.standard_cost),
        reorder_point: form.reorder_point ? parseFloat(form.reorder_point) : undefined,
        reorder_qty: form.reorder_qty ? parseFloat(form.reorder_qty) : undefined,
        is_active: form.is_active,
      }
      if (isEdit) {
        await updateProduct({ variables: { id, input } })
        addToast({ type: 'success', message: 'Product updated' })
      } else {
        await createProduct({
          variables: { input },
          refetchQueries: [{ query: PRODUCTS_QUERY, variables: {} }],
        })
        addToast({ type: 'success', message: 'Product created' })
      }
      navigate('/inventory/products')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const loading = creating || updating

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '900px' }}>
      <PageHeader
        title={isEdit ? 'Edit Product' : 'New Product'}
        subtitle={isEdit ? 'Update product details' : 'Add a new product'}
        backPath="/inventory/products"
      />

      <form onSubmit={handleSubmit}>
        <Card
          style={{
            marginTop: '20px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: '16px' }}>
            <Input
              label={isEdit ? 'SKU' : 'SKU (optional)'}
              value={form.sku}
              onChange={field('sku')}
              placeholder={isEdit ? undefined : 'Auto-generated from Category/Store below'}
              disabled={isEdit}
            />
            <Input label="Product Name" value={form.name} onChange={field('name')} required />
            <Input
              label="Arabic Name"
              value={form.name_ar}
              onChange={field('name_ar')}
              placeholder="الاسم بالعربي"
              style={{ direction: 'rtl' }}
            />
          </div>

          <Textarea
            label="Description"
            value={form.description}
            onChange={field('description')}
            rows={2}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '16px',
            }}
          >
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => {
                const val = e.target.value
                setForm((f) => ({
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
            {form.category === 'raw_material' && (
              <Select
                label="Store / Sub-category"
                value={form.sub_category}
                onChange={field('sub_category')}
              >
                <option value="">— All Stores —</option>
                {RAW_MATERIAL_SUB_CATEGORIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
            <Input label="UOM" value={form.uom} onChange={field('uom')} placeholder="pc, kg, L…" />
            <Select
              label="Valuation"
              value={form.valuation_method}
              onChange={field('valuation_method')}
            >
              <option value="avco">AVCO</option>
              <option value="fifo">FIFO</option>
              <option value="standard">Standard Cost</option>
            </Select>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '16px',
            }}
          >
            <Input
              label="Standard Cost"
              type="number"
              step="0.01"
              min="0"
              value={form.standard_cost}
              onChange={field('standard_cost')}
            />
            <Input
              label="Reorder Point"
              type="number"
              step="0.01"
              min="0"
              value={form.reorder_point}
              onChange={field('reorder_point')}
              placeholder="Optional"
            />
            <Input
              label="Reorder Qty"
              type="number"
              step="0.01"
              min="0"
              value={form.reorder_qty}
              onChange={field('reorder_qty')}
              placeholder="Optional"
            />
          </div>

          <Checkbox
            label="Active"
            checked={form.is_active}
            onChange={(checked) => {
              setForm((f) => ({ ...f, is_active: checked }))
            }}
          />

          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              borderTop: `1px solid ${theme.border}`,
              paddingTop: '16px',
            }}
          >
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                navigate('/inventory/products')
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              {isEdit ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
