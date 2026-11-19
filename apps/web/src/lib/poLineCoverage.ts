// "How much of this line has arrived?" answered in ONE place (playbook #41). The Next Step panel counted a line as covered
// when `received + from stock >= ordered`, while the Lines table's Received column counted only `received >= ordered`, so a
// line covered entirely from stock read 100 % in one place and "0/n received" in the other. Both now read this.

export interface CoverageLine {
  qty: number | string
  qty_received?: number | string | null
  qty_from_stock?: number | string | null
}

export type CoverageState = 'full' | 'partial' | 'none'

export interface LineCoverage {
  ordered: number
  /** What physically arrived. */
  received: number
  /** What stock already covers (a Store Out, not a purchase). */
  fromStock: number
  /** received + fromStock exactly as recorded, so an over-receipt still reads as more than ordered. */
  arrived: number
  /** received + fromStock, never more than ordered (what the bar and the percentage use). */
  covered: number
  /** 0 to 100. */
  pct: number
  state: CoverageState
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0))
  return Number.isFinite(n) ? n : 0
}

export function lineCoverage(line: CoverageLine): LineCoverage {
  const ordered = num(line.qty)
  const received = num(line.qty_received)
  const fromStock = num(line.qty_from_stock)
  const arrived = received + fromStock
  const covered = Math.min(ordered, arrived)
  const pct = ordered > 0 ? Math.min(100, Math.round((covered / ordered) * 100)) : 0
  const state: CoverageState =
    covered >= ordered && ordered > 0 ? 'full' : covered > 0 ? 'partial' : 'none'
  return { ordered, received, fromStock, arrived, covered, pct, state }
}

export interface OrderCoverage {
  lines: number
  fullyCovered: number
  /** Every line is covered (an order with no lines is not). */
  complete: boolean
}

export function orderCoverage(lines: CoverageLine[]): OrderCoverage {
  const fullyCovered = lines.filter((l) => lineCoverage(l).state === 'full').length
  return {
    lines: lines.length,
    fullyCovered,
    complete: lines.length > 0 && fullyCovered === lines.length,
  }
}
