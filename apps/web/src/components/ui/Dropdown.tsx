import React, { useState, useRef, useEffect } from 'react'
import { Card } from './Card'
import { useTheme } from '../../theme/ThemeContext'

interface DropdownItem {
  label: string
  onClick: () => void
  danger?: boolean
  icon?: React.ReactNode
}

interface DropdownProps {
  trigger: React.ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
  className?: string
}

export function Dropdown({ trigger, items, align = 'left', className = '' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
    }
  }, [])

  return (
    <div ref={ref} className={className} style={{ position: 'relative', display: 'inline-flex' }}>
      <div
        onClick={() => {
          setOpen((v) => !v)
        }}
        style={{ cursor: 'pointer' }}
      >
        {trigger}
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align === 'right' ? 'right' : 'left']: 0,
            zIndex: 500,
            minWidth: '160px',
          }}
        >
          <Card padding="none" rimHighlight>
            <div style={{ padding: '4px' }}>
              {items.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    item.onClick()
                    setOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '13px',
                    color: item.danger ? theme.danger : theme.textSecondary,
                    background: 'none',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme.bgSurfaceHover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'none'
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
