import { gql } from '@apollo/client'

export const INTERCO_TRANSACTIONS_QUERY = gql`
  query IntercoTransactions(
    $fromCompanyId: ID
    $toCompanyId: ID
    $status: String
    $transactionType: String
    $fromDate: String
    $toDate: String
    $page: Int
    $limit: Int
  ) {
    intercoTransactions(
      fromCompanyId: $fromCompanyId
      toCompanyId: $toCompanyId
      status: $status
      transactionType: $transactionType
      fromDate: $fromDate
      toDate: $toDate
      page: $page
      limit: $limit
    ) {
      items {
        id
        reference
        transactionType
        fromCompanyName
        toCompanyName
        amount
        currencyCode
        status
        createdAt
      }
      total
      page
      limit
    }
  }
`

export const INTERCO_TRANSACTION_QUERY = gql`
  query IntercoTransaction($id: ID!) {
    intercoTransaction(id: $id) {
      id
      reference
      transactionType
      fromCompanyId
      fromCompanyName
      toCompanyId
      toCompanyName
      amount
      currencyCode
      description
      fromAccountId
      fromAccountName
      toAccountId
      toAccountName
      status
      postedAt
      postedBy
      fromJournalId
      toJournalId
      createdAt
      fromCompanyApprovedBy
      fromCompanyApprovedAt
      toCompanyApprovedBy
      toCompanyApprovedAt
    }
  }
`

export const INTERCO_STOCK_TRANSFERS_QUERY = gql`
  query IntercoStockTransfers(
    $fromCompanyId: ID
    $toCompanyId: ID
    $status: String
    $fromDate: String
    $toDate: String
    $page: Int
    $limit: Int
  ) {
    intercoStockTransfers(
      fromCompanyId: $fromCompanyId
      toCompanyId: $toCompanyId
      status: $status
      fromDate: $fromDate
      toDate: $toDate
      page: $page
      limit: $limit
    ) {
      items {
        id
        transferNumber
        fromCompanyName
        toCompanyName
        totalValue
        pricingMethod
        status
        transferDate
      }
      total
      page
      limit
    }
  }
`

export const INTERCO_STOCK_TRANSFER_QUERY = gql`
  query IntercoStockTransfer($id: ID!) {
    intercoStockTransfer(id: $id) {
      id
      transferNumber
      fromCompanyId
      fromCompanyName
      toCompanyId
      toCompanyName
      pricingMethod
      status
      transferDate
      fromStockMoveId
      toStockMoveId
      fromJournalId
      toJournalId
      lines {
        id
        productName
        sku
        qty
        avcoAtTransfer
        transferPrice
        markupPct
        totalValue
      }
    }
  }
`

export const INTERCO_PRICING_SETTINGS_QUERY = gql`
  query CompanyIntercoPricingSettings($companyId: ID!) {
    companyIntercoPricingSettings(companyId: $companyId) {
      companyId
      companyName
      method
      costPlusMarkupPct
      updatedAt
      updatedByEmail
    }
  }
`

export const INTERCO_PRICING_HISTORY_QUERY = gql`
  query IntercoPricingConfigHistory($companyId: ID!) {
    intercoPricingConfigHistory(companyId: $companyId) {
      previousMethod
      newMethod
      changedBy
      changedAt
      notes
    }
  }
`

export const CREATE_INTERCO_TRANSACTION = gql`
  mutation CreateIntercoTransaction($input: IntercoTransactionInput!) {
    createIntercoTransaction(input: $input) {
      id
      reference
      status
    }
  }
`

export const POST_INTERCO_TRANSACTION = gql`
  mutation PostIntercoTransaction($id: ID!) {
    postIntercoTransaction(id: $id) {
      id
      status
      fromJournalId
      toJournalId
    }
  }
`

export const SET_INTERCO_TRANSACTION_ACCOUNT = gql`
  mutation SetIntercoTransactionAccount($id: ID!, $accountId: ID!) {
    setIntercoTransactionAccount(id: $id, accountId: $accountId) {
      id
      fromAccountId
      fromAccountName
      toAccountId
      toAccountName
    }
  }
`

export const CANCEL_INTERCO_TRANSACTION = gql`
  mutation CancelIntercoTransaction($id: ID!) {
    cancelIntercoTransaction(id: $id) {
      id
      status
    }
  }
`

export const APPROVE_INTERCO_COMPANY = gql`
  mutation ApproveIntercoCompany($id: ID!) {
    approveIntercoCompany(id: $id) {
      id
      status
      fromCompanyApprovedBy
      fromCompanyApprovedAt
      toCompanyApprovedBy
      toCompanyApprovedAt
    }
  }
`

export const UPDATE_INTERCO_PRICING = gql`
  mutation UpdateIntercoPricing($companyId: ID!, $input: IntercoPricingInput!) {
    updateIntercoPricing(companyId: $companyId, input: $input) {
      companyId
      method
      costPlusMarkupPct
    }
  }
`

export const CREATE_INTERCO_STOCK_TRANSFER = gql`
  mutation CreateIntercoStockTransfer($input: IntercoStockTransferInput!) {
    createIntercoStockTransfer(input: $input) {
      id
      transferNumber
      status
    }
  }
`
