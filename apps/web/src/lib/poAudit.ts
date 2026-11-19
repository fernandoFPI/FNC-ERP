// The Finance audit step of a purchase order, in one place: how far the audit has got (read by the card's header, the bar and
// the Pass Audit button, so they cannot disagree) and the price comparison finance reads on every line (playbook #24, #41).

export interface AuditLine {
  audit_status?: string | null
}

export interface AuditProgress {
  total: number
  ok: number
  flagged: number
  /** Not marked yet (no status, or `pending`). */
  pending: number
  /** Lines someone has marked, either way. */
  checked: number
  /** The audit can be passed: nothing is flagged and nothing is left to check. */
  canPass: boolean
}

export function auditProgress(lines: AuditLine[]): AuditProgress {
  const flagged = lines.filter((l) => l.audit_status === 'flagged').length
  const pending = lines.filter((l) => !l.audit_status || l.audit_status === 'pending').length
  const ok = lines.filter((l) => l.audit_status === 'ok').length
  return {
    total: lines.length,
    ok,
    flagged,
    pending,
    checked: lines.length - pending,
    canPass: flagged === 0 && pending === 0,
  }
}

export interface AuditPriceLine {
  qty: number | string
  qty_from_stock?: number | string | null
  unit_price: number | string
  actual_unit_price?: number | string | null
}

export interface AuditPrices {
  /** The price on the order. */
  poPrice: number
  /** What the buyer paid per unit; null until the buyer has recorded it. */
  actualPrice: number | null
  /** How much is bought (not taken from stock). */
  toBuy: number
  /** actual - PO price, when both exist. */
  variance: number | null
  /** The variance as a percentage of the PO price. */
  variancePct: number | null
  /** What was bought, at the actual price (or the PO price while none is recorded). */
  purchaseTotal: number
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0))
  return Number.isFinite(n) ? n : 0
}

export function auditPrices(line: AuditPriceLine): AuditPrices {
  const poPrice = num(line.unit_price)
  const actualPrice = line.actual_unit_price != null ? num(line.actual_unit_price) : null
  const toBuy = Math.max(0, num(line.qty) - num(line.qty_from_stock))
  const variance = actualPrice != null && poPrice > 0 ? actualPrice - poPrice : null
  const variancePct = variance != null && poPrice > 0 ? (variance / poPrice) * 100 : null
  return {
    poPrice,
    actualPrice,
    toBuy,
    variance,
    variancePct,
    purchaseTotal: toBuy * (actualPrice ?? poPrice),
  }
}
