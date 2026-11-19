// The hook that owns the floating photo window: opens it once, brings it forward on the next click, forgets it when it closes,
// falls back when the browser cannot or will not, and closes it when the page goes away.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePhotoPip } from '../usePhotoPip'

type FakeWin = Window & {
  focus: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  fire: (type: string) => void
}

function fakeWindow(): FakeWin {
  const doc = document.implementation.createHTMLDocument('pip')
  const listeners = new Map<string, () => void>()
  const win = {
    document: doc,
    closed: false,
    focus: vi.fn(),
    close: vi.fn(),
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, fn)
    },
    fire: (type: string) => {
      listeners.get(type)?.()
    },
  }
  return win as unknown as FakeWin
}

let requestWindow: ReturnType<typeof vi.fn>
const setApi = (api: unknown) => {
  Object.defineProperty(window, 'documentPictureInPicture', {
    value: api,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  requestWindow = vi.fn()
})
afterEach(() => {
  Reflect.deleteProperty(window, 'documentPictureInPicture')
})

describe('usePhotoPip', () => {
  it('has no window until one is opened', () => {
    setApi({ requestWindow })
    const { result } = renderHook(() => usePhotoPip())
    expect(result.current.win).toBeNull()
  })

  it('opens a window of a readable size, dresses it like the app, and says it worked', async () => {
    const w = fakeWindow()
    requestWindow.mockResolvedValue(w)
    setApi({ requestWindow })
    const style = document.createElement('style')
    style.setAttribute('data-test', '1')
    style.textContent = '.pip-hook-rule { color: blue; }'
    document.head.appendChild(style)
    const { result } = renderHook(() => usePhotoPip())
    let opened = false
    await act(async () => {
      opened = await result.current.open()
    })
    expect(opened).toBe(true)
    expect(requestWindow).toHaveBeenCalledWith({ width: 900, height: 700 })
    expect(result.current.win).toBe(w)
    expect(
      Array.from(w.document.head.querySelectorAll('style')).some((s) =>
        s.textContent.includes('.pip-hook-rule'),
      ),
    ).toBe(true)
    style.remove()
  })

  it('brings an open window forward instead of opening a second one', async () => {
    const w = fakeWindow()
    requestWindow.mockResolvedValue(w)
    setApi({ requestWindow })
    const { result } = renderHook(() => usePhotoPip())
    await act(async () => {
      await result.current.open()
    })
    let again = false
    await act(async () => {
      again = await result.current.open()
    })
    expect(again).toBe(true)
    expect(requestWindow).toHaveBeenCalledTimes(1)
    expect(w.focus).toHaveBeenCalledTimes(1)
  })

  it('forgets the window when the person closes it, and opens a new one next time', async () => {
    const first = fakeWindow()
    const second = fakeWindow()
    requestWindow.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    setApi({ requestWindow })
    const { result } = renderHook(() => usePhotoPip())
    await act(async () => {
      await result.current.open()
    })
    act(() => {
      first.fire('pagehide')
    })
    expect(result.current.win).toBeNull()
    await act(async () => {
      await result.current.open()
    })
    expect(result.current.win).toBe(second)
    expect(requestWindow).toHaveBeenCalledTimes(2)
  })

  it('a window that was closed earlier does not clear the one that replaced it', async () => {
    const first = fakeWindow()
    const second = fakeWindow()
    requestWindow.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    setApi({ requestWindow })
    const { result } = renderHook(() => usePhotoPip())
    await act(async () => {
      await result.current.open()
    })
    ;(first as unknown as { closed: boolean }).closed = true
    await act(async () => {
      await result.current.open()
    })
    act(() => {
      first.fire('pagehide')
    })
    expect(result.current.win).toBe(second)
  })

  it('says no, and opens nothing, in a browser without the API', async () => {
    const { result } = renderHook(() => usePhotoPip())
    let opened = true
    await act(async () => {
      opened = await result.current.open()
    })
    expect(opened).toBe(false)
    expect(result.current.win).toBeNull()
  })

  it('says no when the browser refuses (no user gesture, or it said no)', async () => {
    requestWindow.mockRejectedValue(new DOMException('no gesture', 'NotAllowedError'))
    setApi({ requestWindow })
    const { result } = renderHook(() => usePhotoPip())
    let opened = true
    await act(async () => {
      opened = await result.current.open()
    })
    expect(opened).toBe(false)
    expect(result.current.win).toBeNull()
  })

  it('closes the window when the page that opened it goes away', async () => {
    const w = fakeWindow()
    requestWindow.mockResolvedValue(w)
    setApi({ requestWindow })
    const { result, unmount } = renderHook(() => usePhotoPip())
    await act(async () => {
      await result.current.open()
    })
    unmount()
    expect(w.close).toHaveBeenCalledTimes(1)
  })
})
