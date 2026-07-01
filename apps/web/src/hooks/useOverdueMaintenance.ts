import { useQuery } from '@apollo/client'
import { OVERDUE_MAINTENANCE_COUNT_QUERY } from '../graphql/rental'

export function useOverdueMaintenance() {
  const { data } = useQuery(OVERDUE_MAINTENANCE_COUNT_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 5 * 60 * 1000,
  })
  return (data?.overdueMaintenanceCount as number) ?? 0
}
