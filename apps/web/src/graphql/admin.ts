import { gql } from '@apollo/client'

export const USERS_QUERY = gql`
  query Users($search: String, $isActive: Boolean, $companyId: ID, $page: Int, $limit: Int) {
    users(search: $search, isActive: $isActive, companyId: $companyId, page: $page, limit: $limit) {
      items {
        id
        email
        isActive
        mfaEnabled
        lastLogin
        activeSessions
        companies
        roles { id companyName module role isActive }
      }
      total
      page
      limit
    }
  }
`

export const USER_QUERY = gql`
  query User($id: ID!) {
    user(id: $id) {
      id
      email
      isActive
      mfaEnabled
      lastLogin
      failedLoginAttempts
      lockedUntil
      createdAt
      roles { id companyId companyName module role isActive }
    }
  }
`

export const USER_SESSIONS_QUERY = gql`
  query UserSessions($userId: ID!) {
    userSessions(userId: $userId) {
      id
      deviceName
      platform
      ipAddress
      createdAt
      expiresAt
      isCurrent
    }
  }
`

export const OUTBOX_MONITOR_QUERY = gql`
  query OutboxMonitor {
    outboxMonitor {
      health
      counts { pending failed dlq stuck }
      generatedAt
    }
  }
`

export const OUTBOX_EVENTS_QUERY = gql`
  query OutboxEvents($status: String, $service: String, $eventType: String, $page: Int, $limit: Int) {
    outboxEvents(status: $status, service: $service, eventType: $eventType, page: $page, limit: $limit) {
      items {
        id
        service
        eventType
        status
        attempts
        maxAttempts
        lastError
        nextRetryAt
        createdAt
        payload
      }
      total
      page
      limit
    }
  }
`

export const OUTBOX_DLQ_QUERY = gql`
  query OutboxDLQ($status: String, $priority: String, $eventType: String, $page: Int, $limit: Int) {
    outboxDLQ(status: $status, priority: $priority, eventType: $eventType, page: $page, limit: $limit) {
      items {
        id
        eventType
        service
        priority
        status
        totalAttempts
        lastError
        errorHistory { attempt error at }
        createdAt
        reviewedBy
        reviewNotes
        payload
      }
      total
      page
      limit
    }
  }
`

export const OUTBOX_EVENT_CONFIGS_QUERY = gql`
  query OutboxEventConfigs {
    outboxEventConfigs {
      id
      eventType
      maxAttempts
      initialRetryDelaySeconds
      backoffMultiplier
      maxRetryDelaySeconds
      dlqPriority
      alertOnDlq
      description
    }
  }
`

export const SYSTEM_HEALTH_QUERY = gql`
  query SystemHealth {
    systemHealth {
      service
      status
      latencyMs
      checks { database redis outbox }
      uptime
      lastChecked
    }
  }
`

export const AUDIT_LOG_QUERY = gql`
  query AuditLog($userId: ID, $companyId: ID, $tableName: String, $action: String, $recordId: ID, $fromDate: String, $toDate: String, $page: Int, $limit: Int) {
    auditLog(userId: $userId, companyId: $companyId, tableName: $tableName, action: $action, recordId: $recordId, fromDate: $fromDate, toDate: $toDate, page: $page, limit: $limit) {
      items {
        id
        createdAt
        userEmail
        companyName
        action
        tableName
        recordId
        ipAddress
        oldValues
        newValues
      }
      total
      page
      limit
    }
  }
`

export const ADD_USER_ROLE = gql`
  mutation AddUserRole($userId: ID!, $input: RoleInput!) {
    addUserRole(userId: $userId, input: $input) {
      id
      companyName
      module
      role
      isActive
    }
  }
`

export const UPDATE_USER_ROLE = gql`
  mutation UpdateUserRole($roleId: ID!, $input: RoleInput!) {
    updateUserRole(roleId: $roleId, input: $input) {
      id
      isActive
    }
  }
`

