import { useTranslation } from 'react-i18next'
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
import { useProductStoreCategories } from '../../../hooks/useProductStoreCategories'
import type { CreateProductMutation, CreateProductMutationVariables, ProductQuery, ProductQueryVariables, UpdateProductMutation, UpdateProductMutationVariables } from '../../../graphql/generated'

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

export default function ProductForm() {
  const { t } = useTranslation()
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
    valuation_method: 'last_cost',
    standard_cost: '0',
    // Nullable at the DB level (no default) — '' here means "not yet
    // specified," distinct from a deliberate choice of any listed currency.
    cost_currency: '',
    reorder_point: '',
    reorder_qty: '',
    is_active: true,
  })

  const { data: productData } = useQuery<ProductQuery, ProductQueryVariables>(PRODUCT_QUERY, {
    variables: { id: id ?? '' },
    skip: !isEdit,
  })
  const { categories: storeCategories } = useProductStoreCategories()

  useEffect(() => {
    const p = productData?.product
    if (!p) return
    setForm({
      sku: p.sku,
      name: p.name,
      name_ar: p.name_ar ?? '',
      description: p.description ?? '',
      category: p.category ?? '',
      sub_category: p.sub_category ?? '',
      uom: p.uom,
      valuation_method: p.valuation_method,
      standard_cost: String(p.standard_cost ?? '0'),
      cost_currency: p.cost_currency ?? '',
      reorder_point: p.reorder_point ? String(p.reorder_point) : '',
      reorder_qty: p.reorder_qty ? String(p.reorder_qty) : '',
      is_active: p.is_active,
    })
  }, [productData])

  const [createProduct, { loading: creating }] = useMutation<CreateProductMutation, CreateProductMutationVariables>(CREATE_PRODUCT)
  const [updateProduct, { loading: updating }] = useMutation<UpdateProductMutation, UpdateProductMutationVariables>(UPDATE_PRODUCT)

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
        cost_currency: form.cost_currency || undefined,
        reorder_point: form.reorder_point ? parseFloat(form.reorder_point) : undefined,
        reorder_qty: form.reorder_qty ? parseFloat(form.reorder_qty) : undefined,
        is_active: form.is_active,
      }
      if (isEdit) {
        await updateProduct({ variables: { id, input } })
        addToast({ type: 'success', message: t('inv.productForm.productUpdated') })
      } else {
        await createProduct({
          variables: { input },
          refetchQueries: [{ query: PRODUCTS_QUERY, variables: {} }],
        })
        addToast({ type: 'success', message: t('inv.productForm.productCreated') })
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
        title={isEdit ? t('inv.productForm.editProduct') : t('inv.productForm.newProduct')}
        subtitle={isEdit ? t('inv.productForm.updateProductDetails') : t('inv.productForm.addANewProduct')}
        backPath="/inventory/products"
      />

      <form onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}>
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
              label={isEdit ? t('inv.productForm.sku') : t('inv.productForm.skuOptional')}
              value={form.sku}
              onChange={field('sku')}
              placeholder={isEdit ? undefined : t('inv.productForm.autoGeneratedFromCategoryStoreBelow')}
              disabled={isEdit}
            />
            <Input label={t('inv.productForm.productName')} value={form.name} onChange={field('name')} required />
            <Input
              label={t('inv.productForm.arabicName')}
              value={form.name_ar}
              onChange={field('name_ar')}
              placeholder="الاسم بالعربي"
              style={{ direction: 'rtl' }}
            />
          </div>

          <Textarea
            label={t('inv.productForm.description')}
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
              label={t('inv.productForm.category')}
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
              <option value="">{t('inv.productForm.none')}</option>
              <option value="raw_material">{t('inv.productForm.rawMaterial')}</option>
              <option value="finished_goods">{t('inv.productForm.finishedGoods')}</option>
              <option value="consumable">{t('inv.productForm.consumable')}</option>
              <option value="service">{t('inv.productForm.service')}</option>
            </Select>
            {form.category === 'raw_material' && (
              <Select
                label={t('inv.productForm.storeSubCategory')}
                value={form.sub_category}
                onChange={field('sub_category')}
              >
                <option value="">{t('inv.productForm.allStores')}</option>
                {storeCategories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
            <Input label={t('inv.productForm.uom')} value={form.uom} onChange={field('uom')} placeholder="pc, kg, L…" />
            <Select
              label={t('inv.productForm.valuation')}
              value="last_cost"
              disabled
              onChange={() => {
                /* disabled: value is fixed, no-op required to keep this a controlled input */
              }}
            >
              <option value="last_cost">{t('inv.productForm.lastRecordedCost')}</option>
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
              label={t('inv.productForm.costBom')}
              type="number"
              step="0.01"
              min="0"
              value={form.standard_cost}
              onChange={field('standard_cost')}
            />
            <Select
              label={t('inv.productForm.costCurrency')}
              value={form.cost_currency}
              onChange={field('cost_currency')}
            >
              <option value="">{t('inv.productForm.notSet')}</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Input
              label={t('inv.productForm.reorderPoint')}
              type="number"
              step="0.01"
              min="0"
              value={form.reorder_point}
              onChange={field('reorder_point')}
              placeholder={t('inv.productForm.optional')}
            />
            <Input
              label={t('inv.productForm.reorderQty')}
              type="number"
              step="0.01"
              min="0"
              value={form.reorder_qty}
              onChange={field('reorder_qty')}
              placeholder={t('inv.productForm.optional')}
            />
          </div>

          <Checkbox
            label={t('inv.productForm.active')}
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
              {t('inv.productForm.cancel')}
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              {isEdit ? t('inv.productForm.saveChanges') : t('inv.productForm.createProduct')}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
