import { useState, useEffect } from 'react'
import { BPV } from '../styles/breakpoints'

type Breakpoint = 'phone' | 'tablet' | 'desktop'

function getBreakpoint(w: number): Breakpoint {
  if (w < BPV.phone) return 'phone'
  if (w < BPV.tablet) return 'tablet'
  return 'desktop'
}

export function useBreakpoint() {
  const [bp, setBp] = useState<Breakpoint>(() =>
    getBreakpoint(typeof window !== 'undefined' ? window.innerWidth : 1440)
  )

  useEffect(() => {
    let frame: number
    const handler = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setBp(getBreakpoint(window.innerWidth)))
    }
    window.addEventListener('resize', handler, { passive: true })
    return () => {
      window.removeEventListener('resize', handler)
      cancelAnimationFrame(frame)
    }
  }, [])

  return {
    bp,
    isPhone:   bp === 'phone',
    isTablet:  bp === 'tablet',
    isDesktop: bp === 'desktop',
    isTouch:   bp !== 'desktop',
    isMobile:  bp === 'phone',  // backward compat — same meaning as before
  }
}
