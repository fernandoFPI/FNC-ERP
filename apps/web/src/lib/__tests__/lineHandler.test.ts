import { describe, it, expect } from 'vitest'
import { lineHandlerName } from '../lineHandler'

const req = { organizerName: 'Jane Doe', procurementOfficerName: 'Ahmed Ali' }

describe('lineHandlerName', () => {
  it("names the organizer on a line he took, and the pricing officer on procurement's", () => {
    expect(lineHandlerName({ owner_handles: true, purchases: [] }, req)).toBe('Jane Doe')
    expect(lineHandlerName({ owner_handles: false, purchases: [] }, req)).toBe('Ahmed Ali')
  })

  it('treats a missing flag as procurement', () => {
    expect(lineHandlerName({}, req)).toBe('Ahmed Ali')
  })

  it('names whoever recorded the purchase instead, whichever side the line was given to', () => {
    const bought = [{ bought_by_name: 'Sara Hassan' }]
    expect(lineHandlerName({ owner_handles: false, purchases: bought }, req)).toBe('Sara Hassan')
    // procurement stepping in on the organizer's line: the buyer, not the organizer
    expect(lineHandlerName({ owner_handles: true, purchases: bought }, req)).toBe('Sara Hassan')
  })

  it('lists each buyer once when several purchases were recorded', () => {
    const purchases = [
      { bought_by_name: 'Sara Hassan' },
      { bought_by_name: 'Omar Khalid' },
      { bought_by_name: 'Sara Hassan' },
    ]
    expect(lineHandlerName({ owner_handles: false, purchases }, req)).toBe(
      'Sara Hassan, Omar Khalid',
    )
  })

  it('ignores a purchase with no buyer name and falls back to the side', () => {
    const purchases = [{ bought_by_name: null }, { bought_by_name: '   ' }]
    expect(lineHandlerName({ owner_handles: true, purchases }, req)).toBe('Jane Doe')
  })

  it('has no name for procurement until someone has priced or bought', () => {
    expect(lineHandlerName({ owner_handles: false }, { organizerName: 'Jane Doe' })).toBeNull()
    expect(
      lineHandlerName(
        { owner_handles: false },
        { organizerName: 'Jane Doe', procurementOfficerName: '  ' },
      ),
    ).toBeNull()
  })

  it('has no name when the organizer is unknown', () => {
    expect(lineHandlerName({ owner_handles: true }, {})).toBeNull()
  })
})
