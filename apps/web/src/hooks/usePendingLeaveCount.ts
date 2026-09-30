import { useEffect, useState } from 'react'

const POLL_INTERVAL = 60_000

interface PendingLeaveResponse {
  total?: number
  count?: number
  leaves?: unknown[]
}

export function usePendingLeaveCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetch_() {
      try {
        const res = await fetch('/api/v1/hr/leave?status=pending&limit=1')
        const json = (await res.json()) as PendingLeaveResponse
        if (!cancelled)
          setCount(
            json.total ?? json.count ?? (Array.isArray(json.leaves) ? json.leaves.length : 0),
          )
      } catch {
        /* no-op */
      }
    }

    const onFocus = () => void fetch_()
    void fetch_()
    const id = setInterval(onFocus, POLL_INTERVAL)
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return count
}
