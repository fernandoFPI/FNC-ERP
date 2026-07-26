import { useEffect, useRef } from 'react'
import { useQuery } from '@apollo/client'
import { PAYROLL_RUN_QUERY } from '../graphql/payroll'

export function usePayrollStatus(runId: string | undefined) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data, refetch } = useQuery(PAYROLL_RUN_QUERY, {
    variables: { id: runId },
    skip: !runId,
    fetchPolicy: 'network-only',
  })

  const status: string | undefined = data?.payrollRun?.status

  useEffect(() => {
    if (status !== 'processing') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    intervalRef.current = setInterval(() => {
      refetch().catch(() => undefined)
    }, 3_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [status, refetch])

  return status
}
