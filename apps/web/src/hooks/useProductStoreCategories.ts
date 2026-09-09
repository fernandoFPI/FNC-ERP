import { useState, useEffect } from 'react'
import { api } from '../lib/axios'

export interface ProductStoreCategory {
  id: string
  name: string
  sku_prefix: string
  slug: string
  is_active: boolean
}

// Shared by ProductForm, ProductsPage, and PendingCatalogItemsPage — all
// three need the same active Store/Sub-category list for the raw_material
// picker. Used to be a hardcoded array duplicated in each file; now backed
// by product_store_categories, which admins manage at Settings -> Store
// Categories.
//
// companyId is only needed by PendingCatalogItemsPage's cross-company
// resolution flow, where the product might be created in a different
// company than the caller's own — pass it to load THAT company's own
// categories instead of the caller's.
export function useProductStoreCategories(companyId?: string) {
  const [categories, setCategories] = useState<ProductStoreCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get<{ categories: ProductStoreCategory[] }>('/product-store-categories', {
        params: companyId ? { companyId } : undefined,
      })
      .then((r) => {
        if (!cancelled) setCategories(r.data.categories)
      })
      .catch(() => {
        // Silent — the Select just shows empty; a manual SKU can still be
        // entered directly on the product form either way.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId])

  return { categories, loading }
}
