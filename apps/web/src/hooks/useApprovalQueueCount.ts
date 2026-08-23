import { useEffect } from 'react'
import { useQuery } from '@apollo/client'
import { MY_APPROVAL_QUEUE_QUERY } from '../graphql/procurement'
import { useApprovalStore } from '../store/approvalStore'
import { useAuthStore } from '../store/authStore'

export function useApprovalQueueCount() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setPendingCount = useApprovalStore((s) => s.setPendingCount)

  const { data, refetch } = useQuery<{ myApprovalQueue: unknown[] }>(MY_APPROVAL_QUEUE_QUERY, {
    skip: !isAuthenticated,
    pollInterval: 60_000,
    fetchPolicy: 'network-only',
  })

  useEffect(() => {
    setPendingCount(data?.myApprovalQueue?.length ?? 0)
  }, [data, setPendingCount])

  useEffect(() => {
    if (!isAuthenticated) return
    function onFocus() {
      void refetch()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
    }
  }, [isAuthenticated, refetch])
}
