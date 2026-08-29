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

export const RECHARGE_COST_CENTER_QUERY = gql`
  query RechargeCostCenter {
    rechargeCostCenter {
      id
      name
      code
      defaultFulfillerId
    }
  }
`

export const RECHARGE_MONTHLY_SUMMARY_QUERY = gql`
  query RechargeMonthlySummary($year: Int, $month: Int) {
    rechargeMonthlySummary(year: $year, month: $month) {
      requestedBy
      requestedByEmail
      requestCount
      totalAmount
      currencyCode
      requests {
        ...RechargeRequestFields
      }
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

export const SET_RECHARGE_COST_CENTER = gql`
  mutation SetRechargeCostCenter($costCenterId: ID!) {
    setRechargeCostCenter(costCenterId: $costCenterId)
  }
`

export const RECHARGE_ACCOUNTS_QUERY = gql`
  query RechargeAccounts {
    rechargeAccounts {
      expenseAccountId
      expenseAccountCode
      expenseAccountName
      fundingAccountId
      fundingAccountCode
      fundingAccountName
    }
  }
`

export const SET_RECHARGE_ACCOUNTS = gql`
  mutation SetRechargeAccounts($expenseAccountId: ID, $fundingAccountId: ID) {
    setRechargeAccounts(expenseAccountId: $expenseAccountId, fundingAccountId: $fundingAccountId)
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
