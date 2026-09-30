import { gql } from '@apollo/client'

const MR_FIELDS = gql`
  fragment MRFields on ManufacturingRequest {
    id requestNumber projectId projectName
    requestingCompanyId requestingCompanyName
    productId productName productSku
    qtyRequested requiredDate description status
    requestedBy requestedByName
    approvedBy approvedByName approvedAt rejectionReason
    moId moNumber actualCost currencyCode notes createdAt
  }
`

export const MANUFACTURING_REQUESTS_QUERY = gql`
  ${MR_FIELDS}
  query ManufacturingRequests($projectId: ID, $status: String) {
    manufacturingRequests(projectId: $projectId, status: $status) { ...MRFields }
  }
`

export const MANUFACTURING_REQUEST_QUERY = gql`
  ${MR_FIELDS}
  query ManufacturingRequest($id: ID!) {
    manufacturingRequest(id: $id) { ...MRFields }
  }
`

export const CREATE_MANUFACTURING_REQUEST = gql`
  ${MR_FIELDS}
  mutation CreateManufacturingRequest($input: ManufacturingRequestInput!) {
    createManufacturingRequest(input: $input) { ...MRFields }
  }
`

export const SUBMIT_MANUFACTURING_REQUEST = gql`
  ${MR_FIELDS}
  mutation SubmitManufacturingRequest($id: ID!) {
    submitManufacturingRequest(id: $id) { ...MRFields }
  }
`

export const APPROVE_MANUFACTURING_REQUEST = gql`
  ${MR_FIELDS}
  mutation ApproveManufacturingRequest($id: ID!) {
    approveManufacturingRequest(id: $id) { ...MRFields }
  }
`

export const REJECT_MANUFACTURING_REQUEST = gql`
  ${MR_FIELDS}
  mutation RejectManufacturingRequest($id: ID!, $reason: String!) {
    rejectManufacturingRequest(id: $id, reason: $reason) { ...MRFields }
  }
`

export const CANCEL_MANUFACTURING_REQUEST = gql`
  ${MR_FIELDS}
  mutation CancelManufacturingRequest($id: ID!) {
    cancelManufacturingRequest(id: $id) { ...MRFields }
  }
`

export const CREATE_MO_FROM_REQUEST = gql`
  ${MR_FIELDS}
  mutation CreateMOFromRequest($requestId: ID!, $bomId: ID!, $workCenterId: ID, $scheduledStart: String, $scheduledEnd: String) {
    createMOFromRequest(requestId: $requestId, bomId: $bomId, workCenterId: $workCenterId, scheduledStart: $scheduledStart, scheduledEnd: $scheduledEnd) { ...MRFields }
  }
`
