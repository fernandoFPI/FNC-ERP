import { useEffect } from 'react'
import { api } from '../lib/axios'
import { useApprovalStore } from '../store/approvalStore'
import { useAuthStore } from '../store/authStore'

export function useApprovalQueueCount() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setPendingCount = useApprovalStore((s) => s.setPendingCount)

  function fetchCount() {
    if (!isAuthenticated) return
    api
      .get<{ total: number }>('/procurement/purchase-orders/approval-queue/count')
      .then((r) => setPendingCount((r.data as unknown as { total: number }).total ?? 0))
      .catch(() => undefined)
  }

  useEffect(() => {
    fetchCount()
    const id = setInterval(fetchCount, 60_000)
    window.addEventListener('focus', fetchCount)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', fetchCount)
    }
  }, [isAuthenticated])
}
