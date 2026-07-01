import { useState, useEffect } from 'react'
import { api } from '../lib/axios'

export function useAPPendingCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      try {
        const res = await api.get<{ pending_approval_count?: number }>('/finance/vendor-invoices/ap-summary')
        if (!cancelled) setCount(res.data.pending_approval_count ?? 0)
      } catch {
        // silently ignore — badge is non-critical
      }
    }

    void fetch()
    const interval = setInterval(() => { void fetch() }, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return count
}
