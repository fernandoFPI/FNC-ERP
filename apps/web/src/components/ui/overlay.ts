import { useEffect, useRef } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react'

/**
 * What every overlay (modal, drawer, palette) shares, so each one behaves the same:
 *  - Escape closes the TOP overlay only, and not when something inside (a dropdown, a menu) already used the key;
 *  - the page behind is locked while at least one overlay is open (counted, so one of two closing does not unlock it);
 *  - focus moves in on open and goes back to where it was on close;
 *  - Tab stays inside the panel;
 *  - a click outside is ignored once something has been typed or chosen inside.
 * Modal was the first user; Drawer, StageEditDrawer, HelpDrawer and SearchPalette use the same code.
 */

// The overlays that are open right now, oldest first. Escape belongs to the last one, so an overlay opened from another
// (a confirm dialog from a drawer) does not take its parent down with it.
const openOverlays: symbol[] = []
// The page behind is locked while at least one overlay is open.
let scrollLocks = 0

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'

// Hidden by itself or by an ancestor up to the panel (a folded section keeps its controls mounted but not focusable).
function isShown(el: HTMLElement, root: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const style = getComputedStyle(n)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    if (n === root) break
  }
  return true
}

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('tabindex') !== '-1' &&
      el.getAttribute('aria-hidden') !== 'true' &&
      !(el instanceof HTMLInputElement && el.type === 'hidden') &&
      isShown(el, root),
  )
}

/**
 * Keep Tab inside `panel`. Call it from the panel's keydown handler. Focus that sits outside the panel's own DOM (a
 * dropdown list drawn in a portal) is left alone.
 */
export function trapTab(
  e: { key: string; shiftKey: boolean; preventDefault: () => void },
  panel: HTMLElement,
): void {
  if (e.key !== 'Tab') return
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !panel.contains(active)) return
  const items = focusableIn(panel)
  if (items.length === 0) {
    e.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && (active === first || active === panel)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

/** A short bump that says "not closed". Nothing for a person who asked the system for less motion. */
export function nudge(panel: HTMLElement | null, axis: 'scale' | 'lift' | 'sideways') {
  if (!panel || typeof panel.animate !== 'function') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const frames =
    axis === 'scale'
      ? [{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }]
      : axis === 'lift'
        ? [
            { transform: 'translateY(0)' },
            { transform: 'translateY(-8px)' },
            { transform: 'translateY(0)' },
          ]
        : [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-8px)' },
            { transform: 'translateX(0)' },
          ]
  panel.animate(frames, { duration: 180, easing: 'ease-out' })
}

interface UseOverlayOptions {
  open: boolean
  onClose: () => void
  /** The panel that receives focus on open (give it `tabIndex={-1}`). */
  panelRef: RefObject<HTMLElement>
  /** Move focus into the panel on open (default yes). Off when the content focuses its own field (a search box). */
  focusPanel?: boolean
}

export function useOverlay({
  open,
  onClose,
  panelRef,
  focusPanel = true,
}: UseOverlayOptions): void {
  const identity = useRef(Symbol('overlay'))
  // The newest onClose, read when Escape arrives. The listener below is registered ONCE per opening: a caller that passes
  // a new function on every render (an inline arrow) must not make it re-register, because a listener added during a
  // dispatch is skipped for that event. On a phone the app shell's own Escape handler changes state first, the re-render
  // swapped this listener mid-dispatch, and the overlay never saw that Escape.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  // Where focus was when it opened, so closing gives it back.
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const me = identity.current
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    openOverlays.push(me)
    if (focusPanel) panelRef.current?.focus()
    return () => {
      const at = openOverlays.indexOf(me)
      if (at >= 0) openOverlays.splice(at, 1)
      const opener = openerRef.current
      openerRef.current = null
      if (opener?.isConnected) opener.focus()
    }
  }, [open, panelRef, focusPanel])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // A dropdown or menu inside that used the key to close itself has already said so.
      if (e.defaultPrevented) return
      if (openOverlays[openOverlays.length - 1] !== identity.current) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    scrollLocks++
    document.body.style.overflow = 'hidden'
    return () => {
      scrollLocks--
      if (scrollLocks === 0) document.body.style.overflow = ''
    }
  }, [open])
}

/**
 * Tracks whether something was typed or chosen inside the panel, so a stray click on the dark area does not throw a
 * half-filled form away. Spread `handlers` on the panel; read `isDirty()` in the backdrop's click handler; `reset()`
 * on open.
 */
export function useDirtyGuard(panelRef: RefObject<HTMLElement>) {
  const dirtyRef = useRef(false)
  const markDirty = () => {
    dirtyRef.current = true
  }
  // Typing, ticking and choosing all count. A choice made in a list drawn outside the panel (a dropdown) never fires an
  // input event in the panel, so a press or Enter that comes from outside the panel's own DOM counts too.
  const handlers = {
    onInput: markDirty,
    onChange: markDirty,
    onMouseDown: (e: ReactMouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) markDirty()
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      const panel = panelRef.current
      if (!panel) return
      if (e.key === 'Enter' && !panel.contains(e.target as Node)) markDirty()
      trapTab(e, panel)
    },
  }
  return {
    handlers,
    isDirty: () => dirtyRef.current,
    reset: () => {
      dirtyRef.current = false
    },
  }
}
