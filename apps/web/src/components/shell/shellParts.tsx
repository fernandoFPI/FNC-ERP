// The small parts the top bar's controls and menus are built from, so the company, theme, language, notification and user
// controls read as one family (the same 36px button, the same menu card, the same rows) and answer the same keys.
import { forwardRef, useEffect, useRef, useState } from 'react'
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useFocusRing } from '../ui/keyboardFocus'
import { focusMenuRow, handleMenuKeyDown } from '../ui/menuKeys'
import { menuItemStyle, menuPanelStyle } from '../ui/menuStyles'
import type { ThemeTokens } from '../../theme/tokens'

// The ring a shell control draws for keyboard focus: a gap, then the solid accent. The menu ring is a 12% tint, which is too faint for
// the controls a person tabs through all day (a focus indicator needs 3:1 against the bar).
export function shellFocusRing(theme: ThemeTokens): string {
  return `0 0 0 2px ${theme.bgSurface}, 0 0 0 4px ${theme.accentSolid}`
}

// ── The button ───────────────────────────────────────────────────────────────

interface TopbarButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'style' | 'onFocus' | 'onBlur'
> {
  /** Its menu is open: the accent tint. */
  active?: boolean
  /** A control that holds a value or opens a search (company, search): a readable edge, like the form fields. */
  bordered?: boolean
  style?: CSSProperties
}

/**
 * A top-bar button: 36px, 10px corners, quiet until the pointer or the keyboard is on it (the keyboard ring shows for
 * keyboard focus only, never after a click). Icon-only buttons need an `aria-label`.
 */
export const TopbarButton = forwardRef<HTMLButtonElement, TopbarButtonProps>(function TopbarButton(
  { active = false, bordered = false, style, children, ...rest },
  ref,
) {
  const { theme } = useTheme()
  const { ring, handlers } = useFocusRing()
  const [hover, setHover] = useState(false)
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      {...handlers}
      onMouseEnter={(e) => {
        setHover(true)
        rest.onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        setHover(false)
        rest.onMouseLeave?.(e)
      }}
      style={{
        height: '36px',
        minWidth: '36px',
        boxSizing: 'border-box',
        padding: '0 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        flexShrink: 0,
        borderRadius: '10px',
        border: `1px solid ${bordered ? (active ? theme.accentSolid : theme.borderField) : 'transparent'}`,
        background: active
          ? theme.accentBg
          : hover
            ? theme.bgSurfaceHover
            : bordered
              ? theme.bgSurface
              : 'transparent',
        color: active ? theme.accentSolid : hover ? theme.textPrimary : theme.textSecondary,
        boxShadow: ring ? shellFocusRing(theme) : 'none',
        outline: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '13px',
        fontWeight: 600,
        transition: 'background 0.12s ease, color 0.12s ease',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        ...style,
      }}
    >
      {children}
    </button>
  )
})

// ── The menu ─────────────────────────────────────────────────────────────────

/**
 * Open / close state of a top-bar menu, with what every one of them needs: a press outside closes it, the first row takes
 * the keyboard as it opens, and Escape closes it and gives the keyboard back to the button (`onKeyDown` on the menu).
 */
export function useShellMenu(onOpen?: () => void) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  useEffect(() => {
    if (open) focusMenuRow(panelRef.current, 0)
  }, [open])

  return {
    open,
    containerRef,
    triggerRef,
    panelRef,
    close: () => {
      setOpen(false)
    },
    toggle: () => {
      const next = !open
      setOpen(next)
      if (next) onOpen?.()
    },
    onKeyDown: (e: KeyboardEvent) => {
      handleMenuKeyDown(e, panelRef.current, {
        close: () => {
          setOpen(false)
        },
        restoreFocus: () => {
          triggerRef.current?.focus()
        },
      })
    },
  }
}

interface ShellMenuPanelProps {
  /** Which edge of the button it lines up with: `end` opens toward the start of the page. */
  align: 'start' | 'end'
  label: string
  panelRef: RefObject<HTMLDivElement>
  onKeyDown: (e: KeyboardEvent) => void
  /** Drawn above the rows and not part of the menu (a heading, who is signed in). */
  header?: ReactNode
  minWidth?: number
  children: ReactNode
}

/** The card a top-bar menu opens in: the shared menu look, a header that is not a row, and the rows as a real `menu`. */
export function ShellMenuPanel({
  align,
  label,
  panelRef,
  onKeyDown,
  header,
  minWidth = 220,
  children,
}: ShellMenuPanelProps) {
  const { theme } = useTheme()
  return (
    <div
      data-menu-panel
      style={{
        ...menuPanelStyle(theme, theme.key === 'black'),
        animation: 'fnc-menu-in 0.12s ease-out',
        position: 'absolute',
        top: 'calc(100% + 8px)',
        ...(align === 'end' ? { insetInlineEnd: 0 } : { insetInlineStart: 0 }),
        zIndex: 500,
        minWidth: `${minWidth}px`,
        maxWidth: 'calc(100vw - 24px)',
      }}
    >
      {header}
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}
      >
        {children}
      </div>
    </div>
  )
}

interface MenuRowProps {
  /** `menuitemradio` for a choice among several (the company, the theme): it says which one is chosen. */
  role?: 'menuitem' | 'menuitemradio'
  checked?: boolean
  danger?: boolean
  onSelect: () => void
  children: ReactNode
}

/** One row of a top-bar menu, in the shared menu look: tint under the pointer or the keyboard, the chosen one stronger. */
export function MenuRow({
  role = 'menuitem',
  checked = false,
  danger = false,
  onSelect,
  children,
}: MenuRowProps) {
  const { theme } = useTheme()
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'menuitemradio' ? checked : undefined}
      tabIndex={-1}
      onClick={onSelect}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      onFocus={() => {
        setFocused(true)
      }}
      onBlur={() => {
        setFocused(false)
      }}
      style={{
        ...menuItemStyle(theme, { highlighted: hover || focused, selected: checked, danger }),
        border: 'none',
        outline: 'none',
      }}
    >
      {children}
    </button>
  )
}

/** The tick on the chosen row: drawn, so the choice is not carried by colour alone. */
export function MenuTick() {
  const { theme } = useTheme()
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={theme.accentSolid}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ marginInlineStart: 'auto', flexShrink: 0 }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/** The small caption above a group of rows ("Theme", "Switch company"). */
export function MenuCaption({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  return (
    <div
      style={{
        padding: '10px 14px 2px',
        fontSize: '11px',
        fontWeight: 600,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </div>
  )
}
