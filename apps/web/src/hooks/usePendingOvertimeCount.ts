import { useEffect, useState } from 'react'

const POLL_INTERVAL = 60_000

export function usePendingOvertimeCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetch_() {
      try {
        const res = await fetch('/api/v1/hr/overtime?status=pending&limit=1')
        const json = await res.json()
        if (!cancelled) setCount(json.total ?? json.count ?? (Array.isArray(json.requests) ? json.requests.length : 0))
      } catch { /* no-op */ }
    }

    fetch_()
    const id = setInterval(fetch_, POLL_INTERVAL)
    window.addEventListener('focus', fetch_)
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('focus', fetch_) }
  }, [])

  return count
}
