export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  JSON: { input: unknown; output: unknown; }
};

export type Account = {
  account_category?: Maybe<Scalars['String']['output']>;
  account_type: Scalars['String']['output'];
  code: Scalars['String']['output'];
  currency_code: Scalars['String']['output'];
  group_account_id?: Maybe<Scalars['ID']['output']>;
  group_code?: Maybe<Scalars['String']['output']>;
  group_name?: Maybe<Scalars['String']['output']>;
  has_posted_lines?: Maybe<Scalars['Boolean']['output']>;
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  is_control_account?: Maybe<Scalars['Boolean']['output']>;
  is_header?: Maybe<Scalars['Boolean']['output']>;
  is_postable?: Maybe<Scalars['Boolean']['output']>;
  is_reconcilable?: Maybe<Scalars['Boolean']['output']>;
  name: Scalars['String']['output'];
  parent_id?: Maybe<Scalars['ID']['output']>;
  parent_name?: Maybe<Scalars['String']['output']>;
};

export type AccountInput = {
  account_category?: InputMaybe<Scalars['String']['input']>;
  account_type: Scalars['String']['input'];
  code: Scalars['String']['input'];
  currency_code?: InputMaybe<Scalars['String']['input']>;
  group_account_id?: InputMaybe<Scalars['ID']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  is_control_account?: InputMaybe<Scalars['Boolean']['input']>;
  is_header?: InputMaybe<Scalars['Boolean']['input']>;
  is_postable?: InputMaybe<Scalars['Boolean']['input']>;
  is_reconcilable?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  parent_id?: InputMaybe<Scalars['ID']['input']>;
};

export type AccountLedgerLine = {
  credit: Scalars['String']['output'];
  date: Scalars['String']['output'];
  debit: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  journal_entry_id: Scalars['ID']['output'];
  reference?: Maybe<Scalars['String']['output']>;
  running_balance: Scalars['String']['output'];
};

export type AccountLedgerPage = {
  items: Array<AccountLedgerLine>;
  limit: Scalars['Int']['output'];
  netBalance: Scalars['String']['output'];
  page: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalCredit: Scalars['String']['output'];
  totalDebit: Scalars['String']['output'];
};

