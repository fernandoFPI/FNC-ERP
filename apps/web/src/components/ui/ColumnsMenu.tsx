import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useIsRtl } from '../../i18n'

export interface ColumnsMenuItem {
  key: string
  label: string
  on: boolean
  /** Always shown: its box is ticked and can't be changed. */
  locked?: boolean
}

interface ColumnsMenuProps {
  items: ColumnsMenuItem[]
  onToggle: (key: string, on: boolean) => void
  onReset: () => void
  /** True when the person's choices differ from the defaults, which is what "Reset" undoes. */
  canReset: boolean
  /** Small print under the list, e.g. which columns can't be hidden. */
  note?: string
}

const PANEL_WIDTH = 248
const EDGE = 8 // never closer than this to the window's edge
const GAP = 6 // between the button and the menu
const MAX_HEIGHT = 480
// Below this much room under the button the menu opens upward, if there is more room above.
const MIN_ROOM_BELOW = 260

interface PanelPlace {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

// "Columns · 6 of 9" button that opens a list of tick boxes, one per optional column. It only
// reports what was ticked; remembering the choice is useTableView's job.
//
// The list is drawn in a portal at the end of <body>, placed from the button's position, rather
// than inside the table's card: the card clips anything that sticks out of it (`overflow:
// hidden`), and a short card (a one-line order) cut the menu off after the fifth column.
// A portal leaves the natural Tab order, so focus is moved into the list when it opens and back
// to the button on Escape.
export function ColumnsMenu({ items, onToggle, onReset, canReset, note }: ColumnsMenuProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isRtl = useIsRtl()
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<PanelPlace | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const reposition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const r = button.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(PANEL_WIDTH, vw * 0.86)
    // line the menu's far edge up with the button's: right edge in English, left edge in Arabic
    const wanted = isRtl ? r.left : r.right - width
    const left = Math.max(EDGE, Math.min(wanted, vw - width - EDGE))
    const below = vh - r.bottom - EDGE - GAP
    const above = r.top - EDGE - GAP
    const openUp = below < MIN_ROOM_BELOW && above > below
    const maxHeight = Math.max(160, Math.min(openUp ? above : below, MAX_HEIGHT))
    setPlace(
      openUp
        ? { left, width, bottom: vh - r.top + GAP, maxHeight }
        : { left, width, top: r.bottom + GAP, maxHeight },
    )
  }, [isRtl])

  // placed before the browser paints, so the menu never flashes in the wrong spot
  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (e: MouseEvent) => {
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
    document.addEventListener('mousedown', closeOnOutsideClick)
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [open, reposition])

  // keyboard users: the list is not next to the button in the page, so go to it
  const placed = place !== null
  useEffect(() => {
    if (!open || !placed) return
    panelRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus()
  }, [open, placed])

  const shown = items.filter((i) => i.on || i.locked).length

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative' }}
      // React sends events from the portal up to here, so Escape works from inside the list too
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false)
          buttonRef.current?.focus()
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((v) => !v)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          background: open ? theme.accentBg : theme.bgSurface,
          border: `1px solid ${open ? theme.accentBorder : theme.borderInput}`,
          color: open ? theme.accent : theme.textPrimary,
          borderRadius: '8px',
          padding: '7px 11px',
          fontSize: '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M15 4v16" />
        </svg>
        {t('ui.tableView.columnsCount', { shown, total: items.length })}
      </button>

      {open &&
        place &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="group"
            aria-label={t('ui.tableView.showColumns')}
            style={{
              position: 'fixed',
              top: place.top,
              bottom: place.bottom,
              left: place.left,
              width: place.width,
              maxHeight: place.maxHeight,
              overflowY: 'auto',
              boxSizing: 'border-box',
              zIndex: 1000,
              background: theme.bgSurface,
              border: `1px solid ${theme.borderInput}`,
              borderRadius: '10px',
              boxShadow: '0 10px 28px rgba(26, 26, 46, 0.18)',
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: theme.textSecondary,
                marginBottom: '8px',
              }}
            >
              {t('ui.tableView.showColumns')}
            </div>
            {items.map((item) => (
              <label
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 0',
                  fontSize: '13px',
                  color: item.locked ? theme.textSecondary : theme.textPrimary,
                  cursor: item.locked ? 'default' : 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={item.on || !!item.locked}
                  disabled={item.locked}
                  onChange={(e) => {
                    onToggle(item.key, e.target.checked)
                  }}
                  style={{ accentColor: theme.accent }}
                />
                {item.label}
              </label>
            ))}
            {(!!note || canReset) && (
              <div
                style={{
                  borderTop: `1px solid ${theme.border}`,
                  marginTop: '8px',
                  paddingTop: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {note && <div style={{ fontSize: '12px', color: theme.textSecondary }}>{note}</div>}
                {canReset && (
                  <button
                    type="button"
                    onClick={onReset}
                    style={{
                      alignSelf: 'flex-start',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: theme.accent,
                    }}
                  >
                    {t('ui.tableView.resetToDefault')}
                  </button>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
