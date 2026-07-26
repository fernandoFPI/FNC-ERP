import React from 'react'
import { createPortal } from 'react-dom'
import { useToastStore } from '../../store/toastStore'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export function Toast() {
  const { toasts, removeToast } = useToastStore()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  const variantColors = {
    success: { bg: theme.successBg, border: theme.successBorder, color: theme.success },
    warning: { bg: theme.warningBg, border: theme.warningBorder, color: theme.warning },
    danger: { bg: theme.dangerBg, border: theme.dangerBorder, color: theme.danger },
    info: { bg: theme.infoBg, border: theme.infoBorder, color: theme.info },
  }

  if (toasts.length === 0) return null

  const positionStyle: React.CSSProperties = isPhone
    ? {
        top: 'calc(52px + env(safe-area-inset-top, 0px) + 8px)',
        left: '12px',
        right: '12px',
      }
    : {
        bottom: '20px',
        right: '20px',
      }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        ...positionStyle,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from { opacity:0; transform:translateX(20px) }
          to { opacity:1; transform:translateX(0) }
        }
      `}</style>
      {toasts.map((toast) => {
        const s = variantColors[toast.variant]
        const hasActions = !!toast.actions?.length
        return (
          <div
            key={toast.id}
            style={{
              padding: hasActions ? '14px 16px' : '12px 16px',
              background: theme.bgSurface,
              border: `1px solid ${s.border}`,
              borderRadius: '10px',
              backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
              WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              animation: 'slideInRight 0.2s ease',
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: hasActions ? 'column' : 'row',
              alignItems: hasActions ? 'flex-start' : 'center',
              gap: hasActions ? '12px' : '10px',
              minWidth: isPhone ? 'unset' : '260px',
              maxWidth: isPhone ? '100%' : hasActions ? '400px' : '360px',
              width: isPhone ? '100%' : undefined,
            }}
          >
            {hasActions ? (
              <>
                <div
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: s.color,
                      flexShrink: 0,
                      marginTop: '5px',
                      boxShadow: `0 0 6px ${s.color}`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: '13px',
                      color: theme.textPrimary,
                      flex: 1,
                      lineHeight: '1.4',
                    }}
                  >
                    {toast.message}
                  </span>
                  <button
                    onClick={() => {
                      removeToast(toast.id)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: theme.textMuted,
                      cursor: 'pointer',
                      fontSize: '16px',
                      lineHeight: 1,
                      padding: '2px',
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '6px', paddingLeft: '16px' }}>
                  {toast.actions!.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        action.onClick()
                        removeToast(toast.id)
                      }}
                      style={{
                        padding: '5px 14px',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background:
                          action.variant === 'danger'
                            ? '#ef4444'
                            : action.variant === 'primary'
                              ? theme.accent
                              : theme.bgCanvas,
                        color:
                          action.variant === 'danger' || action.variant === 'primary'
                            ? '#fff'
                            : theme.textSecondary,
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: s.color,
                    flexShrink: 0,
                    boxShadow: `0 0 6px ${s.color}`,
                  }}
                />
                <span style={{ fontSize: '13px', color: theme.textPrimary, flex: 1 }}>
                  {toast.message}
                </span>
                <button
                  onClick={() => {
                    removeToast(toast.id)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.textMuted,
                    cursor: 'pointer',
                    fontSize: '16px',
                    lineHeight: 1,
                    padding: '2px',
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </>
            )}
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
