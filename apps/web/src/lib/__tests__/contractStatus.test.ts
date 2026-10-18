// Regression: ProjectDetail's inline contract form offered the statuses
// 'suspended' and 'terminated', which project_contracts.status (CHECK: draft,
// active, completed, cancelled) rejects, so picking either one failed on save.
// The form now uses this one list, pinned to what the database accepts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONTRACT_STATUSES } from '../contractStatus'

describe('contract statuses', () => {
  it('lists exactly the four values project_contracts.status accepts', () => {
    // migration 021 CHECK (draft, active, completed, cancelled)
    expect([...CONTRACT_STATUSES].sort()).toEqual(['active', 'cancelled', 'completed', 'draft'])
  })

  it('ProjectDetail uses the shared list instead of defining its own', () => {
    const src = readFileSync(
      resolve(__dirname, '../../pages/projects/detail/ProjectDetail.tsx'),
      'utf8',
    )
    expect(src).toContain("from '../../../lib/contractStatus'")
    expect(src).not.toMatch(/const CONTRACT_STATUS_LIST\b/)
  })
})
