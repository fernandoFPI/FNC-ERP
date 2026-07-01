export const typeDefs = `#graphql
  type Query {
    health: String

    # Finance
    accounts(type: String, is_active: Boolean): [Account]
    journalEntries(status: String, from_date: String, to_date: String): [JournalEntry]
    trialBalance(as_of_date: String): [TrialBalanceLine]

    # Inventory
    products(category: String): [Product]
    stockBalances(product_id: ID, location_id: ID): [StockBalance]
    poStockAvailability(poId: ID!): [POLineAvailability!]!
    moMissingComponents(moId: ID!): [MOComponentStatus!]!

    # Procurement
    vendors: [Vendor]
    purchaseOrders(status: String, vendor_id: ID, project_id: ID): [PurchaseOrder]
    purchaseOrder(id: ID!): PurchaseOrder
    myPOQueue: [PurchaseOrder!]
    poPositions(projectId: ID, departmentId: ID): [POPositionAssignment!]!

    # Interco
    intercoTransactions(fromCompanyId: ID, toCompanyId: ID, status: String, transactionType: String, fromDate: String, toDate: String, page: Int, limit: Int): IntercoTransactionPage!

    # HR
    employees(department_id: ID, is_active: Boolean): [Employee]
    employee(id: ID!): Employee
    departments: [Department]
    workLocations(is_active: Boolean): [WorkLocation]
    attendanceLogs(employee_id: ID, from_date: String, to_date: String): [AttendanceLog]
    leaveRequests(employee_id: ID, status: String, from_date: String, to_date: String): [LeaveRequest]
    leaveRequest(id: ID!): LeaveRequest
    leaveTypes(is_active: Boolean): [LeaveType]
    leaveBalances(employee_id: ID!): [LeaveBalance]
    bankDetailsSummary(employee_id: ID!): BankDetailsSummary
    shiftConfigs: [ShiftConfig]
    employeeCurrentShift(employee_id: ID!): EmployeeShift
    overtimeRequests(employee_id: ID, from_date: String, to_date: String): [OvertimeLog]
    payrollRuns(status: String): [PayrollRun]
    payrollRun(id: ID!): PayrollRun
    payslip(id: ID!): Payslip
    payslips(payroll_run_id: ID, employee_id: ID): [Payslip]
    employeeSalaryConfig(employee_id: ID!): SalaryConfig
    myPayslips: [Payslip]
    attendanceCalendar(employeeId: ID!, month: String!): [AttendanceDaySummary]
    attendanceSummary(employeeId: ID!, month: String!): EmployeeMonthSummary

    # Notifications
    notifications(is_read: Boolean, limit: Int): [Notification]
    unreadNotificationCount: Int!

    # Projects
    projects(status: [String], projectType: String, projectManagerId: ID, search: String, page: Int, limit: Int, includeAll: Boolean): ProjectList!
    project(id: ID!): Project

    # Manufacturing
    manufacturingOrders(status: String, projectId: ID, page: Int, limit: Int): [ManufacturingOrder!]!
    boms(finishedProductId: ID, isActive: Boolean, allCompanies: Boolean): [BOM!]!
    manufacturingRequests(projectId: ID, status: String, companyId: ID): [ManufacturingRequest!]!
    manufacturingRequest(id: ID!): ManufacturingRequest

    # Rental
    equipmentAssets(status: String, category: String): [EquipmentAsset!]!
    rentalContracts(status: String, projectId: ID): [RentalContract!]!

    # Reporting
    projectProfitability(status: String): [ProjectProfitabilityRow!]!
    consolidatedTrialBalance(asOfDate: String!): ConsolidatedTBResult!

    # Invoicing
    projectContracts(projectId: ID, status: String): [ProjectContract!]!
    projectContract(id: ID!): ProjectContract
    projectInvoices(projectId: ID, contractId: ID, status: String): [ProjectInvoice!]!
    projectInvoice(id: ID!): ProjectInvoice
    materialIssues(projectId: ID!): [MaterialIssue!]!
    availableInvoiceCosts(invoiceId: ID!, sourceType: String): AvailableCosts!

    # Interco stock transfers
    intercoStockTransfers(fromCompanyId: ID, toCompanyId: ID, status: String, fromDate: String, toDate: String, page: Int, limit: Int): IntercoStockTransferPage!
    intercoStockTransfer(id: ID!): IntercoStockTransferDetail
    previewTransferPrice(productId: ID!, fromCompanyId: ID!, fromLocationId: ID!, qty: Float!, marketPrice: Float): TransferPricePreview!
    companyIntercoPricingSettings(companyId: ID!): CompanyIntercoPricingSettings!

    # File & document management
    fileDownloadUrl(fileId: ID!): DownloadUrlPayload!
    entityAttachments(entityType: String!, entityId: ID!): [DocumentAttachment!]!
  }

  type Mutation {
    # File management
    requestUploadUrl(filename: String!, mimeType: String!, sizeBytes: Int!, category: String!): UploadUrlPayload!
    confirmUpload(fileId: ID!): GQLFile!
    attachFile(fileId: ID!, entityType: String!, entityId: ID!, label: String, isPrimary: Boolean): DocumentAttachment!
    detachFile(attachmentId: ID!, entityType: String!, entityId: ID!): Boolean!

    reachMilestone(contractId: ID!, milestoneId: ID!): ProjectMilestone!
    createContractMilestone(contractId: ID!, input: MilestoneInput!): ProjectMilestone!
    updateContractMilestone(id: ID!, input: MilestoneInput!): ProjectMilestone!
    deleteContractMilestone(id: ID!): Boolean!
    recordInvoicePayment(invoiceId: ID!, paymentDate: String!, amount: Float!, currencyCode: String, paymentReference: String, paymentMethod: String, notes: String): InvoicePayment!

    # PO lifecycle
    submitPOToInventoryCheck(id: ID!, notes: String): PurchaseOrder!
    confirmPOInventoryCheck(id: ID!, lineStockQtys: [StockConfirmLineInput!]!, notes: String): PurchaseOrder!
    approveStockIssuance(id: ID!, notes: String): PurchaseOrder!
    submitPOStorePricing(id: ID!, linePrices: [LinePriceInput!]): PurchaseOrder!
    submitPOMarketPricing(id: ID!, vendorId: ID, linePrices: [MarketPriceInput!]): PurchaseOrder!
    submitPOPriceVerification(id: ID!, verificationNotes: String, lineAdjustments: [PriceAdjustmentInput]): PurchaseOrder!
    rejectPOToMarketPricing(id: ID!, reason: String!): PurchaseOrder!
    approvePO(id: ID!): PurchaseOrder!
    rejectPO(id: ID!, reason: String!): PurchaseOrder!
    reopenPO(id: ID!): PurchaseOrder!
    cancelPO(id: ID!, reason: String): PurchaseOrder!
    sendPOToAudit(id: ID!): PurchaseOrder!
    passPOAudit(id: ID!): PurchaseOrder!
    failPOAudit(id: ID!, notes: String): PurchaseOrder!
    setPOLineAuditStatus(poId: ID!, lineId: ID!, auditStatus: String!, auditNote: String): POLine!
    completePO(id: ID!, receiptNotes: String): PurchaseOrder!
    deletePO(id: ID!, reason: String): PurchaseOrder!
    adminSetPOStatus(id: ID!, status: String!): PurchaseOrder!
    setPOPriority(id: ID!, priority: String!): PurchaseOrder!
    setPOReceiver(id: ID!, employeeId: ID): PurchaseOrder!
    setPOLineActualPrice(poId: ID!, lineId: ID!, actualUnitPrice: Float): POLine!

    # PO edit requests
    submitPOEditRequest(id: ID!, changes: String!, notes: String): POEditRequest!
    approvePOEditRequest(id: ID!, requestId: ID!, reviewNotes: String): POEditRequest!
    rejectPOEditRequest(id: ID!, requestId: ID!, reviewNotes: String!): POEditRequest!

    # PO position management
    assignPOPosition(input: POPositionInput!): POPositionAssignment!
    removePOPosition(id: ID!): Boolean!

    # Manufacturing Requests
    createManufacturingRequest(input: ManufacturingRequestInput!): ManufacturingRequest!
    submitManufacturingRequest(id: ID!): ManufacturingRequest!
    approveManufacturingRequest(id: ID!): ManufacturingRequest!
    rejectManufacturingRequest(id: ID!, reason: String!): ManufacturingRequest!
    cancelManufacturingRequest(id: ID!): ManufacturingRequest!
    createMOFromRequest(requestId: ID!, bomId: ID!, workCenterId: ID, scheduledStart: String, scheduledEnd: String): ManufacturingRequest!

    # HR – Employees
    createEmployee(input: EmployeeInput!): Employee
    updateEmployee(id: ID!, input: EmployeeInput!): Employee
    terminateEmployee(id: ID!, terminationDate: String!, reason: String!): Employee
    linkEmployeeUser(employee_id: ID!, user_id: ID): Employee

    # HR – Departments
    createDepartment(input: DepartmentInput!): Department
    updateDepartment(id: ID!, input: DepartmentInput!): Department

    # HR – Work Locations
    createWorkLocation(input: WorkLocationInput!): WorkLocation
    updateWorkLocation(id: ID!, input: WorkLocationInput!): WorkLocation

    # HR – Shift Configs
    createShiftConfig(input: ShiftConfigInput!): ShiftConfig
    updateShiftConfig(id: ID!, input: ShiftConfigInput!): ShiftConfig
    assignShift(employee_id: ID!, shift_id: ID!, effective_from: String!): EmployeeShift
    unassignShift(employee_id: ID!): Boolean

    # HR – Leave
    createLeaveType(input: LeaveTypeInput!): LeaveType
    deleteLeaveType(id: ID!): Boolean
    createLeaveRequest(input: LeaveRequestInput!): LeaveRequest
    approveLeaveRequest(id: ID!): LeaveRequest
    rejectLeaveRequest(id: ID!, reviewNotes: String): LeaveRequest
    cancelLeaveRequest(id: ID!): LeaveRequest

    # HR – Payroll
    createPayrollRun(input: PayrollRunInput!): PayrollRun
    processPayrollRun(id: ID!): PayrollRun
    approvePayrollRun(id: ID!): PayrollRun
    postPayrollRun(id: ID!): PayrollRun
    cancelPayrollRun(id: ID!): PayrollRun

    # HR – Salary
    updateSalaryConfig(employee_id: ID!, input: SalaryConfigInput!): SalaryConfig

    # HR – Overtime (logs; approve/reject are stubs stored on the log)
    approveOvertimeRequest(id: ID!): OvertimeLog
    rejectOvertimeRequest(id: ID!, reviewNotes: String): OvertimeLog
    bulkApproveOvertime(ids: [ID!]!): [OvertimeLog]

    # HR – Bank details (stored as JSON in bank_account_encrypted)
    revealBankDetails(employee_id: ID!): BankDetailsResult
    updateBankDetails(employee_id: ID!, input: BankDetailsInput!): Employee
  }

  type Account {
    id: ID!
    code: String!
    name: String!
    account_type: String!
    is_active: Boolean!
    currency_code: String!
  }

  type JournalEntry {
    id: ID!
    reference: String!
    entry_date: String!
    status: String!
    description: String
  }

  type TrialBalanceLine {
    id: ID!
    code: String!
    name: String!
    account_type: String!
    total_debit: String!
    total_credit: String!
    balance: String!
  }

  type Product {
    id: ID!
    sku: String!
    name: String!
    uom: String!
    valuation_method: String!
    average_cost: String!
    is_active: Boolean!
    qty_on_hand: String
    sub_category: String
  }

  type StockBalance {
    product_id: ID!
    location_id: ID!
    qty_on_hand: String!
    average_cost: String!
    product_name: String
    location_name: String
  }

  type POLineAvailability {
    lineId: ID!
    productId: ID
    productName: String
    description: String
    qtyRequired: Float!
    qtyOnHand: Float!
    qtyAvailable: Float!
    isAvailable: Boolean!
  }

  type Vendor {
    id: ID!
    name: String!
    currency_code: String!
    payment_terms_days: Int!
    is_active: Boolean!
  }

  type PurchaseOrder {
    id: ID!
    po_number: String!
    vendor_name: String
    status: String!
    priority: String!
    total_amount: String!
    currency_code: String!
    project_id: ID
    organizer_id: ID
    assigned_approver_id: ID
    store_keeper_id: ID
    store_pricing_id: ID
    procurement_officer_id: ID
    procurement_2nd_id: ID
    notes: String
    expected_delivery_date: String
    created_at: String!
    updated_at: String!
  }

  type POPositionAssignment {
    id: ID!
    employeeId: ID!
    employeeName: String!
    position: String!
    projectId: ID
    projectName: String
    departmentId: ID
    departmentName: String
    isActive: Boolean!
    createdAt: String!
  }

  input POPositionInput {
    employeeId: ID!
    position: String!
    projectId: ID
    departmentId: ID
  }

  input LinePriceInput {
    lineId: ID!
    storePrice: Float!
    currencyCode: String!
    notes: String
  }

  input MarketPriceInput {
    lineId: ID!
    marketPrice: Float!
    vendorQuoteRef: String
    currencyCode: String!
  }

  input PriceAdjustmentInput {
    lineId: ID!
    verifiedPrice: Float!
    notes: String
  }

  type IntercoTransaction {
    id: ID!
    from_company_name: String
    to_company_name: String
    transaction_type: String!
    amount: String!
    currency_code: String!
    status: String!
    created_at: String!
  }

  type Employee {
    id: ID!
    employee_number: String
    first_name: String!
    last_name: String!
    email: String
    phone: String
    national_id: String
    passport_number: String
    nationality: String
    date_of_birth: String
    gender: String
    job_title: String
    department_id: ID
    department_name: String
    work_location_id: ID
    manager_id: ID
    employment_type: String
    hire_date: String
    termination_date: String
    status: String!
    user_id: ID
    linked_user_email: String
    photo_url: String
    is_active: Boolean
  }

  input EmployeeInput {
    employee_number: String
    first_name: String!
    last_name: String!
    email: String
    phone: String
    national_id: String
    passport_number: String
    nationality: String
    date_of_birth: String
    gender: String
    job_title: String
    department_id: ID
    work_location_id: ID
    manager_id: ID
    employment_type: String
    hire_date: String
    status: String
    user_id: ID
  }

  type Department {
    id: ID!
    name: String!
    parent_id: ID
    manager_id: ID
    is_active: Boolean!
  }

  input DepartmentInput {
    name: String!
    parent_id: ID
    manager_id: ID
    is_active: Boolean
  }

  type WorkLocation {
    id: ID!
    name: String!
    address: String
    latitude: String
    longitude: String
    geofence_radius_m: Int
    is_active: Boolean!
  }

  input WorkLocationInput {
    name: String!
    address: String
    latitude: Float
    longitude: Float
    geofence_radius_m: Int
    is_active: Boolean
  }

  type EmployeeShift {
    id: ID!
    employee_id: ID!
    shift_id: ID!
    shift_name: String
    start_time: String
    end_time: String
    break_minutes: Int
    overtime_threshold_hours: String
    effective_from: String!
    effective_to: String
  }

  type ShiftConfig {
    id: ID!
    name: String!
    start_time: String
    end_time: String
    break_minutes: Int
    overtime_threshold_hours: String
    is_active: Boolean!
  }

  input ShiftConfigInput {
    name: String!
    start_time: String
    end_time: String
    break_minutes: Int
    overtime_threshold_hours: Float
  }

  type LeaveType {
    id: ID!
    name: String!
    is_paid: Boolean!
    max_days_per_year: Int
    requires_approval: Boolean!
    is_active: Boolean!
  }

  input LeaveTypeInput {
    name: String!
    is_paid: Boolean
    max_days_per_year: Int
    requires_approval: Boolean
  }

  type LeaveBalance {
    leave_type_id: ID!
    leave_type_name: String!
    days_allocated: Int
    days_used: Int
    days_remaining: Int
  }

  type OvertimeLog {
    id: ID!
    employee_id: ID!
    employee_name: String
    work_date: String!
    regular_hours: String
    overtime_hours: String!
    status: String!
    review_notes: String
    reviewed_by_email: String
    overtime_multiplier: Float
  }

  type SalaryConfig {
    id: ID!
    employee_id: ID!
    base_salary: String!
    currency_code: String!
    housing_allowance: String
    transport_allowance: String
    other_allowances: String
    income_tax_pct: String
    social_security_pct: String
    effective_from: String
    effective_to: String
  }

  input SalaryConfigInput {
    base_salary: Float!
    currency_code: String!
    housing_allowance: Float
    transport_allowance: Float
    other_allowances: Float
    income_tax_pct: Float
    social_security_pct: Float
    effective_from: String
  }

  input PayrollRunInput {
    period_name: String!
    start_date: String!
    end_date: String!
  }

  input LeaveRequestInput {
    employee_id: ID
    leave_type_id: ID!
    start_date: String!
    end_date: String!
    reason: String
  }

  type AttendanceDaySummary {
    date: String!
    hoursWorked: Float
    hasOvertime: Boolean!
    isAbsent: Boolean!
    isWeekend: Boolean!
    isLeave: Boolean!
    leaveTypeName: String
  }

  type EmployeeMonthSummary {
    days_present: Int
    days_absent: Int
    total_hours: Float
    overtime_hours: Float
    leave_days: Int
  }

  type BankDetailsSummary {
    bank_name: String
    currency_code: String
    has_account: Boolean!
  }

  type BankDetailsResult {
    bank_name: String
    account_number: String
    iban: String
    currency_code: String
  }

  input BankDetailsInput {
    bank_name: String
    account_number: String
    iban: String
    currency_code: String
  }

  type AttendanceLog {
    id: ID!
    employee_id: ID!
    employee_name: String
    punch_type: String!
    punched_at: String!
    geofence_valid: Boolean
    distance_from_location_m: String
    work_location_id: ID
  }

  type LeaveRequest {
    id: ID!
    employee_id: ID!
    employee_name: String
    leave_type_id: ID
    leave_type_name: String
    start_date: String!
    end_date: String!
    total_days: Int
    status: String!
    reason: String
    reviewed_by: ID
    reviewed_at: String
    created_at: String
  }

  type PayrollRun {
    id: ID!
    period_name: String!
    start_date: String
    end_date: String
    status: String!
    total_gross: String!
    total_net: String!
    total_deductions: String
    created_at: String!
  }

  type Payslip {
    id: ID!
    payroll_run_id: ID
    employee_id: ID
    employee_name: String
    employee_number: String
    base_salary: String
    housing_allowance: String
    transport_allowance: String
    other_allowances: String
    overtime_hours: String
    overtime_pay: String
    gross_salary: String!
    income_tax: String!
    social_security: String!
    other_deductions: String
    net_salary: String!
    currency_code: String
    working_days: Int
    absent_days: Int
    leave_days: Int
  }

  type Notification {
    id: ID!
    type: String!
    title: String!
    body: String!
    is_read: Boolean!
    created_at: String!
  }

  type Project {
    id: ID!
    code: String!
    name: String!
    description: String
    projectType: String!
    status: String!
    companyId: ID!
    companyName: String

    rfqNumber: String
    contractName: String
    projectLocation: String
    receivingDate: String
    submissionDate: String
    submissionTime: String
    siteVisitDate: String
    siteVisitTime: String
    questionDate: String
    questionTime: String
    daysToSubmission: Int
    remarks: String

    projectValue: Float
    projectValueCurrency: String

    clientName: String
    clientContact: String

    plannedStartDate: String
    plannedEndDate: String
    budgetAmount: Float
    budgetCurrency: String

    managerId: ID
    managerName: String
    costCenterId: ID
    analyticAccountId: ID
    analyticAccountName: String

    holdReason: String
    cancelReason: String
    submittedAt: String
    approvedAt: String
    completedAt: String
    cancelledAt: String

    overallCompletionPct: Int
    teamCount: Int
    openPoCount: Int
    stagesCompleted: Int
    stagesTotal: Int
    currentStageName: String
    totalCosts: Float

    stages: JSON
    team: JSON
    recentPos: JSON
    costSummary: JSON
    statusHistory: JSON
    activityLog: JSON

    allowedActions: [String!]

    createdAt: String!
    updatedAt: String
  }

  type PaginationMeta {
    page: Int!
    limit: Int!
    total: Int!
    totalPages: Int!
  }

  type ProjectList {
    data: [Project!]!
    pagination: PaginationMeta!
  }

  type ManufacturingOrder {
    id: ID!
    mo_number: String!
    status: String!
    qty_planned: String!
    qty_produced: String!
    planned_cost: String!
    actual_cost: String!
    dispatch_type: String!
    product_name: String
    project_analytic_account_id: ID
    created_at: String!
  }

  type ManufacturingRequest {
    id: ID!
    requestNumber: String!
    projectId: String!
    projectName: String
    requestingCompanyId: String!
    requestingCompanyName: String
    productId: String
    productName: String
    productSku: String
    qtyRequested: Float!
    requiredDate: String
    description: String
    status: String!
    requestedBy: String!
    requestedByName: String
    approvedBy: String
    approvedByName: String
    approvedAt: String
    rejectionReason: String
    moId: String
    moNumber: String
    actualCost: Float
    currencyCode: String!
    notes: String
    createdAt: String!
  }

  input ManufacturingRequestInput {
    projectId: String!
    productId: String
    qtyRequested: Float!
    requiredDate: String
    description: String
    notes: String
  }

  type BOM {
    id: ID!
    company_id: ID!
    finished_product_id: ID!
    product_name: String
    version: String!
    qty_produced: String!
    is_active: Boolean!
  }

  type EquipmentAsset {
    id: ID!
    asset_number: String!
    name: String!
    category: String
    status: String!
    daily_rate: String!
    currency_code: String!
  }

  type RentalContract {
    id: ID!
    contract_number: String!
    rental_type: String!
    status: String!
    billing_cycle: String!
    rate_amount: String!
    start_date: String!
    client_name: String
  }

  type ProjectProfitabilityRow {
    project_id: ID!
    code: String!
    name: String!
    project_type: String!
    status: String!
    budget_amount: String!
    total_costs: String!
    total_revenue: String!
    gross_margin: String!
    budget_remaining: String!
  }

  type ConsolidatedTrialBalanceLine {
    account_type: String!
    account_code: String!
    account_name: String!
    company_id: ID!
    company_name: String!
    total_debit_iqd: String!
    total_credit_iqd: String!
    balance_iqd: String!
  }

  type ProjectContract {
    id: ID!
    contractNumber: String!
    contractName: String!
    clientName: String!
    contractValue: Float!
    currencyCode: String!
    defaultBillingMethod: String!
    defaultMarginPct: Float!
    retentionPct: Float!
    status: String!
    milestones: [ProjectMilestone!]!
    invoices: [ProjectInvoice!]!
    totalInvoiced: Float!
    totalPaid: Float!
    outstanding: Float!
  }

  type ProjectMilestone {
    id: ID!
    name: String!
    sequence: Int!
    billableAmount: Float!
    currencyCode: String!
    status: String!
    reachedAt: String
  }

  input MilestoneInput {
    name: String!
    sequence: Int
    billableAmount: Float!
    currencyCode: String
    description: String
  }

  type ProjectInvoice {
    id: ID!
    invoiceNumber: String!
    billingMethod: String!
    displayMode: String!
    grossTotal: Float!
    discountPct: Float!
    discountAmount: Float!
    retentionAmount: Float!
    netPayable: Float!
    whtApplies: Boolean!
    whtScenario: String
    whtRate: Float!
    whtAmount: Float!
    status: String!
    invoiceDate: String!
    dueDate: String!
    currencyCode: String!
    bankAccountId: ID
    paymentType: String!
    projectCode: String
    projectName: String
    contractNumber: String
    clientName: String
    retentionPct: Float
    companyName: String
    companyLegalName: String
    companyCountry: String
    companyStampImage: String
    companyLetterheadImage: String
    companyAddress: String
    companyPhone: String
    companyEmail: String
    companyBranchName: String
    companyBranchAddress: String
    companyBranchCity: String
    companyBranchPhone: String
    paymentTermsDays: Int
    verificationToken: String
    lines: [ProjectInvoiceLine!]!
    payments: [InvoicePayment!]!
  }

  type ProjectInvoiceLine {
    id: ID!
    lineNumber: Int!
    description: String!
    sourceType: String!
    qty: Float!
    unitCost: Float!
    subtotal: Float!
    marginPct: Float!
    marginAmount: Float!
    taxPct: Float!
    taxAmount: Float!
    lineTotal: Float!
    moComponents: [MOComponent]
  }

  type MOComponent {
    productName: String!
    qty: Float!
    unitCost: Float!
    totalCost: Float!
  }

  type InvoicePayment {
    id: ID!
    paymentDate: String!
    amount: Float!
    paymentReference: String
    paymentMethod: String
  }

  type MaterialIssue {
    id: ID!
    issueNumber: String!
    issueDate: String!
    status: String!
    lines: [MaterialIssueLine!]!
  }

  type MaterialIssueLine {
    id: ID!
    productId: ID!
    qtyIssued: Float!
    unitCost: Float!
    totalCost: Float!
    isInvoiced: Boolean!
  }

  type AvailableCosts {
    milestones: [ProjectMilestone!]!
    manufacturing_orders: [AvailableMO!]!
    purchase_orders: [AvailablePO!]!
    stock_issues: [AvailableStockIssue!]!
    rental: [AvailableRental!]!
  }

  type AvailableMO {
    id: ID!
    mo_number: String!
    product_name: String!
    qty_produced: Float!
    actual_cost: Float!
  }

  type AvailablePO {
    id: ID!
    po_number: String!
    vendor_name: String!
  }

  type AvailableStockIssue {
    id: ID!
    product_name: String!
    qty_issued: Float!
    unit_cost: Float!
    issue_number: String!
  }

  type AvailableRental {
    id: ID!
    contract_number: String!
    days_billed: Float!
    amount: Float!
  }

  type IntercoStockTransfer {
    id: ID!
    transferNumber: String!
    fromCompanyId: ID!
    toCompanyId: ID!
    fromCompanyName: String
    toCompanyName: String
    transferDate: String!
    pricingMethod: String!
    status: String!
    totalTransferValue: Float!
    lines: [IntercoStockTransferLine!]!
  }

  type IntercoStockTransferLine {
    id: ID!
    productId: ID!
    productName: String
    qty: Float!
    avcoAtTransfer: Float!
    transferPrice: Float!
    markupPctApplied: Float
    totalTransferValue: Float!
  }

  type TransferPricePreview {
    method: String!
    avcoAtTransfer: Float!
    transferPrice: Float!
    markupPctApplied: Float
    totalTransferValue: Float!
    requiresManualInput: Boolean!
  }

  type CompanyIntercoPricingSettings {
    method: String!
    costPlusMarkupPct: Float!
    configHistory: [PricingConfigChange!]!
  }

  type PricingConfigChange {
    id: ID!
    previousMethod: String
    newMethod: String!
    previousMarkupPct: Float
    newMarkupPct: Float
    effectiveFrom: String!
    notes: String
  }

  type GQLFile {
    id: ID!
    originalFilename: String!
    mimeType: String!
    sizeBytes: Int!
    category: String!
    status: String!
    uploadedAt: String
  }

  type DocumentAttachment {
    id: ID!
    file: GQLFile!
    label: String
    isPrimary: Boolean!
    createdAt: String!
    uploadedByEmail: String
  }

  type UploadUrlPayload {
    uploadUrl: String!
    fileId: ID!
    fileKey: String!
    expiresInSeconds: Int!
  }

  type DownloadUrlPayload {
    downloadUrl: String!
    filename: String!
    mimeType: String!
    expiresInSeconds: Int!
  }

  # ── Outbox monitoring (system_admin only) ─────────────────────
  scalar JSON

  type OutboxMonitorSummary {
    health: String!
    counts: OutboxCounts!
    byEventType: [OutboxEventTypeSummary!]!
    pendingDLQ: [DLQEntry!]!
    stuckEvents: [OutboxEvent!]!
    generatedAt: String!
  }

  type OutboxCounts {
    pending: Int!
    failed: Int!
    dlq: Int!
    stuck: Int!
  }

  type OutboxEventTypeSummary {
    eventType: String!
    service: String!
    status: String!
    count: Int!
    maxAttemptsSeen: Int!
    oldest: String
  }

  type OutboxEvent {
    id: ID!
    service: String!
    eventType: String!
    status: String!
    attempts: Int!
    maxAttempts: Int!
    lastError: String
    nextRetryAt: String
    createdAt: String!
    processedAt: String
    eventPriority: String!
    payload: JSON
  }

  type DLQErrorEntry { attempt: Int! error: String! at: String! }

  type DLQEntry {
    id: ID!
    eventType: String!
    service: String!
    priority: String!
    status: String!
    totalAttempts: Int!
    lastError: String
    errorHistory: [DLQErrorEntry!]!
    createdAt: String!
    reviewedBy: String
    reviewedByEmail: String
    reviewNotes: String
    retryOutboxId: ID
    payload: JSON
  }

  type OutboxEventPage { items: [OutboxEvent!]! total: Int! page: Int! limit: Int! }
  type DLQPage { items: [DLQEntry!]! total: Int! page: Int! limit: Int! }

  type OutboxEventConfig {
    id: ID!
    eventType: String!
    maxAttempts: Int!
    initialRetryDelaySeconds: Int!
    backoffMultiplier: Float!
    maxRetryDelaySeconds: Int!
    dlqPriority: String!
    alertOnDlq: Boolean!
    description: String
  }

  extend type Query {
    outboxMonitor: OutboxMonitorSummary!
    outboxEvents(status: String, service: String, eventType: String, page: Int, limit: Int): OutboxEventPage!
    outboxDLQ(status: String, priority: String, eventType: String, page: Int, limit: Int): DLQPage!
    outboxDLQEntry(id: ID!): DLQEntry
    outboxEventConfigs: [OutboxEventConfig!]!
  }

  extend type Mutation {
    retryOutboxEvent(eventId: ID!): Boolean!
    retryDLQEntry(dlqId: ID!, notes: String): Boolean!
    dismissDLQEntry(dlqId: ID!, notes: String!): Boolean!
    resetStuckEvents: Int!
  }

  # ── FX Rate monitoring ────────────────────────────────────────
  type FXRateStalenessStatus {
    currencyPair: String!
    lastRateDate: String
    ageHours: Float
    status: String!
    lastRate: Float
    message: String!
  }

  type FXRateStalenessOverview {
    overall: String!
    pairs: [FXRateStalenessStatus!]!
  }

  type FXSyncLog {
    id: ID!
    syncType: String!
    source: String!
    status: String!
    ratesUpdated: Int!
    ratesSkipped: Int!
    errorMessage: String
    durationMs: Int
    triggeredByEmail: String
    createdAt: String!
  }

  type FXRateChange {
    id: ID!
    fromCurrency: String!
    toCurrency: String!
    rateDate: String!
    rate: Float!
    previousRate: Float
    changePct: Float
    source: String!
    createdAt: String!
  }

  extend type Query {
    fxRateStaleness: FXRateStalenessOverview!
    fxSyncHistory(page: Int, limit: Int): [FXSyncLog!]!
    fxRateChangeLog(fromCurrency: String, toCurrency: String, days: Int): [FXRateChange!]!
  }

  extend type Mutation {
    triggerFXSync: Boolean!
  }

  # ── Phase 2: Finance ─────────────────────────────────────────

  extend type Account {
    parent_id: ID
    parent_name: String
    is_reconcilable: Boolean
    has_posted_lines: Boolean
  }

  extend type JournalEntry {
    source_type: String
    total_debit: String
    total_credit: String
    payment_currency: String
    created_by_email: String
    created_at: String
    accountant_id: ID
    accountant_email: String
    audited_by: ID
    auditor_email: String
    audited_at: String
    lines: [JournalLine!]
    linked_pos: [JournalLinkedPO!]
    journal_template_image: String
  }

  type JournalLinkedPO {
    po_id: ID!
    po_number: String!
    vendor_name: String
    status: String
    total_amount: String
    currency_code: String
  }

  type PaymentVoucher {
    id: ID!
    voucher_number: String!
    voucher_date: String!
    received_from: String!
    reference_to: String
    bank_account_fund: String
    total_amount_iqd: String!
    total_amount_usd: String!
    status: String!
    receiver_name: String
    notes: String
    created_by_email: String
    cashier_email: String
    auditor_email: String
    audited_at: String
    created_at: String!
    journal_count: String
    pv_template_image: String
    lines: [PaymentVoucherLine!]
    journals: [PaymentVoucherJournal!]
  }

  type PaymentVoucherLine {
    id: ID!
    statement: String!
    acct_1: String
    acct_2: String
    acct_3: String
    acct_4: String
    acct_5: String
    amount_iqd: String!
    amount_usd: String!
    sequence: Int!
  }

  type PaymentVoucherJournal {
    id: ID!
    reference: String!
    entry_date: String!
    status: String!
    description: String
    audited_at: String
    linked_pos: [JournalLinkedPO!]
  }

  input PaymentVoucherLineInput {
    statement:  String!
    acct_1:     String
    acct_2:     String
    acct_3:     String
    acct_4:     String
    acct_5:     String
    amount_iqd: Float
    amount_usd: Float
    sequence:   Int
  }

  input CreatePaymentVoucherInput {
    voucher_number:    String
    voucher_date:      String!
    received_from:     String!
    reference_to:      String
    bank_account_fund: String
    receiver_name:     String
    notes:             String
    lines:             [PaymentVoucherLineInput!]!
    journal_ids:       [ID!]
  }

  type JournalLine {
    id: ID!
    account_id: ID!
    account_code: String
    account_name: String
    analytic_account_id: ID
    cost_center_id: ID
    description: String
    currency_code: String
    debit: String!
    credit: String!
    fx_rate: String
  }

  type AccountLedgerLine {
    id: ID!
    date: String!
    reference: String
    description: String
    debit: String!
    credit: String!
    running_balance: String!
    journal_entry_id: ID!
  }

  type AccountLedgerPage {
    items: [AccountLedgerLine!]!
    total: Int!
    page: Int!
    limit: Int!
    totalDebit: String!
    totalCredit: String!
    netBalance: String!
  }

  type FXRate {
    id: ID!
    from_currency: String!
    to_currency: String!
    rate: String!
    rate_date: String!
    source: String
    created_at: String
  }

  type AccountingPeriod {
    id: ID!
    name: String!
    start_date: String!
    end_date: String!
    status: String!
    closed_by_email: String
    closed_at: String
  }

  type PLLine {
    account_id: ID!
    code: String!
    name: String!
    amount: String!
  }

  type ProfitLossReport {
    revenue: [PLLine!]!
    expenses: [PLLine!]!
    totalRevenue: String!
    totalExpenses: String!
    netProfit: String!
  }

  type BSLine {
    account_id: ID!
    code: String!
    name: String!
    amount: String!
  }

  type BalanceSheetReport {
    assets: [BSLine!]!
    liabilities: [BSLine!]!
    equity: [BSLine!]!
    retainedEarnings: String!
    totalAssets: String!
    totalLiabilities: String!
    totalEquity: String!
    isBalanced: Boolean!
  }

  type AnalyticAccount {
    id: ID!
    name: String!
    code: String!
  }

  type CostCenter {
    id: ID!
    name: String!
    code: String!
  }

  input JournalLineInput {
    account_id: ID!
    analytic_account_id: ID
    cost_center_id: ID
    description: String
    currency_code: String
    debit: Float!
    credit: Float!
    fx_rate: Float
  }

  input JournalEntryInput {
    entry_date: String!
    description: String
    source_type: String
    lines: [JournalLineInput!]!
  }

  input AccountInput {
    code: String!
    name: String!
    account_type: String!
    parent_id: ID
    currency_code: String
    is_reconcilable: Boolean
    is_active: Boolean
  }

  input FXRateInput {
    from_currency: String!
    to_currency: String!
    rate: Float!
    rate_date: String!
    source: String
  }

  input PeriodInput {
    name: String!
    start_date: String!
    end_date: String!
  }

  extend type Query {
    account(id: ID!): Account
    accountLedger(accountId: ID!, fromDate: String, toDate: String, page: Int, limit: Int): AccountLedgerPage
    journalEntry(id: ID!): JournalEntry
    fxRates(fromCurrency: String, toCurrency: String, fromDate: String, toDate: String): [FXRate!]!
    accountingPeriods: [AccountingPeriod!]!
    profitLoss(fromDate: String!, toDate: String!, costCenterId: ID): ProfitLossReport
    balanceSheet(asOfDate: String!): BalanceSheetReport
    analyticAccounts: [AnalyticAccount!]!
    costCenters: [CostCenter!]!
    paymentVouchers(status: String, fromDate: String, toDate: String): [PaymentVoucher!]!
    paymentVoucher(id: ID!): PaymentVoucher
  }

  extend type Mutation {
    createJournalEntry(input: JournalEntryInput!): JournalEntry!
    postJournalEntry(id: ID!): JournalEntry!
    cancelJournalEntry(id: ID!, reason: String): JournalEntry!
    auditJournalEntry(id: ID!): JournalEntry!
    linkJournalPOs(id: ID!, poIds: [ID!]!): [JournalLinkedPO!]!
    combineJournalEntries(journalIds: [ID!]!, description: String): JournalEntry!
    createAccount(input: AccountInput!): Account!
    updateAccount(id: ID!, input: AccountInput!): Account!
    upsertFXRate(input: FXRateInput!): FXRate!
    createAccountingPeriod(input: PeriodInput!): AccountingPeriod!
    closeAccountingPeriod(id: ID!): AccountingPeriod!
    createPaymentVoucher(input: CreatePaymentVoucherInput!): PaymentVoucher!
    updatePaymentVoucher(id: ID!, input: CreatePaymentVoucherInput!): PaymentVoucher!
    approvePaymentVoucher(id: ID!): PaymentVoucher!
    markPaymentVoucherPaid(id: ID!): PaymentVoucher!
  }

  # ── Phase 2: Procurement ─────────────────────────────────────

  extend type Vendor {
    legal_name: String
    tax_id: String
    country_code: String
    city: String
    address: String
    contact_name: String
    contact_email: String
    contact_phone: String
    withholding_tax_type: String
    withholding_tax_rate: String
    bank_name: String
  }

  type POLine {
    id: ID!
    product_id: ID
    product_name: String
    description: String
    qty: String!
    unit_price: String!
    total: String!
    uom: String
    qty_received: String
    actual_unit_price: String
    store_price: String
    store_price_currency: String
    market_price: String
    market_price_currency: String
    verified_price: String
    verified_price_currency: String
    in_stock: Boolean
    qty_from_stock: String
    audit_status: String
    audit_note: String
    audit_flagged_by_email: String
    audit_flagged_at: String
  }

  type POReceiptLine {
    po_line_id: ID!
    description: String
    qty_received: String!
  }

  type ReceiptPhoto {
    id: ID!
    fileId: ID!
    label: String
    originalFilename: String!
    downloadUrl: String
    createdAt: String!
  }

  type POReceipt {
    id: ID!
    receipt_date: String
    location_id: ID
    location_name: String
    notes: String
    received_by_email: String
    received_by_name: String
    location_notes: String
    created_at: String
    lines: [POReceiptLine!]!
    photos: [ReceiptPhoto!]!
  }

  type POApprovalLogEntry {
    id: ID!
    action: String!
    user_email: String
    notes: String
    created_at: String!
  }

  type POEditRequest {
    id: ID!
    po_id: ID!
    requested_by_email: String
    status: String!
    changes: String!
    request_notes: String
    reviewed_by_email: String
    review_notes: String
    reviewed_at: String
    created_at: String!
  }

  extend type PurchaseOrder {
    vendor_id: ID
    analytic_account_id: ID
    analytic_account_name: String
    expected_delivery_date: String
    notes: String
    created_by_email: String
    fx_rate: String
    pdf_path: String
    assigned_to_email: String
    assigned_receiver_id: ID
    assigned_receiver_name: String
    subtotal: String
    tax_amount: String
    submitted_at: String
    purpose: String
    linkedProjectId: ID
    linkedMoId: ID
    lines: [POLine!]
    receipts: [POReceipt!]
    approval_log: [POApprovalLogEntry!]
    edit_requests: [POEditRequest!]
  }

  input StockConfirmLineInput {
    lineId: ID!
    qtyFromStock: Float!
  }

  type MOComponentStatus {
    bomLineId: ID!
    componentProductId: ID!
    productName: String
    uom: String
    qtyRequired: Float!
    qtyOnHand: Float!
    qtyAvailable: Float!
    qtyShortfall: Float!
    hasSufficientStock: Boolean!
  }

  input POLineInput {
    product_id: ID
    description: String
    qty: Float!
    unit_price: Float!
    uom: String
  }

  input POInput {
    vendor_id: ID
    currency_code: String
    analytic_account_id: ID
    expected_delivery_date: String
    notes: String
    assigned_to: ID
    assigned_receiver_id: ID
    fx_rate: Float
    purpose: String
    linkedProjectId: ID
    linkedMoId: ID
    lines: [POLineInput!]!
  }

  input ReceiptLineInput {
    po_line_id: ID!
    qty_received: Float!
  }

  input ReceiptInput {
    receipt_date: String!
    location_id: ID
    notes: String
    received_by_name: String
    location_notes: String
    lines: [ReceiptLineInput!]!
  }

  input VendorInput {
    name: String!
    legal_name: String
    tax_id: String
    currency_code: String
    payment_terms_days: Int
    country_code: String
    city: String
    address: String
    contact_name: String
    contact_email: String
    contact_phone: String
    withholding_tax_type: String
    withholding_tax_rate: Float
    bank_name: String
    email: String
    is_active: Boolean
  }

  extend type Query {
    vendor(id: ID!): Vendor
    myApprovalQueue: [PurchaseOrder!]!
  }

  extend type Mutation {
    createVendor(input: VendorInput!): Vendor!
    updateVendor(id: ID!, input: VendorInput!): Vendor!
    createPurchaseOrder(input: POInput!): PurchaseOrder!
    updatePurchaseOrder(id: ID!, input: POInput!): PurchaseOrder!
    submitPO(id: ID!): PurchaseOrder!
    approveL1PO(id: ID!): PurchaseOrder!
    approveL2PO(id: ID!): PurchaseOrder!
    rejectPO(id: ID!, notes: String!): PurchaseOrder!
    cancelPO(id: ID!, notes: String): PurchaseOrder!
    markOrderedPO(id: ID!): PurchaseOrder!
    recordReceipt(poId: ID!, input: ReceiptInput!): POReceipt!
    attachReceiptPhoto(receiptId: ID!, fileId: ID!, label: String): ReceiptPhoto!
  }

  # ── Phase 2: Inventory ───────────────────────────────────────

  extend type Product {
    description: String
    category: String
    sub_category: String
    standard_cost: String
    reorder_point: String
    reorder_qty: String
    has_stock_moves: Boolean
    balances: [ProductBalance!]
  }

  extend type StockBalance {
    qty_reserved: String
    available: String
    location_type: String
    total_value: String
    is_low_stock: Boolean
  }

  type ProductBalance {
    location_id: ID!
    location_name: String
    location_type: String
    qty_on_hand: String!
    qty_reserved: String!
    available: String!
    average_cost: String!
    total_value: String!
  }

  type StockLocation {
    id: ID!
    name: String!
    code: String
    type: String!
    parent_id: ID
    parent_name: String
    is_active: Boolean!
    address: String
  }

  type StockSnapshotRow {
    product_id: ID!
    sku: String!
    product_name: String!
    category: String
    location_id: ID!
    location_name: String!
    location_type: String!
    qty_on_hand: String!
    qty_reserved: String!
    available: String!
    average_cost: String!
    total_value: String!
    is_low_stock: Boolean!
  }

  type StockBalanceSnapshot {
    totalValue: String!
    currency: String!
    rows: [StockSnapshotRow!]!
  }

  type StockMove {
    id: ID!
    move_date: String!
    product_id: ID!
    product_name: String
    sku: String
    from_location_id: ID
    from_location_name: String
    to_location_id: ID
    to_location_name: String
    qty: String!
    unit_cost: String
    total_cost: String
    source_type: String!
    reference: String
    lot_id: ID
    lot_number: String
    moved_by_email: String
  }

  type StockLotMove {
    id: ID!
    move_date: String!
    direction: String!
    from_location_name: String
    to_location_name: String
    qty: String!
    source_type: String!
    reference: String
    moved_by_email: String
  }

  type StockLot {
    id: ID!
    lot_number: String!
    product_id: ID!
    product_name: String
    sku: String
    expiry_date: String
    created_at: String!
    current_qty: String
    current_location_id: ID
    current_location_name: String
    moves: [StockLotMove!]
  }

  input ProductInput {
    sku: String!
    name: String!
    description: String
    category: String
    sub_category: String
    uom: String!
    valuation_method: String
    standard_cost: Float
    reorder_point: Float
    reorder_qty: Float
    is_active: Boolean
  }

  input LocationInput {
    name: String!
    code: String
    type: String!
    parent_id: ID
    address: String
    is_active: Boolean
  }

  input TransferLineInput {
    product_id: ID!
    qty: Float!
    unit_cost: Float
    lot_id: ID
  }

  input TransferInput {
    from_location_id: ID!
    to_location_id: ID!
    move_date: String!
    reference: String
    notes: String
    lines: [TransferLineInput!]!
  }

  input StockAdjustmentInput {
    product_id: ID!
    location_id: ID!
    new_qty: Float!
    unit_cost: Float
    notes: String
    adjustment_date: String
  }

  extend type Query {
    product(id: ID!): Product
    stockLocations(type: String, isActive: Boolean, companyId: ID): [StockLocation!]!
    stockBalanceSnapshot: StockBalanceSnapshot!
    stockMoves(productId: ID, fromLocationId: ID, toLocationId: ID, sourceType: String, fromDate: String, toDate: String, page: Int, limit: Int): [StockMove!]!
    stockLots(productId: ID): [StockLot!]!
    stockLot(id: ID!): StockLot
  }

  extend type Mutation {
    createProduct(input: ProductInput!): Product!
    updateProduct(id: ID!, input: ProductInput!): Product!
    createStockLocation(input: LocationInput!): StockLocation!
    createManualTransfer(input: TransferInput!): StockMove!
    createStockAdjustment(input: StockAdjustmentInput!): StockMove!
  }

  # ── Phase 4: Projects ────────────────────────────────────────

  type ProjectTeamMember {
    id: ID!
    employee_id: ID!
    employee_name: String!
    role: String!
  }

  type CostSegment {
    key: String!
    label: String!
    amount: Float!
  }

  input ProjectCreateInput {
    name: String!
    code: String
    projectType: String
    description: String
    clientName: String
    clientContact: String
    rfqNumber: String
    contractName: String
    projectLocation: String
    receivingDate: String
    submissionDate: String
    submissionTime: String
    siteVisitDate: String
    siteVisitTime: String
    questionDate: String
    questionTime: String
    projectValue: Float
    projectValueCurrency: String
    plannedStartDate: String
    plannedEndDate: String
    budgetAmount: Float
    budgetCurrency: String
    projectManagerId: ID
    costCenterId: ID
    remarks: String
  }

  input ProjectUpdateInput {
    name: String
    description: String
    projectType: String
    clientName: String
    clientContact: String
    rfqNumber: String
    contractName: String
    projectLocation: String
    receivingDate: String
    submissionDate: String
    submissionTime: String
    siteVisitDate: String
    siteVisitTime: String
    questionDate: String
    questionTime: String
    projectValue: Float
    projectValueCurrency: String
    plannedStartDate: String
    plannedEndDate: String
    budgetAmount: Float
    budgetCurrency: String
    projectManagerId: ID
    costCenterId: ID
    remarks: String
  }

  type ProjectStage {
    id: ID!
    name: String!
    sequence: Int!
    status: String!
    completionPct: Int!
    plannedStartDate: String
    plannedEndDate: String
    actualStartDate: String
    actualEndDate: String
    notes: String
  }

  type ProjectMember {
    id: ID!
    employeeId: ID!
    name: String!
    role: String
    allocatedHours: Int
    startDate: String
    endDate: String
    isActive: Boolean!
  }

  type ProjectCompletionBlockers {
    canComplete: Boolean!
    blockers: [String!]!
  }

  input StageInput {
    name: String!
    sequence: Int
    plannedStartDate: String
    plannedEndDate: String
    notes: String
  }

  input UpdateStageInput {
    name: String
    status: String
    completionPct: Int
    plannedStartDate: String
    plannedEndDate: String
    actualStartDate: String
    actualEndDate: String
    notes: String
    assignedTo: ID
  }

  input MemberInput {
    employeeId: ID!
    role: String
    allocatedHours: Int
    startDate: String
    endDate: String
  }

  extend type Query {
    projectTeamMembers(projectId: ID!): [ProjectTeamMember!]!
    projectCompletionBlockers(id: ID!): ProjectCompletionBlockers!
  }

  extend type Mutation {
    createProject(input: ProjectCreateInput!): Project!
    updateProject(id: ID!, input: ProjectUpdateInput!): Project!
    startProject(id: ID!): Project!
    holdProject(id: ID!, reason: String!): Project!
    resumeProject(id: ID!): Project!
    submitProject(id: ID!): Project!
    approveProject(id: ID!): Project!
    rejectBackProject(id: ID!, reason: String!): Project!
    completeProject(id: ID!): Project!
    cancelProject(id: ID!, reason: String!): Project!
    cancelProjectAfterApproval(id: ID!, reason: String!): Project!
    adminSetProjectStatus(id: ID!, status: String!): Project!
    createProjectStage(projectId: ID!, input: StageInput!): ProjectStage!
    updateProjectStage(projectId: ID!, stageId: ID!, input: UpdateStageInput!): ProjectStage!
    addProjectMember(projectId: ID!, input: MemberInput!): ProjectMember!
    removeProjectMember(projectId: ID!, memberId: ID!): Boolean!
    addProjectTeamMember(projectId: ID!, employeeId: ID!, role: String!): ProjectTeamMember!
    removeProjectTeamMember(projectId: ID!, memberId: ID!): Boolean!
    createProjectContract(projectId: ID!, input: ProjectContractInput!): ProjectContract!
    updateProjectContract(id: ID!, input: ProjectContractInput!): ProjectContract!
    createProjectInvoice(contractId: ID!, input: ProjectInvoiceInput!): ProjectInvoice!
    updateProjectInvoice(id: ID!, invoiceDate: String, lines: [InvoiceLineEditInput!]): ProjectInvoice!
    voidProjectInvoice(id: ID!, reason: String): ProjectInvoice!
  }

  input InvoiceLineEditInput {
    id: ID
    description: String
    qty: Float
    unitCost: Float
  }

  input ProjectContractInput {
    contractName: String!
    clientName: String!
    contractValue: Float!
    currencyCode: String
    defaultBillingMethod: String
    defaultMarginPct: Float
    retentionPct: Float
    status: String
  }

  input ProjectInvoiceInput {
    billingMethod: String!
    displayMode: String
    dueDate: String!
    notes: String
    discountPct: Float
    discountAmount: Float
    whtApplies: Boolean
    whtScenario: String
    whtRate: Float
    lines: [ProjectInvoiceLineInput!]!
  }

  input ProjectInvoiceLineInput {
    description: String!
    sourceType: String!
    qty: Float!
    unitCost: Float!
    marginPct: Float
    taxPct: Float
    sourceId: ID
  }

  # ── Phase 4: Manufacturing ───────────────────────────────────

  type WorkCenter {
    id: ID!
    code: String!
    name: String!
    capacity_hours_per_day: Float!
    cost_per_hour: Float!
    currency_code: String!
    is_active: Boolean!
  }

  extend type BOM {
    notes: String
    lines: [BOMLine!]
  }

  type BOMLine {
    id: ID!
    sequence: Int!
    component_product_id: ID!
    component_name: String
    qty: Float!
    uom: String!
    unit_cost: Float
  }

  extend type ManufacturingOrder {
    bom_id: ID
    bom_version: String
    work_center_id: ID
    work_center_name: String
    project_id: ID
    project_name: String
    scheduled_start: String
    scheduled_end: String
    actual_start: String
    actual_end: String
    notes: String
    created_by_email: String
    lines: [MOLine!]
  }

  type MOLine {
    id: ID!
    component_product_id: ID!
    component_name: String
    qty_planned: Float!
    qty_consumed: Float!
    unit_cost: Float!
    total_cost: Float!
  }

  input WorkCenterInput {
    code: String!
    name: String!
    capacity_hours_per_day: Float!
    cost_per_hour: Float!
    currency_code: String
    is_active: Boolean
  }

  input BOMInput {
    finished_product_id: ID!
    version: String!
    qty_produced: Float!
    name: String
    notes: String
    lines: [BOMLineInput!]!
  }

  input BOMLineInput {
    component_product_id: ID!
    qty: Float!
    uom: String!
    unit_cost: Float
    sequence: Int
  }

  input MOInput {
    bom_id: ID!
    qty_planned: Float!
    work_center_id: ID
    project_id: ID
    scheduled_start: String
    scheduled_end: String
    notes: String
  }

  input MOCompletionInput {
    qty_produced: Float!
    actual_cost: Float
    lines: [MOLineConsumedInput!]
    notes: String
  }

  input MOLineConsumedInput {
    component_product_id: ID!
    qty_consumed: Float!
    unit_cost: Float
  }

  extend type Query {
    workCenters(isActive: Boolean, allCompanies: Boolean): [WorkCenter!]!
    bom(id: ID!): BOM
    manufacturingOrder(id: ID!): ManufacturingOrder
    moCostAnalysis(moId: ID!): MOCostAnalysis!
  }

  type MOCostAnalysis {
    plannedCost: Float!
    actualCost: Float!
    variance: Float!
    variancePct: Float!
    componentBreakdown: [CostSegment!]!
  }

  extend type Mutation {
    createWorkCenter(input: WorkCenterInput!): WorkCenter!
    updateWorkCenter(id: ID!, input: WorkCenterInput!): WorkCenter!
    createBOM(input: BOMInput!): BOM!
    updateBOM(id: ID!, input: BOMInput!): BOM!
    createManufacturingOrder(input: MOInput!): ManufacturingOrder!
    confirmMO(id: ID!): ManufacturingOrder!
    startMO(id: ID!): ManufacturingOrder!
    completeMO(id: ID!, input: MOCompletionInput!): ManufacturingOrder!
    cancelMO(id: ID!, notes: String): ManufacturingOrder!
  }

  # ── Phase 4: Equipment Rental ────────────────────────────────

  extend type EquipmentAsset {
    description: String
    serial_number: String
    purchase_date: String
    purchase_price: Float
    current_value: Float
    total_hours: Float
    total_mileage: Float
    maintenance_due_hours: Float
    last_maintenance_date: String
    maintenance_status: String
    condition_rating: Int
    usageLogs: [UsageLog!]
    maintenanceSchedules: [MaintenanceSchedule!]
    conditionReports: [ConditionReport!]
  }

  type UsageLog {
    id: ID!
    asset_id: ID!
    usage_date: String!
    hours_used: Float!
    mileage_km: Float
    operator_name: String!
    notes: String
    created_by_email: String
    created_at: String!
  }

  type MaintenanceSchedule {
    id: ID!
    asset_id: ID!
    asset_name: String
    maintenance_type: String!
    scheduled_date: String!
    description: String
    status: String!
    estimated_cost: Float
    assigned_to: String
  }

  type MaintenanceRecord {
    id: ID!
    asset_id: ID!
    maintenance_type: String!
    performed_date: String!
    description: String!
    cost: Float!
    performed_by: String!
    next_due_date: String
    notes: String
  }

  type ConditionReport {
    id: ID!
    asset_id: ID!
    report_date: String!
    rating: Int!
    checklist: JSON
    notes: String
    gps_lat: Float
    gps_lng: Float
    created_by_email: String
    created_at: String!
  }

  extend type RentalContract {
    asset_id: ID
    asset_name: String
    project_id: ID
    project_name: String
    client_name: String
    client_contact: String
    end_date: String
    deposit_amount: Float
    currency_code: String
    notes: String
    depreciation_method: String
    depreciation_per_day: Float
    useful_life_days: Int
    salvage_value: Float
    usageLogs: [UsageLog!]
    invoices: [RentalInvoice!]
  }

  type RentalInvoice {
    id: ID!
    invoice_number: String!
    contract_id: ID!
    billing_period_start: String!
    billing_period_end: String!
    days_billed: Float!
    rate_amount: Float!
    total_amount: Float!
    whtApplies: Boolean!
    whtScenario: String
    whtRate: Float!
    whtAmount: Float!
    status: String!
    invoice_date: String!
    due_date: String!
    paid_at: String
  }

  input EquipmentAssetInput {
    asset_number: String
    name: String!
    description: String
    category: String
    serial_number: String
    purchase_date: String
    purchase_price: Float
    daily_rate: Float!
    currency_code: String
    maintenance_due_hours: Float
    status: String
  }

  input UsageLogInput {
    asset_id: ID!
    usage_date: String!
    hours_used: Float!
    mileage_km: Float
    operator_name: String!
    notes: String
  }

  input MaintenanceScheduleInput {
    asset_id: ID!
    maintenance_type: String!
    scheduled_date: String!
    description: String
    estimated_cost: Float
    assigned_to: String
  }

  input MaintenanceRecordInput {
    asset_id: ID!
    maintenance_type: String!
    performed_date: String!
    description: String!
    cost: Float!
    performed_by: String!
    next_due_date: String
    notes: String
  }

  input ConditionReportInput {
    asset_id: ID!
    report_date: String!
    rating: Int!
    checklist: JSON
    notes: String
    gps_lat: Float
    gps_lng: Float
  }

  input RentalContractInput {
    asset_id: ID!
    project_id: ID
    client_name: String!
    client_contact: String
    rental_type: String!
    billing_cycle: String!
    rate_amount: Float!
    currency_code: String
    start_date: String!
    end_date: String
    deposit_amount: Float
    notes: String
    depreciation_method: String
    depreciation_per_day: Float
    useful_life_days: Int
    salvage_value: Float
  }

  extend type Query {
    equipmentAsset(id: ID!): EquipmentAsset
    maintenanceSchedules(assetId: ID, status: String, fromDate: String, toDate: String): [MaintenanceSchedule!]!
    maintenanceRecords(assetId: ID): [MaintenanceRecord!]!
    rentalContract(id: ID!): RentalContract
    rentalInvoices(contractId: ID, status: String): [RentalInvoice!]!
    overdueMaintenanceCount: Int!
  }

  extend type Mutation {
    createEquipmentAsset(input: EquipmentAssetInput!): EquipmentAsset!
    updateEquipmentAsset(id: ID!, input: EquipmentAssetInput!): EquipmentAsset!
    logUsage(input: UsageLogInput!): UsageLog!
    scheduleMaintenanceItem(input: MaintenanceScheduleInput!): MaintenanceSchedule!
    recordMaintenance(input: MaintenanceRecordInput!): MaintenanceRecord!
    submitConditionReport(input: ConditionReportInput!): ConditionReport!
    createRentalContract(input: RentalContractInput!): RentalContract!
    updateRentalContract(id: ID!, input: RentalContractInput!): RentalContract!
    activateRentalContract(id: ID!): RentalContract!
    closeRentalContract(id: ID!, notes: String): RentalContract!
    generateRentalInvoice(contractId: ID!, periodStart: String!, periodEnd: String!, whtApplies: Boolean, whtScenario: String, whtRate: Float): RentalInvoice!
  }

  # ─── Phase 5: Reporting ───────────────────────────────────────────────────

  type RevenueTrendPoint { period: String! value: Float! }
  type EntityBreakdown { companyId: String! companyName: String! revenueThisMonth: Float! costThisMonth: Float! netThisMonth: Float! headcount: Int! }
  type RevenueByEntity { month: String! yakam: Float! factory: Float! watanyia: Float! }
  type ProjectScatter { id: ID! name: String! budget: Float! marginPct: Float! actualCost: Float! status: String! client_name: String }

  type ExecutiveDashboardData {
    totalRevenue: Float!
    totalCosts: Float!
    netProfit: Float!
    activeProjects: Int!
    totalProjectBudget: Float!
    totalHeadcount: Int!
    openPOsValue: Float!
    revenueTrend: [RevenueTrendPoint!]!
    costsTrend: [RevenueTrendPoint!]!
    profitTrend: [RevenueTrendPoint!]!
    entityBreakdown: [EntityBreakdown!]!
    revenueByEntityMonthly: [RevenueByEntity!]!
    projectProfitabilityScatter: [ProjectScatter!]!
  }

  type ConsolidatedRow {
    accountType: String!
    accountCode: String!
    accountName: String!
    companies: JSON!
    consolidated: Float!
    eliminated: Float!
  }

  type CompanyRef { id: ID! name: String! }

  type ConsolidatedPLResult {
    rows: [ConsolidatedRow!]!
    companies: [CompanyRef!]!
    currency: String!
    totalRevenue: Float!
    totalExpenses: Float!
    netProfit: Float!
  }

  type ConsolidatedBSResult {
    rows: [ConsolidatedRow!]!
    companies: [CompanyRef!]!
    currency: String!
    totalAssets: Float!
    totalLiabilities: Float!
    totalEquity: Float!
    isBalanced: Boolean!
  }

  type ConsolidatedTBResult {
    rows: [ConsolidatedRow!]!
    companies: [CompanyRef!]!
    currency: String!
    totalDebits: Float!
    totalCredits: Float!
    isBalanced: Boolean!
  }

  type CostBreakdownItem { key: String! label: String! amount: Float! }

  type ProjectProfitRow {
    id: ID!
    code: String!
    name: String!
    projectType: String
    companyName: String!
    budget: Float!
    actualCost: Float!
    revenue: Float!
    margin: Float!
    marginPct: Float!
    status: String!
    costBreakdown: [CostBreakdownItem!]!
  }

  type PayrollCostRow { companyName: String! costCenter: String period: String! headcount: Int! totalGross: Float! totalNet: Float! totalIQD: Float! }
  type ByCurrency { currency: String! amount: Float! fxRate: Float! iqdEquivalent: Float! }
  type MonthlyEntityTrend { month: String! yakam: Float factory: Float watanyia: Float }
  type PayrollCostReport {
    rows: [PayrollCostRow!]!
    totalHeadcount: Int!
    totalGross: Float!
    totalNet: Float!
    totalEmployerCost: Float!
    avgCostPerEmployee: Float!
    byCurrency: [ByCurrency!]!
    monthlyTrend: [MonthlyEntityTrend!]!
  }

  type AttendanceRow { employeeName: String! employeeNumber: String! department: String period: String totalPresent: Int! totalAbsent: Int! totalLeave: Int! totalOvertime: Float! attendancePct: Float! }
  type AttendanceSummary { rows: [AttendanceRow!]! totalEmployees: Int! avgAttendancePct: Float! }

  type InventoryValRow { productName: String! sku: String locationName: String! locationType: String! qtyOnHand: Float! avgCost: Float! totalValue: Float! currency: String! }
  type LocationValue { locationName: String! locationType: String! totalValue: Float! }
  type InventoryValuation { rows: [InventoryValRow!]! totalValue: Float! totalProducts: Int! totalLocations: Int! lowStockItems: Int! byLocation: [LocationValue!]! }

  type WHTRow { vendorName: String! taxId: String whtType: String! rate: Float! paymentAmount: Float! whtAmount: Float! period: String! }
  type WHTReport { rows: [WHTRow!]! totalWHT: Float! vendorCount: Int! totalPaymentsSubjectToWHT: Float! }

  type FXExposureRow { currency: String! openAR: Float! openAP: Float! netExposure: Float! fxRate: Float! iqdEquivalent: Float! }
  type FXExposureReport { rows: [FXExposureRow!]! totalIQDExposure: Float! }

  type PayrollTaxRow { employeeName: String! employeeNumber: String! period: String! grossPay: Float! taxableIncome: Float! incomeTaxWithheld: Float! socialSecurity: Float! netPay: Float! }
  type PayrollTaxReport { rows: [PayrollTaxRow!]! }

  # ─── Phase 5: Inter-company ───────────────────────────────────────────────

  type IntercoTransactionItem {
    id: ID!
    reference: String!
    transactionType: String!
    fromCompanyName: String!
    toCompanyName: String!
    amount: Float!
    currencyCode: String!
    status: String!
    createdAt: String!
  }

  type IntercoTransactionPage { items: [IntercoTransactionItem!]! total: Int! page: Int! limit: Int! }

  type IntercoTransactionDetail {
    id: ID!
    reference: String!
    transactionType: String!
    fromCompanyId: String!
    fromCompanyName: String!
    toCompanyId: String!
    toCompanyName: String!
    amount: Float!
    currencyCode: String!
    description: String
    fromAccountId: String
    fromAccountName: String
    toAccountId: String
    toAccountName: String
    status: String!
    postedAt: String
    postedBy: String
    fromJournalId: ID
    toJournalId: ID
    createdAt: String!
    fromCompanyApprovedBy: String
    fromCompanyApprovedAt: String
    toCompanyApprovedBy: String
    toCompanyApprovedAt: String
  }

  type IntercoTransactionCreated { id: ID! reference: String! status: String! }

  type IntercoStockTransferItem {
    id: ID!
    transferNumber: String!
    fromCompanyName: String!
    toCompanyName: String!
    totalValue: Float!
    pricingMethod: String!
    status: String!
    transferDate: String!
  }

  type IntercoStockTransferPage { items: [IntercoStockTransferItem!]! total: Int! page: Int! limit: Int! }

  type IntercoTransferLine {
    id: ID!
    productName: String!
    sku: String
    qty: Float!
    avcoAtTransfer: Float!
    transferPrice: Float!
    markupPct: Float!
    totalValue: Float!
  }

  type IntercoStockTransferDetail {
    id: ID!
    transferNumber: String!
    fromCompanyId: String!
    fromCompanyName: String!
    toCompanyId: String!
    toCompanyName: String!
    pricingMethod: String!
    status: String!
    transferDate: String!
    fromStockMoveId: ID
    toStockMoveId: ID
    fromJournalId: ID
    toJournalId: ID
    lines: [IntercoTransferLine!]!
  }

  type IntercoPricingSettings {
    companyId: ID!
    companyName: String!
    method: String!
    costPlusMarkupPct: Float
    updatedAt: String
    updatedByEmail: String
  }

  type IntercoPricingHistory {
    previousMethod: String!
    newMethod: String!
    changedBy: String!
    changedAt: String!
    notes: String
  }

  input IntercoTransactionInput {
    fromCompanyId: ID!
    toCompanyId: ID!
    transactionType: String!
    amount: Float!
    currencyCode: String!
    description: String
    reference: String
    fromAccountId: ID
    toAccountId: ID
  }

  input IntercoPricingInput {
    method: String!
    costPlusMarkupPct: Float
    notes: String
  }

  # ─── Phase 5: Admin ────────────────────────────────────────────────────────

  type UserRole { id: ID! companyId: ID companyName: String module: String role: String! isActive: Boolean! }
  type UserItem { id: ID! email: String! isActive: Boolean! mfaEnabled: Boolean! lastLogin: String activeSessions: Int! companies: [String!]! roles: [UserRole!]! }
  type UserPage { items: [UserItem!]! total: Int! page: Int! limit: Int! }
  type UserDetail { id: ID! email: String! isActive: Boolean! mfaEnabled: Boolean! lastLogin: String failedLoginAttempts: Int! lockedUntil: String createdAt: String! roles: [UserRole!]! }
  type UserSession { id: ID! deviceName: String platform: String ipAddress: String! createdAt: String! expiresAt: String lastActive: String isCurrent: Boolean! }

  type OutboxMonitorStatus {
    status: String!
    pendingCount: Int!
    failedCount: Int!
    processingCount: Int!
    stuckCount: Int!
    deliveredToday: Int!
  }

  type EventConfig {
    eventType: String!
    service: String!
    maxAttempts: Int!
    initialRetryDelaySeconds: Int!
    backoffMultiplier: Float!
    maxRetryDelaySeconds: Int!
    dlqPriority: String!
    alertOnDlq: Boolean!
  }

  type ServiceChecks {
    database: String!
    redis: String!
    outbox: String!
  }

  type ServiceHealth {
    service: String!
    status: String!
    latencyMs: Int
    checks: ServiceChecks!
    uptime: Float
    lastChecked: String!
  }

  type AuditEntry {
    id: ID!
    createdAt: String!
    userEmail: String!
    companyName: String
    action: String!
    tableName: String
    recordId: String
    ipAddress: String
    oldValues: JSON
    newValues: JSON
  }

  type AuditLogPage { items: [AuditEntry!]! total: Int! page: Int! limit: Int! }

  input RoleInput { companyId: ID! module: String! role: String! isActive: Boolean }
  input EventConfigInput { maxAttempts: Int initialRetryDelaySeconds: Int backoffMultiplier: Float maxRetryDelaySeconds: Int dlqPriority: String alertOnDlq: Boolean }

  # ─── Phase 5: Settings ────────────────────────────────────────────────────

  type MyProfile { id: ID! email: String! mfaEnabled: Boolean! lastLogin: String createdAt: String! }
  type MyPreferences { themePreference: String dateFormat: String numberFormat: String notificationPreferences: JSON }
  type MySession { id: ID! deviceName: String platform: String ipAddress: String! createdAt: String! lastActive: String isCurrent: Boolean! }
  type MFASetup { secret: String! otpauthUrl: String! }

  input PreferencesInput { themePreference: String dateFormat: String numberFormat: String notificationPreferences: JSON }

  extend type Query {
    executiveDashboard: ExecutiveDashboardData!
    consolidatedPL(fromDate: String!, toDate: String!, showEliminations: Boolean): ConsolidatedPLResult!
    consolidatedBS(asOfDate: String!, showEliminations: Boolean): ConsolidatedBSResult!
    projectProfitabilityReport(companyId: ID, status: [String], projectType: String, fromDate: String, toDate: String): [ProjectProfitRow!]!
    payrollCostReport(fromDate: String!, toDate: String!, companyId: ID, departmentId: ID): PayrollCostReport!
    attendanceSummaryReport(fromDate: String!, toDate: String!, companyId: ID): AttendanceSummary!
    inventoryValuationReport(asOfDate: String!, companyId: ID, locationId: ID): InventoryValuation!
    whtReport(fromDate: String!, toDate: String!, companyId: ID!): WHTReport!
    fxExposureReport(asOfDate: String!, companyId: ID!): FXExposureReport!
    payrollTaxReport(fromDate: String!, toDate: String!, companyId: ID!): PayrollTaxReport!

    intercoTransaction(id: ID!): IntercoTransactionDetail
    intercoPricingConfigHistory(companyId: ID!): [IntercoPricingHistory!]!

    users(search: String, isActive: Boolean, companyId: ID, page: Int, limit: Int): UserPage!
    user(id: ID!): UserDetail
    userSessions(userId: ID!): [UserSession!]!
    systemHealth: [ServiceHealth!]!
    auditLog(userId: ID, companyId: ID, tableName: String, action: String, recordId: ID, fromDate: String, toDate: String, page: Int, limit: Int): AuditLogPage!

    myProfile: MyProfile!
    myPreferences: MyPreferences!
    mySessions: [MySession!]!

    dashboardKPIs(companyId: ID!): DashboardKPIs!
    recentPurchaseOrders(companyId: ID!, limit: Int): [DashboardPO!]!
    activityFeed(companyId: ID!, limit: Int): [ActivityEvent!]!
    spendByCategory(companyId: ID!): [SpendCategory!]!
    revenueVsTarget(companyId: ID!): [RevenueMonth!]!
  }

  type DashboardKPIs {
    revenue: Float!
    openPOs: Int!
    activeProjects: Int!
    headcount: Int!
    revenueDelta: Float!
    openPOsDelta: Int!
  }

  type DashboardPO {
    id: ID!
    number: String!
    vendor: String!
    amount: Float!
    currency: String!
    status: String!
    date: String!
  }

  type ActivityEvent {
    id: ID!
    action: String!
    entity: String!
    user: String!
    timestamp: String!
  }

  type SpendCategory {
    category: String!
    amount: Float!
  }

  type RevenueMonth {
    month: String!
    revenue: Float!
  }

  input IntercoStockTransferLineInput {
    product_id: ID!
    from_location_id: ID!
    to_location_id: ID!
    qty: Float!
    unit_cost: Float
  }

  input IntercoStockTransferInput {
    to_company_id: ID!
    transfer_date: String!
    notes: String
    lines: [IntercoStockTransferLineInput!]!
  }

  extend type Mutation {
    createIntercoStockTransfer(input: IntercoStockTransferInput!): IntercoStockTransferDetail!
    createIntercoTransaction(input: IntercoTransactionInput!): IntercoTransactionCreated!
    postIntercoTransaction(id: ID!): IntercoTransactionDetail!
    setIntercoTransactionAccount(id: ID!, accountId: ID!): IntercoTransactionDetail!
    approveIntercoCompany(id: ID!): IntercoTransactionDetail!
    cancelIntercoTransaction(id: ID!): IntercoTransactionDetail!
    updateIntercoPricing(companyId: ID!, input: IntercoPricingInput!): IntercoPricingSettings!

    addUserRole(userId: ID!, input: RoleInput!): UserRole!
    updateUserRole(roleId: ID!, input: RoleInput!): UserRole!
    removeUserRole(roleId: ID!): Boolean!
    deactivateUser(userId: ID!): UserDetail!
    unlockUser(userId: ID!): UserDetail!
    resetUserMFA(userId: ID!): Boolean!
    revokeUserSession(sessionId: ID!): Boolean!
    revokeAllUserSessions(userId: ID!): Boolean!
    updateOutboxEventConfig(eventType: String!, input: EventConfigInput!): EventConfig!

    updatePassword(currentPassword: String!, newPassword: String!): Boolean!
    updatePreferences(input: PreferencesInput!): MyPreferences!
    enableMFA: MFASetup!
    confirmMFA(totpCode: String!): Boolean!
    disableMFA(password: String!): Boolean!
    revokeMySession(sessionId: ID!): Boolean!
    revokeAllMySessions: Boolean!
  }

  # ─── Fix 2B: Admin Management ─────────────────────────────────────────────

  type UserInvitation {
    id: ID!
    email: String!
    invitedByEmail: String
    companyId: ID
    companyName: String
    role: String
    module: String
    status: String!
    expiresAt: String!
    acceptedAt: String
    createdAt: String!
  }

  type CompanyConfiguration {
    companyId: ID!
    fiscalYearStartMonth: Int!
    fiscalYearStartDay: Int!
    defaultCurrency: String!
    defaultPaymentTermsDays: Int!
    defaultPOCurrency: String!
    incomeTaxEnabled: Boolean!
    socialSecurityRate: Float!
    employerSocialSecurityRate: Float!
    defaultWHTRate: Float!
    companyEmailFrom: String
    companyEmailSignature: String
    setupCompleted: Boolean!
  }

  type CompanyDetail {
    id: ID!
    name: String!
    legalName: String
    countryCode: String
    city: String
    address: String
    phone: String
    email: String
    website: String
    registrationNumber: String
    vatNumber: String
    currencyCode: String!
    bankName: String
    bankAccount: String
    bankIban: String
    bankSwift: String
    intercoTransferPricingMethod: String
    isActive: Boolean!
    setupCompleted: Boolean!
    stampImage: String
    letterheadImage: String
    pvTemplateImage: String
    journalTemplateImage: String
    configuration: CompanyConfiguration
    userCount: Int
    createdAt: String!
  }

  type CompanyUserRole {
    id: ID!
    role: String!
    module: String
    isActive: Boolean!
  }

  type CompanyUser {
    id: ID!
    email: String!
    isActive: Boolean!
    lastLoginAt: String
    roles: [CompanyUserRole!]!
  }

  input CreateUserInput {
    email: String!
    password: String
    send_invitation: Boolean
    company_id: ID
    role: String
    module: String
  }

  input InviteUserInput {
    email: String!
    company_id: ID
    role: String
    module: String
  }

  input CreateCompanyInput {
    name: String!
    legal_name: String!
    country_code: String
    city: String
    address: String
    phone: String
    email: String
    website: String
    registration_number: String
    vat_number: String
    functional_currency: String
    bank_name: String
    bank_account: String
    bank_iban: String
    bank_swift: String
    interco_transfer_pricing_method: String
  }

  input UpdateCompanyInput {
    name: String
    legal_name: String
    country_code: String
    city: String
    address: String
    phone: String
    email: String
    website: String
    registration_number: String
    vat_number: String
    bank_name: String
    bank_account: String
    bank_iban: String
    bank_swift: String
    interco_transfer_pricing_method: String
    interco_cost_plus_markup_pct: Float
    is_active: Boolean
    stamp_image: String
    letterhead_image: String
    pv_template_image: String
    journal_template_image: String
  }

  input CompanyConfigInput {
    fiscal_year_start_month: Int
    fiscal_year_start_day: Int
    default_currency: String
    default_payment_terms_days: Int
    default_po_currency: String
    income_tax_enabled: Boolean
    social_security_rate: Float
    employer_social_security_rate: Float
    default_wht_rate: Float
    company_email_from: String
    company_email_signature: String
  }

  input AssignRoleInput {
    user_id: ID!
    company_id: ID!
    role: String!
    module: String
  }

  extend type Query {
    companies: [CompanyDetail!]!
    company(id: ID!): CompanyDetail
    companyUsers(companyId: ID!): [CompanyUser!]!
    userInvitations(companyId: ID, status: String): [UserInvitation!]!
    roleAssignments(userId: ID, companyId: ID): [UserRole!]!
  }

  extend type Mutation {
    createUser(input: CreateUserInput!): UserDetail!
    inviteUser(input: InviteUserInput!): UserInvitation!
    activateUser(userId: ID!): UserDetail!
    createCompany(input: CreateCompanyInput!): CompanyDetail!
    updateCompany(id: ID!, input: UpdateCompanyInput!): CompanyDetail!
    updateCompanyConfiguration(companyId: ID!, input: CompanyConfigInput!): CompanyConfiguration!
    assignRole(input: AssignRoleInput!): UserRole!
    toggleRole(roleId: ID!, isActive: Boolean!): UserRole!
    deleteRole(roleId: ID!): Boolean!
  }

  # ── Company branches ────────────────────────────────────────────────────────
  type CompanyBranch {
    id: ID!
    companyId: ID!
    name: String!
    address: String
    city: String
    countryCode: String!
    phone: String
    isActive: Boolean!
    createdAt: String!
  }

  input CompanyBranchInput {
    name: String!
    address: String
    city: String
    countryCode: String
    phone: String
    isActive: Boolean
  }

  # ── Bank accounts ───────────────────────────────────────────────────────────
  type BankAccount {
    id: ID!
    accountName: String!
    bankName: String!
    beneficiaryName: String
    accountNumber: String
    iban: String
    swift: String
    branchCode: String
    bankAddress: String
    intermediaryBankName: String
    intermediarySwift: String
    intermediaryCountry: String
    currencyCode: String!
    isActive: Boolean!
    createdAt: String!
  }

  input BankAccountInput {
    accountName: String!
    bankName: String!
    beneficiaryName: String
    accountNumber: String
    iban: String
    swift: String
    branchCode: String
    bankAddress: String
    intermediaryBankName: String
    intermediarySwift: String
    intermediaryCountry: String
    currencyCode: String
    isActive: Boolean
  }

  extend type Query {
    companyBranches(companyId: ID!): [CompanyBranch!]!
    bankAccounts: [BankAccount!]!
  }

  extend type Mutation {
    createCompanyBranch(companyId: ID!, input: CompanyBranchInput!): CompanyBranch!
    updateCompanyBranch(id: ID!, input: CompanyBranchInput!): CompanyBranch!
    deleteCompanyBranch(id: ID!): Boolean!
    createBankAccount(input: BankAccountInput!): BankAccount!
    updateBankAccount(id: ID!, input: BankAccountInput!): BankAccount!
    deleteBankAccount(id: ID!): Boolean!
    setInvoiceBankAccount(invoiceId: ID!, bankAccountId: ID): Boolean!
    setInvoicePaymentType(invoiceId: ID!, paymentType: String!): Boolean!
  }

  # ─── Permission System ────────────────────────────────────────────────────────

  type UserPermEntry {
    key: String!
    label: String!
    module: String!
    submodule: String!
    accessLevel: String!
  }

  type UserPermissionsResult {
    userId: ID!
    companyId: ID!
    isAdmin: Boolean!
    permissions: [UserPermEntry!]!
  }

  type RoleTemplatePermEntry {
    key: String!
    accessLevel: String!
  }

  type RoleTemplate {
    id: ID!
    name: String!
    description: String
    isSystem: Boolean!
    createdAt: String!
    permissions: [RoleTemplatePermEntry!]!
  }

  input SaveUserPermissionsInput {
    userId: ID!
    companyId: ID!
    permissions: JSON!
  }

  input RoleTemplateInput {
    name: String!
    description: String
    permissions: JSON!
  }

  extend type Query {
    userPermissions(userId: ID!, companyId: ID!): UserPermissionsResult!
    userCompanies(userId: ID!): [CompanyRef!]!
    roleTemplates: [RoleTemplate!]!
    roleTemplate(id: ID!): RoleTemplate
    userPOPositions(userId: ID!): [POPositionAssignment!]!
  }

  extend type Mutation {
    saveUserPermissions(input: SaveUserPermissionsInput!): UserPermissionsResult!
    createRoleTemplate(input: RoleTemplateInput!): RoleTemplate!
    updateRoleTemplate(id: ID!, input: RoleTemplateInput!): RoleTemplate!
    deleteRoleTemplate(id: ID!): Boolean!
  }
`
