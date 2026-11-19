// The shared overlay hook. Found in a real browser, not in the unit tests: the Help drawer did not close on Escape when
// it was opened from the phone's navigation menu. Cause: the hook registered its Escape listener in an effect that
// depended on `onClose`, which the app shell passes as a new inline function on every render. The shell's own Escape
// handler (it also closes the phone navigation) runs first and changes state; the re-render re-registered the overlay's
// listener in the middle of that dispatch, and a listener added during a dispatch is not called for that event. On a
// desktop nothing re-renders, so it worked there.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { fireEvent, render } from '@testing-library/react'
import { useOverlay } from '../overlay'

afterEach(() => {
  document.body.style.overflow = ''
  vi.restoreAllMocks()
})

function Panel({ onClose, open = true }: { onClose: () => void; open?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useOverlay({ open, onClose, panelRef: ref })
  return <div ref={ref} tabIndex={-1} data-testid="panel" />
}

// Registers an Escape listener that re-renders its parent SYNCHRONOUSLY, like a state change that React flushes between
// two listeners of one event. It sits before the panel, so its effect (and listener) is registered first.
function Changer({ bump }: { bump: () => void }) {
  useEffect(() => {
    const handler = () => {
      flushSync(bump)
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [bump])
  return null
}

function Host({ spy }: { spy: () => void }) {
  const [, setN] = useState(0)
  const bump = useRef(() => {
    setN((n) => n + 1)
  })
  return (
    <>
      <Changer bump={bump.current} />
      {/* a new function on every render, as the app shell passes it */}
      <Panel
        onClose={() => {
          spy()
        }}
      />
    </>
  )
}

describe('useOverlay and Escape', () => {
  it('still closes when an earlier Escape listener re-renders the page during the same dispatch', () => {
    const spy = vi.fn()
    render(<Host spy={spy} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('keeps working for the next Escape too (once closed it is the caller that decides)', () => {
    const spy = vi.fn()
    render(<Host spy={spy} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does not re-register its listener when the caller passes a new onClose', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const keydownCalls = (spy: typeof add) =>
      spy.mock.calls.filter((c) => c[0] === 'keydown').length
    const { rerender } = render(<Panel onClose={() => undefined} />)
    const added = keydownCalls(add)
    expect(added).toBe(1)
    rerender(<Panel onClose={() => undefined} />)
    rerender(<Panel onClose={() => undefined} />)
    expect(keydownCalls(add)).toBe(added)
    expect(keydownCalls(remove)).toBe(0)
  })

  it('calls the NEWEST onClose, not the one it was opened with', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Panel onClose={first} />)
    rerender(<Panel onClose={second} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('removes its listener when it closes', () => {
    const spy = vi.fn()
    const { rerender } = render(<Panel onClose={spy} />)
    rerender(<Panel onClose={spy} open={false} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(spy).not.toHaveBeenCalled()
  })
})
