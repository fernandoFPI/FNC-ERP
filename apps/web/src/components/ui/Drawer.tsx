import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Card } from './Card'
import { useTheme } from '../../theme/ThemeContext'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
  className?: string
  noPadding?: boolean
}

export function Drawer({ open, onClose, title, children, width = '400px', className = '', noPadding = false }: DrawerProps) {
  const { theme } = useTheme()

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={className}
        style={{
          width,
          height: '100%',
          animation: 'slideInRight 0.2s ease',
        }}
      >
        <style>{`@keyframes slideInRight { from { transform:translateX(100%) } to { transform:translateX(0) } }`}</style>
        <Card padding="none" style={{ height: '100%', borderRadius: '0', borderRight: 'none' }}>
          <div style={{
            padding: '18px 20px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>{title}</h3>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: theme.textMuted,
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
                padding: '4px',
              }}
            >
              ×
            </button>
          </div>
          <div style={{
            padding: noPadding ? '0' : '20px',
            overflowY: noPadding ? 'hidden' : 'auto',
            height: 'calc(100% - 61px)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {children}
          </div>
        </Card>
      </div>
    </div>,
    document.body
  )
}