export const REMOVE_USER_ROLE = gql`
  mutation RemoveUserRole($roleId: ID!) {
    removeUserRole(roleId: $roleId)
  }
`

export const DEACTIVATE_USER = gql`
  mutation DeactivateUser($userId: ID!) {
    deactivateUser(userId: $userId) { id isActive }
  }
`

export const UNLOCK_USER = gql`
  mutation UnlockUser($userId: ID!) {
    unlockUser(userId: $userId) { id failedLoginAttempts lockedUntil }
  }
`

export const RESET_USER_MFA = gql`
  mutation ResetUserMFA($userId: ID!) {
    resetUserMFA(userId: $userId)
  }
`

export const REVOKE_USER_SESSION = gql`
  mutation RevokeUserSession($sessionId: ID!) {
    revokeUserSession(sessionId: $sessionId)
  }
`

export const REVOKE_ALL_USER_SESSIONS = gql`
  mutation RevokeAllUserSessions($userId: ID!) {
    revokeAllUserSessions(userId: $userId)
  }
`

export const RETRY_OUTBOX_EVENT = gql`
  mutation RetryOutboxEvent($eventId: ID!) {
    retryOutboxEvent(eventId: $eventId)
  }
`

export const RETRY_DLQ_ENTRY = gql`
  mutation RetryDLQEntry($dlqId: ID!, $notes: String) {
    retryDLQEntry(dlqId: $dlqId, notes: $notes)
  }
`

export const DISMISS_DLQ_ENTRY = gql`
  mutation DismissDLQEntry($dlqId: ID!, $notes: String!) {
    dismissDLQEntry(dlqId: $dlqId, notes: $notes)
  }
`

export const RESET_STUCK_EVENTS = gql`
  mutation ResetStuckEvents {
    resetStuckEvents
  }
`

export const UPDATE_EVENT_CONFIG = gql`
  mutation UpdateOutboxEventConfig($eventType: String!, $input: EventConfigInput!) {
    updateOutboxEventConfig(eventType: $eventType, input: $input) {
      eventType
      maxAttempts
      initialRetryDelaySeconds
      backoffMultiplier
      maxRetryDelaySeconds
      dlqPriority
      alertOnDlq
    }
  }
`

// ── Fix 2B/2C: User / Company / Role Management ───────────────────────────────

export const CREATE_USER = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) { id email isActive }
  }
`

export const INVITE_USER = gql`
  mutation InviteUser($input: InviteUserInput!) {
    inviteUser(input: $input) { id email status expiresAt }
  }
`

export const ACTIVATE_USER = gql`
  mutation ActivateUser($userId: ID!) {
    activateUser(userId: $userId) { id isActive }
  }
`

export const ASSIGN_ROLE = gql`
  mutation AssignRole($input: AssignRoleInput!) {
    assignRole(input: $input) { id role module isActive }
  }
`

export const TOGGLE_ROLE = gql`
  mutation ToggleRole($roleId: ID!, $isActive: Boolean!) {
    toggleRole(roleId: $roleId, isActive: $isActive) { id isActive }
  }
`

export const DELETE_ROLE = gql`
  mutation DeleteRole($roleId: ID!) {
    deleteRole(roleId: $roleId)
  }
`

export const COMPANIES_QUERY = gql`
  query Companies {
    companies {
      id name legalName city countryCode currencyCode isActive
      setupCompleted intercoTransferPricingMethod
      configuration { defaultCurrency fiscalYearStartMonth }
    }
  }
`

export const COMPANY_QUERY = gql`
  query Company($id: ID!) {
    company(id: $id) {
      id name legalName countryCode city address phone email website
      registrationNumber vatNumber currencyCode
      bankName bankAccount bankIban bankSwift
      intercoTransferPricingMethod isActive setupCompleted stampImage letterheadImage pvTemplateImage journalTemplateImage createdAt
      configuration {
        companyId fiscalYearStartMonth fiscalYearStartDay defaultCurrency
        defaultPaymentTermsDays defaultPOCurrency incomeTaxEnabled
        socialSecurityRate employerSocialSecurityRate
        defaultWHTRate
        companyEmailFrom companyEmailSignature setupCompleted
      }
    }
  }
