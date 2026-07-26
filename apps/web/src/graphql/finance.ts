import { gql } from '@apollo/client'

export const ACCOUNTS_QUERY = gql`
  query Accounts($type: String, $isActive: Boolean) {
    accounts(type: $type, is_active: $isActive) {
      id
      code
      name
      account_type
      is_active
      currency_code
      parent_id
      parent_name
      is_reconcilable
    }
  }
`

export const ACCOUNT_QUERY = gql`
  query Account($id: ID!) {
    account(id: $id) {
      id
      code
      name
      account_type
      is_active
      currency_code
      parent_id
      parent_name
      is_reconcilable
      has_posted_lines
    }
  }
`

export const ACCOUNT_LEDGER_QUERY = gql`
  query AccountLedger(
    $accountId: ID!
    $fromDate: String
    $toDate: String
    $page: Int
    $limit: Int
  ) {
    accountLedger(
      accountId: $accountId
      fromDate: $fromDate
      toDate: $toDate
      page: $page
      limit: $limit
    ) {
      items {
        id
        date
        reference
        description
        debit
        credit
        running_balance
        journal_entry_id
      }
      total
      page
      limit
      totalDebit
      totalCredit
      netBalance
    }
  }
`

export const JOURNAL_ENTRIES_QUERY = gql`
  query JournalEntries($status: String, $fromDate: String, $toDate: String) {
    journalEntries(status: $status, from_date: $fromDate, to_date: $toDate) {
      id
      reference
      entry_date
      status
      description
      source_type
      total_debit
      total_credit
      payment_currency
      created_by_email
    }
  }
`

export const JOURNAL_ENTRY_QUERY = gql`
  query JournalEntry($id: ID!) {
    journalEntry(id: $id) {
      id
      reference
      entry_date
      status
      description
      source_type
      total_debit
      total_credit
      created_by_email
      created_at
      accountant_email
      auditor_email
      audited_at
      journal_template_image
      lines {
        id
        account_id
        account_code
        account_name
        analytic_account_id
        cost_center_id
        description
        currency_code
        debit
        credit
        fx_rate
      }
      linked_pos {
        po_id
        po_number
        vendor_name
        status
        total_amount
        currency_code
      }
    }
  }
`

export const CREATE_JOURNAL_ENTRY = gql`
  mutation CreateJournalEntry($input: JournalEntryInput!) {
    createJournalEntry(input: $input) {
      id
      reference
      status
    }
  }
`

export const POST_JOURNAL_ENTRY = gql`
  mutation PostJournalEntry($id: ID!) {
    postJournalEntry(id: $id) {
      id
      status
    }
  }
`

export const CANCEL_JOURNAL_ENTRY = gql`
  mutation CancelJournalEntry($id: ID!, $reason: String) {
    cancelJournalEntry(id: $id, reason: $reason) {
      id
      status
    }
  }
`

export const AUDIT_JOURNAL_ENTRY = gql`
  mutation AuditJournalEntry($id: ID!) {
    auditJournalEntry(id: $id) {
      id
      status
      auditor_email
      audited_at
    }
  }
`

export const LINK_JOURNAL_POS = gql`
  mutation LinkJournalPOs($id: ID!, $poIds: [ID!]!) {
    linkJournalPOs(id: $id, poIds: $poIds) {
      po_id
      po_number
      vendor_name
      status
      total_amount
      currency_code
    }
  }
`

export const COMBINE_JOURNAL_ENTRIES = gql`
  mutation CombineJournalEntries($journalIds: [ID!]!, $description: String) {
    combineJournalEntries(journalIds: $journalIds, description: $description) {
      id
      reference
      status
    }
  }
`

export const PAYMENT_VOUCHERS_QUERY = gql`
  query PaymentVouchers($status: String, $fromDate: String, $toDate: String) {
    paymentVouchers(status: $status, fromDate: $fromDate, toDate: $toDate) {
      id
      voucher_number
      voucher_date
      received_from
      status
      total_amount_iqd
      total_amount_usd
      created_by_email
      auditor_email
      audited_at
      journal_count
      created_at
    }
  }
`

export const PAYMENT_VOUCHER_QUERY = gql`
  query PaymentVoucher($id: ID!) {
    paymentVoucher(id: $id) {
      id
      voucher_number
      voucher_date
      received_from
      reference_to
      bank_account_fund
      total_amount_iqd
      total_amount_usd
      status
      receiver_name
      notes
      pv_template_image
      created_by_email
      cashier_email
      auditor_email
      audited_at
      created_at
      lines {
        id
        statement
        acct_1
        acct_2
        acct_3
        acct_4
        acct_5
        amount_iqd
        amount_usd
        sequence
      }
      journals {
        id
        reference
        entry_date
        status
        description
        audited_at
        linked_pos {
          po_id
          po_number
          vendor_name
          status
          total_amount
          currency_code
        }
      }
    }
  }
`

