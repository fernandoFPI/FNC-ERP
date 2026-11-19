import { useState } from 'react'
import type { FocusEvent } from 'react'

/**
 * Whether the browser would draw its own focus ring for this element: keyboard focus, not a mouse click. A browser
 * that does not know the `:focus-visible` selector gets the ring, which is the safe side.
 */
export function isKeyboardFocus(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

/**
 * A control draws its ring only for keyboard focus, never after a mouse click: spread `handlers` on the element and
 * draw `menuFocusRing(theme)` as its box-shadow while `ring` is true.
 */
export function useFocusRing() {
  const [ring, setRing] = useState(false)
  return {
    ring,
    handlers: {
      onFocus: (e: FocusEvent<HTMLElement>) => {
        setRing(isKeyboardFocus(e.currentTarget))
      },
      onBlur: () => {
        setRing(false)
      },
    },
  }
}
