// Regression: ProjectDetail's inline contract form offered billing methods the
// system can't store (lump_sum, remeasure, unit_rate, milestone_based, hybrid).
// The gateway's updateProjectContract silently saves any value it doesn't
// recognise as fixed_lump_sum, so changing the billing method "did nothing".
// Both contract forms now share this one list.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONTRACT_BILLING_METHODS, DEFAULT_CONTRACT_BILLING_METHOD } from '../contractBilling'

describe('contract billing methods', () => {
  it('lists exactly the four values project_contracts.default_billing_method accepts', () => {
    // migration 021: CHECK (default_billing_method IN ('milestone','progress','cost_plus','fixed_lump_sum'))
    expect(CONTRACT_BILLING_METHODS.map((m) => m.value).sort()).toEqual([
      'cost_plus',
      'fixed_lump_sum',
      'milestone',
      'progress',
    ])
  })

  it('has a readable label for every method, and a default that is one of them', () => {
    for (const m of CONTRACT_BILLING_METHODS) {
      expect(m.label.trim().length).toBeGreaterThan(0)
      expect(m.label).not.toBe(m.value)
    }
    expect(CONTRACT_BILLING_METHODS.map((m) => m.value)).toContain(DEFAULT_CONTRACT_BILLING_METHOD)
  })

  it.each([
    ['ContractForm', '../../pages/projects/contracts/ContractForm.tsx'],
    ['ProjectDetail', '../../pages/projects/detail/ProjectDetail.tsx'],
  ])('%s uses the shared list instead of defining its own', (_name, rel) => {
    const src = readFileSync(resolve(__dirname, rel), 'utf8')
    expect(src).toContain("from '../../../lib/contractBilling'")
    // The old private list and its values must not come back.
    expect(src).not.toMatch(/const (CONTRACT_)?BILLING_METHODS\b/)
    for (const stale of [
      "'lump_sum'",
      "'remeasure'",
      "'unit_rate'",
      "'milestone_based'",
      "'hybrid'",
    ]) {
      expect(src).not.toContain(stale)
    }
  })
})
