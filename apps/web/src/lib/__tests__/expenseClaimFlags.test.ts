import { describe, it, expect } from 'vitest'
import { lineFlagState } from '../expenseClaimFlags'

describe('lineFlagState', () => {
  it('is none for a line that was never flagged', () => {
    expect(lineFlagState({})).toBe('none')
    expect(lineFlagState({ flag_reason: null })).toBe('none')
  })

  it('is open while the employee has not resubmitted', () => {
    expect(lineFlagState({ flag_reason: 'No receipt' })).toBe('open')
  })

  it('is fixed once the claim was resubmitted but the approver has not confirmed', () => {
    expect(
      lineFlagState({ flag_reason: 'No receipt', flag_addressed_at: '2026-11-04T10:00:00Z' }),
    ).toBe('fixed')
  })

  it('is none again once the approver confirmed it', () => {
    expect(
      lineFlagState({
        flag_reason: 'No receipt',
        flag_addressed_at: '2026-11-04T10:00:00Z',
        flag_resolved_at: '2026-11-04T11:00:00Z',
      }),
    ).toBe('none')
  })
})
