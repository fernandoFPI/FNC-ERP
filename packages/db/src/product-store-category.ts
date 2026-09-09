import { pool } from './client.js'

export interface ProductStoreCategory {
  id: string
  company_id: string
  name: string
  sku_prefix: string
  slug: string
  is_active: boolean
  created_at: string
}

export async function listProductStoreCategories(
  companyId: string,
  includeInactive = false,
): Promise<ProductStoreCategory[]> {
  const result = await pool.query<ProductStoreCategory>(
    `SELECT id, company_id, name, sku_prefix, slug, is_active, created_at
     FROM product_store_categories
     WHERE company_id = $1 ${includeInactive ? '' : 'AND is_active = true'}
     ORDER BY name`,
    [companyId],
  )
  return result.rows
}

// Used by createProduct/createProductFromPendingCatalogItem to resolve a
// picked category name into the SKU prefix it was configured with — the
// same lookup PRODUCT_STORE_SKU_PREFIXES used to do as a static map, now
// backed by the table admins manage themselves.
export async function getProductStoreCategoryPrefix(
  companyId: string,
  name: string,
): Promise<{ prefix: string; slug: string } | null> {
  const result = await pool.query<{ sku_prefix: string; slug: string }>(
    `SELECT sku_prefix, slug FROM product_store_categories
     WHERE company_id=$1 AND name=$2 AND is_active=true`,
    [companyId, name],
  )
  if (!result.rows[0]) return null
  return { prefix: result.rows[0].sku_prefix, slug: result.rows[0].slug }
}

// Slug only has to be a stable, unique key for the matching
// document_sequences row (doc_type = 'product_<slug>') — it's never shown
// to anyone, so a simple ASCII-safe derivation is enough.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export async function createProductStoreCategory(
  companyId: string,
  name: string,
  skuPrefix: string,
  createdBy: string,
): Promise<ProductStoreCategory> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const baseSlug = slugify(name) || 'store'
    let slug = baseSlug
    let n = 2
    // Guard against two different names slugifying to the same value —
    // extremely unlikely given the UNIQUE(company_id, name) constraint
    // already rejects true duplicates, but names differing only in
    // punctuation/case could still collide here.
    while (
      (
        await client.query(
          `SELECT 1 FROM product_store_categories WHERE company_id=$1 AND slug=$2`,
          [companyId, slug],
        )
      ).rows.length > 0
    ) {
      slug = `${baseSlug}_${n}`
      n++
    }
    const prefix = skuPrefix.toUpperCase().trim()
    const row = await client.query<ProductStoreCategory>(
      `INSERT INTO product_store_categories (company_id, name, sku_prefix, slug, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, company_id, name, sku_prefix, slug, is_active, created_at`,
      [companyId, name.trim(), prefix, slug, createdBy],
    )
    // Provision its own SKU counter starting at 1 — a brand-new category has
    // no existing products to continue numbering from (unlike the original
    // 19, which migration 215 seeded from real SKU history).
    await client.query(
      `INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
       VALUES ($1, $2, $3, 1, 3, false, '-')
       ON CONFLICT (company_id, doc_type) DO NOTHING`,
      [companyId, `product_${slug}`, prefix],
    )
    await client.query('COMMIT')
    return row.rows[0]!
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// Deactivate/reactivate only — no rename or prefix change. Renaming would
// orphan every existing product's sub_category text (a plain string match,
// not a foreign key), and changing the prefix wouldn't retroactively fix
// SKUs already issued. If a category was created wrong, deactivate it and
// add a new one instead.
export async function setProductStoreCategoryActive(
  companyId: string,
  id: string,
  isActive: boolean,
): Promise<void> {
  const result = await pool.query(
    `UPDATE product_store_categories SET is_active=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3`,
    [isActive, id, companyId],
  )
  if (result.rowCount === 0) throw new Error('Store category not found')
}
