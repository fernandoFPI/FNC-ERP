import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../../theme/ThemeContext'

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
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: theme.accent,
          color: '#fff',
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
      {actions && <div style={{ display: 'flex', gap: '8px' }}>{actions}</div>}
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
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        textAlign: 'left',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '16px 18px',
        borderRadius: '14px',
        background: c.bg,
        border: `1px solid ${active ? c.fg : c.border}`,
        boxShadow: active ? `0 0 0 1px ${c.fg}` : 'none',
        cursor: onClick ? 'pointer' : 'default',
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: theme.bgSurface,
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
        <div style={{ fontSize: '13px', fontWeight: 600, color: c.fg }}>{label}</div>
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
            }}
          >
            {value}
          </div>
        )}
        <div style={{ fontSize: '12px', color: theme.textSecondary }}>{sub}</div>
      </div>
      {trailing && <div style={{ color: theme.textMuted, flexShrink: 0 }}>{trailing}</div>}
    </Tag>
  )
}

export function KpiRow({ children }: { children: React.ReactNode }) {
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
  return (
    <label
      style={{
        flex: '1 1 260px',
        minWidth: '200px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 12px',
        borderRadius: '10px',
        border: `1px solid ${theme.borderInput}`,
        background: theme.bgSurface,
        color: theme.textMuted,
      }}
    >
      <Icon name="search" size={16} />
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '13px',
          color: theme.textPrimary,
          fontFamily: 'inherit',
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('')
          }}
          style={{
            border: 'none',
            background: 'none',
            color: theme.textMuted,
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

// "Status (All) ▾" style dropdown — a native <select> laid transparently over
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
  const shown = options.find((o) => o.value === value)?.label ?? 'All'
  const active = value !== ''
  return (
    <div
      style={{
        position: 'relative',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 12px',
        borderRadius: '10px',
        border: `1px solid ${active ? theme.accent : theme.borderInput}`,
        background: active ? theme.accentBg : theme.bgSurface,
        color: theme.textPrimary,
        fontSize: '13px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span>
        {label} <span style={{ color: theme.textMuted }}>({shown})</span>
      </span>
      <span style={{ color: theme.textMuted, display: 'flex' }}>
        <Icon name="chevron" size={14} />
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        }}
      >
        <option value="">All</option>
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
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
        }}
        style={{
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 14px',
          borderRadius: '10px',
          border: `1px solid ${activeCount > 0 ? theme.accent : theme.borderInput}`,
          background: activeCount > 0 ? theme.accentBg : theme.bgSurface,
          color: theme.textPrimary,
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <Icon name="filter" size={15} />
        More Filters
        {activeCount > 0 && (
          <span
            style={{
              background: theme.accent,
              color: '#fff',
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
          style={{
            position: 'absolute',
            top: '46px',
            right: 0,
            zIndex: 40,
            width: '300px',
            padding: '16px',
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            background: theme.bgSurface,
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
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
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

export function dateInputStyle(theme: {
  borderInput: string
  bgSurface: string
  textPrimary: string
}): React.CSSProperties {
  return {
    height: '34px',
    padding: '0 10px',
    borderRadius: '8px',
    border: `1px solid ${theme.borderInput}`,
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
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '10px',
        border: `1px solid ${theme.borderInput}`,
        background: theme.bgSurface,
        color: theme.textSecondary,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
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
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        padding: '12px 16px',
        marginTop: '14px',
        borderRadius: '10px',
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
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            background: theme.accent,
            color: '#fff',
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
      <button
        type="button"
        onClick={onClear}
        style={{
          marginLeft: 'auto',
          border: 'none',
          background: 'none',
          color: theme.accent,
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Clear selection
      </button>
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
  const { theme } = useTheme()
  const color = tone === 'danger' ? theme.danger : theme.textPrimary
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: '34px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '0 14px',
        borderRadius: '8px',
        border: `1px solid ${tone === 'danger' ? theme.dangerBorder : theme.borderInput}`,
        background: theme.bgSurface,
        color,
        fontSize: '13px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  )
}

// ── Table cells ──────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#4a7a9b', '#5EA58C', '#D98C4A', '#A9568F', '#C95C5C', '#4E9BB5']

export function PersonCell({ name }: { name?: string | null }) {
  const { theme } = useTheme()
  if (!name) return <span style={{ color: theme.textMuted }}>—</span>
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  const color = AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: color,
          color: '#fff',
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
    return <span style={{ color: theme.textMuted, fontSize: '13px' }}>—</span>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '88px' }}>
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
                  background: done ? theme.accent : theme.bgSurface,
                  border: `2px solid ${done || current ? theme.accent : theme.borderStrong}`,
                }}
              />
              {i < total - 1 && (
                <span
                  style={{
                    flex: 1,
                    height: '2px',
                    background: i < reached ? theme.accent : theme.border,
                  }}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
      <span style={{ fontSize: '11px', color: theme.textSecondary, textAlign: 'center' }}>
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

// Row "⋮" menu — rendered in a portal so table overflow can't clip it.
export function RowMenu({ items }: { items: MenuItem[] }) {
  const { theme } = useTheme()
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
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
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
      }}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label="Row actions"
        onClick={(e) => {
          e.stopPropagation()
          if (pos) {
            setPos(null)
            return
          }
          const r = btnRef.current?.getBoundingClientRect()
          if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 190) })
        }}
        style={{
          width: '30px',
          height: '30px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          background: pos ? theme.bgSurfaceHover : 'transparent',
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
            onMouseDown={(e) => {
              e.stopPropagation()
            }}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 1000,
              width: '190px',
              padding: '6px',
              borderRadius: '10px',
              border: `1px solid ${theme.border}`,
              background: theme.bgSurface,
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            }}
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => {
                  setPos(null)
                  it.onClick()
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: it.tone === 'danger' ? theme.danger : theme.textPrimary,
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.bgSurfaceHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
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
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const btn = (disabled: boolean): React.CSSProperties => ({
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    border: `1px solid ${theme.borderInput}`,
    background: theme.bgSurface,
    color: theme.textSecondary,
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
        Showing {from}-{to} of {total} entries
      </span>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => {
            onChange(page - 1)
          }}
          style={btn(page <= 1)}
        >
          ‹
        </button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span
              key={`gap-${i}`}
              style={{ ...btn(true), border: 'none', background: 'none', opacity: 1 }}
            >
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => {
                onChange(n)
              }}
              style={{
                ...btn(false),
                background: n === page ? theme.accent : theme.bgSurface,
                color: n === page ? '#fff' : theme.textSecondary,
                borderColor: n === page ? theme.accent : theme.borderInput,
                fontWeight: n === page ? 700 : 500,
              }}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => {
            onChange(page + 1)
          }}
          style={btn(page >= pages)}
        >
          ›
        </button>
      </div>
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
            marginLeft: 'auto',
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
                background: theme.accent,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              <Icon name={action.icon} size={15} />
            </button>
          )}
          <button
            type="button"
            aria-label="Close preview"
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
        borderLeft: first ? 'none' : `1px solid ${theme.border}`,
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
        Workflow Progress
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
                    right: '50%',
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
                  background: done ? theme.accent : theme.bgSurface,
                  border: `2px solid ${done || isCurrent ? theme.accent : theme.borderStrong}`,
                  color: '#fff',
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
                      background: theme.accent,
                    }}
                  />
                )}
              </span>
              <span
                style={{
                  marginTop: '6px',
                  fontSize: '11px',
                  textAlign: 'center',
                  color: isCurrent ? theme.accent : done ? theme.textPrimary : theme.textMuted,
                  fontWeight: isCurrent ? 700 : 500,
                }}
              >
                {s}
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
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
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
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            onChange(t)
          }}
          style={{
            padding: '10px 0',
            border: 'none',
            borderBottom: `2px solid ${t === active ? theme.accent : 'transparent'}`,
            marginBottom: '-1px',
            background: 'none',
            color: t === active ? theme.accent : theme.textSecondary,
            fontWeight: t === active ? 600 : 500,
            fontSize: '13px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
        >
          {t}
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
  return d === 1 ? '1 day' : `${d} days`
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
