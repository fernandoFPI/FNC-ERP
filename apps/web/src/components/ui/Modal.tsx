import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { nudge, useDirtyGuard, useOverlay } from './overlay'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  bottomSheet?: boolean
  noPadding?: boolean
  /**
   * Whether a click on the dark area closes the modal (default yes). Even then, once something has been typed or
   * chosen inside, that click only nudges the modal instead: Esc, the close button and Cancel still close it.
   */
  closeOnBackdrop?: boolean
}

const maxWidths = { sm: '400px', md: '560px', lg: '720px', xl: '900px', '2xl': '1240px' }

// How far down the handle must be dragged, in pixels, for a phone sheet to close.
const SWIPE_CLOSE_DISTANCE = 90

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  className = '',
  bottomSheet,
  noPadding = false,
  closeOnBackdrop = true,
}: ModalProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const dragRef = useRef<{ startY: number; dy: number } | null>(null)

  const useBottomSheet = bottomSheet ?? isPhone

  // Escape (top overlay only), the page lock, focus in and back, and the Tab trap are shared with every drawer.
  useOverlay({ open, onClose, panelRef })
  // Something was typed or chosen inside: a stray click outside must not throw it away.
  const dirty = useDirtyGuard(panelRef)
  useEffect(() => {
    if (open) dirty.reset()
  }, [open]) // reset only when the modal opens

  if (!open) return null

  const dirtyHandlers = dirty.handlers

  const backdropClicked = (axis: 'scale' | 'lift') => {
    if (!closeOnBackdrop) return
    if (dirty.isDirty()) {
      nudge(panelRef.current, axis)
      panelRef.current?.focus()
      return
    }
    onClose()
  }

  const dialogProps = {
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': title ? titleId : undefined,
    'aria-describedby': description ? descriptionId : undefined,
  } as const

  const closeLabel = t('ui.generic.close')

  // ── PHONE — Bottom sheet ─────────────────────────────────────────────────────
  if (useBottomSheet) {
    const endDrag = (commit: boolean) => {
      const drag = dragRef.current
      dragRef.current = null
      const panel = panelRef.current
      if (!drag || !panel) return
      if (commit && drag.dy > SWIPE_CLOSE_DISTANCE) {
        onClose()
        return
      }
      panel.style.transition = 'transform 0.2s ease-out'
      panel.style.transform = ''
    }

    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        <div
          data-modal-backdrop=""
          onClick={() => {
            backdropClicked('lift')
          }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
        />
        <div
          ref={panelRef}
          data-modal-panel=""
          tabIndex={-1}
          className={className}
          {...dialogProps}
          {...dirtyHandlers}
          style={{
            position: 'relative',
            background: theme.bgSurface,
            borderRadius: '20px 20px 0 0',
            maxHeight: '92dvh',
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: 'env(safe-area-inset-bottom)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
            animation: 'fnc-sheet-up 0.3s cubic-bezier(0.4,0,0.2,1)',
            outline: 'none',
          }}
        >
          {/* Drag handle: pull it down to close the sheet. The close button and Esc do the same. */}
          <div
            data-testid="sheet-handle"
            aria-hidden="true"
            onPointerDown={(e) => {
              dragRef.current = { startY: e.clientY, dy: 0 }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const drag = dragRef.current
              const panel = panelRef.current
              if (!drag || !panel) return
              drag.dy = Math.max(0, e.clientY - drag.startY)
              panel.style.transition = 'none'
              panel.style.transform = `translateY(${drag.dy}px)`
            }}
            onPointerUp={() => {
              endDrag(true)
            }}
            onPointerCancel={() => {
              endDrag(false)
            }}
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '12px 0 8px',
              cursor: 'grab',
              touchAction: 'none',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '4px',
                borderRadius: '2px',
                background: theme.border,
              }}
            />
          </div>

          {title && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px 12px',
                borderBottom: `0.5px solid ${theme.border}`,
              }}
            >
              <div>
                <h2
                  id={titleId}
                  style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}
                >
                  {title}
                </h2>
                {description && (
                  <p
                    id={descriptionId}
                    style={{
                      fontSize: '13px',
                      color: theme.textSecondary,
                      marginTop: '4px',
                      margin: '4px 0 0',
                    }}
                  >
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label={closeLabel}
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.textSecondary,
                  cursor: 'pointer',
                  minWidth: '44px',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          )}

          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              padding: noPadding ? 0 : '20px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {children}
          </div>

          {footer && (
            <div
              style={{
                padding: '12px 20px',
                borderTop: `0.5px solid ${theme.border}`,
                background: theme.bgSurface,
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end',
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

  // ── TABLET + DESKTOP — Centred modal ────────────────────────────────────────
  return createPortal(
    <div
      data-modal-backdrop=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: theme.hasBlur ? 'blur(4px)' : 'none',
        WebkitBackdropFilter: theme.hasBlur ? 'blur(4px)' : 'none',
        animation: 'fadeIn 0.15s ease',
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) backdropClicked('scale')
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
      `}</style>
      <div
        ref={panelRef}
        data-modal-panel=""
        tabIndex={-1}
        className={className}
        {...dialogProps}
        {...dirtyHandlers}
        style={{
          width: '100%',
          maxWidth: maxWidths[size],
          animation: 'fnc-modal-in 0.2s cubic-bezier(0.4,0,0.2,1)',
          outline: 'none',
          background: theme.bgSurface,
          backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
          border: `${theme.hasBlur ? '0.5px' : '1px'} solid ${theme.border}`,
          borderRadius: '16px',
          overflow: 'hidden',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        }}
      >
        {title && (
          <div
            style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
              flexShrink: 0,
            }}
          >
            <div>
              <h2
                id={titleId}
                style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}
              >
                {title}
              </h2>
              {description && (
                <p
                  id={descriptionId}
                  style={{
                    fontSize: '13px',
                    color: theme.textSecondary,
                    marginTop: '4px',
                    margin: '4px 0 0',
                  }}
                >
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label={closeLabel}
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: theme.textSecondary,
                cursor: 'pointer',
                padding: '4px',
                minWidth: '32px',
                minHeight: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                flexShrink: 0,
              }}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        )}
        <div style={{ padding: noPadding ? 0 : '24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: '16px 24px',
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
