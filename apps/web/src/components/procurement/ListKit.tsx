import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import i18n, { useIsRtl } from '../../i18n'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { ActionButton } from '../ui/ActionButton'
import { useFocusRing } from '../ui/keyboardFocus'
import { focusMenuRow, handleMenuKeyDown } from '../ui/menuKeys'
import { menuFocusRing, menuItemStyle, menuPanelStyle } from '../ui/menuStyles'

// Shared building blocks for the Procurement list pages (Purchase Orders,
// Requisitions): page title, KPI tiles, filter controls, stage mini-progress,
// pagination and the docked preview panel. Presentational only — each page
// owns its own data and rules.

// ── Icons (inline, stroke style — matches the sidebar's) ─────────────────────

type IconName =
  | 'cart'
  | 'doc'
  | 'clock'
  | 'alert'
  | 'truck'
  | 'cash'
  | 'check'
  | 'x'
  | 'search'
  | 'filter'
  | 'chevron'
  | 'dots'
  | 'pencil'
  | 'building'
  | 'phone'
  | 'mail'
  | 'user'
  | 'download'
  | 'refresh'
  | 'arrowRight'
  | 'external'
  | 'eye'

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'cart':
      return (
        <svg {...common}>
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
          <path d="M2 3h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 7H6" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'alert':
      return (
        <svg {...common}>
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      )
    case 'truck':
      return (
        <svg {...common}>
          <path d="M1 6h13v10H1zM14 9h4l3 3v4h-7" />
          <circle cx="6" cy="18" r="1.8" />
          <circle cx="17" cy="18" r="1.8" />
        </svg>
      )
    case 'cash':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common} strokeWidth={3.2}>
          <path d="m4.5 12.5 5 5L19.5 7" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )
    case 'filter':
      return (
        <svg {...common}>
          <path d="M3 5h18l-7 8v6l-4-2v-4z" />
        </svg>
      )
    case 'chevron':
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      )
    case 'dots':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      )
    case 'pencil':
      return (
        <svg {...common}>
          <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
        </svg>
      )
    case 'building':
      return (
        <svg {...common}>
          <path d="M4 21V7l8-4 8 4v14M9 21v-5h6v5M8 10h.01M12 10h.01M16 10h.01M8 14h.01M16 14h.01" />
        </svg>
      )
    case 'phone':
      return (
        <svg {...common}>
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
        </svg>
      )
    case 'mail':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      )
    case 'user':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" />
        </svg>
      )
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4" />
        </svg>
      )
    case 'arrowRight':
      return (
        <svg {...common}>
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      )
    case 'eye':
      return (
        <svg {...common}>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'external':
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      )
  }
}

// ── Page title ───────────────────────────────────────────────────────────────

export function PageTitle({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon: IconName
  title: string
  subtitle: string
  actions?: React.ReactNode
}) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  if (isPhone) {
    // Phone: the title and the main action share one row. The icon tile and the subtitle only push the list down.
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          // a page with two actions (Purchase Orders) puts them under the title instead of squeezing it
          flexWrap: 'wrap',
          gap: '8px 12px',
          marginBottom: '12px',
        }}
      >
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: theme.textPrimary,
            margin: 0,
            lineHeight: 1.2,
            minWidth: 0,
          }}
        >
          {title}
        </h1>
        {actions && <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>{actions}</div>}
      </div>
    )
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '20px',
      }}
    >
      {/* a quiet tile: the accent tint with the solid accent icon, not a loud filled block */}
      <div
        aria-hidden="true"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: theme.accentBg,
          border: `1px solid ${theme.accentBorder}`,
          color: theme.accentSolid,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={24} />
      </div>
      <div style={{ flex: 1, minWidth: '200px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: theme.textPrimary,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '2px 0 0' }}>
          {subtitle}
        </p>
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>
      )}
    </div>
  )
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

export type Tone = 'accent' | 'warning' | 'danger' | 'info' | 'success'

