import { gql } from '@apollo/client'

const PROJECT_FIELDS = gql`
  fragment ProjectFields on Project {
    id code name projectType status
    rfqNumber contractName projectLocation projectValue projectValueCurrency
    clientName clientContact
    managerId managerName plannedStartDate plannedEndDate
    budgetAmount budgetCurrency
    holdReason cancelReason receivingDate submissionDate submissionTime siteVisitDate siteVisitTime questionDate questionTime submittedAt approvedAt completedAt cancelledAt
    overallCompletionPct teamCount openPoCount stagesCompleted stagesTotal currentStageName
    analyticAccountName allowedActions
    isRfq rfqEstimatedCost rfqOutcome rfqOutcomeReason
    costSummary stages team statusHistory activityLog recentPos
    createdAt updatedAt
  }
`

export const PROJECTS_QUERY = gql`
  query Projects($status: [String], $projectType: String, $search: String, $projectManagerId: ID, $page: Int, $limit: Int, $includeAll: Boolean) {
    projects(status: $status, projectType: $projectType, search: $search, projectManagerId: $projectManagerId, page: $page, limit: $limit, includeAll: $includeAll) {
      data {
        id code name projectType status isRfq
        rfqNumber clientName projectValue budgetAmount budgetCurrency
        plannedStartDate plannedEndDate overallCompletionPct teamCount openPoCount allowedActions
        analyticAccountId analyticAccountName
        costSummary createdAt
      }
      pagination { page limit total totalPages }
    }
  }
`

export const PROJECT_QUERY = gql`
  ${PROJECT_FIELDS}
  query Project($id: ID!) {
    project(id: $id) {
      ...ProjectFields
    }
  }
`

export const PROJECT_COMPLETION_BLOCKERS_QUERY = gql`
  query ProjectCompletionBlockers($id: ID!) {
    projectCompletionBlockers(id: $id) {
      canComplete
      blockers
    }
  }
`

export const CREATE_PROJECT = gql`
  mutation CreateProject($input: ProjectCreateInput!) {
    createProject(input: $input) {
      id code name status allowedActions
    }
  }
`

export const CREATE_RFQ = gql`
  mutation CreateRFQ($input: ProjectCreateInput!) {
    createRFQ(input: $input) {
      id code name status isRfq allowedActions
    }
  }
`

export const APPROVE_RFQ = gql`
  mutation ApproveRFQ($id: ID!, $notes: String) {
    approveRFQ(id: $id, notes: $notes) { id status isRfq rfqOutcome approvedAt allowedActions statusHistory }
  }
`

export const REJECT_RFQ = gql`
  mutation RejectRFQ($id: ID!, $reason: String!) {
    rejectRFQ(id: $id, reason: $reason) { id status allowedActions statusHistory }
  }
`

export const SUBMIT_TO_TEAM = gql`
  mutation SubmitToTeam($id: ID!) {
    submitToTeam(id: $id) { id status allowedActions statusHistory }
  }
`

export const UPSERT_RFQ_LINES = gql`
  mutation UpsertRFQLines($projectId: ID!, $lines: [RFQLineInput!]!) {
    upsertRFQLines(projectId: $projectId, lines: $lines) {
      id projectId sequence phaseLabel description quantity unit estimatedUnitCost bidUnitPrice notes
    }
  }
`

export const RFQ_LINES_QUERY = gql`
  query RFQLines($projectId: ID!) {
    rfqLines(projectId: $projectId) {
      id projectId sequence phaseLabel description quantity unit estimatedUnitCost bidUnitPrice notes
    }
  }
`

export const UPDATE_PROJECT = gql`
  mutation UpdateProject($id: ID!, $input: ProjectUpdateInput!) {
    updateProject(id: $id, input: $input) {
      id code name status projectValue budgetAmount overallCompletionPct allowedActions
    }
  }
`

export const START_PROJECT = gql`
  mutation StartProject($id: ID!) {
    startProject(id: $id) { id status allowedActions statusHistory }
  }
`

export const HOLD_PROJECT = gql`
  mutation HoldProject($id: ID!, $reason: String!) {
    holdProject(id: $id, reason: $reason) { id status holdReason allowedActions statusHistory }
  }
`

export const RESUME_PROJECT = gql`
  mutation ResumeProject($id: ID!) {
    resumeProject(id: $id) { id status allowedActions statusHistory }
  }
`

