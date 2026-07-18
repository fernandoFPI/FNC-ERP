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
    analyticAccountId analyticAccountName allowedActions
    lifecyclePhase clientDocCount rfqLineCount
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
    approveRFQ(id: $id, notes: $notes) { id status lifecyclePhase isRfq rfqOutcome approvedAt allowedActions statusHistory }
  }
`

export const REJECT_RFQ = gql`
  mutation RejectRFQ($id: ID!, $reason: String!) {
    rejectRFQ(id: $id, reason: $reason) { id status lifecyclePhase allowedActions statusHistory }
  }
`

export const SUBMIT_TO_TEAM = gql`
  mutation SubmitToTeam($id: ID!) {
    submitToTeam(id: $id) { id status lifecyclePhase allowedActions statusHistory }
  }
`

export const UPSERT_RFQ_LINES = gql`
  mutation UpsertRFQLines($projectId: ID!, $lines: [RFQLineInput!]!) {
    upsertRFQLines(projectId: $projectId, lines: $lines) {
      id projectId sequence phaseLabel description quantity unit estimatedUnitCost bidUnitPrice notes
      discipline drawingRef engineeringRef specSection
    }
  }
`

export const RFQ_LINES_QUERY = gql`
  query RFQLines($projectId: ID!) {
    rfqLines(projectId: $projectId) {
      id projectId sequence phaseLabel description quantity unit estimatedUnitCost bidUnitPrice notes
      discipline drawingRef engineeringRef specSection
    }
  }
`

export const RFQ_PHASES_QUERY = gql`
  query RFQPhases($projectId: ID!) {
    rfqPhases(projectId: $projectId) {
      id projectId phaseType serviceType status notes sequence fileCount
      files { id fileId filename mimeType sizeBytes title description createdAt downloadUrl }
    }
  }
