import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  bottomSheet?: boolean
  noPadding?: boolean
  closeOnBackdrop?: boolean
}

const maxWidths = { sm: '400px', md: '560px', lg: '720px', xl: '900px' }

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
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const panelRef = useRef<HTMLDivElement>(null)

  const useBottomSheet = bottomSheet ?? isPhone

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  // ── PHONE — Bottom sheet ─────────────────────────────────────────────────────
  if (useBottomSheet) {
    return createPortal(
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}>
        <div
          onClick={closeOnBackdrop ? onClose : undefined}
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
          tabIndex={-1}
          className={className}
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
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: theme.border }} />
          </div>

          {title && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 20px 12px',
              borderBottom: `0.5px solid ${theme.border}`,
            }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}>{title}</h2>
                {description && (
                  <p style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px', margin: '4px 0 0' }}>
                    {description}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer',
                  minWidth: '44px', minHeight: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px',
                }}
              >
                ✕
              </button>
            </div>
          )}

          <div style={{
            overflowY: 'auto',
            flex: 1,
            padding: noPadding ? 0 : '20px',
            WebkitOverflowScrolling: 'touch',
          }}>
            {children}
          </div>

          {footer && (
            <div style={{
              padding: '12px 20px',
              borderTop: `0.5px solid ${theme.border}`,
              background: theme.bgSurface,
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
            }}>
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
      onClick={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose() }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
      `}</style>
      <div
        ref={panelRef}
        tabIndex={-1}
        className={className}
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
          <div style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
          }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}>{title}</h2>
              {description && (
                <p style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px', margin: '4px 0 0' }}>
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer',
                padding: '4px', minWidth: '32px', minHeight: '32px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '6px', flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}
        <div style={{ padding: noPadding ? 0 : '24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: '16px 24px',
            borderTop: `1px solid ${theme.border}`,
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