export const CREATE_PAYMENT_VOUCHER = gql`
  mutation CreatePaymentVoucher($input: CreatePaymentVoucherInput!) {
    createPaymentVoucher(input: $input) {
      id
      voucher_number
      status
    }
  }
`

export const UPDATE_PAYMENT_VOUCHER = gql`
  mutation UpdatePaymentVoucher($id: ID!, $input: CreatePaymentVoucherInput!) {
    updatePaymentVoucher(id: $id, input: $input) {
      id
      voucher_number
      status
    }
  }
`

export const APPROVE_PAYMENT_VOUCHER = gql`
  mutation ApprovePaymentVoucher($id: ID!) {
    approvePaymentVoucher(id: $id) {
      id
      status
      auditor_email
      audited_at
    }
  }
`

export const MARK_PAYMENT_VOUCHER_PAID = gql`
  mutation MarkPaymentVoucherPaid($id: ID!) {
    markPaymentVoucherPaid(id: $id) {
      id
      status
      cashier_email
    }
  }
`

export const CREATE_ACCOUNT = gql`
  mutation CreateAccount($input: AccountInput!) {
    createAccount(input: $input) {
      id
      code
      name
    }
  }
`

export const UPDATE_ACCOUNT = gql`
  mutation UpdateAccount($id: ID!, $input: AccountInput!) {
    updateAccount(id: $id, input: $input) {
      id
      code
      name
    }
  }
`

export const FX_RATES_QUERY = gql`
  query FXRates($fromCurrency: String, $toCurrency: String, $fromDate: String, $toDate: String) {
    fxRates(
      fromCurrency: $fromCurrency
      toCurrency: $toCurrency
      fromDate: $fromDate
      toDate: $toDate
    ) {
      id
      from_currency
      to_currency
      rate
      rate_date
      source
      created_at
    }
  }
`

export const FX_STALENESS_QUERY = gql`
  query FXRateStaleness {
    fxRateStaleness {
      overall
      pairs {
        currencyPair
        lastRate
        lastRateDate
        ageHours
        status
        message
      }
    }
  }
`

export const UPSERT_FX_RATE = gql`
  mutation UpsertFXRate($input: FXRateInput!) {
    upsertFXRate(input: $input) {
      id
      from_currency
      to_currency
      rate
    }
  }
`

export const TRIGGER_FX_SYNC = gql`
  mutation TriggerFXSync {
    triggerFXSync
  }
`

export const ACCOUNTING_PERIODS_QUERY = gql`
  query AccountingPeriods {
    accountingPeriods {
      id
      name
      start_date
      end_date
      status
      closed_by_email
      closed_at
    }
  }
`

export const CREATE_PERIOD = gql`
  mutation CreateAccountingPeriod($input: PeriodInput!) {
    createAccountingPeriod(input: $input) {
      id
      name
      status
    }
  }
`

export const CLOSE_PERIOD = gql`
  mutation CloseAccountingPeriod($id: ID!) {
    closeAccountingPeriod(id: $id) {
      id
      status
    }
  }
`

export const TRIAL_BALANCE_QUERY = gql`
  query TrialBalance($asOfDate: String!, $companyId: ID) {
    trialBalance(as_of_date: $asOfDate) {
      id
      code
      name
      account_type
      total_debit
      total_credit
      balance
    }
  }
`

export const PROFIT_LOSS_QUERY = gql`
  query ProfitLoss($fromDate: String!, $toDate: String!, $costCenterId: ID) {
    profitLoss(fromDate: $fromDate, toDate: $toDate, costCenterId: $costCenterId) {
      revenue {
        account_id
        code
        name
        amount
      }
      expenses {
        account_id
        code
        name
        amount
      }
      totalRevenue
      totalExpenses
      netProfit
    }
  }
`

export const BALANCE_SHEET_QUERY = gql`
  query BalanceSheet($asOfDate: String!) {
    balanceSheet(asOfDate: $asOfDate) {
      assets {
        account_id
        code
        name
        amount
      }
      liabilities {
        account_id
        code
        name
        amount
      }
      equity {
        account_id
        code
        name
        amount
      }
      retainedEarnings
      totalAssets
      totalLiabilities
      totalEquity
      isBalanced
    }
  }
`

export const ANALYTIC_ACCOUNTS_QUERY = gql`
  query AnalyticAccounts {
    analyticAccounts {
      id
      name
      code
    }
  }
`

export const COST_CENTERS_QUERY = gql`
  query CostCenters {
    costCenters {
      id
      name
      code
    }
  }
`
