import { useEffect, useRef, type RefObject } from 'react'

interface SwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
  edgeOnly?: boolean
  edgeWidth?: number
}

export function useSwipeGesture(ref: RefObject<HTMLElement>, options: SwipeOptions) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  const onSwipeLeftRef = useRef(options.onSwipeLeft)
  const onSwipeRightRef = useRef(options.onSwipeRight)
  onSwipeLeftRef.current = options.onSwipeLeft
  onSwipeRightRef.current = options.onSwipeRight

  const threshold = options.threshold ?? 50
  const edgeOnly = options.edgeOnly ?? false
  const edgeWidth = options.edgeWidth ?? 20

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0]
      if (edgeOnly) {
        if (touch.clientX > edgeWidth && touch.clientX < window.innerWidth - edgeWidth) return
      }
      startX.current = touch.clientX
      startY.current = touch.clientY
    }

    function onTouchEnd(e: TouchEvent) {
      if (startX.current === null || startY.current === null) return
      const touch = e.changedTouches[0]
      const dx = touch.clientX - startX.current
      const dy = touch.clientY - startY.current
      startX.current = null
      startY.current = null

      if (Math.abs(dy) > Math.abs(dx)) return // vertical swipe — ignore

      if (dx > threshold) onSwipeRightRef.current?.()
      else if (dx < -threshold) onSwipeLeftRef.current?.()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [ref, threshold, edgeOnly, edgeWidth])
}
