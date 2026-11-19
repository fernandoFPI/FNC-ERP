// The receipts-and-photos window: where it opens, that it remembers where the person left it (a second screen), that an open window
// is brought forward rather than reloaded, and the zoom limits.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  photoViewerPath,
  readViewerGeometry,
  saveViewerGeometry,
  popupFeatures,
  windowGeometry,
  openPoPhotoViewer,
  clampScale,
  stepScale,
  MIN_SCALE,
  MAX_SCALE,
  ZOOM_STEP,
} from '../poPhotoViewer'

const KEY = 'fnc_po_photo_viewer_window'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('photoViewerPath', () => {
  it('is the viewer route of one PO', () => {
    expect(photoViewerPath('abc-123')).toBe('/viewer/purchase-orders/abc-123/photos')
  })
  it('encodes an id so it cannot change the path', () => {
    expect(photoViewerPath('a/b?c')).toBe('/viewer/purchase-orders/a%2Fb%3Fc/photos')
  })
})

describe('remembering the window', () => {
  it('has nothing saved at first', () => {
    expect(readViewerGeometry()).toBeNull()
  })

  it('gives back what was saved, including a position on a second screen (negative or beyond the first)', () => {
    saveViewerGeometry({ left: -1500, top: 40, width: 900, height: 700 })
    expect(readViewerGeometry()).toEqual({ left: -1500, top: 40, width: 900, height: 700 })
    saveViewerGeometry({ left: 2200, top: 0, width: 1000, height: 800 })
    expect(readViewerGeometry()).toEqual({ left: 2200, top: 0, width: 1000, height: 800 })
  })

  it('ignores a saved value that is not a window (corrupt, wrong type, a sliver of a window)', () => {
    localStorage.setItem(KEY, '{not json')
    expect(readViewerGeometry()).toBeNull()
    localStorage.setItem(KEY, JSON.stringify({ left: 'a', top: 0, width: 800, height: 600 }))
    expect(readViewerGeometry()).toBeNull()
    localStorage.setItem(KEY, JSON.stringify({ left: 0, top: 0, width: 20, height: 600 }))
    expect(readViewerGeometry()).toBeNull()
    localStorage.setItem(KEY, JSON.stringify({ left: 0, top: 0, width: 800, height: 10 }))
    expect(readViewerGeometry()).toBeNull()
    localStorage.setItem(KEY, 'null')
    expect(readViewerGeometry()).toBeNull()
  })

  it('does not save a window that is too small to be real (a minimised window reports 0)', () => {
    saveViewerGeometry({ left: 0, top: 0, width: 0, height: 0 })
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('carries on when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => {
      saveViewerGeometry({ left: 0, top: 0, width: 800, height: 600 })
    }).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readViewerGeometry()).toBeNull()
  })

  it('reads the position and size of a window as the browser reports them', () => {
    const w = {
      screenX: -1920,
      screenY: 30,
      outerWidth: 1000,
      outerHeight: 800,
    } as unknown as Window
    expect(windowGeometry(w)).toEqual({ left: -1920, top: 30, width: 1000, height: 800 })
  })
})

describe('popupFeatures', () => {
  it('opens a window of its own where it was left', () => {
    const f = popupFeatures({ left: -1500.4, top: 20, width: 900, height: 700.6 })
    expect(f).toContain('popup=yes')
    expect(f).toContain('left=-1500')
    expect(f).toContain('top=20')
    expect(f).toContain('width=900')
    expect(f).toContain('height=701')
    expect(f).toContain('resizable=yes')
  })

  it('the first time, opens beside the page that asked for it', () => {
    const opener = { screenX: 100, screenY: 50 } as unknown as Window
    const f = popupFeatures(null, opener)
    expect(f).toContain('left=180')
    expect(f).toContain('top=110')
    expect(f).toContain('width=1000')
    expect(f).toContain('height=820')
  })
})

describe('openPoPhotoViewer', () => {
  const fakeWindow = (closed = false) =>
    ({ closed, focus: vi.fn() }) as unknown as Window & { focus: ReturnType<typeof vi.fn> }

  it('opens the PO viewer in a named popup window and brings it forward', () => {
    const win = fakeWindow()
    const open = vi.spyOn(window, 'open').mockReturnValue(win)
    expect(openPoPhotoViewer('po-open-1')).toBe(win)
    expect(open).toHaveBeenCalledTimes(1)
    const [url, name, features] = open.mock.calls[0]
    expect(url).toBe('/viewer/purchase-orders/po-open-1/photos')
    expect(name).toBe('fnc-po-photos-po-open-1')
    expect(features).toContain('popup=yes')
    expect(win.focus).toHaveBeenCalled()
  })

  it('opens where the person left it last time', () => {
    saveViewerGeometry({ left: 2100, top: 10, width: 1100, height: 900 })
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWindow())
    openPoPhotoViewer('po-open-2')
    expect(open.mock.calls[0][2]).toContain('left=2100')
    expect(open.mock.calls[0][2]).toContain('width=1100')
  })

  it('brings an open window forward instead of opening a second one (the picture being looked at stays)', () => {
    const win = fakeWindow()
    const open = vi.spyOn(window, 'open').mockReturnValue(win)
    openPoPhotoViewer('po-open-3')
    win.focus.mockClear()
    expect(openPoPhotoViewer('po-open-3')).toBe(win)
    expect(open).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('opens again once the person has closed it', () => {
    const first = fakeWindow()
    const open = vi.spyOn(window, 'open').mockReturnValue(first)
    openPoPhotoViewer('po-open-4')
    ;(first as unknown as { closed: boolean }).closed = true
    const second = fakeWindow()
    open.mockReturnValue(second)
    expect(openPoPhotoViewer('po-open-4')).toBe(second)
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('keeps one window per PO', () => {
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValueOnce(fakeWindow())
      .mockReturnValueOnce(fakeWindow())
    openPoPhotoViewer('po-open-5')
    openPoPhotoViewer('po-open-6')
    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[0][1]).not.toBe(open.mock.calls[1][1])
  })

  it('returns null when the browser blocks the window, so the caller can say so', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openPoPhotoViewer('po-open-7')).toBeNull()
  })

  it('a blocked window is not remembered: the next click tries again', () => {
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(fakeWindow())
    expect(openPoPhotoViewer('po-open-8')).toBeNull()
    expect(openPoPhotoViewer('po-open-8')).not.toBeNull()
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('on a phone it opens as a tab, with no window features', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWindow())
    openPoPhotoViewer('po-open-9', { asTab: true })
    expect(open.mock.calls[0]).toHaveLength(2)
  })
})

describe('zoom', () => {
  it('stays between the limits', () => {
    expect(clampScale(100)).toBe(MAX_SCALE)
    expect(clampScale(0.001)).toBe(MIN_SCALE)
    expect(clampScale(2)).toBe(2)
  })
  it('falls back to 100 % for a value that is not a number', () => {
    expect(clampScale(Number.NaN)).toBe(1)
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1)
  })
  it('steps in and out by the same factor, and stops at the limits', () => {
    expect(stepScale(1, 'in')).toBeCloseTo(ZOOM_STEP)
    expect(stepScale(ZOOM_STEP, 'out')).toBeCloseTo(1)
    expect(stepScale(MAX_SCALE, 'in')).toBe(MAX_SCALE)
    expect(stepScale(MIN_SCALE, 'out')).toBe(MIN_SCALE)
  })
})