export function KpiTile({
  tone,
  icon,
  label,
  value,
  sub,
  onClick,
  active = false,
  loading = false,
  trailing,
}: {
  tone: Tone
  icon: IconName
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  onClick?: () => void
  active?: boolean
  loading?: boolean
  trailing?: React.ReactNode
}) {
  const { theme } = useTheme()
  const toneColor: Record<Tone, { fg: string; bg: string; border: string }> = {
    accent: { fg: theme.accent, bg: theme.accentBg, border: theme.accentBorder },
    warning: { fg: theme.warning, bg: theme.warningBg, border: theme.warningBorder },
    danger: { fg: theme.danger, bg: theme.dangerBg, border: theme.dangerBorder },
    info: { fg: theme.info, bg: theme.infoBg, border: theme.infoBorder },
    success: { fg: theme.success, bg: theme.successBg, border: theme.successBorder },
  }
  const c = toneColor[tone]
  const Tag = onClick ? 'button' : 'div'
  const { isPhone } = useBreakpoint()
  const [hover, setHover] = useState(false)
  const { ring, handlers } = useFocusRing()
  // A tile with a trailing arrow navigates elsewhere; the others are quick filters that are on or off.
  const pressed = onClick && !trailing ? active : undefined
  if (isPhone) {
    // Phone: a compact chip (number and name on one line) in a scrolling row, not a 110px card.
    return (
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        aria-pressed={pressed}
        style={{
          textAlign: 'start',
          fontFamily: 'inherit',
          flex: '0 0 auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: '44px',
          padding: '6px 14px',
          borderRadius: '999px',
          background: c.bg,
          border: `1px solid ${active ? c.fg : c.border}`,
          boxShadow: active ? `0 0 0 1px ${c.fg}` : 'none',
          cursor: onClick ? 'pointer' : 'default',
          whiteSpace: 'nowrap',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {loading ? (
          <span
            className="skeleton"
            style={{ display: 'inline-block', height: '18px', width: '22px', borderRadius: '4px' }}
          />
        ) : (
          <span style={{ fontSize: '18px', fontWeight: 700, color: theme.textPrimary }}>
            {value}
          </span>
        )}
        <span style={{ fontSize: '13px', fontWeight: 600, color: c.fg }}>{label}</span>
      </Tag>
    )
  }
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={pressed}
      {...(onClick
        ? {
            ...handlers,
            onMouseEnter: () => {
              setHover(true)
            },
            onMouseLeave: () => {
              setHover(false)
            },
          }
        : {})}
      // A calm card: the surface and a hairline. The tone lives only in the icon, so four colours do not shout at once.
      style={{
        textAlign: 'start',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '16px 18px',
        borderRadius: '14px',
        background: active ? theme.accentBg : theme.bgSurface,
        border: `1px solid ${active ? theme.accentSolid : hover ? theme.borderStrong : theme.border}`,
        boxShadow: ring ? menuFocusRing(theme) : 'none',
        cursor: onClick ? 'pointer' : 'default',
        minWidth: 0,
        outline: 'none',
        color: 'inherit',
        transition: 'border-color 0.12s, background 0.12s',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: c.bg,
          color: c.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={22} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textSecondary }}>{label}</div>
        {loading ? (
          <div
            className="skeleton"
            style={{ height: '26px', width: '60%', borderRadius: '4px', margin: '4px 0' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '26px',
              fontWeight: 700,
              color: theme.textPrimary,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </div>
        )}
        <div style={{ fontSize: '12px', color: theme.textSecondary }}>{sub}</div>
      </div>
      {trailing && <div style={{ color: theme.textSecondary, flexShrink: 0 }}>{trailing}</div>}
    </Tag>
  )
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  const { isPhone } = useBreakpoint()
  if (isPhone) {
    // Phone: one scrolling row of chips instead of a stack of five cards (they used to push the list 560px down).
    return (
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          // run to the screen edges so the next chip peeks in, hinting that the row scrolls
          marginInline: '-16px',
          paddingInline: '16px',
          paddingBottom: '4px',
          marginBottom: '12px',
          scrollbarWidth: 'none',
        }}
      >
        {children}
      </div>
    )
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px',
        marginBottom: '20px',
      }}
    >
      {children}
    </div>
  )
}

