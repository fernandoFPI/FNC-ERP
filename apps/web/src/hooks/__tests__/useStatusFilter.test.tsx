// The ticked statuses of a filter, kept for the browser tab so opening a record and coming back keeps them (playbook #70, #126).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStatusFilter } from '../useStatusFilter'

beforeEach(() => {
  window.sessionStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('useStatusFilter', () => {
  it('starts with nothing ticked', () => {
    const { result } = renderHook(() => useStatusFilter('k'))
    expect(result.current[0]).toEqual([])
  })

  it('a change is kept: the value updates and a new mount of the same key gets it back', () => {
    const first = renderHook(() => useStatusFilter('k'))
    act(() => {
      first.result.current[1](['rejected', 'draft'])
    })
    expect(first.result.current[0]).toEqual(['rejected', 'draft'])
    first.unmount()
    const second = renderHook(() => useStatusFilter('k'))
    expect(second.result.current[0]).toEqual(['rejected', 'draft'])
  })

  it('is stored per key, so another project or another list starts clean', () => {
    const a = renderHook(() => useStatusFilter('project-proc-po:1'))
    act(() => {
      a.result.current[1](['rejected'])
    })
    const b = renderHook(() => useStatusFilter('project-proc-po:2'))
    const c = renderHook(() => useStatusFilter('project-proc-req:1'))
    expect(b.result.current[0]).toEqual([])
    expect(c.result.current[0]).toEqual([])
  })

  it("when the key changes the new key's own filter is used, not the old one", () => {
    window.sessionStorage.setItem('two', JSON.stringify(['cancelled']))
    const { result, rerender } = renderHook(({ k }) => useStatusFilter(k), {
      initialProps: { k: 'one' },
    })
    act(() => {
      result.current[1](['rejected'])
    })
    expect(result.current[0]).toEqual(['rejected'])
    rerender({ k: 'two' })
    expect(result.current[0]).toEqual(['cancelled'])
    rerender({ k: 'one' })
    expect(result.current[0]).toEqual(['rejected'])
  })

  it('clearing it removes what was stored', () => {
    const { result } = renderHook(() => useStatusFilter('k'))
    act(() => {
      result.current[1](['rejected'])
    })
    expect(window.sessionStorage.getItem('k')).not.toBeNull()
    act(() => {
      result.current[1]([])
    })
    expect(window.sessionStorage.getItem('k')).toBeNull()
    expect(result.current[0]).toEqual([])
  })

  it('reads nothing that is not a list of strings: corrupt text, an object, a number and non-string items', () => {
    window.sessionStorage.setItem('a', '{not json')
    window.sessionStorage.setItem('b', JSON.stringify({ rejected: true }))
    window.sessionStorage.setItem('c', '42')
    window.sessionStorage.setItem('d', JSON.stringify(['rejected', 7, null, 'draft']))
    expect(renderHook(() => useStatusFilter('a')).result.current[0]).toEqual([])
    expect(renderHook(() => useStatusFilter('b')).result.current[0]).toEqual([])
    expect(renderHook(() => useStatusFilter('c')).result.current[0]).toEqual([])
    expect(renderHook(() => useStatusFilter('d')).result.current[0]).toEqual(['rejected', 'draft'])
  })

  it('storage that cannot be read just means no filter', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useStatusFilter('k'))
    expect(result.current[0]).toEqual([])
  })

  it('storage that cannot be written still lets the filter work for this visit', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    const { result } = renderHook(() => useStatusFilter('k'))
    act(() => {
      result.current[1](['rejected'])
    })
    expect(result.current[0]).toEqual(['rejected'])
  })

  it('the setter keeps the same identity between renders (it is safe in an effect or a handler list)', () => {
    const { result, rerender } = renderHook(() => useStatusFilter('k'))
    const first = result.current[1]
    rerender()
    expect(result.current[1]).toBe(first)
  })
})
