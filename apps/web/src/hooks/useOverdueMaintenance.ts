import { useQuery } from '@apollo/client'
import { OVERDUE_MAINTENANCE_COUNT_QUERY } from '../graphql/rental'
import type { OverdueMaintenanceCountQuery, OverdueMaintenanceCountQueryVariables } from '../graphql/generated'

export function useOverdueMaintenance() {
  const { data } = useQuery<OverdueMaintenanceCountQuery, OverdueMaintenanceCountQueryVariables>(OVERDUE_MAINTENANCE_COUNT_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 5 * 60 * 1000,
  })
  return data?.overdueMaintenanceCount ?? 0
}
