import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useIsRtl } from '../../i18n'
import { isKeyboardFocus } from '../ui/keyboardFocus'
import { menuFocusRing, menuItemStyle, menuPanelStyle } from '../ui/menuStyles'

export interface OverflowMenuItem {
  key: string
  label: string
  onSelect: () => void
  danger?: boolean
  /** Drawn but not selectable (for example while someone else holds the edit lock). */
  disabled?: boolean
}

interface OverflowMenuProps {
  /** Names the button for a screen reader ("More actions"). */
  label: string
  items: OverflowMenuItem[]
}

const PANEL_MIN_WIDTH = 200
const EDGE = 8 // never closer than this to the window's edge
const GAP = 6 // between the button and the menu

interface PanelPlace {
  left: number
  top?: number
  bottom?: number
}

/**
 * A "⋯" button that opens a short list of actions. Used in the page header on a phone, where the
 * Print and Cancel buttons would crowd the title. Closes on Escape (focus goes back to the button),
 * on a click outside, and when an item is chosen; the arrow keys move between the items.
 *
 * The list is drawn at the end of <body> and placed from the button's position (like the Columns menu), so a card
 * or a scrolling area around the button can never clip it.
 */
export function OverflowMenu({ label, items }: OverflowMenuProps) {
  const { theme, themeKey } = useTheme()
  const isRtl = useIsRtl()
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<PanelPlace | null>(null)
  const [triggerFocused, setTriggerFocused] = useState(false)
  // The row under the pointer or holding keyboard focus.
  const [active, setActive] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const reposition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.max(PANEL_MIN_WIDTH, panelRef.current?.offsetWidth ?? 0)
    // the menu's far edge lines up with the button's: right edge in English, left edge in Arabic
    const wanted = isRtl ? r.left : r.right - width
    const left = Math.max(EDGE, Math.min(wanted, vw - width - EDGE))
    // about 52px a row plus the padding; opens upward when the window has no room below the button
    const needed = items.length * 46 + 16
    const below = vh - r.bottom - EDGE - GAP
    const above = r.top - EDGE - GAP
    setPlace(
      below < needed && above > below
        ? { left, bottom: vh - r.top + GAP }
        : { left, top: r.bottom + GAP },
    )
  }, [isRtl, items.length])

  // placed before the browser paints, so the menu never flashes in the wrong spot
  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) === true || panelRef.current?.contains(target) === true)
        return
      setOpen(false)
    }
    const follow = (e: Event) => {
      // scrolling the list itself must not move it
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return
      reposition()
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [open, reposition])

  // the list is not next to the button in the page, so the keyboard goes to it once it is placed
  const placed = place !== null
  useEffect(() => {
    if (!open || !placed) return
    itemRefs.current[0]?.focus()
  }, [open, placed])

  if (items.length === 0) return null

  // The arrow keys skip an item that is disabled (a disabled button cannot take focus).
  const move = (from: number, step: number) => {
    let next = (from + step + items.length) % items.length
    let guard = items.length
    while (items[next].disabled && guard > 0) {
      next = (next + step + items.length) % items.length
      guard--
    }
    itemRefs.current[next]?.focus()
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
        }}
        onFocus={(e) => {
          setTriggerFocused(isKeyboardFocus(e.currentTarget))
        }}
        onBlur={() => {
          setTriggerFocused(false)
        }}
        style={{
          width: '44px',
          height: '44px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: open ? theme.accentBg : theme.bgSurface,
          border: `1px solid ${open ? theme.accentBorder : theme.borderField}`,
          borderRadius: '10px',
          color: open ? theme.accentSolid : theme.textPrimary,
          fontSize: '20px',
          lineHeight: 1,
          cursor: 'pointer',
          outline: 'none',
          boxShadow: triggerFocused ? menuFocusRing(theme) : 'none',
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            data-menu-panel
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setOpen(false)
                triggerRef.current?.focus()
              }
            }}
            style={{
              ...menuPanelStyle(theme, themeKey === 'black'),
              position: 'fixed',
              top: place.top,
              bottom: place.bottom,
              left: place.left,
              minWidth: `${PANEL_MIN_WIDTH}px`,
              padding: '6px',
              zIndex: 1000,
              animation: 'fnc-menu-in 0.12s ease-out',
              transformOrigin: place.bottom !== undefined ? 'bottom center' : 'top center',
            }}
          >
            {items.map((item, i) => (
              <button
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    move(i, 1)
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    move(i, -1)
                  }
                }}
                onMouseEnter={() => {
                  setActive(i)
                }}
                onMouseLeave={() => {
                  setActive((a) => (a === i ? null : a))
                }}
                onFocus={() => {
                  setActive(i)
                }}
                onBlur={() => {
                  setActive((a) => (a === i ? null : a))
                }}
                style={{
                  ...menuItemStyle(theme, {
                    highlighted: active === i,
                    danger: item.danger,
                    disabled: item.disabled,
                    touch: true,
                  }),
                  border: 'none',
                  outline: 'none',
                  marginBottom: i < items.length - 1 ? '2px' : 0,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
