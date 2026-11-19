import React, { useState, useRef } from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export function Tooltip({ content, children, position = 'top', className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()

  const posStyles: Record<string, React.CSSProperties> = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '6px' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '6px' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '6px' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '6px' },
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => {
        setVisible(true)
      }}
      onMouseLeave={() => {
        setVisible(false)
      }}
    >
      {children}
      {visible && (
        <div
          style={{
            position: 'absolute',
            zIndex: 9999,
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 500,
            background: theme.bgSurface,
            border: `1px solid ${theme.borderStrong}`,
            borderRadius: '8px',
            boxShadow: '0 6px 18px rgba(26, 26, 46, 0.14)',
            color: theme.textPrimary,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
            ...posStyles[position],
          }}
        >
          {content}
        </div>
      )}
    </div>
  )
}
