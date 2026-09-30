import { useEffect, useState } from 'react'

const POLL_INTERVAL = 60_000

interface PendingOvertimeResponse {
  total?: number
  count?: number
  requests?: unknown[]
}

export function usePendingOvertimeCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetch_() {
      try {
        const res = await fetch('/api/v1/hr/overtime?status=pending&limit=1')
        const json = (await res.json()) as PendingOvertimeResponse
        if (!cancelled)
          setCount(
            json.total ?? json.count ?? (Array.isArray(json.requests) ? json.requests.length : 0),
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
