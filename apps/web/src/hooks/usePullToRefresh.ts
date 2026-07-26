import { useState, useEffect, useRef, type RefObject } from 'react'
import { useBreakpoint } from './useBreakpoint'

export function usePullToRefresh(ref: RefObject<HTMLElement>, onRefresh: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const { isPhone } = useBreakpoint()
  const refreshingRef = useRef(refreshing)
  refreshingRef.current = refreshing

  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    if (!isPhone) return
    const el = ref.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      if (el!.scrollTop === 0) {
        startY.current = e.touches[0].clientY
      }
    }

    async function onTouchEnd(e: TouchEvent) {
      if (startY.current === null) return
      const dy = e.changedTouches[0].clientY - startY.current
      startY.current = null
      if (dy > 80 && !refreshingRef.current) {
        setRefreshing(true)
        try {
          await onRefreshRef.current()
        } finally {
          setRefreshing(false)
        }
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [isPhone, ref])

  return { refreshing }
}
