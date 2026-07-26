import React from 'react'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface GridProps {
  children: React.ReactNode
  cols?: number
  tabletCols?: number
  phoneCols?: number
  gap?: number
  style?: React.CSSProperties
}

export function Grid({
  children,
  cols = 3,
  tabletCols = 2,
  phoneCols = 1,
  gap = 12,
  style,
}: GridProps) {
  const { isPhone, isTablet } = useBreakpoint()
  const activeCols = isPhone ? phoneCols : isTablet ? tabletCols : cols

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${activeCols}, minmax(0, 1fr))`,
        gap: `${gap}px`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
