// The receipts-and-photos viewer of a purchase order is a window of its own, so Finance can drag it to a second screen and keep
// it open while they check the lines. This file opens it, remembers where the person put it (size and position, per browser) and
// holds the zoom rules the viewer uses.

export const photoViewerPath = (poId: string) =>
  `/viewer/purchase-orders/${encodeURIComponent(poId)}/photos`

const GEOMETRY_KEY = 'fnc_po_photo_viewer_window'

export interface WindowGeometry {
  left: number
  top: number
  width: number
  height: number
}

const DEFAULT_SIZE = { width: 1000, height: 820 }
const MIN_SIZE = { width: 360, height: 300 }

function validGeometry(g: unknown): g is WindowGeometry {
  if (typeof g !== 'object' || g === null) return false
  const v = g as Record<string, unknown>
  return (
    ['left', 'top', 'width', 'height'].every(
      (k) => typeof v[k] === 'number' && Number.isFinite(v[k]),
    ) &&
    (v.width as number) >= MIN_SIZE.width &&
    (v.height as number) >= MIN_SIZE.height
  )
}

/** Where the person last left the window; null when they never moved it, or the saved value is unusable. */
export function readViewerGeometry(): WindowGeometry | null {
  try {
    const raw = localStorage.getItem(GEOMETRY_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return validGeometry(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveViewerGeometry(g: WindowGeometry): void {
  if (!validGeometry(g)) return
  try {
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify(g))
  } catch {
    /* storage blocked: the window simply opens in the default place next time */
  }
}

/** The position and size of a browser window, as the browser reports them (outer size, in screen coordinates). */
export function windowGeometry(w: Window): WindowGeometry {
  return { left: w.screenX, top: w.screenY, width: w.outerWidth, height: w.outerHeight }
}

/** The feature string for `window.open`: a window of its own, where it was last left (else beside the page that opens it). */
export function popupFeatures(saved: WindowGeometry | null, opener: Window = window): string {
  const g = saved ?? {
    left: opener.screenX + 80,
    top: opener.screenY + 60,
    width: DEFAULT_SIZE.width,
    height: DEFAULT_SIZE.height,
  }
  return `popup=yes,resizable=yes,left=${Math.round(g.left)},top=${Math.round(g.top)},width=${Math.round(g.width)},height=${Math.round(g.height)}`
}

const open = new Map<string, Window>()

/**
 * Opens (or brings forward) the viewer window of one PO. A window that is already open is focused, not reloaded, so the picture
 * being looked at stays. Returns null when the browser blocked it (the caller says so). On a phone there are no free-floating
 * windows: it opens as a tab instead.
 */
export function openPoPhotoViewer(poId: string, options: { asTab?: boolean } = {}): Window | null {
  const existing = open.get(poId)
  if (existing && !existing.closed) {
    existing.focus()
    return existing
  }
  const url = photoViewerPath(poId)
  const name = `fnc-po-photos-${poId}`
  const win = options.asTab
    ? window.open(url, name)
    : window.open(url, name, popupFeatures(readViewerGeometry()))
  if (!win) return null
  open.set(poId, win)
  win.focus()
  return win
}

// ── zoom ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const MIN_SCALE = 0.25
export const MAX_SCALE = 8
export const ZOOM_STEP = 1.25

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** One step in or out, kept inside the limits. */
export function stepScale(scale: number, direction: 'in' | 'out'): number {
  return clampScale(direction === 'in' ? scale * ZOOM_STEP : scale / ZOOM_STEP)
}
