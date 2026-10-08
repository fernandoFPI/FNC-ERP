import { useQuery } from '@apollo/client'
import { MY_PO_QUEUE_QUERY } from '../graphql/procurement'
import { MY_REQUISITION_QUEUE_QUERY } from '../graphql/requisitions'
import type {
  MyPoQueueQuery,
  MyPoQueueQueryVariables,
  MyRequisitionApprovalQueueQuery,
  MyRequisitionApprovalQueueQueryVariables,
} from '../graphql/generated'

// Items awaiting the signed-in user's action: purchase orders + requisitions.
// Same queries (and cache entries) as the My Queue page itself, so the sidebar
// badge and the page never disagree. Expense claims / settlements are REST-only
// and approver-gated; they appear on the page but aren't counted here.
export function useMyQueueCount(): number {
  const { data: po } = useQuery<MyPoQueueQuery, MyPoQueueQueryVariables>(MY_PO_QUEUE_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 60_000,
  })
  const { data: req } = useQuery<
    MyRequisitionApprovalQueueQuery,
    MyRequisitionApprovalQueueQueryVariables
  >(MY_REQUISITION_QUEUE_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 60_000,
  })
  return (po?.myPOQueue?.length ?? 0) + (req?.myRequisitionApprovalQueue.length ?? 0)
}
