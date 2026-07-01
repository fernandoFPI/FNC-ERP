import { gql } from '@apollo/client'

const MR_FIELDS = `
  id requestNumber projectId projectName
  requestingCompanyId requestingCompanyName
  productId productName productSku
  qtyRequested requiredDate description status
  requestedBy requestedByName
  approvedBy approvedByName approvedAt rejectionReason
  moId moNumber actualCost currencyCode notes createdAt
`

export const MANUFACTURING_REQUESTS_QUERY = gql`
  query ManufacturingRequests($projectId: ID, $status: String) {
    manufacturingRequests(projectId: $projectId, status: $status) { ${MR_FIELDS} }
  }
`

export const MANUFACTURING_REQUEST_QUERY = gql`
  query ManufacturingRequest($id: ID!) {
    manufacturingRequest(id: $id) { ${MR_FIELDS} }
  }
`

export const CREATE_MANUFACTURING_REQUEST = gql`
  mutation CreateManufacturingRequest($input: ManufacturingRequestInput!) {
    createManufacturingRequest(input: $input) { ${MR_FIELDS} }
  }
`

export const SUBMIT_MANUFACTURING_REQUEST = gql`
  mutation SubmitManufacturingRequest($id: ID!) {
    submitManufacturingRequest(id: $id) { ${MR_FIELDS} }
  }
`

export const APPROVE_MANUFACTURING_REQUEST = gql`
  mutation ApproveManufacturingRequest($id: ID!) {
    approveManufacturingRequest(id: $id) { ${MR_FIELDS} }
  }
`

export const REJECT_MANUFACTURING_REQUEST = gql`
  mutation RejectManufacturingRequest($id: ID!, $reason: String!) {
    rejectManufacturingRequest(id: $id, reason: $reason) { ${MR_FIELDS} }
  }
`

export const CANCEL_MANUFACTURING_REQUEST = gql`
  mutation CancelManufacturingRequest($id: ID!) {
    cancelManufacturingRequest(id: $id) { ${MR_FIELDS} }
  }
`

export const CREATE_MO_FROM_REQUEST = gql`
  mutation CreateMOFromRequest($requestId: ID!, $bomId: ID!, $workCenterId: ID, $scheduledStart: String, $scheduledEnd: String) {
    createMOFromRequest(requestId: $requestId, bomId: $bomId, workCenterId: $workCenterId, scheduledStart: $scheduledStart, scheduledEnd: $scheduledEnd) { ${MR_FIELDS} }
  }
`
