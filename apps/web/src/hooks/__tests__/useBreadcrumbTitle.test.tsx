// What a record page tells the breadcrumb: its human name once it has loaded, nothing while it has not, and nothing for a blank name.
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBreadcrumbTitle } from '../useBreadcrumbTitle'
import { useBreadcrumbStore } from '../../store/breadcrumbStore'

beforeEach(() => {
  useBreadcrumbStore.setState({ titles: {} })
})

const titles = () => useBreadcrumbStore.getState().titles

describe('useBreadcrumbTitle', () => {
  it('registers the name under the record id', () => {
    renderHook(() => {
      useBreadcrumbTitle('rec-1', 'NF-PO-2026-0083')
    })
    expect(titles()['rec-1']).toBe('NF-PO-2026-0083')
  })

  it('registers nothing while the record has not loaded (no name yet)', () => {
    renderHook(() => {
      useBreadcrumbTitle('rec-1', undefined)
    })
    renderHook(() => {
      useBreadcrumbTitle('rec-2', null)
    })
    expect(titles()).toEqual({})
  })

  it('registers nothing without an id', () => {
    renderHook(() => {
      useBreadcrumbTitle(undefined, 'Name')
    })
    expect(titles()).toEqual({})
  })

  it('ignores a blank name, so an empty string cannot hide the fallback', () => {
    renderHook(() => {
      useBreadcrumbTitle('rec-1', '   ')
    })
    renderHook(() => {
      useBreadcrumbTitle('rec-2', '')
    })
    expect(titles()).toEqual({})
  })

  it('trims the name', () => {
    renderHook(() => {
      useBreadcrumbTitle('rec-1', '  Al Watanyia  ')
    })
    expect(titles()['rec-1']).toBe('Al Watanyia')
  })

  it('registers the name when it arrives after the first render, and again when it changes', () => {
    const { rerender } = renderHook(
      ({ name }: { name: string | undefined }) => {
        useBreadcrumbTitle('rec-1', name)
      },
      { initialProps: { name: undefined as string | undefined } },
    )
    expect(titles()['rec-1']).toBeUndefined()
    rerender({ name: 'First' })
    expect(titles()['rec-1']).toBe('First')
    rerender({ name: 'Renamed' })
    expect(titles()['rec-1']).toBe('Renamed')
  })

  it('keeps the name after the page unmounts, so going back shows it at once', () => {
    const { unmount } = renderHook(() => {
      useBreadcrumbTitle('rec-1', 'Kept')
    })
    unmount()
    expect(titles()['rec-1']).toBe('Kept')
  })
})
