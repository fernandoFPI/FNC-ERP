// Where goods can be received (playbook #105): a receipt booked into "Virtual Consumption" never becomes stock and never reaches the cost of
// the project it was bought for (NY-PRJ-2026-0032, 13 receipts on production). The pick lists must not offer the two virtual system locations.
import { describe, it, expect } from 'vitest'
import {
  VIRTUAL_LOCATION_TYPES,
  isReceivableLocation,
  receivableLocations,
  receivableLocationsKeeping,
} from '../receivingLocations'

const loc = (id: string, type: string | null | undefined) => ({ id, name: id, type })
const all = [
  loc('warehouse', 'warehouse'),
  loc('site', 'site'),
  loc('transit', 'transit'),
  loc('virtual-in', 'virtual_in'),
  loc('virtual-out', 'virtual_out'),
]

describe('isReceivableLocation', () => {
  it('refuses exactly the two virtual types', () => {
    expect(VIRTUAL_LOCATION_TYPES).toEqual(['virtual_in', 'virtual_out'])
    expect(isReceivableLocation({ type: 'virtual_in' })).toBe(false)
    expect(isReceivableLocation({ type: 'virtual_out' })).toBe(false)
  })

  it('accepts every real type, and a location whose type is not known', () => {
    for (const type of ['warehouse', 'site', 'temporary', 'yard', '', null, undefined]) {
      expect(isReceivableLocation({ type })).toBe(true)
    }
  })

  it('refuses the transit location too: stock waiting there is on a truck, not on a shelf', () => {
    expect(isReceivableLocation({ type: 'transit' })).toBe(false)
  })
})

describe('receivableLocations', () => {
  it('drops Virtual Receipts and Virtual Consumption and keeps the order of the rest', () => {
    expect(receivableLocations(all).map((l) => l.id)).toEqual(['warehouse', 'site'])
  })

  it('returns an empty list for an empty list, and does not change the list it was given', () => {
    expect(receivableLocations([])).toEqual([])
    const copy = [...all]
    receivableLocations(all)
    expect(all).toEqual(copy)
  })
})

describe('receivableLocationsKeeping (editing a receipt that already sits in a virtual location)', () => {
  it('keeps the current virtual location so the box shows what is stored, and no other virtual one', () => {
    expect(receivableLocationsKeeping(all, 'virtual-out').map((l) => l.id)).toEqual([
      'warehouse',
      'site',
      'virtual-out',
    ])
    expect(receivableLocationsKeeping(all, 'virtual-in').map((l) => l.id)).toEqual([
      'warehouse',
      'site',
      'virtual-in',
    ])
  })

  it('is the plain list when the current location is real, empty, or not in the list', () => {
    const plain = ['warehouse', 'site']
    expect(receivableLocationsKeeping(all, 'site').map((l) => l.id)).toEqual(plain)
    expect(receivableLocationsKeeping(all, '').map((l) => l.id)).toEqual(plain)
    expect(receivableLocationsKeeping(all, null).map((l) => l.id)).toEqual(plain)
    expect(receivableLocationsKeeping(all, undefined).map((l) => l.id)).toEqual(plain)
    expect(receivableLocationsKeeping(all, 'someone-elses-location').map((l) => l.id)).toEqual(
      plain,
    )
  })
})
