import { gql } from '@apollo/client'

export const REQUISITIONS_QUERY = gql`
  query Requisitions($status: String, $projectId: ID, $branchId: ID, $myQueueOnly: Boolean) {
    requisitions(status: $status, projectId: $projectId, branchId: $branchId, myQueueOnly: $myQueueOnly) {
      id
      requisition_number
      status
      priority
      purpose
      delivery_destination
      project_id
      projectName
      branch_id
      branch_name
      organizer_id
      organizerName
      notes
      created_at
      updated_at
    }
  }
`
