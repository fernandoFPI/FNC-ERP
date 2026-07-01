import { useQuery } from '@apollo/client'
import { MY_PO_QUEUE_QUERY } from '../graphql/procurement'

export function useMyPOQueueCount(): number {
  const { data } = useQuery(MY_PO_QUEUE_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 60_000,
  })
  return (data?.myPOQueue as unknown[])?.length ?? 0
}
