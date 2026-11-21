// Stale stock cost (playbook #111): the screen's half of the rule. The server decides whether a product's Cost is OLD (`cost_stale`, in
// the stages where it matters: services/gateway/src/lib/staleStockCost.ts). Whether the line is actually DRAWN FROM STOCK is the screen's
// question, because at the Inventory Check the quantity is still being typed and is saved only when the check is confirmed.

/** Mirror of the server's limit, used only in the sentence the person reads. Pinned to the server file by a test. */
export const STOCK_COST_STALE_DAYS = 30

export interface StaleCostLine {
  id: string
  product_id?: string | null
  product_name?: string | null
  description?: string | null
  sku?: string | null
  qty_from_stock?: string | null
  cost_stale?: boolean | null
  cost_age_days?: number | null
}

export interface StaleCostOptions {
  /** The quantity being typed at the Inventory Check; omit it everywhere else, where the saved quantity is used. */
  liveQty?: number
  /** The store keeper picked a different item for this line: the server's age belongs to the original one, so nothing is claimed. */
  overridden?: boolean
}

/** A line is flagged when it is drawn from stock AND the server says the Cost behind its price is old. */
export function isStaleStockLine(line: StaleCostLine, opts: StaleCostOptions = {}): boolean {
  if (!line.cost_stale || opts.overridden) return false
  const qty = opts.liveQty ?? (parseFloat(line.qty_from_stock ?? '0') || 0)
  return qty > 0
}

export interface StaleCostItem {
  productId: string
  name: string
  sku: string | null
  days: number
}

/** One entry per ITEM (the same product on two lines is one thing to check), in line order, carrying the oldest age. */
export function staleCostItems(
  lines: readonly StaleCostLine[],
  isStale: (line: StaleCostLine) => boolean,
): StaleCostItem[] {
  const byProduct = new Map<string, StaleCostItem>()
  for (const l of lines) {
    if (!l.product_id || !isStale(l)) continue
    const days = l.cost_age_days ?? STOCK_COST_STALE_DAYS + 1
    const seen = byProduct.get(l.product_id)
    if (seen) {
      seen.days = Math.max(seen.days, days)
      continue
    }
    byProduct.set(l.product_id, {
      productId: l.product_id,
      name: l.product_name ?? l.description ?? l.sku ?? '—',
      sku: l.sku ?? null,
      days,
    })
  }
  return [...byProduct.values()]
}
