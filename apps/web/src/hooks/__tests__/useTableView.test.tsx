// The column choice on a table is remembered in the browser, per user and per table, so a refresh
// or opening the next purchase order doesn't put everything back to the defaults.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTableView } from '../useTableView'

const auth = vi.hoisted(() => ({ userId: 'user-a' as string | undefined }))
vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: auth.userId ? { id: auth.userId } : null }),
}))

const keyFor = (user: string, table: string) => `fnc_table_view_v1_${user}_${table}`

beforeEach(() => {
  localStorage.clear()
  auth.userId = 'user-a'
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTableView: defaults', () => {
  it('starts on the defaults when nothing was saved', () => {
    const { result } = renderHook(() => useTableView('po-lines'))
    expect(result.current.isOn('initial_unit_price', false)).toBe(false)
    expect(result.current.isOn('market_price', true)).toBe(true)
    expect(result.current.density).toBe('comfortable')
    expect(result.current.customized).toBe(false)
  })
})

describe('useTableView: remembering', () => {
  it('keeps a column choice after the page is opened again (a refresh, or the next PO)', () => {
    const first = renderHook(() => useTableView('po-lines'))
    act(() => {
      first.result.current.setColumn('initial_unit_price', true, false)
    })
    expect(first.result.current.isOn('initial_unit_price', false)).toBe(true)
    first.unmount()

    const next = renderHook(() => useTableView('po-lines'))
    expect(next.result.current.isOn('initial_unit_price', false)).toBe(true)
    expect(next.result.current.customized).toBe(true)
  })

  it('keeps a column the person switched off, even where the default is on', () => {
    const first = renderHook(() => useTableView('po-lines'))
    act(() => {
      first.result.current.setColumn('notes', false, true)
    })
    first.unmount()
    const next = renderHook(() => useTableView('po-lines'))
    expect(next.result.current.isOn('notes', true)).toBe(false)
  })

  it('stores only what was switched, and a later default change still applies to the rest', () => {
    const { result } = renderHook(() => useTableView('po-lines'))
    act(() => {
      result.current.setColumn('initial_unit_price', true, false)
    })
    expect(JSON.parse(localStorage.getItem(keyFor('user-a', 'po-lines')) ?? '{}')).toEqual({
      columns: { initial_unit_price: true },
      density: 'comfortable',
    })
    // store price follows the stage default until the person decides otherwise
    expect(result.current.isOn('store_price', true)).toBe(true)
    expect(result.current.isOn('store_price', false)).toBe(false)
  })

  it('switching a column back to its default forgets the override', () => {
    const { result } = renderHook(() => useTableView('po-lines'))
    act(() => {
      result.current.setColumn('initial_unit_price', true, false)
    })
    act(() => {
      result.current.setColumn('initial_unit_price', false, false)
    })
    expect(result.current.customized).toBe(false)
    const stored = JSON.parse(localStorage.getItem(keyFor('user-a', 'po-lines')) ?? '{}') as {
      columns: Record<string, boolean>
    }
    expect(stored.columns).toEqual({})
  })

  it('resets the column choices but not the row spacing', () => {
    const { result } = renderHook(() => useTableView('po-lines'))
    act(() => {
      result.current.setColumn('initial_unit_price', true, false)
      result.current.setDensity('compact')
    })
    act(() => {
      result.current.resetColumns()
    })
    expect(result.current.isOn('initial_unit_price', false)).toBe(false)
    expect(result.current.customized).toBe(false)
    expect(result.current.density).toBe('compact')
  })

  it('keeps the row spacing too', () => {
    const first = renderHook(() => useTableView('po-lines'))
    act(() => {
      first.result.current.setDensity('compact')
    })
    first.unmount()
    expect(renderHook(() => useTableView('po-lines')).result.current.density).toBe('compact')
  })
})

describe('useTableView: whose choice it is', () => {
  it("does not hand one person's choice to another person on the same computer", () => {
    const a = renderHook(() => useTableView('po-lines'))
    act(() => {
      a.result.current.setColumn('initial_unit_price', true, false)
    })
    a.unmount()

    auth.userId = 'user-b'
    const b = renderHook(() => useTableView('po-lines'))
    expect(b.result.current.isOn('initial_unit_price', false)).toBe(false)
  })

  it('keeps each table separate', () => {
    const lines = renderHook(() => useTableView('po-lines'))
    act(() => {
      lines.result.current.setColumn('initial_unit_price', true, false)
    })
    lines.unmount()
    expect(
      renderHook(() => useTableView('req-lines')).result.current.isOn('initial_unit_price', false),
    ).toBe(false)
  })

  it('follows the signed-in person when it changes while the page is open', () => {
    localStorage.setItem(
      keyFor('user-b', 'po-lines'),
      JSON.stringify({ columns: { notes: false }, density: 'compact' }),
    )
    const { result, rerender } = renderHook(() => useTableView('po-lines'))
    expect(result.current.density).toBe('comfortable')
    auth.userId = 'user-b'
    rerender()
    expect(result.current.density).toBe('compact')
    expect(result.current.isOn('notes', true)).toBe(false)
  })

  it('uses a shared "anonymous" slot when nobody is signed in rather than failing', () => {
    auth.userId = undefined
    const { result } = renderHook(() => useTableView('po-lines'))
    act(() => {
      result.current.setDensity('compact')
    })
    expect(localStorage.getItem(keyFor('anonymous', 'po-lines'))).not.toBeNull()
  })
})

describe('useTableView: storage that cannot be trusted', () => {
  it.each([
    ['text that is not JSON', 'not json {'],
    ['a JSON value that is not an object', '42'],
    ['null', 'null'],
    ['an array', '[1,2]'],
  ])('falls back to the defaults for %s', (_label, stored) => {
    localStorage.setItem(keyFor('user-a', 'po-lines'), stored)
    const { result } = renderHook(() => useTableView('po-lines'))
    expect(result.current.customized).toBe(false)
    expect(result.current.density).toBe('comfortable')
  })

  it('ignores column values that are not true or false, and an unknown spacing', () => {
    localStorage.setItem(
      keyFor('user-a', 'po-lines'),
      JSON.stringify({ columns: { notes: 'no', qty: false, total: 1 }, density: 'huge' }),
    )
    const { result } = renderHook(() => useTableView('po-lines'))
    expect(result.current.isOn('notes', true)).toBe(true)
    expect(result.current.isOn('total', true)).toBe(true)
    expect(result.current.isOn('qty', true)).toBe(false) // the one valid entry is honoured
    expect(result.current.density).toBe('comfortable')
  })

  it('still works for this visit when the browser refuses to read or write storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    const { result } = renderHook(() => useTableView('po-lines'))
    expect(result.current.customized).toBe(false)
    act(() => {
      result.current.setColumn('initial_unit_price', true, false)
    })
    expect(result.current.isOn('initial_unit_price', false)).toBe(true)
  })
})
