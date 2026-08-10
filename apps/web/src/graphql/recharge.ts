import { gql } from '@apollo/client'

const RECHARGE_REQUEST_FIELDS = gql`
  fragment RechargeRequestFields on RechargeRequest {
    id
    companyId
    requestedBy
    requestedByEmail
    costCenterId
    costCenterName
    bundleId
    bundleName
    bundleAmount
    bundleCurrencyCode
    phoneNumber
    notes
    status
    approvedBy
    approvedByEmail
    approvedAt
    rejectionReason
    fulfilledBy
    fulfilledByEmail
    fulfilledAt
    photoDownloadUrl
    confirmedAt
    photoPendingConfirmation
    createdAt
    updatedAt
  }
`

export const RECHARGE_BUNDLES_QUERY = gql`
  query RechargeBundles($activeOnly: Boolean) {
    rechargeBundles(activeOnly: $activeOnly) {
      id
      companyId
      name
      amount
      currencyCode
      isActive
      sortOrder
      createdAt
    }
  }
`

export const RECHARGE_REQUESTS_QUERY = gql`
  query RechargeRequests($scope: String, $status: String) {
    rechargeRequests(scope: $scope, status: $status) {
      ...RechargeRequestFields
    }
  }
  ${RECHARGE_REQUEST_FIELDS}
`

export const RECHARGE_REQUEST_QUERY = gql`
  query RechargeRequest($id: ID!) {
    rechargeRequest(id: $id) {
      ...RechargeRequestFields
    }
  }
  ${RECHARGE_REQUEST_FIELDS}
`

export const CREATE_RECHARGE_BUNDLE = gql`
  mutation CreateRechargeBundle($input: RechargeBundleInput!) {
    createRechargeBundle(input: $input) {
      id
      name
      amount
      currencyCode
      isActive
      sortOrder
      createdAt
    }
  }
`

export const UPDATE_RECHARGE_BUNDLE = gql`
  mutation UpdateRechargeBundle($id: ID!, $input: RechargeBundleInput!) {
    updateRechargeBundle(id: $id, input: $input) {
      id
      name
      amount
      currencyCode
      isActive
      sortOrder
    }
  }
`

export const DELETE_RECHARGE_BUNDLE = gql`
  mutation DeleteRechargeBundle($id: ID!) {
    deleteRechargeBundle(id: $id)
  }
`

export const CREATE_RECHARGE_REQUEST = gql`
  mutation CreateRechargeRequest($input: RechargeRequestInput!) {
    createRechargeRequest(input: $input) {
      ...RechargeRequestFields
    }
  }
  ${RECHARGE_REQUEST_FIELDS}
`

export const CANCEL_RECHARGE_REQUEST = gql`
  mutation CancelRechargeRequest($id: ID!) {
    cancelRechargeRequest(id: $id) {
      ...RechargeRequestFields
    }
  }
  ${RECHARGE_REQUEST_FIELDS}
`

export const APPROVE_RECHARGE_REQUEST = gql`
  mutation ApproveRechargeRequest($id: ID!) {
    approveRechargeRequest(id: $id) {
      ...RechargeRequestFields
    }
  }
  ${RECHARGE_REQUEST_FIELDS}
`

export const REJECT_RECHARGE_REQUEST = gql`
  mutation RejectRechargeRequest($id: ID!, $reason: String!) {
    rejectRechargeRequest(id: $id, reason: $reason) {
      ...RechargeRequestFields
    }
  }
  ${RECHARGE_REQUEST_FIELDS}
`

export const FULFILL_RECHARGE_REQUEST = gql`
  mutation FulfillRechargeRequest($id: ID!, $fileId: ID!) {
    fulfillRechargeRequest(id: $id, fileId: $fileId) {
      ...RechargeRequestFields
    }
  }
  ${RECHARGE_REQUEST_FIELDS}
`

export const CONFIRM_RECHARGE_RECEIPT = gql`
  mutation ConfirmRechargeReceipt($id: ID!) {
    confirmRechargeReceipt(id: $id) {
      ...RechargeRequestFields
    }
  }
  ${RECHARGE_REQUEST_FIELDS}
`