// ── Filter controls ──────────────────────────────────────────────────────────

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const { theme } = useTheme()
  const { t } = useTranslation()
  const { isPhone } = useBreakpoint()
  const [focused, setFocused] = useState(false)
  return (
    <label
      style={{
        // Phone: a smaller minimum lets the box share its row with the buttons beside it (a 200px minimum pushed
        // the refresh button onto a row of its own).
        flex: isPhone ? '1 1 120px' : '1 1 260px',
        minWidth: isPhone ? '120px' : '200px',
        height: '40px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 12px',
        borderRadius: '10px',
        // the readable edge, turning to the accent while the box has the cursor
        border: `1px solid ${focused ? theme.accentSolid : theme.borderField}`,
        boxShadow: focused ? `0 0 0 3px ${theme.accentHover}` : 'none',
        background: theme.bgSurface,
        color: theme.textSecondary,
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
    >
      <Icon name="search" size={16} />
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        onFocus={() => {
          setFocused(true)
        }}
        onBlur={() => {
          setFocused(false)
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          // 16px on a phone: a smaller size makes iOS zoom into the box
          fontSize: isPhone ? '16px' : '13px',
          color: theme.textPrimary,
          fontFamily: 'inherit',
        }}
      />
      {value && (
        <button
          type="button"
          aria-label={t('common.clearSearch')}
          onClick={() => {
            onChange('')
          }}
          style={{
            border: 'none',
            background: 'none',
            color: theme.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            padding: 0,
          }}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </label>
  )
}

// "Status  All ▾" style dropdown — a native <select> laid transparently over
// the styled label, so keyboard / mobile / accessibility behaviour stays native.
export function PillSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const { theme } = useTheme()
  const { t } = useTranslation()
  const { ring, handlers } = useFocusRing()
  const shown = options.find((o) => o.value === value)?.label ?? t('common.all')
  const active = value !== ''
  return (
    <div
      style={{
        position: 'relative',
        height: '40px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 12px',
        borderRadius: '10px',
        // an applied filter is the solid accent; the resting edge is the readable one
        border: `1px solid ${active ? theme.accentSolid : theme.borderField}`,
        background: active ? theme.accentBg : theme.bgSurface,
        boxShadow: ring ? menuFocusRing(theme) : 'none',
        fontSize: '13px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span style={{ color: theme.textSecondary }}>{label}</span>
      <span
        style={{
          color: active ? theme.accentSolid : theme.textPrimary,
          fontWeight: active ? 600 : 500,
        }}
      >
        {shown}
      </span>
      <span style={{ color: theme.textSecondary, display: 'flex' }}>
        <Icon name="chevron" size={14} />
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        {...handlers}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        }}
      >
        <option value="">{t('common.all')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function MoreFilters({
  activeCount,
  children,
}: {
  activeCount: number
  children: React.ReactNode
}) {
  const { theme, themeKey } = useTheme()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const { ring, handlers } = useFocusRing()
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // Escape closes the panel and gives the keyboard back to the button
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((v) => !v)
        }}
        {...handlers}
        style={{
          height: '40px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 14px',
          borderRadius: '10px',
          border: `1px solid ${activeCount > 0 || open ? theme.accentSolid : theme.borderField}`,
          background: activeCount > 0 || open ? theme.accentBg : theme.bgSurface,
          boxShadow: ring ? menuFocusRing(theme) : 'none',
          outline: 'none',
          color: theme.textPrimary,
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <Icon name="filter" size={15} />
        {t('common.moreFilters')}
        {activeCount > 0 && (
          <span
            style={{
              background: theme.accentSolid,
              color: theme.accentSolidText,
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 700,
              padding: '1px 7px',
            }}
          >
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('common.moreFilters')}
          style={{
            ...menuPanelStyle(theme, themeKey === 'black'),
            position: 'absolute',
            top: '46px',
            insetInlineEnd: 0,
            zIndex: 40,
            width: '320px',
            // Anchored to the button, which can sit anywhere on the page —
            // with no cap, a panel opened low on a long filter bar (or on a
            // short window) rendered past the viewport edge with nothing to
            // scroll, making its own "Clear all filters" link unreachable.
            maxHeight: '70vh',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>{label}</span>
      {children}
    </label>
  )
}

// A native select or date box in the filter panel, in the same box as the newer form controls.
export function dateInputStyle(theme: {
  borderField: string
  bgSurface: string
  textPrimary: string
}): React.CSSProperties {
  return {
    height: '38px',
    boxSizing: 'border-box',
    width: '100%',
    padding: '0 10px',
    borderRadius: '10px',
    border: `1px solid ${theme.borderField}`,
    background: theme.bgSurface,
    color: theme.textPrimary,
    fontSize: '13px',
    fontFamily: 'inherit',
  }
}

export function IconButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  const { theme } = useTheme()
  const { ring, handlers } = useFocusRing()
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      {...handlers}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      style={{
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '10px',
        border: `1px solid ${theme.borderField}`,
        background: hover ? theme.bgSurfaceHover : theme.bgSurface,
        boxShadow: ring ? menuFocusRing(theme) : 'none',
        outline: 'none',
        color: theme.textSecondary,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// ── Applied filters, as chips ────────────────────────────────────────────────

export interface FilterChip {
  key: string
  /** What is filtered ("Status"). */
  label: string
  /** What it is set to ("Payment pending"). Left out for a plain on/off filter ("Only mine"). */
  value?: string
  onRemove: () => void
}

/**
 * The filters that are applied, each a chip that can be taken off with one click, and one "clear all". A filter that no visible
 * control shows (a quick filter from a tile, "only mine") is named here too, so a short list is never a mystery.
 */
export function FilterChips({
  chips,
  onClearAll,
  clearAllLabel,
}: {
  chips: FilterChip[]
  onClearAll: () => void
  clearAllLabel: string
}) {
  const { theme } = useTheme()
  const { t } = useTranslation()
  if (chips.length === 0) return null
  return (
    <ul
      aria-label={t('common.activeFilters')}
      style={{
        listStyle: 'none',
        margin: '12px 0 0',
        padding: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {chips.map((c) => (
        <li
          key={c.key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            minHeight: '30px',
            padding: '0 4px 0 12px',
            borderRadius: '999px',
            background: theme.accentBg,
            border: `1px solid ${theme.accentBorder}`,
            fontSize: '13px',
            color: theme.textPrimary,
          }}
        >
          <span style={{ color: theme.textSecondary }}>{c.label}</span>
          {c.value && <span style={{ fontWeight: 600 }}>{c.value}</span>}
          <button
            type="button"
            aria-label={t('common.removeFilter', {
              name: c.value ? `${c.label} ${c.value}` : c.label,
            })}
            onClick={c.onRemove}
            style={{
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: '50%',
              background: 'transparent',
              color: theme.textSecondary,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Icon name="x" size={12} />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onClearAll}
          style={{
            border: 'none',
            background: 'none',
            color: theme.accentSolid,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '4px 6px',
          }}
        >
          {clearAllLabel}
        </button>
      </li>
    </ul>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon = 'search',
  title,
  hint,
  action,
}: {
  icon?: IconName
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  const { theme } = useTheme()
  return (
    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
      <div
        aria-hidden="true"
        style={{
          width: '48px',
          height: '48px',
          margin: '0 auto 12px',
          borderRadius: '50%',
          background: theme.bgSurfaceHover,
          color: theme.textSecondary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={22} />
      </div>
      <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>{title}</div>
      {hint && (
        <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>{hint}</div>
      )}
      {action && <div style={{ marginTop: '14px' }}>{action}</div>}
    </div>
  )
}

// ── Priority tag ─────────────────────────────────────────────────────────────

/** The small tag next to a number for a priority that needs a second look (High, Emergency). */
export function PriorityTag({
  tone,
  children,
}: {
  tone: 'warning' | 'danger'
  children: React.ReactNode
}) {
  const { theme } = useTheme()
  const c =
    tone === 'danger'
      ? { fg: theme.danger, bg: theme.dangerBg, border: theme.dangerBorder }
      : { fg: theme.warning, bg: theme.warningBg, border: theme.warningBorder }
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 700,
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '999px',
        padding: '0 8px',
        lineHeight: '18px',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

// ── Bulk selection bar ───────────────────────────────────────────────────────

export function SelectionBar({
  label,
  onClear,
  children,
}: {
  label: string
  onClear: () => void
  children: React.ReactNode
}) {
  const { theme } = useTheme()
  const { t } = useTranslation()
  return (
    <div
      role="region"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        padding: '10px 14px',
        marginTop: '14px',
        borderRadius: '12px',
        background: theme.accentBg,
        border: `1px solid ${theme.accentBorder}`,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          fontWeight: 600,
          color: theme.textPrimary,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '6px',
            background: theme.accentSolid,
            color: theme.accentSolidText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="check" size={12} />
        </span>
        {label}
      </span>
      {children}
      <span style={{ marginInlineStart: 'auto' }}>
        <ActionButton size="sm" variant="ghost" onClick={onClear}>
          {t('common.clearSelection')}
        </ActionButton>
      </span>
    </div>
  )
}

export function BarButton({
  icon,
  tone = 'default',
  disabled = false,
  onClick,
  children,
}: {
  icon?: IconName
  tone?: 'default' | 'danger'
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <ActionButton
      size="sm"
      variant={tone === 'danger' ? 'danger' : 'outline'}
      disabled={disabled}
      onClick={onClick}
      icon={icon ? <Icon name={icon} size={14} /> : undefined}
    >
      {children}
    </ActionButton>
  )
}

// ── Table cells ──────────────────────────────────────────────────────────────

export function PersonCell({ name }: { name?: string | null }) {
  const { theme, themeKey } = useTheme()
  if (!name) return <span style={{ color: theme.textSecondary }}>—</span>
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  const hue = Math.abs(h) % 360
  // A soft tint with a dark letter (light theme) or a deep tint with a pale letter (dark): readable, and still a different
  // colour for each person. The old white letter on a mid-tone circle was 2.9:1 on some of them.
  const dark = themeKey === 'black'
  const background = dark ? `hsl(${hue} 30% 24%)` : `hsl(${hue} 45% 90%)`
  const color = dark ? `hsl(${hue} 60% 85%)` : `hsl(${hue} 55% 26%)`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background,
          color,
          fontSize: '11px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {initials}
      </span>
      <span
        style={{
          fontSize: '13px',
          color: theme.textPrimary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
    </div>
  )
}

// Four-dot mini progress with the precise stage name underneath.
export function StageMini({
  total,
  reached,
  label,
}: {
  total: number
  reached: number | null
  label: string
}) {
  const { theme } = useTheme()
  if (reached === null) {
    return <span style={{ color: theme.textSecondary, fontSize: '13px' }}>—</span>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '96px' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {Array.from({ length: total }).map((_, i) => {
          const done = i < reached
          const current = i === reached
          return (
            <React.Fragment key={i}>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: done ? theme.accentSolid : theme.bgSurface,
                  border: `2px solid ${done || current ? theme.accentSolid : theme.borderStrong}`,
                }}
              />
              {i < total - 1 && (
                <span
                  style={{
                    flex: 1,
                    height: '2px',
                    background: i < reached ? theme.accentSolid : theme.border,
                  }}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
      <span style={{ fontSize: '12px', color: theme.textSecondary, textAlign: 'center' }}>
        {label}
      </span>
    </div>
  )
}

export interface MenuItem {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
}

// Row "⋮" menu — rendered in a portal so table overflow can't clip it. A real menu: it takes the keyboard when it opens (the arrow
// keys, Home, End and Enter work, Escape and Tab close it and give the focus back), and each row is a menu item.
export function RowMenu({ items, ariaLabel }: { items: MenuItem[]; ariaLabel?: string }) {
  const { t } = useTranslation()
  const { theme, themeKey } = useTheme()
  const rtl = useIsRtl()
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [hi, setHi] = useState(-1)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { ring, handlers } = useFocusRing()
  const menuId = useId()
  useEffect(() => {
    if (!pos) return
    const close = () => {
      setPos(null)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])
  // the first row takes the keyboard as the menu opens
  useEffect(() => {
    if (!pos) return
    focusMenuRow(panelRef.current, 0)
  }, [pos])
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
      }}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel ?? t('common.rowActions')}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        aria-controls={pos ? menuId : undefined}
        {...handlers}
        onClick={(e) => {
          e.stopPropagation()
          if (pos) {
            setPos(null)
            return
          }
          const r = btnRef.current?.getBoundingClientRect()
          // under the button, on its far side from the text, and never off the window
          if (r)
            setPos({
              top: r.bottom + 4,
              left: Math.max(8, Math.min(window.innerWidth - 198, rtl ? r.left : r.right - 190)),
            })
        }}
        style={{
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          background: pos ? theme.accentBg : 'transparent',
          boxShadow: ring ? menuFocusRing(theme) : 'none',
          outline: 'none',
          borderRadius: '8px',
          color: theme.textSecondary,
          cursor: 'pointer',
        }}
      >
        <Icon name="dots" size={16} />
      </button>
      {pos &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel ?? t('common.rowActions')}
            onMouseDown={(e) => {
              e.stopPropagation()
            }}
            onKeyDown={(e) => {
              handleMenuKeyDown(e, panelRef.current, {
                close: () => {
                  setPos(null)
                },
                restoreFocus: () => {
                  btnRef.current?.focus()
                },
              })
            }}
            style={{
              ...menuPanelStyle(theme, themeKey === 'black'),
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 1000,
              width: '190px',
              padding: '6px',
            }}
          >
            {items.map((it, i) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  setPos(null)
                  it.onClick()
                }}
                onMouseEnter={() => {
                  setHi(i)
                }}
                onFocus={() => {
                  setHi(i)
                }}
                style={{
                  ...menuItemStyle(theme, { highlighted: hi === i, danger: it.tone === 'danger' }),
                  border: 'none',
                  outline: 'none',
                }}
              >
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (p: number) => void
}) {
  const { theme } = useTheme()
  const { t } = useTranslation()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const btn = (disabled: boolean): React.CSSProperties => ({
    minWidth: '34px',
    height: '34px',
    padding: '0 8px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    border: `1px solid ${theme.borderField}`,
    background: theme.bgSurface,
    color: theme.textPrimary,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontSize: '13px',
    fontFamily: 'inherit',
  })
  // Windowed page list: first, last, and 1 either side of the current page.
  const nums: (number | '…')[] = []
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        padding: '14px 4px 2px',
      }}
    >
      <span style={{ fontSize: '13px', color: theme.textSecondary }}>
        {t('common.showingEntries', { from, to, total })}
      </span>
      <nav aria-label={t('common.pagination')} style={{ display: 'flex', gap: '6px' }}>
        <button
          type="button"
          aria-label={t('common.previousPage')}
          disabled={page <= 1}
          onClick={() => {
            onChange(page - 1)
          }}
          style={btn(page <= 1)}
        >
          {/* ‹ and › are mirrored by the browser in a right-to-left page; swapping them here would flip them back */}
          ‹
        </button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span
              key={`gap-${i}`}
              style={{
                ...btn(true),
                border: 'none',
                background: 'none',
                opacity: 1,
                color: theme.textSecondary,
              }}
            >
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-current={n === page ? 'page' : undefined}
              onClick={() => {
                onChange(n)
              }}
              style={{
                ...btn(false),
                background: n === page ? theme.accentSolid : theme.bgSurface,
                color: n === page ? theme.accentSolidText : theme.textPrimary,
                borderColor: n === page ? theme.accentSolid : theme.borderField,
                fontWeight: n === page ? 700 : 500,
              }}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label={t('common.nextPage')}
          disabled={page >= pages}
          onClick={() => {
            onChange(page + 1)
          }}
          style={btn(page >= pages)}
        >
          ›
        </button>
      </nav>
    </div>
  )
}

// ── Docked preview panel ─────────────────────────────────────────────────────

function useIsWide(minWidth: number): boolean {
  const [wide, setWide] = useState(
    typeof window === 'undefined' ? true : window.innerWidth >= minWidth,
  )
  useEffect(() => {
    const onResize = () => {
      setWide(window.innerWidth >= minWidth)
    }
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [minWidth])
  return wide
}

// Two-column layout: the list on the left, the preview docked on the right.
// Below 1280px there isn't room to dock, so the panel becomes an overlay.
export function DockLayout({
  panel,
  onClosePanel,
  children,
}: {
  panel: React.ReactNode | null
  onClosePanel: () => void
  children: React.ReactNode
}) {
  const { theme } = useTheme()
  const wide = useIsWide(1280)
  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClosePanel()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [panel, onClosePanel])

  if (wide) {
    return (
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            // Match the docked panel's height so the two cards line up.
            minHeight: panel ? 'calc(100vh - 96px)' : undefined,
          }}
        >
          {children}
        </div>
        {panel && (
          <aside
            style={{
              width: '420px',
              flexShrink: 0,
              position: 'sticky',
              top: '12px',
              height: 'calc(100vh - 96px)',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '14px',
              border: `1px solid ${theme.border}`,
              background: theme.bgSurface,
              overflow: 'hidden',
            }}
          >
            {panel}
          </aside>
        )}
      </div>
    )
  }
  return (
    <>
      {children}
      {panel &&
        createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) onClosePanel()
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 900,
              background: 'rgba(0,0,0,0.4)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <aside
              style={{
                width: 'min(420px, 100vw)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: theme.bgSurface,
              }}
            >
              {panel}
            </aside>
          </div>,
          document.body,
        )}
    </>
  )
}

export function PanelHeader({
  title,
  badge,
  sub,
  action,
  onClose,
}: {
  title: string
  badge: React.ReactNode
  sub: React.ReactNode
  // Icon-only button beside the close button; the label is its tooltip / accessible name.
  action?: { label: string; icon: IconName; onClick: () => void }
  onClose: () => void
}) {
  const { theme } = useTheme()
  const { t } = useTranslation()
  return (
    <div style={{ padding: '20px 22px 14px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: theme.textPrimary,
            margin: 0,
            fontFamily: 'inherit',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h2>
        <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{badge}</span>
        <div
          style={{
            marginInlineStart: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          {action && (
            <button
              type="button"
              title={action.label}
              aria-label={action.label}
              onClick={action.onClick}
              style={{
                width: '48px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                border: 'none',
                background: theme.accentSolid,
                color: theme.accentSolidText,
                cursor: 'pointer',
              }}
            >
              <Icon name={action.icon} size={15} />
            </button>
          )}
          <button
            type="button"
            aria-label={t('common.closePreview')}
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'none',
              color: theme.textMuted,
              cursor: 'pointer',
            }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>{sub}</div>
    </div>
  )
}

export function InfoCard({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <div
      style={{
        margin: '0 22px 16px',
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

export function Party({
  icon,
  name,
  role,
  lines,
}: {
  icon: IconName
  name: string
  role: string
  lines?: { icon: IconName; text: string }[]
}) {
  const { theme } = useTheme()
  return (
    <div style={{ padding: '14px 16px', display: 'flex', gap: '12px' }}>
      <div
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: theme.accentBg,
          color: theme.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>{name}</div>
        <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '6px' }}>{role}</div>
        {(lines ?? []).map((l) => (
          <div
            key={l.text}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: theme.textSecondary,
              marginTop: '3px',
            }}
          >
            <Icon name={l.icon} size={13} />
            <span style={{ overflowWrap: 'anywhere' }}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatPair({
  left,
  right,
}: {
  left: { label: string; value: React.ReactNode }
  right: { label: string; value: React.ReactNode }
}) {
  const { theme } = useTheme()
  const cell = (c: { label: string; value: React.ReactNode }, first: boolean) => (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '12px 16px',
        borderInlineStart: first ? 'none' : `1px solid ${theme.border}`,
      }}
    >
      <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>{c.label}</div>
      <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 600 }}>{c.value}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', borderTop: `1px solid ${theme.border}` }}>
      {cell(left, true)}
      {cell(right, false)}
    </div>
  )
}

export function WorkflowStepper({
  steps,
  current,
  complete,
}: {
  steps: string[]
  // index of the stage the record is in; ignored when `complete`
  current: number
  complete: boolean
}) {
  const { theme } = useTheme()
  const { t } = useTranslation()
  return (
    <div style={{ padding: '0 22px 16px' }}>
      <div
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: theme.textPrimary,
          marginBottom: '14px',
        }}
      >
        {t('common.workflowProgress')}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {steps.map((s, i) => {
          const done = complete || i < current
          const isCurrent = !complete && i === current
          return (
            <div
              key={s}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                minWidth: 0,
              }}
            >
              {i > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    zIndex: 0,
                    top: '13px',
                    insetInlineEnd: '50%',
                    width: '100%',
                    height: '3px',
                    background: done || isCurrent ? theme.accent : theme.border,
                  }}
                />
              )}
              <span
                style={{
                  position: 'relative',
                  // Above the connector lines — each line spans back into the
                  // previous circle, and would otherwise paint over it.
                  zIndex: 1,
                  width: '28px',
                  height: '28px',
                  boxSizing: 'border-box',
                  borderRadius: '50%',
                  background: done ? theme.accentSolid : theme.bgSurface,
                  border: `2px solid ${done || isCurrent ? theme.accentSolid : theme.borderStrong}`,
                  color: theme.accentSolidText,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isCurrent ? `0 0 0 4px ${theme.accentBg}` : 'none',
                }}
              >
                {done && <Icon name="check" size={16} />}
                {isCurrent && (
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: theme.accentSolid,
                    }}
                  />
                )}
              </span>
              <span
                style={{
                  marginTop: '6px',
                  fontSize: '11px',
                  textAlign: 'center',
                  color: isCurrent
                    ? theme.accentSolid
                    : done
                      ? theme.textPrimary
                      : theme.textSecondary,
                  fontWeight: isCurrent ? 700 : 500,
                }}
              >
                {t(`stage.${s}`, { defaultValue: s })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PanelTabs({
  tabs,
  active,
  onChange,
  labels,
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
  /** Display text per tab key; the key itself is shown when absent. */
  labels?: Record<string, string>
}) {
  const { theme } = useTheme()
  return (
    <div
      style={{
        display: 'flex',
        gap: '18px',
        padding: '0 22px',
        borderBottom: `1px solid ${theme.border}`,
        flexShrink: 0,
        // Sideways scroll only if the tabs ever overflow. overflow-x:auto alone
        // makes browsers add a vertical scrollbar too (the active tab's -1px
        // underline overhang), so pin y to hidden and drop the bar itself.
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => {
            onChange(tab)
          }}
          style={{
            padding: '10px 0',
            border: 'none',
            borderBottom: `2px solid ${tab === active ? theme.accent : 'transparent'}`,
            marginBottom: '-1px',
            background: 'none',
            color: tab === active ? theme.accent : theme.textSecondary,
            fontWeight: tab === active ? 600 : 500,
            fontSize: '13px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
        >
          {labels?.[tab] ?? tab}
        </button>
      ))}
    </div>
  )
}

export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 0',
        fontSize: '13px',
      }}
    >
      <span style={{ width: '128px', flexShrink: 0, color: theme.textSecondary }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, color: theme.textPrimary, overflowWrap: 'anywhere' }}>
        {children}
      </span>
    </div>
  )
}

export function PanelMessage({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <div
      style={{
        padding: '28px 12px',
        textAlign: 'center',
        fontSize: '13px',
        color: theme.textMuted,
      }}
    >
      {children}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function daysSince(iso: string): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

export function formatAge(iso: string): string {
  const d = daysSince(iso)
  return i18n.t('common.days', { count: d })
}

export function formatLongDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`
}

// True when the date (YYYY-MM-DD or ISO) is strictly before today.
export function isPastDate(iso?: string | null): boolean {
  if (!iso) return false
  const today = new Date().toISOString().slice(0, 10)
  return iso.slice(0, 10) < today
}
