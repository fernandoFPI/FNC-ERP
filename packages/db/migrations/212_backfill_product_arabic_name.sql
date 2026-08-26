-- ── MIGRATION 212: BACKFILL PRODUCT ARABIC NAME FROM DESCRIPTION ───────────
-- The inventory import tool (services/gateway/src/routes/inventory-import.ts)
-- used to stuff the Arabic name into `description` before `name_ar` existed
-- (fixed alongside this migration). ~6,900 products already have that data
-- sitting in `description` — this moves it into the real field.
--
-- Scoped to descriptions that actually contain Arabic script (Unicode block
-- U+0600-U+06FF) so a genuine English description isn't misfiled as an
-- Arabic name — verified against dev data: 6,895 of 6,896 non-empty
-- descriptions contained Arabic text; the one exception (a real English
-- description, on product FNF-Cons-0012) is correctly left untouched by
-- this WHERE clause.
--
-- Guarded by `name_ar IS NULL` so this is safe to re-run and won't clobber
-- anything already set through the product edit form.

UPDATE products
SET name_ar = description,
    description = NULL,
    updated_at = NOW()
WHERE name_ar IS NULL
  AND description IS NOT NULL
  AND description != ''
  AND description ~ '[؀-ۿ]';