`

export const UPDATE_RFQ_PHASE = gql`
  mutation UpdateRFQPhase($id: ID!, $status: String, $notes: String) {
    updateRFQPhase(id: $id, status: $status, notes: $notes) {
      id phaseType serviceType status notes fileCount
      files { id fileId filename mimeType sizeBytes title description createdAt downloadUrl }
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
    startProject(id: $id) { id status lifecyclePhase allowedActions statusHistory }
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
    submitProject(id: $id) { id status lifecyclePhase submittedAt allowedActions statusHistory }
  }
`

export const APPROVE_PROJECT = gql`
  mutation ApproveProject($id: ID!) {
    approveProject(id: $id) { id status lifecyclePhase approvedAt allowedActions statusHistory }
  }
`

export const REJECT_BACK_PROJECT = gql`
  mutation RejectBackProject($id: ID!, $reason: String!) {
    rejectBackProject(id: $id, reason: $reason) { id status lifecyclePhase allowedActions statusHistory }
  }
`

export const COMPLETE_PROJECT = gql`
  mutation CompleteProject($id: ID!) {
    completeProject(id: $id) { id status lifecyclePhase allowedActions statusHistory }
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
    adminSetProjectStatus(id: $id, status: $status) { id status lifecyclePhase allowedActions statusHistory }
  }
`

export const ADMIN_SET_PHASE = gql`
  mutation AdminSetPhase($id: ID!, $phase: String!) {
    adminSetPhase(id: $id, phase: $phase) { id status lifecyclePhase allowedActions }
  }
`

export const ADVANCE_PHASE = gql`
  mutation AdvancePhase($id: ID!, $targetPhase: String!) {
    advancePhase(id: $id, targetPhase: $targetPhase) { id status lifecyclePhase allowedActions }
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

// ── Client Documents ──────────────────────────────────────────────────────

const CLIENT_DOCUMENT_FIELDS = gql`
  fragment ClientDocumentFields on ClientDocument {
    id projectId fileId category title documentNumber revision
    description receivedFrom transmissionDate status parentDocumentId
    uploadedById uploadedByName downloadUrl filename mimeType sizeBytes
    createdAt
    revisions {
      id fileId category title documentNumber revision description
      receivedFrom transmissionDate status uploadedByName downloadUrl filename createdAt
    }
  }
`

export const CLIENT_DOCUMENTS_QUERY = gql`
  ${CLIENT_DOCUMENT_FIELDS}
  query ClientDocuments($projectId: ID!, $category: String) {
    clientDocuments(projectId: $projectId, category: $category) {
      ...ClientDocumentFields
    }
  }
`

export const UPLOAD_CLIENT_DOCUMENT = gql`
  ${CLIENT_DOCUMENT_FIELDS}
  mutation UploadClientDocument(
    $projectId: ID! $fileId: ID! $category: String! $title: String!
    $documentNumber: String $revision: String $description: String
    $receivedFrom: String $transmissionDate: String
  ) {
    uploadClientDocument(
      projectId: $projectId fileId: $fileId category: $category title: $title
      documentNumber: $documentNumber revision: $revision description: $description
      receivedFrom: $receivedFrom transmissionDate: $transmissionDate
    ) { ...ClientDocumentFields }
  }
`

export const UPLOAD_CLIENT_DOCUMENT_REVISION = gql`
  ${CLIENT_DOCUMENT_FIELDS}
  mutation UploadClientDocumentRevision(
    $parentDocumentId: ID! $fileId: ID! $revision: String! $description: String
  ) {
    uploadClientDocumentRevision(
      parentDocumentId: $parentDocumentId fileId: $fileId revision: $revision description: $description
    ) { ...ClientDocumentFields }
  }
`

export const UPDATE_CLIENT_DOCUMENT = gql`
  ${CLIENT_DOCUMENT_FIELDS}
  mutation UpdateClientDocument(
    $id: ID! $title: String $category: String $documentNumber: String
    $revision: String $description: String $receivedFrom: String $transmissionDate: String
  ) {
    updateClientDocument(
      id: $id title: $title category: $category documentNumber: $documentNumber
      revision: $revision description: $description receivedFrom: $receivedFrom
      transmissionDate: $transmissionDate
    ) { ...ClientDocumentFields }
  }
`

export const UPDATE_CLIENT_DOCUMENT_STATUS = gql`
  mutation UpdateClientDocumentStatus($id: ID!, $status: String!) {
    updateClientDocumentStatus(id: $id, status: $status) { id status }
  }
`

export const DELETE_CLIENT_DOCUMENT = gql`
  mutation DeleteClientDocument($id: ID!) {
    deleteClientDocument(id: $id)
  }
`

// ── Engineering Documents ─────────────────────────────────────────────────

const ENG_DOC_FIELDS = gql`
  fragment EngDocFields on EngineeringDoc {
    id projectId refNumber discipline docType seqNo title description
    scale paperSize revision status issueDate notes fileId docGroupId
    isCurrent uploadedByName downloadUrl filename createdAt
    originatorName checkerName approverName purposeOfIssue
    commentCount openCommentCount
    history {
      id refNumber revision status issueDate notes uploadedByName downloadUrl filename createdAt
      originatorName checkerName approverName purposeOfIssue commentCount openCommentCount
    }
  }
`

export const ENG_DOCS_QUERY = gql`
  ${ENG_DOC_FIELDS}
  query EngineeringDocuments($projectId: ID!) {
    engineeringDocuments(projectId: $projectId) { ...EngDocFields }
  }
`

export const CREATE_ENG_DOC = gql`
  ${ENG_DOC_FIELDS}
  mutation CreateEngineeringDoc(
    $projectId: ID! $discipline: String! $docType: String! $title: String!
    $fileId: ID $revision: String $description: String $scale: String
    $paperSize: String $issueDate: String $notes: String
    $originatorName: String $checkerName: String $approverName: String $purposeOfIssue: String
  ) {
    createEngineeringDoc(
      projectId: $projectId discipline: $discipline docType: $docType title: $title
      fileId: $fileId revision: $revision description: $description scale: $scale
      paperSize: $paperSize issueDate: $issueDate notes: $notes
      originatorName: $originatorName checkerName: $checkerName
      approverName: $approverName purposeOfIssue: $purposeOfIssue
    ) { ...EngDocFields }
  }
`

export const REVISE_ENG_DOC = gql`
  ${ENG_DOC_FIELDS}
  mutation ReviseEngineeringDoc(
    $id: ID! $fileId: ID $revision: String! $notes: String $issueDate: String
    $originatorName: String $checkerName: String $approverName: String $purposeOfIssue: String
  ) {
    reviseEngineeringDoc(
      id: $id fileId: $fileId revision: $revision notes: $notes issueDate: $issueDate
      originatorName: $originatorName checkerName: $checkerName
      approverName: $approverName purposeOfIssue: $purposeOfIssue
    ) { ...EngDocFields }
  }
`

export const UPDATE_ENG_DOC_STATUS = gql`
  mutation UpdateEngineeringDocStatus($id: ID!, $status: String!) {
    updateEngineeringDocStatus(id: $id, status: $status) { id status }
  }
`

export const UPDATE_ENG_DOC_META = gql`
  ${ENG_DOC_FIELDS}
  mutation UpdateEngineeringDocMeta(
    $id: ID! $originatorName: String $checkerName: String $approverName: String $purposeOfIssue: String
  ) {
    updateEngineeringDocMeta(
      id: $id originatorName: $originatorName checkerName: $checkerName
      approverName: $approverName purposeOfIssue: $purposeOfIssue
    ) { ...EngDocFields }
  }
`

export const DELETE_ENG_DOC = gql`
  mutation DeleteEngineeringDoc($id: ID!) { deleteEngineeringDoc(id: $id) }
`

// ── Doc Comments (Phase 1) ────────────────────────────────────────────────

const DOC_COMMENT_FIELDS = gql`
  fragment DocCommentFields on DocComment {
    id documentId revision reviewerId reviewerName commentNumber
    locationRef commentText category
    responseText responseById responseName responseDate resolution
    createdAt
  }
`

export const DOC_COMMENTS_QUERY = gql`
  ${DOC_COMMENT_FIELDS}
  query DocComments($documentId: ID!) {
    docComments(documentId: $documentId) { ...DocCommentFields }
  }
`

export const ADD_DOC_COMMENT = gql`
  ${DOC_COMMENT_FIELDS}
  mutation AddDocComment(
    $documentId: ID! $revision: String! $locationRef: String $commentText: String! $category: String!
  ) {
    addDocComment(documentId: $documentId revision: $revision locationRef: $locationRef
      commentText: $commentText category: $category) { ...DocCommentFields }
  }
`

export const RESPOND_TO_COMMENT = gql`
  ${DOC_COMMENT_FIELDS}
  mutation RespondToComment($id: ID! $responseText: String! $resolution: String!) {
    respondToComment(id: $id responseText: $responseText resolution: $resolution) { ...DocCommentFields }
  }
`

export const DELETE_DOC_COMMENT = gql`
  mutation DeleteDocComment($id: ID!) { deleteDocComment(id: $id) }
`

// ── Document Distribution Matrix (Phase 1) ────────────────────────────────

const DDM_FIELDS = gql`
  fragment DDMFields on DocDistributionEntry {
    id projectId companyName contactName contactEmail
    discipline docType statusTrigger copies format autoTransmit notes createdAt
  }
`

export const DOC_DISTRIBUTION_QUERY = gql`
  ${DDM_FIELDS}
  query DocDistributionMatrix($projectId: ID!) {
    docDistributionMatrix(projectId: $projectId) { ...DDMFields }
  }
`

export const UPSERT_DISTRIBUTION_ENTRY = gql`
  ${DDM_FIELDS}
  mutation UpsertDistributionEntry(
    $id: ID $projectId: ID! $companyName: String! $contactName: String $contactEmail: String
    $discipline: String $docType: String $statusTrigger: String! $copies: Int
    $format: String $autoTransmit: Boolean $notes: String
  ) {
    upsertDistributionEntry(
      id: $id projectId: $projectId companyName: $companyName contactName: $contactName
      contactEmail: $contactEmail discipline: $discipline docType: $docType
      statusTrigger: $statusTrigger copies: $copies format: $format
      autoTransmit: $autoTransmit notes: $notes
    ) { ...DDMFields }
  }
`

export const DELETE_DISTRIBUTION_ENTRY = gql`
  mutation DeleteDistributionEntry($id: ID!) { deleteDistributionEntry(id: $id) }
`

// ── Engineering module (legacy) ───────────────────────────────────────────

export const ENGINEERING_REVISIONS_QUERY = gql`
  query EngineeringRevisions($projectId: ID!) {
    engineeringRevisions(projectId: $projectId) {
      id projectId revisionCode status notes issuedByName issuedAt itemCount snapshotData createdAt
    }
  }
`

export const ISSUE_ENGINEERING_REVISION = gql`
  mutation IssueEngineeringRevision($projectId: ID!, $revisionCode: String!, $notes: String) {
    issueEngineeringRevision(projectId: $projectId, revisionCode: $revisionCode, notes: $notes) {
      id projectId revisionCode status notes issuedByName issuedAt itemCount snapshotData createdAt
    }
  }
`

const PROJECT_DRAWING_FIELDS = gql`
  fragment ProjectDrawingFields on ProjectDrawing {
    id projectId drawingNumber title discipline scale paperSize revision
    status issueDate notes fileId parentDrawingId uploadedByName downloadUrl filename createdAt
    revisions {
      id drawingNumber title revision status issueDate notes
      uploadedByName downloadUrl filename createdAt
    }
  }
`

export const PROJECT_DRAWINGS_QUERY = gql`
  ${PROJECT_DRAWING_FIELDS}
  query ProjectDrawings($projectId: ID!) {
    projectDrawings(projectId: $projectId) {
      ...ProjectDrawingFields
    }
  }
`

export const CREATE_PROJECT_DRAWING = gql`
  ${PROJECT_DRAWING_FIELDS}
  mutation CreateProjectDrawing(
    $projectId: ID! $fileId: ID! $drawingNumber: String! $title: String!
    $discipline: String $scale: String $paperSize: String $revision: String
    $status: String $issueDate: String $notes: String
  ) {
    createProjectDrawing(
      projectId: $projectId fileId: $fileId drawingNumber: $drawingNumber title: $title
      discipline: $discipline scale: $scale paperSize: $paperSize revision: $revision
      status: $status issueDate: $issueDate notes: $notes
    ) { ...ProjectDrawingFields }
  }
`

export const REVISE_PROJECT_DRAWING = gql`
  ${PROJECT_DRAWING_FIELDS}
  mutation ReviseProjectDrawing($parentDrawingId: ID!, $fileId: ID!, $revision: String!, $notes: String) {
    reviseProjectDrawing(parentDrawingId: $parentDrawingId, fileId: $fileId, revision: $revision, notes: $notes) {
      ...ProjectDrawingFields
    }
  }
`

export const UPDATE_PROJECT_DRAWING_STATUS = gql`
  mutation UpdateProjectDrawingStatus($id: ID!, $status: String!) {
    updateProjectDrawingStatus(id: $id, status: $status) {
      id status
    }
  }
`

export const DELETE_PROJECT_DRAWING = gql`
  mutation DeleteProjectDrawing($id: ID!) {
    deleteProjectDrawing(id: $id)
  }
`

// ── Bidding module ────────────────────────────────────────────────────────

const BID_DELIVERABLE_FIELDS = gql`
  fragment BidDeliverableFields on BidDeliverable {
    id projectId name deliverableType discipline status assignedTo dueDate notes
    sequence createdByName fileCount
    files { id fileId filename mimeType sizeBytes title description createdAt downloadUrl }
    createdAt updatedAt
  }
`

export const BID_DELIVERABLES_QUERY = gql`
  ${BID_DELIVERABLE_FIELDS}
  query BidDeliverables($projectId: ID!) {
    bidDeliverables(projectId: $projectId) { ...BidDeliverableFields }
  }
`

export const CREATE_BID_DELIVERABLE = gql`
  ${BID_DELIVERABLE_FIELDS}
  mutation CreateBidDeliverable($projectId: ID!, $name: String!, $deliverableType: String!, $discipline: String, $dueDate: String, $notes: String) {
    createBidDeliverable(projectId: $projectId, name: $name, deliverableType: $deliverableType, discipline: $discipline, dueDate: $dueDate, notes: $notes) { ...BidDeliverableFields }
  }
`

export const UPDATE_BID_DELIVERABLE = gql`
  ${BID_DELIVERABLE_FIELDS}
  mutation UpdateBidDeliverable($id: ID!, $name: String, $status: String, $assignedTo: String, $dueDate: String, $notes: String, $discipline: String) {
    updateBidDeliverable(id: $id, name: $name, status: $status, assignedTo: $assignedTo, dueDate: $dueDate, notes: $notes, discipline: $discipline) { ...BidDeliverableFields }
  }
`

export const DELETE_BID_DELIVERABLE = gql`
  mutation DeleteBidDeliverable($id: ID!) { deleteBidDeliverable(id: $id) }
`

export const UPLOAD_BID_DELIVERABLE_FILE = gql`
  ${BID_DELIVERABLE_FIELDS}
  mutation UploadBidDeliverableFile($deliverableId: ID!, $fileId: ID!, $title: String, $description: String) {
    uploadBidDeliverableFile(deliverableId: $deliverableId, fileId: $fileId, title: $title, description: $description) { ...BidDeliverableFields }
  }
`

export const DELETE_BID_DELIVERABLE_FILE = gql`
  mutation DeleteBidDeliverableFile($attachmentId: ID!, $deliverableId: ID!) {
    deleteBidDeliverableFile(attachmentId: $attachmentId, deliverableId: $deliverableId)
  }
`

export const BID_COST_ITEMS_QUERY = gql`
  query BidCostItems($projectId: ID!) {
    bidCostItems(projectId: $projectId) {
      id projectId costType description quantity unit unitCost totalCost currencyCode supplierRef notes sequence createdAt
    }
  }
`

export const UPSERT_BID_COST_ITEMS = gql`
  mutation UpsertBidCostItems($projectId: ID!, $items: [BidCostItemInput!]!) {
    upsertBidCostItems(projectId: $projectId, items: $items) {
      id projectId costType description quantity unit unitCost totalCost currencyCode supplierRef notes sequence createdAt
    }
  }
`

export const BID_SUPPLIER_QUOTATIONS_QUERY = gql`
  query BidSupplierQuotations($projectId: ID!) {
    bidSupplierQuotations(projectId: $projectId) {
      id projectId supplierName itemDescription amount currencyCode validityDate fileId downloadUrl filename notes status createdAt
    }
  }
`

export const CREATE_BID_SUPPLIER_QUOTATION = gql`
  mutation CreateBidSupplierQuotation($projectId: ID!, $supplierName: String!, $itemDescription: String!, $amount: Float, $currencyCode: String, $validityDate: String, $fileId: ID, $notes: String) {
    createBidSupplierQuotation(projectId: $projectId, supplierName: $supplierName, itemDescription: $itemDescription, amount: $amount, currencyCode: $currencyCode, validityDate: $validityDate, fileId: $fileId, notes: $notes) {
      id projectId supplierName itemDescription amount currencyCode validityDate fileId downloadUrl filename notes status createdAt
    }
  }
`

export const UPDATE_BID_SUPPLIER_QUOTATION = gql`
  mutation UpdateBidSupplierQuotation($id: ID!, $status: String, $supplierName: String, $itemDescription: String, $amount: Float, $validityDate: String, $notes: String) {
    updateBidSupplierQuotation(id: $id, status: $status, supplierName: $supplierName, itemDescription: $itemDescription, amount: $amount, validityDate: $validityDate, notes: $notes) {
      id projectId supplierName itemDescription amount currencyCode validityDate notes status createdAt
    }
  }
`

export const DELETE_BID_SUPPLIER_QUOTATION = gql`
  mutation DeleteBidSupplierQuotation($id: ID!) { deleteBidSupplierQuotation(id: $id) }
`

const BID_COMMERCIAL_SUMMARY_FIELDS = gql`
  fragment BidCommercialSummaryFields on BidCommercialSummary {
    id projectId overheadPct marginPct discountPct contingencyPct currencyCode
    directCostTotal overheadAmount contingencyAmount marginAmount discountAmount bidPrice
    approvalStatus submittedByName submittedAt approvedByName approvedAt rejectionReason notes updatedAt
  }
`

export const BID_COMMERCIAL_SUMMARY_QUERY = gql`
  ${BID_COMMERCIAL_SUMMARY_FIELDS}
  query BidCommercialSummary($projectId: ID!) {
    bidCommercialSummary(projectId: $projectId) { ...BidCommercialSummaryFields }
  }
`

export const UPDATE_BID_COMMERCIAL_SUMMARY = gql`
  ${BID_COMMERCIAL_SUMMARY_FIELDS}
  mutation UpdateBidCommercialSummary($projectId: ID!, $overheadPct: Float, $marginPct: Float, $discountPct: Float, $contingencyPct: Float, $currencyCode: String, $notes: String) {
    updateBidCommercialSummary(projectId: $projectId, overheadPct: $overheadPct, marginPct: $marginPct, discountPct: $discountPct, contingencyPct: $contingencyPct, currencyCode: $currencyCode, notes: $notes) { ...BidCommercialSummaryFields }
  }
`

export const SUBMIT_BID_FOR_APPROVAL = gql`
  ${BID_COMMERCIAL_SUMMARY_FIELDS}
  mutation SubmitBidForApproval($projectId: ID!) {
    submitBidForApproval(projectId: $projectId) { ...BidCommercialSummaryFields }
  }
`

export const APPROVE_BID = gql`
  ${BID_COMMERCIAL_SUMMARY_FIELDS}
  mutation ApproveBid($projectId: ID!) {
    approveBid(projectId: $projectId) { ...BidCommercialSummaryFields }
  }
`

export const REJECT_BID = gql`
  ${BID_COMMERCIAL_SUMMARY_FIELDS}
  mutation RejectBid($projectId: ID!, $reason: String!) {
    rejectBid(projectId: $projectId, reason: $reason) { ...BidCommercialSummaryFields }
  }
`

// ── Execution — shared file fragment ─────────────────────────────────────────
const EXEC_FILE_FIELDS = `
  fragment ExecFileFields on RFQPhaseFile {
    id fileId filename mimeType sizeBytes title createdAt downloadUrl
  }
`

// ── RFIs ─────────────────────────────────────────────────────────────────────
const RFI_FIELDS = `
  fragment RFIFields on ProjectRFI {
    id projectId rfiNumber subject description drawingRef specRef
    raisedByName raisedDate requiredDate respondedDate
    status response respondedByName
    files { ...ExecFileFields }
    createdAt updatedAt
  }
`

export const PROJECT_RFIS_QUERY = gql`
  ${EXEC_FILE_FIELDS} ${RFI_FIELDS}
  query ProjectRFIs($projectId: ID!) { projectRFIs(projectId: $projectId) { ...RFIFields } }
`
export const CREATE_PROJECT_RFI = gql`
  ${EXEC_FILE_FIELDS} ${RFI_FIELDS}
  mutation CreateProjectRFI($projectId: ID!, $rfiNumber: String!, $subject: String!, $description: String, $drawingRef: String, $specRef: String, $requiredDate: String) {
    createProjectRFI(projectId: $projectId, rfiNumber: $rfiNumber, subject: $subject, description: $description, drawingRef: $drawingRef, specRef: $specRef, requiredDate: $requiredDate) { ...RFIFields }
  }
`
export const UPDATE_PROJECT_RFI = gql`
  ${EXEC_FILE_FIELDS} ${RFI_FIELDS}
  mutation UpdateProjectRFI($id: ID!, $subject: String, $description: String, $drawingRef: String, $specRef: String, $requiredDate: String, $status: String) {
    updateProjectRFI(id: $id, subject: $subject, description: $description, drawingRef: $drawingRef, specRef: $specRef, requiredDate: $requiredDate, status: $status) { ...RFIFields }
  }
`
export const RESPOND_TO_RFI = gql`
  ${EXEC_FILE_FIELDS} ${RFI_FIELDS}
  mutation RespondToRFI($id: ID!, $response: String!, $respondedDate: String) {
    respondToRFI(id: $id, response: $response, respondedDate: $respondedDate) { ...RFIFields }
  }
`
export const DELETE_PROJECT_RFI = gql`mutation DeleteProjectRFI($id: ID!) { deleteProjectRFI(id: $id) }`
export const UPLOAD_RFI_FILE = gql`
  ${EXEC_FILE_FIELDS} ${RFI_FIELDS}
  mutation UploadRFIFile($rfiId: ID!, $fileId: ID!, $title: String) {
    uploadRFIFile(rfiId: $rfiId, fileId: $fileId, title: $title) { ...RFIFields }
  }
`
export const DELETE_RFI_FILE = gql`mutation DeleteRFIFile($attachmentId: ID!, $rfiId: ID!) { deleteRFIFile(attachmentId: $attachmentId, rfiId: $rfiId) }`

// ── Submittals ────────────────────────────────────────────────────────────────
const SUBMITTAL_FIELDS = `
  fragment SubmittalFields on ProjectSubmittal {
    id projectId submittalNumber title submittalType revision
    submittedDate reviewerName reviewStatus returnDate remarks
    files { ...ExecFileFields }
    createdAt updatedAt
  }
`
export const PROJECT_SUBMITTALS_QUERY = gql`
  ${EXEC_FILE_FIELDS} ${SUBMITTAL_FIELDS}
  query ProjectSubmittals($projectId: ID!) { projectSubmittals(projectId: $projectId) { ...SubmittalFields } }
`
export const CREATE_PROJECT_SUBMITTAL = gql`
  ${EXEC_FILE_FIELDS} ${SUBMITTAL_FIELDS}
  mutation CreateProjectSubmittal($projectId: ID!, $submittalNumber: String!, $title: String!, $submittalType: String!, $revision: String, $submittedDate: String, $reviewerName: String) {
    createProjectSubmittal(projectId: $projectId, submittalNumber: $submittalNumber, title: $title, submittalType: $submittalType, revision: $revision, submittedDate: $submittedDate, reviewerName: $reviewerName) { ...SubmittalFields }
  }
`
export const UPDATE_PROJECT_SUBMITTAL = gql`
  ${EXEC_FILE_FIELDS} ${SUBMITTAL_FIELDS}
  mutation UpdateProjectSubmittal($id: ID!, $title: String, $submittalType: String, $revision: String, $submittedDate: String, $reviewerName: String, $reviewStatus: String, $returnDate: String, $remarks: String) {
    updateProjectSubmittal(id: $id, title: $title, submittalType: $submittalType, revision: $revision, submittedDate: $submittedDate, reviewerName: $reviewerName, reviewStatus: $reviewStatus, returnDate: $returnDate, remarks: $remarks) { ...SubmittalFields }
  }
`
export const DELETE_PROJECT_SUBMITTAL = gql`mutation DeleteProjectSubmittal($id: ID!) { deleteProjectSubmittal(id: $id) }`
export const UPLOAD_SUBMITTAL_FILE = gql`
  ${EXEC_FILE_FIELDS} ${SUBMITTAL_FIELDS}
  mutation UploadSubmittalFile($submittalId: ID!, $fileId: ID!, $title: String) {
    uploadSubmittalFile(submittalId: $submittalId, fileId: $fileId, title: $title) { ...SubmittalFields }
  }
`
export const DELETE_SUBMITTAL_FILE = gql`mutation DeleteSubmittalFile($attachmentId: ID!, $submittalId: ID!) { deleteSubmittalFile(attachmentId: $attachmentId, submittalId: $submittalId) }`

// ── Site Instructions ─────────────────────────────────────────────────────────
const SI_FIELDS = `
  fragment SIFields on ProjectSiteInstruction {
    id projectId siNumber subject description issuedBy issuedDate
    acknowledgedByName acknowledgedDate potentialVo voRef status
    files { ...ExecFileFields }
    createdAt updatedAt
  }
`
export const PROJECT_SITE_INSTRUCTIONS_QUERY = gql`
  ${EXEC_FILE_FIELDS} ${SI_FIELDS}
  query ProjectSiteInstructions($projectId: ID!) { projectSiteInstructions(projectId: $projectId) { ...SIFields } }
`
export const CREATE_SITE_INSTRUCTION = gql`
  ${EXEC_FILE_FIELDS} ${SI_FIELDS}
  mutation CreateSiteInstruction($projectId: ID!, $siNumber: String!, $subject: String!, $description: String, $issuedBy: String, $issuedDate: String, $potentialVo: Boolean) {
    createSiteInstruction(projectId: $projectId, siNumber: $siNumber, subject: $subject, description: $description, issuedBy: $issuedBy, issuedDate: $issuedDate, potentialVo: $potentialVo) { ...SIFields }
  }
`
export const UPDATE_SITE_INSTRUCTION = gql`
  ${EXEC_FILE_FIELDS} ${SI_FIELDS}
  mutation UpdateSiteInstruction($id: ID!, $subject: String, $description: String, $issuedBy: String, $acknowledgedByName: String, $acknowledgedDate: String, $status: String, $potentialVo: Boolean, $voRef: String) {
    updateSiteInstruction(id: $id, subject: $subject, description: $description, issuedBy: $issuedBy, acknowledgedByName: $acknowledgedByName, acknowledgedDate: $acknowledgedDate, status: $status, potentialVo: $potentialVo, voRef: $voRef) { ...SIFields }
  }
`
export const DELETE_SITE_INSTRUCTION = gql`mutation DeleteSiteInstruction($id: ID!) { deleteSiteInstruction(id: $id) }`
export const UPLOAD_SI_FILE = gql`
  ${EXEC_FILE_FIELDS} ${SI_FIELDS}
  mutation UploadSIFile($siId: ID!, $fileId: ID!, $title: String) {
    uploadSIFile(siId: $siId, fileId: $fileId, title: $title) { ...SIFields }
  }
`
export const DELETE_SI_FILE = gql`mutation DeleteSIFile($attachmentId: ID!, $siId: ID!) { deleteSIFile(attachmentId: $attachmentId, siId: $siId) }`

// ── ITPs ──────────────────────────────────────────────────────────────────────
const ITP_FIELDS = `
  fragment ITPFields on ProjectITP {
    id projectId title workPackage discipline revision status createdByName
    items { id itpId sequence activity inspectionType contractorRole clientRole referenceDoc acceptanceCriteria result inspectorName inspectionDate remarks }
    createdAt updatedAt
  }
`
export const PROJECT_ITPS_QUERY = gql`
  ${ITP_FIELDS}
  query ProjectITPs($projectId: ID!) { projectITPs(projectId: $projectId) { ...ITPFields } }
`
export const CREATE_PROJECT_ITP = gql`
  ${ITP_FIELDS}
  mutation CreateProjectITP($projectId: ID!, $title: String!, $workPackage: String, $discipline: String) {
    createProjectITP(projectId: $projectId, title: $title, workPackage: $workPackage, discipline: $discipline) { ...ITPFields }
  }
`
export const UPDATE_PROJECT_ITP = gql`
  ${ITP_FIELDS}
  mutation UpdateProjectITP($id: ID!, $title: String, $workPackage: String, $discipline: String, $revision: String, $status: String) {
    updateProjectITP(id: $id, title: $title, workPackage: $workPackage, discipline: $discipline, revision: $revision, status: $status) { ...ITPFields }
  }
`
export const DELETE_PROJECT_ITP = gql`mutation DeleteProjectITP($id: ID!) { deleteProjectITP(id: $id) }`
export const UPSERT_ITP_ITEMS = gql`
  ${ITP_FIELDS}
  mutation UpsertITPItems($itpId: ID!, $items: [ITPItemInput!]!) {
    upsertITPItems(itpId: $itpId, items: $items) { ...ITPFields }
  }
`
export const RECORD_ITP_ITEM_RESULT = gql`
  mutation RecordITPItemResult($itemId: ID!, $result: String!, $inspectorName: String, $inspectionDate: String, $remarks: String) {
    recordITPItemResult(itemId: $itemId, result: $result, inspectorName: $inspectorName, inspectionDate: $inspectionDate, remarks: $remarks) {
      id itpId sequence activity inspectionType result inspectorName inspectionDate remarks
    }
  }
`

// ── Inspection Requests ───────────────────────────────────────────────────────
const IR_FIELDS = `
  fragment IRFields on ProjectInspectionRequest {
    id projectId irNumber title itpId workPackage location
    requestedDate requestedByName inspectorName actualDate status result remarks
    files { ...ExecFileFields }
    createdAt updatedAt
  }
`
export const PROJECT_INSPECTION_REQUESTS_QUERY = gql`
  ${EXEC_FILE_FIELDS} ${IR_FIELDS}
  query ProjectInspectionRequests($projectId: ID!) { projectInspectionRequests(projectId: $projectId) { ...IRFields } }
`
export const CREATE_INSPECTION_REQUEST = gql`
  ${EXEC_FILE_FIELDS} ${IR_FIELDS}
  mutation CreateInspectionRequest($projectId: ID!, $irNumber: String!, $title: String!, $itpId: ID, $workPackage: String, $location: String, $requestedDate: String!) {
    createInspectionRequest(projectId: $projectId, irNumber: $irNumber, title: $title, itpId: $itpId, workPackage: $workPackage, location: $location, requestedDate: $requestedDate) { ...IRFields }
  }
`
export const UPDATE_INSPECTION_REQUEST = gql`
  ${EXEC_FILE_FIELDS} ${IR_FIELDS}
  mutation UpdateInspectionRequest($id: ID!, $title: String, $location: String, $requestedDate: String, $inspectorName: String, $actualDate: String, $status: String, $result: String, $remarks: String) {
    updateInspectionRequest(id: $id, title: $title, location: $location, requestedDate: $requestedDate, inspectorName: $inspectorName, actualDate: $actualDate, status: $status, result: $result, remarks: $remarks) { ...IRFields }
  }
`
export const DELETE_INSPECTION_REQUEST = gql`mutation DeleteInspectionRequest($id: ID!) { deleteInspectionRequest(id: $id) }`
export const UPLOAD_IR_FILE = gql`
  ${EXEC_FILE_FIELDS} ${IR_FIELDS}
  mutation UploadIRFile($irId: ID!, $fileId: ID!, $title: String) {
    uploadIRFile(irId: $irId, fileId: $fileId, title: $title) { ...IRFields }
  }
`
export const DELETE_IR_FILE = gql`mutation DeleteIRFile($attachmentId: ID!, $irId: ID!) { deleteIRFile(attachmentId: $attachmentId, irId: $irId) }`

// ── NCRs ──────────────────────────────────────────────────────────────────────
const NCR_FIELDS = `
  fragment NCRFields on ProjectNCR {
    id projectId ncrNumber title description workPackage location
    raisedByName raisedDate severity rootCause correctiveAction preventiveAction
    dueDate closedDate closedByName status
    files { ...ExecFileFields }
    createdAt updatedAt
  }
`
export const PROJECT_NCRS_QUERY = gql`
  ${EXEC_FILE_FIELDS} ${NCR_FIELDS}
  query ProjectNCRs($projectId: ID!) { projectNCRs(projectId: $projectId) { ...NCRFields } }
`
export const CREATE_PROJECT_NCR = gql`
  ${EXEC_FILE_FIELDS} ${NCR_FIELDS}
  mutation CreateProjectNCR($projectId: ID!, $ncrNumber: String!, $title: String!, $description: String!, $workPackage: String, $location: String, $severity: String, $dueDate: String) {
    createProjectNCR(projectId: $projectId, ncrNumber: $ncrNumber, title: $title, description: $description, workPackage: $workPackage, location: $location, severity: $severity, dueDate: $dueDate) { ...NCRFields }
  }
`
export const UPDATE_PROJECT_NCR = gql`
  ${EXEC_FILE_FIELDS} ${NCR_FIELDS}
  mutation UpdateProjectNCR($id: ID!, $title: String, $description: String, $workPackage: String, $location: String, $severity: String, $rootCause: String, $correctiveAction: String, $preventiveAction: String, $dueDate: String, $status: String, $closedDate: String, $closedByName: String) {
    updateProjectNCR(id: $id, title: $title, description: $description, workPackage: $workPackage, location: $location, severity: $severity, rootCause: $rootCause, correctiveAction: $correctiveAction, preventiveAction: $preventiveAction, dueDate: $dueDate, status: $status, closedDate: $closedDate, closedByName: $closedByName) { ...NCRFields }
  }
`
export const DELETE_PROJECT_NCR = gql`mutation DeleteProjectNCR($id: ID!) { deleteProjectNCR(id: $id) }`
export const UPLOAD_NCR_FILE = gql`
  ${EXEC_FILE_FIELDS} ${NCR_FIELDS}
  mutation UploadNCRFile($ncrId: ID!, $fileId: ID!, $title: String) {
    uploadNCRFile(ncrId: $ncrId, fileId: $fileId, title: $title) { ...NCRFields }
  }
`
export const DELETE_NCR_FILE = gql`mutation DeleteNCRFile($attachmentId: ID!, $ncrId: ID!) { deleteNCRFile(attachmentId: $attachmentId, ncrId: $ncrId) }`

// ── HSE Records ───────────────────────────────────────────────────────────────
const HSE_FIELDS = `
  fragment HSEFields on ProjectHSERecord {
    id projectId recordType title recordDate conductedBy location description
    attendeeCount attendeeNames
    incidentType severity injuredPerson rootCause correctiveAction correctiveDueDate correctiveClosedDate
    observationType
    ptwType ptwNumber validFrom validTo approvedBy ptwStatus
    status createdByName
    files { ...ExecFileFields }
    createdAt updatedAt
  }
`
export const PROJECT_HSE_RECORDS_QUERY = gql`
  ${EXEC_FILE_FIELDS} ${HSE_FIELDS}
  query ProjectHSERecords($projectId: ID!, $recordType: String) { projectHSERecords(projectId: $projectId, recordType: $recordType) { ...HSEFields } }
`
export const CREATE_HSE_RECORD = gql`
  ${EXEC_FILE_FIELDS} ${HSE_FIELDS}
  mutation CreateHSERecord($projectId: ID!, $recordType: String!, $title: String!, $recordDate: String!, $conductedBy: String, $location: String, $description: String, $attendeeCount: Int, $attendeeNames: String, $incidentType: String, $severity: String, $injuredPerson: String, $observationType: String, $ptwType: String, $ptwNumber: String, $validFrom: String, $validTo: String, $approvedBy: String) {
    createHSERecord(projectId: $projectId, recordType: $recordType, title: $title, recordDate: $recordDate, conductedBy: $conductedBy, location: $location, description: $description, attendeeCount: $attendeeCount, attendeeNames: $attendeeNames, incidentType: $incidentType, severity: $severity, injuredPerson: $injuredPerson, observationType: $observationType, ptwType: $ptwType, ptwNumber: $ptwNumber, validFrom: $validFrom, validTo: $validTo, approvedBy: $approvedBy) { ...HSEFields }
  }
`
export const UPDATE_HSE_RECORD = gql`
  ${EXEC_FILE_FIELDS} ${HSE_FIELDS}
  mutation UpdateHSERecord($id: ID!, $title: String, $recordDate: String, $conductedBy: String, $location: String, $description: String, $attendeeCount: Int, $attendeeNames: String, $incidentType: String, $severity: String, $injuredPerson: String, $rootCause: String, $correctiveAction: String, $correctiveDueDate: String, $correctiveClosedDate: String, $observationType: String, $ptwType: String, $ptwNumber: String, $validFrom: String, $validTo: String, $approvedBy: String, $ptwStatus: String, $status: String) {
    updateHSERecord(id: $id, title: $title, recordDate: $recordDate, conductedBy: $conductedBy, location: $location, description: $description, attendeeCount: $attendeeCount, attendeeNames: $attendeeNames, incidentType: $incidentType, severity: $severity, injuredPerson: $injuredPerson, rootCause: $rootCause, correctiveAction: $correctiveAction, correctiveDueDate: $correctiveDueDate, correctiveClosedDate: $correctiveClosedDate, observationType: $observationType, ptwType: $ptwType, ptwNumber: $ptwNumber, validFrom: $validFrom, validTo: $validTo, approvedBy: $approvedBy, ptwStatus: $ptwStatus, status: $status) { ...HSEFields }
  }
`
export const DELETE_HSE_RECORD = gql`mutation DeleteHSERecord($id: ID!) { deleteHSERecord(id: $id) }`
export const UPLOAD_HSE_FILE = gql`
  ${EXEC_FILE_FIELDS} ${HSE_FIELDS}
  mutation UploadHSEFile($hseId: ID!, $fileId: ID!, $title: String) {
    uploadHSEFile(hseId: $hseId, fileId: $fileId, title: $title) { ...HSEFields }
  }
`
export const DELETE_HSE_FILE = gql`mutation DeleteHSEFile($attachmentId: ID!, $hseId: ID!) { deleteHSEFile(attachmentId: $attachmentId, hseId: $hseId) }`

// ── Transmittals ──────────────────────────────────────────────────────────────
const TRANSMITTAL_FIELDS = `
  fragment TransmittalFields on ProjectTransmittal {
    id projectId transmittalNumber title toCompany toContact fromName
    sentDate purpose acknowledgedDate notes status
    items { id transmittalId documentTitle documentNumber revision filename downloadUrl copies }
    createdAt updatedAt
  }
`
export const PROJECT_TRANSMITTALS_QUERY = gql`
  ${TRANSMITTAL_FIELDS}
  query ProjectTransmittals($projectId: ID!) { projectTransmittals(projectId: $projectId) { ...TransmittalFields } }
`
export const CREATE_PROJECT_TRANSMITTAL = gql`
  ${TRANSMITTAL_FIELDS}
  mutation CreateProjectTransmittal($projectId: ID!, $transmittalNumber: String!, $title: String!, $toCompany: String, $toContact: String, $fromName: String, $sentDate: String!, $purpose: String!, $notes: String, $items: [TransmittalItemInput!]) {
    createProjectTransmittal(projectId: $projectId, transmittalNumber: $transmittalNumber, title: $title, toCompany: $toCompany, toContact: $toContact, fromName: $fromName, sentDate: $sentDate, purpose: $purpose, notes: $notes, items: $items) { ...TransmittalFields }
  }
`
export const UPDATE_PROJECT_TRANSMITTAL = gql`
  ${TRANSMITTAL_FIELDS}
  mutation UpdateProjectTransmittal($id: ID!, $title: String, $toCompany: String, $toContact: String, $fromName: String, $sentDate: String, $purpose: String, $acknowledgedDate: String, $notes: String, $status: String) {
    updateProjectTransmittal(id: $id, title: $title, toCompany: $toCompany, toContact: $toContact, fromName: $fromName, sentDate: $sentDate, purpose: $purpose, acknowledgedDate: $acknowledgedDate, notes: $notes, status: $status) { ...TransmittalFields }
  }
`
export const DELETE_PROJECT_TRANSMITTAL = gql`mutation DeleteProjectTransmittal($id: ID!) { deleteProjectTransmittal(id: $id) }`
export const ADD_TRANSMITTAL_ITEM = gql`
  mutation AddTransmittalItem($transmittalId: ID!, $documentTitle: String!, $documentNumber: String, $revision: String, $fileId: ID, $copies: Int) {
    addTransmittalItem(transmittalId: $transmittalId, documentTitle: $documentTitle, documentNumber: $documentNumber, revision: $revision, fileId: $fileId, copies: $copies) {
      id transmittalId documentTitle documentNumber revision filename downloadUrl copies
    }
  }
`
export const DELETE_TRANSMITTAL_ITEM = gql`mutation DeleteTransmittalItem($id: ID!) { deleteTransmittalItem(id: $id) }`

// ── Planning ──────────────────────────────────────────────────────────────────

const WBS_FIELDS = gql`
  fragment WBSFields on WBSNode {
    id projectId parentId wbsCode name description level sequence budgetAmount responsible createdAt updatedAt
  }
`

const ACTIVITY_FIELDS = gql`
  fragment ActivityFields on ProjectActivity {
    id projectId wbsId activityCode name activityType
    plannedStart plannedFinish durationDays
    baselineStart baselineFinish baselineDuration
    actualStart actualFinish percentComplete
    earlyStart earlyFinish lateStart lateFinish totalFloat freeFloat isCritical
    budgetAmount actualCost
    responsible location remarks sequence createdAt updatedAt
    predecessors { id predecessorId successorId dependencyType lagDays predecessorCode successorCode }
    successors   { id predecessorId successorId dependencyType lagDays predecessorCode successorCode }
    resources    { id activityId resourceId resourceName unit unitsPerDay totalUnits budgetedCost actualUnits actualCost }
  }
`

const BASELINE_FIELDS = gql`
  fragment BaselineFields on ProjectBaseline { id projectId name description baselineDate isActive createdAt }
`

const RESOURCE_FIELDS = gql`
  fragment ResourceFields on ProjectResource { id projectId name resourceType unit maxUnitsPerDay costPerUnit currencyCode createdAt updatedAt }
`

export const PROJECT_WBS_QUERY = gql`
  ${WBS_FIELDS}
  query ProjectWBS($projectId: ID!) {
    projectWBS(projectId: $projectId) {
      ...WBSFields
      children { ...WBSFields children { ...WBSFields children { ...WBSFields } } }
    }
  }
`

export const PROJECT_ACTIVITIES_QUERY = gql`
  ${ACTIVITY_FIELDS}
  query ProjectActivities($projectId: ID!) { projectActivities(projectId: $projectId) { ...ActivityFields } }
`

export const PROJECT_DEPENDENCIES_QUERY = gql`
  query ProjectDependencies($projectId: ID!) {
    projectDependencies(projectId: $projectId) { id predecessorId successorId dependencyType lagDays predecessorCode successorCode }
  }
`

export const PROJECT_BASELINES_QUERY = gql`
  ${BASELINE_FIELDS}
  query ProjectBaselines($projectId: ID!) { projectBaselines(projectId: $projectId) { ...BaselineFields } }
`

export const PROJECT_RESOURCES_QUERY = gql`
  ${RESOURCE_FIELDS}
  query ProjectResources($projectId: ID!) { projectResources(projectId: $projectId) { ...ResourceFields } }
`

export const PROJECT_RESOURCE_CALENDAR_QUERY = gql`
  query ProjectResourceCalendar($resourceId: ID!) {
    projectResourceCalendar(resourceId: $resourceId) { id resourceId workDate availableUnits isHoliday note }
  }
`

export const PROJECT_RESOURCE_LOADING_QUERY = gql`
  query ProjectResourceLoading($projectId: ID!, $startDate: String!, $endDate: String!) {
    projectResourceLoading(projectId: $projectId, startDate: $startDate, endDate: $endDate) {
      resourceId resourceName unit maxUnitsPerDay
      days { date loadedUnits availableUnits isOverloaded }
    }
  }
`

export const PROJECT_EVM_QUERY = gql`
  query ProjectEVM($projectId: ID!, $statusDate: String) {
    projectEVM(projectId: $projectId, statusDate: $statusDate) {
      bac pv ev ac sv cv spi cpi eac etc vac tcpi criticalPathComplete statusDate
    }
  }
`

// WBS mutations
export const CREATE_WBS_NODE = gql`
  ${WBS_FIELDS}
  mutation CreateWBSNode($projectId: ID!, $parentId: ID, $wbsCode: String!, $name: String!, $description: String, $level: Int, $sequence: Int, $budgetAmount: Float, $responsible: String) {
    createWBSNode(projectId: $projectId, parentId: $parentId, wbsCode: $wbsCode, name: $name, description: $description, level: $level, sequence: $sequence, budgetAmount: $budgetAmount, responsible: $responsible) { ...WBSFields }
  }
`
export const UPDATE_WBS_NODE = gql`
  ${WBS_FIELDS}
  mutation UpdateWBSNode($id: ID!, $wbsCode: String, $name: String, $description: String, $sequence: Int, $budgetAmount: Float, $responsible: String) {
    updateWBSNode(id: $id, wbsCode: $wbsCode, name: $name, description: $description, sequence: $sequence, budgetAmount: $budgetAmount, responsible: $responsible) { ...WBSFields }
  }
`
export const DELETE_WBS_NODE = gql`mutation DeleteWBSNode($id: ID!) { deleteWBSNode(id: $id) }`

// Activity mutations
export const CREATE_ACTIVITY = gql`
  ${ACTIVITY_FIELDS}
  mutation CreateActivity($projectId: ID!, $wbsId: ID, $activityCode: String!, $name: String!, $activityType: String, $plannedStart: String, $plannedFinish: String, $durationDays: Int, $responsible: String, $location: String, $remarks: String, $budgetAmount: Float, $sequence: Int) {
    createActivity(projectId: $projectId, wbsId: $wbsId, activityCode: $activityCode, name: $name, activityType: $activityType, plannedStart: $plannedStart, plannedFinish: $plannedFinish, durationDays: $durationDays, responsible: $responsible, location: $location, remarks: $remarks, budgetAmount: $budgetAmount, sequence: $sequence) { ...ActivityFields }
  }
`
export const UPDATE_ACTIVITY = gql`
  ${ACTIVITY_FIELDS}
  mutation UpdateActivity($id: ID!, $wbsId: ID, $activityCode: String, $name: String, $activityType: String, $plannedStart: String, $plannedFinish: String, $durationDays: Int, $responsible: String, $location: String, $remarks: String, $budgetAmount: Float, $actualCost: Float, $sequence: Int) {
    updateActivity(id: $id, wbsId: $wbsId, activityCode: $activityCode, name: $name, activityType: $activityType, plannedStart: $plannedStart, plannedFinish: $plannedFinish, durationDays: $durationDays, responsible: $responsible, location: $location, remarks: $remarks, budgetAmount: $budgetAmount, actualCost: $actualCost, sequence: $sequence) { ...ActivityFields }
  }
`
export const UPDATE_ACTIVITY_PROGRESS = gql`
  ${ACTIVITY_FIELDS}
  mutation UpdateActivityProgress($id: ID!, $percentComplete: Float!, $actualStart: String, $actualFinish: String) {
    updateActivityProgress(id: $id, percentComplete: $percentComplete, actualStart: $actualStart, actualFinish: $actualFinish) { ...ActivityFields }
  }
`
export const DELETE_ACTIVITY = gql`mutation DeleteActivity($id: ID!) { deleteActivity(id: $id) }`

export const BULK_IMPORT_ACTIVITIES = gql`
  mutation BulkImportActivities($projectId: ID!, $activities: [ActivityImportInput!]!, $dependencies: [DependencyImportInput!], $clearExisting: Boolean) {
    bulkImportActivities(projectId: $projectId, activities: $activities, dependencies: $dependencies, clearExisting: $clearExisting)
  }
`

// Dependency mutations
export const CREATE_DEPENDENCY = gql`
  mutation CreateDependency($projectId: ID!, $predecessorId: ID!, $successorId: ID!, $dependencyType: String, $lagDays: Int) {
    createDependency(projectId: $projectId, predecessorId: $predecessorId, successorId: $successorId, dependencyType: $dependencyType, lagDays: $lagDays) { id predecessorId successorId dependencyType lagDays predecessorCode successorCode }
  }
`
export const DELETE_DEPENDENCY = gql`mutation DeleteDependency($id: ID!) { deleteDependency(id: $id) }`
export const RECALCULATE_CPM = gql`mutation RecalculateCPM($projectId: ID!) { recalculateCPM(projectId: $projectId) }`
export const LEVEL_RESOURCES = gql`mutation LevelResources($projectId: ID!) { levelResources(projectId: $projectId) }`

// Baseline mutations
export const CREATE_BASELINE = gql`
  ${BASELINE_FIELDS}
  mutation CreateBaseline($projectId: ID!, $name: String!, $description: String) {
    createBaseline(projectId: $projectId, name: $name, description: $description) { ...BaselineFields }
  }
`
export const SET_ACTIVE_BASELINE = gql`
  ${BASELINE_FIELDS}
  mutation SetActiveBaseline($id: ID!) { setActiveBaseline(id: $id) { ...BaselineFields } }
`
export const APPLY_BASELINE = gql`mutation ApplyBaseline($id: ID!) { applyBaseline(id: $id) }`
export const DELETE_BASELINE = gql`mutation DeleteBaseline($id: ID!) { deleteBaseline(id: $id) }`

// Resource mutations
export const CREATE_RESOURCE = gql`
  ${RESOURCE_FIELDS}
  mutation CreateResource($projectId: ID!, $name: String!, $resourceType: String!, $unit: String!, $maxUnitsPerDay: Float!, $costPerUnit: Float!, $currencyCode: String) {
    createResource(projectId: $projectId, name: $name, resourceType: $resourceType, unit: $unit, maxUnitsPerDay: $maxUnitsPerDay, costPerUnit: $costPerUnit, currencyCode: $currencyCode) { ...ResourceFields }
  }
`
export const UPDATE_RESOURCE = gql`
  ${RESOURCE_FIELDS}
  mutation UpdateResource($id: ID!, $name: String, $resourceType: String, $unit: String, $maxUnitsPerDay: Float, $costPerUnit: Float) {
    updateResource(id: $id, name: $name, resourceType: $resourceType, unit: $unit, maxUnitsPerDay: $maxUnitsPerDay, costPerUnit: $costPerUnit) { ...ResourceFields }
  }
`
export const DELETE_RESOURCE = gql`mutation DeleteResource($id: ID!) { deleteResource(id: $id) }`

export const SET_CALENDAR_DAY = gql`
  mutation SetCalendarDay($resourceId: ID!, $workDate: String!, $availableUnits: Float!, $isHoliday: Boolean!, $note: String) {
    setCalendarDay(resourceId: $resourceId, workDate: $workDate, availableUnits: $availableUnits, isHoliday: $isHoliday, note: $note) { id resourceId workDate availableUnits isHoliday note }
  }
`
export const DELETE_CALENDAR_DAY = gql`mutation DeleteCalendarDay($id: ID!) { deleteCalendarDay(id: $id) }`

export const ASSIGN_RESOURCE = gql`
  mutation AssignResource($activityId: ID!, $resourceId: ID!, $unitsPerDay: Float!, $budgetedCost: Float) {
    assignResource(activityId: $activityId, resourceId: $resourceId, unitsPerDay: $unitsPerDay, budgetedCost: $budgetedCost) {
      id activityId resourceId resourceName unit unitsPerDay totalUnits budgetedCost actualUnits actualCost
    }
  }
`
export const UPDATE_RESOURCE_ASSIGNMENT = gql`
  mutation UpdateResourceAssignment($id: ID!, $unitsPerDay: Float, $totalUnits: Float, $budgetedCost: Float, $actualUnits: Float, $actualCost: Float) {
    updateResourceAssignment(id: $id, unitsPerDay: $unitsPerDay, totalUnits: $totalUnits, budgetedCost: $budgetedCost, actualUnits: $actualUnits, actualCost: $actualCost) {
      id activityId resourceId resourceName unit unitsPerDay totalUnits budgetedCost actualUnits actualCost
    }
  }
`
export const REMOVE_RESOURCE_ASSIGNMENT = gql`mutation RemoveResourceAssignment($id: ID!) { removeResourceAssignment(id: $id) }`

// ── Cost Control ──────────────────────────────────────────────────────────────

const COST_CODE_FIELDS = gql`
  fragment CostCodeFields on CostCode {
    id projectId wbsId code name category budgetAmount sequence
    committedAmount actualAmount forecastEAC remainingBudget percentConsumed
    createdAt updatedAt
  }
`
const COMMITTED_FIELDS = gql`
  fragment CommittedFields on CommittedCost {
    id projectId costCodeId costCodeName commitmentType referenceId referenceNumber
    description vendorName committedAmount invoicedAmount paidAmount currencyCode
    commitmentDate expectedInvoiceDate status notes createdAt updatedAt
  }
`
const CASH_FLOW_FIELDS = gql`
  fragment CashFlowFields on CashFlowPeriod {
    id projectId periodYear periodMonth label
    plannedOutflow actualOutflow forecastOutflow
    plannedInflow actualInflow forecastInflow
    notes updatedAt cumPlannedOutflow cumActualOutflow cumForecastOutflow
  }
`
const SUBCONTRACT_FIELDS = gql`
  fragment SubcontractFields on Subcontract {
    id projectId costCodeId subcontractNumber subcontractorName description scopeOfWork
    contractValue revisedValue retentionPercentage retentionReleased
    certifiedAmount paidAmount currencyCode startDate endDate status createdAt updatedAt
    billings { id subcontractId billingNumber billingDate grossAmount retentionAmount netAmount certifiedAmount certifiedDate paidAmount paidDate status notes createdAt }
  }
`
const LABOR_FIELDS = gql`
  fragment LaborFields on LaborEntry {
    id projectId costCodeId activityId workDate trade workerName
    regularHours overtimeHours costPerHour totalCost notes createdAt
  }
`
const EQUIPMENT_FIELDS = gql`
  fragment EquipmentFields on EquipmentLog {
    id projectId costCodeId logDate equipmentName equipmentType ownership
    workingHours standbyHours costPerHour standbyRate totalCost notes createdAt
  }
`
const CLIENT_BILLING_FIELDS = gql`
  fragment ClientBillingFields on ClientBilling {
    id projectId billingNumber billingDate periodFrom periodTo
    grossAmount retentionPercentage retentionAmount netAmount
    certifiedAmount certifiedDate paidAmount paidDate status notes createdAt updatedAt
  }
`

export const PROJECT_COST_CODES_QUERY = gql`
  ${COST_CODE_FIELDS}
  query ProjectCostCodes($projectId: ID!) { projectCostCodes(projectId: $projectId) { ...CostCodeFields } }
`
export const PROJECT_COMMITTED_COSTS_QUERY = gql`
  ${COMMITTED_FIELDS}
  query ProjectCommittedCosts($projectId: ID!) { projectCommittedCosts(projectId: $projectId) { ...CommittedFields } }
`
export const PROJECT_CASH_FLOW_QUERY = gql`
  ${CASH_FLOW_FIELDS}
  query ProjectCashFlow($projectId: ID!) { projectCashFlow(projectId: $projectId) { ...CashFlowFields } }
`
export const PROJECT_SUBCONTRACTS_QUERY = gql`
  ${SUBCONTRACT_FIELDS}
  query ProjectSubcontracts($projectId: ID!) { projectSubcontracts(projectId: $projectId) { ...SubcontractFields } }
`
export const PROJECT_LABOR_ENTRIES_QUERY = gql`
  ${LABOR_FIELDS}
  query ProjectLaborEntries($projectId: ID!, $startDate: String, $endDate: String) {
    projectLaborEntries(projectId: $projectId, startDate: $startDate, endDate: $endDate) { ...LaborFields }
  }
`
export const PROJECT_EQUIPMENT_LOG_QUERY = gql`
  ${EQUIPMENT_FIELDS}
  query ProjectEquipmentLog($projectId: ID!, $startDate: String, $endDate: String) {
    projectEquipmentLog(projectId: $projectId, startDate: $startDate, endDate: $endDate) { ...EquipmentFields }
  }
`
export const PROJECT_COST_FORECAST_QUERY = gql`
  query ProjectCostForecast($projectId: ID!) {
    projectCostForecast(projectId: $projectId) { id projectId costCodeId costCodeName forecastDate etcAmount eacAmount notes createdAt }
  }
`
export const PROJECT_CLIENT_BILLINGS_QUERY = gql`
  ${CLIENT_BILLING_FIELDS}
  query ProjectClientBillings($projectId: ID!) { projectClientBillings(projectId: $projectId) { ...ClientBillingFields } }
`
export const PROJECT_COST_SUMMARY_QUERY = gql`
  query ProjectCostSummary($projectId: ID!) {
    projectCostSummary(projectId: $projectId) {
      totalBudget totalCommitted totalActual totalForecastEAC totalRemaining totalVariance percentConsumed
      totalBilled totalCertified totalPaidByClient totalRetentionHeld outstandingReceivable
      byCategory { category budgetAmount committedAmount actualAmount forecastEAC variance }
    }
  }
`

// Cost code mutations
export const CREATE_COST_CODE = gql`${COST_CODE_FIELDS} mutation CreateCostCode($projectId: ID!, $wbsId: ID, $analyticAccountId: ID, $code: String, $name: String, $category: String!, $budgetAmount: Float!, $sequence: Int) { createCostCode(projectId: $projectId, wbsId: $wbsId, analyticAccountId: $analyticAccountId, code: $code, name: $name, category: $category, budgetAmount: $budgetAmount, sequence: $sequence) { ...CostCodeFields } }`
export const UPDATE_COST_CODE = gql`${COST_CODE_FIELDS} mutation UpdateCostCode($id: ID!, $wbsId: ID, $code: String, $name: String, $category: String, $budgetAmount: Float, $sequence: Int) { updateCostCode(id: $id, wbsId: $wbsId, code: $code, name: $name, category: $category, budgetAmount: $budgetAmount, sequence: $sequence) { ...CostCodeFields } }`
export const DELETE_COST_CODE = gql`mutation DeleteCostCode($id: ID!) { deleteCostCode(id: $id) }`

// Committed cost mutations
export const CREATE_COMMITTED_COST = gql`${COMMITTED_FIELDS} mutation CreateCommittedCost($projectId: ID!, $costCodeId: ID, $commitmentType: String!, $referenceNumber: String, $description: String!, $vendorName: String, $committedAmount: Float!, $currencyCode: String, $commitmentDate: String, $expectedInvoiceDate: String, $notes: String) { createCommittedCost(projectId: $projectId, costCodeId: $costCodeId, commitmentType: $commitmentType, referenceNumber: $referenceNumber, description: $description, vendorName: $vendorName, committedAmount: $committedAmount, currencyCode: $currencyCode, commitmentDate: $commitmentDate, expectedInvoiceDate: $expectedInvoiceDate, notes: $notes) { ...CommittedFields } }`
export const UPDATE_COMMITTED_COST = gql`${COMMITTED_FIELDS} mutation UpdateCommittedCost($id: ID!, $costCodeId: ID, $description: String, $vendorName: String, $committedAmount: Float, $invoicedAmount: Float, $paidAmount: Float, $commitmentDate: String, $expectedInvoiceDate: String, $status: String, $notes: String) { updateCommittedCost(id: $id, costCodeId: $costCodeId, description: $description, vendorName: $vendorName, committedAmount: $committedAmount, invoicedAmount: $invoicedAmount, paidAmount: $paidAmount, commitmentDate: $commitmentDate, expectedInvoiceDate: $expectedInvoiceDate, status: $status, notes: $notes) { ...CommittedFields } }`
export const DELETE_COMMITTED_COST = gql`mutation DeleteCommittedCost($id: ID!) { deleteCommittedCost(id: $id) }`
export const SYNC_PO_COMMITMENTS = gql`mutation SyncPOCommitments($projectId: ID!) { syncPOCommitments(projectId: $projectId) }`

// Cash flow
export const UPSERT_CASH_FLOW_PERIOD = gql`${CASH_FLOW_FIELDS} mutation UpsertCashFlowPeriod($projectId: ID!, $periodYear: Int!, $periodMonth: Int!, $plannedOutflow: Float, $actualOutflow: Float, $forecastOutflow: Float, $plannedInflow: Float, $actualInflow: Float, $forecastInflow: Float, $notes: String) { upsertCashFlowPeriod(projectId: $projectId, periodYear: $periodYear, periodMonth: $periodMonth, plannedOutflow: $plannedOutflow, actualOutflow: $actualOutflow, forecastOutflow: $forecastOutflow, plannedInflow: $plannedInflow, actualInflow: $actualInflow, forecastInflow: $forecastInflow, notes: $notes) { ...CashFlowFields } }`

// Subcontract mutations
export const CREATE_SUBCONTRACT = gql`${SUBCONTRACT_FIELDS} mutation CreateSubcontract($projectId: ID!, $costCodeId: ID, $subcontractNumber: String!, $subcontractorName: String!, $description: String, $scopeOfWork: String, $contractValue: Float!, $retentionPercentage: Float, $currencyCode: String, $startDate: String, $endDate: String) { createSubcontract(projectId: $projectId, costCodeId: $costCodeId, subcontractNumber: $subcontractNumber, subcontractorName: $subcontractorName, description: $description, scopeOfWork: $scopeOfWork, contractValue: $contractValue, retentionPercentage: $retentionPercentage, currencyCode: $currencyCode, startDate: $startDate, endDate: $endDate) { ...SubcontractFields } }`
export const UPDATE_SUBCONTRACT = gql`${SUBCONTRACT_FIELDS} mutation UpdateSubcontract($id: ID!, $costCodeId: ID, $subcontractorName: String, $description: String, $scopeOfWork: String, $contractValue: Float, $revisedValue: Float, $retentionPercentage: Float, $retentionReleased: Float, $certifiedAmount: Float, $paidAmount: Float, $startDate: String, $endDate: String, $status: String) { updateSubcontract(id: $id, costCodeId: $costCodeId, subcontractorName: $subcontractorName, description: $description, scopeOfWork: $scopeOfWork, contractValue: $contractValue, revisedValue: $revisedValue, retentionPercentage: $retentionPercentage, retentionReleased: $retentionReleased, certifiedAmount: $certifiedAmount, paidAmount: $paidAmount, startDate: $startDate, endDate: $endDate, status: $status) { ...SubcontractFields } }`
export const DELETE_SUBCONTRACT = gql`mutation DeleteSubcontract($id: ID!) { deleteSubcontract(id: $id) }`
export const CREATE_SUBCONTRACT_BILLING = gql`mutation CreateSubcontractBilling($subcontractId: ID!, $billingNumber: String!, $billingDate: String!, $grossAmount: Float!, $retentionAmount: Float!, $netAmount: Float!, $notes: String) { createSubcontractBilling(subcontractId: $subcontractId, billingNumber: $billingNumber, billingDate: $billingDate, grossAmount: $grossAmount, retentionAmount: $retentionAmount, netAmount: $netAmount, notes: $notes) { id subcontractId billingNumber billingDate grossAmount retentionAmount netAmount certifiedAmount certifiedDate paidAmount paidDate status notes createdAt } }`
export const UPDATE_SUBCONTRACT_BILLING = gql`mutation UpdateSubcontractBilling($id: ID!, $certifiedAmount: Float, $certifiedDate: String, $paidAmount: Float, $paidDate: String, $status: String, $notes: String) { updateSubcontractBilling(id: $id, certifiedAmount: $certifiedAmount, certifiedDate: $certifiedDate, paidAmount: $paidAmount, paidDate: $paidDate, status: $status, notes: $notes) { id subcontractId billingNumber billingDate grossAmount retentionAmount netAmount certifiedAmount certifiedDate paidAmount paidDate status notes createdAt } }`
export const DELETE_SUBCONTRACT_BILLING = gql`mutation DeleteSubcontractBilling($id: ID!) { deleteSubcontractBilling(id: $id) }`

// Labor mutations
export const CREATE_LABOR_ENTRY = gql`${LABOR_FIELDS} mutation CreateLaborEntry($projectId: ID!, $costCodeId: ID, $activityId: ID, $workDate: String!, $trade: String!, $workerName: String, $regularHours: Float!, $overtimeHours: Float, $costPerHour: Float!, $notes: String) { createLaborEntry(projectId: $projectId, costCodeId: $costCodeId, activityId: $activityId, workDate: $workDate, trade: $trade, workerName: $workerName, regularHours: $regularHours, overtimeHours: $overtimeHours, costPerHour: $costPerHour, notes: $notes) { ...LaborFields } }`
export const UPDATE_LABOR_ENTRY = gql`${LABOR_FIELDS} mutation UpdateLaborEntry($id: ID!, $trade: String, $workerName: String, $regularHours: Float, $overtimeHours: Float, $costPerHour: Float, $notes: String) { updateLaborEntry(id: $id, trade: $trade, workerName: $workerName, regularHours: $regularHours, overtimeHours: $overtimeHours, costPerHour: $costPerHour, notes: $notes) { ...LaborFields } }`
export const DELETE_LABOR_ENTRY = gql`mutation DeleteLaborEntry($id: ID!) { deleteLaborEntry(id: $id) }`

// Equipment mutations
export const CREATE_EQUIPMENT_LOG = gql`${EQUIPMENT_FIELDS} mutation CreateEquipmentLog($projectId: ID!, $costCodeId: ID, $logDate: String!, $equipmentName: String!, $equipmentType: String, $ownership: String, $workingHours: Float!, $standbyHours: Float, $costPerHour: Float!, $standbyRate: Float, $notes: String) { createEquipmentLog(projectId: $projectId, costCodeId: $costCodeId, logDate: $logDate, equipmentName: $equipmentName, equipmentType: $equipmentType, ownership: $ownership, workingHours: $workingHours, standbyHours: $standbyHours, costPerHour: $costPerHour, standbyRate: $standbyRate, notes: $notes) { ...EquipmentFields } }`
export const UPDATE_EQUIPMENT_LOG = gql`${EQUIPMENT_FIELDS} mutation UpdateEquipmentLog($id: ID!, $equipmentName: String, $equipmentType: String, $workingHours: Float, $standbyHours: Float, $costPerHour: Float, $standbyRate: Float, $notes: String) { updateEquipmentLog(id: $id, equipmentName: $equipmentName, equipmentType: $equipmentType, workingHours: $workingHours, standbyHours: $standbyHours, costPerHour: $costPerHour, standbyRate: $standbyRate, notes: $notes) { ...EquipmentFields } }`
export const DELETE_EQUIPMENT_LOG = gql`mutation DeleteEquipmentLog($id: ID!) { deleteEquipmentLog(id: $id) }`

// Forecast
export const UPSERT_COST_FORECAST = gql`mutation UpsertCostForecast($projectId: ID!, $costCodeId: ID, $forecastDate: String!, $etcAmount: Float!, $eacAmount: Float!, $notes: String) { upsertCostForecast(projectId: $projectId, costCodeId: $costCodeId, forecastDate: $forecastDate, etcAmount: $etcAmount, eacAmount: $eacAmount, notes: $notes) { id projectId costCodeId costCodeName forecastDate etcAmount eacAmount notes createdAt } }`

// Client billing mutations
export const CREATE_CLIENT_BILLING = gql`${CLIENT_BILLING_FIELDS} mutation CreateClientBilling($projectId: ID!, $billingNumber: String!, $billingDate: String!, $periodFrom: String, $periodTo: String, $grossAmount: Float!, $retentionPercentage: Float, $retentionAmount: Float, $netAmount: Float!, $notes: String) { createClientBilling(projectId: $projectId, billingNumber: $billingNumber, billingDate: $billingDate, periodFrom: $periodFrom, periodTo: $periodTo, grossAmount: $grossAmount, retentionPercentage: $retentionPercentage, retentionAmount: $retentionAmount, netAmount: $netAmount, notes: $notes) { ...ClientBillingFields } }`
export const UPDATE_CLIENT_BILLING = gql`${CLIENT_BILLING_FIELDS} mutation UpdateClientBilling($id: ID!, $billingDate: String, $periodFrom: String, $periodTo: String, $grossAmount: Float, $retentionPercentage: Float, $retentionAmount: Float, $netAmount: Float, $certifiedAmount: Float, $certifiedDate: String, $paidAmount: Float, $paidDate: String, $status: String, $notes: String) { updateClientBilling(id: $id, billingDate: $billingDate, periodFrom: $periodFrom, periodTo: $periodTo, grossAmount: $grossAmount, retentionPercentage: $retentionPercentage, retentionAmount: $retentionAmount, netAmount: $netAmount, certifiedAmount: $certifiedAmount, certifiedDate: $certifiedDate, paidAmount: $paidAmount, paidDate: $paidDate, status: $status, notes: $notes) { ...ClientBillingFields } }`
export const DELETE_CLIENT_BILLING = gql`mutation DeleteClientBilling($id: ID!) { deleteClientBilling(id: $id) }`

// ── Variation Orders ──────────────────────────────────────────────────────────

const VO_FIELDS = gql`
  fragment VOFields on VariationOrder {
    id projectId voNumber title description changeType initiatedBy
    instructionDate receivedDate scheduleImpactDays
    voValue approvedValue currencyCode clientRef
    impactAnalysis technicalNotes status
    submittedAt decidedAt rejectionReason
    costItems { id voId category description quantity unit unitRate amount notes createdAt }
    correspondence { id voId correspondenceDate direction referenceNumber subject description createdAt }
    drawings { id voId drawingNumber revision title notes createdAt }
    createdAt updatedAt
  }
`

export const PROJECT_VARIATION_ORDERS_QUERY = gql`
  ${VO_FIELDS}
  query ProjectVariationOrders($projectId: ID!) {
    projectVariationOrders(projectId: $projectId) { ...VOFields }
  }
`

export const PROJECT_VARIATION_ORDER_QUERY = gql`
  ${VO_FIELDS}
  query ProjectVariationOrder($id: ID!) {
    projectVariationOrder(id: $id) { ...VOFields }
  }
`

export const CREATE_VARIATION_ORDER = gql`${VO_FIELDS} mutation CreateVariationOrder($projectId: ID!, $voNumber: String!, $title: String!, $description: String, $changeType: String, $initiatedBy: String, $instructionDate: String, $receivedDate: String, $scheduleImpactDays: Int, $voValue: Float!, $currencyCode: String, $clientRef: String, $impactAnalysis: String, $technicalNotes: String) { createVariationOrder(projectId: $projectId, voNumber: $voNumber, title: $title, description: $description, changeType: $changeType, initiatedBy: $initiatedBy, instructionDate: $instructionDate, receivedDate: $receivedDate, scheduleImpactDays: $scheduleImpactDays, voValue: $voValue, currencyCode: $currencyCode, clientRef: $clientRef, impactAnalysis: $impactAnalysis, technicalNotes: $technicalNotes) { ...VOFields } }`
export const UPDATE_VARIATION_ORDER = gql`${VO_FIELDS} mutation UpdateVariationOrder($id: ID!, $title: String, $description: String, $changeType: String, $initiatedBy: String, $instructionDate: String, $receivedDate: String, $scheduleImpactDays: Int, $voValue: Float, $currencyCode: String, $clientRef: String, $impactAnalysis: String, $technicalNotes: String) { updateVariationOrder(id: $id, title: $title, description: $description, changeType: $changeType, initiatedBy: $initiatedBy, instructionDate: $instructionDate, receivedDate: $receivedDate, scheduleImpactDays: $scheduleImpactDays, voValue: $voValue, currencyCode: $currencyCode, clientRef: $clientRef, impactAnalysis: $impactAnalysis, technicalNotes: $technicalNotes) { ...VOFields } }`
export const DELETE_VARIATION_ORDER = gql`mutation DeleteVariationOrder($id: ID!) { deleteVariationOrder(id: $id) }`
export const SUBMIT_VARIATION_ORDER = gql`${VO_FIELDS} mutation SubmitVariationOrder($id: ID!) { submitVariationOrder(id: $id) { ...VOFields } }`
export const APPROVE_VARIATION_ORDER = gql`${VO_FIELDS} mutation ApproveVariationOrder($id: ID!, $approvedValue: Float!) { approveVariationOrder(id: $id, approvedValue: $approvedValue) { ...VOFields } }`
export const REJECT_VARIATION_ORDER = gql`${VO_FIELDS} mutation RejectVariationOrder($id: ID!, $reason: String!) { rejectVariationOrder(id: $id, reason: $reason) { ...VOFields } }`
export const SET_VO_STATUS = gql`${VO_FIELDS} mutation SetVOStatus($id: ID!, $status: String!) { setVOStatus(id: $id, status: $status) { ...VOFields } }`

export const CREATE_VO_COST_ITEM = gql`mutation CreateVOCostItem($voId: ID!, $category: String!, $description: String!, $quantity: Float, $unit: String, $unitRate: Float!, $amount: Float!, $notes: String) { createVOCostItem(voId: $voId, category: $category, description: $description, quantity: $quantity, unit: $unit, unitRate: $unitRate, amount: $amount, notes: $notes) { id voId category description quantity unit unitRate amount notes createdAt } }`
export const UPDATE_VO_COST_ITEM = gql`mutation UpdateVOCostItem($id: ID!, $category: String, $description: String, $quantity: Float, $unit: String, $unitRate: Float, $amount: Float, $notes: String) { updateVOCostItem(id: $id, category: $category, description: $description, quantity: $quantity, unit: $unit, unitRate: $unitRate, amount: $amount, notes: $notes) { id voId category description quantity unit unitRate amount notes createdAt } }`
export const DELETE_VO_COST_ITEM = gql`mutation DeleteVOCostItem($id: ID!) { deleteVOCostItem(id: $id) }`

export const CREATE_VO_CORRESPONDENCE = gql`mutation CreateVOCorrespondence($voId: ID!, $correspondenceDate: String!, $direction: String!, $referenceNumber: String, $subject: String!, $description: String) { createVOCorrespondence(voId: $voId, correspondenceDate: $correspondenceDate, direction: $direction, referenceNumber: $referenceNumber, subject: $subject, description: $description) { id voId correspondenceDate direction referenceNumber subject description createdAt } }`
export const DELETE_VO_CORRESPONDENCE = gql`mutation DeleteVOCorrespondence($id: ID!) { deleteVOCorrespondence(id: $id) }`

export const ADD_VO_DRAWING = gql`mutation AddVODrawing($voId: ID!, $drawingNumber: String!, $revision: String, $title: String, $notes: String) { addVODrawing(voId: $voId, drawingNumber: $drawingNumber, revision: $revision, title: $title, notes: $notes) { id voId drawingNumber revision title notes createdAt } }`
export const REMOVE_VO_DRAWING = gql`mutation RemoveVODrawing($id: ID!) { removeVODrawing(id: $id) }`

// ── Meetings / MOM ─────────────────────────────────────────────────────────

const MEETING_ACTION_FIELDS = `id meetingId actionNumber description responsiblePerson dueDate priority status closedAt remarks carryOverFrom createdAt`
const MEETING_FIELDS = `id projectId meetingNumber meetingType title meetingDate location chairperson attendees agenda minutes distributionList status issuedAt actions { ${MEETING_ACTION_FIELDS} } createdAt updatedAt`

export const PROJECT_MEETINGS_QUERY = gql`query ProjectMeetings($projectId: ID!) { projectMeetings(projectId: $projectId) { ${MEETING_FIELDS} } }`

export const CREATE_MEETING = gql`mutation CreateMeeting($projectId: ID!, $meetingType: String!, $title: String!, $meetingDate: String!, $location: String, $chairperson: String, $attendees: String, $agenda: String, $distributionList: String) { createMeeting(projectId: $projectId, meetingType: $meetingType, title: $title, meetingDate: $meetingDate, location: $location, chairperson: $chairperson, attendees: $attendees, agenda: $agenda, distributionList: $distributionList) { ${MEETING_FIELDS} } }`
export const UPDATE_MEETING = gql`mutation UpdateMeeting($id: ID!, $meetingType: String, $title: String, $meetingDate: String, $location: String, $chairperson: String, $attendees: String, $agenda: String, $minutes: String, $distributionList: String) { updateMeeting(id: $id, meetingType: $meetingType, title: $title, meetingDate: $meetingDate, location: $location, chairperson: $chairperson, attendees: $attendees, agenda: $agenda, minutes: $minutes, distributionList: $distributionList) { ${MEETING_FIELDS} } }`
export const DELETE_MEETING = gql`mutation DeleteMeeting($id: ID!) { deleteMeeting(id: $id) }`
export const ISSUE_MEETING = gql`mutation IssueMeeting($id: ID!) { issueMeeting(id: $id) { ${MEETING_FIELDS} } }`
export const CLOSE_MEETING = gql`mutation CloseMeeting($id: ID!) { closeMeeting(id: $id) { ${MEETING_FIELDS} } }`

export const CREATE_MEETING_ACTION = gql`mutation CreateMeetingAction($meetingId: ID!, $description: String!, $responsiblePerson: String, $dueDate: String, $priority: String, $carryOverFrom: ID) { createMeetingAction(meetingId: $meetingId, description: $description, responsiblePerson: $responsiblePerson, dueDate: $dueDate, priority: $priority, carryOverFrom: $carryOverFrom) { ${MEETING_ACTION_FIELDS} } }`
export const UPDATE_MEETING_ACTION = gql`mutation UpdateMeetingAction($id: ID!, $description: String, $responsiblePerson: String, $dueDate: String, $priority: String, $status: String, $remarks: String) { updateMeetingAction(id: $id, description: $description, responsiblePerson: $responsiblePerson, dueDate: $dueDate, priority: $priority, status: $status, remarks: $remarks) { ${MEETING_ACTION_FIELDS} } }`
export const DELETE_MEETING_ACTION = gql`mutation DeleteMeetingAction($id: ID!) { deleteMeetingAction(id: $id) }`

// ── Store Out / Material Issues ────────────────────────────────────────────

const MI_LINE_FIELDS = `id productId productName poLineId qtyIssued unitCost totalCost isInvoiced`
const MI_FIELDS = `id issueNumber issueDate status notes poId poNumber projectCode projectName issuedByName createdAt lines { ${MI_LINE_FIELDS} }`

export const MATERIAL_ISSUES_QUERY = gql`
  query MaterialIssues($projectId: ID, $status: String) {
    materialIssues(projectId: $projectId, status: $status) { ${MI_FIELDS} }
  }
`

export const CREATE_MATERIAL_ISSUE = gql`
  mutation CreateMaterialIssue($projectId: ID!, $poId: ID, $issueDate: String!, $notes: String) {
    createMaterialIssue(projectId: $projectId, poId: $poId, issueDate: $issueDate, notes: $notes) { ${MI_FIELDS} }
  }
`

export const ADD_MATERIAL_ISSUE_LINE = gql`
  mutation AddMaterialIssueLine($issueId: ID!, $productId: ID!, $poLineId: ID, $qtyIssued: Float!, $unitCost: Float!) {
    addMaterialIssueLine(issueId: $issueId, productId: $productId, poLineId: $poLineId, qtyIssued: $qtyIssued, unitCost: $unitCost) { ${MI_LINE_FIELDS} }
  }
`

export const DELETE_MATERIAL_ISSUE_LINE = gql`
  mutation DeleteMaterialIssueLine($id: ID!, $issueId: ID!) {
    deleteMaterialIssueLine(id: $id, issueId: $issueId)
  }
`

export const ISSUE_MATERIAL_ISSUE = gql`
  mutation IssueMaterialIssue($id: ID!) {
    issueMaterialIssue(id: $id) { ${MI_FIELDS} }
  }
`

export const CANCEL_MATERIAL_ISSUE = gql`
  mutation CancelMaterialIssue($id: ID!) {
    cancelMaterialIssue(id: $id) { ${MI_FIELDS} }
  }
`

// ── Engineering Transmittals (Phase 2) ─────────────────────────────────────

const ENG_TR_ITEM_FIELDS = `
  id transmittalId documentId extRefNumber extTitle
  revision copies format purposeOfIssue remarks createdAt
  refNumber title discipline docType downloadUrl
`

const ENG_TR_FIELDS = `
  id projectId transmittalNo direction title subject
  toCompany toContact toEmail fromCompany fromContact
  status sentDate receivedDate acknowledgedAt acknowledgedBy
  dueDate notes createdByName createdAt itemCount isOverdue
  items { ${ENG_TR_ITEM_FIELDS} }
`

export const ENG_TRANSMITTALS_QUERY = gql`
  query EngTransmittals($projectId: ID!, $direction: String) {
    engTransmittals(projectId: $projectId, direction: $direction) { ${ENG_TR_FIELDS} }
  }
`

export const ENG_TRANSMITTAL_QUERY = gql`
  query EngTransmittal($id: ID!) {
    engTransmittal(id: $id) { ${ENG_TR_FIELDS} }
  }
`

export const CREATE_ENG_TRANSMITTAL = gql`
  mutation CreateEngTransmittal(
    $projectId: ID! $direction: String! $title: String! $subject: String
    $toCompany: String! $toContact: String $toEmail: String
    $fromCompany: String $fromContact: String
    $dueDate: String $notes: String $items: [EngTransmittalItemInput!]
  ) {
    createEngTransmittal(
      projectId: $projectId direction: $direction title: $title subject: $subject
      toCompany: $toCompany toContact: $toContact toEmail: $toEmail
      fromCompany: $fromCompany fromContact: $fromContact
      dueDate: $dueDate notes: $notes items: $items
    ) { ${ENG_TR_FIELDS} }
  }
`

export const UPDATE_ENG_TRANSMITTAL = gql`
  mutation UpdateEngTransmittal(
    $id: ID! $title: String $subject: String
    $toCompany: String $toContact: String $toEmail: String
    $fromCompany: String $fromContact: String
    $dueDate: String $notes: String
  ) {
    updateEngTransmittal(
      id: $id title: $title subject: $subject
      toCompany: $toCompany toContact: $toContact toEmail: $toEmail
      fromCompany: $fromCompany fromContact: $fromContact
      dueDate: $dueDate notes: $notes
    ) { ${ENG_TR_FIELDS} }
  }
`

export const ISSUE_ENG_TRANSMITTAL = gql`
  mutation IssueEngTransmittal($id: ID!) {
    issueEngTransmittal(id: $id) { ${ENG_TR_FIELDS} }
  }
`

export const MARK_ENG_TRANSMITTAL_RECEIVED = gql`
  mutation MarkEngTransmittalReceived($id: ID!) {
    markEngTransmittalReceived(id: $id) { ${ENG_TR_FIELDS} }
  }
`

export const ACKNOWLEDGE_ENG_TRANSMITTAL = gql`
  mutation AcknowledgeEngTransmittal($id: ID!, $acknowledgedBy: String) {
    acknowledgeEngTransmittal(id: $id, acknowledgedBy: $acknowledgedBy) { ${ENG_TR_FIELDS} }
  }
`

export const DELETE_ENG_TRANSMITTAL = gql`
  mutation DeleteEngTransmittal($id: ID!) { deleteEngTransmittal(id: $id) }
`

export const ADD_ENG_TRANSMITTAL_ITEM = gql`
  mutation AddEngTransmittalItem(
    $transmittalId: ID! $documentId: ID $extRefNumber: String $extTitle: String
    $revision: String $copies: Int $format: String $purposeOfIssue: String $remarks: String
  ) {
    addEngTransmittalItem(
      transmittalId: $transmittalId documentId: $documentId extRefNumber: $extRefNumber
      extTitle: $extTitle revision: $revision copies: $copies format: $format
      purposeOfIssue: $purposeOfIssue remarks: $remarks
    ) { ${ENG_TR_ITEM_FIELDS} }
  }
`

export const REMOVE_ENG_TRANSMITTAL_ITEM = gql`
  mutation RemoveEngTransmittalItem($id: ID!) { removeEngTransmittalItem(id: $id) }
`
