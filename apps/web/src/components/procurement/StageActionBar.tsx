import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface StageActionBarProps {
  /** What the step is, e.g. "Next step: market pricing". */
  title: string
  /** One line on what the step does. On a phone it sits behind the info button. */
  hint?: string
  /** Where the step stands, short: what is still missing, who must act. Always shown, so keep it to a line or two. */
  status?: ReactNode
  /**
   * Longer, explanatory material (how a two-part step works, who has submitted). On a desktop it is shown above
   * `status`; on a phone it sits behind the info button next to `hint`, so the bar stays small.
   */
  more?: ReactNode
  /** The step's buttons. Leave out when the viewer has nothing to press (the bar then only explains). */
  children?: ReactNode
  /** On a phone, give every button the whole row (long labels such as "Submit for re-approval" would be cut in half a row). */
  stackButtonsOnPhone?: boolean
  /**
   * On a phone, an arrow in the title row folds the bar down to its title (the status, the info and the buttons are hidden until it
   * is opened again), so a long step does not cover the lines. Opt-in; a desktop bar is never folded.
   */
  collapsible?: boolean
}

/** What the page reserves under its content while the phone bar floats over it, before the bar has been measured. */
const PHONE_SPACER_FALLBACK_PX = 120

/**
 * The bar at the bottom of a requisition (or PO) page that holds the step's one action.
 * On a desktop it sticks to the bottom of the window while the lines scroll past; on a phone it
 * is fixed just above the bottom navigation, like `StickyActionBar`. It is not drawn inside a
 * `Card` (a card clips what sticks out of it, playbook #42).
 *
 * On a phone it is kept small on purpose: the title, the one thing that blocks the step, and the buttons
 * side by side. The explanation is behind an info button (the bar used to take about a quarter of the screen).
 */
export function StageActionBar({
  title,
  hint,
  status,
  more,
  children,
  stackButtonsOnPhone = false,
  collapsible = false,
}: StageActionBarProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const [infoOpen, setInfoOpen] = useState(false)
  const [folded, setFolded] = useState(false)
  const isFolded = collapsible && folded
  const barRef = useRef<HTMLElement | null>(null)
  const [barHeight, setBarHeight] = useState(0)

  // The phone bar floats over the page, so the page keeps a spacer as tall as the bar under its last line.
  useLayoutEffect(() => {
    const el = barRef.current
    if (!isPhone || !el) return
    const measure = () => {
      setBarHeight(el.offsetHeight)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [isPhone, infoOpen, isFolded])

  const actions = children ? (
    <div
      style={
        isPhone
          ? {
              display: 'grid',
              // Two buttons share the row; one button takes it all.
              gridTemplateColumns: stackButtonsOnPhone
                ? 'minmax(0, 1fr)'
                : 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '8px',
            }
          : {
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }
      }
    >
      {children}
    </div>
  ) : null

  if (isPhone) {
    const hasInfo = Boolean(hint) || Boolean(more)
    return (
      <>
        <section
          ref={barRef}
          aria-label={title}
          style={{
            position: 'fixed',
            bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
            left: 0,
            right: 0,
            padding: '10px 16px 12px',
            background: theme.bgSurface,
            borderTop: `0.5px solid ${theme.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 30,
            maxHeight: '60vh',
            overflowY: 'auto',
            backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
            WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>
                {title}
              </div>
              {status && !isFolded && <div style={{ marginTop: '4px' }}>{status}</div>}
            </div>
            {collapsible && (
              <button
                type="button"
                aria-label={t(isFolded ? 'req.detail.expandStep' : 'req.detail.collapseStep')}
                aria-expanded={!isFolded}
                onClick={() => {
                  setFolded((f) => !f)
                }}
                style={{
                  flexShrink: 0,
                  width: '36px',
                  height: '36px',
                  margin: '-6px -6px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '999px',
                  color: theme.textSecondary,
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{
                    transform: isFolded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
            {hasInfo && !isFolded && (
              <button
                type="button"
                aria-label={t('req.detail.aboutThisStep')}
                aria-expanded={infoOpen}
                onClick={() => {
                  setInfoOpen((open) => !open)
                }}
                style={{
                  flexShrink: 0,
                  width: '36px',
                  height: '36px',
                  margin: '-6px -6px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: infoOpen ? `${theme.accent}18` : 'transparent',
                  border: 'none',
                  borderRadius: '999px',
                  color: theme.accent,
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="11" x2="12" y2="16.5" />
                  <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
          {infoOpen && hasInfo && !isFolded && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '13px',
                lineHeight: 1.45,
                color: theme.textSecondary,
              }}
            >
              {hint && <div>{hint}</div>}
              {more}
            </div>
          )}
          {!isFolded && actions}
        </section>
        {/* The fixed bar takes no room in the page; this keeps the last lines reachable above it. */}
        <div
          aria-hidden="true"
          style={{ height: `${barHeight > 0 ? barHeight + 8 : PHONE_SPACER_FALLBACK_PX}px` }}
        />
      </>
    )
  }

  return (
    <section
      aria-label={title}
      style={{
        position: 'sticky',
        bottom: '12px',
        zIndex: 20,
        marginTop: '16px',
        padding: '14px 20px',
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        boxShadow: '0 -4px 18px rgba(0, 0, 0, 0.07)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px 24px',
        backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
        WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>{title}</div>
        {hint && (
          <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '2px' }}>
            {hint}
          </div>
        )}
        {(Boolean(more) || Boolean(status)) && (
          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {more}
            {status}
          </div>
        )}
      </div>
      {actions}
    </section>
  )
}
