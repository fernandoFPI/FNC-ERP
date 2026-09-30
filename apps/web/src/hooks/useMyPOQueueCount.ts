import { useQuery } from '@apollo/client'
import { MY_PO_QUEUE_QUERY } from '../graphql/procurement'
import type { MyPoQueueQuery, MyPoQueueQueryVariables } from '../graphql/generated'

export function useMyPOQueueCount(): number {
  const { data } = useQuery<MyPoQueueQuery, MyPoQueueQueryVariables>(MY_PO_QUEUE_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 60_000,
  })
  return data?.myPOQueue?.length ?? 0
}
