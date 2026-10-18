// Regression: ProjectDetail's inline contract form offered billing methods the
// system couldn't store (lump_sum, remeasure, unit_rate, milestone_based, hybrid).
// The gateway silently saved any billing method it didn't recognise as
// fixed_lump_sum, so changing the billing method "did nothing". Both contract forms
// now share one list, pinned to what the database accepts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONTRACT_BILLING_METHODS, DEFAULT_CONTRACT_BILLING_METHOD } from '../contractBilling'

describe('contract billing methods', () => {
  it('lists exactly the values project_contracts.default_billing_method accepts', () => {
    // migration 021 CHECK (milestone, progress, cost_plus, fixed_lump_sum) widened by
    // migration 306 with remeasure, unit_rate, hybrid
    expect(CONTRACT_BILLING_METHODS.map((m) => m.value).sort()).toEqual([
      'cost_plus',
      'fixed_lump_sum',
      'hybrid',
      'milestone',
      'progress',
      'remeasure',
      'unit_rate',
    ])
  })

  it('has a readable label for every method, and a default that is one of them', () => {
    for (const m of CONTRACT_BILLING_METHODS) {
      expect(m.label.trim().length).toBeGreaterThan(0)
      expect(m.label).not.toBe(m.value)
    }
    expect(CONTRACT_BILLING_METHODS.map((m) => m.value)).toContain(DEFAULT_CONTRACT_BILLING_METHOD)
  })
})

describe('the two contract forms share the billing method list instead of defining their own', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8')
  const contractForm = read('../../pages/projects/contracts/ContractForm.tsx')
  const projectDetail = read('../../pages/projects/detail/ProjectDetail.tsx')

  it.each([
    ['ContractForm', contractForm],
    ['ProjectDetail', projectDetail],
  ])('%s uses the shared billing method list', (_name, src) => {
    expect(src).toContain("from '../../../lib/contractBilling'")
    // The old private lists and their stale values must not come back.
    expect(src).not.toMatch(/const (CONTRACT_)?BILLING_METHODS\b/)
    for (const stale of ["'lump_sum'", "'milestone_based'"]) {
      expect(src).not.toContain(stale)
    }
  })
})
