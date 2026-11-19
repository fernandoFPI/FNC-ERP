import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useIsRtl } from '../../i18n'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { nudge, useDirtyGuard, useOverlay } from './overlay'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
  className?: string
  noPadding?: boolean
  /** A line under the title that a screen reader also reads as the dialog's description. */
  description?: string
  /** Buttons pinned under the content (Cancel / Save). */
  footer?: React.ReactNode
  /**
   * Whether a click on the dark area closes the drawer (default yes). Even then, once something has been typed or
   * chosen inside, that click only nudges the drawer: Esc, the close button and Cancel still close it.
   */
  closeOnBackdrop?: boolean
}

/**
 * A panel that slides in from the side. It behaves like the shared Modal (see `overlay.ts`): a named dialog for a
 * screen reader, Escape closes the top overlay only, Tab stays inside, focus goes back to what opened it, the page
 * behind stays put, a stray click does not throw a half-filled form away, and it is as wide as the screen on a phone.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = '400px',
  className = '',
  noPadding = false,
  description,
  footer,
  closeOnBackdrop = true,
}: DrawerProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const rtl = useIsRtl()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useOverlay({ open, onClose, panelRef })
  const dirty = useDirtyGuard(panelRef)
  useEffect(() => {
    if (open) dirty.reset()
  }, [open]) // reset only when the drawer opens

  if (!open) return null

  const closeSize = isPhone ? '44px' : '36px'

  return createPortal(
    <div
      data-overlay-backdrop=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !closeOnBackdrop) return
        if (dirty.isDirty()) {
          nudge(panelRef.current, 'sideways')
          panelRef.current?.focus()
          return
        }
        onClose()
      }}
    >
      <style>{`@keyframes fnc-drawer-in { from { transform:translateX(${rtl ? '-100%' : '100%'}) } to { transform:translateX(0) } }`}</style>
      <div
        ref={panelRef}
        data-overlay-panel=""
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={className}
        {...dirty.handlers}
        style={{
          width: isPhone ? '100%' : width,
          maxWidth: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: theme.bgSurface,
          borderInlineStart: `1px solid ${theme.border}`,
          boxShadow: '-8px 0 40px rgba(0,0,0,0.25)',
          animation: 'fnc-drawer-in 0.2s ease',
          outline: 'none',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div
          style={{
            padding: '16px 16px 16px 20px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            // a one-line title sits level with the close button; with a description under it, both hang from the top
            alignItems: description ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id={titleId}
              style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}
            >
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                style={{ fontSize: '13px', color: theme.textSecondary, margin: '4px 0 0' }}
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={t('ui.generic.close')}
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: theme.textSecondary,
              cursor: 'pointer',
              width: closeSize,
              height: closeSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              fontSize: '18px',
              flexShrink: 0,
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div
          style={{
            padding: noPadding ? 0 : '20px',
            overflowY: noPadding ? 'hidden' : 'auto',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: `1px solid ${theme.border}`,
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
