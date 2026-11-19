import { describe, it, expect } from 'vitest'
import {
  PO_STATUSES,
  CHILD_PO_STATUSES,
  PO_PHASES,
  CHILD_PO_PHASES,
  getPhasesForPO,
  getPOPhaseLabel,
  getPOStatusLabel,
} from '../po-constants'
import i18n from '../../i18n'

const flat = (phases: readonly { statuses: readonly string[] }[]) =>
  phases.flatMap((p) => [...p.statuses])

describe('PO phases', () => {
  it('place every whole-flow status in exactly one phase, in the order of the status list', () => {
    expect(flat(PO_PHASES)).toEqual(PO_STATUSES.map((s) => s.key))
  })

  it('place every child-PO status in exactly one phase, in the order of the status list', () => {
    expect(flat(CHILD_PO_PHASES)).toEqual(CHILD_PO_STATUSES.map((s) => s.key))
  })

  it('give each phase a distinct key', () => {
    for (const phases of [PO_PHASES, CHILD_PO_PHASES]) {
      const keys = phases.map((p) => p.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('draw the child phases for a PO forked from a requisition and the whole flow otherwise', () => {
    expect(getPhasesForPO({ requisition_id: 'r1' })).toBe(CHILD_PO_PHASES)
    expect(getPhasesForPO({ requisition_id: null })).toBe(PO_PHASES)
    expect(getPhasesForPO({})).toBe(PO_PHASES)
  })

  it('label a child PO phase exactly as its status, so the bar names the step once', () => {
    for (const p of CHILD_PO_PHASES) {
      expect(getPOPhaseLabel(p.key)).toBe(getPOStatusLabel(p.statuses[0]))
    }
  })

  it('label the whole-flow phases, in English and in Arabic', async () => {
    const english = PO_PHASES.map((p) => getPOPhaseLabel(p.key))
    expect(english).toEqual(['Prepare', 'Price', 'Approve', 'Buy and receive', 'Finance', 'Done'])
    await i18n.changeLanguage('ar')
    try {
      const arabic = PO_PHASES.map((p) => getPOPhaseLabel(p.key))
      expect(arabic.every((l) => /[؀-ۿ]/.test(l))).toBe(true)
      expect(new Set(arabic).size).toBe(arabic.length)
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('falls back to the key for a phase nobody labelled', () => {
    expect(getPOPhaseLabel('nonexistent_phase')).toBe('nonexistent_phase')
  })
})