`

export const COMPANY_USERS_QUERY = gql`
  query CompanyUsers($companyId: ID!) {
    companyUsers(companyId: $companyId) {
      id email isActive lastLoginAt
      roles { id role module isActive }
    }
  }
`

export const CREATE_COMPANY = gql`
  mutation CreateCompany($input: CreateCompanyInput!) {
    createCompany(input: $input) { id name legalName }
  }
`

export const UPDATE_COMPANY = gql`
  mutation UpdateCompany($id: ID!, $input: UpdateCompanyInput!) {
    updateCompany(id: $id, input: $input) { id name }
  }
`

export const UPDATE_COMPANY_CONFIGURATION = gql`
  mutation UpdateCompanyConfiguration($companyId: ID!, $input: CompanyConfigInput!) {
    updateCompanyConfiguration(companyId: $companyId, input: $input) {
      defaultCurrency fiscalYearStartMonth
    }
  }
`

// ── Company branches ─────────────────────────────────────────────────────────
export const COMPANY_BRANCHES_QUERY = gql`
  query CompanyBranches($companyId: ID!) {
    companyBranches(companyId: $companyId) {
      id companyId name address city countryCode phone isActive createdAt
    }
  }
`

export const CREATE_COMPANY_BRANCH = gql`
  mutation CreateCompanyBranch($companyId: ID!, $input: CompanyBranchInput!) {
    createCompanyBranch(companyId: $companyId, input: $input) {
      id name address city countryCode phone isActive createdAt
    }
  }
`

export const UPDATE_COMPANY_BRANCH = gql`
  mutation UpdateCompanyBranch($id: ID!, $input: CompanyBranchInput!) {
    updateCompanyBranch(id: $id, input: $input) {
      id name address city countryCode phone isActive
    }
  }
`

export const DELETE_COMPANY_BRANCH = gql`
  mutation DeleteCompanyBranch($id: ID!) {
    deleteCompanyBranch(id: $id)
  }
`

// ── Bank accounts ─────────────────────────────────────────────────────────────
export const BANK_ACCOUNTS_QUERY = gql`
  query BankAccounts {
    bankAccounts {
      id accountName bankName beneficiaryName accountNumber iban swift branchCode bankAddress
      intermediaryBankName intermediarySwift intermediaryCountry currencyCode isActive createdAt
    }
  }
`

export const CREATE_BANK_ACCOUNT = gql`
  mutation CreateBankAccount($input: BankAccountInput!) {
    createBankAccount(input: $input) {
      id accountName bankName beneficiaryName accountNumber iban swift branchCode bankAddress
      intermediaryBankName intermediarySwift intermediaryCountry currencyCode isActive createdAt
    }
  }
`

export const UPDATE_BANK_ACCOUNT = gql`
  mutation UpdateBankAccount($id: ID!, $input: BankAccountInput!) {
    updateBankAccount(id: $id, input: $input) {
      id accountName bankName beneficiaryName accountNumber iban swift branchCode bankAddress
      intermediaryBankName intermediarySwift intermediaryCountry currencyCode isActive
    }
  }
`

export const DELETE_BANK_ACCOUNT = gql`
  mutation DeleteBankAccount($id: ID!) {
    deleteBankAccount(id: $id)
  }
`

export const SET_INVOICE_BANK_ACCOUNT = gql`
  mutation SetInvoiceBankAccount($invoiceId: ID!, $bankAccountId: ID) {
    setInvoiceBankAccount(invoiceId: $invoiceId, bankAccountId: $bankAccountId)
  }
`

export const SET_INVOICE_PAYMENT_TYPE = gql`
  mutation SetInvoicePaymentType($invoiceId: ID!, $paymentType: String!) {
    setInvoicePaymentType(invoiceId: $invoiceId, paymentType: $paymentType)
  }
`
