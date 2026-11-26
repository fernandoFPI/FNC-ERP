// The Overview's Financial Summary figures (playbook #128, NY-PRJ-2026-0032). The card read one currency's entry, so the 10.2 million
// IQD of cost was missing, and it printed 0.00 for a forecast and a profit that cannot be worked out (no % complete, no budget).
import { describe, it, expect } from 'vitest'
import { buildFinancialSummary } from '../projectFinancialSummary'

// what the project query returns for NY-PRJ-2026-0032: cost in two currencies, no budget, 0 % complete
const ny0032 = [
  {
    currencyCode: 'USD',
    actualCosts: 15286.18,
    committedCosts: 0,
    storeCosts: 0,
    budgetAmount: 0,
    budgetRemaining: null,
  },
  {
    currencyCode: 'IQD',
    actualCosts: 10229054.55,
    committedCosts: 0,
    storeCosts: 0,
    budgetAmount: 0,
    budgetRemaining: null,
  },
]

describe('buildFinancialSummary', () => {
  it('makes one column per currency, in a stable order, with each currency its own cost', () => {
    const m = buildFinancialSummary(ny0032, 0, 'USD')
    expect(m.columns.map((c) => c.currency)).toEqual(['IQD', 'USD'])
    expect(m.columns[0]?.actual).toBe(10229054.55)
    expect(m.columns[1]?.actual).toBe(15286.18)
  })

  it('says "cannot be worked out" (null), never 0, for what needs a budget or a % complete', () => {
    const m = buildFinancialSummary(ny0032, 0, 'USD')
    expect(m.hasBudget).toBe(false)
    expect(m.hasCompletion).toBe(false)
    for (const c of m.columns) {
      expect(c.budget).toBeNull()
      expect(c.remaining).toBeNull()
      expect(c.forecast).toBeNull()
      expect(c.profit).toBeNull()
      expect(c.margin).toBeNull()
    }
  })

  it('forecasts from % complete alone, without needing a budget', () => {
    const m = buildFinancialSummary(ny0032, 50, 'USD')
    expect(m.hasCompletion).toBe(true)
    expect(m.columns[1]?.forecast).toBe(30572.36)
    expect(m.columns[0]?.forecast).toBe(20458109.1)
    expect(m.columns[1]?.profit).toBeNull()
  })

  it('works out remaining, profit and margin per currency when a budget exists in that currency only', () => {
    const m = buildFinancialSummary(
      [
        {
          currencyCode: 'USD',
          actualCosts: 400,
          committedCosts: 100,
          budgetAmount: 1000,
          budgetRemaining: 500,
        },
        { currencyCode: 'IQD', actualCosts: 5000, committedCosts: 0, budgetAmount: 0 },
      ],
      50,
      'USD',
    )
    const usd = m.columns.find((c) => c.currency === 'USD')
    const iqd = m.columns.find((c) => c.currency === 'IQD')
    expect(m.hasBudget).toBe(true)
    expect(usd?.remaining).toBe(500)
    expect(usd?.forecast).toBe(800)
    expect(usd?.profit).toBe(200)
    expect(usd?.margin).toBe(20)
    expect(iqd?.budget).toBeNull()
    expect(iqd?.remaining).toBeNull()
    expect(iqd?.profit).toBeNull()
  })

  it('works remaining out itself when the server sends none, and keeps a negative one', () => {
    const m = buildFinancialSummary(
      [{ currencyCode: 'USD', actualCosts: 900, committedCosts: 300, budgetAmount: 1000 }],
      0,
      'USD',
    )
    expect(m.columns[0]?.remaining).toBe(-200)
  })

  it('treats a missing or non-numeric figure as 0 and ignores an entry with no currency', () => {
    const m = buildFinancialSummary(
      [
        { currencyCode: 'USD', actualCosts: 'abc' },
        { actualCosts: 10 },
        { currencyCode: ' ', actualCosts: 5 },
      ],
      0,
      'USD',
    )
    expect(m.columns).toHaveLength(1)
    expect(m.columns[0]?.actual).toBe(0)
    expect(m.columns[0]?.committed).toBe(0)
  })

  it('keeps the first entry of a currency listed twice', () => {
    const m = buildFinancialSummary(
      [
        { currencyCode: 'USD', actualCosts: 1 },
        { currencyCode: 'USD', actualCosts: 2 },
      ],
      0,
      'USD',
    )
    expect(m.columns).toHaveLength(1)
    expect(m.columns[0]?.actual).toBe(1)
  })

  it('shows one empty column in the header currency for a project with no cost summary at all', () => {
    const m = buildFinancialSummary([], undefined, 'IQD')
    expect(m.columns.map((c) => c.currency)).toEqual(['IQD'])
    expect(m.columns[0]?.actual).toBe(0)
    expect(m.hasCompletion).toBe(false)
  })

  it('flags a store price inside committed only when some currency has one', () => {
    expect(buildFinancialSummary(ny0032, 0, 'USD').hasStore).toBe(false)
    const m = buildFinancialSummary(
      [{ currencyCode: 'USD', actualCosts: 1, storeCosts: 12.5 }],
      0,
      'USD',
    )
    expect(m.hasStore).toBe(true)
    expect(m.columns[0]?.store).toBe(12.5)
  })
})