export const SUBMIT_PROJECT = gql`
  mutation SubmitProject($id: ID!) {
    submitProject(id: $id) { id status submittedAt allowedActions statusHistory }
  }
`

export const APPROVE_PROJECT = gql`
  mutation ApproveProject($id: ID!) {
    approveProject(id: $id) { id status approvedAt allowedActions statusHistory }
  }
`

export const REJECT_BACK_PROJECT = gql`
  mutation RejectBackProject($id: ID!, $reason: String!) {
    rejectBackProject(id: $id, reason: $reason) { id status allowedActions statusHistory }
  }
`

export const COMPLETE_PROJECT = gql`
  mutation CompleteProject($id: ID!) {
    completeProject(id: $id) { id status allowedActions statusHistory }
  }
`

export const CANCEL_PROJECT = gql`
  mutation CancelProject($id: ID!, $reason: String!) {
    cancelProject(id: $id, reason: $reason) { id status cancelReason allowedActions statusHistory }
  }
`

export const CANCEL_PROJECT_AFTER_APPROVAL = gql`
  mutation CancelProjectAfterApproval($id: ID!, $reason: String!) {
    cancelProjectAfterApproval(id: $id, reason: $reason) { id status cancelReason allowedActions statusHistory }
  }
`

export const ADMIN_SET_PROJECT_STATUS = gql`
  mutation AdminSetProjectStatus($id: ID!, $status: String!) {
    adminSetProjectStatus(id: $id, status: $status) { id status allowedActions statusHistory }
  }
`

export const CREATE_PROJECT_STAGE = gql`
  mutation CreateProjectStage($projectId: ID!, $input: StageInput!) {
    createProjectStage(projectId: $projectId, input: $input) {
      id name sequence status completionPct plannedStartDate plannedEndDate notes
    }
  }
`

export const UPDATE_PROJECT_STAGE = gql`
  mutation UpdateProjectStage($projectId: ID!, $stageId: ID!, $input: UpdateStageInput!) {
    updateProjectStage(projectId: $projectId, stageId: $stageId, input: $input) {
      id name sequence status completionPct plannedStartDate plannedEndDate actualStartDate actualEndDate notes
    }
  }
`

export const ADD_PROJECT_MEMBER = gql`
  mutation AddProjectMember($projectId: ID!, $input: MemberInput!) {
    addProjectMember(projectId: $projectId, input: $input) {
      id employeeId name role allocatedHours startDate endDate isActive
    }
  }
`

export const REMOVE_PROJECT_MEMBER = gql`
  mutation RemoveProjectMember($projectId: ID!, $memberId: ID!) {
    removeProjectMember(projectId: $projectId, memberId: $memberId)
  }
`

// Contract / Invoice queries kept from previous version
export const PROJECT_CONTRACTS_QUERY = gql`
  query ProjectContracts($projectId: ID, $status: String) {
    projectContracts(projectId: $projectId, status: $status) {
      id contractNumber contractName clientName contractValue currencyCode
      defaultBillingMethod retentionPct status totalInvoiced totalPaid outstanding
      milestones { id name sequence billableAmount currencyCode status reachedAt }
      invoices { id invoiceNumber billingMethod grossTotal netPayable status invoiceDate dueDate }
    }
  }
`

export const PROJECT_CONTRACT_QUERY = gql`
  query ProjectContract($id: ID!) {
    projectContract(id: $id) {
      id contractNumber contractName clientName contractValue currencyCode
      defaultBillingMethod defaultMarginPct retentionPct status
      totalInvoiced totalPaid outstanding
      milestones { id name sequence billableAmount currencyCode status reachedAt }
      invoices {
        id invoiceNumber billingMethod displayMode grossTotal retentionAmount netPayable
        status invoiceDate dueDate
        lines { id lineNumber description sourceType qty unitCost subtotal marginPct marginAmount taxPct taxAmount lineTotal }
        payments { id paymentDate amount paymentReference paymentMethod }
      }
    }
  }
`

export const PROJECT_INVOICES_QUERY = gql`
  query ProjectInvoices($projectId: ID, $contractId: ID, $status: String) {
    projectInvoices(projectId: $projectId, contractId: $contractId, status: $status) {
      id invoiceNumber billingMethod grossTotal retentionAmount netPayable status invoiceDate dueDate
      payments { id paymentDate amount }
    }
  }
`

