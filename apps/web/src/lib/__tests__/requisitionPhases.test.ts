// The five phases on the requisition progress bar group the ten statuses; nothing may fall between them.
import { describe, it, expect, afterEach } from 'vitest'
import i18n from '../../i18n'
import {
  REQUISITION_PHASES,
  REQUISITION_STATUSES,
  getRequisitionPhaseLabel,
} from '../requisition-constants'

afterEach(async () => {
  if (i18n.language !== 'en') await i18n.changeLanguage('en')
})

describe('REQUISITION_PHASES', () => {
  it('puts every status in exactly one phase', () => {
    for (const s of REQUISITION_STATUSES) {
      const inPhases = REQUISITION_PHASES.filter((p) =>
        (p.statuses as readonly string[]).includes(s.key),
      )
      expect(inPhases, `status ${s.key}`).toHaveLength(1)
    }
  })

  it('lists the statuses in the same order as the status list, so the bar reads left to right', () => {
    const flat = REQUISITION_PHASES.flatMap((p) => [...p.statuses])
    expect(flat).toEqual(REQUISITION_STATUSES.map((s) => s.key))
  })

  it('has no empty phase and names a status that does not exist in none', () => {
    const known = REQUISITION_STATUSES.map((s) => s.key as string)
    for (const p of REQUISITION_PHASES) {
      expect(p.statuses.length, `phase ${p.key}`).toBeGreaterThan(0)
      for (const s of p.statuses) expect(known).toContain(s)
    }
  })

  it('leaves the stopped statuses (rejected, cancelled, deleted) outside every phase', () => {
    const flat = REQUISITION_PHASES.flatMap((p) => [...p.statuses]) as string[]
    for (const s of ['rejected', 'cancelled', 'deleted']) expect(flat).not.toContain(s)
  })

  it('has five phases', () => {
    expect(REQUISITION_PHASES.map((p) => p.key)).toEqual([
      'prepare',
      'price',
      'approve',
      'buy',
      'done',
    ])
  })
})

describe('getRequisitionPhaseLabel', () => {
  it('reads the English names', () => {
    expect(REQUISITION_PHASES.map((p) => getRequisitionPhaseLabel(p.key))).toEqual([
      'Prepare',
      'Price',
      'Approve',
      'Buy',
      'Done',
    ])
  })

  it('falls back to the key for a phase it does not know', () => {
    expect(getRequisitionPhaseLabel('somethingNew')).toBe('somethingNew')
  })

  it('has an Arabic name for every phase, different from the English one', async () => {
    await i18n.changeLanguage('ar')
    for (const p of REQUISITION_PHASES) {
      expect(i18n.exists(`req.phase.${p.key}`), `ar req.phase.${p.key}`).toBe(true)
      expect(getRequisitionPhaseLabel(p.key), p.key).not.toBe(
        { prepare: 'Prepare', price: 'Price', approve: 'Approve', buy: 'Buy', done: 'Done' }[p.key],
      )
    }
  })
})