export type AccountingPeriod = {
  closed_at?: Maybe<Scalars['String']['output']>;
  closed_by_email?: Maybe<Scalars['String']['output']>;
  end_date: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  start_date: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type ActivityDependency = {
  dependencyType: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lagDays: Scalars['Int']['output'];
  predecessorCode?: Maybe<Scalars['String']['output']>;
  predecessorId: Scalars['ID']['output'];
  successorCode?: Maybe<Scalars['String']['output']>;
  successorId: Scalars['ID']['output'];
};

export type ActivityEvent = {
  action: Scalars['String']['output'];
  entity: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  timestamp: Scalars['String']['output'];
  user: Scalars['String']['output'];
};

export type ActivityImportInput = {
  activityCode: Scalars['String']['input'];
  activityType?: InputMaybe<Scalars['String']['input']>;
  budgetAmount?: InputMaybe<Scalars['Float']['input']>;
  durationDays?: InputMaybe<Scalars['Int']['input']>;
  name: Scalars['String']['input'];
  plannedFinish?: InputMaybe<Scalars['String']['input']>;
  plannedStart?: InputMaybe<Scalars['String']['input']>;
  responsible?: InputMaybe<Scalars['String']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  wbsCode?: InputMaybe<Scalars['String']['input']>;
};

export type ActivityResourceAssignment = {
  activityId: Scalars['ID']['output'];
  actualCost?: Maybe<Scalars['Float']['output']>;
  actualUnits?: Maybe<Scalars['Float']['output']>;
  budgetedCost?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  resourceId: Scalars['ID']['output'];
  resourceName?: Maybe<Scalars['String']['output']>;
  totalUnits?: Maybe<Scalars['Float']['output']>;
  unit?: Maybe<Scalars['String']['output']>;
  unitsPerDay: Scalars['Float']['output'];
};

export type AnalyticAccount = {
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type AssignRoleInput = {
  company_id: Scalars['ID']['input'];
  module?: InputMaybe<Scalars['String']['input']>;
  role: Scalars['String']['input'];
  user_id: Scalars['ID']['input'];
};

export type AttendanceDaySummary = {
  date: Scalars['String']['output'];
  hasOvertime: Scalars['Boolean']['output'];
  hoursWorked?: Maybe<Scalars['Float']['output']>;
  isAbsent: Scalars['Boolean']['output'];
  isLeave: Scalars['Boolean']['output'];
  isWeekend: Scalars['Boolean']['output'];
  leaveTypeName?: Maybe<Scalars['String']['output']>;
};

export type AttendanceLog = {
  distance_from_location_m?: Maybe<Scalars['String']['output']>;
  employee_id: Scalars['ID']['output'];
  employee_name?: Maybe<Scalars['String']['output']>;
  geofence_valid?: Maybe<Scalars['Boolean']['output']>;
  id: Scalars['ID']['output'];
  punch_type: Scalars['String']['output'];
  punched_at: Scalars['String']['output'];
  work_location_id?: Maybe<Scalars['ID']['output']>;
};

export type AttendanceRow = {
  attendancePct: Scalars['Float']['output'];
  department?: Maybe<Scalars['String']['output']>;
  employeeName: Scalars['String']['output'];
  employeeNumber: Scalars['String']['output'];
  period?: Maybe<Scalars['String']['output']>;
  totalAbsent: Scalars['Int']['output'];
  totalLeave: Scalars['Int']['output'];
  totalOvertime: Scalars['Float']['output'];
  totalPresent: Scalars['Int']['output'];
};

export type AttendanceSummary = {
  avgAttendancePct: Scalars['Float']['output'];
  rows: Array<AttendanceRow>;
  totalEmployees: Scalars['Int']['output'];
};

export type AuditEntry = {
  action: Scalars['String']['output'];
  companyName?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  ipAddress?: Maybe<Scalars['String']['output']>;
  newValues?: Maybe<Scalars['JSON']['output']>;
  oldValues?: Maybe<Scalars['JSON']['output']>;
  recordId?: Maybe<Scalars['String']['output']>;
  tableName?: Maybe<Scalars['String']['output']>;
  userEmail: Scalars['String']['output'];
};

export type AuditLogEntry = {
  action: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  newValues?: Maybe<Scalars['String']['output']>;
  oldValues?: Maybe<Scalars['String']['output']>;
  recordId?: Maybe<Scalars['ID']['output']>;
  tableName?: Maybe<Scalars['String']['output']>;
  userEmail?: Maybe<Scalars['String']['output']>;
};

export type AuditLogPage = {
  items: Array<AuditEntry>;
  limit: Scalars['Int']['output'];
  page: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type AvailableCosts = {
  manufacturing_orders: Array<AvailableMo>;
  milestones: Array<ProjectMilestone>;
  purchase_orders: Array<AvailablePo>;
  rental: Array<AvailableRental>;
  stock_issues: Array<AvailableStockIssue>;
};

export type AvailableMo = {
  actual_cost: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  mo_number: Scalars['String']['output'];
  product_name: Scalars['String']['output'];
  qty_produced: Scalars['Float']['output'];
};

export type AvailablePo = {
  id: Scalars['ID']['output'];
  po_number: Scalars['String']['output'];
  vendor_name: Scalars['String']['output'];
};

export type AvailableRental = {
  amount: Scalars['Float']['output'];
  contract_number: Scalars['String']['output'];
  days_billed: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
};

export type AvailableStockIssue = {
  id: Scalars['ID']['output'];
  issue_number: Scalars['String']['output'];
  product_name: Scalars['String']['output'];
  qty_issued: Scalars['Float']['output'];
  unit_cost: Scalars['Float']['output'];
};

export type Bom = {
  company_id: Scalars['ID']['output'];
  finished_product_id: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  lines?: Maybe<Array<BomLine>>;
  notes?: Maybe<Scalars['String']['output']>;
  product_name?: Maybe<Scalars['String']['output']>;
  qty_produced: Scalars['String']['output'];
  version: Scalars['String']['output'];
};

export type BomInput = {
  finished_product_id: Scalars['ID']['input'];
  lines: Array<BomLineInput>;
  name?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  qty_produced: Scalars['Float']['input'];
  version: Scalars['String']['input'];
};

export type BomLine = {
  component_name?: Maybe<Scalars['String']['output']>;
  component_product_id: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  qty: Scalars['Float']['output'];
  sequence: Scalars['Int']['output'];
  unit_cost?: Maybe<Scalars['Float']['output']>;
  uom: Scalars['String']['output'];
};

export type BomLineInput = {
  component_product_id: Scalars['ID']['input'];
  qty: Scalars['Float']['input'];
  sequence?: InputMaybe<Scalars['Int']['input']>;
  unit_cost?: InputMaybe<Scalars['Float']['input']>;
  uom: Scalars['String']['input'];
};

export type BsLine = {
  account_id: Scalars['ID']['output'];
  amount: Scalars['String']['output'];
  code: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type BalanceSheetReport = {
  assets: Array<BsLine>;
  equity: Array<BsLine>;
  isBalanced: Scalars['Boolean']['output'];
  liabilities: Array<BsLine>;
  retainedEarnings: Scalars['String']['output'];
  totalAssets: Scalars['String']['output'];
  totalEquity: Scalars['String']['output'];
  totalLiabilities: Scalars['String']['output'];
};

export type BankAccount = {
  accountName: Scalars['String']['output'];
  accountNumber?: Maybe<Scalars['String']['output']>;
  bankAddress?: Maybe<Scalars['String']['output']>;
  bankName: Scalars['String']['output'];
  beneficiaryName?: Maybe<Scalars['String']['output']>;
  branchCode?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  iban?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  intermediaryBankName?: Maybe<Scalars['String']['output']>;
  intermediaryCountry?: Maybe<Scalars['String']['output']>;
  intermediarySwift?: Maybe<Scalars['String']['output']>;
  isActive: Scalars['Boolean']['output'];
  swift?: Maybe<Scalars['String']['output']>;
};

export type BankAccountInput = {
  accountName: Scalars['String']['input'];
  accountNumber?: InputMaybe<Scalars['String']['input']>;
  bankAddress?: InputMaybe<Scalars['String']['input']>;
  bankName: Scalars['String']['input'];
  beneficiaryName?: InputMaybe<Scalars['String']['input']>;
  branchCode?: InputMaybe<Scalars['String']['input']>;
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  iban?: InputMaybe<Scalars['String']['input']>;
  intermediaryBankName?: InputMaybe<Scalars['String']['input']>;
  intermediaryCountry?: InputMaybe<Scalars['String']['input']>;
  intermediarySwift?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  swift?: InputMaybe<Scalars['String']['input']>;
};

export type BankDetailsInput = {
  account_number?: InputMaybe<Scalars['String']['input']>;
  bank_name?: InputMaybe<Scalars['String']['input']>;
  currency_code?: InputMaybe<Scalars['String']['input']>;
  iban?: InputMaybe<Scalars['String']['input']>;
};

export type BankDetailsResult = {
  account_number?: Maybe<Scalars['String']['output']>;
  bank_name?: Maybe<Scalars['String']['output']>;
  currency_code?: Maybe<Scalars['String']['output']>;
  iban?: Maybe<Scalars['String']['output']>;
};

export type BankDetailsSummary = {
  bank_name?: Maybe<Scalars['String']['output']>;
  currency_code?: Maybe<Scalars['String']['output']>;
  has_account: Scalars['Boolean']['output'];
};

export type BidCommercialSummary = {
  approvalStatus: Scalars['String']['output'];
  approvedAt?: Maybe<Scalars['String']['output']>;
  approvedByName?: Maybe<Scalars['String']['output']>;
  bidPrice: Scalars['Float']['output'];
  contingencyAmount: Scalars['Float']['output'];
  contingencyPct: Scalars['Float']['output'];
  currencyCode: Scalars['String']['output'];
  directCostTotal: Scalars['Float']['output'];
  discountAmount: Scalars['Float']['output'];
  discountPct: Scalars['Float']['output'];
  id?: Maybe<Scalars['ID']['output']>;
  marginAmount: Scalars['Float']['output'];
  marginPct: Scalars['Float']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  overheadAmount: Scalars['Float']['output'];
  overheadPct: Scalars['Float']['output'];
  projectId: Scalars['ID']['output'];
  rejectionReason?: Maybe<Scalars['String']['output']>;
  revision: Scalars['Int']['output'];
  revisions: Array<BidRevision>;
  submittedAt?: Maybe<Scalars['String']['output']>;
  submittedByName?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type BidCostItem = {
  costType: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  quantity?: Maybe<Scalars['Float']['output']>;
  sequence: Scalars['Int']['output'];
  supplierRef?: Maybe<Scalars['String']['output']>;
  totalCost?: Maybe<Scalars['Float']['output']>;
  unit?: Maybe<Scalars['String']['output']>;
  unitCost?: Maybe<Scalars['Float']['output']>;
};

export type BidCostItemInput = {
  costType: Scalars['String']['input'];
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  description: Scalars['String']['input'];
  id?: InputMaybe<Scalars['ID']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  quantity?: InputMaybe<Scalars['Float']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  supplierRef?: InputMaybe<Scalars['String']['input']>;
  totalCost?: InputMaybe<Scalars['Float']['input']>;
  unit?: InputMaybe<Scalars['String']['input']>;
  unitCost?: InputMaybe<Scalars['Float']['input']>;
};

export type BidDeliverable = {
  assignedTo?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  createdByName?: Maybe<Scalars['String']['output']>;
  deliverableType: Scalars['String']['output'];
  discipline?: Maybe<Scalars['String']['output']>;
  dueDate?: Maybe<Scalars['String']['output']>;
  fileCount: Scalars['Int']['output'];
  files: Array<RfqPhaseFile>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  sequence: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type BidPackageFile = {
  bidType: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  downloadUrl?: Maybe<Scalars['String']['output']>;
  fileId: Scalars['String']['output'];
  filename: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  mimeType: Scalars['String']['output'];
  sizeBytes: Scalars['Int']['output'];
  title?: Maybe<Scalars['String']['output']>;
};

export type BidRevision = {
  bidPrice: Scalars['Float']['output'];
  changeSummary: Scalars['String']['output'];
  contingencyAmount: Scalars['Float']['output'];
  contingencyPct: Scalars['Float']['output'];
  createdAt: Scalars['String']['output'];
  createdByName?: Maybe<Scalars['String']['output']>;
  currencyCode: Scalars['String']['output'];
  directCostTotal: Scalars['Float']['output'];
  discountAmount: Scalars['Float']['output'];
  discountPct: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  marginAmount: Scalars['Float']['output'];
  marginPct: Scalars['Float']['output'];
  overheadAmount: Scalars['Float']['output'];
  overheadPct: Scalars['Float']['output'];
  revision: Scalars['Int']['output'];
};

export type BidSupplierQuotation = {
  amount?: Maybe<Scalars['Float']['output']>;
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  downloadUrl?: Maybe<Scalars['String']['output']>;
  fileId?: Maybe<Scalars['String']['output']>;
  filename?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  itemDescription: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  supplierName: Scalars['String']['output'];
  validityDate?: Maybe<Scalars['String']['output']>;
};

export type ByCurrency = {
  amount: Scalars['Float']['output'];
  currency: Scalars['String']['output'];
  fxRate: Scalars['Float']['output'];
  iqdEquivalent: Scalars['Float']['output'];
};

export type CashFlowPeriod = {
  actualInflow: Scalars['Float']['output'];
  actualOutflow: Scalars['Float']['output'];
  cumActualOutflow: Scalars['Float']['output'];
  cumForecastOutflow: Scalars['Float']['output'];
  cumPlannedOutflow: Scalars['Float']['output'];
  forecastInflow: Scalars['Float']['output'];
  forecastOutflow: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  label: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  periodMonth: Scalars['Int']['output'];
  periodYear: Scalars['Int']['output'];
  plannedInflow: Scalars['Float']['output'];
  plannedOutflow: Scalars['Float']['output'];
  projectId: Scalars['ID']['output'];
  updatedAt: Scalars['String']['output'];
};

export type CategoryCostSummary = {
  actualAmount: Scalars['Float']['output'];
  budgetAmount: Scalars['Float']['output'];
  category: Scalars['String']['output'];
  committedAmount: Scalars['Float']['output'];
  forecastEAC: Scalars['Float']['output'];
  variance: Scalars['Float']['output'];
};

export type ClientBilling = {
  billingDate: Scalars['String']['output'];
  billingNumber: Scalars['String']['output'];
  certifiedAmount?: Maybe<Scalars['Float']['output']>;
  certifiedDate?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  grossAmount: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  netAmount: Scalars['Float']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  paidAmount: Scalars['Float']['output'];
  paidDate?: Maybe<Scalars['String']['output']>;
  periodFrom?: Maybe<Scalars['String']['output']>;
  periodTo?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  retentionAmount: Scalars['Float']['output'];
  retentionPercentage: Scalars['Float']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type ClientDocument = {
  category: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  documentNumber?: Maybe<Scalars['String']['output']>;
  downloadUrl?: Maybe<Scalars['String']['output']>;
  fileId?: Maybe<Scalars['ID']['output']>;
  filename?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  mimeType?: Maybe<Scalars['String']['output']>;
  parentDocumentId?: Maybe<Scalars['ID']['output']>;
  previewUrl?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  receivedFrom?: Maybe<Scalars['String']['output']>;
  revision?: Maybe<Scalars['String']['output']>;
  revisions: Array<ClientDocument>;
  sizeBytes?: Maybe<Scalars['Int']['output']>;
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  transmissionDate?: Maybe<Scalars['String']['output']>;
  uploadedById?: Maybe<Scalars['ID']['output']>;
  uploadedByName?: Maybe<Scalars['String']['output']>;
};

export type CommittedCost = {
  commitmentDate?: Maybe<Scalars['String']['output']>;
  commitmentType: Scalars['String']['output'];
  committedAmount: Scalars['Float']['output'];
  costCodeId?: Maybe<Scalars['ID']['output']>;
  costCodeName?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  description: Scalars['String']['output'];
  expectedInvoiceDate?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  invoicedAmount: Scalars['Float']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  paidAmount: Scalars['Float']['output'];
  projectId: Scalars['ID']['output'];
  referenceId?: Maybe<Scalars['ID']['output']>;
  referenceNumber?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
  vendorName?: Maybe<Scalars['String']['output']>;
};

export type CompanyBranch = {
  address?: Maybe<Scalars['String']['output']>;
  city?: Maybe<Scalars['String']['output']>;
  companyId: Scalars['ID']['output'];
  countryCode: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  defaultCostCenterId?: Maybe<Scalars['ID']['output']>;
  defaultProcurementUserEmail?: Maybe<Scalars['String']['output']>;
  defaultProcurementUserId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  phone?: Maybe<Scalars['String']['output']>;
};

export type CompanyBranchInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  countryCode?: InputMaybe<Scalars['String']['input']>;
  defaultProcurementUserId?: InputMaybe<Scalars['ID']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
};

export type CompanyConfigInput = {
  advance_control_parent_account_id?: InputMaybe<Scalars['ID']['input']>;
  company_email_from?: InputMaybe<Scalars['String']['input']>;
  company_email_signature?: InputMaybe<Scalars['String']['input']>;
  default_currency?: InputMaybe<Scalars['String']['input']>;
  default_payment_terms_days?: InputMaybe<Scalars['Int']['input']>;
  default_po_currency?: InputMaybe<Scalars['String']['input']>;
  default_wht_rate?: InputMaybe<Scalars['Float']['input']>;
  employer_social_security_rate?: InputMaybe<Scalars['Float']['input']>;
  fiscal_year_start_day?: InputMaybe<Scalars['Int']['input']>;
  fiscal_year_start_month?: InputMaybe<Scalars['Int']['input']>;
  income_tax_enabled?: InputMaybe<Scalars['Boolean']['input']>;
  social_security_rate?: InputMaybe<Scalars['Float']['input']>;
};

export type CompanyConfiguration = {
  advanceControlParentAccountId?: Maybe<Scalars['ID']['output']>;
  companyEmailFrom?: Maybe<Scalars['String']['output']>;
  companyEmailSignature?: Maybe<Scalars['String']['output']>;
  companyId: Scalars['ID']['output'];
  defaultCurrency: Scalars['String']['output'];
  defaultPOCurrency: Scalars['String']['output'];
  defaultPaymentTermsDays: Scalars['Int']['output'];
  defaultWHTRate: Scalars['Float']['output'];
  employerSocialSecurityRate: Scalars['Float']['output'];
  fiscalYearStartDay: Scalars['Int']['output'];
  fiscalYearStartMonth: Scalars['Int']['output'];
  incomeTaxEnabled: Scalars['Boolean']['output'];
  setupCompleted: Scalars['Boolean']['output'];
  socialSecurityRate: Scalars['Float']['output'];
};

export type CompanyDetail = {
  address?: Maybe<Scalars['String']['output']>;
  bankAccount?: Maybe<Scalars['String']['output']>;
  bankIban?: Maybe<Scalars['String']['output']>;
  bankName?: Maybe<Scalars['String']['output']>;
  bankSwift?: Maybe<Scalars['String']['output']>;
  city?: Maybe<Scalars['String']['output']>;
  configuration?: Maybe<CompanyConfiguration>;
  countryCode?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  email?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  intercoTransferPricingMethod?: Maybe<Scalars['String']['output']>;
  isActive: Scalars['Boolean']['output'];
  journalTemplateImage?: Maybe<Scalars['String']['output']>;
  legalName?: Maybe<Scalars['String']['output']>;
  letterheadImage?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  phone?: Maybe<Scalars['String']['output']>;
  pvTemplateImage?: Maybe<Scalars['String']['output']>;
  registrationNumber?: Maybe<Scalars['String']['output']>;
  setupCompleted: Scalars['Boolean']['output'];
  stampImage?: Maybe<Scalars['String']['output']>;
  userCount?: Maybe<Scalars['Int']['output']>;
  vatNumber?: Maybe<Scalars['String']['output']>;
  website?: Maybe<Scalars['String']['output']>;
};

export type CompanyIntercoPricingSettings = {
  companyId?: Maybe<Scalars['ID']['output']>;
  companyName?: Maybe<Scalars['String']['output']>;
  configHistory: Array<PricingConfigChange>;
  costPlusMarkupPct?: Maybe<Scalars['Float']['output']>;
  method: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['String']['output']>;
  updatedByEmail?: Maybe<Scalars['String']['output']>;
};

export type CompanyRef = {
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type CompanyUser = {
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  lastLoginAt?: Maybe<Scalars['String']['output']>;
  roles: Array<CompanyUserRole>;
};

export type CompanyUserRole = {
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  module?: Maybe<Scalars['String']['output']>;
  role: Scalars['String']['output'];
};

export type ConditionReport = {
  asset_id: Scalars['ID']['output'];
  checklist?: Maybe<Scalars['JSON']['output']>;
  created_at: Scalars['String']['output'];
  created_by_email?: Maybe<Scalars['String']['output']>;
  gps_lat?: Maybe<Scalars['Float']['output']>;
  gps_lng?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  rating: Scalars['Int']['output'];
  report_date: Scalars['String']['output'];
};

export type ConditionReportInput = {
  asset_id: Scalars['ID']['input'];
  checklist?: InputMaybe<Scalars['JSON']['input']>;
  gps_lat?: InputMaybe<Scalars['Float']['input']>;
  gps_lng?: InputMaybe<Scalars['Float']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  rating: Scalars['Int']['input'];
  report_date: Scalars['String']['input'];
};

export type ConsolidatedBsResult = {
  companies: Array<CompanyRef>;
  currency: Scalars['String']['output'];
  isBalanced: Scalars['Boolean']['output'];
  rows: Array<ConsolidatedRow>;
  totalAssets: Scalars['Float']['output'];
  totalEquity: Scalars['Float']['output'];
  totalLiabilities: Scalars['Float']['output'];
};

export type ConsolidatedPlResult = {
  companies: Array<CompanyRef>;
  currency: Scalars['String']['output'];
  netProfit: Scalars['Float']['output'];
  rows: Array<ConsolidatedRow>;
  totalExpenses: Scalars['Float']['output'];
  totalRevenue: Scalars['Float']['output'];
};

export type ConsolidatedRow = {
  accountCode: Scalars['String']['output'];
  accountName: Scalars['String']['output'];
  accountType: Scalars['String']['output'];
  companies: Scalars['JSON']['output'];
  consolidated: Scalars['Float']['output'];
  eliminated: Scalars['Float']['output'];
};

export type ConsolidatedTbResult = {
  companies: Array<CompanyRef>;
  currency: Scalars['String']['output'];
  isBalanced: Scalars['Boolean']['output'];
  rows: Array<ConsolidatedRow>;
  totalCredits: Scalars['Float']['output'];
  totalDebits: Scalars['Float']['output'];
};

export type ConsolidatedTrialBalanceLine = {
  account_code: Scalars['String']['output'];
  account_name: Scalars['String']['output'];
  account_type: Scalars['String']['output'];
  balance_iqd: Scalars['String']['output'];
  company_id: Scalars['ID']['output'];
  company_name: Scalars['String']['output'];
  total_credit_iqd: Scalars['String']['output'];
  total_debit_iqd: Scalars['String']['output'];
};

export type ContractRevision = {
  changeSummary: Scalars['String']['output'];
  contractValue: Scalars['Float']['output'];
  createdAt: Scalars['String']['output'];
  createdByName?: Maybe<Scalars['String']['output']>;
  currencyCode: Scalars['String']['output'];
  effectiveDate?: Maybe<Scalars['String']['output']>;
  endDate?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  retentionPct: Scalars['Float']['output'];
  revision: Scalars['Int']['output'];
};

export type CostBreakdownItem = {
  amount: Scalars['Float']['output'];
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
};

export type CostCenter = {
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type CostCode = {
  actualAmount: Scalars['Float']['output'];
  analyticAccountId?: Maybe<Scalars['ID']['output']>;
  budgetAmount: Scalars['Float']['output'];
  category: Scalars['String']['output'];
  code: Scalars['String']['output'];
  committedAmount: Scalars['Float']['output'];
  createdAt: Scalars['String']['output'];
  forecastEAC: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  percentConsumed: Scalars['Float']['output'];
  projectId: Scalars['ID']['output'];
  remainingBudget: Scalars['Float']['output'];
  sequence: Scalars['Int']['output'];
  updatedAt: Scalars['String']['output'];
  wbsId?: Maybe<Scalars['ID']['output']>;
};

export type CostControlSummary = {
  byCategory: Array<CategoryCostSummary>;
  outstandingReceivable: Scalars['Float']['output'];
  percentConsumed: Scalars['Float']['output'];
  totalActual: Scalars['Float']['output'];
  totalBilled: Scalars['Float']['output'];
  totalBudget: Scalars['Float']['output'];
  totalCertified: Scalars['Float']['output'];
  totalCommitted: Scalars['Float']['output'];
  totalForecastEAC: Scalars['Float']['output'];
  totalPaidByClient: Scalars['Float']['output'];
  totalRemaining: Scalars['Float']['output'];
  totalRetentionHeld: Scalars['Float']['output'];
  totalVariance: Scalars['Float']['output'];
};

export type CostForecast = {
  costCodeId?: Maybe<Scalars['ID']['output']>;
  costCodeName?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  eacAmount: Scalars['Float']['output'];
  etcAmount: Scalars['Float']['output'];
  forecastDate: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
};

export type CostSegment = {
  amount: Scalars['Float']['output'];
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
};

export type CreateCompanyInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  bank_account?: InputMaybe<Scalars['String']['input']>;
  bank_iban?: InputMaybe<Scalars['String']['input']>;
  bank_name?: InputMaybe<Scalars['String']['input']>;
  bank_swift?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  country_code?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  functional_currency?: InputMaybe<Scalars['String']['input']>;
  interco_transfer_pricing_method?: InputMaybe<Scalars['String']['input']>;
  legal_name: Scalars['String']['input'];
  name: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
  registration_number?: InputMaybe<Scalars['String']['input']>;
  vat_number?: InputMaybe<Scalars['String']['input']>;
  website?: InputMaybe<Scalars['String']['input']>;
};

export type CreatePaymentVoucherInput = {
  bank_account_fund?: InputMaybe<Scalars['String']['input']>;
  funding_source_type?: InputMaybe<Scalars['String']['input']>;
  journal_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  lines: Array<PaymentVoucherLineInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
  petty_cash_float_id?: InputMaybe<Scalars['ID']['input']>;
  received_from: Scalars['String']['input'];
  receiver_name?: InputMaybe<Scalars['String']['input']>;
  recon_bank_account_id?: InputMaybe<Scalars['ID']['input']>;
  reference_to?: InputMaybe<Scalars['String']['input']>;
  voucher_date: Scalars['String']['input'];
  voucher_number?: InputMaybe<Scalars['String']['input']>;
};

export type CreateUserInput = {
  company_id?: InputMaybe<Scalars['ID']['input']>;
  email: Scalars['String']['input'];
  module?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  send_invitation?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DlqEntry = {
  createdAt: Scalars['String']['output'];
  errorHistory: Array<DlqErrorEntry>;
  eventType: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastError?: Maybe<Scalars['String']['output']>;
  payload?: Maybe<Scalars['JSON']['output']>;
  priority: Scalars['String']['output'];
  retryOutboxId?: Maybe<Scalars['ID']['output']>;
  reviewNotes?: Maybe<Scalars['String']['output']>;
  reviewedBy?: Maybe<Scalars['String']['output']>;
  reviewedByEmail?: Maybe<Scalars['String']['output']>;
  service: Scalars['String']['output'];
  status: Scalars['String']['output'];
  totalAttempts: Scalars['Int']['output'];
};

export type DlqErrorEntry = {
  at: Scalars['String']['output'];
  attempt: Scalars['Int']['output'];
  error: Scalars['String']['output'];
};

export type DlqPage = {
  items: Array<DlqEntry>;
  limit: Scalars['Int']['output'];
  page: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type DailyReportInput = {
  breakdownDetails?: InputMaybe<Scalars['String']['input']>;
  clientActions?: InputMaybe<Scalars['JSON']['input']>;
  constructionProgress?: InputMaybe<Scalars['JSON']['input']>;
  costStatus?: InputMaybe<Scalars['String']['input']>;
  deliveriesReceived?: InputMaybe<Scalars['JSON']['input']>;
  engineeringDeliverables?: InputMaybe<Scalars['JSON']['input']>;
  engineeringIssues?: InputMaybe<Scalars['String']['input']>;
  engineeringProgress?: InputMaybe<Scalars['JSON']['input']>;
  equipmentUtilization?: InputMaybe<Scalars['JSON']['input']>;
  keyAccomplishments?: InputMaybe<Scalars['String']['input']>;
  lookaheadCommissioning?: InputMaybe<Scalars['String']['input']>;
  lookaheadConstruction?: InputMaybe<Scalars['String']['input']>;
  lookaheadEngineering?: InputMaybe<Scalars['String']['input']>;
  lookaheadProcurement?: InputMaybe<Scalars['String']['input']>;
  majorConcerns?: InputMaybe<Scalars['String']['input']>;
  managementComments?: InputMaybe<Scalars['String']['input']>;
  manpower?: InputMaybe<Scalars['JSON']['input']>;
  ncrStatus?: InputMaybe<Scalars['JSON']['input']>;
  preparedBy?: InputMaybe<Scalars['String']['input']>;
  procurementConcerns?: InputMaybe<Scalars['String']['input']>;
  procurementItems?: InputMaybe<Scalars['JSON']['input']>;
  progressMetrics?: InputMaybe<Scalars['JSON']['input']>;
  qcInspections?: InputMaybe<Scalars['JSON']['input']>;
  qualityRemarks?: InputMaybe<Scalars['String']['input']>;
  qualityStatus?: InputMaybe<Scalars['String']['input']>;
  reportDate?: InputMaybe<Scalars['String']['input']>;
  reviewedBy?: InputMaybe<Scalars['String']['input']>;
  risksIssues?: InputMaybe<Scalars['JSON']['input']>;
  safetyActivities?: InputMaybe<Scalars['JSON']['input']>;
  safetyRemarks?: InputMaybe<Scalars['String']['input']>;
  safetyStats?: InputMaybe<Scalars['JSON']['input']>;
  safetyStatus?: InputMaybe<Scalars['String']['input']>;
  scheduleStatus?: InputMaybe<Scalars['String']['input']>;
  temperature?: InputMaybe<Scalars['String']['input']>;
  weatherConditions?: InputMaybe<Scalars['String']['input']>;
};

export type DashboardKpIs = {
  activeProjects: Scalars['Int']['output'];
  headcount: Scalars['Int']['output'];
  openPOs: Scalars['Int']['output'];
  openPOsDelta: Scalars['Int']['output'];
  revenue: Scalars['Float']['output'];
  revenueDelta: Scalars['Float']['output'];
};

export type DashboardPo = {
  amount: Scalars['Float']['output'];
  currency: Scalars['String']['output'];
  date: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  number: Scalars['String']['output'];
  status: Scalars['String']['output'];
  vendor: Scalars['String']['output'];
};

export type Department = {
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  manager_id?: Maybe<Scalars['ID']['output']>;
  name: Scalars['String']['output'];
  parent_id?: Maybe<Scalars['ID']['output']>;
};

export type DepartmentInput = {
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  manager_id?: InputMaybe<Scalars['ID']['input']>;
  name: Scalars['String']['input'];
  parent_id?: InputMaybe<Scalars['ID']['input']>;
};

export type DependencyImportInput = {
  dependencyType?: InputMaybe<Scalars['String']['input']>;
  lagDays?: InputMaybe<Scalars['Int']['input']>;
  predecessorCode: Scalars['String']['input'];
  successorCode: Scalars['String']['input'];
};

export type DirectDeliveryInput = {
  lines: Array<ReceiptLineInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
  received_date: Scalars['String']['input'];
};

export type DirectDeliveryResult = {
  poId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
};

export type DocComment = {
  category: Scalars['String']['output'];
  commentNumber: Scalars['Int']['output'];
  commentText: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  documentId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  locationRef?: Maybe<Scalars['String']['output']>;
  resolution?: Maybe<Scalars['String']['output']>;
  responseById?: Maybe<Scalars['ID']['output']>;
  responseDate?: Maybe<Scalars['String']['output']>;
  responseName?: Maybe<Scalars['String']['output']>;
  responseText?: Maybe<Scalars['String']['output']>;
  reviewerId: Scalars['ID']['output'];
  reviewerName?: Maybe<Scalars['String']['output']>;
  revision: Scalars['String']['output'];
};

export type DocDistributionEntry = {
  autoTransmit: Scalars['Boolean']['output'];
  companyName: Scalars['String']['output'];
  contactEmail?: Maybe<Scalars['String']['output']>;
  contactName?: Maybe<Scalars['String']['output']>;
  copies: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  discipline?: Maybe<Scalars['String']['output']>;
  docType?: Maybe<Scalars['String']['output']>;
  format: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  statusTrigger: Scalars['String']['output'];
};

export type DocumentAttachment = {
  createdAt: Scalars['String']['output'];
  file: GqlFile;
  id: Scalars['ID']['output'];
  isPrimary: Scalars['Boolean']['output'];
  label?: Maybe<Scalars['String']['output']>;
  sourceEntityId?: Maybe<Scalars['ID']['output']>;
  sourceEntityType?: Maybe<Scalars['String']['output']>;
  uploadedByEmail?: Maybe<Scalars['String']['output']>;
};

export type DownloadUrlPayload = {
  downloadUrl: Scalars['String']['output'];
  expiresInSeconds: Scalars['Int']['output'];
  filename: Scalars['String']['output'];
  mimeType: Scalars['String']['output'];
};

export type EvmData = {
  ac: Scalars['Float']['output'];
  bac: Scalars['Float']['output'];
  cpi: Scalars['Float']['output'];
  criticalPathComplete: Scalars['Float']['output'];
  cv: Scalars['Float']['output'];
  eac: Scalars['Float']['output'];
  etc: Scalars['Float']['output'];
  ev: Scalars['Float']['output'];
  percentComplete: Scalars['Float']['output'];
  percentSpent: Scalars['Float']['output'];
  pv: Scalars['Float']['output'];
  spi: Scalars['Float']['output'];
  statusDate: Scalars['String']['output'];
  sv: Scalars['Float']['output'];
  tcpi: Scalars['Float']['output'];
  vac: Scalars['Float']['output'];
};

export type Employee = {
  advance_control_account_code?: Maybe<Scalars['String']['output']>;
  advance_control_account_id?: Maybe<Scalars['ID']['output']>;
  advance_control_account_name?: Maybe<Scalars['String']['output']>;
  date_of_birth?: Maybe<Scalars['String']['output']>;
  department_id?: Maybe<Scalars['ID']['output']>;
  department_name?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  employee_number?: Maybe<Scalars['String']['output']>;
  employment_type?: Maybe<Scalars['String']['output']>;
  first_name: Scalars['String']['output'];
  gender?: Maybe<Scalars['String']['output']>;
  hire_date?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  is_active?: Maybe<Scalars['Boolean']['output']>;
  job_title?: Maybe<Scalars['String']['output']>;
  last_name: Scalars['String']['output'];
  linked_user_email?: Maybe<Scalars['String']['output']>;
  manager_id?: Maybe<Scalars['ID']['output']>;
  national_id?: Maybe<Scalars['String']['output']>;
  nationality?: Maybe<Scalars['String']['output']>;
  passport_number?: Maybe<Scalars['String']['output']>;
  phone?: Maybe<Scalars['String']['output']>;
  photo_url?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  termination_date?: Maybe<Scalars['String']['output']>;
  user_id?: Maybe<Scalars['ID']['output']>;
  work_location_id?: Maybe<Scalars['ID']['output']>;
};

export type EmployeeCrossCompanyMatch = {
  companyId: Scalars['ID']['output'];
  companyName: Scalars['String']['output'];
  date_of_birth?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  employment_type?: Maybe<Scalars['String']['output']>;
  first_name: Scalars['String']['output'];
  gender?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  job_title?: Maybe<Scalars['String']['output']>;
  last_name: Scalars['String']['output'];
  linked_user_email?: Maybe<Scalars['String']['output']>;
  national_id?: Maybe<Scalars['String']['output']>;
  nationality?: Maybe<Scalars['String']['output']>;
  passport_number?: Maybe<Scalars['String']['output']>;
  phone?: Maybe<Scalars['String']['output']>;
  user_id?: Maybe<Scalars['ID']['output']>;
};

export type EmployeeInput = {
  date_of_birth?: InputMaybe<Scalars['String']['input']>;
  department_id?: InputMaybe<Scalars['ID']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  employee_number?: InputMaybe<Scalars['String']['input']>;
  employment_type?: InputMaybe<Scalars['String']['input']>;
  first_name: Scalars['String']['input'];
  gender?: InputMaybe<Scalars['String']['input']>;
  hire_date?: InputMaybe<Scalars['String']['input']>;
  job_title?: InputMaybe<Scalars['String']['input']>;
  last_name: Scalars['String']['input'];
  manager_id?: InputMaybe<Scalars['ID']['input']>;
  national_id?: InputMaybe<Scalars['String']['input']>;
  nationality?: InputMaybe<Scalars['String']['input']>;
  passport_number?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  user_id?: InputMaybe<Scalars['ID']['input']>;
  work_location_id?: InputMaybe<Scalars['ID']['input']>;
};

export type EmployeeMonthSummary = {
  days_absent?: Maybe<Scalars['Int']['output']>;
  days_present?: Maybe<Scalars['Int']['output']>;
  leave_days?: Maybe<Scalars['Int']['output']>;
  overtime_hours?: Maybe<Scalars['Float']['output']>;
  total_hours?: Maybe<Scalars['Float']['output']>;
};

export type EmployeeShift = {
  break_minutes?: Maybe<Scalars['Int']['output']>;
  effective_from: Scalars['String']['output'];
  effective_to?: Maybe<Scalars['String']['output']>;
  employee_id: Scalars['ID']['output'];
  end_time?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  overtime_threshold_hours?: Maybe<Scalars['String']['output']>;
  shift_id: Scalars['ID']['output'];
  shift_name?: Maybe<Scalars['String']['output']>;
  start_time?: Maybe<Scalars['String']['output']>;
};

export type EngClientComment = {
  category: Scalars['String']['output'];
  clauseRef?: Maybe<Scalars['String']['output']>;
  closedAt?: Maybe<Scalars['String']['output']>;
  closedByName?: Maybe<Scalars['String']['output']>;
  commentNo: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  documentId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  raisedBy?: Maybe<Scalars['String']['output']>;
  resolution?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
};

export type EngClientCommentInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  clauseRef?: InputMaybe<Scalars['String']['input']>;
  description: Scalars['String']['input'];
  raisedBy?: InputMaybe<Scalars['String']['input']>;
};

export type EngDocActivity = {
  action: Scalars['String']['output'];
  actorName?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  documentId: Scalars['ID']['output'];
  dueDate?: Maybe<Scalars['String']['output']>;
  fromStatus?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  responseCode?: Maybe<Scalars['String']['output']>;
  submittedTo?: Maybe<Scalars['String']['output']>;
  toStatus: Scalars['String']['output'];
  transmittalRef?: Maybe<Scalars['String']['output']>;
};

export type EngineeringDoc = {
  activities: Array<EngDocActivity>;
  approverName?: Maybe<Scalars['String']['output']>;
  checkerName?: Maybe<Scalars['String']['output']>;
  clientCommentCount: Scalars['Int']['output'];
  commentCount: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  discipline: Scalars['String']['output'];
  docGroupId: Scalars['ID']['output'];
  docType: Scalars['String']['output'];
  downloadUrl?: Maybe<Scalars['String']['output']>;
  fileId?: Maybe<Scalars['ID']['output']>;
  filename?: Maybe<Scalars['String']['output']>;
  history: Array<EngineeringDoc>;
  id: Scalars['ID']['output'];
  isCurrent: Scalars['Boolean']['output'];
  issueDate?: Maybe<Scalars['String']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  openClientCommentCount: Scalars['Int']['output'];
  openCommentCount: Scalars['Int']['output'];
  originatorName?: Maybe<Scalars['String']['output']>;
  paperSize?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  purposeOfIssue?: Maybe<Scalars['String']['output']>;
  refNumber: Scalars['String']['output'];
  revision?: Maybe<Scalars['String']['output']>;
  scale?: Maybe<Scalars['String']['output']>;
  seqNo: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  uploadedByName?: Maybe<Scalars['String']['output']>;
};

export type EngineeringRevision = {
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  issuedAt: Scalars['String']['output'];
  issuedByName?: Maybe<Scalars['String']['output']>;
  itemCount: Scalars['Int']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  revisionCode: Scalars['String']['output'];
  snapshotData?: Maybe<Scalars['JSON']['output']>;
  status: Scalars['String']['output'];
};

export type EntityBreakdown = {
  companyId: Scalars['String']['output'];
  companyName: Scalars['String']['output'];
  costThisMonth: Scalars['Float']['output'];
  headcount: Scalars['Int']['output'];
  netThisMonth: Scalars['Float']['output'];
  revenueThisMonth: Scalars['Float']['output'];
};

export type EntityChangedEvent = {
  action: Scalars['String']['output'];
  companyId: Scalars['ID']['output'];
  entityId: Scalars['ID']['output'];
  entityType: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type EquipmentAsset = {
  asset_number: Scalars['String']['output'];
  category?: Maybe<Scalars['String']['output']>;
  conditionReports?: Maybe<Array<ConditionReport>>;
  condition_rating?: Maybe<Scalars['Int']['output']>;
  currency_code: Scalars['String']['output'];
  current_value?: Maybe<Scalars['Float']['output']>;
  daily_rate: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  last_maintenance_date?: Maybe<Scalars['String']['output']>;
  maintenanceSchedules?: Maybe<Array<MaintenanceSchedule>>;
  maintenance_due_hours?: Maybe<Scalars['Float']['output']>;
  maintenance_status?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  purchase_date?: Maybe<Scalars['String']['output']>;
  purchase_price?: Maybe<Scalars['Float']['output']>;
  serial_number?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  total_hours?: Maybe<Scalars['Float']['output']>;
  total_mileage?: Maybe<Scalars['Float']['output']>;
  usageLogs?: Maybe<Array<UsageLog>>;
};

export type EquipmentAssetInput = {
  asset_number?: InputMaybe<Scalars['String']['input']>;
  category?: InputMaybe<Scalars['String']['input']>;
  currency_code?: InputMaybe<Scalars['String']['input']>;
  daily_rate: Scalars['Float']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  maintenance_due_hours?: InputMaybe<Scalars['Float']['input']>;
  name: Scalars['String']['input'];
  purchase_date?: InputMaybe<Scalars['String']['input']>;
  purchase_price?: InputMaybe<Scalars['Float']['input']>;
  serial_number?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type EquipmentLog = {
  costCodeId?: Maybe<Scalars['ID']['output']>;
  costPerHour: Scalars['Float']['output'];
  createdAt: Scalars['String']['output'];
  equipmentName: Scalars['String']['output'];
  equipmentType?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  logDate: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  ownership: Scalars['String']['output'];
  projectId: Scalars['ID']['output'];
  standbyHours: Scalars['Float']['output'];
  standbyRate: Scalars['Float']['output'];
  totalCost: Scalars['Float']['output'];
  workingHours: Scalars['Float']['output'];
};

export type EventConfig = {
  alertOnDlq: Scalars['Boolean']['output'];
  backoffMultiplier: Scalars['Float']['output'];
  dlqPriority: Scalars['String']['output'];
  eventType: Scalars['String']['output'];
  initialRetryDelaySeconds: Scalars['Int']['output'];
  maxAttempts: Scalars['Int']['output'];
  maxRetryDelaySeconds: Scalars['Int']['output'];
  service: Scalars['String']['output'];
};

export type EventConfigInput = {
  alertOnDlq?: InputMaybe<Scalars['Boolean']['input']>;
  backoffMultiplier?: InputMaybe<Scalars['Float']['input']>;
  dlqPriority?: InputMaybe<Scalars['String']['input']>;
  initialRetryDelaySeconds?: InputMaybe<Scalars['Int']['input']>;
  maxAttempts?: InputMaybe<Scalars['Int']['input']>;
  maxRetryDelaySeconds?: InputMaybe<Scalars['Int']['input']>;
};

export type ExecutiveDashboardData = {
  activeProjects: Scalars['Int']['output'];
  costsTrend: Array<RevenueTrendPoint>;
  entityBreakdown: Array<EntityBreakdown>;
  netProfit: Scalars['Float']['output'];
  openPOsValue: Scalars['Float']['output'];
  profitTrend: Array<RevenueTrendPoint>;
  projectProfitabilityScatter: Array<ProjectScatter>;
  revenueByEntityMonthly: Array<RevenueByEntity>;
  revenueTrend: Array<RevenueTrendPoint>;
  totalCosts: Scalars['Float']['output'];
  totalHeadcount: Scalars['Int']['output'];
  totalProjectBudget: Scalars['Float']['output'];
  totalRevenue: Scalars['Float']['output'];
};

export type FxExposureReport = {
  rows: Array<FxExposureRow>;
  totalIQDExposure: Scalars['Float']['output'];
};

export type FxExposureRow = {
  currency: Scalars['String']['output'];
  fxRate: Scalars['Float']['output'];
  iqdEquivalent: Scalars['Float']['output'];
  netExposure: Scalars['Float']['output'];
  openAP: Scalars['Float']['output'];
  openAR: Scalars['Float']['output'];
};

export type FxRate = {
  created_at?: Maybe<Scalars['String']['output']>;
  from_currency: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  rate: Scalars['String']['output'];
  rate_date: Scalars['String']['output'];
  source?: Maybe<Scalars['String']['output']>;
  to_currency: Scalars['String']['output'];
};

export type FxRateChange = {
  changePct?: Maybe<Scalars['Float']['output']>;
  createdAt: Scalars['String']['output'];
  fromCurrency: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  previousRate?: Maybe<Scalars['Float']['output']>;
  rate: Scalars['Float']['output'];
  rateDate: Scalars['String']['output'];
  source: Scalars['String']['output'];
  toCurrency: Scalars['String']['output'];
};

export type FxRateInput = {
  from_currency: Scalars['String']['input'];
  rate: Scalars['Float']['input'];
  rate_date: Scalars['String']['input'];
  source?: InputMaybe<Scalars['String']['input']>;
  to_currency: Scalars['String']['input'];
};

export type FxRateStalenessOverview = {
  overall: Scalars['String']['output'];
  pairs: Array<FxRateStalenessStatus>;
};

export type FxRateStalenessStatus = {
  ageHours?: Maybe<Scalars['Float']['output']>;
  currencyPair: Scalars['String']['output'];
  lastRate?: Maybe<Scalars['Float']['output']>;
  lastRateDate?: Maybe<Scalars['String']['output']>;
  message: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type FxSyncLog = {
  createdAt: Scalars['String']['output'];
  durationMs?: Maybe<Scalars['Int']['output']>;
  errorMessage?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  ratesSkipped: Scalars['Int']['output'];
  ratesUpdated: Scalars['Int']['output'];
  source: Scalars['String']['output'];
  status: Scalars['String']['output'];
  syncType: Scalars['String']['output'];
  triggeredByEmail?: Maybe<Scalars['String']['output']>;
};

export type GqlFile = {
  category: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  mimeType: Scalars['String']['output'];
  originalFilename: Scalars['String']['output'];
  sizeBytes: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  uploadedAt?: Maybe<Scalars['String']['output']>;
};

export type GroupAccount = {
  account_type: Scalars['String']['output'];
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  is_header: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  parent_id?: Maybe<Scalars['ID']['output']>;
};

export type HandoverCertificate = {
  acceptedDate?: Maybe<Scalars['String']['output']>;
  areaZone?: Maybe<Scalars['String']['output']>;
  certificateNo: Scalars['String']['output'];
  clientRep?: Maybe<Scalars['String']['output']>;
  completedItemCount: Scalars['Int']['output'];
  contractorRep?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  defectLiabilityEnd?: Maybe<Scalars['String']['output']>;
  defectLiabilityStart?: Maybe<Scalars['String']['output']>;
  files: Array<RfqPhaseFile>;
  handoverDate?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  items: Array<HandoverItem>;
  notes?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  totalItemCount: Scalars['Int']['output'];
  updatedAt: Scalars['String']['output'];
};

export type HandoverItem = {
  category: Scalars['String']['output'];
  certificateId: Scalars['ID']['output'];
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  sequence: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  verifiedAt?: Maybe<Scalars['String']['output']>;
  verifiedBy?: Maybe<Scalars['String']['output']>;
};

export type ItpItemInput = {
  acceptanceCriteria?: InputMaybe<Scalars['String']['input']>;
  activity: Scalars['String']['input'];
  clientRole?: InputMaybe<Scalars['String']['input']>;
  contractorRole?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  inspectionType: Scalars['String']['input'];
  referenceDoc?: InputMaybe<Scalars['String']['input']>;
  sequence: Scalars['Int']['input'];
};

export type IntercoPricingHistory = {
  changedAt: Scalars['String']['output'];
  changedBy: Scalars['String']['output'];
  newMethod: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  previousMethod: Scalars['String']['output'];
};

export type IntercoPricingInput = {
  costPlusMarkupPct?: InputMaybe<Scalars['Float']['input']>;
  method: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};

export type IntercoPricingSettings = {
  companyId: Scalars['ID']['output'];
  companyName: Scalars['String']['output'];
  costPlusMarkupPct?: Maybe<Scalars['Float']['output']>;
  method: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['String']['output']>;
  updatedByEmail?: Maybe<Scalars['String']['output']>;
};

export type IntercoStockTransfer = {
  fromCompanyId: Scalars['ID']['output'];
  fromCompanyName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lines: Array<IntercoStockTransferLine>;
  pricingMethod: Scalars['String']['output'];
  status: Scalars['String']['output'];
  toCompanyId: Scalars['ID']['output'];
  toCompanyName?: Maybe<Scalars['String']['output']>;
  totalTransferValue: Scalars['Float']['output'];
  transferDate: Scalars['String']['output'];
  transferNumber: Scalars['String']['output'];
};

export type IntercoStockTransferDetail = {
  currencyCode: Scalars['String']['output'];
  fromCompanyId: Scalars['String']['output'];
  fromCompanyName: Scalars['String']['output'];
  fromJournalId?: Maybe<Scalars['ID']['output']>;
  fromStockMoveId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  intercoTransactionId?: Maybe<Scalars['ID']['output']>;
  intercoTransactionReference?: Maybe<Scalars['String']['output']>;
  intercoTransactionStatus?: Maybe<Scalars['String']['output']>;
  lines: Array<IntercoTransferLine>;
  pricingMethod: Scalars['String']['output'];
  status: Scalars['String']['output'];
  toCompanyId: Scalars['String']['output'];
  toCompanyName: Scalars['String']['output'];
  toJournalId?: Maybe<Scalars['ID']['output']>;
  toStockMoveId?: Maybe<Scalars['ID']['output']>;
  transferDate: Scalars['String']['output'];
  transferNumber: Scalars['String']['output'];
};

export type IntercoStockTransferInput = {
  from_company_id?: InputMaybe<Scalars['ID']['input']>;
  lines: Array<IntercoStockTransferLineInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
  to_company_id: Scalars['ID']['input'];
  transfer_date: Scalars['String']['input'];
};

export type IntercoStockTransferItem = {
  currencyCode: Scalars['String']['output'];
  fromCompanyName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  intercoTransactionId?: Maybe<Scalars['ID']['output']>;
  intercoTransactionReference?: Maybe<Scalars['String']['output']>;
  intercoTransactionStatus?: Maybe<Scalars['String']['output']>;
  pricingMethod: Scalars['String']['output'];
  status: Scalars['String']['output'];
  toCompanyName: Scalars['String']['output'];
  totalValue: Scalars['Float']['output'];
  transferDate: Scalars['String']['output'];
  transferNumber: Scalars['String']['output'];
};

export type IntercoStockTransferLine = {
  avcoAtTransfer: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  markupPctApplied?: Maybe<Scalars['Float']['output']>;
  productId: Scalars['ID']['output'];
  productName?: Maybe<Scalars['String']['output']>;
  qty: Scalars['Float']['output'];
  totalTransferValue: Scalars['Float']['output'];
  transferPrice: Scalars['Float']['output'];
};

export type IntercoStockTransferLineInput = {
  from_location_id: Scalars['ID']['input'];
  product_id: Scalars['ID']['input'];
  qty: Scalars['Float']['input'];
  to_location_id: Scalars['ID']['input'];
  unit_cost?: InputMaybe<Scalars['Float']['input']>;
};

export type IntercoStockTransferPage = {
  items: Array<IntercoStockTransferItem>;
  limit: Scalars['Int']['output'];
  page: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type IntercoTransaction = {
  amount: Scalars['String']['output'];
  created_at: Scalars['String']['output'];
  currency_code: Scalars['String']['output'];
  from_company_name?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  to_company_name?: Maybe<Scalars['String']['output']>;
  transaction_type: Scalars['String']['output'];
};

export type IntercoTransactionCreated = {
  id: Scalars['ID']['output'];
  reference: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type IntercoTransactionDetail = {
  amount: Scalars['Float']['output'];
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  fromAccountId?: Maybe<Scalars['String']['output']>;
  fromAccountName?: Maybe<Scalars['String']['output']>;
  fromCompanyApprovedAt?: Maybe<Scalars['String']['output']>;
  fromCompanyApprovedBy?: Maybe<Scalars['String']['output']>;
  fromCompanyId: Scalars['String']['output'];
  fromCompanyName: Scalars['String']['output'];
  fromJournalId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  postedAt?: Maybe<Scalars['String']['output']>;
  postedBy?: Maybe<Scalars['String']['output']>;
  reference: Scalars['String']['output'];
  status: Scalars['String']['output'];
  toAccountId?: Maybe<Scalars['String']['output']>;
  toAccountName?: Maybe<Scalars['String']['output']>;
  toCompanyApprovedAt?: Maybe<Scalars['String']['output']>;
  toCompanyApprovedBy?: Maybe<Scalars['String']['output']>;
  toCompanyId: Scalars['String']['output'];
  toCompanyName: Scalars['String']['output'];
  toJournalId?: Maybe<Scalars['ID']['output']>;
  transactionType: Scalars['String']['output'];
};

export type IntercoTransactionInput = {
  amount: Scalars['Float']['input'];
  currencyCode: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  fromAccountId?: InputMaybe<Scalars['ID']['input']>;
  fromCompanyId: Scalars['ID']['input'];
  reference?: InputMaybe<Scalars['String']['input']>;
  toAccountId?: InputMaybe<Scalars['ID']['input']>;
  toCompanyId: Scalars['ID']['input'];
  transactionType: Scalars['String']['input'];
};

export type IntercoTransactionItem = {
  amount: Scalars['Float']['output'];
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  fromCompanyName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  reference: Scalars['String']['output'];
  status: Scalars['String']['output'];
  toCompanyName: Scalars['String']['output'];
  transactionType: Scalars['String']['output'];
};

export type IntercoTransactionPage = {
  items: Array<IntercoTransactionItem>;
  limit: Scalars['Int']['output'];
  page: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type IntercoTransferLine = {
  avcoAtTransfer: Scalars['Float']['output'];
  currencyCode: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  markupPct: Scalars['Float']['output'];
  productName: Scalars['String']['output'];
  qty: Scalars['Float']['output'];
  sku?: Maybe<Scalars['String']['output']>;
  totalValue: Scalars['Float']['output'];
  transferPrice: Scalars['Float']['output'];
};

export type InventoryValRow = {
  avgCost: Scalars['Float']['output'];
  currency: Scalars['String']['output'];
  locationName: Scalars['String']['output'];
  locationType: Scalars['String']['output'];
  productName: Scalars['String']['output'];
  qtyOnHand: Scalars['Float']['output'];
  sku?: Maybe<Scalars['String']['output']>;
  totalValue: Scalars['Float']['output'];
};

export type InventoryValuation = {
  byLocation: Array<LocationValue>;
  lowStockItems: Scalars['Int']['output'];
  rows: Array<InventoryValRow>;
  totalLocations: Scalars['Int']['output'];
  totalProducts: Scalars['Int']['output'];
  totalValue: Scalars['Float']['output'];
};

export type InvitationCompany = {
  companyId: Scalars['ID']['output'];
  companyName: Scalars['String']['output'];
  module: Scalars['String']['output'];
  role: Scalars['String']['output'];
};

export type InviteUserCompanyInput = {
  companyId: Scalars['ID']['input'];
  module?: InputMaybe<Scalars['String']['input']>;
  role: Scalars['String']['input'];
};

export type InviteUserInput = {
  companies: Array<InviteUserCompanyInput>;
  email: Scalars['String']['input'];
};

export type InvoiceLineEditInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  qty?: InputMaybe<Scalars['Float']['input']>;
  unitCost?: InputMaybe<Scalars['Float']['input']>;
};

export type InvoicePayment = {
  amount: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  paymentDate: Scalars['String']['output'];
  paymentMethod?: Maybe<Scalars['String']['output']>;
  paymentReference?: Maybe<Scalars['String']['output']>;
};

export type JournalEntry = {
  accountant_email?: Maybe<Scalars['String']['output']>;
  accountant_id?: Maybe<Scalars['ID']['output']>;
  audited_at?: Maybe<Scalars['String']['output']>;
  audited_by?: Maybe<Scalars['ID']['output']>;
  auditor_email?: Maybe<Scalars['String']['output']>;
  cancel_reason?: Maybe<Scalars['String']['output']>;
  company_name?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['String']['output']>;
  created_by_email?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  entry_date: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  journal_template_image?: Maybe<Scalars['String']['output']>;
  lines?: Maybe<Array<JournalLine>>;
  linked_pos?: Maybe<Array<JournalLinkedPo>>;
  payment_currency?: Maybe<Scalars['String']['output']>;
  reference: Scalars['String']['output'];
  source_id?: Maybe<Scalars['ID']['output']>;
  source_type?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  total_credit?: Maybe<Scalars['String']['output']>;
  total_debit?: Maybe<Scalars['String']['output']>;
};

export type JournalEntryInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  entry_date: Scalars['String']['input'];
  lines: Array<JournalLineInput>;
  source_type?: InputMaybe<Scalars['String']['input']>;
};

export type JournalLine = {
  account_code?: Maybe<Scalars['String']['output']>;
  account_id: Scalars['ID']['output'];
  account_name?: Maybe<Scalars['String']['output']>;
  analytic_account_id?: Maybe<Scalars['ID']['output']>;
  cost_center_id?: Maybe<Scalars['ID']['output']>;
  credit: Scalars['String']['output'];
  currency_code?: Maybe<Scalars['String']['output']>;
  debit: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  fx_rate?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
};

export type JournalLineInput = {
  account_id: Scalars['ID']['input'];
  analytic_account_id?: InputMaybe<Scalars['ID']['input']>;
  cost_center_id?: InputMaybe<Scalars['ID']['input']>;
  credit: Scalars['Float']['input'];
  currency_code?: InputMaybe<Scalars['String']['input']>;
  debit: Scalars['Float']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  fx_rate?: InputMaybe<Scalars['Float']['input']>;
};

export type JournalLinkedPo = {
  currency_code?: Maybe<Scalars['String']['output']>;
  po_id: Scalars['ID']['output'];
  po_number: Scalars['String']['output'];
  status?: Maybe<Scalars['String']['output']>;
  total_amount?: Maybe<Scalars['String']['output']>;
  vendor_name?: Maybe<Scalars['String']['output']>;
};

export type LaborEntry = {
  activityId?: Maybe<Scalars['ID']['output']>;
  costCodeId?: Maybe<Scalars['ID']['output']>;
  costPerHour: Scalars['Float']['output'];
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  overtimeHours: Scalars['Float']['output'];
  projectId: Scalars['ID']['output'];
  regularHours: Scalars['Float']['output'];
  totalCost: Scalars['Float']['output'];
  trade: Scalars['String']['output'];
  workDate: Scalars['String']['output'];
  workerName?: Maybe<Scalars['String']['output']>;
};

export type LeaveBalance = {
  days_allocated?: Maybe<Scalars['Int']['output']>;
  days_remaining?: Maybe<Scalars['Int']['output']>;
  days_used?: Maybe<Scalars['Int']['output']>;
  leave_type_id: Scalars['ID']['output'];
  leave_type_name: Scalars['String']['output'];
};

export type LeaveRequest = {
  created_at?: Maybe<Scalars['String']['output']>;
  employee_id: Scalars['ID']['output'];
  employee_name?: Maybe<Scalars['String']['output']>;
  end_date: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  leave_type_id?: Maybe<Scalars['ID']['output']>;
  leave_type_name?: Maybe<Scalars['String']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
  reviewed_at?: Maybe<Scalars['String']['output']>;
  reviewed_by?: Maybe<Scalars['ID']['output']>;
  start_date: Scalars['String']['output'];
  status: Scalars['String']['output'];
  total_days?: Maybe<Scalars['Int']['output']>;
};

export type LeaveRequestInput = {
  employee_id?: InputMaybe<Scalars['ID']['input']>;
  end_date: Scalars['String']['input'];
  leave_type_id: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
  start_date: Scalars['String']['input'];
};

export type LeaveType = {
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  is_paid: Scalars['Boolean']['output'];
  max_days_per_year?: Maybe<Scalars['Int']['output']>;
  name: Scalars['String']['output'];
  requires_approval: Scalars['Boolean']['output'];
};

export type LeaveTypeInput = {
  is_paid?: InputMaybe<Scalars['Boolean']['input']>;
  max_days_per_year?: InputMaybe<Scalars['Int']['input']>;
  name: Scalars['String']['input'];
  requires_approval?: InputMaybe<Scalars['Boolean']['input']>;
};

export type LifecycleConfig = {
  bidSimpleModeEnabled: Scalars['Boolean']['output'];
  hideRiskRegister: Scalars['Boolean']['output'];
  modules: Array<LifecycleModuleGate>;
  phases: Array<LifecyclePhase>;
};

export type LifecycleModuleGate = {
  label?: Maybe<Scalars['String']['output']>;
  minPhaseKey: Scalars['String']['output'];
  moduleKey: Scalars['String']['output'];
  sequence: Scalars['Int']['output'];
};

export type LifecyclePhase = {
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  optional: Scalars['Boolean']['output'];
  sequence: Scalars['Int']['output'];
};

export type LineFlagInput = {
  lineId: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};

export type LinePriceInput = {
  currencyCode: Scalars['String']['input'];
  lineId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  storePrice: Scalars['Float']['input'];
};

export type LineProductOverrideInput = {
  lineId: Scalars['ID']['input'];
  productId: Scalars['ID']['input'];
};

export type LocationInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  code?: InputMaybe<Scalars['String']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  parent_id?: InputMaybe<Scalars['ID']['input']>;
  type: Scalars['String']['input'];
};

export type LocationValue = {
  locationName: Scalars['String']['output'];
  locationType: Scalars['String']['output'];
  totalValue: Scalars['Float']['output'];
};

export type LockChangedEvent = {
  entityId: Scalars['ID']['output'];
  entityType: Scalars['String']['output'];
  lock?: Maybe<RecordLock>;
};

export type MfaSetup = {
  otpauthUrl: Scalars['String']['output'];
  secret: Scalars['String']['output'];
};

export type MoCompletionInput = {
  actual_cost?: InputMaybe<Scalars['Float']['input']>;
  lines?: InputMaybe<Array<MoLineConsumedInput>>;
  notes?: InputMaybe<Scalars['String']['input']>;
  qty_produced: Scalars['Float']['input'];
};

export type MoComponent = {
  productName: Scalars['String']['output'];
  qty: Scalars['Float']['output'];
  totalCost: Scalars['Float']['output'];
  unitCost: Scalars['Float']['output'];
};

export type MoComponentStatus = {
  bomLineId: Scalars['ID']['output'];
  componentProductId: Scalars['ID']['output'];
  hasSufficientStock: Scalars['Boolean']['output'];
  productName?: Maybe<Scalars['String']['output']>;
  qtyAvailable: Scalars['Float']['output'];
  qtyOnHand: Scalars['Float']['output'];
  qtyRequired: Scalars['Float']['output'];
  qtyShortfall: Scalars['Float']['output'];
  uom?: Maybe<Scalars['String']['output']>;
};

export type MoCostAnalysis = {
  actualCost: Scalars['Float']['output'];
  componentBreakdown: Array<CostSegment>;
  plannedCost: Scalars['Float']['output'];
  variance: Scalars['Float']['output'];
  variancePct: Scalars['Float']['output'];
};

export type MoInput = {
  bom_id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  project_id?: InputMaybe<Scalars['ID']['input']>;
  qty_planned: Scalars['Float']['input'];
  scheduled_end?: InputMaybe<Scalars['String']['input']>;
  scheduled_start?: InputMaybe<Scalars['String']['input']>;
  work_center_id?: InputMaybe<Scalars['ID']['input']>;
};

export type MoLine = {
  component_name?: Maybe<Scalars['String']['output']>;
  component_product_id: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  qty_consumed: Scalars['Float']['output'];
  qty_planned: Scalars['Float']['output'];
  total_cost: Scalars['Float']['output'];
  unit_cost: Scalars['Float']['output'];
};

export type MoLineConsumedInput = {
  component_product_id: Scalars['ID']['input'];
  qty_consumed: Scalars['Float']['input'];
  source_location_id?: InputMaybe<Scalars['ID']['input']>;
  unit_cost?: InputMaybe<Scalars['Float']['input']>;
};

export type MaintenanceRecord = {
  asset_id: Scalars['ID']['output'];
  cost: Scalars['Float']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  maintenance_type: Scalars['String']['output'];
  next_due_date?: Maybe<Scalars['String']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  performed_by: Scalars['String']['output'];
  performed_date: Scalars['String']['output'];
};

export type MaintenanceRecordInput = {
  asset_id: Scalars['ID']['input'];
  cost: Scalars['Float']['input'];
  description: Scalars['String']['input'];
  maintenance_type: Scalars['String']['input'];
  next_due_date?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  performed_by: Scalars['String']['input'];
  performed_date: Scalars['String']['input'];
};

export type MaintenanceSchedule = {
  asset_id: Scalars['ID']['output'];
  asset_name?: Maybe<Scalars['String']['output']>;
  assigned_to?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  estimated_cost?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  maintenance_type: Scalars['String']['output'];
  scheduled_date: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type MaintenanceScheduleInput = {
  asset_id: Scalars['ID']['input'];
  assigned_to?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  estimated_cost?: InputMaybe<Scalars['Float']['input']>;
  maintenance_type: Scalars['String']['input'];
  scheduled_date: Scalars['String']['input'];
};

export type ManufacturingOrder = {
  actual_cost: Scalars['String']['output'];
  actual_end?: Maybe<Scalars['String']['output']>;
  actual_start?: Maybe<Scalars['String']['output']>;
  bom_id?: Maybe<Scalars['ID']['output']>;
  bom_version?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['String']['output'];
  created_by_email?: Maybe<Scalars['String']['output']>;
  dispatch_type: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lines?: Maybe<Array<MoLine>>;
  mo_number: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  planned_cost: Scalars['String']['output'];
  product_name?: Maybe<Scalars['String']['output']>;
  project_analytic_account_id?: Maybe<Scalars['ID']['output']>;
  project_id?: Maybe<Scalars['ID']['output']>;
  project_name?: Maybe<Scalars['String']['output']>;
  qty_planned: Scalars['String']['output'];
  qty_produced: Scalars['String']['output'];
  scheduled_end?: Maybe<Scalars['String']['output']>;
  scheduled_start?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  work_center_id?: Maybe<Scalars['ID']['output']>;
  work_center_name?: Maybe<Scalars['String']['output']>;
};

export type ManufacturingRequest = {
  actualCost?: Maybe<Scalars['Float']['output']>;
  approvedAt?: Maybe<Scalars['String']['output']>;
  approvedBy?: Maybe<Scalars['String']['output']>;
  approvedByName?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  moId?: Maybe<Scalars['String']['output']>;
  moNumber?: Maybe<Scalars['String']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  productId?: Maybe<Scalars['String']['output']>;
  productName?: Maybe<Scalars['String']['output']>;
  productSku?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['String']['output'];
  projectName?: Maybe<Scalars['String']['output']>;
  qtyRequested: Scalars['Float']['output'];
  rejectionReason?: Maybe<Scalars['String']['output']>;
  requestNumber: Scalars['String']['output'];
  requestedBy: Scalars['String']['output'];
  requestedByName?: Maybe<Scalars['String']['output']>;
  requestingCompanyId: Scalars['String']['output'];
  requestingCompanyName?: Maybe<Scalars['String']['output']>;
  requiredDate?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
};

export type ManufacturingRequestInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  productId?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['String']['input'];
  qtyRequested: Scalars['Float']['input'];
  requiredDate?: InputMaybe<Scalars['String']['input']>;
};

export type MarketPriceInput = {
  currencyCode: Scalars['String']['input'];
  lineId: Scalars['ID']['input'];
  marketPrice: Scalars['Float']['input'];
  vendorQuoteRef?: InputMaybe<Scalars['String']['input']>;
};

export type MaterialIssue = {
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  issueDate: Scalars['String']['output'];
  issueNumber: Scalars['String']['output'];
  issuedByName?: Maybe<Scalars['String']['output']>;
  lines: Array<MaterialIssueLine>;
  notes?: Maybe<Scalars['String']['output']>;
  poId?: Maybe<Scalars['ID']['output']>;
  poNumber?: Maybe<Scalars['String']['output']>;
  projectCode?: Maybe<Scalars['String']['output']>;
  projectName?: Maybe<Scalars['String']['output']>;
  requisitionId?: Maybe<Scalars['ID']['output']>;
  requisitionNumber?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
};

export type MaterialIssueLine = {
  fromLocationName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isInvoiced: Scalars['Boolean']['output'];
  poLineId?: Maybe<Scalars['ID']['output']>;
  productId: Scalars['ID']['output'];
  productName?: Maybe<Scalars['String']['output']>;
  productNameAr?: Maybe<Scalars['String']['output']>;
  qtyIssued: Scalars['Float']['output'];
  sku?: Maybe<Scalars['String']['output']>;
  toLocationName?: Maybe<Scalars['String']['output']>;
  totalCost: Scalars['Float']['output'];
  unitCost: Scalars['Float']['output'];
  uom?: Maybe<Scalars['String']['output']>;
};

export type MaterialReturn = {
  createdAt: Scalars['String']['output'];
  createdByName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lines: Array<MaterialReturnLine>;
  notes?: Maybe<Scalars['String']['output']>;
  poId: Scalars['ID']['output'];
  poNumber?: Maybe<Scalars['String']['output']>;
  projectCode?: Maybe<Scalars['String']['output']>;
  projectId?: Maybe<Scalars['ID']['output']>;
  projectName?: Maybe<Scalars['String']['output']>;
  returnDate: Scalars['String']['output'];
  returnNumber: Scalars['String']['output'];
};

export type MaterialReturnInput = {
  lines: Array<MaterialReturnLineInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
  poId: Scalars['ID']['input'];
  returnDate?: InputMaybe<Scalars['String']['input']>;
};

export type MaterialReturnLine = {
  id: Scalars['ID']['output'];
  issueLineId?: Maybe<Scalars['ID']['output']>;
  poLineId?: Maybe<Scalars['ID']['output']>;
  productId: Scalars['ID']['output'];
  productName?: Maybe<Scalars['String']['output']>;
  qtyReturned: Scalars['Float']['output'];
  sku?: Maybe<Scalars['String']['output']>;
  toLocationId: Scalars['ID']['output'];
  toLocationName?: Maybe<Scalars['String']['output']>;
  totalCost: Scalars['Float']['output'];
  unitCost: Scalars['Float']['output'];
};

export type MaterialReturnLineInput = {
  issueLineId?: InputMaybe<Scalars['ID']['input']>;
  poLineId?: InputMaybe<Scalars['ID']['input']>;
  qtyReturned: Scalars['Float']['input'];
  toLocationId: Scalars['ID']['input'];
};

export type Meeting = {
  actions: Array<MeetingAction>;
  agenda?: Maybe<Scalars['String']['output']>;
  attendees?: Maybe<Scalars['String']['output']>;
  chairperson?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  distributionList?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  issuedAt?: Maybe<Scalars['String']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  meetingDate: Scalars['String']['output'];
  meetingNumber: Scalars['String']['output'];
  meetingType: Scalars['String']['output'];
  minutes?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type MeetingAction = {
  actionNumber: Scalars['Int']['output'];
  carryOverFrom?: Maybe<Scalars['ID']['output']>;
  closedAt?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  dueDate?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  meetingId: Scalars['ID']['output'];
  priority: Scalars['String']['output'];
  remarks?: Maybe<Scalars['String']['output']>;
  responsiblePerson?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
};

export type MemberInput = {
  allocatedHours?: InputMaybe<Scalars['Int']['input']>;
  employeeId: Scalars['ID']['input'];
  endDate?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
};

export type MilestoneInput = {
  billableAmount: Scalars['Float']['input'];
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  sequence?: InputMaybe<Scalars['Int']['input']>;
};

export type MonthlyEntityTrend = {
  factory?: Maybe<Scalars['Float']['output']>;
  month: Scalars['String']['output'];
  watanyia?: Maybe<Scalars['Float']['output']>;
  yakam?: Maybe<Scalars['Float']['output']>;
};

export type Mutation = {
  acceptHandoverCertificate: HandoverCertificate;
  /** Acquire the edit lock. Fails if someone else already holds a non-expired lock; succeeds (taking over) if the record is unlocked or the existing lock is stale. */
  acquireLock: RecordLock;
  activateRentalContract: RentalContract;
  activateUser: UserDetail;
  addDailyReportMachinery: ProjectDailyReportMachinery;
  addDocComment: DocComment;
  addEngClientComment: EngClientComment;
  addMaterialIssueLine: MaterialIssueLine;
  addPOLineComment: PoLineComment;
  addProjectMember: ProjectMember;
  addProjectTeamMember: ProjectTeamMember;
  addPunchPhoto: PunchPhoto;
  addRiskReview: Risk;
  addUserRole: UserRole;
  addVODrawing: VoDrawing;
  adminCorrectPO: PurchaseOrder;
  adminSetPOStatus: PurchaseOrder;
  adminSetPhase: Project;
  adminSetProjectStatus: Project;
  adminSetUserPassword: Scalars['Boolean']['output'];
  advancePhase: Project;
  applyBaseline: Scalars['Boolean']['output'];
  approveBid: BidCommercialSummary;
  approveIntercoCompany: IntercoTransactionDetail;
  approveLeaveRequest?: Maybe<LeaveRequest>;
  approveManufacturingRequest: ManufacturingRequest;
  approveOvertimeRequest?: Maybe<OvertimeLog>;
  approvePO: PurchaseOrder;
  approvePOEditRequest: PoEditRequest;
  approvePaymentVoucher: PaymentVoucher;
  approvePayrollRun?: Maybe<PayrollRun>;
  approveProject: Project;
  approveRFQ: Project;
  approveRequisition: Requisition;
  approveStockIssuance: PurchaseOrder;
  approveTolerancePurchase: PoLinePurchase;
  approveVariationOrder: VariationOrder;
  assignPOPosition: PoPositionAssignment;
  assignResource: ActivityResourceAssignment;
  assignRole: UserRole;
  assignShift?: Maybe<EmployeeShift>;
  attachDailyReportMachineryPhoto: ProjectDailyReportMachinery;
  attachFile: DocumentAttachment;
  attachReceiptPhoto: ReceiptPhoto;
  auditJournalEntry: JournalEntry;
  bulkApproveOvertime?: Maybe<Array<Maybe<OvertimeLog>>>;
  bulkImportActivities: Scalars['Boolean']['output'];
  cancelChildPurchaseOrder: PurchaseOrder;
  cancelIntercoTransaction: IntercoTransactionDetail;
  cancelJournalEntry: JournalEntry;
  cancelLeaveRequest?: Maybe<LeaveRequest>;
  cancelMO: ManufacturingOrder;
  cancelManufacturingRequest: ManufacturingRequest;
  cancelMaterialIssue: MaterialIssue;
  cancelPO: PurchaseOrder;
  cancelPayrollRun?: Maybe<PayrollRun>;
  cancelProject: Project;
  cancelProjectAfterApproval: Project;
  cancelReceipt: PoReceipt;
  cancelRechargeRequest: RechargeRequest;
  cancelRequisition: Requisition;
  closeAccountingPeriod: AccountingPeriod;
  closeEngClientComment: EngClientComment;
  closeMeeting: Meeting;
  closeRentalContract: RentalContract;
  closeRequisitionLine: PoLine;
  closeTQ: ProjectTq;
  combineJournalEntries: JournalEntry;
  completeMO: ManufacturingOrder;
  completePO: PurchaseOrder;
  completeProject: Project;
  confirmMFA: Scalars['Boolean']['output'];
  confirmMO: ManufacturingOrder;
  confirmPOInventoryCheck: PurchaseOrder;
  confirmReceipt: PoReceipt;
  confirmRechargeReceipt: RechargeRequest;
  confirmRequisitionInventoryCheck: Requisition;
  confirmUpload: GqlFile;
  createAccount: Account;
  createAccountingPeriod: AccountingPeriod;
  createActivity: ProjectActivity;
  createBOM: Bom;
  createBankAccount: BankAccount;
  createBaseline: ProjectBaseline;
  createBidDeliverable: BidDeliverable;
  createBidSupplierQuotation: BidSupplierQuotation;
  createClientBilling: ClientBilling;
  createCommittedCost: CommittedCost;
  createCompany: CompanyDetail;
  createCompanyBranch: CompanyBranch;
  createContractMilestone: ProjectMilestone;
  createCostCode: CostCode;
  createDailyReport: ProjectDailyReport;
  createDepartment?: Maybe<Department>;
  createDependency: ActivityDependency;
  createEmployee?: Maybe<Employee>;
  createEngineeringDoc: EngineeringDoc;
  createEquipmentAsset: EquipmentAsset;
  createEquipmentLog: EquipmentLog;
  createHSERecord: ProjectHseRecord;
  createHandoverCertificate: HandoverCertificate;
  createHandoverItem: HandoverItem;
  createInspectionRequest: ProjectInspectionRequest;
  createIntercoStockTransfer: IntercoStockTransferDetail;
  createIntercoTransaction: IntercoTransactionCreated;
  createJournalEntry: JournalEntry;
  createLaborEntry: LaborEntry;
  createLeaveRequest?: Maybe<LeaveRequest>;
  createLeaveType?: Maybe<LeaveType>;
  createMOFromRequest: ManufacturingRequest;
  createManualTransfer: StockMove;
  createManufacturingOrder: ManufacturingOrder;
  createManufacturingRequest: ManufacturingRequest;
  createMaterialIssue: MaterialIssue;
  createMaterialReturn: MaterialReturn;
  createMeeting: Meeting;
  createMeetingAction: MeetingAction;
  createPaymentVoucher: PaymentVoucher;
  createPayrollRun?: Maybe<PayrollRun>;
  createProduct: Product;
  createProductFromPendingCatalogItem: Product;
  createProject: Project;
  createProjectContract: ProjectContract;
  createProjectDrawing: ProjectDrawing;
  createProjectITP: ProjectItp;
  createProjectInvoice: ProjectInvoice;
  createProjectNCR: ProjectNcr;
  createProjectRFI: ProjectRfi;
  createProjectStage: ProjectStage;
  createPunchItem: PunchItem;
  createPurchaseOrder: PurchaseOrder;
  createRFQ: Project;
  createRechargeBundle: RechargeBundle;
  createRechargeRequest: RechargeRequest;
  createRentalContract: RentalContract;
  createRequisition: Requisition;
  createResource: ProjectResource;
  createRisk: Risk;
  createRoleTemplate: RoleTemplate;
  createShiftConfig?: Maybe<ShiftConfig>;
  createSiteInstruction: ProjectSiteInstruction;
  createStockAdjustment?: Maybe<StockMove>;
  createStockLocation: StockLocation;
  createSubcontract: Subcontract;
  createSubcontractBilling: SubcontractBilling;
  createTQ: ProjectTq;
  createUser: UserDetail;
  createVOCorrespondence: VoCorrespondence;
  createVOCostItem: VoCostItem;
  createVariationOrder: VariationOrder;
  createVendor: Vendor;
  createWBSNode: WbsNode;
  createWorkCenter: WorkCenter;
  createWorkLocation?: Maybe<WorkLocation>;
  deactivateUser: UserDetail;
  deleteActivity: Scalars['Boolean']['output'];
  deleteBankAccount: Scalars['Boolean']['output'];
  deleteBaseline: Scalars['Boolean']['output'];
  deleteBidDeliverable: Scalars['Boolean']['output'];
  deleteBidDeliverableFile: Scalars['Boolean']['output'];
  deleteBidPackageFile: Scalars['Boolean']['output'];
  deleteBidSupplierQuotation: Scalars['Boolean']['output'];
  deleteCalendarDay: Scalars['Boolean']['output'];
  deleteClientBilling: Scalars['Boolean']['output'];
  deleteClientDocument: Scalars['Boolean']['output'];
  deleteCommittedCost: Scalars['Boolean']['output'];
  deleteCompanyBranch: Scalars['Boolean']['output'];
  deleteContractMilestone: Scalars['Boolean']['output'];
  deleteCostCode: Scalars['Boolean']['output'];
  deleteDailyReport: Scalars['Boolean']['output'];
  deleteDailyReportFile: Scalars['Boolean']['output'];
  deleteDailyReportMachinery: Scalars['Boolean']['output'];
  deleteDependency: Scalars['Boolean']['output'];
  deleteDistributionEntry: Scalars['Boolean']['output'];
  deleteDocComment: Scalars['Boolean']['output'];
  deleteEngClientComment: Scalars['Boolean']['output'];
  deleteEngineeringDoc: Scalars['Boolean']['output'];
  deleteEquipmentLog: Scalars['Boolean']['output'];
  deleteHSEFile: Scalars['Boolean']['output'];
  deleteHSERecord: Scalars['Boolean']['output'];
  deleteHandoverCertFile: Scalars['Boolean']['output'];
  deleteHandoverCertificate: Scalars['Boolean']['output'];
  deleteHandoverItem: Scalars['Boolean']['output'];
  deleteIRFile: Scalars['Boolean']['output'];
  deleteInspectionRequest: Scalars['Boolean']['output'];
  deleteLaborEntry: Scalars['Boolean']['output'];
  deleteLeaveType?: Maybe<Scalars['Boolean']['output']>;
  deleteMaterialIssueLine: Scalars['Boolean']['output'];
  deleteMeeting: Scalars['Boolean']['output'];
  deleteMeetingAction: Scalars['Boolean']['output'];
  deleteNCRFile: Scalars['Boolean']['output'];
  deletePO: PurchaseOrder;
  deleteProjectDrawing: Scalars['Boolean']['output'];
  deleteProjectITP: Scalars['Boolean']['output'];
  deleteProjectNCR: Scalars['Boolean']['output'];
  deleteProjectRFI: Scalars['Boolean']['output'];
  deletePunchItem: Scalars['Boolean']['output'];
  deletePunchPhoto: Scalars['Boolean']['output'];
  deleteRFIFile: Scalars['Boolean']['output'];
  deleteRechargeBundle: Scalars['Boolean']['output'];
  deleteResource: Scalars['Boolean']['output'];
  deleteRisk: Scalars['Boolean']['output'];
  deleteRole: Scalars['Boolean']['output'];
  deleteRoleTemplate: Scalars['Boolean']['output'];
  deleteSIFile: Scalars['Boolean']['output'];
  deleteSiteInstruction: Scalars['Boolean']['output'];
  deleteSubcontract: Scalars['Boolean']['output'];
  deleteSubcontractBilling: Scalars['Boolean']['output'];
  deleteTQ: Scalars['Boolean']['output'];
  deleteTQFile: Scalars['Boolean']['output'];
  deleteVOCorrespondence: Scalars['Boolean']['output'];
  deleteVOCostItem: Scalars['Boolean']['output'];
  deleteVariationOrder: Scalars['Boolean']['output'];
  deleteWBSNode: Scalars['Boolean']['output'];
  detachFile: Scalars['Boolean']['output'];
  disableMFA: Scalars['Boolean']['output'];
  dismissDLQEntry: Scalars['Boolean']['output'];
  enableMFA: MfaSetup;
  ensureCashPurchaseVendor: Vendor;
  failPOAudit: PurchaseOrder;
  finishBuyingPO: PurchaseOrder;
  finishBuyingRequisition: Requisition;
  fulfillRechargeRequest: RechargeRequest;
  generateRentalInvoice: RentalInvoice;
  /** Keep an already-held lock alive. Call every ~20s while the editor stays open. */
  heartbeatLock: Scalars['Boolean']['output'];
  holdProject: Project;
  inviteUser: UserInvitation;
  issueEngineeringRevision: EngineeringRevision;
  issueHandoverCertificate: HandoverCertificate;
  issueMaterialIssue: MaterialIssue;
  issueMeeting: Meeting;
  levelResources: Scalars['Boolean']['output'];
  linkEmployeeUser?: Maybe<Employee>;
  linkJournalPOs: Array<JournalLinkedPo>;
  linkPendingCatalogItemToProduct: Scalars['Boolean']['output'];
  logUsage: UsageLog;
  markAllNotificationsRead: Scalars['Int']['output'];
  markNotificationRead: Notification;
  markPOLineBought: PoLine;
  markPaymentVoucherPaid: PaymentVoucher;
  markRequisitionLineShort: PoLine;
  passPOAudit: PurchaseOrder;
  performDocWorkflowAction: EngineeringDoc;
  pmSignPunch: PunchItem;
  postIntercoTransaction: IntercoTransactionDetail;
  postJournalEntry: JournalEntry;
  postPayrollRun?: Maybe<PayrollRun>;
  processPayrollRun?: Maybe<PayrollRun>;
  reachMilestone: ProjectMilestone;
  recalculateCPM: Scalars['Boolean']['output'];
  recordDirectDelivery: DirectDeliveryResult;
  recordITPItemResult: ProjectItpItem;
  recordInvoicePayment: InvoicePayment;
  recordLinePurchase: PoLinePurchase;
  recordMaintenance: MaintenanceRecord;
  recordReceipt: PoReceipt;
  rejectBackProject: Project;
  rejectBid: BidCommercialSummary;
  rejectHandoverCertificate: HandoverCertificate;
  rejectLeaveRequest?: Maybe<LeaveRequest>;
  rejectManufacturingRequest: ManufacturingRequest;
  rejectOvertimeRequest?: Maybe<OvertimeLog>;
  rejectPO: PurchaseOrder;
  rejectPOEditRequest: PoEditRequest;
  rejectPOToMarketPricing: PurchaseOrder;
  rejectPOVerificationToMarketPricing: PurchaseOrder;
  rejectPOVerificationToStorePricing: PurchaseOrder;
  rejectRFQ: Project;
  rejectRequisitionApproval: Requisition;
  rejectRequisitionToInventoryCheck: Requisition;
  rejectRequisitionToMarketPricing: Requisition;
  rejectRequisitionVerificationToInventoryCheck: Requisition;
  rejectRequisitionVerificationToMarketPricing: Requisition;
  rejectRequisitionVerificationToStorePricing: Requisition;
  rejectTolerancePurchase: Scalars['Boolean']['output'];
  rejectVariationOrder: VariationOrder;
  /** Explicitly release a lock you hold (navigating away, closing the editor, saving). */
  releaseLock: Scalars['Boolean']['output'];
  removePOPosition: Scalars['Boolean']['output'];
  removeProjectMember: Scalars['Boolean']['output'];
  removeProjectTeamMember: Scalars['Boolean']['output'];
  removeResourceAssignment: Scalars['Boolean']['output'];
  removeUserRole: Scalars['Boolean']['output'];
  removeVODrawing: Scalars['Boolean']['output'];
  reopenEngClientComment: EngClientComment;
  reopenPO: PurchaseOrder;
  reopenPunch: PunchItem;
  requestUploadUrl: UploadUrlPayload;
  resetRequisitionToDraft: Requisition;
  resetStuckEvents: Scalars['Int']['output'];
  resetUserMFA: Scalars['Boolean']['output'];
  resolveLineFlag: Scalars['Boolean']['output'];
  resolvePOLineComment: PoLineComment;
  resolveRequisitionLineFromStock: PoLine;
  respondToComment: DocComment;
  respondToRFI: ProjectRfi;
  respondToTQ: ProjectTq;
  resumeProject: Project;
  retryDLQEntry: Scalars['Boolean']['output'];
  retryOutboxEvent: Scalars['Boolean']['output'];
  revealBankDetails?: Maybe<BankDetailsResult>;
  reverseReceipt: PoReceipt;
  reviewTQ: ProjectTq;
  reviseBid: BidCommercialSummary;
  reviseContract: ProjectContract;
  reviseEngineeringDoc: EngineeringDoc;
  reviseProjectDrawing: ProjectDrawing;
  revokeAllMySessions: Scalars['Boolean']['output'];
  revokeAllUserSessions: Scalars['Boolean']['output'];
  revokeMySession: Scalars['Boolean']['output'];
  revokeUserSession: Scalars['Boolean']['output'];
  saveUserPermissions: UserPermissionsResult;
  scheduleMaintenanceItem: MaintenanceSchedule;
  sendPOToAudit: PurchaseOrder;
  setActiveBaseline: ProjectBaseline;
  setCalendarDay: ResourceCalendarDay;
  setIntercoTransactionAccount: IntercoTransactionDetail;
  setInvoiceBankAccount: Scalars['Boolean']['output'];
  setInvoicePaymentType: Scalars['Boolean']['output'];
  setPOFunding: PurchaseOrder;
  setPOLineAccounting: PoLine;
  setPOLineActualPrice: PoLine;
  setPOLineAuditStatus: PoLine;
  setPOPriority: PurchaseOrder;
  setPOReceiver: PurchaseOrder;
  setPOVendor: PurchaseOrder;
  setRechargeAccounts: Scalars['Boolean']['output'];
  setRechargeCostCenter: Scalars['Boolean']['output'];
  setVOStatus: VariationOrder;
  startMO: ManufacturingOrder;
  startProject: Project;
  submitBidForApproval: BidCommercialSummary;
  submitConditionReport: ConditionReport;
  submitManufacturingRequest: ManufacturingRequest;
  submitPOEditRequest: PoEditRequest;
  submitPOMarketPricing: PurchaseOrder;
  submitPOPriceVerification: PurchaseOrder;
  submitPOStorePricing: PurchaseOrder;
  submitPOToInventoryCheck: PurchaseOrder;
  submitProject: Project;
  submitRequisitionMarketPricing: Requisition;
  submitRequisitionStorePricing: Requisition;
  submitRequisitionToInventoryCheck: Requisition;
  submitToTeam: Project;
  submitVariationOrder: VariationOrder;
  supervisorSignPunch: PunchItem;
  syncPOCommitments: Scalars['Boolean']['output'];
  terminateEmployee?: Maybe<Employee>;
  toggleRole: UserRole;
  triggerFXSync: Scalars['Boolean']['output'];
  unassignShift?: Maybe<Scalars['Boolean']['output']>;
  unlockUser: UserDetail;
  updateAccount: Account;
  updateActivity: ProjectActivity;
  updateActivityProgress: ProjectActivity;
  updateBOM: Bom;
  updateBankAccount: BankAccount;
  updateBankDetails?: Maybe<Employee>;
  updateBidCommercialSummary: BidCommercialSummary;
  updateBidDeliverable: BidDeliverable;
  updateBidSimpleMode: LifecycleConfig;
  updateBidSupplierQuotation: BidSupplierQuotation;
  updateClientBilling: ClientBilling;
  updateClientDocument: ClientDocument;
  updateClientDocumentStatus: ClientDocument;
  updateCommittedCost: CommittedCost;
  updateCompany: CompanyDetail;
  updateCompanyBranch: CompanyBranch;
  updateCompanyConfiguration: CompanyConfiguration;
  updateContractMilestone: ProjectMilestone;
  updateCostCode: CostCode;
  updateDailyReport: ProjectDailyReport;
  updateDepartment?: Maybe<Department>;
  updateEmployee?: Maybe<Employee>;
  updateEngClientComment: EngClientComment;
  updateEngineeringDocMeta: EngineeringDoc;
  updateEngineeringDocStatus: EngineeringDoc;
  updateEquipmentAsset: EquipmentAsset;
  updateEquipmentLog: EquipmentLog;
  updateHSERecord: ProjectHseRecord;
  updateHandoverCertificate: HandoverCertificate;
  updateHandoverItem: HandoverItem;
  updateHideRiskRegister: LifecycleConfig;
  updateInspectionRequest: ProjectInspectionRequest;
  updateIntercoPricing: IntercoPricingSettings;
  updateLaborEntry: LaborEntry;
  updateLifecycleModule: LifecycleModuleGate;
  updateLifecyclePhase: LifecyclePhase;
  updateMeeting: Meeting;
  updateMeetingAction: MeetingAction;
  updateOutboxEventConfig: EventConfig;
  updatePassword: Scalars['Boolean']['output'];
  updatePaymentVoucher: PaymentVoucher;
  updatePreferences: MyPreferences;
  updateProduct: Product;
  updateProject: Project;
  updateProjectContract: ProjectContract;
  updateProjectDrawingStatus: ProjectDrawing;
  updateProjectITP: ProjectItp;
  updateProjectInvoice: ProjectInvoice;
  updateProjectNCR: ProjectNcr;
  updateProjectRFI: ProjectRfi;
  updateProjectStage: ProjectStage;
  updatePunchItem: PunchItem;
  updatePunchStatus: PunchItem;
  updatePurchaseOrder: PurchaseOrder;
  updateRFQPhase: RfqPhase;
  updateRechargeBundle: RechargeBundle;
  updateRentalContract: RentalContract;
  updateResource: ProjectResource;
  updateResourceAssignment: ActivityResourceAssignment;
  updateRisk: Risk;
  updateRiskStatus: Risk;
  updateRoleTemplate: RoleTemplate;
  updateSalaryConfig?: Maybe<SalaryConfig>;
  updateShiftConfig?: Maybe<ShiftConfig>;
  updateSiteInstruction: ProjectSiteInstruction;
  updateSubcontract: Subcontract;
  updateSubcontractBilling: SubcontractBilling;
  updateTQ: ProjectTq;
  updateUserRole: UserRole;
  updateVOCostItem: VoCostItem;
  updateVariationOrder: VariationOrder;
  updateVendor: Vendor;
  updateWBSNode: WbsNode;
  updateWorkCenter: WorkCenter;
  updateWorkLocation?: Maybe<WorkLocation>;
  uploadBidDeliverableFile: BidDeliverable;
  uploadBidPackageFile: Array<BidPackageFile>;
  uploadClientDocument: ClientDocument;
  uploadClientDocumentRevision: ClientDocument;
  uploadDailyReportFile: ProjectDailyReport;
  uploadHSEFile: ProjectHseRecord;
  uploadHandoverCertFile: HandoverCertificate;
  uploadIRFile: ProjectInspectionRequest;
  uploadNCRFile: ProjectNcr;
  uploadRFIFile: ProjectRfi;
  uploadSIFile: ProjectSiteInstruction;
  uploadTQFile: ProjectTq;
  upsertBidCostItems: Array<BidCostItem>;
  upsertCashFlowPeriod: CashFlowPeriod;
  upsertCostForecast: CostForecast;
  upsertDistributionEntry: DocDistributionEntry;
  upsertFXRate: FxRate;
  upsertITPItems: ProjectItp;
  upsertRFQLines: Array<RfqLine>;
  verifyHandoverItem: HandoverItem;
  verifyRequisitionPrices: Requisition;
  voidProjectInvoice: ProjectInvoice;
};


export type MutationAcceptHandoverCertificateArgs = {
  acceptedDate?: InputMaybe<Scalars['String']['input']>;
  clientRep?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
};


export type MutationAcquireLockArgs = {
  entityId: Scalars['ID']['input'];
  entityType: Scalars['String']['input'];
};


export type MutationActivateRentalContractArgs = {
  id: Scalars['ID']['input'];
};


export type MutationActivateUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationAddDailyReportMachineryArgs = {
  breakdownHours?: InputMaybe<Scalars['Float']['input']>;
  dailyReportId: Scalars['ID']['input'];
  equipmentDescription?: InputMaybe<Scalars['String']['input']>;
  fileId?: InputMaybe<Scalars['ID']['input']>;
  idleHours?: InputMaybe<Scalars['Float']['input']>;
  poId: Scalars['ID']['input'];
  workingHours?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationAddDocCommentArgs = {
  category: Scalars['String']['input'];
  commentText: Scalars['String']['input'];
  documentId: Scalars['ID']['input'];
  locationRef?: InputMaybe<Scalars['String']['input']>;
  revision: Scalars['String']['input'];
};


export type MutationAddEngClientCommentArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  clauseRef?: InputMaybe<Scalars['String']['input']>;
  description: Scalars['String']['input'];
  documentId: Scalars['ID']['input'];
  raisedBy?: InputMaybe<Scalars['String']['input']>;
};


export type MutationAddMaterialIssueLineArgs = {
  fromLocationId?: InputMaybe<Scalars['ID']['input']>;
  issueId: Scalars['ID']['input'];
  poLineId?: InputMaybe<Scalars['ID']['input']>;
  productId: Scalars['ID']['input'];
  qtyIssued: Scalars['Float']['input'];
  unitCost: Scalars['Float']['input'];
};


export type MutationAddPoLineCommentArgs = {
  comment: Scalars['String']['input'];
  flag?: InputMaybe<Scalars['String']['input']>;
  lineId: Scalars['ID']['input'];
  poId: Scalars['ID']['input'];
};


export type MutationAddProjectMemberArgs = {
  input: MemberInput;
  projectId: Scalars['ID']['input'];
};


export type MutationAddProjectTeamMemberArgs = {
  employeeId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
  role: Scalars['String']['input'];
};


export type MutationAddPunchPhotoArgs = {
  caption?: InputMaybe<Scalars['String']['input']>;
  punchId: Scalars['ID']['input'];
  uploadedBy?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
};


export type MutationAddRiskReviewArgs = {
  impact: Scalars['Int']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  probability: Scalars['Int']['input'];
  reviewedBy?: InputMaybe<Scalars['String']['input']>;
  riskId: Scalars['ID']['input'];
};


export type MutationAddUserRoleArgs = {
  input: RoleInput;
  userId: Scalars['ID']['input'];
};


export type MutationAddVoDrawingArgs = {
  drawingNumber: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  revision?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  voId: Scalars['ID']['input'];
};


export type MutationAdminCorrectPoArgs = {
  changes: Scalars['String']['input'];
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationAdminSetPoStatusArgs = {
  id: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};


export type MutationAdminSetPhaseArgs = {
  id: Scalars['ID']['input'];
  phase: Scalars['String']['input'];
};


export type MutationAdminSetProjectStatusArgs = {
  id: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};


export type MutationAdminSetUserPasswordArgs = {
  newPassword: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationAdvancePhaseArgs = {
  id: Scalars['ID']['input'];
  targetPhase: Scalars['String']['input'];
};


export type MutationApplyBaselineArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApproveBidArgs = {
  projectId: Scalars['ID']['input'];
};


export type MutationApproveIntercoCompanyArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApproveLeaveRequestArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApproveManufacturingRequestArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApproveOvertimeRequestArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApprovePoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApprovePoEditRequestArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  requestId: Scalars['ID']['input'];
  requisitionId?: InputMaybe<Scalars['ID']['input']>;
  reviewNotes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationApprovePaymentVoucherArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApprovePayrollRunArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApproveProjectArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApproveRfqArgs = {
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationApproveRequisitionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationApproveStockIssuanceArgs = {
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationApproveTolerancePurchaseArgs = {
  purchaseId: Scalars['ID']['input'];
};


export type MutationApproveVariationOrderArgs = {
  approvedValue: Scalars['Float']['input'];
  contractId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
};


export type MutationAssignPoPositionArgs = {
  input: PoPositionInput;
};


export type MutationAssignResourceArgs = {
  activityId: Scalars['ID']['input'];
  budgetedCost?: InputMaybe<Scalars['Float']['input']>;
  resourceId: Scalars['ID']['input'];
  unitsPerDay: Scalars['Float']['input'];
};


export type MutationAssignRoleArgs = {
  input: AssignRoleInput;
};


export type MutationAssignShiftArgs = {
  effective_from: Scalars['String']['input'];
  employee_id: Scalars['ID']['input'];
  shift_id: Scalars['ID']['input'];
};


export type MutationAttachDailyReportMachineryPhotoArgs = {
  fileId: Scalars['ID']['input'];
  id: Scalars['ID']['input'];
};


export type MutationAttachFileArgs = {
  entityId: Scalars['ID']['input'];
  entityType: Scalars['String']['input'];
  fileId: Scalars['ID']['input'];
  isPrimary?: InputMaybe<Scalars['Boolean']['input']>;
  label?: InputMaybe<Scalars['String']['input']>;
};


export type MutationAttachReceiptPhotoArgs = {
  fileId: Scalars['ID']['input'];
  label?: InputMaybe<Scalars['String']['input']>;
  receiptId: Scalars['ID']['input'];
};


export type MutationAuditJournalEntryArgs = {
  id: Scalars['ID']['input'];
};


export type MutationBulkApproveOvertimeArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationBulkImportActivitiesArgs = {
  activities: Array<ActivityImportInput>;
  clearExisting?: InputMaybe<Scalars['Boolean']['input']>;
  dependencies?: InputMaybe<Array<DependencyImportInput>>;
  projectId: Scalars['ID']['input'];
};


export type MutationCancelChildPurchaseOrderArgs = {
  id: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCancelIntercoTransactionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelJournalEntryArgs = {
  id: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCancelLeaveRequestArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelMoArgs = {
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCancelManufacturingRequestArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelMaterialIssueArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelPoArgs = {
  id: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCancelPayrollRunArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelProjectArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationCancelProjectAfterApprovalArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationCancelReceiptArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelRechargeRequestArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelRequisitionArgs = {
  id: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCloseAccountingPeriodArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCloseEngClientCommentArgs = {
  closedByName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  resolution: Scalars['String']['input'];
};


export type MutationCloseMeetingArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCloseRentalContractArgs = {
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCloseRequisitionLineArgs = {
  lineId: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationCloseTqArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCombineJournalEntriesArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  journalIds: Array<Scalars['ID']['input']>;
};


export type MutationCompleteMoArgs = {
  id: Scalars['ID']['input'];
  input: MoCompletionInput;
};


export type MutationCompletePoArgs = {
  id: Scalars['ID']['input'];
  receiptNotes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCompleteProjectArgs = {
  id: Scalars['ID']['input'];
};


export type MutationConfirmMfaArgs = {
  totpCode: Scalars['String']['input'];
};


export type MutationConfirmMoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationConfirmPoInventoryCheckArgs = {
  id: Scalars['ID']['input'];
  lineStockQtys: Array<StockConfirmLineInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationConfirmReceiptArgs = {
  id: Scalars['ID']['input'];
};


export type MutationConfirmRechargeReceiptArgs = {
  id: Scalars['ID']['input'];
};


export type MutationConfirmRequisitionInventoryCheckArgs = {
  id: Scalars['ID']['input'];
  lineStockQtys: Array<StockConfirmLineInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationConfirmUploadArgs = {
  fileId: Scalars['ID']['input'];
};


export type MutationCreateAccountArgs = {
  input: AccountInput;
};


export type MutationCreateAccountingPeriodArgs = {
  input: PeriodInput;
};


export type MutationCreateActivityArgs = {
  activityCode: Scalars['String']['input'];
  activityType?: InputMaybe<Scalars['String']['input']>;
  budgetAmount?: InputMaybe<Scalars['Float']['input']>;
  durationDays?: InputMaybe<Scalars['Int']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  plannedFinish?: InputMaybe<Scalars['String']['input']>;
  plannedStart?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  remarks?: InputMaybe<Scalars['String']['input']>;
  responsible?: InputMaybe<Scalars['String']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  wbsId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationCreateBomArgs = {
  input: BomInput;
};


export type MutationCreateBankAccountArgs = {
  input: BankAccountInput;
};


export type MutationCreateBaselineArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  projectId: Scalars['ID']['input'];
};


export type MutationCreateBidDeliverableArgs = {
  deliverableType: Scalars['String']['input'];
  discipline?: InputMaybe<Scalars['String']['input']>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
};


export type MutationCreateBidSupplierQuotationArgs = {
  amount?: InputMaybe<Scalars['Float']['input']>;
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  fileId?: InputMaybe<Scalars['ID']['input']>;
  itemDescription: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  supplierName: Scalars['String']['input'];
  validityDate?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateClientBillingArgs = {
  billingDate: Scalars['String']['input'];
  billingNumber: Scalars['String']['input'];
  grossAmount: Scalars['Float']['input'];
  netAmount: Scalars['Float']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  periodFrom?: InputMaybe<Scalars['String']['input']>;
  periodTo?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  retentionAmount?: InputMaybe<Scalars['Float']['input']>;
  retentionPercentage?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationCreateCommittedCostArgs = {
  commitmentDate?: InputMaybe<Scalars['String']['input']>;
  commitmentType: Scalars['String']['input'];
  committedAmount: Scalars['Float']['input'];
  costCodeId?: InputMaybe<Scalars['ID']['input']>;
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  description: Scalars['String']['input'];
  expectedInvoiceDate?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  referenceNumber?: InputMaybe<Scalars['String']['input']>;
  vendorName?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateCompanyArgs = {
  input: CreateCompanyInput;
};


export type MutationCreateCompanyBranchArgs = {
  companyId: Scalars['ID']['input'];
  input: CompanyBranchInput;
};


export type MutationCreateContractMilestoneArgs = {
  contractId: Scalars['ID']['input'];
  input: MilestoneInput;
};


export type MutationCreateCostCodeArgs = {
  analyticAccountId?: InputMaybe<Scalars['ID']['input']>;
  budgetAmount: Scalars['Float']['input'];
  category: Scalars['String']['input'];
  code?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  sequence?: InputMaybe<Scalars['Int']['input']>;
  wbsId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationCreateDailyReportArgs = {
  input: DailyReportInput;
  projectId: Scalars['ID']['input'];
};


export type MutationCreateDepartmentArgs = {
  input: DepartmentInput;
};


export type MutationCreateDependencyArgs = {
  dependencyType?: InputMaybe<Scalars['String']['input']>;
  lagDays?: InputMaybe<Scalars['Int']['input']>;
  predecessorId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
  successorId: Scalars['ID']['input'];
};


export type MutationCreateEmployeeArgs = {
  input: EmployeeInput;
};


export type MutationCreateEngineeringDocArgs = {
  approverName?: InputMaybe<Scalars['String']['input']>;
  checkerName?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  discipline: Scalars['String']['input'];
  docType: Scalars['String']['input'];
  fileId?: InputMaybe<Scalars['ID']['input']>;
  issueDate?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  originatorName?: InputMaybe<Scalars['String']['input']>;
  paperSize?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  purposeOfIssue?: InputMaybe<Scalars['String']['input']>;
  revision?: InputMaybe<Scalars['String']['input']>;
  scale?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
};


export type MutationCreateEquipmentAssetArgs = {
  input: EquipmentAssetInput;
};


export type MutationCreateEquipmentLogArgs = {
  costCodeId?: InputMaybe<Scalars['ID']['input']>;
  costPerHour: Scalars['Float']['input'];
  equipmentName: Scalars['String']['input'];
  equipmentType?: InputMaybe<Scalars['String']['input']>;
  logDate: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  ownership?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  standbyHours?: InputMaybe<Scalars['Float']['input']>;
  standbyRate?: InputMaybe<Scalars['Float']['input']>;
  workingHours: Scalars['Float']['input'];
};


export type MutationCreateHseRecordArgs = {
  approvedBy?: InputMaybe<Scalars['String']['input']>;
  attendeeCount?: InputMaybe<Scalars['Int']['input']>;
  attendeeNames?: InputMaybe<Scalars['String']['input']>;
  conductedBy?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  incidentType?: InputMaybe<Scalars['String']['input']>;
  injuredPerson?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  observationType?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  ptwNumber?: InputMaybe<Scalars['String']['input']>;
  ptwType?: InputMaybe<Scalars['String']['input']>;
  recordDate: Scalars['String']['input'];
  recordType: Scalars['String']['input'];
  severity?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  validFrom?: InputMaybe<Scalars['String']['input']>;
  validTo?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateHandoverCertificateArgs = {
  areaZone?: InputMaybe<Scalars['String']['input']>;
  clientRep?: InputMaybe<Scalars['String']['input']>;
  contractorRep?: InputMaybe<Scalars['String']['input']>;
  defectLiabilityEnd?: InputMaybe<Scalars['String']['input']>;
  defectLiabilityStart?: InputMaybe<Scalars['String']['input']>;
  handoverDate?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  title: Scalars['String']['input'];
};


export type MutationCreateHandoverItemArgs = {
  category: Scalars['String']['input'];
  certificateId: Scalars['ID']['input'];
  description: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
};


export type MutationCreateInspectionRequestArgs = {
  irNumber: Scalars['String']['input'];
  itpId?: InputMaybe<Scalars['ID']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  requestedDate: Scalars['String']['input'];
  title: Scalars['String']['input'];
  workPackage?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateIntercoStockTransferArgs = {
  input: IntercoStockTransferInput;
};


export type MutationCreateIntercoTransactionArgs = {
  input: IntercoTransactionInput;
};


export type MutationCreateJournalEntryArgs = {
  input: JournalEntryInput;
};


export type MutationCreateLaborEntryArgs = {
  activityId?: InputMaybe<Scalars['ID']['input']>;
  costCodeId?: InputMaybe<Scalars['ID']['input']>;
  costPerHour: Scalars['Float']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  overtimeHours?: InputMaybe<Scalars['Float']['input']>;
  projectId: Scalars['ID']['input'];
  regularHours: Scalars['Float']['input'];
  trade: Scalars['String']['input'];
  workDate: Scalars['String']['input'];
  workerName?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateLeaveRequestArgs = {
  input: LeaveRequestInput;
};


export type MutationCreateLeaveTypeArgs = {
  input: LeaveTypeInput;
};


export type MutationCreateMoFromRequestArgs = {
  bomId: Scalars['ID']['input'];
  requestId: Scalars['ID']['input'];
  scheduledEnd?: InputMaybe<Scalars['String']['input']>;
  scheduledStart?: InputMaybe<Scalars['String']['input']>;
  workCenterId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationCreateManualTransferArgs = {
  input: TransferInput;
};


export type MutationCreateManufacturingOrderArgs = {
  input: MoInput;
};


export type MutationCreateManufacturingRequestArgs = {
  input: ManufacturingRequestInput;
};


export type MutationCreateMaterialIssueArgs = {
  issueDate: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  poId?: InputMaybe<Scalars['ID']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationCreateMaterialReturnArgs = {
  input: MaterialReturnInput;
};


export type MutationCreateMeetingArgs = {
  agenda?: InputMaybe<Scalars['String']['input']>;
  attendees?: InputMaybe<Scalars['String']['input']>;
  chairperson?: InputMaybe<Scalars['String']['input']>;
  distributionList?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  meetingDate: Scalars['String']['input'];
  meetingType: Scalars['String']['input'];
  projectId: Scalars['ID']['input'];
  title: Scalars['String']['input'];
};


export type MutationCreateMeetingActionArgs = {
  carryOverFrom?: InputMaybe<Scalars['ID']['input']>;
  description: Scalars['String']['input'];
  dueDate?: InputMaybe<Scalars['String']['input']>;
  meetingId: Scalars['ID']['input'];
  priority?: InputMaybe<Scalars['String']['input']>;
  responsiblePerson?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreatePaymentVoucherArgs = {
  input: CreatePaymentVoucherInput;
};


export type MutationCreatePayrollRunArgs = {
  input: PayrollRunInput;
};


export type MutationCreateProductArgs = {
  input: ProductInput;
};


export type MutationCreateProductFromPendingCatalogItemArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  input: ProductInput;
};


export type MutationCreateProjectArgs = {
  input: ProjectCreateInput;
};


export type MutationCreateProjectContractArgs = {
  input: ProjectContractInput;
  projectId: Scalars['ID']['input'];
};


export type MutationCreateProjectDrawingArgs = {
  discipline?: InputMaybe<Scalars['String']['input']>;
  drawingNumber: Scalars['String']['input'];
  fileId: Scalars['ID']['input'];
  issueDate?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  paperSize?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  revision?: InputMaybe<Scalars['String']['input']>;
  scale?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
};


export type MutationCreateProjectItpArgs = {
  discipline?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  title: Scalars['String']['input'];
  workPackage?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateProjectInvoiceArgs = {
  contractId: Scalars['ID']['input'];
  input: ProjectInvoiceInput;
};


export type MutationCreateProjectNcrArgs = {
  description: Scalars['String']['input'];
  dueDate?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  ncrNumber: Scalars['String']['input'];
  projectId: Scalars['ID']['input'];
  severity?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  workPackage?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateProjectRfiArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  drawingRef?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  requiredDate?: InputMaybe<Scalars['String']['input']>;
  rfiNumber: Scalars['String']['input'];
  specRef?: InputMaybe<Scalars['String']['input']>;
  subject: Scalars['String']['input'];
};


export type MutationCreateProjectStageArgs = {
  input: StageInput;
  projectId: Scalars['ID']['input'];
};


export type MutationCreatePunchItemArgs = {
  area?: InputMaybe<Scalars['String']['input']>;
  category: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  discipline?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  raisedBy?: InputMaybe<Scalars['String']['input']>;
  raisedDate?: InputMaybe<Scalars['String']['input']>;
  responsible?: InputMaybe<Scalars['String']['input']>;
  subcontractor?: InputMaybe<Scalars['String']['input']>;
  targetDate?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
};


export type MutationCreatePurchaseOrderArgs = {
  input: PoInput;
};


export type MutationCreateRfqArgs = {
  input: ProjectCreateInput;
};


export type MutationCreateRechargeBundleArgs = {
  input: RechargeBundleInput;
};


export type MutationCreateRechargeRequestArgs = {
  input: RechargeRequestInput;
};


export type MutationCreateRentalContractArgs = {
  input: RentalContractInput;
};


export type MutationCreateRequisitionArgs = {
  input: RequisitionInput;
};


export type MutationCreateResourceArgs = {
  costPerUnit: Scalars['Float']['input'];
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  maxUnitsPerDay: Scalars['Float']['input'];
  name: Scalars['String']['input'];
  projectId: Scalars['ID']['input'];
  resourceType: Scalars['String']['input'];
  unit: Scalars['String']['input'];
};


export type MutationCreateRiskArgs = {
  category: Scalars['String']['input'];
  cause?: InputMaybe<Scalars['String']['input']>;
  consequence?: InputMaybe<Scalars['String']['input']>;
  contingencyPlan?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  impact: Scalars['Int']['input'];
  mitigationPlan?: InputMaybe<Scalars['String']['input']>;
  owner?: InputMaybe<Scalars['String']['input']>;
  probability: Scalars['Int']['input'];
  projectId: Scalars['ID']['input'];
  raisedBy?: InputMaybe<Scalars['String']['input']>;
  raisedDate?: InputMaybe<Scalars['String']['input']>;
  residualImpact?: InputMaybe<Scalars['Int']['input']>;
  residualProbability?: InputMaybe<Scalars['Int']['input']>;
  reviewDate?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
};


export type MutationCreateRoleTemplateArgs = {
  input: RoleTemplateInput;
};


export type MutationCreateShiftConfigArgs = {
  input: ShiftConfigInput;
};


export type MutationCreateSiteInstructionArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  issuedBy?: InputMaybe<Scalars['String']['input']>;
  issuedDate?: InputMaybe<Scalars['String']['input']>;
  potentialVo?: InputMaybe<Scalars['Boolean']['input']>;
  projectId: Scalars['ID']['input'];
  siNumber: Scalars['String']['input'];
  subject: Scalars['String']['input'];
};


export type MutationCreateStockAdjustmentArgs = {
  input: StockAdjustmentInput;
};


export type MutationCreateStockLocationArgs = {
  input: LocationInput;
};


export type MutationCreateSubcontractArgs = {
  contractValue: Scalars['Float']['input'];
  costCodeId?: InputMaybe<Scalars['ID']['input']>;
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  retentionPercentage?: InputMaybe<Scalars['Float']['input']>;
  scopeOfWork?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
  subcontractNumber: Scalars['String']['input'];
  subcontractorName: Scalars['String']['input'];
};


export type MutationCreateSubcontractBillingArgs = {
  billingDate: Scalars['String']['input'];
  billingNumber: Scalars['String']['input'];
  grossAmount: Scalars['Float']['input'];
  netAmount: Scalars['Float']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  retentionAmount: Scalars['Float']['input'];
  subcontractId: Scalars['ID']['input'];
};


export type MutationCreateTqArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  discipline?: InputMaybe<Scalars['String']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
  documentRef?: InputMaybe<Scalars['String']['input']>;
  documentRevision?: InputMaybe<Scalars['String']['input']>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  raisedBy?: InputMaybe<Scalars['String']['input']>;
  raisedDate?: InputMaybe<Scalars['String']['input']>;
  subject: Scalars['String']['input'];
};


export type MutationCreateUserArgs = {
  input: CreateUserInput;
};


export type MutationCreateVoCorrespondenceArgs = {
  correspondenceDate: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  direction: Scalars['String']['input'];
  referenceNumber?: InputMaybe<Scalars['String']['input']>;
  subject: Scalars['String']['input'];
  voId: Scalars['ID']['input'];
};


export type MutationCreateVoCostItemArgs = {
  amount: Scalars['Float']['input'];
  category: Scalars['String']['input'];
  description: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  quantity?: InputMaybe<Scalars['Float']['input']>;
  unit?: InputMaybe<Scalars['String']['input']>;
  unitRate: Scalars['Float']['input'];
  voId: Scalars['ID']['input'];
};


export type MutationCreateVariationOrderArgs = {
  changeType?: InputMaybe<Scalars['String']['input']>;
  clientRef?: InputMaybe<Scalars['String']['input']>;
  contractId?: InputMaybe<Scalars['ID']['input']>;
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  impactAnalysis?: InputMaybe<Scalars['String']['input']>;
  initiatedBy?: InputMaybe<Scalars['String']['input']>;
  instructionDate?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  receivedDate?: InputMaybe<Scalars['String']['input']>;
  scheduleImpactDays?: InputMaybe<Scalars['Int']['input']>;
  technicalNotes?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  voNumber: Scalars['String']['input'];
  voValue: Scalars['Float']['input'];
};


export type MutationCreateVendorArgs = {
  input: VendorInput;
};


export type MutationCreateWbsNodeArgs = {
  budgetAmount?: InputMaybe<Scalars['Float']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  level?: InputMaybe<Scalars['Int']['input']>;
  name: Scalars['String']['input'];
  parentId?: InputMaybe<Scalars['ID']['input']>;
  projectId: Scalars['ID']['input'];
  responsible?: InputMaybe<Scalars['String']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  wbsCode: Scalars['String']['input'];
};


export type MutationCreateWorkCenterArgs = {
  input: WorkCenterInput;
};


export type MutationCreateWorkLocationArgs = {
  input: WorkLocationInput;
};


export type MutationDeactivateUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationDeleteActivityArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteBankAccountArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteBaselineArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteBidDeliverableArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteBidDeliverableFileArgs = {
  attachmentId: Scalars['ID']['input'];
  deliverableId: Scalars['ID']['input'];
};


export type MutationDeleteBidPackageFileArgs = {
  attachmentId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
};


export type MutationDeleteBidSupplierQuotationArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCalendarDayArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteClientBillingArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteClientDocumentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCommittedCostArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCompanyBranchArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteContractMilestoneArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCostCodeArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDailyReportArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDailyReportFileArgs = {
  attachmentId: Scalars['ID']['input'];
  reportId: Scalars['ID']['input'];
};


export type MutationDeleteDailyReportMachineryArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDependencyArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDistributionEntryArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDocCommentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteEngClientCommentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteEngineeringDocArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteEquipmentLogArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteHseFileArgs = {
  attachmentId: Scalars['ID']['input'];
  hseId: Scalars['ID']['input'];
};


export type MutationDeleteHseRecordArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteHandoverCertFileArgs = {
  attachmentId: Scalars['ID']['input'];
  certificateId: Scalars['ID']['input'];
};


export type MutationDeleteHandoverCertificateArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteHandoverItemArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteIrFileArgs = {
  attachmentId: Scalars['ID']['input'];
  irId: Scalars['ID']['input'];
};


export type MutationDeleteInspectionRequestArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteLaborEntryArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteLeaveTypeArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteMaterialIssueLineArgs = {
  id: Scalars['ID']['input'];
  issueId: Scalars['ID']['input'];
};


export type MutationDeleteMeetingArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteMeetingActionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteNcrFileArgs = {
  attachmentId: Scalars['ID']['input'];
  ncrId: Scalars['ID']['input'];
};


export type MutationDeletePoArgs = {
  id: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};


export type MutationDeleteProjectDrawingArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteProjectItpArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteProjectNcrArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteProjectRfiArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeletePunchItemArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeletePunchPhotoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteRfiFileArgs = {
  attachmentId: Scalars['ID']['input'];
  rfiId: Scalars['ID']['input'];
};


export type MutationDeleteRechargeBundleArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteResourceArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteRiskArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteRoleArgs = {
  roleId: Scalars['ID']['input'];
};


export type MutationDeleteRoleTemplateArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteSiFileArgs = {
  attachmentId: Scalars['ID']['input'];
  siId: Scalars['ID']['input'];
};


export type MutationDeleteSiteInstructionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteSubcontractArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteSubcontractBillingArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteTqArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteTqFileArgs = {
  attachmentId: Scalars['ID']['input'];
  tqId: Scalars['ID']['input'];
};


export type MutationDeleteVoCorrespondenceArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteVoCostItemArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteVariationOrderArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteWbsNodeArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDetachFileArgs = {
  attachmentId: Scalars['ID']['input'];
  entityId: Scalars['ID']['input'];
  entityType: Scalars['String']['input'];
};


export type MutationDisableMfaArgs = {
  password: Scalars['String']['input'];
};


export type MutationDismissDlqEntryArgs = {
  dlqId: Scalars['ID']['input'];
  notes: Scalars['String']['input'];
};


export type MutationFailPoAuditArgs = {
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationFinishBuyingPoArgs = {
  poId: Scalars['ID']['input'];
};


export type MutationFinishBuyingRequisitionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationFulfillRechargeRequestArgs = {
  fileId: Scalars['ID']['input'];
  id: Scalars['ID']['input'];
};


export type MutationGenerateRentalInvoiceArgs = {
  contractId: Scalars['ID']['input'];
  periodEnd: Scalars['String']['input'];
  periodStart: Scalars['String']['input'];
  whtApplies?: InputMaybe<Scalars['Boolean']['input']>;
  whtRate?: InputMaybe<Scalars['Float']['input']>;
  whtScenario?: InputMaybe<Scalars['String']['input']>;
};


export type MutationHeartbeatLockArgs = {
  entityId: Scalars['ID']['input'];
  entityType: Scalars['String']['input'];
};


export type MutationHoldProjectArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationInviteUserArgs = {
  input: InviteUserInput;
};


export type MutationIssueEngineeringRevisionArgs = {
  notes?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  revisionCode: Scalars['String']['input'];
};


export type MutationIssueHandoverCertificateArgs = {
  id: Scalars['ID']['input'];
};


export type MutationIssueMaterialIssueArgs = {
  id: Scalars['ID']['input'];
};


export type MutationIssueMeetingArgs = {
  id: Scalars['ID']['input'];
};


export type MutationLevelResourcesArgs = {
  projectId: Scalars['ID']['input'];
};


export type MutationLinkEmployeeUserArgs = {
  employee_id: Scalars['ID']['input'];
  user_id?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationLinkJournalPOsArgs = {
  id: Scalars['ID']['input'];
  poIds: Array<Scalars['ID']['input']>;
};


export type MutationLinkPendingCatalogItemToProductArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  productId: Scalars['ID']['input'];
};


export type MutationLogUsageArgs = {
  input: UsageLogInput;
};


export type MutationMarkNotificationReadArgs = {
  id: Scalars['ID']['input'];
};


export type MutationMarkPoLineBoughtArgs = {
  bought: Scalars['Boolean']['input'];
  lineId: Scalars['ID']['input'];
  poId: Scalars['ID']['input'];
};


export type MutationMarkPaymentVoucherPaidArgs = {
  id: Scalars['ID']['input'];
};


export type MutationMarkRequisitionLineShortArgs = {
  lineId: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationPassPoAuditArgs = {
  id: Scalars['ID']['input'];
};


export type MutationPerformDocWorkflowActionArgs = {
  action: Scalars['String']['input'];
  comments?: InputMaybe<Array<EngClientCommentInput>>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  issueType?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  responseCode?: InputMaybe<Scalars['String']['input']>;
  submittedTo?: InputMaybe<Scalars['String']['input']>;
  transmittalRef?: InputMaybe<Scalars['String']['input']>;
};


export type MutationPmSignPunchArgs = {
  id: Scalars['ID']['input'];
  signedBy?: InputMaybe<Scalars['String']['input']>;
};


export type MutationPostIntercoTransactionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationPostJournalEntryArgs = {
  id: Scalars['ID']['input'];
};


export type MutationPostPayrollRunArgs = {
  id: Scalars['ID']['input'];
};


export type MutationProcessPayrollRunArgs = {
  id: Scalars['ID']['input'];
};


export type MutationReachMilestoneArgs = {
  contractId: Scalars['ID']['input'];
  milestoneId: Scalars['ID']['input'];
};


export type MutationRecalculateCpmArgs = {
  projectId: Scalars['ID']['input'];
};


export type MutationRecordDirectDeliveryArgs = {
  input: DirectDeliveryInput;
  poId: Scalars['ID']['input'];
};


export type MutationRecordItpItemResultArgs = {
  inspectionDate?: InputMaybe<Scalars['String']['input']>;
  inspectorName?: InputMaybe<Scalars['String']['input']>;
  itemId: Scalars['ID']['input'];
  remarks?: InputMaybe<Scalars['String']['input']>;
  result: Scalars['String']['input'];
};


export type MutationRecordInvoicePaymentArgs = {
  amount: Scalars['Float']['input'];
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  invoiceId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  paymentDate: Scalars['String']['input'];
  paymentMethod?: InputMaybe<Scalars['String']['input']>;
  paymentReference?: InputMaybe<Scalars['String']['input']>;
};


export type MutationRecordLinePurchaseArgs = {
  input: RecordLinePurchaseInput;
};


export type MutationRecordMaintenanceArgs = {
  input: MaintenanceRecordInput;
};


export type MutationRecordReceiptArgs = {
  input: ReceiptInput;
  poId: Scalars['ID']['input'];
};


export type MutationRejectBackProjectArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationRejectBidArgs = {
  projectId: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationRejectHandoverCertificateArgs = {
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationRejectLeaveRequestArgs = {
  id: Scalars['ID']['input'];
  reviewNotes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationRejectManufacturingRequestArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationRejectOvertimeRequestArgs = {
  id: Scalars['ID']['input'];
  reviewNotes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationRejectPoArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectPoEditRequestArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  requestId: Scalars['ID']['input'];
  requisitionId?: InputMaybe<Scalars['ID']['input']>;
  reviewNotes: Scalars['String']['input'];
};


export type MutationRejectPoToMarketPricingArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectPoVerificationToMarketPricingArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectPoVerificationToStorePricingArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectRfqArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationRejectRequisitionApprovalArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectRequisitionToInventoryCheckArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectRequisitionToMarketPricingArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectRequisitionVerificationToInventoryCheckArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectRequisitionVerificationToMarketPricingArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectRequisitionVerificationToStorePricingArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationRejectTolerancePurchaseArgs = {
  purchaseId: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationRejectVariationOrderArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationReleaseLockArgs = {
  entityId: Scalars['ID']['input'];
  entityType: Scalars['String']['input'];
};


export type MutationRemovePoPositionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRemoveProjectMemberArgs = {
  memberId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
};


export type MutationRemoveProjectTeamMemberArgs = {
  memberId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
};


export type MutationRemoveResourceAssignmentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRemoveUserRoleArgs = {
  roleId: Scalars['ID']['input'];
};


export type MutationRemoveVoDrawingArgs = {
  id: Scalars['ID']['input'];
};


export type MutationReopenEngClientCommentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationReopenPoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationReopenPunchArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRequestUploadUrlArgs = {
  category: Scalars['String']['input'];
  filename: Scalars['String']['input'];
  mimeType: Scalars['String']['input'];
  sizeBytes: Scalars['Int']['input'];
};


export type MutationResetRequisitionToDraftArgs = {
  id: Scalars['ID']['input'];
  lineFlags: Array<LineFlagInput>;
  reason: Scalars['String']['input'];
};


export type MutationResetUserMfaArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationResolveLineFlagArgs = {
  lineId: Scalars['ID']['input'];
};


export type MutationResolvePoLineCommentArgs = {
  commentId: Scalars['ID']['input'];
  poId: Scalars['ID']['input'];
};


export type MutationResolveRequisitionLineFromStockArgs = {
  lineId: Scalars['ID']['input'];
  qty: Scalars['Float']['input'];
  sourceLocationId: Scalars['ID']['input'];
};


export type MutationRespondToCommentArgs = {
  id: Scalars['ID']['input'];
  resolution: Scalars['String']['input'];
  responseText: Scalars['String']['input'];
};


export type MutationRespondToRfiArgs = {
  id: Scalars['ID']['input'];
  respondedDate?: InputMaybe<Scalars['String']['input']>;
  response: Scalars['String']['input'];
};


export type MutationRespondToTqArgs = {
  id: Scalars['ID']['input'];
  response: Scalars['String']['input'];
  responseBy?: InputMaybe<Scalars['String']['input']>;
};


export type MutationResumeProjectArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRetryDlqEntryArgs = {
  dlqId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationRetryOutboxEventArgs = {
  eventId: Scalars['ID']['input'];
};


export type MutationRevealBankDetailsArgs = {
  employee_id: Scalars['ID']['input'];
};


export type MutationReverseReceiptArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};


export type MutationReviewTqArgs = {
  id: Scalars['ID']['input'];
};


export type MutationReviseBidArgs = {
  changeSummary: Scalars['String']['input'];
  projectId: Scalars['ID']['input'];
};


export type MutationReviseContractArgs = {
  changeSummary: Scalars['String']['input'];
  contractValue: Scalars['Float']['input'];
  effectiveDate?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  retentionPct: Scalars['Float']['input'];
};


export type MutationReviseEngineeringDocArgs = {
  approverName?: InputMaybe<Scalars['String']['input']>;
  checkerName?: InputMaybe<Scalars['String']['input']>;
  fileId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  issueDate?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  originatorName?: InputMaybe<Scalars['String']['input']>;
  purposeOfIssue?: InputMaybe<Scalars['String']['input']>;
  revision: Scalars['String']['input'];
};


export type MutationReviseProjectDrawingArgs = {
  fileId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  parentDrawingId: Scalars['ID']['input'];
  revision: Scalars['String']['input'];
};


export type MutationRevokeAllUserSessionsArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationRevokeMySessionArgs = {
  sessionId: Scalars['ID']['input'];
};


export type MutationRevokeUserSessionArgs = {
  sessionId: Scalars['ID']['input'];
};


export type MutationSaveUserPermissionsArgs = {
  input: SaveUserPermissionsInput;
};


export type MutationScheduleMaintenanceItemArgs = {
  input: MaintenanceScheduleInput;
};


export type MutationSendPoToAuditArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSetActiveBaselineArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSetCalendarDayArgs = {
  availableUnits: Scalars['Float']['input'];
  isHoliday: Scalars['Boolean']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  resourceId: Scalars['ID']['input'];
  workDate: Scalars['String']['input'];
};


export type MutationSetIntercoTransactionAccountArgs = {
  accountId: Scalars['ID']['input'];
  id: Scalars['ID']['input'];
};


export type MutationSetInvoiceBankAccountArgs = {
  bankAccountId?: InputMaybe<Scalars['ID']['input']>;
  invoiceId: Scalars['ID']['input'];
};


export type MutationSetInvoicePaymentTypeArgs = {
  invoiceId: Scalars['ID']['input'];
  paymentType: Scalars['String']['input'];
};


export type MutationSetPoFundingArgs = {
  fundingAdvanceId?: InputMaybe<Scalars['ID']['input']>;
  fundingSource: Scalars['String']['input'];
  id: Scalars['ID']['input'];
};


export type MutationSetPoLineAccountingArgs = {
  costCenterId?: InputMaybe<Scalars['ID']['input']>;
  glAccountId?: InputMaybe<Scalars['ID']['input']>;
  lineId: Scalars['ID']['input'];
  poId: Scalars['ID']['input'];
};


export type MutationSetPoLineActualPriceArgs = {
  actualUnitPrice?: InputMaybe<Scalars['Float']['input']>;
  lineId: Scalars['ID']['input'];
  poId: Scalars['ID']['input'];
};


export type MutationSetPoLineAuditStatusArgs = {
  auditNote?: InputMaybe<Scalars['String']['input']>;
  auditStatus: Scalars['String']['input'];
  lineId: Scalars['ID']['input'];
  poId: Scalars['ID']['input'];
};


export type MutationSetPoPriorityArgs = {
  id: Scalars['ID']['input'];
  priority: Scalars['String']['input'];
};


export type MutationSetPoReceiverArgs = {
  employeeId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
};


export type MutationSetPoVendorArgs = {
  id: Scalars['ID']['input'];
  vendorId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationSetRechargeAccountsArgs = {
  expenseAccountId?: InputMaybe<Scalars['ID']['input']>;
  fundingAccountId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationSetRechargeCostCenterArgs = {
  costCenterId: Scalars['ID']['input'];
};


export type MutationSetVoStatusArgs = {
  id: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};


export type MutationStartMoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationStartProjectArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSubmitBidForApprovalArgs = {
  projectId: Scalars['ID']['input'];
};


export type MutationSubmitConditionReportArgs = {
  input: ConditionReportInput;
};


export type MutationSubmitManufacturingRequestArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSubmitPoEditRequestArgs = {
  changes: Scalars['String']['input'];
  id?: InputMaybe<Scalars['ID']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  requisitionId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationSubmitPoMarketPricingArgs = {
  id: Scalars['ID']['input'];
  linePrices?: InputMaybe<Array<MarketPriceInput>>;
  vendorId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationSubmitPoPriceVerificationArgs = {
  id: Scalars['ID']['input'];
  lineAdjustments?: InputMaybe<Array<InputMaybe<PriceAdjustmentInput>>>;
  verificationNotes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSubmitPoStorePricingArgs = {
  id: Scalars['ID']['input'];
  linePrices?: InputMaybe<Array<LinePriceInput>>;
};


export type MutationSubmitPoToInventoryCheckArgs = {
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSubmitProjectArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSubmitRequisitionMarketPricingArgs = {
  id: Scalars['ID']['input'];
  linePrices?: InputMaybe<Array<RequisitionMarketPriceInput>>;
};


export type MutationSubmitRequisitionStorePricingArgs = {
  id: Scalars['ID']['input'];
  linePrices?: InputMaybe<Array<RequisitionStorePriceInput>>;
};


export type MutationSubmitRequisitionToInventoryCheckArgs = {
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSubmitToTeamArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSubmitVariationOrderArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSupervisorSignPunchArgs = {
  id: Scalars['ID']['input'];
  signedBy?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSyncPoCommitmentsArgs = {
  projectId: Scalars['ID']['input'];
};


export type MutationTerminateEmployeeArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
  terminationDate: Scalars['String']['input'];
};


export type MutationToggleRoleArgs = {
  isActive: Scalars['Boolean']['input'];
  roleId: Scalars['ID']['input'];
};


export type MutationUnassignShiftArgs = {
  employee_id: Scalars['ID']['input'];
};


export type MutationUnlockUserArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationUpdateAccountArgs = {
  id: Scalars['ID']['input'];
  input: AccountInput;
};


export type MutationUpdateActivityArgs = {
  activityCode?: InputMaybe<Scalars['String']['input']>;
  activityType?: InputMaybe<Scalars['String']['input']>;
  actualCost?: InputMaybe<Scalars['Float']['input']>;
  budgetAmount?: InputMaybe<Scalars['Float']['input']>;
  durationDays?: InputMaybe<Scalars['Int']['input']>;
  id: Scalars['ID']['input'];
  location?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  plannedFinish?: InputMaybe<Scalars['String']['input']>;
  plannedStart?: InputMaybe<Scalars['String']['input']>;
  remarks?: InputMaybe<Scalars['String']['input']>;
  responsible?: InputMaybe<Scalars['String']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  wbsId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationUpdateActivityProgressArgs = {
  actualFinish?: InputMaybe<Scalars['String']['input']>;
  actualStart?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  percentComplete: Scalars['Float']['input'];
};


export type MutationUpdateBomArgs = {
  id: Scalars['ID']['input'];
  input: BomInput;
};


export type MutationUpdateBankAccountArgs = {
  id: Scalars['ID']['input'];
  input: BankAccountInput;
};


export type MutationUpdateBankDetailsArgs = {
  employee_id: Scalars['ID']['input'];
  input: BankDetailsInput;
};


export type MutationUpdateBidCommercialSummaryArgs = {
  contingencyPct?: InputMaybe<Scalars['Float']['input']>;
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  discountPct?: InputMaybe<Scalars['Float']['input']>;
  marginPct?: InputMaybe<Scalars['Float']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  overheadPct?: InputMaybe<Scalars['Float']['input']>;
  projectId: Scalars['ID']['input'];
};


export type MutationUpdateBidDeliverableArgs = {
  assignedTo?: InputMaybe<Scalars['String']['input']>;
  discipline?: InputMaybe<Scalars['String']['input']>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateBidSimpleModeArgs = {
  enabled: Scalars['Boolean']['input'];
};


export type MutationUpdateBidSupplierQuotationArgs = {
  amount?: InputMaybe<Scalars['Float']['input']>;
  id: Scalars['ID']['input'];
  itemDescription?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  supplierName?: InputMaybe<Scalars['String']['input']>;
  validityDate?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateClientBillingArgs = {
  billingDate?: InputMaybe<Scalars['String']['input']>;
  certifiedAmount?: InputMaybe<Scalars['Float']['input']>;
  certifiedDate?: InputMaybe<Scalars['String']['input']>;
  grossAmount?: InputMaybe<Scalars['Float']['input']>;
  id: Scalars['ID']['input'];
  netAmount?: InputMaybe<Scalars['Float']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  paidAmount?: InputMaybe<Scalars['Float']['input']>;
  paidDate?: InputMaybe<Scalars['String']['input']>;
  periodFrom?: InputMaybe<Scalars['String']['input']>;
  periodTo?: InputMaybe<Scalars['String']['input']>;
  retentionAmount?: InputMaybe<Scalars['Float']['input']>;
  retentionPercentage?: InputMaybe<Scalars['Float']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateClientDocumentArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  documentNumber?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  receivedFrom?: InputMaybe<Scalars['String']['input']>;
  revision?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  transmissionDate?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateClientDocumentStatusArgs = {
  id: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};


export type MutationUpdateCommittedCostArgs = {
  commitmentDate?: InputMaybe<Scalars['String']['input']>;
  committedAmount?: InputMaybe<Scalars['Float']['input']>;
  costCodeId?: InputMaybe<Scalars['ID']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  expectedInvoiceDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  invoicedAmount?: InputMaybe<Scalars['Float']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  paidAmount?: InputMaybe<Scalars['Float']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  vendorName?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateCompanyArgs = {
  id: Scalars['ID']['input'];
  input: UpdateCompanyInput;
};


export type MutationUpdateCompanyBranchArgs = {
  id: Scalars['ID']['input'];
  input: CompanyBranchInput;
};


export type MutationUpdateCompanyConfigurationArgs = {
  companyId: Scalars['ID']['input'];
  input: CompanyConfigInput;
};


export type MutationUpdateContractMilestoneArgs = {
  id: Scalars['ID']['input'];
  input: MilestoneInput;
};


export type MutationUpdateCostCodeArgs = {
  analyticAccountId?: InputMaybe<Scalars['ID']['input']>;
  budgetAmount?: InputMaybe<Scalars['Float']['input']>;
  category?: InputMaybe<Scalars['String']['input']>;
  code?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  wbsId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationUpdateDailyReportArgs = {
  id: Scalars['ID']['input'];
  input: DailyReportInput;
};


export type MutationUpdateDepartmentArgs = {
  id: Scalars['ID']['input'];
  input: DepartmentInput;
};


export type MutationUpdateEmployeeArgs = {
  id: Scalars['ID']['input'];
  input: EmployeeInput;
};


export type MutationUpdateEngClientCommentArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  clauseRef?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  raisedBy?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateEngineeringDocMetaArgs = {
  approverName?: InputMaybe<Scalars['String']['input']>;
  checkerName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  originatorName?: InputMaybe<Scalars['String']['input']>;
  purposeOfIssue?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateEngineeringDocStatusArgs = {
  id: Scalars['ID']['input'];
  purposeOfIssue?: InputMaybe<Scalars['String']['input']>;
  status: Scalars['String']['input'];
  workflowNote?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateEquipmentAssetArgs = {
  id: Scalars['ID']['input'];
  input: EquipmentAssetInput;
};


export type MutationUpdateEquipmentLogArgs = {
  costPerHour?: InputMaybe<Scalars['Float']['input']>;
  equipmentName?: InputMaybe<Scalars['String']['input']>;
  equipmentType?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  standbyHours?: InputMaybe<Scalars['Float']['input']>;
  standbyRate?: InputMaybe<Scalars['Float']['input']>;
  workingHours?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationUpdateHseRecordArgs = {
  approvedBy?: InputMaybe<Scalars['String']['input']>;
  attendeeCount?: InputMaybe<Scalars['Int']['input']>;
  attendeeNames?: InputMaybe<Scalars['String']['input']>;
  conductedBy?: InputMaybe<Scalars['String']['input']>;
  correctiveAction?: InputMaybe<Scalars['String']['input']>;
  correctiveClosedDate?: InputMaybe<Scalars['String']['input']>;
  correctiveDueDate?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  incidentType?: InputMaybe<Scalars['String']['input']>;
  injuredPerson?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  observationType?: InputMaybe<Scalars['String']['input']>;
  ptwNumber?: InputMaybe<Scalars['String']['input']>;
  ptwStatus?: InputMaybe<Scalars['String']['input']>;
  ptwType?: InputMaybe<Scalars['String']['input']>;
  recordDate?: InputMaybe<Scalars['String']['input']>;
  rootCause?: InputMaybe<Scalars['String']['input']>;
  severity?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  validFrom?: InputMaybe<Scalars['String']['input']>;
  validTo?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateHandoverCertificateArgs = {
  areaZone?: InputMaybe<Scalars['String']['input']>;
  clientRep?: InputMaybe<Scalars['String']['input']>;
  contractorRep?: InputMaybe<Scalars['String']['input']>;
  defectLiabilityEnd?: InputMaybe<Scalars['String']['input']>;
  defectLiabilityStart?: InputMaybe<Scalars['String']['input']>;
  handoverDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateHandoverItemArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateHideRiskRegisterArgs = {
  hidden: Scalars['Boolean']['input'];
};


export type MutationUpdateInspectionRequestArgs = {
  actualDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  inspectorName?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  remarks?: InputMaybe<Scalars['String']['input']>;
  requestedDate?: InputMaybe<Scalars['String']['input']>;
  result?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateIntercoPricingArgs = {
  companyId: Scalars['ID']['input'];
  input: IntercoPricingInput;
};


export type MutationUpdateLaborEntryArgs = {
  costPerHour?: InputMaybe<Scalars['Float']['input']>;
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  overtimeHours?: InputMaybe<Scalars['Float']['input']>;
  regularHours?: InputMaybe<Scalars['Float']['input']>;
  trade?: InputMaybe<Scalars['String']['input']>;
  workerName?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateLifecycleModuleArgs = {
  label?: InputMaybe<Scalars['String']['input']>;
  minPhaseKey?: InputMaybe<Scalars['String']['input']>;
  moduleKey: Scalars['String']['input'];
};


export type MutationUpdateLifecyclePhaseArgs = {
  key: Scalars['String']['input'];
  label?: InputMaybe<Scalars['String']['input']>;
  optional?: InputMaybe<Scalars['Boolean']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
};


export type MutationUpdateMeetingArgs = {
  agenda?: InputMaybe<Scalars['String']['input']>;
  attendees?: InputMaybe<Scalars['String']['input']>;
  chairperson?: InputMaybe<Scalars['String']['input']>;
  distributionList?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  location?: InputMaybe<Scalars['String']['input']>;
  meetingDate?: InputMaybe<Scalars['String']['input']>;
  meetingType?: InputMaybe<Scalars['String']['input']>;
  minutes?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateMeetingActionArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  priority?: InputMaybe<Scalars['String']['input']>;
  remarks?: InputMaybe<Scalars['String']['input']>;
  responsiblePerson?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateOutboxEventConfigArgs = {
  eventType: Scalars['String']['input'];
  input: EventConfigInput;
};


export type MutationUpdatePasswordArgs = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};


export type MutationUpdatePaymentVoucherArgs = {
  id: Scalars['ID']['input'];
  input: CreatePaymentVoucherInput;
};


export type MutationUpdatePreferencesArgs = {
  input: PreferencesInput;
};


export type MutationUpdateProductArgs = {
  id: Scalars['ID']['input'];
  input: ProductInput;
};


export type MutationUpdateProjectArgs = {
  id: Scalars['ID']['input'];
  input: ProjectUpdateInput;
};


export type MutationUpdateProjectContractArgs = {
  id: Scalars['ID']['input'];
  input: ProjectContractInput;
};


export type MutationUpdateProjectDrawingStatusArgs = {
  id: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};


export type MutationUpdateProjectItpArgs = {
  discipline?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  revision?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  workPackage?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateProjectInvoiceArgs = {
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  invoiceDate?: InputMaybe<Scalars['String']['input']>;
  lines?: InputMaybe<Array<InvoiceLineEditInput>>;
};


export type MutationUpdateProjectNcrArgs = {
  closedByName?: InputMaybe<Scalars['String']['input']>;
  closedDate?: InputMaybe<Scalars['String']['input']>;
  correctiveAction?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  location?: InputMaybe<Scalars['String']['input']>;
  preventiveAction?: InputMaybe<Scalars['String']['input']>;
  rootCause?: InputMaybe<Scalars['String']['input']>;
  severity?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  workPackage?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateProjectRfiArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  drawingRef?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  requiredDate?: InputMaybe<Scalars['String']['input']>;
  specRef?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  subject?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateProjectStageArgs = {
  input: UpdateStageInput;
  projectId: Scalars['ID']['input'];
  stageId: Scalars['ID']['input'];
};


export type MutationUpdatePunchItemArgs = {
  area?: InputMaybe<Scalars['String']['input']>;
  category?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  discipline?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  raisedBy?: InputMaybe<Scalars['String']['input']>;
  raisedDate?: InputMaybe<Scalars['String']['input']>;
  responsible?: InputMaybe<Scalars['String']['input']>;
  subcontractor?: InputMaybe<Scalars['String']['input']>;
  targetDate?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdatePunchStatusArgs = {
  id: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};


export type MutationUpdatePurchaseOrderArgs = {
  id: Scalars['ID']['input'];
  input: PoInput;
};


export type MutationUpdateRfqPhaseArgs = {
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateRechargeBundleArgs = {
  id: Scalars['ID']['input'];
  input: RechargeBundleInput;
};


export type MutationUpdateRentalContractArgs = {
  id: Scalars['ID']['input'];
  input: RentalContractInput;
};


export type MutationUpdateResourceArgs = {
  costPerUnit?: InputMaybe<Scalars['Float']['input']>;
  id: Scalars['ID']['input'];
  maxUnitsPerDay?: InputMaybe<Scalars['Float']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  resourceType?: InputMaybe<Scalars['String']['input']>;
  unit?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateResourceAssignmentArgs = {
  actualCost?: InputMaybe<Scalars['Float']['input']>;
  actualUnits?: InputMaybe<Scalars['Float']['input']>;
  budgetedCost?: InputMaybe<Scalars['Float']['input']>;
  id: Scalars['ID']['input'];
  totalUnits?: InputMaybe<Scalars['Float']['input']>;
  unitsPerDay?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationUpdateRiskArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  cause?: InputMaybe<Scalars['String']['input']>;
  consequence?: InputMaybe<Scalars['String']['input']>;
  contingencyPlan?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  impact?: InputMaybe<Scalars['Int']['input']>;
  mitigationPlan?: InputMaybe<Scalars['String']['input']>;
  owner?: InputMaybe<Scalars['String']['input']>;
  probability?: InputMaybe<Scalars['Int']['input']>;
  raisedBy?: InputMaybe<Scalars['String']['input']>;
  raisedDate?: InputMaybe<Scalars['String']['input']>;
  residualImpact?: InputMaybe<Scalars['Int']['input']>;
  residualProbability?: InputMaybe<Scalars['Int']['input']>;
  reviewDate?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateRiskStatusArgs = {
  id: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};


export type MutationUpdateRoleTemplateArgs = {
  id: Scalars['ID']['input'];
  input: RoleTemplateInput;
};


export type MutationUpdateSalaryConfigArgs = {
  employee_id: Scalars['ID']['input'];
  input: SalaryConfigInput;
};


export type MutationUpdateShiftConfigArgs = {
  id: Scalars['ID']['input'];
  input: ShiftConfigInput;
};


export type MutationUpdateSiteInstructionArgs = {
  acknowledgedByName?: InputMaybe<Scalars['String']['input']>;
  acknowledgedDate?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  issuedBy?: InputMaybe<Scalars['String']['input']>;
  potentialVo?: InputMaybe<Scalars['Boolean']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  subject?: InputMaybe<Scalars['String']['input']>;
  voRef?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateSubcontractArgs = {
  certifiedAmount?: InputMaybe<Scalars['Float']['input']>;
  contractValue?: InputMaybe<Scalars['Float']['input']>;
  costCodeId?: InputMaybe<Scalars['ID']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  paidAmount?: InputMaybe<Scalars['Float']['input']>;
  retentionPercentage?: InputMaybe<Scalars['Float']['input']>;
  retentionReleased?: InputMaybe<Scalars['Float']['input']>;
  revisedValue?: InputMaybe<Scalars['Float']['input']>;
  scopeOfWork?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  subcontractorName?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateSubcontractBillingArgs = {
  certifiedAmount?: InputMaybe<Scalars['Float']['input']>;
  certifiedDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  paidAmount?: InputMaybe<Scalars['Float']['input']>;
  paidDate?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateTqArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  discipline?: InputMaybe<Scalars['String']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
  documentRef?: InputMaybe<Scalars['String']['input']>;
  documentRevision?: InputMaybe<Scalars['String']['input']>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  priority?: InputMaybe<Scalars['String']['input']>;
  raisedBy?: InputMaybe<Scalars['String']['input']>;
  raisedDate?: InputMaybe<Scalars['String']['input']>;
  subject?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateUserRoleArgs = {
  input: UpdateRoleInput;
  roleId: Scalars['ID']['input'];
};


export type MutationUpdateVoCostItemArgs = {
  amount?: InputMaybe<Scalars['Float']['input']>;
  category?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  quantity?: InputMaybe<Scalars['Float']['input']>;
  unit?: InputMaybe<Scalars['String']['input']>;
  unitRate?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationUpdateVariationOrderArgs = {
  changeType?: InputMaybe<Scalars['String']['input']>;
  clientRef?: InputMaybe<Scalars['String']['input']>;
  contractId?: InputMaybe<Scalars['ID']['input']>;
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  impactAnalysis?: InputMaybe<Scalars['String']['input']>;
  initiatedBy?: InputMaybe<Scalars['String']['input']>;
  instructionDate?: InputMaybe<Scalars['String']['input']>;
  receivedDate?: InputMaybe<Scalars['String']['input']>;
  scheduleImpactDays?: InputMaybe<Scalars['Int']['input']>;
  technicalNotes?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  voValue?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationUpdateVendorArgs = {
  id: Scalars['ID']['input'];
  input: VendorInput;
};


export type MutationUpdateWbsNodeArgs = {
  budgetAmount?: InputMaybe<Scalars['Float']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  responsible?: InputMaybe<Scalars['String']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  wbsCode?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateWorkCenterArgs = {
  id: Scalars['ID']['input'];
  input: WorkCenterInput;
};


export type MutationUpdateWorkLocationArgs = {
  id: Scalars['ID']['input'];
  input: WorkLocationInput;
};


export type MutationUploadBidDeliverableFileArgs = {
  deliverableId: Scalars['ID']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  fileId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadBidPackageFileArgs = {
  bidType: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  fileId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadClientDocumentArgs = {
  category: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  documentNumber?: InputMaybe<Scalars['String']['input']>;
  fileId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
  receivedFrom?: InputMaybe<Scalars['String']['input']>;
  revision?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  transmissionDate?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadClientDocumentRevisionArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  fileId: Scalars['ID']['input'];
  parentDocumentId: Scalars['ID']['input'];
  revision: Scalars['String']['input'];
};


export type MutationUploadDailyReportFileArgs = {
  fileId: Scalars['ID']['input'];
  reportId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadHseFileArgs = {
  fileId: Scalars['ID']['input'];
  hseId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadHandoverCertFileArgs = {
  certificateId: Scalars['ID']['input'];
  fileId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadIrFileArgs = {
  fileId: Scalars['ID']['input'];
  irId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadNcrFileArgs = {
  fileId: Scalars['ID']['input'];
  ncrId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadRfiFileArgs = {
  fileId: Scalars['ID']['input'];
  rfiId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadSiFileArgs = {
  fileId: Scalars['ID']['input'];
  siId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUploadTqFileArgs = {
  fileId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
  tqId: Scalars['ID']['input'];
};


export type MutationUpsertBidCostItemsArgs = {
  items: Array<BidCostItemInput>;
  projectId: Scalars['ID']['input'];
};


export type MutationUpsertCashFlowPeriodArgs = {
  actualInflow?: InputMaybe<Scalars['Float']['input']>;
  actualOutflow?: InputMaybe<Scalars['Float']['input']>;
  forecastInflow?: InputMaybe<Scalars['Float']['input']>;
  forecastOutflow?: InputMaybe<Scalars['Float']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  periodMonth: Scalars['Int']['input'];
  periodYear: Scalars['Int']['input'];
  plannedInflow?: InputMaybe<Scalars['Float']['input']>;
  plannedOutflow?: InputMaybe<Scalars['Float']['input']>;
  projectId: Scalars['ID']['input'];
};


export type MutationUpsertCostForecastArgs = {
  costCodeId?: InputMaybe<Scalars['ID']['input']>;
  eacAmount: Scalars['Float']['input'];
  etcAmount: Scalars['Float']['input'];
  forecastDate: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
};


export type MutationUpsertDistributionEntryArgs = {
  autoTransmit?: InputMaybe<Scalars['Boolean']['input']>;
  companyName: Scalars['String']['input'];
  contactEmail?: InputMaybe<Scalars['String']['input']>;
  contactName?: InputMaybe<Scalars['String']['input']>;
  copies?: InputMaybe<Scalars['Int']['input']>;
  discipline?: InputMaybe<Scalars['String']['input']>;
  docType?: InputMaybe<Scalars['String']['input']>;
  format?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  statusTrigger: Scalars['String']['input'];
};


export type MutationUpsertFxRateArgs = {
  input: FxRateInput;
};


export type MutationUpsertItpItemsArgs = {
  items: Array<ItpItemInput>;
  itpId: Scalars['ID']['input'];
};


export type MutationUpsertRfqLinesArgs = {
  lines: Array<RfqLineInput>;
  projectId: Scalars['ID']['input'];
};


export type MutationVerifyHandoverItemArgs = {
  id: Scalars['ID']['input'];
  verifiedBy: Scalars['String']['input'];
};


export type MutationVerifyRequisitionPricesArgs = {
  id: Scalars['ID']['input'];
  lineAdjustments?: InputMaybe<Array<RequisitionPriceVerificationAdjustment>>;
  verificationNotes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationVoidProjectInvoiceArgs = {
  id: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type MyPreferences = {
  dateFormat?: Maybe<Scalars['String']['output']>;
  notificationPreferences?: Maybe<Scalars['JSON']['output']>;
  numberFormat?: Maybe<Scalars['String']['output']>;
  themePreference?: Maybe<Scalars['String']['output']>;
};

export type MyProfile = {
  createdAt: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastLogin?: Maybe<Scalars['String']['output']>;
  mfaEnabled: Scalars['Boolean']['output'];
};

export type MyProjectSummary = {
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  projectType: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type MySession = {
  createdAt: Scalars['String']['output'];
  deviceName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  ipAddress: Scalars['String']['output'];
  isCurrent: Scalars['Boolean']['output'];
  lastActive?: Maybe<Scalars['String']['output']>;
  platform?: Maybe<Scalars['String']['output']>;
};

export type Notification = {
  body: Scalars['String']['output'];
  created_at: Scalars['String']['output'];
  entityId?: Maybe<Scalars['ID']['output']>;
  entityRef?: Maybe<Scalars['String']['output']>;
  entityType?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  is_read: Scalars['Boolean']['output'];
  priority?: Maybe<Scalars['String']['output']>;
  projectId?: Maybe<Scalars['ID']['output']>;
  title: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type OutboxCounts = {
  dlq: Scalars['Int']['output'];
  failed: Scalars['Int']['output'];
  pending: Scalars['Int']['output'];
  stuck: Scalars['Int']['output'];
};

export type OutboxEvent = {
  attempts: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  eventPriority: Scalars['String']['output'];
  eventType: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastError?: Maybe<Scalars['String']['output']>;
  maxAttempts: Scalars['Int']['output'];
  nextRetryAt?: Maybe<Scalars['String']['output']>;
  payload?: Maybe<Scalars['JSON']['output']>;
  processedAt?: Maybe<Scalars['String']['output']>;
  service: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type OutboxEventConfig = {
  alertOnDlq: Scalars['Boolean']['output'];
  backoffMultiplier: Scalars['Float']['output'];
  description?: Maybe<Scalars['String']['output']>;
  dlqPriority: Scalars['String']['output'];
  eventType: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  initialRetryDelaySeconds: Scalars['Int']['output'];
  maxAttempts: Scalars['Int']['output'];
  maxRetryDelaySeconds: Scalars['Int']['output'];
};

export type OutboxEventPage = {
  items: Array<OutboxEvent>;
  limit: Scalars['Int']['output'];
  page: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type OutboxEventTypeSummary = {
  count: Scalars['Int']['output'];
  eventType: Scalars['String']['output'];
  maxAttemptsSeen: Scalars['Int']['output'];
  oldest?: Maybe<Scalars['String']['output']>;
  service: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type OutboxMonitorStatus = {
  deliveredToday: Scalars['Int']['output'];
  failedCount: Scalars['Int']['output'];
  pendingCount: Scalars['Int']['output'];
  processingCount: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  stuckCount: Scalars['Int']['output'];
};

export type OutboxMonitorSummary = {
  byEventType: Array<OutboxEventTypeSummary>;
  counts: OutboxCounts;
  generatedAt: Scalars['String']['output'];
  health: Scalars['String']['output'];
  pendingDLQ: Array<DlqEntry>;
  stuckEvents: Array<OutboxEvent>;
};

export type OutboxUpdatedEvent = {
  updatedAt: Scalars['String']['output'];
};

export type OvertimeLog = {
  employee_id: Scalars['ID']['output'];
  employee_name?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  overtime_hours: Scalars['String']['output'];
  overtime_multiplier?: Maybe<Scalars['Float']['output']>;
  regular_hours?: Maybe<Scalars['String']['output']>;
  review_notes?: Maybe<Scalars['String']['output']>;
  reviewed_by_email?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  work_date: Scalars['String']['output'];
};

export type PlLine = {
  account_id: Scalars['ID']['output'];
  amount: Scalars['String']['output'];
  code: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type PoApprovalLogEntry = {
  action: Scalars['String']['output'];
  created_at: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  user_email?: Maybe<Scalars['String']['output']>;
};

export type PoEditRequest = {
  changes: Scalars['String']['output'];
  created_at: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  po_id?: Maybe<Scalars['ID']['output']>;
  request_notes?: Maybe<Scalars['String']['output']>;
  requested_by_email?: Maybe<Scalars['String']['output']>;
  requisition_id?: Maybe<Scalars['ID']['output']>;
  review_notes?: Maybe<Scalars['String']['output']>;
  reviewed_at?: Maybe<Scalars['String']['output']>;
  reviewed_by_email?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
};

export type PoFxRate = {
  currency_code: Scalars['String']['output'];
  is_default: Scalars['Boolean']['output'];
  rate_to_base: Scalars['Float']['output'];
};

export type PoFxRatesResult = {
  base_currency: Scalars['String']['output'];
  rates: Array<PoFxRate>;
};

export type PoInput = {
  analytic_account_id?: InputMaybe<Scalars['ID']['input']>;
  assigned_receiver_id?: InputMaybe<Scalars['ID']['input']>;
  assigned_to?: InputMaybe<Scalars['ID']['input']>;
  branch_id?: InputMaybe<Scalars['ID']['input']>;
  currency_code?: InputMaybe<Scalars['String']['input']>;
  delivery_destination?: InputMaybe<Scalars['String']['input']>;
  expected_delivery_date?: InputMaybe<Scalars['String']['input']>;
  fx_rate?: InputMaybe<Scalars['Float']['input']>;
  lines: Array<PoLineInput>;
  linkedMoId?: InputMaybe<Scalars['ID']['input']>;
  linkedProjectId?: InputMaybe<Scalars['ID']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  purpose?: InputMaybe<Scalars['String']['input']>;
  vendor_id?: InputMaybe<Scalars['ID']['input']>;
};

export type PoLine = {
  account_code?: Maybe<Scalars['String']['output']>;
  account_id?: Maybe<Scalars['ID']['output']>;
  account_name?: Maybe<Scalars['String']['output']>;
  actual_unit_price?: Maybe<Scalars['String']['output']>;
  advance_settlement_id?: Maybe<Scalars['ID']['output']>;
  approved_unit_price?: Maybe<Scalars['String']['output']>;
  audit_flagged_at?: Maybe<Scalars['String']['output']>;
  audit_flagged_by_email?: Maybe<Scalars['String']['output']>;
  audit_note?: Maybe<Scalars['String']['output']>;
  audit_status?: Maybe<Scalars['String']['output']>;
  closed_at?: Maybe<Scalars['String']['output']>;
  closed_by?: Maybe<Scalars['ID']['output']>;
  closed_reason?: Maybe<Scalars['String']['output']>;
  cost_center_id?: Maybe<Scalars['ID']['output']>;
  cost_center_name?: Maybe<Scalars['String']['output']>;
  currency_code?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  flag_addressed_at?: Maybe<Scalars['String']['output']>;
  flag_reason?: Maybe<Scalars['String']['output']>;
  flag_resolved_at?: Maybe<Scalars['String']['output']>;
  flag_resolved_by_name?: Maybe<Scalars['String']['output']>;
  flagged_at?: Maybe<Scalars['String']['output']>;
  flagged_by_name?: Maybe<Scalars['String']['output']>;
  flagged_from_status?: Maybe<Scalars['String']['output']>;
  fx_rate_to_base?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  in_stock?: Maybe<Scalars['Boolean']['output']>;
  initial_unit_price?: Maybe<Scalars['String']['output']>;
  is_bought?: Maybe<Scalars['Boolean']['output']>;
  market_price?: Maybe<Scalars['String']['output']>;
  market_price_currency?: Maybe<Scalars['String']['output']>;
  origin_line_id?: Maybe<Scalars['ID']['output']>;
  product_id?: Maybe<Scalars['ID']['output']>;
  product_name?: Maybe<Scalars['String']['output']>;
  product_name_ar?: Maybe<Scalars['String']['output']>;
  purchases?: Maybe<Array<PoLinePurchase>>;
  qty: Scalars['String']['output'];
  qty_from_stock?: Maybe<Scalars['String']['output']>;
  qty_received?: Maybe<Scalars['String']['output']>;
  requested_currency_code?: Maybe<Scalars['String']['output']>;
  short_marked_at?: Maybe<Scalars['String']['output']>;
  short_marked_by?: Maybe<Scalars['ID']['output']>;
  short_reason?: Maybe<Scalars['String']['output']>;
  sku?: Maybe<Scalars['String']['output']>;
  source_average_cost?: Maybe<Scalars['Float']['output']>;
  source_company_id?: Maybe<Scalars['ID']['output']>;
  source_company_name?: Maybe<Scalars['String']['output']>;
  source_location_id?: Maybe<Scalars['ID']['output']>;
  source_location_name?: Maybe<Scalars['String']['output']>;
  store_price?: Maybe<Scalars['String']['output']>;
  store_price_currency?: Maybe<Scalars['String']['output']>;
  total: Scalars['String']['output'];
  unit_price: Scalars['String']['output'];
  uom?: Maybe<Scalars['String']['output']>;
  verified_price?: Maybe<Scalars['String']['output']>;
  verified_price_currency?: Maybe<Scalars['String']['output']>;
};

export type PoLineAvailability = {
  byLocation: Array<PoLineLocationAvailability>;
  description?: Maybe<Scalars['String']['output']>;
  isAvailable: Scalars['Boolean']['output'];
  lineId: Scalars['ID']['output'];
  productId?: Maybe<Scalars['ID']['output']>;
  productName?: Maybe<Scalars['String']['output']>;
  productNameAr?: Maybe<Scalars['String']['output']>;
  qtyAvailable: Scalars['Float']['output'];
  qtyOnHand: Scalars['Float']['output'];
  qtyRequired: Scalars['Float']['output'];
};

export type PoLineComment = {
  comment: Scalars['String']['output'];
  created_at: Scalars['String']['output'];
  created_by_name: Scalars['String']['output'];
  flag?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  po_line_id: Scalars['ID']['output'];
  resolved: Scalars['Boolean']['output'];
  resolved_at?: Maybe<Scalars['String']['output']>;
  resolved_by?: Maybe<Scalars['ID']['output']>;
  resolved_by_email?: Maybe<Scalars['String']['output']>;
};

export type PoLineInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  product_id?: InputMaybe<Scalars['ID']['input']>;
  qty: Scalars['Float']['input'];
  requested_currency_code?: InputMaybe<Scalars['String']['input']>;
  unit_price: Scalars['Float']['input'];
  uom?: InputMaybe<Scalars['String']['input']>;
};

export type PoLineLocationAvailability = {
  averageCost?: Maybe<Scalars['Float']['output']>;
  companyId: Scalars['ID']['output'];
  companyName: Scalars['String']['output'];
  locationId: Scalars['ID']['output'];
  locationName: Scalars['String']['output'];
  qtyAvailable: Scalars['Float']['output'];
  qtyOnHand: Scalars['Float']['output'];
};

export type PoLinePurchase = {
  actual_unit_price: Scalars['String']['output'];
  bought_at: Scalars['String']['output'];
  bought_by?: Maybe<Scalars['ID']['output']>;
  bought_by_name?: Maybe<Scalars['String']['output']>;
  currency_code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  over_tolerance: Scalars['Boolean']['output'];
  po_line_id: Scalars['ID']['output'];
  qty: Scalars['String']['output'];
  receipt_attachment_id?: Maybe<Scalars['ID']['output']>;
  receipt_file_id?: Maybe<Scalars['ID']['output']>;
  receipt_filename?: Maybe<Scalars['String']['output']>;
  tolerance_approved_by?: Maybe<Scalars['ID']['output']>;
  tolerance_approved_by_name?: Maybe<Scalars['String']['output']>;
  vendor_id: Scalars['ID']['output'];
  vendor_name?: Maybe<Scalars['String']['output']>;
};

export type PoPositionAssignment = {
  branchId?: Maybe<Scalars['ID']['output']>;
  branchName?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  departmentId?: Maybe<Scalars['ID']['output']>;
  departmentName?: Maybe<Scalars['String']['output']>;
  employeeId: Scalars['ID']['output'];
  employeeName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  position: Scalars['String']['output'];
  projectId?: Maybe<Scalars['ID']['output']>;
  projectName?: Maybe<Scalars['String']['output']>;
};

export type PoPositionInput = {
  branchId?: InputMaybe<Scalars['ID']['input']>;
  departmentId?: InputMaybe<Scalars['ID']['input']>;
  employeeId: Scalars['ID']['input'];
  position: Scalars['String']['input'];
  projectId?: InputMaybe<Scalars['ID']['input']>;
};

export type PoReceipt = {
  base_currency_code?: Maybe<Scalars['String']['output']>;
  confirmed_at?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  is_invoiced?: Maybe<Scalars['Boolean']['output']>;
  lines: Array<PoReceiptLine>;
  location_id?: Maybe<Scalars['ID']['output']>;
  location_name?: Maybe<Scalars['String']['output']>;
  location_notes?: Maybe<Scalars['String']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  photos: Array<ReceiptPhoto>;
  po_id?: Maybe<Scalars['ID']['output']>;
  po_number?: Maybe<Scalars['String']['output']>;
  receipt_date?: Maybe<Scalars['String']['output']>;
  receipt_number?: Maybe<Scalars['String']['output']>;
  received_by_email?: Maybe<Scalars['String']['output']>;
  received_by_name?: Maybe<Scalars['String']['output']>;
  received_from_name?: Maybe<Scalars['String']['output']>;
  reversal_reason?: Maybe<Scalars['String']['output']>;
  reversed_at?: Maybe<Scalars['String']['output']>;
  reversed_by_email?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  vendor_name?: Maybe<Scalars['String']['output']>;
};

export type PoReceiptLine = {
  actual_unit_price?: Maybe<Scalars['String']['output']>;
  currency_code?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  fx_rate_to_base?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  po_line_id: Scalars['ID']['output'];
  product_name?: Maybe<Scalars['String']['output']>;
  product_name_ar?: Maybe<Scalars['String']['output']>;
  qty_received: Scalars['String']['output'];
  sku?: Maybe<Scalars['String']['output']>;
  unit_price?: Maybe<Scalars['String']['output']>;
  uom?: Maybe<Scalars['String']['output']>;
};

export type PaginationMeta = {
  limit: Scalars['Int']['output'];
  page: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPages: Scalars['Int']['output'];
};

export type PaymentVoucher = {
  audited_at?: Maybe<Scalars['String']['output']>;
  auditor_email?: Maybe<Scalars['String']['output']>;
  bank_account_fund?: Maybe<Scalars['String']['output']>;
  cashier_email?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['String']['output'];
  created_by_email?: Maybe<Scalars['String']['output']>;
  funding_source_label?: Maybe<Scalars['String']['output']>;
  funding_source_type?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  journal_count?: Maybe<Scalars['String']['output']>;
  journals?: Maybe<Array<PaymentVoucherJournal>>;
  lines?: Maybe<Array<PaymentVoucherLine>>;
  notes?: Maybe<Scalars['String']['output']>;
  petty_cash_float_id?: Maybe<Scalars['ID']['output']>;
  pv_template_image?: Maybe<Scalars['String']['output']>;
  received_from: Scalars['String']['output'];
  receiver_name?: Maybe<Scalars['String']['output']>;
  recon_bank_account_id?: Maybe<Scalars['ID']['output']>;
  reference_to?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  total_amount_iqd: Scalars['String']['output'];
  total_amount_usd: Scalars['String']['output'];
  voucher_date: Scalars['String']['output'];
  voucher_number: Scalars['String']['output'];
};

export type PaymentVoucherJournal = {
  audited_at?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  entry_date: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  linked_pos?: Maybe<Array<JournalLinkedPo>>;
  reference: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type PaymentVoucherLine = {
  acct_1?: Maybe<Scalars['String']['output']>;
  acct_2?: Maybe<Scalars['String']['output']>;
  acct_3?: Maybe<Scalars['String']['output']>;
  acct_4?: Maybe<Scalars['String']['output']>;
  acct_5?: Maybe<Scalars['String']['output']>;
  amount_iqd: Scalars['String']['output'];
  amount_usd: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  sequence: Scalars['Int']['output'];
  statement: Scalars['String']['output'];
};

export type PaymentVoucherLineInput = {
  acct_1?: InputMaybe<Scalars['String']['input']>;
  acct_2?: InputMaybe<Scalars['String']['input']>;
  acct_3?: InputMaybe<Scalars['String']['input']>;
  acct_4?: InputMaybe<Scalars['String']['input']>;
  acct_5?: InputMaybe<Scalars['String']['input']>;
  amount_iqd?: InputMaybe<Scalars['Float']['input']>;
  amount_usd?: InputMaybe<Scalars['Float']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  statement: Scalars['String']['input'];
};

export type PayrollCostReport = {
  avgCostPerEmployee: Scalars['Float']['output'];
  byCurrency: Array<ByCurrency>;
  monthlyTrend: Array<MonthlyEntityTrend>;
  rows: Array<PayrollCostRow>;
  totalEmployerCost: Scalars['Float']['output'];
  totalGross: Scalars['Float']['output'];
  totalHeadcount: Scalars['Int']['output'];
  totalNet: Scalars['Float']['output'];
};

export type PayrollCostRow = {
  companyName: Scalars['String']['output'];
  costCenter?: Maybe<Scalars['String']['output']>;
  headcount: Scalars['Int']['output'];
  period: Scalars['String']['output'];
  totalGross: Scalars['Float']['output'];
  totalIQD: Scalars['Float']['output'];
  totalNet: Scalars['Float']['output'];
};

export type PayrollRun = {
  created_at: Scalars['String']['output'];
  end_date?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  period_name: Scalars['String']['output'];
  start_date?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  total_deductions?: Maybe<Scalars['String']['output']>;
  total_gross: Scalars['String']['output'];
  total_net: Scalars['String']['output'];
};

export type PayrollRunInput = {
  end_date: Scalars['String']['input'];
  period_name: Scalars['String']['input'];
  start_date: Scalars['String']['input'];
};

export type PayrollTaxReport = {
  rows: Array<PayrollTaxRow>;
};

export type PayrollTaxRow = {
  employeeName: Scalars['String']['output'];
  employeeNumber: Scalars['String']['output'];
  grossPay: Scalars['Float']['output'];
  incomeTaxWithheld: Scalars['Float']['output'];
  netPay: Scalars['Float']['output'];
  period: Scalars['String']['output'];
  socialSecurity: Scalars['Float']['output'];
  taxableIncome: Scalars['Float']['output'];
};

export type Payslip = {
  absent_days?: Maybe<Scalars['Int']['output']>;
  base_salary?: Maybe<Scalars['String']['output']>;
  currency_code?: Maybe<Scalars['String']['output']>;
  employee_id?: Maybe<Scalars['ID']['output']>;
  employee_name?: Maybe<Scalars['String']['output']>;
  employee_number?: Maybe<Scalars['String']['output']>;
  gross_salary: Scalars['String']['output'];
  housing_allowance?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  income_tax: Scalars['String']['output'];
  leave_days?: Maybe<Scalars['Int']['output']>;
  net_salary: Scalars['String']['output'];
  other_allowances?: Maybe<Scalars['String']['output']>;
  other_deductions?: Maybe<Scalars['String']['output']>;
  overtime_hours?: Maybe<Scalars['String']['output']>;
  overtime_pay?: Maybe<Scalars['String']['output']>;
  payroll_run_id?: Maybe<Scalars['ID']['output']>;
  social_security: Scalars['String']['output'];
  transport_allowance?: Maybe<Scalars['String']['output']>;
  working_days?: Maybe<Scalars['Int']['output']>;
};

export type PendingProductCatalogItem = {
  created_at: Scalars['String']['output'];
  currency_code?: Maybe<Scalars['String']['output']>;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  po_id: Scalars['ID']['output'];
  po_line_id: Scalars['ID']['output'];
  po_number: Scalars['String']['output'];
  qty?: Maybe<Scalars['String']['output']>;
  source: Scalars['String']['output'];
  unit_price?: Maybe<Scalars['String']['output']>;
  uom?: Maybe<Scalars['String']['output']>;
};

export type PeriodInput = {
  end_date: Scalars['String']['input'];
  name: Scalars['String']['input'];
  start_date: Scalars['String']['input'];
};

export type PermissionsChangedEvent = {
  companyId: Scalars['ID']['output'];
  userId: Scalars['ID']['output'];
};

export type PreferencesInput = {
  dateFormat?: InputMaybe<Scalars['String']['input']>;
  notificationPreferences?: InputMaybe<Scalars['JSON']['input']>;
  numberFormat?: InputMaybe<Scalars['String']['input']>;
  themePreference?: InputMaybe<Scalars['String']['input']>;
};

export type PriceAdjustmentInput = {
  lineId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  verifiedPrice: Scalars['Float']['input'];
};

export type PricingConfigChange = {
  effectiveFrom: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  newMarkupPct?: Maybe<Scalars['Float']['output']>;
  newMethod: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  previousMarkupPct?: Maybe<Scalars['Float']['output']>;
  previousMethod?: Maybe<Scalars['String']['output']>;
};

export type Product = {
  average_cost: Scalars['String']['output'];
  balances?: Maybe<Array<ProductBalance>>;
  category?: Maybe<Scalars['String']['output']>;
  costHistory?: Maybe<Array<ProductCostHistoryEntry>>;
  cost_currency?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  has_stock_moves?: Maybe<Scalars['Boolean']['output']>;
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  name_ar?: Maybe<Scalars['String']['output']>;
  qty_on_hand?: Maybe<Scalars['String']['output']>;
  reorder_point?: Maybe<Scalars['String']['output']>;
  reorder_qty?: Maybe<Scalars['String']['output']>;
  sku: Scalars['String']['output'];
  standard_cost?: Maybe<Scalars['String']['output']>;
  sub_category?: Maybe<Scalars['String']['output']>;
  uom: Scalars['String']['output'];
  valuation_method: Scalars['String']['output'];
};

export type ProductBalance = {
  available: Scalars['String']['output'];
  average_cost: Scalars['String']['output'];
  last_cost_currency: Scalars['String']['output'];
  location_id: Scalars['ID']['output'];
  location_name?: Maybe<Scalars['String']['output']>;
  location_type?: Maybe<Scalars['String']['output']>;
  qty_on_hand: Scalars['String']['output'];
  qty_reserved: Scalars['String']['output'];
  total_value: Scalars['String']['output'];
};

export type ProductCostHistoryEntry = {
  changed_at: Scalars['String']['output'];
  changed_by_name?: Maybe<Scalars['String']['output']>;
  currency_code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  new_cost: Scalars['String']['output'];
  old_cost?: Maybe<Scalars['String']['output']>;
  source_id?: Maybe<Scalars['ID']['output']>;
  source_label?: Maybe<Scalars['String']['output']>;
  source_type: Scalars['String']['output'];
};

export type ProductInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  cost_currency?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  name_ar?: InputMaybe<Scalars['String']['input']>;
  reorder_point?: InputMaybe<Scalars['Float']['input']>;
  reorder_qty?: InputMaybe<Scalars['Float']['input']>;
  sku?: InputMaybe<Scalars['String']['input']>;
  standard_cost?: InputMaybe<Scalars['Float']['input']>;
  sub_category?: InputMaybe<Scalars['String']['input']>;
  uom: Scalars['String']['input'];
  valuation_method?: InputMaybe<Scalars['String']['input']>;
};

export type ProfitLossReport = {
  expenses: Array<PlLine>;
  netProfit: Scalars['String']['output'];
  revenue: Array<PlLine>;
  totalExpenses: Scalars['String']['output'];
  totalRevenue: Scalars['String']['output'];
};

export type Project = {
  activityLog?: Maybe<Scalars['JSON']['output']>;
  allowedActions?: Maybe<Array<Scalars['String']['output']>>;
  analyticAccountId?: Maybe<Scalars['ID']['output']>;
  analyticAccountName?: Maybe<Scalars['String']['output']>;
  approvedAt?: Maybe<Scalars['String']['output']>;
  budgetAmount?: Maybe<Scalars['Float']['output']>;
  budgetCurrency?: Maybe<Scalars['String']['output']>;
  cancelReason?: Maybe<Scalars['String']['output']>;
  cancelledAt?: Maybe<Scalars['String']['output']>;
  clientContact?: Maybe<Scalars['String']['output']>;
  clientDocCount?: Maybe<Scalars['Int']['output']>;
  clientName?: Maybe<Scalars['String']['output']>;
  code: Scalars['String']['output'];
  companyId: Scalars['ID']['output'];
  companyName?: Maybe<Scalars['String']['output']>;
  completedAt?: Maybe<Scalars['String']['output']>;
  contractName?: Maybe<Scalars['String']['output']>;
  costCenterId?: Maybe<Scalars['ID']['output']>;
  costSummary?: Maybe<Scalars['JSON']['output']>;
  createdAt: Scalars['String']['output'];
  currentStageName?: Maybe<Scalars['String']['output']>;
  daysToSubmission?: Maybe<Scalars['Int']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  holdReason?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isRfq: Scalars['Boolean']['output'];
  lifecyclePhase?: Maybe<Scalars['String']['output']>;
  managerId?: Maybe<Scalars['ID']['output']>;
  managerName?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  openOverdueRfiCount?: Maybe<Scalars['Int']['output']>;
  openPoCount?: Maybe<Scalars['Int']['output']>;
  openSafetyIncidentCount?: Maybe<Scalars['Int']['output']>;
  overallCompletionPct?: Maybe<Scalars['Int']['output']>;
  overdueCorrectiveActionCount?: Maybe<Scalars['Int']['output']>;
  plannedEndDate?: Maybe<Scalars['String']['output']>;
  plannedStartDate?: Maybe<Scalars['String']['output']>;
  projectLocation?: Maybe<Scalars['String']['output']>;
  projectType: Scalars['String']['output'];
  projectValue?: Maybe<Scalars['Float']['output']>;
  projectValueCurrency?: Maybe<Scalars['String']['output']>;
  questionDate?: Maybe<Scalars['String']['output']>;
  questionTime?: Maybe<Scalars['String']['output']>;
  receivingDate?: Maybe<Scalars['String']['output']>;
  recentPos?: Maybe<Scalars['JSON']['output']>;
  remarks?: Maybe<Scalars['String']['output']>;
  rfqEstimatedCost?: Maybe<Scalars['Float']['output']>;
  rfqLineCount?: Maybe<Scalars['Int']['output']>;
  rfqLines?: Maybe<Array<RfqLine>>;
  rfqNumber?: Maybe<Scalars['String']['output']>;
  rfqOutcome?: Maybe<Scalars['String']['output']>;
  rfqOutcomeReason?: Maybe<Scalars['String']['output']>;
  siteVisitDate?: Maybe<Scalars['String']['output']>;
  siteVisitTime?: Maybe<Scalars['String']['output']>;
  stages?: Maybe<Scalars['JSON']['output']>;
  stagesCompleted?: Maybe<Scalars['Int']['output']>;
  stagesTotal?: Maybe<Scalars['Int']['output']>;
  status: Scalars['String']['output'];
  statusHistory?: Maybe<Scalars['JSON']['output']>;
  submissionDate?: Maybe<Scalars['String']['output']>;
  submissionTime?: Maybe<Scalars['String']['output']>;
  submittedAt?: Maybe<Scalars['String']['output']>;
  team?: Maybe<Scalars['JSON']['output']>;
  teamCount?: Maybe<Scalars['Int']['output']>;
  totalCosts?: Maybe<Scalars['Float']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type ProjectActivity = {
  activityCode: Scalars['String']['output'];
  activityType: Scalars['String']['output'];
  actualCost: Scalars['Float']['output'];
  actualFinish?: Maybe<Scalars['String']['output']>;
  actualStart?: Maybe<Scalars['String']['output']>;
  baselineDuration?: Maybe<Scalars['Int']['output']>;
  baselineFinish?: Maybe<Scalars['String']['output']>;
  baselineStart?: Maybe<Scalars['String']['output']>;
  budgetAmount: Scalars['Float']['output'];
  createdAt: Scalars['String']['output'];
  durationDays: Scalars['Int']['output'];
  earlyFinish?: Maybe<Scalars['String']['output']>;
  earlyStart?: Maybe<Scalars['String']['output']>;
  freeFloat?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  isCritical: Scalars['Boolean']['output'];
  lateFinish?: Maybe<Scalars['String']['output']>;
  lateStart?: Maybe<Scalars['String']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  percentComplete: Scalars['Float']['output'];
  plannedFinish?: Maybe<Scalars['String']['output']>;
  plannedStart?: Maybe<Scalars['String']['output']>;
  predecessors: Array<ActivityDependency>;
  projectId: Scalars['ID']['output'];
  remarks?: Maybe<Scalars['String']['output']>;
  resources: Array<ActivityResourceAssignment>;
  responsible?: Maybe<Scalars['String']['output']>;
  sequence: Scalars['Int']['output'];
  successors: Array<ActivityDependency>;
  totalFloat?: Maybe<Scalars['Int']['output']>;
  updatedAt: Scalars['String']['output'];
  wbsCode?: Maybe<Scalars['String']['output']>;
  wbsId?: Maybe<Scalars['ID']['output']>;
};

export type ProjectBaseline = {
  baselineDate: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  projectId: Scalars['ID']['output'];
};

export type ProjectCompletionBlockers = {
  blockers: Array<Scalars['String']['output']>;
  canComplete: Scalars['Boolean']['output'];
};

export type ProjectContract = {
  clientName: Scalars['String']['output'];
  contractName: Scalars['String']['output'];
  contractNumber: Scalars['String']['output'];
  contractValue: Scalars['Float']['output'];
  currencyCode: Scalars['String']['output'];
  defaultBillingMethod: Scalars['String']['output'];
  defaultMarginPct: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  invoices: Array<ProjectInvoice>;
  milestones: Array<ProjectMilestone>;
  outstanding: Scalars['Float']['output'];
  projectCode: Scalars['String']['output'];
  projectId: Scalars['ID']['output'];
  projectName: Scalars['String']['output'];
  retentionPct: Scalars['Float']['output'];
  revision: Scalars['Int']['output'];
  revisions: Array<ContractRevision>;
  status: Scalars['String']['output'];
  totalInvoiced: Scalars['Float']['output'];
  totalPaid: Scalars['Float']['output'];
};

export type ProjectContractInput = {
  clientName: Scalars['String']['input'];
  contractName: Scalars['String']['input'];
  contractValue: Scalars['Float']['input'];
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  defaultBillingMethod?: InputMaybe<Scalars['String']['input']>;
  defaultMarginPct?: InputMaybe<Scalars['Float']['input']>;
  retentionPct?: InputMaybe<Scalars['Float']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type ProjectCreateInput = {
  budgetAmount?: InputMaybe<Scalars['Float']['input']>;
  budgetCurrency?: InputMaybe<Scalars['String']['input']>;
  clientContact?: InputMaybe<Scalars['String']['input']>;
  clientName?: InputMaybe<Scalars['String']['input']>;
  code?: InputMaybe<Scalars['String']['input']>;
  contractName?: InputMaybe<Scalars['String']['input']>;
  costCenterId?: InputMaybe<Scalars['ID']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  plannedEndDate?: InputMaybe<Scalars['String']['input']>;
  plannedStartDate?: InputMaybe<Scalars['String']['input']>;
  projectLocation?: InputMaybe<Scalars['String']['input']>;
  projectManagerId?: InputMaybe<Scalars['ID']['input']>;
  projectType?: InputMaybe<Scalars['String']['input']>;
  projectValue?: InputMaybe<Scalars['Float']['input']>;
  projectValueCurrency?: InputMaybe<Scalars['String']['input']>;
  questionDate?: InputMaybe<Scalars['String']['input']>;
  questionTime?: InputMaybe<Scalars['String']['input']>;
  receivingDate?: InputMaybe<Scalars['String']['input']>;
  remarks?: InputMaybe<Scalars['String']['input']>;
  rfqEstimatedCost?: InputMaybe<Scalars['Float']['input']>;
  rfqLines?: InputMaybe<Array<RfqLineInput>>;
  rfqNumber?: InputMaybe<Scalars['String']['input']>;
  siteVisitDate?: InputMaybe<Scalars['String']['input']>;
  siteVisitTime?: InputMaybe<Scalars['String']['input']>;
  submissionDate?: InputMaybe<Scalars['String']['input']>;
  submissionTime?: InputMaybe<Scalars['String']['input']>;
};

export type ProjectDailyReport = {
  breakdownDetails?: Maybe<Scalars['String']['output']>;
  clientActions?: Maybe<Scalars['JSON']['output']>;
  constructionProgress?: Maybe<Scalars['JSON']['output']>;
  costStatus?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  createdByName?: Maybe<Scalars['String']['output']>;
  deliveriesReceived?: Maybe<Scalars['JSON']['output']>;
  engineeringDeliverables?: Maybe<Scalars['JSON']['output']>;
  engineeringIssues?: Maybe<Scalars['String']['output']>;
  engineeringProgress?: Maybe<Scalars['JSON']['output']>;
  equipmentUtilization?: Maybe<Scalars['JSON']['output']>;
  files: Array<RfqPhaseFile>;
  id: Scalars['ID']['output'];
  keyAccomplishments?: Maybe<Scalars['String']['output']>;
  lookaheadCommissioning?: Maybe<Scalars['String']['output']>;
  lookaheadConstruction?: Maybe<Scalars['String']['output']>;
  lookaheadEngineering?: Maybe<Scalars['String']['output']>;
  lookaheadProcurement?: Maybe<Scalars['String']['output']>;
  machinery: Array<ProjectDailyReportMachinery>;
  majorConcerns?: Maybe<Scalars['String']['output']>;
  managementComments?: Maybe<Scalars['String']['output']>;
  manpower?: Maybe<Scalars['JSON']['output']>;
  ncrStatus?: Maybe<Scalars['JSON']['output']>;
  preparedBy?: Maybe<Scalars['String']['output']>;
  procurementConcerns?: Maybe<Scalars['String']['output']>;
  procurementItems?: Maybe<Scalars['JSON']['output']>;
  progressMetrics?: Maybe<Scalars['JSON']['output']>;
  projectId: Scalars['ID']['output'];
  qcInspections?: Maybe<Scalars['JSON']['output']>;
  qualityRemarks?: Maybe<Scalars['String']['output']>;
  qualityStatus?: Maybe<Scalars['String']['output']>;
  reportDate: Scalars['String']['output'];
  reportNumber: Scalars['String']['output'];
  reviewedBy?: Maybe<Scalars['String']['output']>;
  risksIssues?: Maybe<Scalars['JSON']['output']>;
  safetyActivities?: Maybe<Scalars['JSON']['output']>;
  safetyRemarks?: Maybe<Scalars['String']['output']>;
  safetyStats?: Maybe<Scalars['JSON']['output']>;
  safetyStatus?: Maybe<Scalars['String']['output']>;
  scheduleStatus?: Maybe<Scalars['String']['output']>;
  temperature?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
  weatherConditions?: Maybe<Scalars['String']['output']>;
};

export type ProjectDailyReportMachinery = {
  breakdownHours?: Maybe<Scalars['Float']['output']>;
  compliant: Scalars['Boolean']['output'];
  createdAt: Scalars['String']['output'];
  createdByName?: Maybe<Scalars['String']['output']>;
  dailyReportId: Scalars['ID']['output'];
  equipmentDescription?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  idleHours?: Maybe<Scalars['Float']['output']>;
  livePhotoDownloadUrl?: Maybe<Scalars['String']['output']>;
  livePhotoFileId?: Maybe<Scalars['ID']['output']>;
  livePhotoFilename?: Maybe<Scalars['String']['output']>;
  poId: Scalars['ID']['output'];
  poNumber?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  workingHours?: Maybe<Scalars['Float']['output']>;
};

export type ProjectDrawing = {
  createdAt: Scalars['String']['output'];
  discipline?: Maybe<Scalars['String']['output']>;
  downloadUrl?: Maybe<Scalars['String']['output']>;
  drawingNumber: Scalars['String']['output'];
  fileId?: Maybe<Scalars['ID']['output']>;
  filename?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  issueDate?: Maybe<Scalars['String']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  paperSize?: Maybe<Scalars['String']['output']>;
  parentDrawingId?: Maybe<Scalars['ID']['output']>;
  projectId: Scalars['ID']['output'];
  revision?: Maybe<Scalars['String']['output']>;
  revisions: Array<ProjectDrawing>;
  scale?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  uploadedByName?: Maybe<Scalars['String']['output']>;
};

export type ProjectHseRecord = {
  approvedBy?: Maybe<Scalars['String']['output']>;
  attendeeCount?: Maybe<Scalars['Int']['output']>;
  attendeeNames?: Maybe<Scalars['String']['output']>;
  conductedBy?: Maybe<Scalars['String']['output']>;
  correctiveAction?: Maybe<Scalars['String']['output']>;
  correctiveClosedDate?: Maybe<Scalars['String']['output']>;
  correctiveDueDate?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  createdByName?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  files: Array<RfqPhaseFile>;
  id: Scalars['ID']['output'];
  incidentType?: Maybe<Scalars['String']['output']>;
  injuredPerson?: Maybe<Scalars['String']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  observationType?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  ptwNumber?: Maybe<Scalars['String']['output']>;
  ptwStatus?: Maybe<Scalars['String']['output']>;
  ptwType?: Maybe<Scalars['String']['output']>;
  recordDate: Scalars['String']['output'];
  recordType: Scalars['String']['output'];
  rootCause?: Maybe<Scalars['String']['output']>;
  severity?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
  validFrom?: Maybe<Scalars['String']['output']>;
  validTo?: Maybe<Scalars['String']['output']>;
};

export type ProjectItp = {
  createdAt: Scalars['String']['output'];
  createdByName?: Maybe<Scalars['String']['output']>;
  discipline?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  items: Array<ProjectItpItem>;
  projectId: Scalars['ID']['output'];
  revision: Scalars['String']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
  workPackage?: Maybe<Scalars['String']['output']>;
};

export type ProjectItpItem = {
  acceptanceCriteria?: Maybe<Scalars['String']['output']>;
  activity: Scalars['String']['output'];
  clientRole?: Maybe<Scalars['String']['output']>;
  contractorRole?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  inspectionDate?: Maybe<Scalars['String']['output']>;
  inspectionType: Scalars['String']['output'];
  inspectorName?: Maybe<Scalars['String']['output']>;
  itpId: Scalars['ID']['output'];
  referenceDoc?: Maybe<Scalars['String']['output']>;
  remarks?: Maybe<Scalars['String']['output']>;
  result?: Maybe<Scalars['String']['output']>;
  sequence: Scalars['Int']['output'];
};

export type ProjectInspectionRequest = {
  actualDate?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  files: Array<RfqPhaseFile>;
  id: Scalars['ID']['output'];
  inspectorName?: Maybe<Scalars['String']['output']>;
  irNumber: Scalars['String']['output'];
  itpId?: Maybe<Scalars['ID']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  remarks?: Maybe<Scalars['String']['output']>;
  requestedByName?: Maybe<Scalars['String']['output']>;
  requestedDate: Scalars['String']['output'];
  result?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
  workPackage?: Maybe<Scalars['String']['output']>;
};

export type ProjectInvoice = {
  bankAccountId?: Maybe<Scalars['ID']['output']>;
  billingMethod: Scalars['String']['output'];
  clientName?: Maybe<Scalars['String']['output']>;
  companyAddress?: Maybe<Scalars['String']['output']>;
  companyBranchAddress?: Maybe<Scalars['String']['output']>;
  companyBranchCity?: Maybe<Scalars['String']['output']>;
  companyBranchName?: Maybe<Scalars['String']['output']>;
  companyBranchPhone?: Maybe<Scalars['String']['output']>;
  companyCountry?: Maybe<Scalars['String']['output']>;
  companyEmail?: Maybe<Scalars['String']['output']>;
  companyLegalName?: Maybe<Scalars['String']['output']>;
  companyLetterheadImage?: Maybe<Scalars['String']['output']>;
  companyName?: Maybe<Scalars['String']['output']>;
  companyPhone?: Maybe<Scalars['String']['output']>;
  companyStampImage?: Maybe<Scalars['String']['output']>;
  contractNumber?: Maybe<Scalars['String']['output']>;
  currencyCode: Scalars['String']['output'];
  discountAmount: Scalars['Float']['output'];
  discountPct: Scalars['Float']['output'];
  displayMode: Scalars['String']['output'];
  dueDate: Scalars['String']['output'];
  grossTotal: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  invoiceDate: Scalars['String']['output'];
  invoiceNumber: Scalars['String']['output'];
  lines: Array<ProjectInvoiceLine>;
  netPayable: Scalars['Float']['output'];
  paymentTermsDays?: Maybe<Scalars['Int']['output']>;
  paymentType: Scalars['String']['output'];
  payments: Array<InvoicePayment>;
  projectCode?: Maybe<Scalars['String']['output']>;
  projectName?: Maybe<Scalars['String']['output']>;
  retentionAmount: Scalars['Float']['output'];
  retentionPct?: Maybe<Scalars['Float']['output']>;
  status: Scalars['String']['output'];
  verificationToken?: Maybe<Scalars['String']['output']>;
  whtAmount: Scalars['Float']['output'];
  whtApplies: Scalars['Boolean']['output'];
  whtRate: Scalars['Float']['output'];
  whtScenario?: Maybe<Scalars['String']['output']>;
};

export type ProjectInvoiceInput = {
  billingMethod: Scalars['String']['input'];
  discountAmount?: InputMaybe<Scalars['Float']['input']>;
  discountPct?: InputMaybe<Scalars['Float']['input']>;
  displayMode?: InputMaybe<Scalars['String']['input']>;
  dueDate: Scalars['String']['input'];
  lines: Array<ProjectInvoiceLineInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
  whtApplies?: InputMaybe<Scalars['Boolean']['input']>;
  whtRate?: InputMaybe<Scalars['Float']['input']>;
  whtScenario?: InputMaybe<Scalars['String']['input']>;
};

export type ProjectInvoiceLine = {
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lineNumber: Scalars['Int']['output'];
  lineTotal: Scalars['Float']['output'];
  marginAmount: Scalars['Float']['output'];
  marginPct: Scalars['Float']['output'];
  moComponents?: Maybe<Array<Maybe<MoComponent>>>;
  qty: Scalars['Float']['output'];
  sourceType: Scalars['String']['output'];
  subtotal: Scalars['Float']['output'];
  taxAmount: Scalars['Float']['output'];
  taxPct: Scalars['Float']['output'];
  unitCost: Scalars['Float']['output'];
};

export type ProjectInvoiceLineInput = {
  description: Scalars['String']['input'];
  marginPct?: InputMaybe<Scalars['Float']['input']>;
  qty: Scalars['Float']['input'];
  sourceId?: InputMaybe<Scalars['ID']['input']>;
  sourceType: Scalars['String']['input'];
  taxPct?: InputMaybe<Scalars['Float']['input']>;
  unitCost: Scalars['Float']['input'];
};

export type ProjectList = {
  data: Array<Project>;
  pagination: PaginationMeta;
};

export type ProjectMember = {
  allocatedHours?: Maybe<Scalars['Int']['output']>;
  employeeId: Scalars['ID']['output'];
  endDate?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  role?: Maybe<Scalars['String']['output']>;
  startDate?: Maybe<Scalars['String']['output']>;
};

export type ProjectMilestone = {
  billableAmount: Scalars['Float']['output'];
  currencyCode: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  reachedAt?: Maybe<Scalars['String']['output']>;
  sequence: Scalars['Int']['output'];
  status: Scalars['String']['output'];
};

export type ProjectNcr = {
  closedByName?: Maybe<Scalars['String']['output']>;
  closedDate?: Maybe<Scalars['String']['output']>;
  correctiveAction?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  dueDate?: Maybe<Scalars['String']['output']>;
  files: Array<RfqPhaseFile>;
  id: Scalars['ID']['output'];
  location?: Maybe<Scalars['String']['output']>;
  ncrNumber: Scalars['String']['output'];
  preventiveAction?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  raisedByName?: Maybe<Scalars['String']['output']>;
  raisedDate: Scalars['String']['output'];
  rootCause?: Maybe<Scalars['String']['output']>;
  severity: Scalars['String']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
  workPackage?: Maybe<Scalars['String']['output']>;
};

export type ProjectProfitRow = {
  actualCost: Scalars['Float']['output'];
  budget: Scalars['Float']['output'];
  code: Scalars['String']['output'];
  companyName: Scalars['String']['output'];
  costBreakdown: Array<CostBreakdownItem>;
  id: Scalars['ID']['output'];
  margin: Scalars['Float']['output'];
  marginPct: Scalars['Float']['output'];
  name: Scalars['String']['output'];
  projectType?: Maybe<Scalars['String']['output']>;
  revenue: Scalars['Float']['output'];
  status: Scalars['String']['output'];
};

export type ProjectProfitabilityRow = {
  budget_amount: Scalars['String']['output'];
  budget_remaining: Scalars['String']['output'];
  code: Scalars['String']['output'];
  gross_margin: Scalars['String']['output'];
  name: Scalars['String']['output'];
  project_id: Scalars['ID']['output'];
  project_type: Scalars['String']['output'];
  status: Scalars['String']['output'];
  total_costs: Scalars['String']['output'];
  total_revenue: Scalars['String']['output'];
};

export type ProjectRfi = {
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  drawingRef?: Maybe<Scalars['String']['output']>;
  files: Array<RfqPhaseFile>;
  id: Scalars['ID']['output'];
  projectId: Scalars['ID']['output'];
  raisedByName?: Maybe<Scalars['String']['output']>;
  raisedDate: Scalars['String']['output'];
  requiredDate?: Maybe<Scalars['String']['output']>;
  respondedByName?: Maybe<Scalars['String']['output']>;
  respondedDate?: Maybe<Scalars['String']['output']>;
  response?: Maybe<Scalars['String']['output']>;
  rfiNumber: Scalars['String']['output'];
  specRef?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  subject: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type ProjectResource = {
  costPerUnit: Scalars['Float']['output'];
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  maxUnitsPerDay: Scalars['Float']['output'];
  name: Scalars['String']['output'];
  projectId: Scalars['ID']['output'];
  resourceType: Scalars['String']['output'];
  unit: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type ProjectScatter = {
  actualCost: Scalars['Float']['output'];
  budget: Scalars['Float']['output'];
  client_name?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  marginPct: Scalars['Float']['output'];
  name: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type ProjectSiteInstruction = {
  acknowledgedByName?: Maybe<Scalars['String']['output']>;
  acknowledgedDate?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  files: Array<RfqPhaseFile>;
  id: Scalars['ID']['output'];
  issuedBy?: Maybe<Scalars['String']['output']>;
  issuedDate: Scalars['String']['output'];
  potentialVo: Scalars['Boolean']['output'];
  projectId: Scalars['ID']['output'];
  siNumber: Scalars['String']['output'];
  status: Scalars['String']['output'];
  subject: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
  voRef?: Maybe<Scalars['String']['output']>;
};

export type ProjectStage = {
  actualEndDate?: Maybe<Scalars['String']['output']>;
  actualStartDate?: Maybe<Scalars['String']['output']>;
  completionPct: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  plannedEndDate?: Maybe<Scalars['String']['output']>;
  plannedStartDate?: Maybe<Scalars['String']['output']>;
  sequence: Scalars['Int']['output'];
  status: Scalars['String']['output'];
};

export type ProjectTq = {
  closedAt?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  discipline?: Maybe<Scalars['String']['output']>;
  documentId?: Maybe<Scalars['ID']['output']>;
  documentRef?: Maybe<Scalars['String']['output']>;
  documentRevision?: Maybe<Scalars['String']['output']>;
  dueDate?: Maybe<Scalars['String']['output']>;
  files: Array<RfqPhaseFile>;
  id: Scalars['ID']['output'];
  isOverdue: Scalars['Boolean']['output'];
  priority: Scalars['String']['output'];
  projectId: Scalars['ID']['output'];
  raisedBy?: Maybe<Scalars['String']['output']>;
  raisedDate?: Maybe<Scalars['String']['output']>;
  response?: Maybe<Scalars['String']['output']>;
  responseBy?: Maybe<Scalars['String']['output']>;
  responseDate?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  subject: Scalars['String']['output'];
  tqNumber: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type ProjectTeamMember = {
  employee_id: Scalars['ID']['output'];
  employee_name: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  role: Scalars['String']['output'];
};

export type ProjectUpdateInput = {
  budgetAmount?: InputMaybe<Scalars['Float']['input']>;
  budgetCurrency?: InputMaybe<Scalars['String']['input']>;
  clientContact?: InputMaybe<Scalars['String']['input']>;
  clientName?: InputMaybe<Scalars['String']['input']>;
  contractName?: InputMaybe<Scalars['String']['input']>;
  costCenterId?: InputMaybe<Scalars['ID']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  plannedEndDate?: InputMaybe<Scalars['String']['input']>;
  plannedStartDate?: InputMaybe<Scalars['String']['input']>;
  projectLocation?: InputMaybe<Scalars['String']['input']>;
  projectManagerId?: InputMaybe<Scalars['ID']['input']>;
  projectType?: InputMaybe<Scalars['String']['input']>;
  projectValue?: InputMaybe<Scalars['Float']['input']>;
  projectValueCurrency?: InputMaybe<Scalars['String']['input']>;
  questionDate?: InputMaybe<Scalars['String']['input']>;
  questionTime?: InputMaybe<Scalars['String']['input']>;
  receivingDate?: InputMaybe<Scalars['String']['input']>;
  remarks?: InputMaybe<Scalars['String']['input']>;
  rfqEstimatedCost?: InputMaybe<Scalars['Float']['input']>;
  rfqNumber?: InputMaybe<Scalars['String']['input']>;
  rfqOutcome?: InputMaybe<Scalars['String']['input']>;
  rfqOutcomeReason?: InputMaybe<Scalars['String']['input']>;
  siteVisitDate?: InputMaybe<Scalars['String']['input']>;
  siteVisitTime?: InputMaybe<Scalars['String']['input']>;
  submissionDate?: InputMaybe<Scalars['String']['input']>;
  submissionTime?: InputMaybe<Scalars['String']['input']>;
};

export type PunchItem = {
  area?: Maybe<Scalars['String']['output']>;
  category: Scalars['String']['output'];
  closedAt?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  discipline?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isOverdue: Scalars['Boolean']['output'];
  photoCount: Scalars['Int']['output'];
  photos: Array<PunchPhoto>;
  pmSignedAt?: Maybe<Scalars['String']['output']>;
  pmSignedBy?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  punchNo: Scalars['String']['output'];
  raisedBy?: Maybe<Scalars['String']['output']>;
  raisedDate?: Maybe<Scalars['String']['output']>;
  responsible?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  subcontractor?: Maybe<Scalars['String']['output']>;
  supervisorSignedAt?: Maybe<Scalars['String']['output']>;
  supervisorSignedBy?: Maybe<Scalars['String']['output']>;
  targetDate?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type PunchPhoto = {
  caption?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  fileId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  punchId: Scalars['ID']['output'];
  uploadedBy?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type PurchaseOrder = {
  analytic_account_id?: Maybe<Scalars['ID']['output']>;
  analytic_account_name?: Maybe<Scalars['String']['output']>;
  approval_log?: Maybe<Array<PoApprovalLogEntry>>;
  assigned_approver_id?: Maybe<Scalars['ID']['output']>;
  assigned_buyer_name?: Maybe<Scalars['String']['output']>;
  assigned_buyer_user_id?: Maybe<Scalars['ID']['output']>;
  assigned_receiver_id?: Maybe<Scalars['ID']['output']>;
  assigned_receiver_name?: Maybe<Scalars['String']['output']>;
  assigned_to_email?: Maybe<Scalars['String']['output']>;
  base_currency_code?: Maybe<Scalars['String']['output']>;
  branch_id?: Maybe<Scalars['ID']['output']>;
  branch_name?: Maybe<Scalars['String']['output']>;
  buyerNames?: Maybe<Array<Scalars['String']['output']>>;
  callerHasMarketPricingPosition?: Maybe<Scalars['Boolean']['output']>;
  callerHasStoreKeeperPosition?: Maybe<Scalars['Boolean']['output']>;
  callerHasStorePricingPosition?: Maybe<Scalars['Boolean']['output']>;
  callerIsBuyer?: Maybe<Scalars['Boolean']['output']>;
  callerIsFinanceTeam?: Maybe<Scalars['Boolean']['output']>;
  company_name?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['String']['output'];
  created_by_email?: Maybe<Scalars['String']['output']>;
  currencyTotals: Array<RequisitionCurrencyTotal>;
  currency_code: Scalars['String']['output'];
  delivery_destination?: Maybe<Scalars['String']['output']>;
  edit_requests?: Maybe<Array<PoEditRequest>>;
  expected_delivery_date?: Maybe<Scalars['String']['output']>;
  funding_advance_id?: Maybe<Scalars['ID']['output']>;
  funding_advance_number?: Maybe<Scalars['String']['output']>;
  funding_decided?: Maybe<Scalars['Boolean']['output']>;
  funding_employee_name?: Maybe<Scalars['String']['output']>;
  funding_source?: Maybe<Scalars['String']['output']>;
  fx_rate?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  invoice_count: Scalars['Int']['output'];
  isLegacyNoPurchaseRecord: Scalars['Boolean']['output'];
  itemSearchText?: Maybe<Scalars['String']['output']>;
  lines?: Maybe<Array<PoLine>>;
  linkedMoId?: Maybe<Scalars['ID']['output']>;
  linkedProjectId?: Maybe<Scalars['ID']['output']>;
  machineryPhotoAlert: Scalars['Boolean']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  organizerName?: Maybe<Scalars['String']['output']>;
  organizer_id?: Maybe<Scalars['ID']['output']>;
  pdf_path?: Maybe<Scalars['String']['output']>;
  po_number: Scalars['String']['output'];
  priority: Scalars['String']['output'];
  procurement_2nd_id?: Maybe<Scalars['ID']['output']>;
  procurement_officer_id?: Maybe<Scalars['ID']['output']>;
  projectCode?: Maybe<Scalars['String']['output']>;
  projectName?: Maybe<Scalars['String']['output']>;
  project_id?: Maybe<Scalars['ID']['output']>;
  purpose?: Maybe<Scalars['String']['output']>;
  receipts?: Maybe<Array<PoReceipt>>;
  requisitionNumber?: Maybe<Scalars['String']['output']>;
  requisition_id?: Maybe<Scalars['ID']['output']>;
  status: Scalars['String']['output'];
  store_keeper_id?: Maybe<Scalars['ID']['output']>;
  store_pricing_id?: Maybe<Scalars['ID']['output']>;
  submitted_at?: Maybe<Scalars['String']['output']>;
  subtotal?: Maybe<Scalars['String']['output']>;
  tax_amount?: Maybe<Scalars['String']['output']>;
  total_amount: Scalars['String']['output'];
  updated_at: Scalars['String']['output'];
  vendor_id?: Maybe<Scalars['ID']['output']>;
  vendor_name?: Maybe<Scalars['String']['output']>;
  viewerCanSeeTotals?: Maybe<Scalars['Boolean']['output']>;
  viewerRestricted?: Maybe<Scalars['Boolean']['output']>;
};

export type Query = {
  account?: Maybe<Account>;
  accountLedger?: Maybe<AccountLedgerPage>;
  accountingPeriods: Array<AccountingPeriod>;
  accounts?: Maybe<Array<Maybe<Account>>>;
  activityFeed: Array<ActivityEvent>;
  analyticAccounts: Array<AnalyticAccount>;
  attendanceCalendar?: Maybe<Array<Maybe<AttendanceDaySummary>>>;
  attendanceLogs?: Maybe<Array<Maybe<AttendanceLog>>>;
  attendanceSummary?: Maybe<EmployeeMonthSummary>;
  attendanceSummaryReport: AttendanceSummary;
  auditLog: AuditLogPage;
  auditTrail: Array<AuditLogEntry>;
  availableInvoiceCosts: AvailableCosts;
  balanceSheet?: Maybe<BalanceSheetReport>;
  bankAccounts: Array<BankAccount>;
  bankDetailsSummary?: Maybe<BankDetailsSummary>;
  bidCommercialSummary?: Maybe<BidCommercialSummary>;
  bidCostItems: Array<BidCostItem>;
  bidDeliverables: Array<BidDeliverable>;
  bidPackageFiles: Array<BidPackageFile>;
  bidSupplierQuotations: Array<BidSupplierQuotation>;
  bom?: Maybe<Bom>;
  boms: Array<Bom>;
  centralWarehouseLocations: Array<StockLocation>;
  clientDocuments: Array<ClientDocument>;
  companies: Array<CompanyDetail>;
  company?: Maybe<CompanyDetail>;
  companyBranches: Array<CompanyBranch>;
  companyIntercoPricingSettings?: Maybe<CompanyIntercoPricingSettings>;
  companyUsers: Array<CompanyUser>;
  consolidatedBS: ConsolidatedBsResult;
  consolidatedPL: ConsolidatedPlResult;
  consolidatedTrialBalance: ConsolidatedTbResult;
  costCenters: Array<CostCenter>;
  dashboardKPIs: DashboardKpIs;
  departments?: Maybe<Array<Maybe<Department>>>;
  docComments: Array<DocComment>;
  docDistributionMatrix: Array<DocDistributionEntry>;
  employee?: Maybe<Employee>;
  employeeCurrentShift?: Maybe<EmployeeShift>;
  employeeSalaryConfig?: Maybe<SalaryConfig>;
  employees?: Maybe<Array<Maybe<Employee>>>;
  engClientComments: Array<EngClientComment>;
  engineeringDocuments: Array<EngineeringDoc>;
  engineeringRevisions: Array<EngineeringRevision>;
  entityAttachments: Array<DocumentAttachment>;
  equipmentAsset?: Maybe<EquipmentAsset>;
  equipmentAssets: Array<EquipmentAsset>;
  executiveDashboard: ExecutiveDashboardData;
  fileDownloadUrl: DownloadUrlPayload;
  findEmployeeAcrossCompanies?: Maybe<EmployeeCrossCompanyMatch>;
  fxExposureReport: FxExposureReport;
  fxRateChangeLog: Array<FxRateChange>;
  fxRateStaleness: FxRateStalenessOverview;
  fxRates: Array<FxRate>;
  fxSyncHistory: Array<FxSyncLog>;
  groupChartOfAccounts: Array<GroupAccount>;
  health?: Maybe<Scalars['String']['output']>;
  intercoPricingConfigHistory: Array<IntercoPricingHistory>;
  intercoStockTransfer?: Maybe<IntercoStockTransferDetail>;
  intercoStockTransfers: IntercoStockTransferPage;
  intercoTransaction?: Maybe<IntercoTransactionDetail>;
  intercoTransactions: IntercoTransactionPage;
  inventoryValuationReport: InventoryValuation;
  journalEntries?: Maybe<Array<Maybe<JournalEntry>>>;
  journalEntry?: Maybe<JournalEntry>;
  leaveBalances?: Maybe<Array<Maybe<LeaveBalance>>>;
  leaveRequest?: Maybe<LeaveRequest>;
  leaveRequests?: Maybe<Array<Maybe<LeaveRequest>>>;
  leaveTypes?: Maybe<Array<Maybe<LeaveType>>>;
  lifecycleConfig: LifecycleConfig;
  maintenanceRecords: Array<MaintenanceRecord>;
  maintenanceSchedules: Array<MaintenanceSchedule>;
  manufacturingOrder?: Maybe<ManufacturingOrder>;
  manufacturingOrders: Array<ManufacturingOrder>;
  manufacturingRequest?: Maybe<ManufacturingRequest>;
  manufacturingRequests: Array<ManufacturingRequest>;
  materialIssue?: Maybe<MaterialIssue>;
  materialIssues: Array<MaterialIssue>;
  materialReturns: Array<MaterialReturn>;
  moCostAnalysis: MoCostAnalysis;
  moMissingComponents: Array<MoComponentStatus>;
  myActivityFeed: Array<ActivityEvent>;
  myCompanies: Array<CompanyRef>;
  myPOQueue?: Maybe<Array<PurchaseOrder>>;
  myPayslips?: Maybe<Array<Maybe<Payslip>>>;
  myPreferences: MyPreferences;
  myProfile: MyProfile;
  myProjects: Array<MyProjectSummary>;
  myRequisitionApprovalQueue: Array<Requisition>;
  mySessions: Array<MySession>;
  notifications?: Maybe<Array<Maybe<Notification>>>;
  outboxDLQ: DlqPage;
  outboxDLQEntry?: Maybe<DlqEntry>;
  outboxEventConfigs: Array<OutboxEventConfig>;
  outboxEvents: OutboxEventPage;
  outboxMonitor: OutboxMonitorSummary;
  overdueMaintenanceCount: Scalars['Int']['output'];
  overtimeRequests?: Maybe<Array<Maybe<OvertimeLog>>>;
  paymentVoucher?: Maybe<PaymentVoucher>;
  paymentVouchers: Array<PaymentVoucher>;
  payrollCostReport: PayrollCostReport;
  payrollRun?: Maybe<PayrollRun>;
  payrollRuns?: Maybe<Array<Maybe<PayrollRun>>>;
  payrollTaxReport: PayrollTaxReport;
  payslip?: Maybe<Payslip>;
  payslips?: Maybe<Array<Maybe<Payslip>>>;
  pendingProductCatalogItems: Array<PendingProductCatalogItem>;
  poFxRates: PoFxRatesResult;
  poLineComments: Array<PoLineComment>;
  poPositions: Array<PoPositionAssignment>;
  poReceipt?: Maybe<PoReceipt>;
  poReceipts: Array<PoReceipt>;
  poStockAvailability: Array<PoLineAvailability>;
  previewTransferPrice: TransferPricePreview;
  product?: Maybe<Product>;
  products?: Maybe<Array<Maybe<Product>>>;
  profitLoss?: Maybe<ProfitLossReport>;
  project?: Maybe<Project>;
  projectActivities: Array<ProjectActivity>;
  projectBaselines: Array<ProjectBaseline>;
  projectCashFlow: Array<CashFlowPeriod>;
  projectClientBillings: Array<ClientBilling>;
  projectCommittedCosts: Array<CommittedCost>;
  projectCompletionBlockers: ProjectCompletionBlockers;
  projectContract?: Maybe<ProjectContract>;
  projectContracts: Array<ProjectContract>;
  projectCostCodes: Array<CostCode>;
  projectCostForecast: Array<CostForecast>;
  projectCostSummary: CostControlSummary;
  projectDailyReports: Array<ProjectDailyReport>;
  projectDependencies: Array<ActivityDependency>;
  projectDrawings: Array<ProjectDrawing>;
  projectEVM: EvmData;
  projectEquipmentLog: Array<EquipmentLog>;
  projectHSERecords: Array<ProjectHseRecord>;
  projectHandoverCertificates: Array<HandoverCertificate>;
  projectITPs: Array<ProjectItp>;
  projectInspectionRequests: Array<ProjectInspectionRequest>;
  projectInvoice?: Maybe<ProjectInvoice>;
  projectInvoices: Array<ProjectInvoice>;
  projectLaborEntries: Array<LaborEntry>;
  projectMeeting?: Maybe<Meeting>;
  projectMeetings: Array<Meeting>;
  projectNCRs: Array<ProjectNcr>;
  projectProfitability: Array<ProjectProfitabilityRow>;
  projectProfitabilityReport: Array<ProjectProfitRow>;
  projectPunchItem?: Maybe<PunchItem>;
  projectPunchItems: Array<PunchItem>;
  projectRFIs: Array<ProjectRfi>;
  projectResourceCalendar: Array<ResourceCalendarDay>;
  projectResourceLoading: Array<ResourceDayLoading>;
  projectResources: Array<ProjectResource>;
  projectRisk?: Maybe<Risk>;
  projectRisks: Array<Risk>;
  projectSiteInstructions: Array<ProjectSiteInstruction>;
  projectSubcontracts: Array<Subcontract>;
  projectTQ?: Maybe<ProjectTq>;
  projectTQs: Array<ProjectTq>;
  projectTeamMembers: Array<ProjectTeamMember>;
  projectVariationOrder?: Maybe<VariationOrder>;
  projectVariationOrders: Array<VariationOrder>;
  projectWBS: Array<WbsNode>;
  projects: ProjectList;
  purchaseOrder?: Maybe<PurchaseOrder>;
  purchaseOrderForAction?: Maybe<PurchaseOrder>;
  purchaseOrders?: Maybe<Array<Maybe<PurchaseOrder>>>;
  receivablePurchaseOrders: Array<ReceivablePo>;
  recentPurchaseOrders: Array<DashboardPo>;
  rechargeAccounts: RechargeAccountsInfo;
  rechargeBundles: Array<RechargeBundle>;
  rechargeCostCenter?: Maybe<RechargeCostCenterInfo>;
  rechargeMonthlySummary: Array<RechargeMonthlySummaryEntry>;
  rechargeRequest?: Maybe<RechargeRequest>;
  rechargeRequests: Array<RechargeRequest>;
  /** Current lock on a record, or null if unlocked/expired. entityType is free-form (e.g. 'journal_entry', 'purchase_order', 'project_contract', 'project_variation_order'). */
  recordLock?: Maybe<RecordLock>;
  rentalContract?: Maybe<RentalContract>;
  rentalContracts: Array<RentalContract>;
  rentalInvoices: Array<RentalInvoice>;
  requisition?: Maybe<Requisition>;
  requisitionChildPurchaseOrders: Array<PurchaseOrder>;
  requisitionLineProductAvailability: Array<PoLineAvailability>;
  requisitionStockAvailability: Array<PoLineAvailability>;
  requisitions: Array<Requisition>;
  returnableDirectDeliveryLines: Array<ReturnableDirectDeliveryLine>;
  returnableMaterialIssueLines: Array<ReturnableIssueLine>;
  revenueVsTarget: Array<RevenueMonth>;
  rfqLines: Array<RfqLine>;
  rfqPhases: Array<RfqPhase>;
  roleAssignments: Array<UserRole>;
  roleTemplate?: Maybe<RoleTemplate>;
  roleTemplates: Array<RoleTemplate>;
  shiftConfigs?: Maybe<Array<Maybe<ShiftConfig>>>;
  spendByCategory: Array<SpendCategory>;
  stockBalanceSnapshot: StockBalanceSnapshot;
  stockBalances?: Maybe<Array<Maybe<StockBalance>>>;
  stockLocations: Array<StockLocation>;
  stockLot?: Maybe<StockLot>;
  stockLots: Array<StockLot>;
  stockMoves: Array<StockMove>;
  systemHealth: Array<ServiceHealth>;
  trialBalance?: Maybe<Array<Maybe<TrialBalanceLine>>>;
  unreadNotificationCount: Scalars['Int']['output'];
  user?: Maybe<UserDetail>;
  userCompanies: Array<CompanyRef>;
  userInvitations: Array<UserInvitation>;
  userPOPositions: Array<PoPositionAssignment>;
  userPermissions: UserPermissionsResult;
  userSessions: Array<UserSession>;
  users: UserPage;
  vendor?: Maybe<Vendor>;
  vendors?: Maybe<Array<Maybe<Vendor>>>;
  whtReport: WhtReport;
  workCenters: Array<WorkCenter>;
  workLocations?: Maybe<Array<Maybe<WorkLocation>>>;
};


export type QueryAccountArgs = {
  id: Scalars['ID']['input'];
};


export type QueryAccountLedgerArgs = {
  accountId: Scalars['ID']['input'];
  fromDate?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAccountsArgs = {
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};


export type QueryActivityFeedArgs = {
  companyId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAttendanceCalendarArgs = {
  employeeId: Scalars['ID']['input'];
  month: Scalars['String']['input'];
};


export type QueryAttendanceLogsArgs = {
  employee_id?: InputMaybe<Scalars['ID']['input']>;
  from_date?: InputMaybe<Scalars['String']['input']>;
  to_date?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAttendanceSummaryArgs = {
  employeeId: Scalars['ID']['input'];
  month: Scalars['String']['input'];
};


export type QueryAttendanceSummaryReportArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  fromDate: Scalars['String']['input'];
  toDate: Scalars['String']['input'];
};


export type QueryAuditLogArgs = {
  action?: InputMaybe<Scalars['String']['input']>;
  companyId?: InputMaybe<Scalars['ID']['input']>;
  fromDate?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  recordId?: InputMaybe<Scalars['ID']['input']>;
  tableName?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
  userId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryAuditTrailArgs = {
  recordId: Scalars['ID']['input'];
  tableName: Scalars['String']['input'];
};


export type QueryAvailableInvoiceCostsArgs = {
  invoiceId: Scalars['ID']['input'];
  sourceType?: InputMaybe<Scalars['String']['input']>;
};


export type QueryBalanceSheetArgs = {
  asOfDate: Scalars['String']['input'];
};


export type QueryBankDetailsSummaryArgs = {
  employee_id: Scalars['ID']['input'];
};


export type QueryBidCommercialSummaryArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryBidCostItemsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryBidDeliverablesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryBidPackageFilesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryBidSupplierQuotationsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryBomArgs = {
  id: Scalars['ID']['input'];
};


export type QueryBomsArgs = {
  allCompanies?: InputMaybe<Scalars['Boolean']['input']>;
  finishedProductId?: InputMaybe<Scalars['ID']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryCentralWarehouseLocationsArgs = {
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};


export type QueryClientDocumentsArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
};


export type QueryCompanyArgs = {
  id: Scalars['ID']['input'];
};


export type QueryCompanyBranchesArgs = {
  companyId: Scalars['ID']['input'];
};


export type QueryCompanyIntercoPricingSettingsArgs = {
  companyId: Scalars['ID']['input'];
};


export type QueryCompanyUsersArgs = {
  companyId: Scalars['ID']['input'];
};


export type QueryConsolidatedBsArgs = {
  asOfDate: Scalars['String']['input'];
  showEliminations?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryConsolidatedPlArgs = {
  fromDate: Scalars['String']['input'];
  showEliminations?: InputMaybe<Scalars['Boolean']['input']>;
  toDate: Scalars['String']['input'];
};


export type QueryConsolidatedTrialBalanceArgs = {
  asOfDate: Scalars['String']['input'];
};


export type QueryDashboardKpIsArgs = {
  companyId: Scalars['ID']['input'];
};


export type QueryDocCommentsArgs = {
  documentId: Scalars['ID']['input'];
};


export type QueryDocDistributionMatrixArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryEmployeeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryEmployeeCurrentShiftArgs = {
  employee_id: Scalars['ID']['input'];
};


export type QueryEmployeeSalaryConfigArgs = {
  employee_id: Scalars['ID']['input'];
};


export type QueryEmployeesArgs = {
  department_id?: InputMaybe<Scalars['ID']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryEngClientCommentsArgs = {
  documentId: Scalars['ID']['input'];
};


export type QueryEngineeringDocumentsArgs = {
  discipline?: InputMaybe<Scalars['String']['input']>;
  docType?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  status?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type QueryEngineeringRevisionsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryEntityAttachmentsArgs = {
  entityId: Scalars['ID']['input'];
  entityType: Scalars['String']['input'];
};


export type QueryEquipmentAssetArgs = {
  id: Scalars['ID']['input'];
};


export type QueryEquipmentAssetsArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryFileDownloadUrlArgs = {
  disposition?: InputMaybe<Scalars['String']['input']>;
  fileId: Scalars['ID']['input'];
};


export type QueryFindEmployeeAcrossCompaniesArgs = {
  email: Scalars['String']['input'];
};


export type QueryFxExposureReportArgs = {
  asOfDate: Scalars['String']['input'];
  companyId: Scalars['ID']['input'];
};


export type QueryFxRateChangeLogArgs = {
  days?: InputMaybe<Scalars['Int']['input']>;
  fromCurrency?: InputMaybe<Scalars['String']['input']>;
  toCurrency?: InputMaybe<Scalars['String']['input']>;
};


export type QueryFxRatesArgs = {
  fromCurrency?: InputMaybe<Scalars['String']['input']>;
  fromDate?: InputMaybe<Scalars['String']['input']>;
  toCurrency?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
};


export type QueryFxSyncHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryIntercoPricingConfigHistoryArgs = {
  companyId: Scalars['ID']['input'];
};


export type QueryIntercoStockTransferArgs = {
  id: Scalars['ID']['input'];
};


export type QueryIntercoStockTransfersArgs = {
  fromCompanyId?: InputMaybe<Scalars['ID']['input']>;
  fromDate?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  toCompanyId?: InputMaybe<Scalars['ID']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
};


export type QueryIntercoTransactionArgs = {
  id: Scalars['ID']['input'];
};


export type QueryIntercoTransactionsArgs = {
  fromCompanyId?: InputMaybe<Scalars['ID']['input']>;
  fromDate?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  toCompanyId?: InputMaybe<Scalars['ID']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
  transactionType?: InputMaybe<Scalars['String']['input']>;
};


export type QueryInventoryValuationReportArgs = {
  asOfDate: Scalars['String']['input'];
  companyId?: InputMaybe<Scalars['ID']['input']>;
  locationId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryJournalEntriesArgs = {
  from_date?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  to_date?: InputMaybe<Scalars['String']['input']>;
};


export type QueryJournalEntryArgs = {
  id: Scalars['ID']['input'];
};


export type QueryLeaveBalancesArgs = {
  employee_id: Scalars['ID']['input'];
};


export type QueryLeaveRequestArgs = {
  id: Scalars['ID']['input'];
};


export type QueryLeaveRequestsArgs = {
  employee_id?: InputMaybe<Scalars['ID']['input']>;
  from_date?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  to_date?: InputMaybe<Scalars['String']['input']>;
};


export type QueryLeaveTypesArgs = {
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryMaintenanceRecordsArgs = {
  assetId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryMaintenanceSchedulesArgs = {
  assetId?: InputMaybe<Scalars['ID']['input']>;
  fromDate?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
};


export type QueryManufacturingOrderArgs = {
  id: Scalars['ID']['input'];
};


export type QueryManufacturingOrdersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryManufacturingRequestArgs = {
  id: Scalars['ID']['input'];
};


export type QueryManufacturingRequestsArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryMaterialIssueArgs = {
  id: Scalars['ID']['input'];
};


export type QueryMaterialIssuesArgs = {
  poId?: InputMaybe<Scalars['ID']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
  receiptNumber?: InputMaybe<Scalars['String']['input']>;
  requisitionId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryMaterialReturnsArgs = {
  poId?: InputMaybe<Scalars['ID']['input']>;
  productId?: InputMaybe<Scalars['ID']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryMoCostAnalysisArgs = {
  moId: Scalars['ID']['input'];
};


export type QueryMoMissingComponentsArgs = {
  moId: Scalars['ID']['input'];
};


export type QueryMyActivityFeedArgs = {
  companyId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryMyProjectsArgs = {
  companyId: Scalars['ID']['input'];
};


export type QueryNotificationsArgs = {
  is_read?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryOutboxDlqArgs = {
  eventType?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryOutboxDlqEntryArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOutboxEventsArgs = {
  eventType?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  service?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryOvertimeRequestsArgs = {
  employee_id?: InputMaybe<Scalars['ID']['input']>;
  from_date?: InputMaybe<Scalars['String']['input']>;
  to_date?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPaymentVoucherArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPaymentVouchersArgs = {
  fromDate?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPayrollCostReportArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  departmentId?: InputMaybe<Scalars['ID']['input']>;
  fromDate: Scalars['String']['input'];
  toDate: Scalars['String']['input'];
};


export type QueryPayrollRunArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPayrollRunsArgs = {
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPayrollTaxReportArgs = {
  companyId: Scalars['ID']['input'];
  fromDate: Scalars['String']['input'];
  toDate: Scalars['String']['input'];
};


export type QueryPayslipArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPayslipsArgs = {
  employee_id?: InputMaybe<Scalars['ID']['input']>;
  payroll_run_id?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryPoLineCommentsArgs = {
  poId: Scalars['ID']['input'];
};


export type QueryPoPositionsArgs = {
  branchId?: InputMaybe<Scalars['ID']['input']>;
  departmentId?: InputMaybe<Scalars['ID']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryPoReceiptArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPoStockAvailabilityArgs = {
  poId: Scalars['ID']['input'];
};


export type QueryPreviewTransferPriceArgs = {
  fromCompanyId: Scalars['ID']['input'];
  fromLocationId: Scalars['ID']['input'];
  marketPrice?: InputMaybe<Scalars['Float']['input']>;
  productId: Scalars['ID']['input'];
  qty: Scalars['Float']['input'];
};


export type QueryProductArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProductsArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  companyId?: InputMaybe<Scalars['ID']['input']>;
  includeCentralWarehouse?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryProfitLossArgs = {
  costCenterId?: InputMaybe<Scalars['ID']['input']>;
  fromDate: Scalars['String']['input'];
  toDate: Scalars['String']['input'];
};


export type QueryProjectArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectActivitiesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectBaselinesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectCashFlowArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectClientBillingsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectCommittedCostsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectCompletionBlockersArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectContractArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectContractsArgs = {
  projectId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectCostCodesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectCostForecastArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectCostSummaryArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectDailyReportsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectDependenciesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectDrawingsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectEvmArgs = {
  projectId: Scalars['ID']['input'];
  statusDate?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectEquipmentLogArgs = {
  endDate?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  startDate?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectHseRecordsArgs = {
  projectId: Scalars['ID']['input'];
  recordType?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectHandoverCertificatesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectItPsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectInspectionRequestsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectInvoiceArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectInvoicesArgs = {
  contractId?: InputMaybe<Scalars['ID']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectLaborEntriesArgs = {
  endDate?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  startDate?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectMeetingArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectMeetingsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectNcRsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectProfitabilityArgs = {
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectProfitabilityReportArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  fromDate?: InputMaybe<Scalars['String']['input']>;
  projectType?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  toDate?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectPunchItemArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectPunchItemsArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  discipline?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  subcontractor?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectRfIsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectResourceCalendarArgs = {
  resourceId: Scalars['ID']['input'];
};


export type QueryProjectResourceLoadingArgs = {
  endDate: Scalars['String']['input'];
  projectId: Scalars['ID']['input'];
  resourceId: Scalars['ID']['input'];
  startDate: Scalars['String']['input'];
};


export type QueryProjectResourcesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectRiskArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectRisksArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  level?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectSiteInstructionsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectSubcontractsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectTqArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectTQsArgs = {
  discipline?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectTeamMembersArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectVariationOrderArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectVariationOrdersArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectWbsArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryProjectsArgs = {
  includeAll?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  myProjectsOnly?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  projectManagerId?: InputMaybe<Scalars['ID']['input']>;
  projectType?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type QueryPurchaseOrderArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPurchaseOrderForActionArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPurchaseOrdersArgs = {
  myPOsOnly?: InputMaybe<Scalars['Boolean']['input']>;
  product_id?: InputMaybe<Scalars['ID']['input']>;
  project_id?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  vendor_id?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryReceivablePurchaseOrdersArgs = {
  projectId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryRecentPurchaseOrdersArgs = {
  companyId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryRechargeBundlesArgs = {
  activeOnly?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryRechargeMonthlySummaryArgs = {
  month?: InputMaybe<Scalars['Int']['input']>;
  year?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryRechargeRequestArgs = {
  id: Scalars['ID']['input'];
};


export type QueryRechargeRequestsArgs = {
  scope?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRecordLockArgs = {
  entityId: Scalars['ID']['input'];
  entityType: Scalars['String']['input'];
};


export type QueryRentalContractArgs = {
  id: Scalars['ID']['input'];
};


export type QueryRentalContractsArgs = {
  projectId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRentalInvoicesArgs = {
  contractId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRequisitionArgs = {
  id: Scalars['ID']['input'];
};


export type QueryRequisitionChildPurchaseOrdersArgs = {
  requisitionId: Scalars['ID']['input'];
};


export type QueryRequisitionLineProductAvailabilityArgs = {
  overrides: Array<LineProductOverrideInput>;
  requisitionId: Scalars['ID']['input'];
};


export type QueryRequisitionStockAvailabilityArgs = {
  requisitionId: Scalars['ID']['input'];
};


export type QueryRequisitionsArgs = {
  branchId?: InputMaybe<Scalars['ID']['input']>;
  myQueueOnly?: InputMaybe<Scalars['Boolean']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryReturnableDirectDeliveryLinesArgs = {
  poId?: InputMaybe<Scalars['ID']['input']>;
  productId?: InputMaybe<Scalars['ID']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryReturnableMaterialIssueLinesArgs = {
  poId?: InputMaybe<Scalars['ID']['input']>;
  productId?: InputMaybe<Scalars['ID']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryRevenueVsTargetArgs = {
  companyId: Scalars['ID']['input'];
};


export type QueryRfqLinesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryRfqPhasesArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryRoleAssignmentsArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  userId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryRoleTemplateArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySpendByCategoryArgs = {
  companyId: Scalars['ID']['input'];
};


export type QueryStockBalancesArgs = {
  location_id?: InputMaybe<Scalars['ID']['input']>;
  product_id?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryStockLocationsArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};


export type QueryStockLotArgs = {
  id: Scalars['ID']['input'];
};


export type QueryStockLotsArgs = {
  productId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryStockMovesArgs = {
  fromDate?: InputMaybe<Scalars['String']['input']>;
  fromLocationId?: InputMaybe<Scalars['ID']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  productId?: InputMaybe<Scalars['ID']['input']>;
  sourceType?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
  toLocationId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryTrialBalanceArgs = {
  as_of_date?: InputMaybe<Scalars['String']['input']>;
};


export type QueryUserArgs = {
  id: Scalars['ID']['input'];
};


export type QueryUserCompaniesArgs = {
  userId: Scalars['ID']['input'];
};


export type QueryUserInvitationsArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryUserPoPositionsArgs = {
  userId: Scalars['ID']['input'];
};


export type QueryUserPermissionsArgs = {
  companyId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type QueryUserSessionsArgs = {
  userId: Scalars['ID']['input'];
};


export type QueryUsersArgs = {
  companyId?: InputMaybe<Scalars['ID']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryVendorArgs = {
  id: Scalars['ID']['input'];
};


export type QueryWhtReportArgs = {
  companyId: Scalars['ID']['input'];
  fromDate: Scalars['String']['input'];
  toDate: Scalars['String']['input'];
};


export type QueryWorkCentersArgs = {
  allCompanies?: InputMaybe<Scalars['Boolean']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryWorkLocationsArgs = {
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
};

export type RfqLine = {
  bidUnitPrice?: Maybe<Scalars['Float']['output']>;
  description: Scalars['String']['output'];
  discipline?: Maybe<Scalars['String']['output']>;
  drawingRef?: Maybe<Scalars['String']['output']>;
  engineeringRef?: Maybe<Scalars['String']['output']>;
  estimatedUnitCost?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  phaseLabel?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  quantity?: Maybe<Scalars['Float']['output']>;
  sequence: Scalars['Int']['output'];
  specSection?: Maybe<Scalars['String']['output']>;
  unit?: Maybe<Scalars['String']['output']>;
};

export type RfqLineInput = {
  bidUnitPrice?: InputMaybe<Scalars['Float']['input']>;
  description: Scalars['String']['input'];
  discipline?: InputMaybe<Scalars['String']['input']>;
  drawingRef?: InputMaybe<Scalars['String']['input']>;
  engineeringRef?: InputMaybe<Scalars['String']['input']>;
  estimatedUnitCost?: InputMaybe<Scalars['Float']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  phaseLabel?: InputMaybe<Scalars['String']['input']>;
  quantity?: InputMaybe<Scalars['Float']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  specSection?: InputMaybe<Scalars['String']['input']>;
  unit?: InputMaybe<Scalars['String']['input']>;
};

export type RfqPhase = {
  fileCount: Scalars['Int']['output'];
  files: Array<RfqPhaseFile>;
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  phaseType: Scalars['String']['output'];
  projectId: Scalars['ID']['output'];
  sequence: Scalars['Int']['output'];
  serviceType: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type RfqPhaseFile = {
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  downloadUrl?: Maybe<Scalars['String']['output']>;
  fileId: Scalars['String']['output'];
  filename: Scalars['String']['output'];
  id: Scalars['String']['output'];
  mimeType: Scalars['String']['output'];
  sizeBytes: Scalars['Int']['output'];
  title?: Maybe<Scalars['String']['output']>;
};

export type ReceiptInput = {
  lines: Array<ReceiptLineInput>;
  location_id?: InputMaybe<Scalars['ID']['input']>;
  location_notes?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  receipt_date: Scalars['String']['input'];
  received_by_name?: InputMaybe<Scalars['String']['input']>;
  received_from_name?: InputMaybe<Scalars['String']['input']>;
};

export type ReceiptLineInput = {
  actual_unit_price?: InputMaybe<Scalars['Float']['input']>;
  po_line_id: Scalars['ID']['input'];
  qty_received: Scalars['Float']['input'];
};

export type ReceiptPhoto = {
  category: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  downloadUrl?: Maybe<Scalars['String']['output']>;
  fileId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  label?: Maybe<Scalars['String']['output']>;
  originalFilename: Scalars['String']['output'];
};

export type ReceivablePo = {
  id: Scalars['ID']['output'];
  po_number: Scalars['String']['output'];
  projectCode?: Maybe<Scalars['String']['output']>;
  projectName?: Maybe<Scalars['String']['output']>;
  project_id?: Maybe<Scalars['ID']['output']>;
  status: Scalars['String']['output'];
  vendor_name?: Maybe<Scalars['String']['output']>;
};

export type RechargeAccountsInfo = {
  expenseAccountCode?: Maybe<Scalars['String']['output']>;
  expenseAccountId?: Maybe<Scalars['ID']['output']>;
  expenseAccountName?: Maybe<Scalars['String']['output']>;
  fundingAccountCode?: Maybe<Scalars['String']['output']>;
  fundingAccountId?: Maybe<Scalars['ID']['output']>;
  fundingAccountName?: Maybe<Scalars['String']['output']>;
};

export type RechargeBundle = {
  amount: Scalars['Float']['output'];
  companyId: Scalars['ID']['output'];
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  sortOrder: Scalars['Int']['output'];
};

export type RechargeBundleInput = {
  amount: Scalars['Float']['input'];
  currencyCode?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
};

export type RechargeCostCenterInfo = {
  code: Scalars['String']['output'];
  defaultFulfillerEmail?: Maybe<Scalars['String']['output']>;
  defaultFulfillerEmail2?: Maybe<Scalars['String']['output']>;
  defaultFulfillerId?: Maybe<Scalars['ID']['output']>;
  defaultFulfillerId2?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type RechargeMonthlySummaryEntry = {
  currencyCode: Scalars['String']['output'];
  requestCount: Scalars['Int']['output'];
  requestedBy?: Maybe<Scalars['ID']['output']>;
  requestedByEmail?: Maybe<Scalars['String']['output']>;
  requests: Array<RechargeRequest>;
  totalAmount: Scalars['Float']['output'];
};

export type RechargeRequest = {
  approvedAt?: Maybe<Scalars['String']['output']>;
  approvedBy?: Maybe<Scalars['ID']['output']>;
  approvedByEmail?: Maybe<Scalars['String']['output']>;
  bundleAmount?: Maybe<Scalars['Float']['output']>;
  bundleCurrencyCode?: Maybe<Scalars['String']['output']>;
  bundleId: Scalars['ID']['output'];
  bundleName?: Maybe<Scalars['String']['output']>;
  companyId: Scalars['ID']['output'];
  companyName?: Maybe<Scalars['String']['output']>;
  confirmedAt?: Maybe<Scalars['String']['output']>;
  costCenterId: Scalars['ID']['output'];
  costCenterName?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['ID']['output'];
  createdByEmail?: Maybe<Scalars['String']['output']>;
  fulfilledAt?: Maybe<Scalars['String']['output']>;
  fulfilledBy?: Maybe<Scalars['ID']['output']>;
  fulfilledByEmail?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  phoneNumber: Scalars['String']['output'];
  photoDownloadUrl?: Maybe<Scalars['String']['output']>;
  photoPendingConfirmation: Scalars['Boolean']['output'];
  rejectionReason?: Maybe<Scalars['String']['output']>;
  requestedBy?: Maybe<Scalars['ID']['output']>;
  requestedByEmail?: Maybe<Scalars['String']['output']>;
  requestedForName?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type RechargeRequestInput = {
  bundleId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  phoneNumber: Scalars['String']['input'];
  requestedForName?: InputMaybe<Scalars['String']['input']>;
  requestedForUserId?: InputMaybe<Scalars['ID']['input']>;
};

export type RecordLinePurchaseInput = {
  actualUnitPrice: Scalars['Float']['input'];
  currencyCode: Scalars['String']['input'];
  lineId: Scalars['ID']['input'];
  qty: Scalars['Float']['input'];
  receiptFileId?: InputMaybe<Scalars['ID']['input']>;
  vendorId: Scalars['ID']['input'];
};

export type RecordLock = {
  entityId: Scalars['ID']['output'];
  entityType: Scalars['String']['output'];
  lockedAt: Scalars['String']['output'];
  lockedBy: Scalars['ID']['output'];
  lockedByMe: Scalars['Boolean']['output'];
  lockedByName: Scalars['String']['output'];
};

export type RentalContract = {
  asset_id?: Maybe<Scalars['ID']['output']>;
  asset_name?: Maybe<Scalars['String']['output']>;
  billing_cycle: Scalars['String']['output'];
  client_contact?: Maybe<Scalars['String']['output']>;
  client_name?: Maybe<Scalars['String']['output']>;
  contract_number: Scalars['String']['output'];
  currency_code?: Maybe<Scalars['String']['output']>;
  deposit_amount?: Maybe<Scalars['Float']['output']>;
  depreciation_method?: Maybe<Scalars['String']['output']>;
  depreciation_per_day?: Maybe<Scalars['Float']['output']>;
  end_date?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  invoices?: Maybe<Array<RentalInvoice>>;
  notes?: Maybe<Scalars['String']['output']>;
  project_id?: Maybe<Scalars['ID']['output']>;
  project_name?: Maybe<Scalars['String']['output']>;
  rate_amount: Scalars['String']['output'];
  rental_type: Scalars['String']['output'];
  salvage_value?: Maybe<Scalars['Float']['output']>;
  start_date: Scalars['String']['output'];
  status: Scalars['String']['output'];
  usageLogs?: Maybe<Array<UsageLog>>;
  useful_life_days?: Maybe<Scalars['Int']['output']>;
};

export type RentalContractInput = {
  asset_id: Scalars['ID']['input'];
  billing_cycle: Scalars['String']['input'];
  client_contact?: InputMaybe<Scalars['String']['input']>;
  client_name: Scalars['String']['input'];
  currency_code?: InputMaybe<Scalars['String']['input']>;
  deposit_amount?: InputMaybe<Scalars['Float']['input']>;
  depreciation_method?: InputMaybe<Scalars['String']['input']>;
  depreciation_per_day?: InputMaybe<Scalars['Float']['input']>;
  end_date?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  project_id?: InputMaybe<Scalars['ID']['input']>;
  rate_amount: Scalars['Float']['input'];
  rental_type: Scalars['String']['input'];
  salvage_value?: InputMaybe<Scalars['Float']['input']>;
  start_date: Scalars['String']['input'];
  useful_life_days?: InputMaybe<Scalars['Int']['input']>;
};

export type RentalInvoice = {
  billing_period_end: Scalars['String']['output'];
  billing_period_start: Scalars['String']['output'];
  contract_id: Scalars['ID']['output'];
  days_billed: Scalars['Float']['output'];
  due_date: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  invoice_date: Scalars['String']['output'];
  invoice_number: Scalars['String']['output'];
  paid_at?: Maybe<Scalars['String']['output']>;
  rate_amount: Scalars['Float']['output'];
  status: Scalars['String']['output'];
  total_amount: Scalars['Float']['output'];
  whtAmount: Scalars['Float']['output'];
  whtApplies: Scalars['Boolean']['output'];
  whtRate: Scalars['Float']['output'];
  whtScenario?: Maybe<Scalars['String']['output']>;
};

export type Requisition = {
  approval_log?: Maybe<Array<RequisitionApprovalLogEntry>>;
  assigned_approver_id?: Maybe<Scalars['ID']['output']>;
  assigned_receiver_id?: Maybe<Scalars['ID']['output']>;
  assigned_receiver_name?: Maybe<Scalars['String']['output']>;
  branch_id?: Maybe<Scalars['ID']['output']>;
  branch_name?: Maybe<Scalars['String']['output']>;
  callerCanApprove?: Maybe<Scalars['Boolean']['output']>;
  callerHasBuyerPosition?: Maybe<Scalars['Boolean']['output']>;
  callerHasMarketPricingPosition?: Maybe<Scalars['Boolean']['output']>;
  callerHasPriceVerificationPosition?: Maybe<Scalars['Boolean']['output']>;
  callerHasStoreKeeperPosition?: Maybe<Scalars['Boolean']['output']>;
  callerHasStorePricingPosition?: Maybe<Scalars['Boolean']['output']>;
  company_id: Scalars['ID']['output'];
  created_at: Scalars['String']['output'];
  currencyTotals: Array<RequisitionCurrencyTotal>;
  delivery_destination?: Maybe<Scalars['String']['output']>;
  edit_requests?: Maybe<Array<PoEditRequest>>;
  expected_delivery_date?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  itemSearchText?: Maybe<Scalars['String']['output']>;
  lines?: Maybe<Array<PoLine>>;
  linkedMoNumber?: Maybe<Scalars['String']['output']>;
  linked_mo_id?: Maybe<Scalars['ID']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  organizerName?: Maybe<Scalars['String']['output']>;
  organizer_id?: Maybe<Scalars['ID']['output']>;
  priority?: Maybe<Scalars['String']['output']>;
  projectCode?: Maybe<Scalars['String']['output']>;
  projectName?: Maybe<Scalars['String']['output']>;
  project_id?: Maybe<Scalars['ID']['output']>;
  purpose?: Maybe<Scalars['String']['output']>;
  requisition_number: Scalars['String']['output'];
  status: Scalars['String']['output'];
  updated_at: Scalars['String']['output'];
};

export type RequisitionApprovalLogEntry = {
  action: Scalars['String']['output'];
  actor_id: Scalars['ID']['output'];
  actor_name?: Maybe<Scalars['String']['output']>;
  actor_position?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['String']['output'];
  from_status: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  to_status: Scalars['String']['output'];
};

export type RequisitionCurrencyTotal = {
  currency_code: Scalars['String']['output'];
  line_count: Scalars['Int']['output'];
  subtotal: Scalars['String']['output'];
};

export type RequisitionInput = {
  assigned_receiver_id?: InputMaybe<Scalars['ID']['input']>;
  branch_id?: InputMaybe<Scalars['ID']['input']>;
  delivery_destination?: InputMaybe<Scalars['String']['input']>;
  expected_delivery_date?: InputMaybe<Scalars['String']['input']>;
  lines: Array<RequisitionLineInput>;
  linked_mo_id?: InputMaybe<Scalars['ID']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  project_id?: InputMaybe<Scalars['ID']['input']>;
  purpose?: InputMaybe<Scalars['String']['input']>;
};

export type RequisitionLineInput = {
  accountId?: InputMaybe<Scalars['ID']['input']>;
  costCenterId?: InputMaybe<Scalars['ID']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  product_id?: InputMaybe<Scalars['ID']['input']>;
  qty: Scalars['Float']['input'];
  requested_currency_code?: InputMaybe<Scalars['String']['input']>;
  unit_price: Scalars['Float']['input'];
  uom?: InputMaybe<Scalars['String']['input']>;
};

export type RequisitionMarketPriceInput = {
  currencyCode: Scalars['String']['input'];
  lineId: Scalars['ID']['input'];
  marketPrice: Scalars['Float']['input'];
  vendorQuoteRef?: InputMaybe<Scalars['String']['input']>;
};

export type RequisitionPriceVerificationAdjustment = {
  lineId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  verifiedPrice: Scalars['Float']['input'];
};

export type RequisitionStorePriceInput = {
  currencyCode: Scalars['String']['input'];
  lineId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  storePrice: Scalars['Float']['input'];
};

export type ResourceCalendarDay = {
  availableUnits: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  isHoliday: Scalars['Boolean']['output'];
  note?: Maybe<Scalars['String']['output']>;
  resourceId: Scalars['ID']['output'];
  workDate: Scalars['String']['output'];
};

export type ResourceDayLoading = {
  activities: Array<Scalars['String']['output']>;
  date: Scalars['String']['output'];
  isOverloaded: Scalars['Boolean']['output'];
  maxUnits: Scalars['Float']['output'];
  totalUnits: Scalars['Float']['output'];
};

export type ReturnableDirectDeliveryLine = {
  poId: Scalars['ID']['output'];
  poLineId: Scalars['ID']['output'];
  poNumber?: Maybe<Scalars['String']['output']>;
  productId: Scalars['ID']['output'];
  productName?: Maybe<Scalars['String']['output']>;
  qtyReceived: Scalars['Float']['output'];
  qtyReturnable: Scalars['Float']['output'];
  qtyReturnedSoFar: Scalars['Float']['output'];
  qtyVendorReturned: Scalars['Float']['output'];
  sku?: Maybe<Scalars['String']['output']>;
  unitCost: Scalars['Float']['output'];
  uom?: Maybe<Scalars['String']['output']>;
};

export type ReturnableIssueLine = {
  fromLocationId?: Maybe<Scalars['ID']['output']>;
  fromLocationName?: Maybe<Scalars['String']['output']>;
  issueDate: Scalars['String']['output'];
  issueId: Scalars['ID']['output'];
  issueLineId: Scalars['ID']['output'];
  issueNumber: Scalars['String']['output'];
  poId: Scalars['ID']['output'];
  poNumber?: Maybe<Scalars['String']['output']>;
  productId: Scalars['ID']['output'];
  productName?: Maybe<Scalars['String']['output']>;
  qtyIssued: Scalars['Float']['output'];
  qtyReturnable: Scalars['Float']['output'];
  qtyReturnedSoFar: Scalars['Float']['output'];
  sku?: Maybe<Scalars['String']['output']>;
  unitCost: Scalars['Float']['output'];
  uom?: Maybe<Scalars['String']['output']>;
};

export type RevenueByEntity = {
  factory: Scalars['Float']['output'];
  month: Scalars['String']['output'];
  watanyia: Scalars['Float']['output'];
  yakam: Scalars['Float']['output'];
};

export type RevenueMonth = {
  month: Scalars['String']['output'];
  revenue: Scalars['Float']['output'];
};

export type RevenueTrendPoint = {
  period: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type Risk = {
  category: Scalars['String']['output'];
  cause?: Maybe<Scalars['String']['output']>;
  consequence?: Maybe<Scalars['String']['output']>;
  contingencyPlan?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  impact: Scalars['Int']['output'];
  mitigationPlan?: Maybe<Scalars['String']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  probability: Scalars['Int']['output'];
  projectId: Scalars['ID']['output'];
  raisedBy?: Maybe<Scalars['String']['output']>;
  raisedDate?: Maybe<Scalars['String']['output']>;
  residualImpact?: Maybe<Scalars['Int']['output']>;
  residualLevel?: Maybe<Scalars['String']['output']>;
  residualProbability?: Maybe<Scalars['Int']['output']>;
  residualScore?: Maybe<Scalars['Int']['output']>;
  reviewDate?: Maybe<Scalars['String']['output']>;
  reviews: Array<RiskReview>;
  riskLevel: Scalars['String']['output'];
  riskNo: Scalars['String']['output'];
  riskScore: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type RiskReview = {
  id: Scalars['ID']['output'];
  impact: Scalars['Int']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  probability: Scalars['Int']['output'];
  reviewedAt: Scalars['String']['output'];
  reviewedBy?: Maybe<Scalars['String']['output']>;
  riskId: Scalars['ID']['output'];
  score: Scalars['Int']['output'];
};

export type RoleInput = {
  companyId: Scalars['ID']['input'];
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  module: Scalars['String']['input'];
  role: Scalars['String']['input'];
};

export type RoleTemplate = {
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isSystem: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  permissions: Array<RoleTemplatePermEntry>;
};

export type RoleTemplateInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  permissions: Scalars['JSON']['input'];
};

export type RoleTemplatePermEntry = {
  accessLevel: Scalars['String']['output'];
  key: Scalars['String']['output'];
};

export type SalaryConfig = {
  base_salary: Scalars['String']['output'];
  currency_code: Scalars['String']['output'];
  effective_from?: Maybe<Scalars['String']['output']>;
  effective_to?: Maybe<Scalars['String']['output']>;
  employee_id: Scalars['ID']['output'];
  housing_allowance?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  income_tax_pct?: Maybe<Scalars['String']['output']>;
  other_allowances?: Maybe<Scalars['String']['output']>;
  social_security_pct?: Maybe<Scalars['String']['output']>;
  transport_allowance?: Maybe<Scalars['String']['output']>;
};

export type SalaryConfigInput = {
  base_salary: Scalars['Float']['input'];
  currency_code: Scalars['String']['input'];
  effective_from?: InputMaybe<Scalars['String']['input']>;
  housing_allowance?: InputMaybe<Scalars['Float']['input']>;
  income_tax_pct?: InputMaybe<Scalars['Float']['input']>;
  other_allowances?: InputMaybe<Scalars['Float']['input']>;
  social_security_pct?: InputMaybe<Scalars['Float']['input']>;
  transport_allowance?: InputMaybe<Scalars['Float']['input']>;
};

export type SaveUserPermissionsInput = {
  companyId: Scalars['ID']['input'];
  permissions: Scalars['JSON']['input'];
  userId: Scalars['ID']['input'];
};

export type ServiceChecks = {
  database: Scalars['String']['output'];
  outbox: Scalars['String']['output'];
  redis: Scalars['String']['output'];
};

export type ServiceHealth = {
  checks: ServiceChecks;
  lastChecked: Scalars['String']['output'];
  latencyMs?: Maybe<Scalars['Int']['output']>;
  service: Scalars['String']['output'];
  status: Scalars['String']['output'];
  uptime?: Maybe<Scalars['Float']['output']>;
};

export type SessionsChangedEvent = {
  userId: Scalars['ID']['output'];
};

export type ShiftConfig = {
  break_minutes?: Maybe<Scalars['Int']['output']>;
  end_time?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  overtime_threshold_hours?: Maybe<Scalars['String']['output']>;
  start_time?: Maybe<Scalars['String']['output']>;
};

export type ShiftConfigInput = {
  break_minutes?: InputMaybe<Scalars['Int']['input']>;
  end_time?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  overtime_threshold_hours?: InputMaybe<Scalars['Float']['input']>;
  start_time?: InputMaybe<Scalars['String']['input']>;
};

export type SpendCategory = {
  amount: Scalars['Float']['output'];
  category: Scalars['String']['output'];
};

export type StageInput = {
  name: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  plannedEndDate?: InputMaybe<Scalars['String']['input']>;
  plannedStartDate?: InputMaybe<Scalars['String']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
};

export type StockAdjustmentInput = {
  adjustment_date?: InputMaybe<Scalars['String']['input']>;
  currency_code?: InputMaybe<Scalars['String']['input']>;
  location_id: Scalars['ID']['input'];
  new_qty: Scalars['Float']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  product_id: Scalars['ID']['input'];
  unit_cost?: InputMaybe<Scalars['Float']['input']>;
};

export type StockBalance = {
  available?: Maybe<Scalars['String']['output']>;
  average_cost: Scalars['String']['output'];
  is_low_stock?: Maybe<Scalars['Boolean']['output']>;
  last_cost_currency?: Maybe<Scalars['String']['output']>;
  location_id: Scalars['ID']['output'];
  location_name?: Maybe<Scalars['String']['output']>;
  location_type?: Maybe<Scalars['String']['output']>;
  product_id: Scalars['ID']['output'];
  product_name?: Maybe<Scalars['String']['output']>;
  qty_on_hand: Scalars['String']['output'];
  qty_reserved?: Maybe<Scalars['String']['output']>;
  total_value?: Maybe<Scalars['String']['output']>;
};

export type StockBalanceSnapshot = {
  currency: Scalars['String']['output'];
  rows: Array<StockSnapshotRow>;
  totalValue: Scalars['String']['output'];
};

export type StockConfirmLineInput = {
  lineId: Scalars['ID']['input'];
  productId?: InputMaybe<Scalars['ID']['input']>;
  qtyFromStock: Scalars['Float']['input'];
  sourceLocationId?: InputMaybe<Scalars['ID']['input']>;
};

export type StockLocation = {
  address?: Maybe<Scalars['String']['output']>;
  code?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  parent_id?: Maybe<Scalars['ID']['output']>;
  parent_name?: Maybe<Scalars['String']['output']>;
  type: Scalars['String']['output'];
};

export type StockLot = {
  created_at: Scalars['String']['output'];
  current_location_id?: Maybe<Scalars['ID']['output']>;
  current_location_name?: Maybe<Scalars['String']['output']>;
  current_qty?: Maybe<Scalars['String']['output']>;
  expiry_date?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lot_number: Scalars['String']['output'];
  moves?: Maybe<Array<StockLotMove>>;
  product_id: Scalars['ID']['output'];
  product_name?: Maybe<Scalars['String']['output']>;
  sku?: Maybe<Scalars['String']['output']>;
};

export type StockLotMove = {
  direction: Scalars['String']['output'];
  from_location_name?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  move_date: Scalars['String']['output'];
  moved_by_email?: Maybe<Scalars['String']['output']>;
  qty: Scalars['String']['output'];
  reference?: Maybe<Scalars['String']['output']>;
  source_type: Scalars['String']['output'];
  to_location_name?: Maybe<Scalars['String']['output']>;
};

export type StockMove = {
  from_location_id?: Maybe<Scalars['ID']['output']>;
  from_location_name?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lot_id?: Maybe<Scalars['ID']['output']>;
  lot_number?: Maybe<Scalars['String']['output']>;
  move_date: Scalars['String']['output'];
  moved_by_email?: Maybe<Scalars['String']['output']>;
  product_id: Scalars['ID']['output'];
  product_name?: Maybe<Scalars['String']['output']>;
  qty: Scalars['String']['output'];
  reference?: Maybe<Scalars['String']['output']>;
  sku?: Maybe<Scalars['String']['output']>;
  source_type: Scalars['String']['output'];
  to_location_id?: Maybe<Scalars['ID']['output']>;
  to_location_name?: Maybe<Scalars['String']['output']>;
  total_cost?: Maybe<Scalars['String']['output']>;
  unit_cost?: Maybe<Scalars['String']['output']>;
};

export type StockSnapshotRow = {
  available: Scalars['String']['output'];
  average_cost: Scalars['String']['output'];
  category?: Maybe<Scalars['String']['output']>;
  is_low_stock: Scalars['Boolean']['output'];
  location_id: Scalars['ID']['output'];
  location_name: Scalars['String']['output'];
  location_type: Scalars['String']['output'];
  product_id: Scalars['ID']['output'];
  product_name: Scalars['String']['output'];
  qty_on_hand: Scalars['String']['output'];
  qty_reserved: Scalars['String']['output'];
  sku: Scalars['String']['output'];
  total_value: Scalars['String']['output'];
};

export type Subcontract = {
  billings: Array<SubcontractBilling>;
  certifiedAmount: Scalars['Float']['output'];
  contractValue: Scalars['Float']['output'];
  costCodeId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  endDate?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  paidAmount: Scalars['Float']['output'];
  projectId: Scalars['ID']['output'];
  retentionPercentage: Scalars['Float']['output'];
  retentionReleased: Scalars['Float']['output'];
  revisedValue: Scalars['Float']['output'];
  scopeOfWork?: Maybe<Scalars['String']['output']>;
  startDate?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  subcontractNumber: Scalars['String']['output'];
  subcontractorName: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type SubcontractBilling = {
  billingDate: Scalars['String']['output'];
  billingNumber: Scalars['String']['output'];
  certifiedAmount?: Maybe<Scalars['Float']['output']>;
  certifiedDate?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  grossAmount: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  netAmount: Scalars['Float']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  paidAmount: Scalars['Float']['output'];
  paidDate?: Maybe<Scalars['String']['output']>;
  retentionAmount: Scalars['Float']['output'];
  status: Scalars['String']['output'];
  subcontractId: Scalars['ID']['output'];
};

export type Subscription = {
  /** Generic live-update signal for a given company + entity type (e.g. 'purchase_order', 'project', 'vendor'). Payload is signal-only — clients refetch their own query on receipt. */
  entityChanged: EntityChangedEvent;
  /** Fires when a record's edit lock is acquired, released, or expires. lock is null when the record just became unlocked. */
  lockChanged: LockChangedEvent;
  /** Fires whenever the worker finishes an outbox processing cycle that changed something, or an admin retries/dismisses/resets an event. */
  outboxUpdated: OutboxUpdatedEvent;
  /** Fires when an admin saves a user's permissions for a company. Scoped to the affected user so their client can refresh without a logout/login. */
  permissionsChanged: PermissionsChangedEvent;
  /** Fires when a session is created or revoked. Pass userId to scope to one user; omit to hear about all users (e.g. an admin list view). */
  sessionsChanged: SessionsChangedEvent;
};


export type SubscriptionEntityChangedArgs = {
  companyId: Scalars['ID']['input'];
  entityType: Scalars['String']['input'];
};


export type SubscriptionLockChangedArgs = {
  entityId: Scalars['ID']['input'];
  entityType: Scalars['String']['input'];
};


export type SubscriptionPermissionsChangedArgs = {
  userId: Scalars['ID']['input'];
};


export type SubscriptionSessionsChangedArgs = {
  userId?: InputMaybe<Scalars['ID']['input']>;
};

export type TransferInput = {
  from_location_id: Scalars['ID']['input'];
  lines: Array<TransferLineInput>;
  move_date: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  reference?: InputMaybe<Scalars['String']['input']>;
  to_location_id: Scalars['ID']['input'];
};

export type TransferLineInput = {
  lot_id?: InputMaybe<Scalars['ID']['input']>;
  product_id: Scalars['ID']['input'];
  qty: Scalars['Float']['input'];
  unit_cost?: InputMaybe<Scalars['Float']['input']>;
};

export type TransferPricePreview = {
  avcoAtTransfer: Scalars['Float']['output'];
  markupPctApplied?: Maybe<Scalars['Float']['output']>;
  method: Scalars['String']['output'];
  requiresManualInput: Scalars['Boolean']['output'];
  totalTransferValue: Scalars['Float']['output'];
  transferPrice: Scalars['Float']['output'];
};

export type TrialBalanceLine = {
  account_type: Scalars['String']['output'];
  balance: Scalars['String']['output'];
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  total_credit: Scalars['String']['output'];
  total_debit: Scalars['String']['output'];
};

export type UpdateCompanyInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  bank_account?: InputMaybe<Scalars['String']['input']>;
  bank_iban?: InputMaybe<Scalars['String']['input']>;
  bank_name?: InputMaybe<Scalars['String']['input']>;
  bank_swift?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  country_code?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  interco_cost_plus_markup_pct?: InputMaybe<Scalars['Float']['input']>;
  interco_transfer_pricing_method?: InputMaybe<Scalars['String']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  journal_template_image?: InputMaybe<Scalars['String']['input']>;
  legal_name?: InputMaybe<Scalars['String']['input']>;
  letterhead_image?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  pv_template_image?: InputMaybe<Scalars['String']['input']>;
  registration_number?: InputMaybe<Scalars['String']['input']>;
  stamp_image?: InputMaybe<Scalars['String']['input']>;
  vat_number?: InputMaybe<Scalars['String']['input']>;
  website?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateRoleInput = {
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  module?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateStageInput = {
  actualEndDate?: InputMaybe<Scalars['String']['input']>;
  actualStartDate?: InputMaybe<Scalars['String']['input']>;
  assignedTo?: InputMaybe<Scalars['ID']['input']>;
  completionPct?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  plannedEndDate?: InputMaybe<Scalars['String']['input']>;
  plannedStartDate?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type UploadUrlPayload = {
  expiresInSeconds: Scalars['Int']['output'];
  fileId: Scalars['ID']['output'];
  fileKey: Scalars['String']['output'];
  uploadUrl: Scalars['String']['output'];
};

export type UsageLog = {
  asset_id: Scalars['ID']['output'];
  created_at: Scalars['String']['output'];
  created_by_email?: Maybe<Scalars['String']['output']>;
  hours_used: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  mileage_km?: Maybe<Scalars['Float']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  operator_name: Scalars['String']['output'];
  usage_date: Scalars['String']['output'];
};

export type UsageLogInput = {
  asset_id: Scalars['ID']['input'];
  hours_used: Scalars['Float']['input'];
  mileage_km?: InputMaybe<Scalars['Float']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  operator_name: Scalars['String']['input'];
  usage_date: Scalars['String']['input'];
};

export type UserDetail = {
  createdAt: Scalars['String']['output'];
  email: Scalars['String']['output'];
  failedLoginAttempts: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  lastLogin?: Maybe<Scalars['String']['output']>;
  lockedUntil?: Maybe<Scalars['String']['output']>;
  mfaEnabled: Scalars['Boolean']['output'];
  roles: Array<UserRole>;
};

export type UserInvitation = {
  acceptedAt?: Maybe<Scalars['String']['output']>;
  companies: Array<InvitationCompany>;
  createdAt: Scalars['String']['output'];
  email: Scalars['String']['output'];
  expiresAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  invitedByEmail?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
};

export type UserItem = {
  activeSessions: Scalars['Int']['output'];
  companies: Array<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  lastLogin?: Maybe<Scalars['String']['output']>;
  mfaEnabled: Scalars['Boolean']['output'];
  roles: Array<UserRole>;
};

export type UserPage = {
  items: Array<UserItem>;
  limit: Scalars['Int']['output'];
  page: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type UserPermEntry = {
  accessLevel: Scalars['String']['output'];
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  module: Scalars['String']['output'];
  submodule: Scalars['String']['output'];
};

export type UserPermissionsResult = {
  companyId: Scalars['ID']['output'];
  isAdmin: Scalars['Boolean']['output'];
  permissions: Array<UserPermEntry>;
  userId: Scalars['ID']['output'];
};

export type UserRole = {
  companyId?: Maybe<Scalars['ID']['output']>;
  companyName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  module?: Maybe<Scalars['String']['output']>;
  role: Scalars['String']['output'];
};

export type UserSession = {
  createdAt: Scalars['String']['output'];
  deviceName?: Maybe<Scalars['String']['output']>;
  expiresAt?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  ipAddress: Scalars['String']['output'];
  isCurrent: Scalars['Boolean']['output'];
  lastActive?: Maybe<Scalars['String']['output']>;
  platform?: Maybe<Scalars['String']['output']>;
};

export type VoCorrespondence = {
  correspondenceDate: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  direction: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  referenceNumber?: Maybe<Scalars['String']['output']>;
  subject: Scalars['String']['output'];
  voId: Scalars['ID']['output'];
};

export type VoCostItem = {
  amount: Scalars['Float']['output'];
  category: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  quantity: Scalars['Float']['output'];
  unit?: Maybe<Scalars['String']['output']>;
  unitRate: Scalars['Float']['output'];
  voId: Scalars['ID']['output'];
};

export type VoDrawing = {
  createdAt: Scalars['String']['output'];
  drawingNumber: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  notes?: Maybe<Scalars['String']['output']>;
  revision?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  voId: Scalars['ID']['output'];
};

export type VariationOrder = {
  appliedValue?: Maybe<Scalars['Float']['output']>;
  approvedValue?: Maybe<Scalars['Float']['output']>;
  changeType: Scalars['String']['output'];
  clientRef?: Maybe<Scalars['String']['output']>;
  contractId?: Maybe<Scalars['ID']['output']>;
  correspondence: Array<VoCorrespondence>;
  costItems: Array<VoCostItem>;
  createdAt: Scalars['String']['output'];
  currencyCode: Scalars['String']['output'];
  decidedAt?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  drawings: Array<VoDrawing>;
  id: Scalars['ID']['output'];
  impactAnalysis?: Maybe<Scalars['String']['output']>;
  initiatedBy: Scalars['String']['output'];
  instructionDate?: Maybe<Scalars['String']['output']>;
  projectId: Scalars['ID']['output'];
  receivedDate?: Maybe<Scalars['String']['output']>;
  rejectionReason?: Maybe<Scalars['String']['output']>;
  scheduleImpactDays: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  submittedAt?: Maybe<Scalars['String']['output']>;
  technicalNotes?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
  voNumber: Scalars['String']['output'];
  voValue: Scalars['Float']['output'];
};

export type Vendor = {
  address?: Maybe<Scalars['String']['output']>;
  bank_name?: Maybe<Scalars['String']['output']>;
  city?: Maybe<Scalars['String']['output']>;
  contact_email?: Maybe<Scalars['String']['output']>;
  contact_name?: Maybe<Scalars['String']['output']>;
  contact_phone?: Maybe<Scalars['String']['output']>;
  country_code?: Maybe<Scalars['String']['output']>;
  currency_code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  is_cash_purchase: Scalars['Boolean']['output'];
  legal_name?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  payment_terms_days: Scalars['Int']['output'];
  tax_id?: Maybe<Scalars['String']['output']>;
  withholding_tax_rate?: Maybe<Scalars['String']['output']>;
};

export type VendorInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  bank_name?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  contact_email?: InputMaybe<Scalars['String']['input']>;
  contact_name?: InputMaybe<Scalars['String']['input']>;
  contact_phone?: InputMaybe<Scalars['String']['input']>;
  country_code?: InputMaybe<Scalars['String']['input']>;
  currency_code?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  legal_name?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  payment_terms_days?: InputMaybe<Scalars['Int']['input']>;
  tax_id?: InputMaybe<Scalars['String']['input']>;
  withholding_tax_rate?: InputMaybe<Scalars['Float']['input']>;
};

export type WbsNode = {
  budgetAmount: Scalars['Float']['output'];
  children: Array<WbsNode>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  level: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  parentId?: Maybe<Scalars['ID']['output']>;
  projectId: Scalars['ID']['output'];
  responsible?: Maybe<Scalars['String']['output']>;
  sequence: Scalars['Int']['output'];
  updatedAt: Scalars['String']['output'];
  wbsCode: Scalars['String']['output'];
};

export type WhtReport = {
  rows: Array<WhtRow>;
  totalPaymentsSubjectToWHT: Scalars['Float']['output'];
  totalWHT: Scalars['Float']['output'];
  vendorCount: Scalars['Int']['output'];
};

export type WhtRow = {
  paymentAmount: Scalars['Float']['output'];
  period: Scalars['String']['output'];
  rate: Scalars['Float']['output'];
  taxId?: Maybe<Scalars['String']['output']>;
  vendorName: Scalars['String']['output'];
  whtAmount: Scalars['Float']['output'];
  whtType: Scalars['String']['output'];
};

export type WorkCenter = {
  capacity_hours_per_day: Scalars['Float']['output'];
  code: Scalars['String']['output'];
  cost_per_hour: Scalars['Float']['output'];
  currency_code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
};

export type WorkCenterInput = {
  capacity_hours_per_day: Scalars['Float']['input'];
  code: Scalars['String']['input'];
  cost_per_hour: Scalars['Float']['input'];
  currency_code?: InputMaybe<Scalars['String']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
};

export type WorkLocation = {
  address?: Maybe<Scalars['String']['output']>;
  geofence_radius_m?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  is_active: Scalars['Boolean']['output'];
  latitude?: Maybe<Scalars['String']['output']>;
  longitude?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
};

export type WorkLocationInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  geofence_radius_m?: InputMaybe<Scalars['Int']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  latitude?: InputMaybe<Scalars['Float']['input']>;
  longitude?: InputMaybe<Scalars['Float']['input']>;
  name: Scalars['String']['input'];
};
