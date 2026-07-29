import React, { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface ScrollFadeRowProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  /** Background the fade should dissolve into — match whatever this strip sits on. */
  fadeColor?: string
  fadeWidth?: number
  /** align-items on the inner scrolling flex row. Defaults to the CSS default (stretch). */
  align?: React.CSSProperties['alignItems']
}

// Wraps a horizontally-scrollable strip (tabs, chips, a status stepper) with
// edge-fade overlays that only appear when there's more content off-screen —
// the visual cue that tells a user the row is swipeable at all.
export function ScrollFadeRow({
  children,
  className,
  style,
  fadeColor,
  fadeWidth = 24,
  align,
}: ScrollFadeRowProps) {
  const { theme } = useTheme()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)
  const resolvedFadeColor = fadeColor ?? theme.bgCanvas

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      setShowLeft(el.scrollLeft > 2)
      setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [children])

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          alignItems: align,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          ...style,
        }}
      >
        {children}
      </div>
      {showLeft && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${fadeWidth}px`,
            background: `linear-gradient(to right, ${resolvedFadeColor}, transparent)`,
            pointerEvents: 'none',
          }}
        />
      )}
      {showRight && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${fadeWidth}px`,
            background: `linear-gradient(to left, ${resolvedFadeColor}, transparent)`,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