export const PROJECT_INVOICE_QUERY = gql`
  query ProjectInvoice($id: ID!) {
    projectInvoice(id: $id) {
      id invoiceNumber billingMethod displayMode grossTotal retentionAmount netPayable
      whtApplies whtScenario whtRate whtAmount
      status invoiceDate dueDate
      currencyCode bankAccountId paymentType projectCode projectName contractNumber clientName retentionPct
      companyName companyLegalName companyCountry companyStampImage companyLetterheadImage companyAddress companyPhone companyEmail companyBranchName companyBranchAddress companyBranchCity companyBranchPhone paymentTermsDays verificationToken
      lines { id lineNumber description sourceType qty unitCost subtotal marginPct marginAmount taxPct taxAmount lineTotal }
      payments { id paymentDate amount paymentReference paymentMethod }
    }
  }
`

export const CREATE_PROJECT_CONTRACT = gql`
  mutation CreateProjectContract($projectId: ID!, $input: ProjectContractInput!) {
    createProjectContract(projectId: $projectId, input: $input) {
      id contractNumber contractName status
    }
  }
`

export const UPDATE_PROJECT_CONTRACT = gql`
  mutation UpdateProjectContract($id: ID!, $input: ProjectContractInput!) {
    updateProjectContract(id: $id, input: $input) { id contractName status }
  }
`

export const CREATE_PROJECT_INVOICE = gql`
  mutation CreateProjectInvoice($contractId: ID!, $input: ProjectInvoiceInput!) {
    createProjectInvoice(contractId: $contractId, input: $input) {
      id invoiceNumber grossTotal netPayable status
    }
  }
`

export const UPDATE_PROJECT_INVOICE = gql`
  mutation UpdateProjectInvoice($id: ID!, $invoiceDate: String, $lines: [InvoiceLineEditInput!]) {
    updateProjectInvoice(id: $id, invoiceDate: $invoiceDate, lines: $lines) {
      id invoiceNumber billingMethod displayMode grossTotal retentionAmount netPayable
      whtApplies whtScenario whtRate whtAmount
      status invoiceDate dueDate
      currencyCode bankAccountId paymentType projectCode projectName contractNumber clientName retentionPct
      companyName companyLegalName companyCountry companyStampImage companyLetterheadImage companyAddress companyPhone companyEmail companyBranchName companyBranchAddress companyBranchCity companyBranchPhone paymentTermsDays verificationToken
      lines { id lineNumber description sourceType qty unitCost subtotal marginPct marginAmount taxPct taxAmount lineTotal }
      payments { id paymentDate amount paymentReference paymentMethod }
    }
  }
`

export const VOID_PROJECT_INVOICE = gql`
  mutation VoidProjectInvoice($id: ID!, $reason: String) {
    voidProjectInvoice(id: $id, reason: $reason) { id status }
  }
`

export const REACH_MILESTONE = gql`
  mutation ReachMilestone($contractId: ID!, $milestoneId: ID!) {
    reachMilestone(contractId: $contractId, milestoneId: $milestoneId) { id status reachedAt }
  }
`

export const CREATE_CONTRACT_MILESTONE = gql`
  mutation CreateContractMilestone($contractId: ID!, $input: MilestoneInput!) {
    createContractMilestone(contractId: $contractId, input: $input) {
      id name sequence billableAmount currencyCode status reachedAt
    }
  }
`

export const UPDATE_CONTRACT_MILESTONE = gql`
  mutation UpdateContractMilestone($id: ID!, $input: MilestoneInput!) {
    updateContractMilestone(id: $id, input: $input) {
      id name sequence billableAmount currencyCode status reachedAt
    }
  }
`

export const DELETE_CONTRACT_MILESTONE = gql`
  mutation DeleteContractMilestone($id: ID!) {
    deleteContractMilestone(id: $id)
  }
`

// Legacy — kept for backward compat with existing contract/invoice pages
export const ADD_TEAM_MEMBER = gql`
  mutation AddProjectTeamMember($projectId: ID!, $employeeId: ID!, $role: String!) {
    addProjectTeamMember(projectId: $projectId, employeeId: $employeeId, role: $role) {
      id employee_id employee_name role
    }
  }
`

export const REMOVE_TEAM_MEMBER = gql`
  mutation RemoveProjectTeamMember($projectId: ID!, $memberId: ID!) {
    removeProjectTeamMember(projectId: $projectId, memberId: $memberId)
  }
`
