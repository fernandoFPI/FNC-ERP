/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type * as Types from './schema-types';

export type UsersQueryVariables = Exact<{
  search?: string | null | undefined;
  isActive?: boolean | null | undefined;
  companyId?: string | number | null | undefined;
  page?: number | null | undefined;
  limit?: number | null | undefined;
}>;


export type UsersQuery = { users: { total: number, page: number, limit: number, items: Array<{ id: string, email: string, isActive: boolean, mfaEnabled: boolean, lastLogin: string | null, activeSessions: number, companies: Array<string>, roles: Array<{ id: string, companyName: string | null, module: string | null, role: string, isActive: boolean }> }> } };

export type UserQueryVariables = Exact<{
  id: string | number;
}>;


export type UserQuery = { user: { id: string, email: string, isActive: boolean, mfaEnabled: boolean, lastLogin: string | null, failedLoginAttempts: number, lockedUntil: string | null, createdAt: string, roles: Array<{ id: string, companyId: string | null, companyName: string | null, module: string | null, role: string, isActive: boolean }> } | null };

export type UserSessionsQueryVariables = Exact<{
  userId: string | number;
}>;


export type UserSessionsQuery = { userSessions: Array<{ id: string, deviceName: string | null, platform: string | null, ipAddress: string, createdAt: string, expiresAt: string | null, isCurrent: boolean }> };

export type SessionsChangedSubscriptionVariables = Exact<{
  userId?: string | number | null | undefined;
}>;


export type SessionsChangedSubscription = { sessionsChanged: { userId: string } };

export type OutboxUpdatedSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type OutboxUpdatedSubscription = { outboxUpdated: { updatedAt: string } };

export type UserInvitationsQueryVariables = Exact<{
  companyId?: string | number | null | undefined;
  status?: string | null | undefined;
}>;


export type UserInvitationsQuery = { userInvitations: Array<{ id: string, email: string, invitedByEmail: string | null, status: string, expiresAt: string, acceptedAt: string | null, createdAt: string, companies: Array<{ companyId: string, companyName: string, role: string, module: string }> }> };

export type OutboxMonitorQueryVariables = Exact<{ [key: string]: never; }>;


export type OutboxMonitorQuery = { outboxMonitor: { health: string, generatedAt: string, counts: { pending: number, failed: number, dlq: number, stuck: number } } };

export type OutboxEventsQueryVariables = Exact<{
  status?: string | null | undefined;
  service?: string | null | undefined;
  eventType?: string | null | undefined;
  page?: number | null | undefined;
  limit?: number | null | undefined;
}>;


export type OutboxEventsQuery = { outboxEvents: { total: number, page: number, limit: number, items: Array<{ id: string, service: string, eventType: string, status: string, attempts: number, maxAttempts: number, lastError: string | null, nextRetryAt: string | null, createdAt: string, payload: unknown }> } };

export type OutboxDlqQueryVariables = Exact<{
  status?: string | null | undefined;
  priority?: string | null | undefined;
  eventType?: string | null | undefined;
  page?: number | null | undefined;
  limit?: number | null | undefined;
}>;


export type OutboxDlqQuery = { outboxDLQ: { total: number, page: number, limit: number, items: Array<{ id: string, eventType: string, service: string, priority: string, status: string, totalAttempts: number, lastError: string | null, createdAt: string, reviewedBy: string | null, reviewNotes: string | null, payload: unknown, errorHistory: Array<{ attempt: number, error: string, at: string }> }> } };

export type OutboxEventConfigsQueryVariables = Exact<{ [key: string]: never; }>;


export type OutboxEventConfigsQuery = { outboxEventConfigs: Array<{ id: string, eventType: string, maxAttempts: number, initialRetryDelaySeconds: number, backoffMultiplier: number, maxRetryDelaySeconds: number, dlqPriority: string, alertOnDlq: boolean, description: string | null }> };

export type SystemHealthQueryVariables = Exact<{ [key: string]: never; }>;


export type SystemHealthQuery = { systemHealth: Array<{ service: string, status: string, latencyMs: number | null, uptime: number | null, lastChecked: string, checks: { database: string, redis: string, outbox: string } }> };

export type AuditLogQueryVariables = Exact<{
  userId?: string | number | null | undefined;
  companyId?: string | number | null | undefined;
  tableName?: string | null | undefined;
  action?: string | null | undefined;
  recordId?: string | number | null | undefined;
  fromDate?: string | null | undefined;
  toDate?: string | null | undefined;
  page?: number | null | undefined;
  limit?: number | null | undefined;
}>;


export type AuditLogQuery = { auditLog: { total: number, page: number, limit: number, items: Array<{ id: string, createdAt: string, userEmail: string, companyName: string | null, action: string, tableName: string | null, recordId: string | null, ipAddress: string | null, oldValues: unknown, newValues: unknown }> } };

export type AddUserRoleMutationVariables = Exact<{
  userId: string | number;
  input: Types.RoleInput;
}>;


export type AddUserRoleMutation = { addUserRole: { id: string, companyName: string | null, module: string | null, role: string, isActive: boolean } };

export type UpdateUserRoleMutationVariables = Exact<{
  roleId: string | number;
  input: Types.UpdateRoleInput;
}>;


export type UpdateUserRoleMutation = { updateUserRole: { id: string, companyName: string | null, module: string | null, role: string, isActive: boolean } };

export type RemoveUserRoleMutationVariables = Exact<{
  roleId: string | number;
}>;


export type RemoveUserRoleMutation = { removeUserRole: boolean };

export type DeactivateUserMutationVariables = Exact<{
  userId: string | number;
}>;


export type DeactivateUserMutation = { deactivateUser: { id: string, isActive: boolean } };

export type UnlockUserMutationVariables = Exact<{
  userId: string | number;
}>;


export type UnlockUserMutation = { unlockUser: { id: string, failedLoginAttempts: number, lockedUntil: string | null } };

export type ResetUserMfaMutationVariables = Exact<{
  userId: string | number;
}>;


export type ResetUserMfaMutation = { resetUserMFA: boolean };

export type RevokeUserSessionMutationVariables = Exact<{
  sessionId: string | number;
}>;


export type RevokeUserSessionMutation = { revokeUserSession: boolean };

export type RevokeAllUserSessionsMutationVariables = Exact<{
  userId: string | number;
}>;


export type RevokeAllUserSessionsMutation = { revokeAllUserSessions: boolean };

export type AdminSetUserPasswordMutationVariables = Exact<{
  userId: string | number;
  newPassword: string;
}>;


export type AdminSetUserPasswordMutation = { adminSetUserPassword: boolean };

export type RetryOutboxEventMutationVariables = Exact<{
  eventId: string | number;
}>;


export type RetryOutboxEventMutation = { retryOutboxEvent: boolean };

export type RetryDlqEntryMutationVariables = Exact<{
  dlqId: string | number;
  notes?: string | null | undefined;
}>;


export type RetryDlqEntryMutation = { retryDLQEntry: boolean };

export type DismissDlqEntryMutationVariables = Exact<{
  dlqId: string | number;
  notes: string;
}>;


export type DismissDlqEntryMutation = { dismissDLQEntry: boolean };

export type ResetStuckEventsMutationVariables = Exact<{ [key: string]: never; }>;


export type ResetStuckEventsMutation = { resetStuckEvents: number };

export type UpdateOutboxEventConfigMutationVariables = Exact<{
  eventType: string;
  input: Types.EventConfigInput;
}>;


export type UpdateOutboxEventConfigMutation = { updateOutboxEventConfig: { eventType: string, maxAttempts: number, initialRetryDelaySeconds: number, backoffMultiplier: number, maxRetryDelaySeconds: number, dlqPriority: string, alertOnDlq: boolean } };

export type CreateUserMutationVariables = Exact<{
  input: Types.CreateUserInput;
}>;


export type CreateUserMutation = { createUser: { id: string, email: string, isActive: boolean } };

export type InviteUserMutationVariables = Exact<{
  input: Types.InviteUserInput;
}>;


export type InviteUserMutation = { inviteUser: { id: string, email: string, status: string, expiresAt: string } };

export type ActivateUserMutationVariables = Exact<{
  userId: string | number;
}>;


export type ActivateUserMutation = { activateUser: { id: string, isActive: boolean } };

export type AssignRoleMutationVariables = Exact<{
  input: Types.AssignRoleInput;
}>;


export type AssignRoleMutation = { assignRole: { id: string, role: string, module: string | null, isActive: boolean } };

export type ToggleRoleMutationVariables = Exact<{
  roleId: string | number;
  isActive: boolean;
}>;


export type ToggleRoleMutation = { toggleRole: { id: string, isActive: boolean } };

export type DeleteRoleMutationVariables = Exact<{
  roleId: string | number;
}>;


export type DeleteRoleMutation = { deleteRole: boolean };

export type CompaniesQueryVariables = Exact<{ [key: string]: never; }>;


export type CompaniesQuery = { companies: Array<{ id: string, name: string, legalName: string | null, city: string | null, countryCode: string | null, currencyCode: string, isActive: boolean, setupCompleted: boolean, intercoTransferPricingMethod: string | null, configuration: { defaultCurrency: string, fiscalYearStartMonth: number } | null }> };

export type CompanyQueryVariables = Exact<{
  id: string | number;
}>;


export type CompanyQuery = { company: { id: string, name: string, legalName: string | null, countryCode: string | null, city: string | null, address: string | null, phone: string | null, email: string | null, website: string | null, registrationNumber: string | null, vatNumber: string | null, currencyCode: string, bankName: string | null, bankAccount: string | null, bankIban: string | null, bankSwift: string | null, intercoTransferPricingMethod: string | null, isActive: boolean, setupCompleted: boolean, stampImage: string | null, letterheadImage: string | null, pvTemplateImage: string | null, journalTemplateImage: string | null, createdAt: string, configuration: { companyId: string, fiscalYearStartMonth: number, fiscalYearStartDay: number, defaultCurrency: string, defaultPaymentTermsDays: number, defaultPOCurrency: string, incomeTaxEnabled: boolean, socialSecurityRate: number, employerSocialSecurityRate: number, defaultWHTRate: number, companyEmailFrom: string | null, companyEmailSignature: string | null, setupCompleted: boolean } | null } | null };

export type CompanyUsersQueryVariables = Exact<{
  companyId: string | number;
}>;


export type CompanyUsersQuery = { companyUsers: Array<{ id: string, email: string, isActive: boolean, lastLoginAt: string | null, roles: Array<{ id: string, role: string, module: string | null, isActive: boolean }> }> };

export type CreateCompanyMutationVariables = Exact<{
  input: Types.CreateCompanyInput;
}>;


export type CreateCompanyMutation = { createCompany: { id: string, name: string, legalName: string | null } };

export type UpdateCompanyMutationVariables = Exact<{
  id: string | number;
  input: Types.UpdateCompanyInput;
}>;


export type UpdateCompanyMutation = { updateCompany: { id: string, name: string } };

export type UpdateCompanyConfigurationMutationVariables = Exact<{
  companyId: string | number;
  input: Types.CompanyConfigInput;
}>;


export type UpdateCompanyConfigurationMutation = { updateCompanyConfiguration: { defaultCurrency: string, fiscalYearStartMonth: number } };

export type CompanyBranchesQueryVariables = Exact<{
  companyId: string | number;
}>;


export type CompanyBranchesQuery = { companyBranches: Array<{ id: string, companyId: string, name: string, address: string | null, city: string | null, countryCode: string, phone: string | null, isActive: boolean, createdAt: string, defaultProcurementUserId: string | null, defaultProcurementUserEmail: string | null }> };

export type CreateCompanyBranchMutationVariables = Exact<{
  companyId: string | number;
  input: Types.CompanyBranchInput;
}>;


export type CreateCompanyBranchMutation = { createCompanyBranch: { id: string, name: string, address: string | null, city: string | null, countryCode: string, phone: string | null, isActive: boolean, createdAt: string, defaultProcurementUserId: string | null, defaultProcurementUserEmail: string | null } };

export type UpdateCompanyBranchMutationVariables = Exact<{
  id: string | number;
  input: Types.CompanyBranchInput;
}>;


export type UpdateCompanyBranchMutation = { updateCompanyBranch: { id: string, name: string, address: string | null, city: string | null, countryCode: string, phone: string | null, isActive: boolean, defaultProcurementUserId: string | null, defaultProcurementUserEmail: string | null } };

export type DeleteCompanyBranchMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteCompanyBranchMutation = { deleteCompanyBranch: boolean };

export type BankAccountsQueryVariables = Exact<{ [key: string]: never; }>;


export type BankAccountsQuery = { bankAccounts: Array<{ id: string, accountName: string, bankName: string, beneficiaryName: string | null, accountNumber: string | null, iban: string | null, swift: string | null, branchCode: string | null, bankAddress: string | null, intermediaryBankName: string | null, intermediarySwift: string | null, intermediaryCountry: string | null, currencyCode: string, isActive: boolean, createdAt: string }> };

export type CreateBankAccountMutationVariables = Exact<{
  input: Types.BankAccountInput;
}>;


export type CreateBankAccountMutation = { createBankAccount: { id: string, accountName: string, bankName: string, beneficiaryName: string | null, accountNumber: string | null, iban: string | null, swift: string | null, branchCode: string | null, bankAddress: string | null, intermediaryBankName: string | null, intermediarySwift: string | null, intermediaryCountry: string | null, currencyCode: string, isActive: boolean, createdAt: string } };

export type UpdateBankAccountMutationVariables = Exact<{
  id: string | number;
  input: Types.BankAccountInput;
}>;


export type UpdateBankAccountMutation = { updateBankAccount: { id: string, accountName: string, bankName: string, beneficiaryName: string | null, accountNumber: string | null, iban: string | null, swift: string | null, branchCode: string | null, bankAddress: string | null, intermediaryBankName: string | null, intermediarySwift: string | null, intermediaryCountry: string | null, currencyCode: string, isActive: boolean } };

export type DeleteBankAccountMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteBankAccountMutation = { deleteBankAccount: boolean };

export type SetInvoiceBankAccountMutationVariables = Exact<{
  invoiceId: string | number;
  bankAccountId?: string | number | null | undefined;
}>;


export type SetInvoiceBankAccountMutation = { setInvoiceBankAccount: boolean };

export type SetInvoicePaymentTypeMutationVariables = Exact<{
  invoiceId: string | number;
  paymentType: string;
}>;


export type SetInvoicePaymentTypeMutation = { setInvoicePaymentType: boolean };

export type AccountsQueryVariables = Exact<{
  type?: string | null | undefined;
  isActive?: boolean | null | undefined;
}>;


export type AccountsQuery = { accounts: Array<{ id: string, code: string, name: string, account_type: string, is_active: boolean, currency_code: string, parent_id: string | null, parent_name: string | null, is_reconcilable: boolean | null, is_header: boolean | null, is_postable: boolean | null, account_category: string | null } | null> | null };

export type AccountQueryVariables = Exact<{
  id: string | number;
}>;


export type AccountQuery = { account: { id: string, code: string, name: string, account_type: string, is_active: boolean, currency_code: string, parent_id: string | null, parent_name: string | null, is_reconcilable: boolean | null, has_posted_lines: boolean | null, group_account_id: string | null, group_code: string | null, group_name: string | null, is_header: boolean | null, is_postable: boolean | null, is_control_account: boolean | null, account_category: string | null } | null };

export type GroupChartOfAccountsQueryVariables = Exact<{ [key: string]: never; }>;


export type GroupChartOfAccountsQuery = { groupChartOfAccounts: Array<{ id: string, code: string, name: string, account_type: string, parent_id: string | null, is_header: boolean }> };

export type AccountLedgerQueryVariables = Exact<{
  accountId: string | number;
  fromDate?: string | null | undefined;
  toDate?: string | null | undefined;
  page?: number | null | undefined;
  limit?: number | null | undefined;
}>;


export type AccountLedgerQuery = { accountLedger: { total: number, page: number, limit: number, totalDebit: string, totalCredit: string, netBalance: string, items: Array<{ id: string, date: string, reference: string | null, description: string | null, debit: string, credit: string, running_balance: string, journal_entry_id: string }> } | null };

export type JournalEntriesQueryVariables = Exact<{
  status?: string | null | undefined;
  fromDate?: string | null | undefined;
  toDate?: string | null | undefined;
}>;


export type JournalEntriesQuery = { journalEntries: Array<{ id: string, reference: string, entry_date: string, status: string, description: string | null, source_type: string | null, source_id: string | null, total_debit: string | null, total_credit: string | null, payment_currency: string | null, created_by_email: string | null } | null> | null };

export type JournalEntryQueryVariables = Exact<{
  id: string | number;
}>;


export type JournalEntryQuery = { journalEntry: { id: string, reference: string, entry_date: string, status: string, description: string | null, source_type: string | null, total_debit: string | null, total_credit: string | null, created_by_email: string | null, created_at: string | null, accountant_email: string | null, auditor_email: string | null, audited_at: string | null, journal_template_image: string | null, lines: Array<{ id: string, account_id: string, account_code: string | null, account_name: string | null, analytic_account_id: string | null, cost_center_id: string | null, description: string | null, currency_code: string | null, debit: string, credit: string, fx_rate: string | null }> | null, linked_pos: Array<{ po_id: string, po_number: string, vendor_name: string | null, status: string | null, total_amount: string | null, currency_code: string | null }> | null } | null };

export type CreateJournalEntryMutationVariables = Exact<{
  input: Types.JournalEntryInput;
}>;


export type CreateJournalEntryMutation = { createJournalEntry: { id: string, reference: string, status: string } };

export type PostJournalEntryMutationVariables = Exact<{
  id: string | number;
}>;


export type PostJournalEntryMutation = { postJournalEntry: { id: string, status: string } };

export type CancelJournalEntryMutationVariables = Exact<{
  id: string | number;
  reason?: string | null | undefined;
}>;


export type CancelJournalEntryMutation = { cancelJournalEntry: { id: string, status: string } };

export type AuditJournalEntryMutationVariables = Exact<{
  id: string | number;
}>;


export type AuditJournalEntryMutation = { auditJournalEntry: { id: string, status: string, auditor_email: string | null, audited_at: string | null } };

export type LinkJournalPOsMutationVariables = Exact<{
  id: string | number;
  poIds: Array<string | number> | string | number;
}>;


export type LinkJournalPOsMutation = { linkJournalPOs: Array<{ po_id: string, po_number: string, vendor_name: string | null, status: string | null, total_amount: string | null, currency_code: string | null }> };

export type CombineJournalEntriesMutationVariables = Exact<{
  journalIds: Array<string | number> | string | number;
  description?: string | null | undefined;
}>;


export type CombineJournalEntriesMutation = { combineJournalEntries: { id: string, reference: string, status: string } };

export type PaymentVouchersQueryVariables = Exact<{
  status?: string | null | undefined;
  fromDate?: string | null | undefined;
  toDate?: string | null | undefined;
}>;


export type PaymentVouchersQuery = { paymentVouchers: Array<{ id: string, voucher_number: string, voucher_date: string, received_from: string, status: string, total_amount_iqd: string, total_amount_usd: string, created_by_email: string | null, auditor_email: string | null, audited_at: string | null, journal_count: string | null, created_at: string, funding_source_label: string | null }> };

export type PaymentVoucherQueryVariables = Exact<{
  id: string | number;
}>;


export type PaymentVoucherQuery = { paymentVoucher: { id: string, voucher_number: string, voucher_date: string, received_from: string, reference_to: string | null, bank_account_fund: string | null, funding_source_type: string | null, petty_cash_float_id: string | null, recon_bank_account_id: string | null, funding_source_label: string | null, total_amount_iqd: string, total_amount_usd: string, status: string, receiver_name: string | null, notes: string | null, pv_template_image: string | null, created_by_email: string | null, cashier_email: string | null, auditor_email: string | null, audited_at: string | null, created_at: string, lines: Array<{ id: string, statement: string, acct_1: string | null, acct_2: string | null, acct_3: string | null, acct_4: string | null, acct_5: string | null, amount_iqd: string, amount_usd: string, sequence: number }> | null, journals: Array<{ id: string, reference: string, entry_date: string, status: string, description: string | null, audited_at: string | null, linked_pos: Array<{ po_id: string, po_number: string, vendor_name: string | null, status: string | null, total_amount: string | null, currency_code: string | null }> | null }> | null } | null };

export type CreatePaymentVoucherMutationVariables = Exact<{
  input: Types.CreatePaymentVoucherInput;
}>;


export type CreatePaymentVoucherMutation = { createPaymentVoucher: { id: string, voucher_number: string, status: string } };

export type UpdatePaymentVoucherMutationVariables = Exact<{
  id: string | number;
  input: Types.CreatePaymentVoucherInput;
}>;


export type UpdatePaymentVoucherMutation = { updatePaymentVoucher: { id: string, voucher_number: string, status: string } };

export type ApprovePaymentVoucherMutationVariables = Exact<{
  id: string | number;
}>;


export type ApprovePaymentVoucherMutation = { approvePaymentVoucher: { id: string, status: string, auditor_email: string | null, audited_at: string | null } };

export type MarkPaymentVoucherPaidMutationVariables = Exact<{
  id: string | number;
}>;


export type MarkPaymentVoucherPaidMutation = { markPaymentVoucherPaid: { id: string, status: string, cashier_email: string | null } };

export type CreateAccountMutationVariables = Exact<{
  input: Types.AccountInput;
}>;


export type CreateAccountMutation = { createAccount: { id: string, code: string, name: string } };

export type UpdateAccountMutationVariables = Exact<{
  id: string | number;
  input: Types.AccountInput;
}>;


export type UpdateAccountMutation = { updateAccount: { id: string, code: string, name: string } };

export type FxRatesQueryVariables = Exact<{
  fromCurrency?: string | null | undefined;
  toCurrency?: string | null | undefined;
  fromDate?: string | null | undefined;
  toDate?: string | null | undefined;
}>;


export type FxRatesQuery = { fxRates: Array<{ id: string, from_currency: string, to_currency: string, rate: string, rate_date: string, source: string | null, created_at: string | null }> };

export type FxRateStalenessQueryVariables = Exact<{ [key: string]: never; }>;


export type FxRateStalenessQuery = { fxRateStaleness: { overall: string, pairs: Array<{ currencyPair: string, lastRate: number | null, lastRateDate: string | null, ageHours: number | null, status: string, message: string }> } };

export type UpsertFxRateMutationVariables = Exact<{
  input: Types.FxRateInput;
}>;


export type UpsertFxRateMutation = { upsertFXRate: { id: string, from_currency: string, to_currency: string, rate: string } };

export type TriggerFxSyncMutationVariables = Exact<{ [key: string]: never; }>;


export type TriggerFxSyncMutation = { triggerFXSync: boolean };

export type AccountingPeriodsQueryVariables = Exact<{ [key: string]: never; }>;


export type AccountingPeriodsQuery = { accountingPeriods: Array<{ id: string, name: string, start_date: string, end_date: string, status: string, closed_by_email: string | null, closed_at: string | null }> };

export type CreateAccountingPeriodMutationVariables = Exact<{
  input: Types.PeriodInput;
}>;


export type CreateAccountingPeriodMutation = { createAccountingPeriod: { id: string, name: string, status: string } };

export type CloseAccountingPeriodMutationVariables = Exact<{
  id: string | number;
}>;


export type CloseAccountingPeriodMutation = { closeAccountingPeriod: { id: string, status: string } };

export type TrialBalanceQueryVariables = Exact<{
  asOfDate: string;
  companyId?: string | number | null | undefined;
}>;


export type TrialBalanceQuery = { trialBalance: Array<{ id: string, code: string, name: string, account_type: string, total_debit: string, total_credit: string, balance: string } | null> | null };

export type ProfitLossQueryVariables = Exact<{
  fromDate: string;
  toDate: string;
  costCenterId?: string | number | null | undefined;
}>;


export type ProfitLossQuery = { profitLoss: { totalRevenue: string, totalExpenses: string, netProfit: string, revenue: Array<{ account_id: string, code: string, name: string, amount: string }>, expenses: Array<{ account_id: string, code: string, name: string, amount: string }> } | null };

export type BalanceSheetQueryVariables = Exact<{
  asOfDate: string;
}>;


export type BalanceSheetQuery = { balanceSheet: { retainedEarnings: string, totalAssets: string, totalLiabilities: string, totalEquity: string, isBalanced: boolean, assets: Array<{ account_id: string, code: string, name: string, amount: string }>, liabilities: Array<{ account_id: string, code: string, name: string, amount: string }>, equity: Array<{ account_id: string, code: string, name: string, amount: string }> } | null };

export type AnalyticAccountsQueryVariables = Exact<{ [key: string]: never; }>;


export type AnalyticAccountsQuery = { analyticAccounts: Array<{ id: string, name: string, code: string }> };

export type CostCentersQueryVariables = Exact<{ [key: string]: never; }>;


export type CostCentersQuery = { costCenters: Array<{ id: string, name: string, code: string }> };

export type EmployeesQueryVariables = Exact<{
  department_id?: string | number | null | undefined;
  is_active?: boolean | null | undefined;
}>;


export type EmployeesQuery = { employees: Array<{ id: string, employee_number: string | null, first_name: string, last_name: string, email: string | null, department_id: string | null, department_name: string | null, job_title: string | null, employment_type: string | null, status: string, hire_date: string | null, user_id: string | null } | null> | null };

export type EmployeeQueryVariables = Exact<{
  id: string | number;
}>;


export type EmployeeQuery = { employee: { id: string, employee_number: string | null, first_name: string, last_name: string, email: string | null, phone: string | null, national_id: string | null, passport_number: string | null, nationality: string | null, date_of_birth: string | null, gender: string | null, job_title: string | null, department_id: string | null, department_name: string | null, work_location_id: string | null, manager_id: string | null, employment_type: string | null, hire_date: string | null, termination_date: string | null, status: string, is_active: boolean | null, user_id: string | null, linked_user_email: string | null, photo_url: string | null, advance_control_account_id: string | null, advance_control_account_code: string | null, advance_control_account_name: string | null } | null };

export type FindEmployeeAcrossCompaniesQueryVariables = Exact<{
  email: string;
}>;


export type FindEmployeeAcrossCompaniesQuery = { findEmployeeAcrossCompanies: { id: string, companyId: string, companyName: string, first_name: string, last_name: string, email: string | null, phone: string | null, national_id: string | null, passport_number: string | null, nationality: string | null, date_of_birth: string | null, gender: string | null, job_title: string | null, employment_type: string | null, user_id: string | null, linked_user_email: string | null } | null };

export type CreateEmployeeMutationVariables = Exact<{
  input: Types.EmployeeInput;
}>;


export type CreateEmployeeMutation = { createEmployee: { id: string, employee_number: string | null, first_name: string, last_name: string, status: string } | null };

export type UpdateEmployeeMutationVariables = Exact<{
  id: string | number;
  input: Types.EmployeeInput;
}>;


export type UpdateEmployeeMutation = { updateEmployee: { id: string, employee_number: string | null, first_name: string, last_name: string, status: string } | null };

export type LinkEmployeeUserMutationVariables = Exact<{
  employee_id: string | number;
  user_id?: string | number | null | undefined;
}>;


export type LinkEmployeeUserMutation = { linkEmployeeUser: { id: string, user_id: string | null } | null };

export type TerminateEmployeeMutationVariables = Exact<{
  id: string | number;
  terminationDate: string;
  reason: string;
}>;


export type TerminateEmployeeMutation = { terminateEmployee: { id: string, status: string, termination_date: string | null } | null };

export type DepartmentsQueryVariables = Exact<{ [key: string]: never; }>;


export type DepartmentsQuery = { departments: Array<{ id: string, name: string, parent_id: string | null, manager_id: string | null, is_active: boolean } | null> | null };

export type CreateDepartmentMutationVariables = Exact<{
  input: Types.DepartmentInput;
}>;


export type CreateDepartmentMutation = { createDepartment: { id: string, name: string, is_active: boolean } | null };

export type UpdateDepartmentMutationVariables = Exact<{
  id: string | number;
  input: Types.DepartmentInput;
}>;


export type UpdateDepartmentMutation = { updateDepartment: { id: string, name: string, is_active: boolean } | null };

export type WorkLocationsQueryVariables = Exact<{
  is_active?: boolean | null | undefined;
}>;


export type WorkLocationsQuery = { workLocations: Array<{ id: string, name: string, address: string | null, latitude: string | null, longitude: string | null, geofence_radius_m: number | null, is_active: boolean } | null> | null };

export type CreateWorkLocationMutationVariables = Exact<{
  input: Types.WorkLocationInput;
}>;


export type CreateWorkLocationMutation = { createWorkLocation: { id: string, name: string, is_active: boolean } | null };

export type UpdateWorkLocationMutationVariables = Exact<{
  id: string | number;
  input: Types.WorkLocationInput;
}>;


export type UpdateWorkLocationMutation = { updateWorkLocation: { id: string, name: string, is_active: boolean } | null };

export type ShiftConfigsQueryVariables = Exact<{ [key: string]: never; }>;


export type ShiftConfigsQuery = { shiftConfigs: Array<{ id: string, name: string, start_time: string | null, end_time: string | null, break_minutes: number | null, overtime_threshold_hours: string | null, is_active: boolean } | null> | null };

export type CreateShiftConfigMutationVariables = Exact<{
  input: Types.ShiftConfigInput;
}>;


export type CreateShiftConfigMutation = { createShiftConfig: { id: string, name: string } | null };

export type UpdateShiftConfigMutationVariables = Exact<{
  id: string | number;
  input: Types.ShiftConfigInput;
}>;


export type UpdateShiftConfigMutation = { updateShiftConfig: { id: string, name: string } | null };

export type EmployeeCurrentShiftQueryVariables = Exact<{
  employee_id: string | number;
}>;


export type EmployeeCurrentShiftQuery = { employeeCurrentShift: { id: string, shift_id: string, shift_name: string | null, start_time: string | null, end_time: string | null, break_minutes: number | null, overtime_threshold_hours: string | null, effective_from: string, effective_to: string | null } | null };

export type AssignShiftMutationVariables = Exact<{
  employee_id: string | number;
  shift_id: string | number;
  effective_from: string;
}>;


export type AssignShiftMutation = { assignShift: { id: string, shift_id: string, shift_name: string | null, effective_from: string } | null };

export type UnassignShiftMutationVariables = Exact<{
  employee_id: string | number;
}>;


export type UnassignShiftMutation = { unassignShift: boolean | null };

export type LeaveTypesQueryVariables = Exact<{
  is_active?: boolean | null | undefined;
}>;


export type LeaveTypesQuery = { leaveTypes: Array<{ id: string, name: string, is_paid: boolean, max_days_per_year: number | null, requires_approval: boolean, is_active: boolean } | null> | null };

export type CreateLeaveTypeMutationVariables = Exact<{
  input: Types.LeaveTypeInput;
}>;


export type CreateLeaveTypeMutation = { createLeaveType: { id: string, name: string } | null };

export type DeleteLeaveTypeMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteLeaveTypeMutation = { deleteLeaveType: boolean | null };

export type LeaveRequestsQueryVariables = Exact<{
  employee_id?: string | number | null | undefined;
  status?: string | null | undefined;
  from_date?: string | null | undefined;
  to_date?: string | null | undefined;
}>;


export type LeaveRequestsQuery = { leaveRequests: Array<{ id: string, employee_id: string, employee_name: string | null, leave_type_id: string | null, leave_type_name: string | null, start_date: string, end_date: string, total_days: number | null, status: string, reason: string | null, reviewed_at: string | null } | null> | null };

export type LeaveRequestQueryVariables = Exact<{
  id: string | number;
}>;


export type LeaveRequestQuery = { leaveRequest: { id: string, employee_id: string, employee_name: string | null, leave_type_id: string | null, leave_type_name: string | null, start_date: string, end_date: string, total_days: number | null, status: string, reason: string | null, reviewed_by: string | null, reviewed_at: string | null, created_at: string | null } | null };

export type LeaveBalancesQueryVariables = Exact<{
  employee_id: string | number;
}>;


export type LeaveBalancesQuery = { leaveBalances: Array<{ leave_type_id: string, leave_type_name: string, days_allocated: number | null, days_used: number | null, days_remaining: number | null } | null> | null };

export type CreateLeaveRequestMutationVariables = Exact<{
  input: Types.LeaveRequestInput;
}>;


export type CreateLeaveRequestMutation = { createLeaveRequest: { id: string, status: string } | null };

export type ApproveLeaveRequestMutationVariables = Exact<{
  id: string | number;
}>;


export type ApproveLeaveRequestMutation = { approveLeaveRequest: { id: string, status: string } | null };

export type RejectLeaveRequestMutationVariables = Exact<{
  id: string | number;
  reviewNotes?: string | null | undefined;
}>;


export type RejectLeaveRequestMutation = { rejectLeaveRequest: { id: string, status: string } | null };

export type CancelLeaveRequestMutationVariables = Exact<{
  id: string | number;
}>;


export type CancelLeaveRequestMutation = { cancelLeaveRequest: { id: string, status: string } | null };

export type OvertimeRequestsQueryVariables = Exact<{
  employee_id?: string | number | null | undefined;
  from_date?: string | null | undefined;
  to_date?: string | null | undefined;
}>;


export type OvertimeRequestsQuery = { overtimeRequests: Array<{ id: string, employee_id: string, employee_name: string | null, work_date: string, regular_hours: string | null, overtime_hours: string, overtime_multiplier: number | null, status: string, review_notes: string | null, reviewed_by_email: string | null } | null> | null };

export type ApproveOvertimeRequestMutationVariables = Exact<{
  id: string | number;
}>;


export type ApproveOvertimeRequestMutation = { approveOvertimeRequest: { id: string, status: string } | null };

export type RejectOvertimeRequestMutationVariables = Exact<{
  id: string | number;
  reviewNotes?: string | null | undefined;
}>;


export type RejectOvertimeRequestMutation = { rejectOvertimeRequest: { id: string, status: string } | null };

export type BulkApproveOvertimeMutationVariables = Exact<{
  ids: Array<string | number> | string | number;
}>;


export type BulkApproveOvertimeMutation = { bulkApproveOvertime: Array<{ id: string, status: string } | null> | null };

export type EmployeeSalaryConfigQueryVariables = Exact<{
  employee_id: string | number;
}>;


export type EmployeeSalaryConfigQuery = { employeeSalaryConfig: { id: string, employee_id: string, base_salary: string, currency_code: string, housing_allowance: string | null, transport_allowance: string | null, other_allowances: string | null, income_tax_pct: string | null, social_security_pct: string | null, effective_from: string | null, effective_to: string | null } | null };

export type UpdateSalaryConfigMutationVariables = Exact<{
  employee_id: string | number;
  input: Types.SalaryConfigInput;
}>;


export type UpdateSalaryConfigMutation = { updateSalaryConfig: { id: string, employee_id: string, base_salary: string, currency_code: string, housing_allowance: string | null, transport_allowance: string | null, other_allowances: string | null, income_tax_pct: string | null, social_security_pct: string | null, effective_from: string | null } | null };

export type AttendanceLogsQueryVariables = Exact<{
  employee_id?: string | number | null | undefined;
  from_date?: string | null | undefined;
  to_date?: string | null | undefined;
}>;


export type AttendanceLogsQuery = { attendanceLogs: Array<{ id: string, employee_id: string, employee_name: string | null, punch_type: string, punched_at: string, geofence_valid: boolean | null, distance_from_location_m: string | null, work_location_id: string | null } | null> | null };

export type AttendanceCalendarQueryVariables = Exact<{
  employeeId: string | number;
  month: string;
}>;


export type AttendanceCalendarQuery = { attendanceCalendar: Array<{ date: string, hoursWorked: number | null, hasOvertime: boolean, isAbsent: boolean, isWeekend: boolean, isLeave: boolean, leaveTypeName: string | null } | null> | null };

export type AttendanceSummaryQueryVariables = Exact<{
  employeeId: string | number;
  month: string;
}>;


export type AttendanceSummaryQuery = { attendanceSummary: { days_present: number | null, days_absent: number | null, total_hours: number | null, overtime_hours: number | null, leave_days: number | null } | null };

export type BankDetailsSummaryQueryVariables = Exact<{
  employee_id: string | number;
}>;


export type BankDetailsSummaryQuery = { bankDetailsSummary: { bank_name: string | null, currency_code: string | null, has_account: boolean } | null };

export type RevealBankDetailsMutationVariables = Exact<{
  employee_id: string | number;
}>;


export type RevealBankDetailsMutation = { revealBankDetails: { bank_name: string | null, account_number: string | null, iban: string | null, currency_code: string | null } | null };

export type UpdateBankDetailsMutationVariables = Exact<{
  employee_id: string | number;
  input: Types.BankDetailsInput;
}>;


export type UpdateBankDetailsMutation = { updateBankDetails: { id: string, first_name: string, last_name: string } | null };

export type EntityAttachmentsQueryVariables = Exact<{
  entityType: string;
  entityId: string | number;
}>;


export type EntityAttachmentsQuery = { entityAttachments: Array<{ id: string, label: string | null, isPrimary: boolean, createdAt: string, uploadedByEmail: string | null, sourceEntityType: string | null, file: { id: string, originalFilename: string, mimeType: string, sizeBytes: number, category: string, uploadedAt: string | null } }> };

export type AttachFileMutationVariables = Exact<{
  fileId: string | number;
  entityType: string;
  entityId: string | number;
  label?: string | null | undefined;
}>;


export type AttachFileMutation = { attachFile: { id: string, label: string | null, createdAt: string, file: { id: string, originalFilename: string, mimeType: string, sizeBytes: number } } };

export type DetachFileMutationVariables = Exact<{
  attachmentId: string | number;
  entityType: string;
  entityId: string | number;
}>;


export type DetachFileMutation = { detachFile: boolean };

export type FileDownloadUrlQueryVariables = Exact<{
  fileId: string | number;
}>;


export type FileDownloadUrlQuery = { fileDownloadUrl: { downloadUrl: string, filename: string, mimeType: string, expiresInSeconds: number } };

export type IntercoTransactionsQueryVariables = Exact<{
  fromCompanyId?: string | number | null | undefined;
  toCompanyId?: string | number | null | undefined;
  status?: string | null | undefined;
  transactionType?: string | null | undefined;
  fromDate?: string | null | undefined;
  toDate?: string | null | undefined;
  page?: number | null | undefined;
  limit?: number | null | undefined;
}>;


export type IntercoTransactionsQuery = { intercoTransactions: { total: number, page: number, limit: number, items: Array<{ id: string, reference: string, transactionType: string, fromCompanyName: string, toCompanyName: string, amount: number, currencyCode: string, status: string, createdAt: string }> } };

export type IntercoTransactionQueryVariables = Exact<{
  id: string | number;
}>;


export type IntercoTransactionQuery = { intercoTransaction: { id: string, reference: string, transactionType: string, fromCompanyId: string, fromCompanyName: string, toCompanyId: string, toCompanyName: string, amount: number, currencyCode: string, description: string | null, fromAccountId: string | null, fromAccountName: string | null, toAccountId: string | null, toAccountName: string | null, status: string, postedAt: string | null, postedBy: string | null, fromJournalId: string | null, toJournalId: string | null, createdAt: string, fromCompanyApprovedBy: string | null, fromCompanyApprovedAt: string | null, toCompanyApprovedBy: string | null, toCompanyApprovedAt: string | null } | null };

export type IntercoStockTransfersQueryVariables = Exact<{
  fromCompanyId?: string | number | null | undefined;
  toCompanyId?: string | number | null | undefined;
  status?: string | null | undefined;
  fromDate?: string | null | undefined;
  toDate?: string | null | undefined;
  page?: number | null | undefined;
  limit?: number | null | undefined;
}>;


export type IntercoStockTransfersQuery = { intercoStockTransfers: { total: number, page: number, limit: number, items: Array<{ id: string, transferNumber: string, fromCompanyName: string, toCompanyName: string, totalValue: number, currencyCode: string, pricingMethod: string, status: string, transferDate: string, intercoTransactionId: string | null, intercoTransactionReference: string | null, intercoTransactionStatus: string | null }> } };

export type IntercoStockTransferQueryVariables = Exact<{
  id: string | number;
}>;


export type IntercoStockTransferQuery = { intercoStockTransfer: { id: string, transferNumber: string, fromCompanyId: string, fromCompanyName: string, toCompanyId: string, toCompanyName: string, pricingMethod: string, status: string, transferDate: string, fromStockMoveId: string | null, toStockMoveId: string | null, fromJournalId: string | null, toJournalId: string | null, intercoTransactionId: string | null, intercoTransactionReference: string | null, intercoTransactionStatus: string | null, currencyCode: string, lines: Array<{ id: string, productName: string, sku: string | null, qty: number, avcoAtTransfer: number, transferPrice: number, markupPct: number, totalValue: number, currencyCode: string }> } | null };

export type CompanyIntercoPricingSettingsQueryVariables = Exact<{
  companyId: string | number;
}>;


export type CompanyIntercoPricingSettingsQuery = { companyIntercoPricingSettings: { companyId: string | null, companyName: string | null, method: string, costPlusMarkupPct: number | null, updatedAt: string | null, updatedByEmail: string | null } | null };

export type IntercoPricingConfigHistoryQueryVariables = Exact<{
  companyId: string | number;
}>;


export type IntercoPricingConfigHistoryQuery = { intercoPricingConfigHistory: Array<{ previousMethod: string, newMethod: string, changedBy: string, changedAt: string, notes: string | null }> };

export type CreateIntercoTransactionMutationVariables = Exact<{
  input: Types.IntercoTransactionInput;
}>;


export type CreateIntercoTransactionMutation = { createIntercoTransaction: { id: string, reference: string, status: string } };

export type PostIntercoTransactionMutationVariables = Exact<{
  id: string | number;
}>;


export type PostIntercoTransactionMutation = { postIntercoTransaction: { id: string, status: string, fromJournalId: string | null, toJournalId: string | null } };

export type SetIntercoTransactionAccountMutationVariables = Exact<{
  id: string | number;
  accountId: string | number;
}>;


export type SetIntercoTransactionAccountMutation = { setIntercoTransactionAccount: { id: string, fromAccountId: string | null, fromAccountName: string | null, toAccountId: string | null, toAccountName: string | null } };

export type CancelIntercoTransactionMutationVariables = Exact<{
  id: string | number;
}>;


export type CancelIntercoTransactionMutation = { cancelIntercoTransaction: { id: string, status: string } };

export type ApproveIntercoCompanyMutationVariables = Exact<{
  id: string | number;
}>;


export type ApproveIntercoCompanyMutation = { approveIntercoCompany: { id: string, status: string, fromCompanyApprovedBy: string | null, fromCompanyApprovedAt: string | null, toCompanyApprovedBy: string | null, toCompanyApprovedAt: string | null } };

export type UpdateIntercoPricingMutationVariables = Exact<{
  companyId: string | number;
  input: Types.IntercoPricingInput;
}>;


export type UpdateIntercoPricingMutation = { updateIntercoPricing: { companyId: string, method: string, costPlusMarkupPct: number | null } };

export type CreateIntercoStockTransferMutationVariables = Exact<{
  input: Types.IntercoStockTransferInput;
}>;


export type CreateIntercoStockTransferMutation = { createIntercoStockTransfer: { id: string, transferNumber: string, status: string } };

export type ProductsQueryVariables = Exact<{
  category?: string | null | undefined;
  companyId?: string | number | null | undefined;
  includeCentralWarehouse?: boolean | null | undefined;
}>;


export type ProductsQuery = { products: Array<{ id: string, sku: string, name: string, name_ar: string | null, category: string | null, sub_category: string | null, uom: string, valuation_method: string, average_cost: string, cost_currency: string | null, is_active: boolean, reorder_point: string | null, qty_on_hand: string | null } | null> | null };

export type ProductQueryVariables = Exact<{
  id: string | number;
}>;


export type ProductQuery = { product: { id: string, sku: string, name: string, name_ar: string | null, description: string | null, category: string | null, sub_category: string | null, uom: string, valuation_method: string, standard_cost: string | null, cost_currency: string | null, average_cost: string, is_active: boolean, reorder_point: string | null, reorder_qty: string | null, has_stock_moves: boolean | null, balances: Array<{ location_id: string, location_name: string | null, location_type: string | null, qty_on_hand: string, qty_reserved: string, available: string, average_cost: string, last_cost_currency: string, total_value: string }> | null, costHistory: Array<{ id: string, old_cost: string | null, new_cost: string, currency_code: string, source_type: string, source_label: string | null, changed_by_name: string | null, changed_at: string }> | null } | null };

export type CreateProductMutationVariables = Exact<{
  input: Types.ProductInput;
}>;


export type CreateProductMutation = { createProduct: { id: string, sku: string, name: string } };

export type UpdateProductMutationVariables = Exact<{
  id: string | number;
  input: Types.ProductInput;
}>;


export type UpdateProductMutation = { updateProduct: { id: string, sku: string, name: string } };

export type PendingProductCatalogItemsQueryVariables = Exact<{ [key: string]: never; }>;


export type PendingProductCatalogItemsQuery = { pendingProductCatalogItems: Array<{ id: string, po_id: string, po_number: string, po_line_id: string, description: string, qty: string | null, uom: string | null, unit_price: string | null, currency_code: string | null, source: string, created_at: string }> };

export type CreateProductFromPendingCatalogItemMutationVariables = Exact<{
  id: string | number;
  input: Types.ProductInput;
  companyId?: string | number | null | undefined;
}>;


export type CreateProductFromPendingCatalogItemMutation = { createProductFromPendingCatalogItem: { id: string, sku: string, name: string } };

export type LinkPendingCatalogItemToProductMutationVariables = Exact<{
  id: string | number;
  productId: string | number;
  companyId?: string | number | null | undefined;
}>;


export type LinkPendingCatalogItemToProductMutation = { linkPendingCatalogItemToProduct: boolean };

export type MyCompaniesQueryVariables = Exact<{ [key: string]: never; }>;


export type MyCompaniesQuery = { myCompanies: Array<{ id: string, name: string }> };

export type StockLocationsQueryVariables = Exact<{
  type?: string | null | undefined;
  isActive?: boolean | null | undefined;
  companyId?: string | number | null | undefined;
}>;


export type StockLocationsQuery = { stockLocations: Array<{ id: string, name: string, code: string | null, type: string, parent_id: string | null, parent_name: string | null, is_active: boolean, address: string | null }> };

export type CentralWarehouseLocationsQueryVariables = Exact<{
  type?: string | null | undefined;
  isActive?: boolean | null | undefined;
}>;


export type CentralWarehouseLocationsQuery = { centralWarehouseLocations: Array<{ id: string, name: string, code: string | null, type: string, parent_id: string | null, parent_name: string | null, is_active: boolean, address: string | null }> };

export type CreateStockLocationMutationVariables = Exact<{
  input: Types.LocationInput;
}>;


export type CreateStockLocationMutation = { createStockLocation: { id: string, name: string, code: string | null } };

export type StockBalancesQueryVariables = Exact<{
  productId?: string | number | null | undefined;
  locationId?: string | number | null | undefined;
}>;


export type StockBalancesQuery = { stockBalances: Array<{ product_id: string, location_id: string, qty_on_hand: string, average_cost: string, last_cost_currency: string | null, product_name: string | null, location_name: string | null } | null> | null };

export type StockSnapshotQueryVariables = Exact<{ [key: string]: never; }>;


export type StockSnapshotQuery = { stockBalanceSnapshot: { totalValue: string, currency: string, rows: Array<{ product_id: string, sku: string, product_name: string, category: string | null, location_id: string, location_name: string, location_type: string, qty_on_hand: string, qty_reserved: string, available: string, average_cost: string, total_value: string, is_low_stock: boolean }> } };

export type StockMovesQueryVariables = Exact<{
  productId?: string | number | null | undefined;
  fromLocationId?: string | number | null | undefined;
  sourceType?: string | null | undefined;
}>;


export type StockMovesQuery = { stockMoves: Array<{ id: string, move_date: string, product_id: string, product_name: string | null, sku: string | null, from_location_id: string | null, from_location_name: string | null, to_location_id: string | null, to_location_name: string | null, qty: string, unit_cost: string | null, total_cost: string | null, source_type: string, reference: string | null, lot_id: string | null, lot_number: string | null, moved_by_email: string | null }> };

export type CreateManualTransferMutationVariables = Exact<{
  input: Types.TransferInput;
}>;


export type CreateManualTransferMutation = { createManualTransfer: { id: string, move_date: string, qty: string } };

export type CreateStockAdjustmentMutationVariables = Exact<{
  input: Types.StockAdjustmentInput;
}>;


export type CreateStockAdjustmentMutation = { createStockAdjustment: { id: string, move_date: string, qty: string } | null };

export type StockLotsQueryVariables = Exact<{
  productId?: string | number | null | undefined;
}>;


export type StockLotsQuery = { stockLots: Array<{ id: string, lot_number: string, product_id: string, product_name: string | null, expiry_date: string | null, created_at: string, current_qty: string | null, current_location_name: string | null }> };

export type StockLotQueryVariables = Exact<{
  id: string | number;
}>;


export type StockLotQuery = { stockLot: { id: string, lot_number: string, product_id: string, product_name: string | null, sku: string | null, expiry_date: string | null, created_at: string, current_qty: string | null, current_location_id: string | null, current_location_name: string | null, moves: Array<{ id: string, move_date: string, direction: string, from_location_name: string | null, to_location_name: string | null, qty: string, source_type: string, reference: string | null, moved_by_email: string | null }> | null } | null };

export type OnEntityChangedSubscriptionVariables = Exact<{
  companyId: string | number;
  entityType: string;
}>;


export type OnEntityChangedSubscription = { entityChanged: { companyId: string, entityType: string, entityId: string, action: string, updatedAt: string } };

export type RecordLockFieldsFragment = { entityType: string, entityId: string, lockedBy: string, lockedByName: string, lockedAt: string, lockedByMe: boolean };

export type RecordLockQueryVariables = Exact<{
  entityType: string;
  entityId: string | number;
}>;


export type RecordLockQuery = { recordLock: { entityType: string, entityId: string, lockedBy: string, lockedByName: string, lockedAt: string, lockedByMe: boolean } | null };

export type AcquireLockMutationVariables = Exact<{
  entityType: string;
  entityId: string | number;
}>;


export type AcquireLockMutation = { acquireLock: { entityType: string, entityId: string, lockedBy: string, lockedByName: string, lockedAt: string, lockedByMe: boolean } };

export type HeartbeatLockMutationVariables = Exact<{
  entityType: string;
  entityId: string | number;
}>;


export type HeartbeatLockMutation = { heartbeatLock: boolean };

export type ReleaseLockMutationVariables = Exact<{
  entityType: string;
  entityId: string | number;
}>;


export type ReleaseLockMutation = { releaseLock: boolean };

export type OnLockChangedSubscriptionVariables = Exact<{
  entityType: string;
  entityId: string | number;
}>;


export type OnLockChangedSubscription = { lockChanged: { entityType: string, entityId: string, lock: { entityType: string, entityId: string, lockedBy: string, lockedByName: string, lockedAt: string, lockedByMe: boolean } | null } };

export type MrFieldsFragment = { id: string, requestNumber: string, projectId: string, projectName: string | null, requestingCompanyId: string, requestingCompanyName: string | null, productId: string | null, productName: string | null, productSku: string | null, qtyRequested: number, requiredDate: string | null, description: string | null, status: string, requestedBy: string, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, moId: string | null, moNumber: string | null, actualCost: number | null, currencyCode: string, notes: string | null, createdAt: string };

export type ManufacturingRequestsQueryVariables = Exact<{
  projectId?: string | number | null | undefined;
  status?: string | null | undefined;
}>;


export type ManufacturingRequestsQuery = { manufacturingRequests: Array<{ id: string, requestNumber: string, projectId: string, projectName: string | null, requestingCompanyId: string, requestingCompanyName: string | null, productId: string | null, productName: string | null, productSku: string | null, qtyRequested: number, requiredDate: string | null, description: string | null, status: string, requestedBy: string, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, moId: string | null, moNumber: string | null, actualCost: number | null, currencyCode: string, notes: string | null, createdAt: string }> };

export type ManufacturingRequestQueryVariables = Exact<{
  id: string | number;
}>;


export type ManufacturingRequestQuery = { manufacturingRequest: { id: string, requestNumber: string, projectId: string, projectName: string | null, requestingCompanyId: string, requestingCompanyName: string | null, productId: string | null, productName: string | null, productSku: string | null, qtyRequested: number, requiredDate: string | null, description: string | null, status: string, requestedBy: string, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, moId: string | null, moNumber: string | null, actualCost: number | null, currencyCode: string, notes: string | null, createdAt: string } | null };

export type CreateManufacturingRequestMutationVariables = Exact<{
  input: Types.ManufacturingRequestInput;
}>;


export type CreateManufacturingRequestMutation = { createManufacturingRequest: { id: string, requestNumber: string, projectId: string, projectName: string | null, requestingCompanyId: string, requestingCompanyName: string | null, productId: string | null, productName: string | null, productSku: string | null, qtyRequested: number, requiredDate: string | null, description: string | null, status: string, requestedBy: string, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, moId: string | null, moNumber: string | null, actualCost: number | null, currencyCode: string, notes: string | null, createdAt: string } };

export type SubmitManufacturingRequestMutationVariables = Exact<{
  id: string | number;
}>;


export type SubmitManufacturingRequestMutation = { submitManufacturingRequest: { id: string, requestNumber: string, projectId: string, projectName: string | null, requestingCompanyId: string, requestingCompanyName: string | null, productId: string | null, productName: string | null, productSku: string | null, qtyRequested: number, requiredDate: string | null, description: string | null, status: string, requestedBy: string, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, moId: string | null, moNumber: string | null, actualCost: number | null, currencyCode: string, notes: string | null, createdAt: string } };

export type ApproveManufacturingRequestMutationVariables = Exact<{
  id: string | number;
}>;


export type ApproveManufacturingRequestMutation = { approveManufacturingRequest: { id: string, requestNumber: string, projectId: string, projectName: string | null, requestingCompanyId: string, requestingCompanyName: string | null, productId: string | null, productName: string | null, productSku: string | null, qtyRequested: number, requiredDate: string | null, description: string | null, status: string, requestedBy: string, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, moId: string | null, moNumber: string | null, actualCost: number | null, currencyCode: string, notes: string | null, createdAt: string } };

export type RejectManufacturingRequestMutationVariables = Exact<{
  id: string | number;
  reason: string;
}>;


export type RejectManufacturingRequestMutation = { rejectManufacturingRequest: { id: string, requestNumber: string, projectId: string, projectName: string | null, requestingCompanyId: string, requestingCompanyName: string | null, productId: string | null, productName: string | null, productSku: string | null, qtyRequested: number, requiredDate: string | null, description: string | null, status: string, requestedBy: string, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, moId: string | null, moNumber: string | null, actualCost: number | null, currencyCode: string, notes: string | null, createdAt: string } };

export type CancelManufacturingRequestMutationVariables = Exact<{
  id: string | number;
}>;


export type CancelManufacturingRequestMutation = { cancelManufacturingRequest: { id: string, requestNumber: string, projectId: string, projectName: string | null, requestingCompanyId: string, requestingCompanyName: string | null, productId: string | null, productName: string | null, productSku: string | null, qtyRequested: number, requiredDate: string | null, description: string | null, status: string, requestedBy: string, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, moId: string | null, moNumber: string | null, actualCost: number | null, currencyCode: string, notes: string | null, createdAt: string } };

export type CreateMoFromRequestMutationVariables = Exact<{
  requestId: string | number;
  bomId: string | number;
  workCenterId?: string | number | null | undefined;
  scheduledStart?: string | null | undefined;
  scheduledEnd?: string | null | undefined;
}>;


export type CreateMoFromRequestMutation = { createMOFromRequest: { id: string, requestNumber: string, projectId: string, projectName: string | null, requestingCompanyId: string, requestingCompanyName: string | null, productId: string | null, productName: string | null, productSku: string | null, qtyRequested: number, requiredDate: string | null, description: string | null, status: string, requestedBy: string, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, moId: string | null, moNumber: string | null, actualCost: number | null, currencyCode: string, notes: string | null, createdAt: string } };

export type WorkCentersQueryVariables = Exact<{
  isActive?: boolean | null | undefined;
  allCompanies?: boolean | null | undefined;
}>;


export type WorkCentersQuery = { workCenters: Array<{ id: string, code: string, name: string, capacity_hours_per_day: number, cost_per_hour: number, currency_code: string, is_active: boolean }> };

export type BoMsQueryVariables = Exact<{
  finishedProductId?: string | number | null | undefined;
  isActive?: boolean | null | undefined;
  allCompanies?: boolean | null | undefined;
}>;


export type BoMsQuery = { boms: Array<{ id: string, company_id: string, finished_product_id: string, product_name: string | null, version: string, qty_produced: string, is_active: boolean }> };

export type BomQueryVariables = Exact<{
  id: string | number;
}>;


export type BomQuery = { bom: { id: string, finished_product_id: string, product_name: string | null, version: string, qty_produced: string, is_active: boolean, notes: string | null, lines: Array<{ id: string, sequence: number, component_product_id: string, component_name: string | null, qty: number, uom: string, unit_cost: number | null }> | null } | null };

export type ManufacturingOrdersQueryVariables = Exact<{
  status?: string | null | undefined;
  projectId?: string | number | null | undefined;
  page?: number | null | undefined;
  limit?: number | null | undefined;
}>;


export type ManufacturingOrdersQuery = { manufacturingOrders: Array<{ id: string, mo_number: string, status: string, qty_planned: string, qty_produced: string, planned_cost: string, actual_cost: string, dispatch_type: string, product_name: string | null, work_center_name: string | null, project_name: string | null, project_analytic_account_id: string | null, scheduled_start: string | null, scheduled_end: string | null, created_at: string }> };

export type ManufacturingOrderQueryVariables = Exact<{
  id: string | number;
}>;


export type ManufacturingOrderQuery = { manufacturingOrder: { id: string, mo_number: string, status: string, qty_planned: string, qty_produced: string, planned_cost: string, actual_cost: string, dispatch_type: string, product_name: string | null, work_center_id: string | null, work_center_name: string | null, bom_id: string | null, bom_version: string | null, project_id: string | null, project_name: string | null, scheduled_start: string | null, scheduled_end: string | null, actual_start: string | null, actual_end: string | null, notes: string | null, created_by_email: string | null, lines: Array<{ id: string, component_product_id: string, component_name: string | null, qty_planned: number, qty_consumed: number, unit_cost: number, total_cost: number }> | null } | null };

export type MoCostAnalysisQueryVariables = Exact<{
  moId: string | number;
}>;


export type MoCostAnalysisQuery = { moCostAnalysis: { plannedCost: number, actualCost: number, variance: number, variancePct: number, componentBreakdown: Array<{ key: string, label: string, amount: number }> } };

export type CreateWorkCenterMutationVariables = Exact<{
  input: Types.WorkCenterInput;
}>;


export type CreateWorkCenterMutation = { createWorkCenter: { id: string, code: string, name: string, is_active: boolean } };

export type UpdateWorkCenterMutationVariables = Exact<{
  id: string | number;
  input: Types.WorkCenterInput;
}>;


export type UpdateWorkCenterMutation = { updateWorkCenter: { id: string, name: string, is_active: boolean } };

export type CreateBomMutationVariables = Exact<{
  input: Types.BomInput;
}>;


export type CreateBomMutation = { createBOM: { id: string, version: string, product_name: string | null } };

export type UpdateBomMutationVariables = Exact<{
  id: string | number;
  input: Types.BomInput;
}>;


export type UpdateBomMutation = { updateBOM: { id: string, version: string, product_name: string | null } };

export type CreateManufacturingOrderMutationVariables = Exact<{
  input: Types.MoInput;
}>;


export type CreateManufacturingOrderMutation = { createManufacturingOrder: { id: string, mo_number: string, status: string, planned_cost: string } };

export type ConfirmMoMutationVariables = Exact<{
  id: string | number;
}>;


export type ConfirmMoMutation = { confirmMO: { id: string, status: string } };

export type StartMoMutationVariables = Exact<{
  id: string | number;
}>;


export type StartMoMutation = { startMO: { id: string, status: string, actual_start: string | null } };

export type CompleteMoMutationVariables = Exact<{
  id: string | number;
  input: Types.MoCompletionInput;
}>;


export type CompleteMoMutation = { completeMO: { id: string, status: string, qty_produced: string, actual_cost: string } };

export type CancelMoMutationVariables = Exact<{
  id: string | number;
  notes?: string | null | undefined;
}>;


export type CancelMoMutation = { cancelMO: { id: string, status: string } };

export type NotificationFieldsFragment = { id: string, type: string, title: string, body: string, is_read: boolean, created_at: string, priority: string | null, entityRef: string | null, entityType: string | null, entityId: string | null, projectId: string | null };

export type MyNotificationsQueryVariables = Exact<{
  is_read?: boolean | null | undefined;
  limit?: number | null | undefined;
}>;


export type MyNotificationsQuery = { unreadNotificationCount: number, notifications: Array<{ id: string, type: string, title: string, body: string, is_read: boolean, created_at: string, priority: string | null, entityRef: string | null, entityType: string | null, entityId: string | null, projectId: string | null } | null> | null };

export type MarkNotificationReadMutationVariables = Exact<{
  id: string | number;
}>;


export type MarkNotificationReadMutation = { markNotificationRead: { id: string, type: string, title: string, body: string, is_read: boolean, created_at: string, priority: string | null, entityRef: string | null, entityType: string | null, entityId: string | null, projectId: string | null } };

export type MarkAllNotificationsReadMutationVariables = Exact<{ [key: string]: never; }>;


export type MarkAllNotificationsReadMutation = { markAllNotificationsRead: number };

export type PayrollRunsQueryVariables = Exact<{
  status?: string | null | undefined;
}>;


export type PayrollRunsQuery = { payrollRuns: Array<{ id: string, period_name: string, start_date: string | null, end_date: string | null, status: string, total_gross: string, total_net: string, total_deductions: string | null, created_at: string } | null> | null };

export type PayrollRunQueryVariables = Exact<{
  id: string | number;
}>;


export type PayrollRunQuery = { payrollRun: { id: string, period_name: string, start_date: string | null, end_date: string | null, status: string, total_gross: string, total_net: string, total_deductions: string | null, created_at: string } | null };

export type PayslipQueryVariables = Exact<{
  id: string | number;
}>;


export type PayslipQuery = { payslip: { id: string, payroll_run_id: string | null, employee_id: string | null, employee_name: string | null, employee_number: string | null, base_salary: string | null, housing_allowance: string | null, transport_allowance: string | null, other_allowances: string | null, overtime_hours: string | null, overtime_pay: string | null, gross_salary: string, income_tax: string, social_security: string, other_deductions: string | null, net_salary: string, currency_code: string | null, working_days: number | null, absent_days: number | null, leave_days: number | null } | null };

export type PayslipsQueryVariables = Exact<{
  payroll_run_id?: string | number | null | undefined;
  employee_id?: string | number | null | undefined;
}>;


export type PayslipsQuery = { payslips: Array<{ id: string, payroll_run_id: string | null, employee_id: string | null, employee_name: string | null, employee_number: string | null, base_salary: string | null, housing_allowance: string | null, transport_allowance: string | null, other_allowances: string | null, overtime_hours: string | null, overtime_pay: string | null, gross_salary: string, income_tax: string, social_security: string, other_deductions: string | null, net_salary: string, currency_code: string | null, working_days: number | null, absent_days: number | null, leave_days: number | null } | null> | null };

export type MyPayslipsQueryVariables = Exact<{ [key: string]: never; }>;


export type MyPayslipsQuery = { myPayslips: Array<{ id: string, payroll_run_id: string | null, employee_id: string | null, employee_name: string | null, employee_number: string | null, gross_salary: string, net_salary: string, income_tax: string, social_security: string, currency_code: string | null, working_days: number | null, absent_days: number | null, leave_days: number | null, overtime_hours: string | null } | null> | null };

export type CreatePayrollRunMutationVariables = Exact<{
  input: Types.PayrollRunInput;
}>;


export type CreatePayrollRunMutation = { createPayrollRun: { id: string, period_name: string, status: string } | null };

export type ProcessPayrollRunMutationVariables = Exact<{
  id: string | number;
}>;


export type ProcessPayrollRunMutation = { processPayrollRun: { id: string, status: string } | null };

export type ApprovePayrollRunMutationVariables = Exact<{
  id: string | number;
}>;


export type ApprovePayrollRunMutation = { approvePayrollRun: { id: string, status: string } | null };

export type PostPayrollRunMutationVariables = Exact<{
  id: string | number;
}>;


export type PostPayrollRunMutation = { postPayrollRun: { id: string, status: string } | null };

export type CancelPayrollRunMutationVariables = Exact<{
  id: string | number;
}>;


export type CancelPayrollRunMutation = { cancelPayrollRun: { id: string, status: string } | null };

export type GetUserPermissionsQueryVariables = Exact<{
  userId: string | number;
  companyId: string | number;
}>;


export type GetUserPermissionsQuery = { userPermissions: { userId: string, companyId: string, isAdmin: boolean, permissions: Array<{ key: string, label: string, module: string, submodule: string, accessLevel: string }> } };

export type GetUserCompaniesQueryVariables = Exact<{
  userId: string | number;
}>;


export type GetUserCompaniesQuery = { userCompanies: Array<{ id: string, name: string }> };

export type SaveUserPermissionsMutationVariables = Exact<{
  input: Types.SaveUserPermissionsInput;
}>;


export type SaveUserPermissionsMutation = { saveUserPermissions: { userId: string, companyId: string, isAdmin: boolean, permissions: Array<{ key: string, accessLevel: string }> } };

export type GetRoleTemplatesQueryVariables = Exact<{ [key: string]: never; }>;


export type GetRoleTemplatesQuery = { roleTemplates: Array<{ id: string, name: string, description: string | null, isSystem: boolean, createdAt: string, permissions: Array<{ key: string, accessLevel: string }> }> };

export type GetRoleTemplateQueryVariables = Exact<{
  id: string | number;
}>;


export type GetRoleTemplateQuery = { roleTemplate: { id: string, name: string, description: string | null, isSystem: boolean, createdAt: string, permissions: Array<{ key: string, accessLevel: string }> } | null };

export type CreateRoleTemplateMutationVariables = Exact<{
  input: Types.RoleTemplateInput;
}>;


export type CreateRoleTemplateMutation = { createRoleTemplate: { id: string, name: string, description: string | null, isSystem: boolean, createdAt: string, permissions: Array<{ key: string, accessLevel: string }> } };

export type UpdateRoleTemplateMutationVariables = Exact<{
  id: string | number;
  input: Types.RoleTemplateInput;
}>;


export type UpdateRoleTemplateMutation = { updateRoleTemplate: { id: string, name: string, description: string | null, isSystem: boolean, createdAt: string, permissions: Array<{ key: string, accessLevel: string }> } };

export type DeleteRoleTemplateMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteRoleTemplateMutation = { deleteRoleTemplate: boolean };

export type OnPermissionsChangedSubscriptionVariables = Exact<{
  userId: string | number;
}>;


export type OnPermissionsChangedSubscription = { permissionsChanged: { userId: string, companyId: string } };

export type GetUserPoPositionsQueryVariables = Exact<{
  userId: string | number;
}>;


export type GetUserPoPositionsQuery = { userPOPositions: Array<{ id: string, employeeId: string, employeeName: string, position: string, projectId: string | null, projectName: string | null, departmentId: string | null, departmentName: string | null, branchId: string | null, branchName: string | null, isActive: boolean, createdAt: string }> };

export type PoFxRatesQueryVariables = Exact<{ [key: string]: never; }>;


export type PoFxRatesQuery = { poFxRates: { base_currency: string, rates: Array<{ currency_code: string, rate_to_base: number, is_default: boolean }> } };

export type VendorsQueryVariables = Exact<{ [key: string]: never; }>;


export type VendorsQuery = { vendors: Array<{ id: string, name: string, legal_name: string | null, tax_id: string | null, currency_code: string, payment_terms_days: number, country_code: string | null, is_active: boolean, contact_email: string | null, withholding_tax_rate: string | null, is_cash_purchase: boolean } | null> | null };

export type VendorQueryVariables = Exact<{
  id: string | number;
}>;


export type VendorQuery = { vendor: { id: string, name: string, legal_name: string | null, tax_id: string | null, currency_code: string, payment_terms_days: number, country_code: string | null, city: string | null, address: string | null, contact_name: string | null, contact_email: string | null, contact_phone: string | null, withholding_tax_rate: string | null, bank_name: string | null, is_active: boolean } | null };

export type CreateVendorMutationVariables = Exact<{
  input: Types.VendorInput;
}>;


export type CreateVendorMutation = { createVendor: { id: string, name: string } };

export type UpdateVendorMutationVariables = Exact<{
  id: string | number;
  input: Types.VendorInput;
}>;


export type UpdateVendorMutation = { updateVendor: { id: string, name: string } };

export type PurchaseOrdersQueryVariables = Exact<{
  status?: string | null | undefined;
  vendorId?: string | number | null | undefined;
  projectId?: string | number | null | undefined;
  productId?: string | number | null | undefined;
  myPOsOnly?: boolean | null | undefined;
}>;


export type PurchaseOrdersQuery = { purchaseOrders: Array<{ id: string, po_number: string, vendor_name: string | null, vendor_id: string | null, status: string, priority: string, total_amount: string, viewerCanSeeTotals: boolean | null, currency_code: string, created_at: string, analytic_account_id: string | null, expected_delivery_date: string | null, assigned_to_email: string | null, invoice_count: number, project_id: string | null, projectCode: string | null, projectName: string | null, requisitionNumber: string | null, branch_id: string | null, branch_name: string | null, itemSearchText: string | null } | null> | null };

export type PurchaseOrderQueryVariables = Exact<{
  id: string | number;
}>;


export type PurchaseOrderQuery = { purchaseOrder: { id: string, po_number: string, status: string, requisition_id: string | null, currency_code: string, total_amount: string, subtotal: string | null, tax_amount: string | null, vendor_id: string | null, vendor_name: string | null, analytic_account_id: string | null, analytic_account_name: string | null, expected_delivery_date: string | null, notes: string | null, created_by_email: string | null, created_at: string, fx_rate: string | null, pdf_path: string | null, assigned_to_email: string | null, assigned_receiver_name: string | null, branch_id: string | null, branch_name: string | null, purpose: string | null, delivery_destination: string | null, linkedProjectId: string | null, funding_source: string | null, funding_advance_id: string | null, funding_advance_number: string | null, funding_employee_name: string | null, lines: Array<{ id: string, product_id: string | null, product_name: string | null, sku: string | null, description: string | null, qty: string, unit_price: string, total: string, uom: string | null, qty_received: string | null, qty_from_stock: string | null, account_id: string | null, account_code: string | null, account_name: string | null, cost_center_id: string | null, cost_center_name: string | null, advance_settlement_id: string | null }> | null, receipts: Array<{ id: string, status: string, receipt_date: string | null, location_id: string | null, location_name: string | null, notes: string | null, received_by_email: string | null, received_by_name: string | null, received_from_name: string | null, location_notes: string | null, created_at: string | null, lines: Array<{ id: string | null, po_line_id: string, description: string | null, qty_received: string, actual_unit_price: string | null }>, photos: Array<{ id: string, fileId: string, label: string | null, category: string, originalFilename: string, downloadUrl: string | null, createdAt: string }> }> | null, approval_log: Array<{ id: string, action: string, user_email: string | null, notes: string | null, created_at: string }> | null } | null };

export type MyApprovalQueueQueryVariables = Exact<{ [key: string]: never; }>;


export type MyApprovalQueueQuery = { myApprovalQueue: Array<{ id: string, po_number: string, vendor_name: string | null, status: string, total_amount: string, currency_code: string, created_at: string, submitted_at: string | null, assigned_to_email: string | null }> };

export type CreatePurchaseOrderMutationVariables = Exact<{
  input: Types.PoInput;
}>;


export type CreatePurchaseOrderMutation = { createPurchaseOrder: { id: string, po_number: string, status: string, assigned_receiver_id: string | null, assigned_receiver_name: string | null } };

export type UpdatePurchaseOrderMutationVariables = Exact<{
  id: string | number;
  input: Types.PoInput;
}>;


export type UpdatePurchaseOrderMutation = { updatePurchaseOrder: { id: string, status: string } };

export type RecordReceiptMutationVariables = Exact<{
  poId: string | number;
  input: Types.ReceiptInput;
}>;


export type RecordReceiptMutation = { recordReceipt: { id: string, status: string, receipt_date: string | null, received_by_name: string | null, received_from_name: string | null, location_notes: string | null } };

export type ConfirmReceiptMutationVariables = Exact<{
  id: string | number;
}>;


export type ConfirmReceiptMutation = { confirmReceipt: { id: string, status: string } };

export type CancelReceiptMutationVariables = Exact<{
  id: string | number;
}>;


export type CancelReceiptMutation = { cancelReceipt: { id: string, status: string } };

export type RecordDirectDeliveryMutationVariables = Exact<{
  poId: string | number;
  input: Types.DirectDeliveryInput;
}>;


export type RecordDirectDeliveryMutation = { recordDirectDelivery: { poId: string, status: string } };

export type PoReceiptFieldsFragment = { id: string, po_id: string | null, po_number: string | null, vendor_name: string | null, received_from_name: string | null, base_currency_code: string | null, receipt_number: string | null, receipt_date: string | null, location_name: string | null, notes: string | null, received_by_email: string | null, received_by_name: string | null, location_notes: string | null, created_at: string | null, is_invoiced: boolean | null, status: string, confirmed_at: string | null, lines: Array<{ po_line_id: string, description: string | null, product_name: string | null, product_name_ar: string | null, sku: string | null, uom: string | null, unit_price: string | null, currency_code: string | null, fx_rate_to_base: string | null, qty_received: string }>, photos: Array<{ id: string, fileId: string, label: string | null, category: string, originalFilename: string, downloadUrl: string | null, createdAt: string }> };

export type ReceivablePurchaseOrdersQueryVariables = Exact<{
  projectId?: string | number | null | undefined;
}>;


export type ReceivablePurchaseOrdersQuery = { receivablePurchaseOrders: Array<{ id: string, po_number: string, vendor_name: string | null, status: string, project_id: string | null, projectCode: string | null, projectName: string | null }> };

export type PoReceiptsQueryVariables = Exact<{ [key: string]: never; }>;


export type PoReceiptsQuery = { poReceipts: Array<{ id: string, po_id: string | null, po_number: string | null, vendor_name: string | null, received_from_name: string | null, base_currency_code: string | null, receipt_number: string | null, receipt_date: string | null, location_name: string | null, notes: string | null, received_by_email: string | null, received_by_name: string | null, location_notes: string | null, created_at: string | null, is_invoiced: boolean | null, status: string, confirmed_at: string | null, lines: Array<{ po_line_id: string, description: string | null, product_name: string | null, product_name_ar: string | null, sku: string | null, uom: string | null, unit_price: string | null, currency_code: string | null, fx_rate_to_base: string | null, qty_received: string }>, photos: Array<{ id: string, fileId: string, label: string | null, category: string, originalFilename: string, downloadUrl: string | null, createdAt: string }> }> };

export type PoReceiptQueryVariables = Exact<{
  id: string | number;
}>;


export type PoReceiptQuery = { poReceipt: { id: string, po_id: string | null, po_number: string | null, vendor_name: string | null, received_from_name: string | null, base_currency_code: string | null, receipt_number: string | null, receipt_date: string | null, location_name: string | null, notes: string | null, received_by_email: string | null, received_by_name: string | null, location_notes: string | null, created_at: string | null, is_invoiced: boolean | null, status: string, confirmed_at: string | null, lines: Array<{ po_line_id: string, description: string | null, product_name: string | null, product_name_ar: string | null, sku: string | null, uom: string | null, unit_price: string | null, currency_code: string | null, fx_rate_to_base: string | null, qty_received: string }>, photos: Array<{ id: string, fileId: string, label: string | null, category: string, originalFilename: string, downloadUrl: string | null, createdAt: string }> } | null };

export type RequestUploadUrlMutationVariables = Exact<{
  filename: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
}>;


export type RequestUploadUrlMutation = { requestUploadUrl: { fileId: string, uploadUrl: string, fileKey: string, expiresInSeconds: number } };

export type ConfirmUploadMutationVariables = Exact<{
  fileId: string | number;
}>;


export type ConfirmUploadMutation = { confirmUpload: { id: string, originalFilename: string, status: string } };

export type AttachReceiptPhotoMutationVariables = Exact<{
  receiptId: string | number;
  fileId: string | number;
  label?: string | null | undefined;
}>;


export type AttachReceiptPhotoMutation = { attachReceiptPhoto: { id: string, fileId: string, label: string | null, category: string, originalFilename: string, createdAt: string } };

export type MyPoQueueQueryVariables = Exact<{ [key: string]: never; }>;


export type MyPoQueueQuery = { myPOQueue: Array<{ id: string, po_number: string, status: string, currency_code: string, total_amount: string, created_at: string, updated_at: string, organizer_id: string | null, project_id: string | null, vendor_id: string | null, vendor_name: string | null }> | null };

export type PurchaseOrderLifecycleQueryVariables = Exact<{
  id: string | number;
}>;


export type PurchaseOrderLifecycleQuery = { purchaseOrder: { id: string, po_number: string, status: string, priority: string, requisition_id: string | null, requisitionNumber: string | null, viewerRestricted: boolean | null, currency_code: string, base_currency_code: string | null, total_amount: string, subtotal: string | null, vendor_id: string | null, vendor_name: string | null, analytic_account_id: string | null, project_id: string | null, organizer_id: string | null, assigned_approver_id: string | null, store_keeper_id: string | null, store_pricing_id: string | null, procurement_officer_id: string | null, procurement_2nd_id: string | null, assigned_receiver_id: string | null, assigned_receiver_name: string | null, purpose: string | null, delivery_destination: string | null, linkedProjectId: string | null, linkedMoId: string | null, projectCode: string | null, projectName: string | null, branch_id: string | null, branch_name: string | null, company_name: string | null, funding_source: string | null, funding_decided: boolean | null, funding_advance_id: string | null, funding_advance_number: string | null, funding_employee_name: string | null, assigned_buyer_user_id: string | null, assigned_buyer_name: string | null, buyerNames: Array<string> | null, callerIsBuyer: boolean | null, callerHasStorePricingPosition: boolean | null, callerHasMarketPricingPosition: boolean | null, callerHasStoreKeeperPosition: boolean | null, callerIsFinanceTeam: boolean | null, expected_delivery_date: string | null, notes: string | null, created_by_email: string | null, created_at: string, updated_at: string, machineryPhotoAlert: boolean, currencyTotals: Array<{ currency_code: string, subtotal: string, line_count: number }>, lines: Array<{ id: string, product_id: string | null, product_name: string | null, product_name_ar: string | null, description: string | null, qty: string, uom: string | null, qty_received: string | null, actual_unit_price: string | null, store_price: string | null, store_price_currency: string | null, market_price: string | null, market_price_currency: string | null, fx_rate_to_base: number | null, requested_currency_code: string | null, verified_price: string | null, verified_price_currency: string | null, in_stock: boolean | null, qty_from_stock: string | null, source_location_id: string | null, source_location_name: string | null, source_company_id: string | null, source_company_name: string | null, source_average_cost: number | null, unit_price: string, initial_unit_price: string | null, total: string, audit_status: string | null, audit_note: string | null, audit_flagged_by_email: string | null, audit_flagged_at: string | null, flag_reason: string | null, flagged_at: string | null, flagged_by_name: string | null, flagged_from_status: string | null, flag_addressed_at: string | null, flag_resolved_at: string | null, flag_resolved_by_name: string | null, account_id: string | null, account_code: string | null, account_name: string | null, cost_center_id: string | null, cost_center_name: string | null, advance_settlement_id: string | null, is_bought: boolean | null }> | null, receipts: Array<{ id: string, receipt_number: string | null, status: string, receipt_date: string | null, location_id: string | null, location_name: string | null, received_by_email: string | null, received_by_name: string | null, received_from_name: string | null, location_notes: string | null, notes: string | null, created_at: string | null, lines: Array<{ id: string | null, po_line_id: string, description: string | null, qty_received: string, actual_unit_price: string | null }>, photos: Array<{ id: string, fileId: string, label: string | null, category: string, originalFilename: string, downloadUrl: string | null, createdAt: string }> }> | null, approval_log: Array<{ id: string, action: string, user_email: string | null, notes: string | null, created_at: string }> | null, edit_requests: Array<{ id: string, po_id: string | null, status: string, changes: string, request_notes: string | null, requested_by_email: string | null, reviewed_by_email: string | null, review_notes: string | null, reviewed_at: string | null, created_at: string }> | null } | null };

export type SubmitPoEditRequestMutationVariables = Exact<{
  id: string | number;
  changes: string;
  notes?: string | null | undefined;
}>;


export type SubmitPoEditRequestMutation = { submitPOEditRequest: { id: string, status: string, created_at: string, requested_by_email: string | null } };

export type ApprovePoEditRequestMutationVariables = Exact<{
  id: string | number;
  requestId: string | number;
  reviewNotes?: string | null | undefined;
}>;


export type ApprovePoEditRequestMutation = { approvePOEditRequest: { id: string, status: string, reviewed_at: string | null, reviewed_by_email: string | null, review_notes: string | null } };

export type RejectPoEditRequestMutationVariables = Exact<{
  id: string | number;
  requestId: string | number;
  reviewNotes: string;
}>;


export type RejectPoEditRequestMutation = { rejectPOEditRequest: { id: string, status: string, reviewed_at: string | null, reviewed_by_email: string | null, review_notes: string | null } };

export type AdminCorrectPoMutationVariables = Exact<{
  id: string | number;
  changes: string;
  reason: string;
}>;


export type AdminCorrectPoMutation = { adminCorrectPO: { id: string } };

export type PoStockAvailabilityQueryVariables = Exact<{
  poId: string | number;
}>;


export type PoStockAvailabilityQuery = { poStockAvailability: Array<{ lineId: string, productId: string | null, productName: string | null, description: string | null, qtyRequired: number, qtyOnHand: number, qtyAvailable: number, isAvailable: boolean, byLocation: Array<{ companyId: string, companyName: string, locationId: string, locationName: string, qtyOnHand: number, qtyAvailable: number, averageCost: number | null }> }> };

export type SubmitPoToInventoryCheckMutationVariables = Exact<{
  id: string | number;
  notes?: string | null | undefined;
}>;


export type SubmitPoToInventoryCheckMutation = { submitPOToInventoryCheck: { id: string, status: string } };

export type ConfirmPoInventoryCheckMutationVariables = Exact<{
  id: string | number;
  lineStockQtys: Array<Types.StockConfirmLineInput> | Types.StockConfirmLineInput;
  notes?: string | null | undefined;
}>;


export type ConfirmPoInventoryCheckMutation = { confirmPOInventoryCheck: { id: string, status: string } };

export type ApproveStockIssuanceMutationVariables = Exact<{
  id: string | number;
  notes?: string | null | undefined;
}>;


export type ApproveStockIssuanceMutation = { approveStockIssuance: { id: string, status: string } };

export type MOmissingComponentsQueryVariables = Exact<{
  moId: string | number;
}>;


export type MOmissingComponentsQuery = { moMissingComponents: Array<{ bomLineId: string, componentProductId: string, productName: string | null, uom: string | null, qtyRequired: number, qtyOnHand: number, qtyAvailable: number, qtyShortfall: number, hasSufficientStock: boolean }> };

export type SubmitPoStorePricingMutationVariables = Exact<{
  id: string | number;
  linePrices?: Array<Types.LinePriceInput> | Types.LinePriceInput | null | undefined;
}>;


export type SubmitPoStorePricingMutation = { submitPOStorePricing: { id: string, status: string } };

export type SubmitPoMarketPricingMutationVariables = Exact<{
  id: string | number;
  vendorId?: string | number | null | undefined;
  linePrices?: Array<Types.MarketPriceInput> | Types.MarketPriceInput | null | undefined;
}>;


export type SubmitPoMarketPricingMutation = { submitPOMarketPricing: { id: string, status: string } };

export type SubmitPoPriceVerificationMutationVariables = Exact<{
  id: string | number;
  verificationNotes?: string | null | undefined;
  lineAdjustments?: Array<Types.PriceAdjustmentInput | null | undefined> | Types.PriceAdjustmentInput | null | undefined;
}>;


export type SubmitPoPriceVerificationMutation = { submitPOPriceVerification: { id: string, status: string } };

export type RejectPoToMarketPricingMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectPoToMarketPricingMutation = { rejectPOToMarketPricing: { id: string, status: string } };

export type RejectPoVerificationToMarketPricingMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectPoVerificationToMarketPricingMutation = { rejectPOVerificationToMarketPricing: { id: string, status: string } };

export type RejectPoVerificationToStorePricingMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectPoVerificationToStorePricingMutation = { rejectPOVerificationToStorePricing: { id: string, status: string } };

export type ResolveLineFlagMutationVariables = Exact<{
  lineId: string | number;
}>;


export type ResolveLineFlagMutation = { resolveLineFlag: boolean };

export type ApprovePoMutationVariables = Exact<{
  id: string | number;
}>;


export type ApprovePoMutation = { approvePO: { id: string, status: string } };

export type RejectPoMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectPoMutation = { rejectPO: { id: string, status: string } };

export type ReopenPoMutationVariables = Exact<{
  id: string | number;
}>;


export type ReopenPoMutation = { reopenPO: { id: string, status: string } };

export type CancelPoMutationVariables = Exact<{
  id: string | number;
  reason?: string | null | undefined;
}>;


export type CancelPoMutation = { cancelPO: { id: string, status: string } };

export type SendPoToAuditMutationVariables = Exact<{
  id: string | number;
}>;


export type SendPoToAuditMutation = { sendPOToAudit: { id: string, status: string } };

export type PassPoAuditMutationVariables = Exact<{
  id: string | number;
}>;


export type PassPoAuditMutation = { passPOAudit: { id: string, status: string } };

export type FailPoAuditMutationVariables = Exact<{
  id: string | number;
  notes?: string | null | undefined;
}>;


export type FailPoAuditMutation = { failPOAudit: { id: string, status: string } };

export type SetPoLineAuditStatusMutationVariables = Exact<{
  poId: string | number;
  lineId: string | number;
  auditStatus: string;
  auditNote?: string | null | undefined;
}>;


export type SetPoLineAuditStatusMutation = { setPOLineAuditStatus: { id: string, audit_status: string | null, audit_note: string | null } };

export type SetPoLineAccountingMutationVariables = Exact<{
  poId: string | number;
  lineId: string | number;
  glAccountId?: string | number | null | undefined;
  costCenterId?: string | number | null | undefined;
}>;


export type SetPoLineAccountingMutation = { setPOLineAccounting: { id: string, account_id: string | null, account_code: string | null, account_name: string | null, cost_center_id: string | null, cost_center_name: string | null } };

export type MarkPoLineBoughtMutationVariables = Exact<{
  poId: string | number;
  lineId: string | number;
  bought: boolean;
}>;


export type MarkPoLineBoughtMutation = { markPOLineBought: { id: string, is_bought: boolean | null, actual_unit_price: string | null } };

export type FinishBuyingPoMutationVariables = Exact<{
  poId: string | number;
}>;


export type FinishBuyingPoMutation = { finishBuyingPO: { id: string, status: string } };

export type SetPoFundingMutationVariables = Exact<{
  id: string | number;
  fundingSource: string;
  fundingAdvanceId?: string | number | null | undefined;
}>;


export type SetPoFundingMutation = { setPOFunding: { id: string, funding_source: string | null, funding_decided: boolean | null, funding_advance_id: string | null, funding_advance_number: string | null, funding_employee_name: string | null } };

export type CompletePoMutationVariables = Exact<{
  id: string | number;
  receiptNotes?: string | null | undefined;
}>;


export type CompletePoMutation = { completePO: { id: string, status: string } };

export type DeletePoMutationVariables = Exact<{
  id: string | number;
  reason?: string | null | undefined;
}>;


export type DeletePoMutation = { deletePO: { id: string, status: string } };

export type AdminSetPoStatusMutationVariables = Exact<{
  id: string | number;
  status: string;
}>;


export type AdminSetPoStatusMutation = { adminSetPOStatus: { id: string, status: string } };

export type GetPoPositionsQueryVariables = Exact<{
  projectId?: string | number | null | undefined;
  departmentId?: string | number | null | undefined;
  branchId?: string | number | null | undefined;
}>;


export type GetPoPositionsQuery = { poPositions: Array<{ id: string, employeeId: string, employeeName: string, position: string, projectId: string | null, projectName: string | null, departmentId: string | null, departmentName: string | null, branchId: string | null, branchName: string | null, isActive: boolean, createdAt: string }> };

export type AssignPoPositionMutationVariables = Exact<{
  input: Types.PoPositionInput;
}>;


export type AssignPoPositionMutation = { assignPOPosition: { id: string, employeeName: string, position: string, branchId: string | null, branchName: string | null } };

export type RemovePoPositionMutationVariables = Exact<{
  id: string | number;
}>;


export type RemovePoPositionMutation = { removePOPosition: boolean };

export type SetPoPriorityMutationVariables = Exact<{
  id: string | number;
  priority: string;
}>;


export type SetPoPriorityMutation = { setPOPriority: { id: string, priority: string } };

export type SetPoReceiverMutationVariables = Exact<{
  id: string | number;
  employeeId?: string | number | null | undefined;
}>;


export type SetPoReceiverMutation = { setPOReceiver: { id: string, assigned_receiver_id: string | null, assigned_receiver_name: string | null } };

export type SetPoVendorMutationVariables = Exact<{
  id: string | number;
  vendorId?: string | number | null | undefined;
}>;


export type SetPoVendorMutation = { setPOVendor: { id: string, vendor_id: string | null, vendor_name: string | null } };

export type SetPoLineActualPriceMutationVariables = Exact<{
  poId: string | number;
  lineId: string | number;
  actualUnitPrice?: number | null | undefined;
}>;


export type SetPoLineActualPriceMutation = { setPOLineActualPrice: { id: string, actual_unit_price: string | null } };

export type PoLineCommentsQueryVariables = Exact<{
  poId: string | number;
}>;


export type PoLineCommentsQuery = { poLineComments: Array<{ id: string, po_line_id: string, comment: string, created_by_name: string, created_at: string, flag: string | null, resolved: boolean, resolved_by: string | null, resolved_at: string | null, resolved_by_email: string | null }> };

export type AddPoLineCommentMutationVariables = Exact<{
  poId: string | number;
  lineId: string | number;
  comment: string;
  flag?: string | null | undefined;
}>;


export type AddPoLineCommentMutation = { addPOLineComment: { id: string, po_line_id: string, comment: string, created_by_name: string, created_at: string, flag: string | null, resolved: boolean } };

export type ResolvePoLineCommentMutationVariables = Exact<{
  poId: string | number;
  commentId: string | number;
}>;


export type ResolvePoLineCommentMutation = { resolvePOLineComment: { id: string, resolved: boolean, resolved_at: string | null } };

export type ProjectFieldsFragment = { id: string, code: string, name: string, description: string | null, projectType: string, status: string, rfqNumber: string | null, contractName: string | null, projectLocation: string | null, projectValue: number | null, projectValueCurrency: string | null, clientName: string | null, clientContact: string | null, managerId: string | null, managerName: string | null, plannedStartDate: string | null, plannedEndDate: string | null, budgetAmount: number | null, budgetCurrency: string | null, holdReason: string | null, cancelReason: string | null, receivingDate: string | null, submissionDate: string | null, submissionTime: string | null, siteVisitDate: string | null, siteVisitTime: string | null, questionDate: string | null, questionTime: string | null, submittedAt: string | null, approvedAt: string | null, completedAt: string | null, cancelledAt: string | null, overallCompletionPct: number | null, teamCount: number | null, openPoCount: number | null, stagesCompleted: number | null, stagesTotal: number | null, currentStageName: string | null, analyticAccountId: string | null, analyticAccountName: string | null, allowedActions: Array<string> | null, lifecyclePhase: string | null, clientDocCount: number | null, rfqLineCount: number | null, openOverdueRfiCount: number | null, openSafetyIncidentCount: number | null, overdueCorrectiveActionCount: number | null, isRfq: boolean, rfqEstimatedCost: number | null, rfqOutcome: string | null, rfqOutcomeReason: string | null, costSummary: unknown, stages: unknown, team: unknown, statusHistory: unknown, activityLog: unknown, recentPos: unknown, createdAt: string, updatedAt: string | null };

export type ProjectsQueryVariables = Exact<{
  status?: Array<string | null | undefined> | string | null | undefined;
  projectType?: string | null | undefined;
  search?: string | null | undefined;
  projectManagerId?: string | number | null | undefined;
  page?: number | null | undefined;
  limit?: number | null | undefined;
  includeAll?: boolean | null | undefined;
  myProjectsOnly?: boolean | null | undefined;
}>;


export type ProjectsQuery = { projects: { data: Array<{ id: string, code: string, name: string, projectType: string, status: string, isRfq: boolean, rfqNumber: string | null, contractName: string | null, clientName: string | null, projectValue: number | null, budgetAmount: number | null, budgetCurrency: string | null, plannedStartDate: string | null, plannedEndDate: string | null, overallCompletionPct: number | null, teamCount: number | null, openPoCount: number | null, allowedActions: Array<string> | null, analyticAccountId: string | null, analyticAccountName: string | null, costSummary: unknown, createdAt: string }>, pagination: { page: number, limit: number, total: number, totalPages: number } } };

export type ProjectQueryVariables = Exact<{
  id: string | number;
}>;


export type ProjectQuery = { project: { id: string, code: string, name: string, description: string | null, projectType: string, status: string, rfqNumber: string | null, contractName: string | null, projectLocation: string | null, projectValue: number | null, projectValueCurrency: string | null, clientName: string | null, clientContact: string | null, managerId: string | null, managerName: string | null, plannedStartDate: string | null, plannedEndDate: string | null, budgetAmount: number | null, budgetCurrency: string | null, holdReason: string | null, cancelReason: string | null, receivingDate: string | null, submissionDate: string | null, submissionTime: string | null, siteVisitDate: string | null, siteVisitTime: string | null, questionDate: string | null, questionTime: string | null, submittedAt: string | null, approvedAt: string | null, completedAt: string | null, cancelledAt: string | null, overallCompletionPct: number | null, teamCount: number | null, openPoCount: number | null, stagesCompleted: number | null, stagesTotal: number | null, currentStageName: string | null, analyticAccountId: string | null, analyticAccountName: string | null, allowedActions: Array<string> | null, lifecyclePhase: string | null, clientDocCount: number | null, rfqLineCount: number | null, openOverdueRfiCount: number | null, openSafetyIncidentCount: number | null, overdueCorrectiveActionCount: number | null, isRfq: boolean, rfqEstimatedCost: number | null, rfqOutcome: string | null, rfqOutcomeReason: string | null, costSummary: unknown, stages: unknown, team: unknown, statusHistory: unknown, activityLog: unknown, recentPos: unknown, createdAt: string, updatedAt: string | null } | null };

export type LifecycleConfigQueryVariables = Exact<{ [key: string]: never; }>;


export type LifecycleConfigQuery = { lifecycleConfig: { bidSimpleModeEnabled: boolean, hideRiskRegister: boolean, phases: Array<{ key: string, label: string, sequence: number, optional: boolean }>, modules: Array<{ moduleKey: string, minPhaseKey: string, label: string | null, sequence: number }> } };

export type UpdateLifecyclePhaseMutationVariables = Exact<{
  key: string;
  label?: string | null | undefined;
  sequence?: number | null | undefined;
  optional?: boolean | null | undefined;
}>;


export type UpdateLifecyclePhaseMutation = { updateLifecyclePhase: { key: string, label: string, sequence: number, optional: boolean } };

export type UpdateLifecycleModuleMutationVariables = Exact<{
  moduleKey: string;
  label?: string | null | undefined;
  minPhaseKey?: string | null | undefined;
}>;


export type UpdateLifecycleModuleMutation = { updateLifecycleModule: { moduleKey: string, minPhaseKey: string, label: string | null, sequence: number } };

export type UpdateBidSimpleModeMutationVariables = Exact<{
  enabled: boolean;
}>;


export type UpdateBidSimpleModeMutation = { updateBidSimpleMode: { bidSimpleModeEnabled: boolean, phases: Array<{ key: string, label: string, sequence: number, optional: boolean }>, modules: Array<{ moduleKey: string, minPhaseKey: string, label: string | null, sequence: number }> } };

export type UpdateHideRiskRegisterMutationVariables = Exact<{
  hidden: boolean;
}>;


export type UpdateHideRiskRegisterMutation = { updateHideRiskRegister: { hideRiskRegister: boolean, phases: Array<{ key: string, label: string, sequence: number, optional: boolean }>, modules: Array<{ moduleKey: string, minPhaseKey: string, label: string | null, sequence: number }> } };

export type ProjectCompletionBlockersQueryVariables = Exact<{
  id: string | number;
}>;


export type ProjectCompletionBlockersQuery = { projectCompletionBlockers: { canComplete: boolean, blockers: Array<string> } };

export type CreateProjectMutationVariables = Exact<{
  input: Types.ProjectCreateInput;
}>;


export type CreateProjectMutation = { createProject: { id: string, code: string, name: string, status: string, allowedActions: Array<string> | null } };

export type CreateRfqMutationVariables = Exact<{
  input: Types.ProjectCreateInput;
}>;


export type CreateRfqMutation = { createRFQ: { id: string, code: string, name: string, status: string, isRfq: boolean, allowedActions: Array<string> | null } };

export type ApproveRfqMutationVariables = Exact<{
  id: string | number;
  notes?: string | null | undefined;
}>;


export type ApproveRfqMutation = { approveRFQ: { id: string, status: string, lifecyclePhase: string | null, isRfq: boolean, rfqOutcome: string | null, approvedAt: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type RejectRfqMutationVariables = Exact<{
  id: string | number;
  reason: string;
}>;


export type RejectRfqMutation = { rejectRFQ: { id: string, status: string, lifecyclePhase: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type SubmitToTeamMutationVariables = Exact<{
  id: string | number;
}>;


export type SubmitToTeamMutation = { submitToTeam: { id: string, status: string, lifecyclePhase: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type UpsertRfqLinesMutationVariables = Exact<{
  projectId: string | number;
  lines: Array<Types.RfqLineInput> | Types.RfqLineInput;
}>;


export type UpsertRfqLinesMutation = { upsertRFQLines: Array<{ id: string, projectId: string, sequence: number, phaseLabel: string | null, description: string, quantity: number | null, unit: string | null, estimatedUnitCost: number | null, bidUnitPrice: number | null, notes: string | null, discipline: string | null, drawingRef: string | null, engineeringRef: string | null, specSection: string | null }> };

export type RfqLinesQueryVariables = Exact<{
  projectId: string | number;
}>;


export type RfqLinesQuery = { rfqLines: Array<{ id: string, projectId: string, sequence: number, phaseLabel: string | null, description: string, quantity: number | null, unit: string | null, estimatedUnitCost: number | null, bidUnitPrice: number | null, notes: string | null, discipline: string | null, drawingRef: string | null, engineeringRef: string | null, specSection: string | null }> };

export type RfqPhasesQueryVariables = Exact<{
  projectId: string | number;
}>;


export type RfqPhasesQuery = { rfqPhases: Array<{ id: string, projectId: string, phaseType: string, serviceType: string, status: string, notes: string | null, sequence: number, fileCount: number, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, description: string | null, createdAt: string, downloadUrl: string | null }> }> };

export type UpdateRfqPhaseMutationVariables = Exact<{
  id: string | number;
  status?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateRfqPhaseMutation = { updateRFQPhase: { id: string, phaseType: string, serviceType: string, status: string, notes: string | null, fileCount: number, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, description: string | null, createdAt: string, downloadUrl: string | null }> } };

export type UpdateProjectMutationVariables = Exact<{
  id: string | number;
  input: Types.ProjectUpdateInput;
}>;


export type UpdateProjectMutation = { updateProject: { id: string, code: string, name: string, status: string, projectValue: number | null, budgetAmount: number | null, overallCompletionPct: number | null, allowedActions: Array<string> | null } };

export type StartProjectMutationVariables = Exact<{
  id: string | number;
}>;


export type StartProjectMutation = { startProject: { id: string, status: string, lifecyclePhase: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type HoldProjectMutationVariables = Exact<{
  id: string | number;
  reason: string;
}>;


export type HoldProjectMutation = { holdProject: { id: string, status: string, holdReason: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type ResumeProjectMutationVariables = Exact<{
  id: string | number;
}>;


export type ResumeProjectMutation = { resumeProject: { id: string, status: string, allowedActions: Array<string> | null, statusHistory: unknown } };

export type SubmitProjectMutationVariables = Exact<{
  id: string | number;
}>;


export type SubmitProjectMutation = { submitProject: { id: string, status: string, lifecyclePhase: string | null, submittedAt: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type ApproveProjectMutationVariables = Exact<{
  id: string | number;
}>;


export type ApproveProjectMutation = { approveProject: { id: string, status: string, lifecyclePhase: string | null, approvedAt: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type RejectBackProjectMutationVariables = Exact<{
  id: string | number;
  reason: string;
}>;


export type RejectBackProjectMutation = { rejectBackProject: { id: string, status: string, lifecyclePhase: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type CompleteProjectMutationVariables = Exact<{
  id: string | number;
}>;


export type CompleteProjectMutation = { completeProject: { id: string, status: string, lifecyclePhase: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type CancelProjectMutationVariables = Exact<{
  id: string | number;
  reason: string;
}>;


export type CancelProjectMutation = { cancelProject: { id: string, status: string, cancelReason: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type CancelProjectAfterApprovalMutationVariables = Exact<{
  id: string | number;
  reason: string;
}>;


export type CancelProjectAfterApprovalMutation = { cancelProjectAfterApproval: { id: string, status: string, cancelReason: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type AdminSetProjectStatusMutationVariables = Exact<{
  id: string | number;
  status: string;
}>;


export type AdminSetProjectStatusMutation = { adminSetProjectStatus: { id: string, status: string, lifecyclePhase: string | null, allowedActions: Array<string> | null, statusHistory: unknown } };

export type AdminSetPhaseMutationVariables = Exact<{
  id: string | number;
  phase: string;
}>;


export type AdminSetPhaseMutation = { adminSetPhase: { id: string, status: string, lifecyclePhase: string | null, allowedActions: Array<string> | null } };

export type AdvancePhaseMutationVariables = Exact<{
  id: string | number;
  targetPhase: string;
}>;


export type AdvancePhaseMutation = { advancePhase: { id: string, status: string, lifecyclePhase: string | null, allowedActions: Array<string> | null } };

export type CreateProjectStageMutationVariables = Exact<{
  projectId: string | number;
  input: Types.StageInput;
}>;


export type CreateProjectStageMutation = { createProjectStage: { id: string, name: string, sequence: number, status: string, completionPct: number, plannedStartDate: string | null, plannedEndDate: string | null, notes: string | null } };

export type UpdateProjectStageMutationVariables = Exact<{
  projectId: string | number;
  stageId: string | number;
  input: Types.UpdateStageInput;
}>;


export type UpdateProjectStageMutation = { updateProjectStage: { id: string, name: string, sequence: number, status: string, completionPct: number, plannedStartDate: string | null, plannedEndDate: string | null, actualStartDate: string | null, actualEndDate: string | null, notes: string | null } };

export type AddProjectMemberMutationVariables = Exact<{
  projectId: string | number;
  input: Types.MemberInput;
}>;


export type AddProjectMemberMutation = { addProjectMember: { id: string, employeeId: string, name: string, role: string | null, allocatedHours: number | null, startDate: string | null, endDate: string | null, isActive: boolean } };

export type RemoveProjectMemberMutationVariables = Exact<{
  projectId: string | number;
  memberId: string | number;
}>;


export type RemoveProjectMemberMutation = { removeProjectMember: boolean };

export type ProjectContractsQueryVariables = Exact<{
  projectId?: string | number | null | undefined;
  status?: string | null | undefined;
}>;


export type ProjectContractsQuery = { projectContracts: Array<{ id: string, projectId: string, projectCode: string, projectName: string, contractNumber: string, contractName: string, clientName: string, contractValue: number, currencyCode: string, defaultBillingMethod: string, retentionPct: number, status: string, revision: number, totalInvoiced: number, totalPaid: number, outstanding: number, milestones: Array<{ id: string, name: string, sequence: number, billableAmount: number, currencyCode: string, status: string, reachedAt: string | null }>, invoices: Array<{ id: string, invoiceNumber: string, billingMethod: string, grossTotal: number, netPayable: number, status: string, invoiceDate: string, dueDate: string }>, revisions: Array<{ id: string, revision: number, contractValue: number, currencyCode: string, retentionPct: number, endDate: string | null, changeSummary: string, effectiveDate: string | null, createdByName: string | null, createdAt: string }> }> };

export type ReviseContractMutationVariables = Exact<{
  id: string | number;
  contractValue: number;
  retentionPct: number;
  endDate?: string | null | undefined;
  changeSummary: string;
  effectiveDate?: string | null | undefined;
}>;


export type ReviseContractMutation = { reviseContract: { id: string, revision: number, contractValue: number, retentionPct: number, revisions: Array<{ id: string, revision: number, contractValue: number, currencyCode: string, retentionPct: number, endDate: string | null, changeSummary: string, effectiveDate: string | null, createdByName: string | null, createdAt: string }> } };

export type ProjectContractQueryVariables = Exact<{
  id: string | number;
}>;


export type ProjectContractQuery = { projectContract: { id: string, contractNumber: string, contractName: string, clientName: string, contractValue: number, currencyCode: string, defaultBillingMethod: string, defaultMarginPct: number, retentionPct: number, status: string, totalInvoiced: number, totalPaid: number, outstanding: number, milestones: Array<{ id: string, name: string, sequence: number, billableAmount: number, currencyCode: string, status: string, reachedAt: string | null }>, invoices: Array<{ id: string, invoiceNumber: string, billingMethod: string, displayMode: string, grossTotal: number, retentionAmount: number, netPayable: number, status: string, invoiceDate: string, dueDate: string, lines: Array<{ id: string, lineNumber: number, description: string, sourceType: string, qty: number, unitCost: number, subtotal: number, marginPct: number, marginAmount: number, taxPct: number, taxAmount: number, lineTotal: number }>, payments: Array<{ id: string, paymentDate: string, amount: number, paymentReference: string | null, paymentMethod: string | null }> }> } | null };

export type ProjectInvoicesQueryVariables = Exact<{
  projectId?: string | number | null | undefined;
  contractId?: string | number | null | undefined;
  status?: string | null | undefined;
}>;


export type ProjectInvoicesQuery = { projectInvoices: Array<{ id: string, invoiceNumber: string, billingMethod: string, grossTotal: number, retentionAmount: number, netPayable: number, status: string, invoiceDate: string, dueDate: string, payments: Array<{ id: string, paymentDate: string, amount: number }> }> };

export type ProjectInvoiceQueryVariables = Exact<{
  id: string | number;
}>;


export type ProjectInvoiceQuery = { projectInvoice: { id: string, invoiceNumber: string, billingMethod: string, displayMode: string, grossTotal: number, retentionAmount: number, netPayable: number, whtApplies: boolean, whtScenario: string | null, whtRate: number, whtAmount: number, status: string, invoiceDate: string, dueDate: string, currencyCode: string, bankAccountId: string | null, paymentType: string, projectCode: string | null, projectName: string | null, contractNumber: string | null, clientName: string | null, retentionPct: number | null, companyName: string | null, companyLegalName: string | null, companyCountry: string | null, companyStampImage: string | null, companyLetterheadImage: string | null, companyAddress: string | null, companyPhone: string | null, companyEmail: string | null, companyBranchName: string | null, companyBranchAddress: string | null, companyBranchCity: string | null, companyBranchPhone: string | null, paymentTermsDays: number | null, verificationToken: string | null, lines: Array<{ id: string, lineNumber: number, description: string, sourceType: string, qty: number, unitCost: number, subtotal: number, marginPct: number, marginAmount: number, taxPct: number, taxAmount: number, lineTotal: number }>, payments: Array<{ id: string, paymentDate: string, amount: number, paymentReference: string | null, paymentMethod: string | null }> } | null };

export type CreateProjectContractMutationVariables = Exact<{
  projectId: string | number;
  input: Types.ProjectContractInput;
}>;


export type CreateProjectContractMutation = { createProjectContract: { id: string, contractNumber: string, contractName: string, status: string } };

export type UpdateProjectContractMutationVariables = Exact<{
  id: string | number;
  input: Types.ProjectContractInput;
}>;


export type UpdateProjectContractMutation = { updateProjectContract: { id: string, contractName: string, status: string } };

export type CreateProjectInvoiceMutationVariables = Exact<{
  contractId: string | number;
  input: Types.ProjectInvoiceInput;
}>;


export type CreateProjectInvoiceMutation = { createProjectInvoice: { id: string, invoiceNumber: string, grossTotal: number, netPayable: number, status: string } };

export type UpdateProjectInvoiceMutationVariables = Exact<{
  id: string | number;
  invoiceDate?: string | null | undefined;
  dueDate?: string | null | undefined;
  currencyCode?: string | null | undefined;
  lines?: Array<Types.InvoiceLineEditInput> | Types.InvoiceLineEditInput | null | undefined;
}>;


export type UpdateProjectInvoiceMutation = { updateProjectInvoice: { id: string, invoiceNumber: string, billingMethod: string, displayMode: string, grossTotal: number, retentionAmount: number, netPayable: number, whtApplies: boolean, whtScenario: string | null, whtRate: number, whtAmount: number, status: string, invoiceDate: string, dueDate: string, currencyCode: string, bankAccountId: string | null, paymentType: string, projectCode: string | null, projectName: string | null, contractNumber: string | null, clientName: string | null, retentionPct: number | null, companyName: string | null, companyLegalName: string | null, companyCountry: string | null, companyStampImage: string | null, companyLetterheadImage: string | null, companyAddress: string | null, companyPhone: string | null, companyEmail: string | null, companyBranchName: string | null, companyBranchAddress: string | null, companyBranchCity: string | null, companyBranchPhone: string | null, paymentTermsDays: number | null, verificationToken: string | null, lines: Array<{ id: string, lineNumber: number, description: string, sourceType: string, qty: number, unitCost: number, subtotal: number, marginPct: number, marginAmount: number, taxPct: number, taxAmount: number, lineTotal: number }>, payments: Array<{ id: string, paymentDate: string, amount: number, paymentReference: string | null, paymentMethod: string | null }> } };

export type VoidProjectInvoiceMutationVariables = Exact<{
  id: string | number;
  reason?: string | null | undefined;
}>;


export type VoidProjectInvoiceMutation = { voidProjectInvoice: { id: string, status: string } };

export type ReachMilestoneMutationVariables = Exact<{
  contractId: string | number;
  milestoneId: string | number;
}>;


export type ReachMilestoneMutation = { reachMilestone: { id: string, status: string, reachedAt: string | null } };

export type CreateContractMilestoneMutationVariables = Exact<{
  contractId: string | number;
  input: Types.MilestoneInput;
}>;


export type CreateContractMilestoneMutation = { createContractMilestone: { id: string, name: string, sequence: number, billableAmount: number, currencyCode: string, status: string, reachedAt: string | null } };

export type UpdateContractMilestoneMutationVariables = Exact<{
  id: string | number;
  input: Types.MilestoneInput;
}>;


export type UpdateContractMilestoneMutation = { updateContractMilestone: { id: string, name: string, sequence: number, billableAmount: number, currencyCode: string, status: string, reachedAt: string | null } };

export type DeleteContractMilestoneMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteContractMilestoneMutation = { deleteContractMilestone: boolean };

export type AddProjectTeamMemberMutationVariables = Exact<{
  projectId: string | number;
  employeeId: string | number;
  role: string;
}>;


export type AddProjectTeamMemberMutation = { addProjectTeamMember: { id: string, employee_id: string, employee_name: string, role: string } };

export type RemoveProjectTeamMemberMutationVariables = Exact<{
  projectId: string | number;
  memberId: string | number;
}>;


export type RemoveProjectTeamMemberMutation = { removeProjectTeamMember: boolean };

export type ClientDocumentFieldsFragment = { id: string, projectId: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, parentDocumentId: string | null, uploadedById: string | null, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, mimeType: string | null, sizeBytes: number | null, createdAt: string, revisions: Array<{ id: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, createdAt: string }> };

export type ClientDocumentsQueryVariables = Exact<{
  projectId: string | number;
  category?: string | null | undefined;
}>;


export type ClientDocumentsQuery = { clientDocuments: Array<{ id: string, projectId: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, parentDocumentId: string | null, uploadedById: string | null, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, mimeType: string | null, sizeBytes: number | null, createdAt: string, revisions: Array<{ id: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, createdAt: string }> }> };

export type UploadClientDocumentMutationVariables = Exact<{
  projectId: string | number;
  fileId: string | number;
  category: string;
  title: string;
  documentNumber?: string | null | undefined;
  revision?: string | null | undefined;
  description?: string | null | undefined;
  receivedFrom?: string | null | undefined;
  transmissionDate?: string | null | undefined;
}>;


export type UploadClientDocumentMutation = { uploadClientDocument: { id: string, projectId: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, parentDocumentId: string | null, uploadedById: string | null, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, mimeType: string | null, sizeBytes: number | null, createdAt: string, revisions: Array<{ id: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, createdAt: string }> } };

export type UploadClientDocumentRevisionMutationVariables = Exact<{
  parentDocumentId: string | number;
  fileId: string | number;
  revision: string;
  description?: string | null | undefined;
}>;


export type UploadClientDocumentRevisionMutation = { uploadClientDocumentRevision: { id: string, projectId: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, parentDocumentId: string | null, uploadedById: string | null, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, mimeType: string | null, sizeBytes: number | null, createdAt: string, revisions: Array<{ id: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, createdAt: string }> } };

export type UpdateClientDocumentMutationVariables = Exact<{
  id: string | number;
  title?: string | null | undefined;
  category?: string | null | undefined;
  documentNumber?: string | null | undefined;
  revision?: string | null | undefined;
  description?: string | null | undefined;
  receivedFrom?: string | null | undefined;
  transmissionDate?: string | null | undefined;
}>;


export type UpdateClientDocumentMutation = { updateClientDocument: { id: string, projectId: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, parentDocumentId: string | null, uploadedById: string | null, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, mimeType: string | null, sizeBytes: number | null, createdAt: string, revisions: Array<{ id: string, fileId: string | null, category: string, title: string, documentNumber: string | null, revision: string | null, description: string | null, receivedFrom: string | null, transmissionDate: string | null, status: string, uploadedByName: string | null, downloadUrl: string | null, previewUrl: string | null, filename: string | null, createdAt: string }> } };

export type UpdateClientDocumentStatusMutationVariables = Exact<{
  id: string | number;
  status: string;
}>;


export type UpdateClientDocumentStatusMutation = { updateClientDocumentStatus: { id: string, status: string } };

export type DeleteClientDocumentMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteClientDocumentMutation = { deleteClientDocument: boolean };

export type EngDocFieldsFragment = { id: string, projectId: string, refNumber: string, discipline: string, docType: string, seqNo: number, title: string, description: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, docGroupId: string, isCurrent: boolean, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, documentId: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, transmittalRef: string | null, submittedTo: string | null, dueDate: string | null, notes: string | null, createdAt: string }>, history: Array<{ id: string, refNumber: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, createdAt: string, notes: string | null }> }> };

export type EngineeringDocumentsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type EngineeringDocumentsQuery = { engineeringDocuments: Array<{ id: string, projectId: string, refNumber: string, discipline: string, docType: string, seqNo: number, title: string, description: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, docGroupId: string, isCurrent: boolean, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, documentId: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, transmittalRef: string | null, submittedTo: string | null, dueDate: string | null, notes: string | null, createdAt: string }>, history: Array<{ id: string, refNumber: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, createdAt: string, notes: string | null }> }> }> };

export type IfcDocumentsQueryVariables = Exact<{
  projectId: string | number;
  status?: Array<string | null | undefined> | string | null | undefined;
}>;


export type IfcDocumentsQuery = { engineeringDocuments: Array<{ id: string, projectId: string, refNumber: string, discipline: string, docType: string, seqNo: number, title: string, description: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, docGroupId: string, isCurrent: boolean, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, documentId: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, transmittalRef: string | null, submittedTo: string | null, dueDate: string | null, notes: string | null, createdAt: string }>, history: Array<{ id: string, refNumber: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, createdAt: string, notes: string | null }> }> }> };

export type CreateEngineeringDocMutationVariables = Exact<{
  projectId: string | number;
  discipline: string;
  docType: string;
  title: string;
  fileId?: string | number | null | undefined;
  revision?: string | null | undefined;
  description?: string | null | undefined;
  scale?: string | null | undefined;
  paperSize?: string | null | undefined;
  issueDate?: string | null | undefined;
  notes?: string | null | undefined;
  originatorName?: string | null | undefined;
  checkerName?: string | null | undefined;
  approverName?: string | null | undefined;
  purposeOfIssue?: string | null | undefined;
}>;


export type CreateEngineeringDocMutation = { createEngineeringDoc: { id: string, projectId: string, refNumber: string, discipline: string, docType: string, seqNo: number, title: string, description: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, docGroupId: string, isCurrent: boolean, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, documentId: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, transmittalRef: string | null, submittedTo: string | null, dueDate: string | null, notes: string | null, createdAt: string }>, history: Array<{ id: string, refNumber: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, createdAt: string, notes: string | null }> }> } };

export type ReviseEngineeringDocMutationVariables = Exact<{
  id: string | number;
  fileId?: string | number | null | undefined;
  revision: string;
  notes?: string | null | undefined;
  issueDate?: string | null | undefined;
  originatorName?: string | null | undefined;
  checkerName?: string | null | undefined;
  approverName?: string | null | undefined;
  purposeOfIssue?: string | null | undefined;
}>;


export type ReviseEngineeringDocMutation = { reviseEngineeringDoc: { id: string, projectId: string, refNumber: string, discipline: string, docType: string, seqNo: number, title: string, description: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, docGroupId: string, isCurrent: boolean, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, documentId: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, transmittalRef: string | null, submittedTo: string | null, dueDate: string | null, notes: string | null, createdAt: string }>, history: Array<{ id: string, refNumber: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, createdAt: string, notes: string | null }> }> } };

export type UpdateEngineeringDocStatusMutationVariables = Exact<{
  id: string | number;
  status: string;
  purposeOfIssue?: string | null | undefined;
  workflowNote?: string | null | undefined;
}>;


export type UpdateEngineeringDocStatusMutation = { updateEngineeringDocStatus: { id: string, status: string, purposeOfIssue: string | null } };

export type PerformDocWorkflowActionMutationVariables = Exact<{
  id: string | number;
  action: string;
  submittedTo?: string | null | undefined;
  dueDate?: string | null | undefined;
  notes?: string | null | undefined;
  transmittalRef?: string | null | undefined;
  issueType?: string | null | undefined;
  responseCode?: string | null | undefined;
  comments?: Array<Types.EngClientCommentInput> | Types.EngClientCommentInput | null | undefined;
}>;


export type PerformDocWorkflowActionMutation = { performDocWorkflowAction: { id: string, projectId: string, refNumber: string, discipline: string, docType: string, seqNo: number, title: string, description: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, docGroupId: string, isCurrent: boolean, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, documentId: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, transmittalRef: string | null, submittedTo: string | null, dueDate: string | null, notes: string | null, createdAt: string }>, history: Array<{ id: string, refNumber: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, createdAt: string, notes: string | null }> }> } };

export type ClientCommentFieldsFragment = { id: string, documentId: string, commentNo: number, description: string, clauseRef: string | null, category: string, status: string, resolution: string | null, raisedBy: string | null, closedByName: string | null, closedAt: string | null, createdAt: string };

export type EngClientCommentsQueryVariables = Exact<{
  documentId: string | number;
}>;


export type EngClientCommentsQuery = { engClientComments: Array<{ id: string, documentId: string, commentNo: number, description: string, clauseRef: string | null, category: string, status: string, resolution: string | null, raisedBy: string | null, closedByName: string | null, closedAt: string | null, createdAt: string }> };

export type AddEngClientCommentMutationVariables = Exact<{
  documentId: string | number;
  description: string;
  clauseRef?: string | null | undefined;
  category?: string | null | undefined;
  raisedBy?: string | null | undefined;
}>;


export type AddEngClientCommentMutation = { addEngClientComment: { id: string, documentId: string, commentNo: number, description: string, clauseRef: string | null, category: string, status: string, resolution: string | null, raisedBy: string | null, closedByName: string | null, closedAt: string | null, createdAt: string } };

export type UpdateEngClientCommentMutationVariables = Exact<{
  id: string | number;
  description?: string | null | undefined;
  clauseRef?: string | null | undefined;
  category?: string | null | undefined;
  raisedBy?: string | null | undefined;
}>;


export type UpdateEngClientCommentMutation = { updateEngClientComment: { id: string, documentId: string, commentNo: number, description: string, clauseRef: string | null, category: string, status: string, resolution: string | null, raisedBy: string | null, closedByName: string | null, closedAt: string | null, createdAt: string } };

export type CloseEngClientCommentMutationVariables = Exact<{
  id: string | number;
  resolution: string;
}>;


export type CloseEngClientCommentMutation = { closeEngClientComment: { id: string, documentId: string, commentNo: number, description: string, clauseRef: string | null, category: string, status: string, resolution: string | null, raisedBy: string | null, closedByName: string | null, closedAt: string | null, createdAt: string } };

export type ReopenEngClientCommentMutationVariables = Exact<{
  id: string | number;
}>;


export type ReopenEngClientCommentMutation = { reopenEngClientComment: { id: string, documentId: string, commentNo: number, description: string, clauseRef: string | null, category: string, status: string, resolution: string | null, raisedBy: string | null, closedByName: string | null, closedAt: string | null, createdAt: string } };

export type DeleteEngClientCommentMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteEngClientCommentMutation = { deleteEngClientComment: boolean };

export type UpdateEngineeringDocMetaMutationVariables = Exact<{
  id: string | number;
  originatorName?: string | null | undefined;
  checkerName?: string | null | undefined;
  approverName?: string | null | undefined;
  purposeOfIssue?: string | null | undefined;
}>;


export type UpdateEngineeringDocMetaMutation = { updateEngineeringDocMeta: { id: string, projectId: string, refNumber: string, discipline: string, docType: string, seqNo: number, title: string, description: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, docGroupId: string, isCurrent: boolean, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, documentId: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, transmittalRef: string | null, submittedTo: string | null, dueDate: string | null, notes: string | null, createdAt: string }>, history: Array<{ id: string, refNumber: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, originatorName: string | null, checkerName: string | null, approverName: string | null, purposeOfIssue: string | null, commentCount: number, openCommentCount: number, clientCommentCount: number, openClientCommentCount: number, activities: Array<{ id: string, fromStatus: string | null, toStatus: string, action: string, actorName: string | null, responseCode: string | null, createdAt: string, notes: string | null }> }> } };

export type DeleteEngineeringDocMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteEngineeringDocMutation = { deleteEngineeringDoc: boolean };

export type DocCommentFieldsFragment = { id: string, documentId: string, revision: string, reviewerId: string, reviewerName: string | null, commentNumber: number, locationRef: string | null, commentText: string, category: string, responseText: string | null, responseById: string | null, responseName: string | null, responseDate: string | null, resolution: string | null, createdAt: string };

export type DocCommentsQueryVariables = Exact<{
  documentId: string | number;
}>;


export type DocCommentsQuery = { docComments: Array<{ id: string, documentId: string, revision: string, reviewerId: string, reviewerName: string | null, commentNumber: number, locationRef: string | null, commentText: string, category: string, responseText: string | null, responseById: string | null, responseName: string | null, responseDate: string | null, resolution: string | null, createdAt: string }> };

export type AddDocCommentMutationVariables = Exact<{
  documentId: string | number;
  revision: string;
  locationRef?: string | null | undefined;
  commentText: string;
  category: string;
}>;


export type AddDocCommentMutation = { addDocComment: { id: string, documentId: string, revision: string, reviewerId: string, reviewerName: string | null, commentNumber: number, locationRef: string | null, commentText: string, category: string, responseText: string | null, responseById: string | null, responseName: string | null, responseDate: string | null, resolution: string | null, createdAt: string } };

export type RespondToCommentMutationVariables = Exact<{
  id: string | number;
  responseText: string;
  resolution: string;
}>;


export type RespondToCommentMutation = { respondToComment: { id: string, documentId: string, revision: string, reviewerId: string, reviewerName: string | null, commentNumber: number, locationRef: string | null, commentText: string, category: string, responseText: string | null, responseById: string | null, responseName: string | null, responseDate: string | null, resolution: string | null, createdAt: string } };

export type DeleteDocCommentMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteDocCommentMutation = { deleteDocComment: boolean };

export type DdmFieldsFragment = { id: string, projectId: string, companyName: string, contactName: string | null, contactEmail: string | null, discipline: string | null, docType: string | null, statusTrigger: string, copies: number, format: string, autoTransmit: boolean, notes: string | null, createdAt: string };

export type DocDistributionMatrixQueryVariables = Exact<{
  projectId: string | number;
}>;


export type DocDistributionMatrixQuery = { docDistributionMatrix: Array<{ id: string, projectId: string, companyName: string, contactName: string | null, contactEmail: string | null, discipline: string | null, docType: string | null, statusTrigger: string, copies: number, format: string, autoTransmit: boolean, notes: string | null, createdAt: string }> };

export type UpsertDistributionEntryMutationVariables = Exact<{
  id?: string | number | null | undefined;
  projectId: string | number;
  companyName: string;
  contactName?: string | null | undefined;
  contactEmail?: string | null | undefined;
  discipline?: string | null | undefined;
  docType?: string | null | undefined;
  statusTrigger: string;
  copies?: number | null | undefined;
  format?: string | null | undefined;
  autoTransmit?: boolean | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpsertDistributionEntryMutation = { upsertDistributionEntry: { id: string, projectId: string, companyName: string, contactName: string | null, contactEmail: string | null, discipline: string | null, docType: string | null, statusTrigger: string, copies: number, format: string, autoTransmit: boolean, notes: string | null, createdAt: string } };

export type DeleteDistributionEntryMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteDistributionEntryMutation = { deleteDistributionEntry: boolean };

export type EngineeringRevisionsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type EngineeringRevisionsQuery = { engineeringRevisions: Array<{ id: string, projectId: string, revisionCode: string, status: string, notes: string | null, issuedByName: string | null, issuedAt: string, itemCount: number, snapshotData: unknown, createdAt: string }> };

export type IssueEngineeringRevisionMutationVariables = Exact<{
  projectId: string | number;
  revisionCode: string;
  notes?: string | null | undefined;
}>;


export type IssueEngineeringRevisionMutation = { issueEngineeringRevision: { id: string, projectId: string, revisionCode: string, status: string, notes: string | null, issuedByName: string | null, issuedAt: string, itemCount: number, snapshotData: unknown, createdAt: string } };

export type ProjectDrawingFieldsFragment = { id: string, projectId: string, drawingNumber: string, title: string, discipline: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, parentDrawingId: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, revisions: Array<{ id: string, drawingNumber: string, title: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string }> };

export type ProjectDrawingsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectDrawingsQuery = { projectDrawings: Array<{ id: string, projectId: string, drawingNumber: string, title: string, discipline: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, parentDrawingId: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, revisions: Array<{ id: string, drawingNumber: string, title: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string }> }> };

export type CreateProjectDrawingMutationVariables = Exact<{
  projectId: string | number;
  fileId: string | number;
  drawingNumber: string;
  title: string;
  discipline?: string | null | undefined;
  scale?: string | null | undefined;
  paperSize?: string | null | undefined;
  revision?: string | null | undefined;
  status?: string | null | undefined;
  issueDate?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type CreateProjectDrawingMutation = { createProjectDrawing: { id: string, projectId: string, drawingNumber: string, title: string, discipline: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, parentDrawingId: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, revisions: Array<{ id: string, drawingNumber: string, title: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string }> } };

export type ReviseProjectDrawingMutationVariables = Exact<{
  parentDrawingId: string | number;
  fileId: string | number;
  revision: string;
  notes?: string | null | undefined;
}>;


export type ReviseProjectDrawingMutation = { reviseProjectDrawing: { id: string, projectId: string, drawingNumber: string, title: string, discipline: string | null, scale: string | null, paperSize: string | null, revision: string | null, status: string, issueDate: string | null, notes: string | null, fileId: string | null, parentDrawingId: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string, revisions: Array<{ id: string, drawingNumber: string, title: string, revision: string | null, status: string, issueDate: string | null, notes: string | null, uploadedByName: string | null, downloadUrl: string | null, filename: string | null, createdAt: string }> } };

export type UpdateProjectDrawingStatusMutationVariables = Exact<{
  id: string | number;
  status: string;
}>;


export type UpdateProjectDrawingStatusMutation = { updateProjectDrawingStatus: { id: string, status: string } };

export type DeleteProjectDrawingMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteProjectDrawingMutation = { deleteProjectDrawing: boolean };

export type BidDeliverableFieldsFragment = { id: string, projectId: string, name: string, deliverableType: string, discipline: string | null, status: string, assignedTo: string | null, dueDate: string | null, notes: string | null, sequence: number, createdByName: string | null, fileCount: number, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, description: string | null, createdAt: string, downloadUrl: string | null }> };

export type BidDeliverablesQueryVariables = Exact<{
  projectId: string | number;
}>;


export type BidDeliverablesQuery = { bidDeliverables: Array<{ id: string, projectId: string, name: string, deliverableType: string, discipline: string | null, status: string, assignedTo: string | null, dueDate: string | null, notes: string | null, sequence: number, createdByName: string | null, fileCount: number, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, description: string | null, createdAt: string, downloadUrl: string | null }> }> };

export type CreateBidDeliverableMutationVariables = Exact<{
  projectId: string | number;
  name: string;
  deliverableType: string;
  discipline?: string | null | undefined;
  dueDate?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type CreateBidDeliverableMutation = { createBidDeliverable: { id: string, projectId: string, name: string, deliverableType: string, discipline: string | null, status: string, assignedTo: string | null, dueDate: string | null, notes: string | null, sequence: number, createdByName: string | null, fileCount: number, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, description: string | null, createdAt: string, downloadUrl: string | null }> } };

export type UpdateBidDeliverableMutationVariables = Exact<{
  id: string | number;
  name?: string | null | undefined;
  status?: string | null | undefined;
  assignedTo?: string | null | undefined;
  dueDate?: string | null | undefined;
  notes?: string | null | undefined;
  discipline?: string | null | undefined;
}>;


export type UpdateBidDeliverableMutation = { updateBidDeliverable: { id: string, projectId: string, name: string, deliverableType: string, discipline: string | null, status: string, assignedTo: string | null, dueDate: string | null, notes: string | null, sequence: number, createdByName: string | null, fileCount: number, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, description: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteBidDeliverableMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteBidDeliverableMutation = { deleteBidDeliverable: boolean };

export type UploadBidDeliverableFileMutationVariables = Exact<{
  deliverableId: string | number;
  fileId: string | number;
  title?: string | null | undefined;
  description?: string | null | undefined;
}>;


export type UploadBidDeliverableFileMutation = { uploadBidDeliverableFile: { id: string, projectId: string, name: string, deliverableType: string, discipline: string | null, status: string, assignedTo: string | null, dueDate: string | null, notes: string | null, sequence: number, createdByName: string | null, fileCount: number, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, description: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteBidDeliverableFileMutationVariables = Exact<{
  attachmentId: string | number;
  deliverableId: string | number;
}>;


export type DeleteBidDeliverableFileMutation = { deleteBidDeliverableFile: boolean };

export type BidPackageFilesQueryVariables = Exact<{
  projectId: string | number;
}>;


export type BidPackageFilesQuery = { bidPackageFiles: Array<{ id: string, fileId: string, bidType: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, description: string | null, createdAt: string, downloadUrl: string | null }> };

export type UploadBidPackageFileMutationVariables = Exact<{
  projectId: string | number;
  bidType: string;
  fileId: string | number;
  title?: string | null | undefined;
  description?: string | null | undefined;
}>;


export type UploadBidPackageFileMutation = { uploadBidPackageFile: Array<{ id: string, fileId: string, bidType: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, description: string | null, createdAt: string, downloadUrl: string | null }> };

export type DeleteBidPackageFileMutationVariables = Exact<{
  attachmentId: string | number;
  projectId: string | number;
}>;


export type DeleteBidPackageFileMutation = { deleteBidPackageFile: boolean };

export type BidCostItemsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type BidCostItemsQuery = { bidCostItems: Array<{ id: string, projectId: string, costType: string, description: string, quantity: number | null, unit: string | null, unitCost: number | null, totalCost: number | null, currencyCode: string, supplierRef: string | null, notes: string | null, sequence: number, createdAt: string }> };

export type UpsertBidCostItemsMutationVariables = Exact<{
  projectId: string | number;
  items: Array<Types.BidCostItemInput> | Types.BidCostItemInput;
}>;


export type UpsertBidCostItemsMutation = { upsertBidCostItems: Array<{ id: string, projectId: string, costType: string, description: string, quantity: number | null, unit: string | null, unitCost: number | null, totalCost: number | null, currencyCode: string, supplierRef: string | null, notes: string | null, sequence: number, createdAt: string }> };

export type BidSupplierQuotationsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type BidSupplierQuotationsQuery = { bidSupplierQuotations: Array<{ id: string, projectId: string, supplierName: string, itemDescription: string, amount: number | null, currencyCode: string, validityDate: string | null, fileId: string | null, downloadUrl: string | null, filename: string | null, notes: string | null, status: string, createdAt: string }> };

export type CreateBidSupplierQuotationMutationVariables = Exact<{
  projectId: string | number;
  supplierName: string;
  itemDescription: string;
  amount?: number | null | undefined;
  currencyCode?: string | null | undefined;
  validityDate?: string | null | undefined;
  fileId?: string | number | null | undefined;
  notes?: string | null | undefined;
}>;


export type CreateBidSupplierQuotationMutation = { createBidSupplierQuotation: { id: string, projectId: string, supplierName: string, itemDescription: string, amount: number | null, currencyCode: string, validityDate: string | null, fileId: string | null, downloadUrl: string | null, filename: string | null, notes: string | null, status: string, createdAt: string } };

export type UpdateBidSupplierQuotationMutationVariables = Exact<{
  id: string | number;
  status?: string | null | undefined;
  supplierName?: string | null | undefined;
  itemDescription?: string | null | undefined;
  amount?: number | null | undefined;
  validityDate?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateBidSupplierQuotationMutation = { updateBidSupplierQuotation: { id: string, projectId: string, supplierName: string, itemDescription: string, amount: number | null, currencyCode: string, validityDate: string | null, notes: string | null, status: string, createdAt: string } };

export type DeleteBidSupplierQuotationMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteBidSupplierQuotationMutation = { deleteBidSupplierQuotation: boolean };

export type BidCommercialSummaryFieldsFragment = { id: string | null, projectId: string, overheadPct: number, marginPct: number, discountPct: number, contingencyPct: number, currencyCode: string, directCostTotal: number, overheadAmount: number, contingencyAmount: number, marginAmount: number, discountAmount: number, bidPrice: number, approvalStatus: string, submittedByName: string | null, submittedAt: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, notes: string | null, updatedAt: string | null, revision: number, revisions: Array<{ id: string, revision: number, directCostTotal: number, overheadPct: number, overheadAmount: number, contingencyPct: number, contingencyAmount: number, marginPct: number, marginAmount: number, discountPct: number, discountAmount: number, bidPrice: number, currencyCode: string, changeSummary: string, createdByName: string | null, createdAt: string }> };

export type BidCommercialSummaryQueryVariables = Exact<{
  projectId: string | number;
}>;


export type BidCommercialSummaryQuery = { bidCommercialSummary: { id: string | null, projectId: string, overheadPct: number, marginPct: number, discountPct: number, contingencyPct: number, currencyCode: string, directCostTotal: number, overheadAmount: number, contingencyAmount: number, marginAmount: number, discountAmount: number, bidPrice: number, approvalStatus: string, submittedByName: string | null, submittedAt: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, notes: string | null, updatedAt: string | null, revision: number, revisions: Array<{ id: string, revision: number, directCostTotal: number, overheadPct: number, overheadAmount: number, contingencyPct: number, contingencyAmount: number, marginPct: number, marginAmount: number, discountPct: number, discountAmount: number, bidPrice: number, currencyCode: string, changeSummary: string, createdByName: string | null, createdAt: string }> } | null };

export type UpdateBidCommercialSummaryMutationVariables = Exact<{
  projectId: string | number;
  overheadPct?: number | null | undefined;
  marginPct?: number | null | undefined;
  discountPct?: number | null | undefined;
  contingencyPct?: number | null | undefined;
  currencyCode?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateBidCommercialSummaryMutation = { updateBidCommercialSummary: { id: string | null, projectId: string, overheadPct: number, marginPct: number, discountPct: number, contingencyPct: number, currencyCode: string, directCostTotal: number, overheadAmount: number, contingencyAmount: number, marginAmount: number, discountAmount: number, bidPrice: number, approvalStatus: string, submittedByName: string | null, submittedAt: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, notes: string | null, updatedAt: string | null, revision: number, revisions: Array<{ id: string, revision: number, directCostTotal: number, overheadPct: number, overheadAmount: number, contingencyPct: number, contingencyAmount: number, marginPct: number, marginAmount: number, discountPct: number, discountAmount: number, bidPrice: number, currencyCode: string, changeSummary: string, createdByName: string | null, createdAt: string }> } };

export type SubmitBidForApprovalMutationVariables = Exact<{
  projectId: string | number;
}>;


export type SubmitBidForApprovalMutation = { submitBidForApproval: { id: string | null, projectId: string, overheadPct: number, marginPct: number, discountPct: number, contingencyPct: number, currencyCode: string, directCostTotal: number, overheadAmount: number, contingencyAmount: number, marginAmount: number, discountAmount: number, bidPrice: number, approvalStatus: string, submittedByName: string | null, submittedAt: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, notes: string | null, updatedAt: string | null, revision: number, revisions: Array<{ id: string, revision: number, directCostTotal: number, overheadPct: number, overheadAmount: number, contingencyPct: number, contingencyAmount: number, marginPct: number, marginAmount: number, discountPct: number, discountAmount: number, bidPrice: number, currencyCode: string, changeSummary: string, createdByName: string | null, createdAt: string }> } };

export type ApproveBidMutationVariables = Exact<{
  projectId: string | number;
}>;


export type ApproveBidMutation = { approveBid: { id: string | null, projectId: string, overheadPct: number, marginPct: number, discountPct: number, contingencyPct: number, currencyCode: string, directCostTotal: number, overheadAmount: number, contingencyAmount: number, marginAmount: number, discountAmount: number, bidPrice: number, approvalStatus: string, submittedByName: string | null, submittedAt: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, notes: string | null, updatedAt: string | null, revision: number, revisions: Array<{ id: string, revision: number, directCostTotal: number, overheadPct: number, overheadAmount: number, contingencyPct: number, contingencyAmount: number, marginPct: number, marginAmount: number, discountPct: number, discountAmount: number, bidPrice: number, currencyCode: string, changeSummary: string, createdByName: string | null, createdAt: string }> } };

export type RejectBidMutationVariables = Exact<{
  projectId: string | number;
  reason: string;
}>;


export type RejectBidMutation = { rejectBid: { id: string | null, projectId: string, overheadPct: number, marginPct: number, discountPct: number, contingencyPct: number, currencyCode: string, directCostTotal: number, overheadAmount: number, contingencyAmount: number, marginAmount: number, discountAmount: number, bidPrice: number, approvalStatus: string, submittedByName: string | null, submittedAt: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, notes: string | null, updatedAt: string | null, revision: number, revisions: Array<{ id: string, revision: number, directCostTotal: number, overheadPct: number, overheadAmount: number, contingencyPct: number, contingencyAmount: number, marginPct: number, marginAmount: number, discountPct: number, discountAmount: number, bidPrice: number, currencyCode: string, changeSummary: string, createdByName: string | null, createdAt: string }> } };

export type ReviseBidMutationVariables = Exact<{
  projectId: string | number;
  changeSummary: string;
}>;


export type ReviseBidMutation = { reviseBid: { id: string | null, projectId: string, overheadPct: number, marginPct: number, discountPct: number, contingencyPct: number, currencyCode: string, directCostTotal: number, overheadAmount: number, contingencyAmount: number, marginAmount: number, discountAmount: number, bidPrice: number, approvalStatus: string, submittedByName: string | null, submittedAt: string | null, approvedByName: string | null, approvedAt: string | null, rejectionReason: string | null, notes: string | null, updatedAt: string | null, revision: number, revisions: Array<{ id: string, revision: number, directCostTotal: number, overheadPct: number, overheadAmount: number, contingencyPct: number, contingencyAmount: number, marginPct: number, marginAmount: number, discountPct: number, discountAmount: number, bidPrice: number, currencyCode: string, changeSummary: string, createdByName: string | null, createdAt: string }> } };

export type ExecFileFieldsFragment = { id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null };

export type RfiFieldsFragment = { id: string, projectId: string, rfiNumber: string, subject: string, description: string | null, drawingRef: string | null, specRef: string | null, raisedByName: string | null, raisedDate: string, requiredDate: string | null, respondedDate: string | null, status: string, response: string | null, respondedByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> };

export type ProjectRfIsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectRfIsQuery = { projectRFIs: Array<{ id: string, projectId: string, rfiNumber: string, subject: string, description: string | null, drawingRef: string | null, specRef: string | null, raisedByName: string | null, raisedDate: string, requiredDate: string | null, respondedDate: string | null, status: string, response: string | null, respondedByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> }> };

export type CreateProjectRfiMutationVariables = Exact<{
  projectId: string | number;
  rfiNumber: string;
  subject: string;
  description?: string | null | undefined;
  drawingRef?: string | null | undefined;
  specRef?: string | null | undefined;
  requiredDate?: string | null | undefined;
}>;


export type CreateProjectRfiMutation = { createProjectRFI: { id: string, projectId: string, rfiNumber: string, subject: string, description: string | null, drawingRef: string | null, specRef: string | null, raisedByName: string | null, raisedDate: string, requiredDate: string | null, respondedDate: string | null, status: string, response: string | null, respondedByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type UpdateProjectRfiMutationVariables = Exact<{
  id: string | number;
  subject?: string | null | undefined;
  description?: string | null | undefined;
  drawingRef?: string | null | undefined;
  specRef?: string | null | undefined;
  requiredDate?: string | null | undefined;
  status?: string | null | undefined;
}>;


export type UpdateProjectRfiMutation = { updateProjectRFI: { id: string, projectId: string, rfiNumber: string, subject: string, description: string | null, drawingRef: string | null, specRef: string | null, raisedByName: string | null, raisedDate: string, requiredDate: string | null, respondedDate: string | null, status: string, response: string | null, respondedByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type RespondToRfiMutationVariables = Exact<{
  id: string | number;
  response: string;
  respondedDate?: string | null | undefined;
}>;


export type RespondToRfiMutation = { respondToRFI: { id: string, projectId: string, rfiNumber: string, subject: string, description: string | null, drawingRef: string | null, specRef: string | null, raisedByName: string | null, raisedDate: string, requiredDate: string | null, respondedDate: string | null, status: string, response: string | null, respondedByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteProjectRfiMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteProjectRfiMutation = { deleteProjectRFI: boolean };

export type UploadRfiFileMutationVariables = Exact<{
  rfiId: string | number;
  fileId: string | number;
  title?: string | null | undefined;
}>;


export type UploadRfiFileMutation = { uploadRFIFile: { id: string, projectId: string, rfiNumber: string, subject: string, description: string | null, drawingRef: string | null, specRef: string | null, raisedByName: string | null, raisedDate: string, requiredDate: string | null, respondedDate: string | null, status: string, response: string | null, respondedByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteRfiFileMutationVariables = Exact<{
  attachmentId: string | number;
  rfiId: string | number;
}>;


export type DeleteRfiFileMutation = { deleteRFIFile: boolean };

export type SiFieldsFragment = { id: string, projectId: string, siNumber: string, subject: string, description: string | null, issuedBy: string | null, issuedDate: string, acknowledgedByName: string | null, acknowledgedDate: string | null, potentialVo: boolean, voRef: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> };

export type ProjectSiteInstructionsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectSiteInstructionsQuery = { projectSiteInstructions: Array<{ id: string, projectId: string, siNumber: string, subject: string, description: string | null, issuedBy: string | null, issuedDate: string, acknowledgedByName: string | null, acknowledgedDate: string | null, potentialVo: boolean, voRef: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> }> };

export type CreateSiteInstructionMutationVariables = Exact<{
  projectId: string | number;
  siNumber: string;
  subject: string;
  description?: string | null | undefined;
  issuedBy?: string | null | undefined;
  issuedDate?: string | null | undefined;
  potentialVo?: boolean | null | undefined;
}>;


export type CreateSiteInstructionMutation = { createSiteInstruction: { id: string, projectId: string, siNumber: string, subject: string, description: string | null, issuedBy: string | null, issuedDate: string, acknowledgedByName: string | null, acknowledgedDate: string | null, potentialVo: boolean, voRef: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type UpdateSiteInstructionMutationVariables = Exact<{
  id: string | number;
  subject?: string | null | undefined;
  description?: string | null | undefined;
  issuedBy?: string | null | undefined;
  acknowledgedByName?: string | null | undefined;
  acknowledgedDate?: string | null | undefined;
  status?: string | null | undefined;
  potentialVo?: boolean | null | undefined;
  voRef?: string | null | undefined;
}>;


export type UpdateSiteInstructionMutation = { updateSiteInstruction: { id: string, projectId: string, siNumber: string, subject: string, description: string | null, issuedBy: string | null, issuedDate: string, acknowledgedByName: string | null, acknowledgedDate: string | null, potentialVo: boolean, voRef: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteSiteInstructionMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteSiteInstructionMutation = { deleteSiteInstruction: boolean };

export type UploadSiFileMutationVariables = Exact<{
  siId: string | number;
  fileId: string | number;
  title?: string | null | undefined;
}>;


export type UploadSiFileMutation = { uploadSIFile: { id: string, projectId: string, siNumber: string, subject: string, description: string | null, issuedBy: string | null, issuedDate: string, acknowledgedByName: string | null, acknowledgedDate: string | null, potentialVo: boolean, voRef: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteSiFileMutationVariables = Exact<{
  attachmentId: string | number;
  siId: string | number;
}>;


export type DeleteSiFileMutation = { deleteSIFile: boolean };

export type ItpFieldsFragment = { id: string, projectId: string, title: string, workPackage: string | null, discipline: string | null, revision: string, status: string, createdByName: string | null, createdAt: string, updatedAt: string, items: Array<{ id: string, itpId: string, sequence: number, activity: string, inspectionType: string, contractorRole: string | null, clientRole: string | null, referenceDoc: string | null, acceptanceCriteria: string | null, result: string | null, inspectorName: string | null, inspectionDate: string | null, remarks: string | null }> };

export type ProjectItPsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectItPsQuery = { projectITPs: Array<{ id: string, projectId: string, title: string, workPackage: string | null, discipline: string | null, revision: string, status: string, createdByName: string | null, createdAt: string, updatedAt: string, items: Array<{ id: string, itpId: string, sequence: number, activity: string, inspectionType: string, contractorRole: string | null, clientRole: string | null, referenceDoc: string | null, acceptanceCriteria: string | null, result: string | null, inspectorName: string | null, inspectionDate: string | null, remarks: string | null }> }> };

export type CreateProjectItpMutationVariables = Exact<{
  projectId: string | number;
  title: string;
  workPackage?: string | null | undefined;
  discipline?: string | null | undefined;
}>;


export type CreateProjectItpMutation = { createProjectITP: { id: string, projectId: string, title: string, workPackage: string | null, discipline: string | null, revision: string, status: string, createdByName: string | null, createdAt: string, updatedAt: string, items: Array<{ id: string, itpId: string, sequence: number, activity: string, inspectionType: string, contractorRole: string | null, clientRole: string | null, referenceDoc: string | null, acceptanceCriteria: string | null, result: string | null, inspectorName: string | null, inspectionDate: string | null, remarks: string | null }> } };

export type UpdateProjectItpMutationVariables = Exact<{
  id: string | number;
  title?: string | null | undefined;
  workPackage?: string | null | undefined;
  discipline?: string | null | undefined;
  revision?: string | null | undefined;
  status?: string | null | undefined;
}>;


export type UpdateProjectItpMutation = { updateProjectITP: { id: string, projectId: string, title: string, workPackage: string | null, discipline: string | null, revision: string, status: string, createdByName: string | null, createdAt: string, updatedAt: string, items: Array<{ id: string, itpId: string, sequence: number, activity: string, inspectionType: string, contractorRole: string | null, clientRole: string | null, referenceDoc: string | null, acceptanceCriteria: string | null, result: string | null, inspectorName: string | null, inspectionDate: string | null, remarks: string | null }> } };

export type DeleteProjectItpMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteProjectItpMutation = { deleteProjectITP: boolean };

export type UpsertItpItemsMutationVariables = Exact<{
  itpId: string | number;
  items: Array<Types.ItpItemInput> | Types.ItpItemInput;
}>;


export type UpsertItpItemsMutation = { upsertITPItems: { id: string, projectId: string, title: string, workPackage: string | null, discipline: string | null, revision: string, status: string, createdByName: string | null, createdAt: string, updatedAt: string, items: Array<{ id: string, itpId: string, sequence: number, activity: string, inspectionType: string, contractorRole: string | null, clientRole: string | null, referenceDoc: string | null, acceptanceCriteria: string | null, result: string | null, inspectorName: string | null, inspectionDate: string | null, remarks: string | null }> } };

export type RecordItpItemResultMutationVariables = Exact<{
  itemId: string | number;
  result: string;
  inspectorName?: string | null | undefined;
  inspectionDate?: string | null | undefined;
  remarks?: string | null | undefined;
}>;


export type RecordItpItemResultMutation = { recordITPItemResult: { id: string, itpId: string, sequence: number, activity: string, inspectionType: string, result: string | null, inspectorName: string | null, inspectionDate: string | null, remarks: string | null } };

export type IrFieldsFragment = { id: string, projectId: string, irNumber: string, title: string, itpId: string | null, workPackage: string | null, location: string | null, requestedDate: string, requestedByName: string | null, inspectorName: string | null, actualDate: string | null, status: string, result: string | null, remarks: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> };

export type ProjectInspectionRequestsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectInspectionRequestsQuery = { projectInspectionRequests: Array<{ id: string, projectId: string, irNumber: string, title: string, itpId: string | null, workPackage: string | null, location: string | null, requestedDate: string, requestedByName: string | null, inspectorName: string | null, actualDate: string | null, status: string, result: string | null, remarks: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> }> };

export type CreateInspectionRequestMutationVariables = Exact<{
  projectId: string | number;
  irNumber: string;
  title: string;
  itpId?: string | number | null | undefined;
  workPackage?: string | null | undefined;
  location?: string | null | undefined;
  requestedDate: string;
}>;


export type CreateInspectionRequestMutation = { createInspectionRequest: { id: string, projectId: string, irNumber: string, title: string, itpId: string | null, workPackage: string | null, location: string | null, requestedDate: string, requestedByName: string | null, inspectorName: string | null, actualDate: string | null, status: string, result: string | null, remarks: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type UpdateInspectionRequestMutationVariables = Exact<{
  id: string | number;
  title?: string | null | undefined;
  location?: string | null | undefined;
  requestedDate?: string | null | undefined;
  inspectorName?: string | null | undefined;
  actualDate?: string | null | undefined;
  status?: string | null | undefined;
  result?: string | null | undefined;
  remarks?: string | null | undefined;
}>;


export type UpdateInspectionRequestMutation = { updateInspectionRequest: { id: string, projectId: string, irNumber: string, title: string, itpId: string | null, workPackage: string | null, location: string | null, requestedDate: string, requestedByName: string | null, inspectorName: string | null, actualDate: string | null, status: string, result: string | null, remarks: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteInspectionRequestMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteInspectionRequestMutation = { deleteInspectionRequest: boolean };

export type UploadIrFileMutationVariables = Exact<{
  irId: string | number;
  fileId: string | number;
  title?: string | null | undefined;
}>;


export type UploadIrFileMutation = { uploadIRFile: { id: string, projectId: string, irNumber: string, title: string, itpId: string | null, workPackage: string | null, location: string | null, requestedDate: string, requestedByName: string | null, inspectorName: string | null, actualDate: string | null, status: string, result: string | null, remarks: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteIrFileMutationVariables = Exact<{
  attachmentId: string | number;
  irId: string | number;
}>;


export type DeleteIrFileMutation = { deleteIRFile: boolean };

export type NcrFieldsFragment = { id: string, projectId: string, ncrNumber: string, title: string, description: string, workPackage: string | null, location: string | null, raisedByName: string | null, raisedDate: string, severity: string, rootCause: string | null, correctiveAction: string | null, preventiveAction: string | null, dueDate: string | null, closedDate: string | null, closedByName: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> };

export type ProjectNcRsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectNcRsQuery = { projectNCRs: Array<{ id: string, projectId: string, ncrNumber: string, title: string, description: string, workPackage: string | null, location: string | null, raisedByName: string | null, raisedDate: string, severity: string, rootCause: string | null, correctiveAction: string | null, preventiveAction: string | null, dueDate: string | null, closedDate: string | null, closedByName: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> }> };

export type CreateProjectNcrMutationVariables = Exact<{
  projectId: string | number;
  ncrNumber: string;
  title: string;
  description: string;
  workPackage?: string | null | undefined;
  location?: string | null | undefined;
  severity?: string | null | undefined;
  dueDate?: string | null | undefined;
}>;


export type CreateProjectNcrMutation = { createProjectNCR: { id: string, projectId: string, ncrNumber: string, title: string, description: string, workPackage: string | null, location: string | null, raisedByName: string | null, raisedDate: string, severity: string, rootCause: string | null, correctiveAction: string | null, preventiveAction: string | null, dueDate: string | null, closedDate: string | null, closedByName: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type UpdateProjectNcrMutationVariables = Exact<{
  id: string | number;
  title?: string | null | undefined;
  description?: string | null | undefined;
  workPackage?: string | null | undefined;
  location?: string | null | undefined;
  severity?: string | null | undefined;
  rootCause?: string | null | undefined;
  correctiveAction?: string | null | undefined;
  preventiveAction?: string | null | undefined;
  dueDate?: string | null | undefined;
  status?: string | null | undefined;
  closedDate?: string | null | undefined;
  closedByName?: string | null | undefined;
}>;


export type UpdateProjectNcrMutation = { updateProjectNCR: { id: string, projectId: string, ncrNumber: string, title: string, description: string, workPackage: string | null, location: string | null, raisedByName: string | null, raisedDate: string, severity: string, rootCause: string | null, correctiveAction: string | null, preventiveAction: string | null, dueDate: string | null, closedDate: string | null, closedByName: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteProjectNcrMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteProjectNcrMutation = { deleteProjectNCR: boolean };

export type UploadNcrFileMutationVariables = Exact<{
  ncrId: string | number;
  fileId: string | number;
  title?: string | null | undefined;
}>;


export type UploadNcrFileMutation = { uploadNCRFile: { id: string, projectId: string, ncrNumber: string, title: string, description: string, workPackage: string | null, location: string | null, raisedByName: string | null, raisedDate: string, severity: string, rootCause: string | null, correctiveAction: string | null, preventiveAction: string | null, dueDate: string | null, closedDate: string | null, closedByName: string | null, status: string, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteNcrFileMutationVariables = Exact<{
  attachmentId: string | number;
  ncrId: string | number;
}>;


export type DeleteNcrFileMutation = { deleteNCRFile: boolean };

export type HseFieldsFragment = { id: string, projectId: string, recordType: string, title: string, recordDate: string, conductedBy: string | null, location: string | null, description: string | null, attendeeCount: number | null, attendeeNames: string | null, incidentType: string | null, severity: string | null, injuredPerson: string | null, rootCause: string | null, correctiveAction: string | null, correctiveDueDate: string | null, correctiveClosedDate: string | null, observationType: string | null, ptwType: string | null, ptwNumber: string | null, validFrom: string | null, validTo: string | null, approvedBy: string | null, ptwStatus: string | null, status: string, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> };

export type ProjectHseRecordsQueryVariables = Exact<{
  projectId: string | number;
  recordType?: string | null | undefined;
}>;


export type ProjectHseRecordsQuery = { projectHSERecords: Array<{ id: string, projectId: string, recordType: string, title: string, recordDate: string, conductedBy: string | null, location: string | null, description: string | null, attendeeCount: number | null, attendeeNames: string | null, incidentType: string | null, severity: string | null, injuredPerson: string | null, rootCause: string | null, correctiveAction: string | null, correctiveDueDate: string | null, correctiveClosedDate: string | null, observationType: string | null, ptwType: string | null, ptwNumber: string | null, validFrom: string | null, validTo: string | null, approvedBy: string | null, ptwStatus: string | null, status: string, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> }> };

export type CreateHseRecordMutationVariables = Exact<{
  projectId: string | number;
  recordType: string;
  title: string;
  recordDate: string;
  conductedBy?: string | null | undefined;
  location?: string | null | undefined;
  description?: string | null | undefined;
  attendeeCount?: number | null | undefined;
  attendeeNames?: string | null | undefined;
  incidentType?: string | null | undefined;
  severity?: string | null | undefined;
  injuredPerson?: string | null | undefined;
  observationType?: string | null | undefined;
  ptwType?: string | null | undefined;
  ptwNumber?: string | null | undefined;
  validFrom?: string | null | undefined;
  validTo?: string | null | undefined;
  approvedBy?: string | null | undefined;
}>;


export type CreateHseRecordMutation = { createHSERecord: { id: string, projectId: string, recordType: string, title: string, recordDate: string, conductedBy: string | null, location: string | null, description: string | null, attendeeCount: number | null, attendeeNames: string | null, incidentType: string | null, severity: string | null, injuredPerson: string | null, rootCause: string | null, correctiveAction: string | null, correctiveDueDate: string | null, correctiveClosedDate: string | null, observationType: string | null, ptwType: string | null, ptwNumber: string | null, validFrom: string | null, validTo: string | null, approvedBy: string | null, ptwStatus: string | null, status: string, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type UpdateHseRecordMutationVariables = Exact<{
  id: string | number;
  title?: string | null | undefined;
  recordDate?: string | null | undefined;
  conductedBy?: string | null | undefined;
  location?: string | null | undefined;
  description?: string | null | undefined;
  attendeeCount?: number | null | undefined;
  attendeeNames?: string | null | undefined;
  incidentType?: string | null | undefined;
  severity?: string | null | undefined;
  injuredPerson?: string | null | undefined;
  rootCause?: string | null | undefined;
  correctiveAction?: string | null | undefined;
  correctiveDueDate?: string | null | undefined;
  correctiveClosedDate?: string | null | undefined;
  observationType?: string | null | undefined;
  ptwType?: string | null | undefined;
  ptwNumber?: string | null | undefined;
  validFrom?: string | null | undefined;
  validTo?: string | null | undefined;
  approvedBy?: string | null | undefined;
  ptwStatus?: string | null | undefined;
  status?: string | null | undefined;
}>;


export type UpdateHseRecordMutation = { updateHSERecord: { id: string, projectId: string, recordType: string, title: string, recordDate: string, conductedBy: string | null, location: string | null, description: string | null, attendeeCount: number | null, attendeeNames: string | null, incidentType: string | null, severity: string | null, injuredPerson: string | null, rootCause: string | null, correctiveAction: string | null, correctiveDueDate: string | null, correctiveClosedDate: string | null, observationType: string | null, ptwType: string | null, ptwNumber: string | null, validFrom: string | null, validTo: string | null, approvedBy: string | null, ptwStatus: string | null, status: string, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteHseRecordMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteHseRecordMutation = { deleteHSERecord: boolean };

export type UploadHseFileMutationVariables = Exact<{
  hseId: string | number;
  fileId: string | number;
  title?: string | null | undefined;
}>;


export type UploadHseFileMutation = { uploadHSEFile: { id: string, projectId: string, recordType: string, title: string, recordDate: string, conductedBy: string | null, location: string | null, description: string | null, attendeeCount: number | null, attendeeNames: string | null, incidentType: string | null, severity: string | null, injuredPerson: string | null, rootCause: string | null, correctiveAction: string | null, correctiveDueDate: string | null, correctiveClosedDate: string | null, observationType: string | null, ptwType: string | null, ptwNumber: string | null, validFrom: string | null, validTo: string | null, approvedBy: string | null, ptwStatus: string | null, status: string, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteHseFileMutationVariables = Exact<{
  attachmentId: string | number;
  hseId: string | number;
}>;


export type DeleteHseFileMutation = { deleteHSEFile: boolean };

export type DailyReportMachineryFieldsFragment = { id: string, dailyReportId: string, projectId: string, poId: string, poNumber: string | null, equipmentDescription: string | null, workingHours: number | null, idleHours: number | null, breakdownHours: number | null, livePhotoFileId: string | null, livePhotoFilename: string | null, livePhotoDownloadUrl: string | null, compliant: boolean, createdByName: string | null, createdAt: string };

export type DailyReportFieldsFragment = { id: string, projectId: string, reportNumber: string, reportDate: string, preparedBy: string | null, reviewedBy: string | null, weatherConditions: string | null, temperature: string | null, scheduleStatus: string | null, costStatus: string | null, safetyStatus: string | null, qualityStatus: string | null, keyAccomplishments: string | null, majorConcerns: string | null, progressMetrics: unknown, safetyStats: unknown, safetyActivities: unknown, safetyRemarks: string | null, engineeringProgress: unknown, engineeringDeliverables: unknown, engineeringIssues: string | null, procurementItems: unknown, deliveriesReceived: unknown, procurementConcerns: string | null, constructionProgress: unknown, qcInspections: unknown, ncrStatus: unknown, qualityRemarks: string | null, manpower: unknown, equipmentUtilization: unknown, breakdownDetails: string | null, risksIssues: unknown, clientActions: unknown, lookaheadEngineering: string | null, lookaheadProcurement: string | null, lookaheadConstruction: string | null, lookaheadCommissioning: string | null, managementComments: string | null, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }>, machinery: Array<{ id: string, dailyReportId: string, projectId: string, poId: string, poNumber: string | null, equipmentDescription: string | null, workingHours: number | null, idleHours: number | null, breakdownHours: number | null, livePhotoFileId: string | null, livePhotoFilename: string | null, livePhotoDownloadUrl: string | null, compliant: boolean, createdByName: string | null, createdAt: string }> };

export type ProjectDailyReportsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectDailyReportsQuery = { projectDailyReports: Array<{ id: string, projectId: string, reportNumber: string, reportDate: string, preparedBy: string | null, reviewedBy: string | null, weatherConditions: string | null, temperature: string | null, scheduleStatus: string | null, costStatus: string | null, safetyStatus: string | null, qualityStatus: string | null, keyAccomplishments: string | null, majorConcerns: string | null, progressMetrics: unknown, safetyStats: unknown, safetyActivities: unknown, safetyRemarks: string | null, engineeringProgress: unknown, engineeringDeliverables: unknown, engineeringIssues: string | null, procurementItems: unknown, deliveriesReceived: unknown, procurementConcerns: string | null, constructionProgress: unknown, qcInspections: unknown, ncrStatus: unknown, qualityRemarks: string | null, manpower: unknown, equipmentUtilization: unknown, breakdownDetails: string | null, risksIssues: unknown, clientActions: unknown, lookaheadEngineering: string | null, lookaheadProcurement: string | null, lookaheadConstruction: string | null, lookaheadCommissioning: string | null, managementComments: string | null, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }>, machinery: Array<{ id: string, dailyReportId: string, projectId: string, poId: string, poNumber: string | null, equipmentDescription: string | null, workingHours: number | null, idleHours: number | null, breakdownHours: number | null, livePhotoFileId: string | null, livePhotoFilename: string | null, livePhotoDownloadUrl: string | null, compliant: boolean, createdByName: string | null, createdAt: string }> }> };

export type CreateDailyReportMutationVariables = Exact<{
  projectId: string | number;
  input: Types.DailyReportInput;
}>;


export type CreateDailyReportMutation = { createDailyReport: { id: string, projectId: string, reportNumber: string, reportDate: string, preparedBy: string | null, reviewedBy: string | null, weatherConditions: string | null, temperature: string | null, scheduleStatus: string | null, costStatus: string | null, safetyStatus: string | null, qualityStatus: string | null, keyAccomplishments: string | null, majorConcerns: string | null, progressMetrics: unknown, safetyStats: unknown, safetyActivities: unknown, safetyRemarks: string | null, engineeringProgress: unknown, engineeringDeliverables: unknown, engineeringIssues: string | null, procurementItems: unknown, deliveriesReceived: unknown, procurementConcerns: string | null, constructionProgress: unknown, qcInspections: unknown, ncrStatus: unknown, qualityRemarks: string | null, manpower: unknown, equipmentUtilization: unknown, breakdownDetails: string | null, risksIssues: unknown, clientActions: unknown, lookaheadEngineering: string | null, lookaheadProcurement: string | null, lookaheadConstruction: string | null, lookaheadCommissioning: string | null, managementComments: string | null, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }>, machinery: Array<{ id: string, dailyReportId: string, projectId: string, poId: string, poNumber: string | null, equipmentDescription: string | null, workingHours: number | null, idleHours: number | null, breakdownHours: number | null, livePhotoFileId: string | null, livePhotoFilename: string | null, livePhotoDownloadUrl: string | null, compliant: boolean, createdByName: string | null, createdAt: string }> } };

export type UpdateDailyReportMutationVariables = Exact<{
  id: string | number;
  input: Types.DailyReportInput;
}>;


export type UpdateDailyReportMutation = { updateDailyReport: { id: string, projectId: string, reportNumber: string, reportDate: string, preparedBy: string | null, reviewedBy: string | null, weatherConditions: string | null, temperature: string | null, scheduleStatus: string | null, costStatus: string | null, safetyStatus: string | null, qualityStatus: string | null, keyAccomplishments: string | null, majorConcerns: string | null, progressMetrics: unknown, safetyStats: unknown, safetyActivities: unknown, safetyRemarks: string | null, engineeringProgress: unknown, engineeringDeliverables: unknown, engineeringIssues: string | null, procurementItems: unknown, deliveriesReceived: unknown, procurementConcerns: string | null, constructionProgress: unknown, qcInspections: unknown, ncrStatus: unknown, qualityRemarks: string | null, manpower: unknown, equipmentUtilization: unknown, breakdownDetails: string | null, risksIssues: unknown, clientActions: unknown, lookaheadEngineering: string | null, lookaheadProcurement: string | null, lookaheadConstruction: string | null, lookaheadCommissioning: string | null, managementComments: string | null, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }>, machinery: Array<{ id: string, dailyReportId: string, projectId: string, poId: string, poNumber: string | null, equipmentDescription: string | null, workingHours: number | null, idleHours: number | null, breakdownHours: number | null, livePhotoFileId: string | null, livePhotoFilename: string | null, livePhotoDownloadUrl: string | null, compliant: boolean, createdByName: string | null, createdAt: string }> } };

export type DeleteDailyReportMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteDailyReportMutation = { deleteDailyReport: boolean };

export type UploadDailyReportFileMutationVariables = Exact<{
  reportId: string | number;
  fileId: string | number;
  title?: string | null | undefined;
}>;


export type UploadDailyReportFileMutation = { uploadDailyReportFile: { id: string, projectId: string, reportNumber: string, reportDate: string, preparedBy: string | null, reviewedBy: string | null, weatherConditions: string | null, temperature: string | null, scheduleStatus: string | null, costStatus: string | null, safetyStatus: string | null, qualityStatus: string | null, keyAccomplishments: string | null, majorConcerns: string | null, progressMetrics: unknown, safetyStats: unknown, safetyActivities: unknown, safetyRemarks: string | null, engineeringProgress: unknown, engineeringDeliverables: unknown, engineeringIssues: string | null, procurementItems: unknown, deliveriesReceived: unknown, procurementConcerns: string | null, constructionProgress: unknown, qcInspections: unknown, ncrStatus: unknown, qualityRemarks: string | null, manpower: unknown, equipmentUtilization: unknown, breakdownDetails: string | null, risksIssues: unknown, clientActions: unknown, lookaheadEngineering: string | null, lookaheadProcurement: string | null, lookaheadConstruction: string | null, lookaheadCommissioning: string | null, managementComments: string | null, createdByName: string | null, createdAt: string, updatedAt: string, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }>, machinery: Array<{ id: string, dailyReportId: string, projectId: string, poId: string, poNumber: string | null, equipmentDescription: string | null, workingHours: number | null, idleHours: number | null, breakdownHours: number | null, livePhotoFileId: string | null, livePhotoFilename: string | null, livePhotoDownloadUrl: string | null, compliant: boolean, createdByName: string | null, createdAt: string }> } };

export type DeleteDailyReportFileMutationVariables = Exact<{
  attachmentId: string | number;
  reportId: string | number;
}>;


export type DeleteDailyReportFileMutation = { deleteDailyReportFile: boolean };

export type AddDailyReportMachineryMutationVariables = Exact<{
  dailyReportId: string | number;
  poId: string | number;
  equipmentDescription?: string | null | undefined;
  workingHours?: number | null | undefined;
  idleHours?: number | null | undefined;
  breakdownHours?: number | null | undefined;
  fileId?: string | number | null | undefined;
}>;


export type AddDailyReportMachineryMutation = { addDailyReportMachinery: { id: string, dailyReportId: string, projectId: string, poId: string, poNumber: string | null, equipmentDescription: string | null, workingHours: number | null, idleHours: number | null, breakdownHours: number | null, livePhotoFileId: string | null, livePhotoFilename: string | null, livePhotoDownloadUrl: string | null, compliant: boolean, createdByName: string | null, createdAt: string } };

export type AttachDailyReportMachineryPhotoMutationVariables = Exact<{
  id: string | number;
  fileId: string | number;
}>;


export type AttachDailyReportMachineryPhotoMutation = { attachDailyReportMachineryPhoto: { id: string, dailyReportId: string, projectId: string, poId: string, poNumber: string | null, equipmentDescription: string | null, workingHours: number | null, idleHours: number | null, breakdownHours: number | null, livePhotoFileId: string | null, livePhotoFilename: string | null, livePhotoDownloadUrl: string | null, compliant: boolean, createdByName: string | null, createdAt: string } };

export type DeleteDailyReportMachineryMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteDailyReportMachineryMutation = { deleteDailyReportMachinery: boolean };

export type WbsFieldsFragment = { id: string, projectId: string, parentId: string | null, wbsCode: string, name: string, description: string | null, level: number, sequence: number, budgetAmount: number, responsible: string | null, createdAt: string, updatedAt: string };

export type ActivityFieldsFragment = { id: string, projectId: string, wbsId: string | null, activityCode: string, name: string, activityType: string, plannedStart: string | null, plannedFinish: string | null, durationDays: number, baselineStart: string | null, baselineFinish: string | null, baselineDuration: number | null, actualStart: string | null, actualFinish: string | null, percentComplete: number, earlyStart: string | null, earlyFinish: string | null, lateStart: string | null, lateFinish: string | null, totalFloat: number | null, freeFloat: number | null, isCritical: boolean, budgetAmount: number, actualCost: number, responsible: string | null, location: string | null, remarks: string | null, sequence: number, createdAt: string, updatedAt: string, predecessors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, successors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, resources: Array<{ id: string, activityId: string, resourceId: string, resourceName: string | null, unit: string | null, unitsPerDay: number, totalUnits: number | null, budgetedCost: number | null, actualUnits: number | null, actualCost: number | null }> };

export type BaselineFieldsFragment = { id: string, projectId: string, name: string, description: string | null, baselineDate: string, isActive: boolean, createdAt: string };

export type ResourceFieldsFragment = { id: string, projectId: string, name: string, resourceType: string, unit: string, maxUnitsPerDay: number, costPerUnit: number, currencyCode: string, createdAt: string, updatedAt: string };

export type ProjectWbsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectWbsQuery = { projectWBS: Array<{ id: string, projectId: string, parentId: string | null, wbsCode: string, name: string, description: string | null, level: number, sequence: number, budgetAmount: number, responsible: string | null, createdAt: string, updatedAt: string, children: Array<{ id: string, projectId: string, parentId: string | null, wbsCode: string, name: string, description: string | null, level: number, sequence: number, budgetAmount: number, responsible: string | null, createdAt: string, updatedAt: string, children: Array<{ id: string, projectId: string, parentId: string | null, wbsCode: string, name: string, description: string | null, level: number, sequence: number, budgetAmount: number, responsible: string | null, createdAt: string, updatedAt: string, children: Array<{ id: string, projectId: string, parentId: string | null, wbsCode: string, name: string, description: string | null, level: number, sequence: number, budgetAmount: number, responsible: string | null, createdAt: string, updatedAt: string }> }> }> }> };

export type ProjectActivitiesQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectActivitiesQuery = { projectActivities: Array<{ id: string, projectId: string, wbsId: string | null, activityCode: string, name: string, activityType: string, plannedStart: string | null, plannedFinish: string | null, durationDays: number, baselineStart: string | null, baselineFinish: string | null, baselineDuration: number | null, actualStart: string | null, actualFinish: string | null, percentComplete: number, earlyStart: string | null, earlyFinish: string | null, lateStart: string | null, lateFinish: string | null, totalFloat: number | null, freeFloat: number | null, isCritical: boolean, budgetAmount: number, actualCost: number, responsible: string | null, location: string | null, remarks: string | null, sequence: number, createdAt: string, updatedAt: string, predecessors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, successors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, resources: Array<{ id: string, activityId: string, resourceId: string, resourceName: string | null, unit: string | null, unitsPerDay: number, totalUnits: number | null, budgetedCost: number | null, actualUnits: number | null, actualCost: number | null }> }> };

export type ProjectDependenciesQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectDependenciesQuery = { projectDependencies: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }> };

export type ProjectBaselinesQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectBaselinesQuery = { projectBaselines: Array<{ id: string, projectId: string, name: string, description: string | null, baselineDate: string, isActive: boolean, createdAt: string }> };

export type ProjectResourcesQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectResourcesQuery = { projectResources: Array<{ id: string, projectId: string, name: string, resourceType: string, unit: string, maxUnitsPerDay: number, costPerUnit: number, currencyCode: string, createdAt: string, updatedAt: string }> };

export type ProjectResourceCalendarQueryVariables = Exact<{
  resourceId: string | number;
}>;


export type ProjectResourceCalendarQuery = { projectResourceCalendar: Array<{ id: string, resourceId: string, workDate: string, availableUnits: number, isHoliday: boolean, note: string | null }> };

export type ProjectEvmQueryVariables = Exact<{
  projectId: string | number;
  statusDate?: string | null | undefined;
}>;


export type ProjectEvmQuery = { projectEVM: { bac: number, pv: number, ev: number, ac: number, sv: number, cv: number, spi: number, cpi: number, eac: number, etc: number, vac: number, tcpi: number, criticalPathComplete: number, statusDate: string } };

export type CreateWbsNodeMutationVariables = Exact<{
  projectId: string | number;
  parentId?: string | number | null | undefined;
  wbsCode: string;
  name: string;
  description?: string | null | undefined;
  level?: number | null | undefined;
  sequence?: number | null | undefined;
  budgetAmount?: number | null | undefined;
  responsible?: string | null | undefined;
}>;


export type CreateWbsNodeMutation = { createWBSNode: { id: string, projectId: string, parentId: string | null, wbsCode: string, name: string, description: string | null, level: number, sequence: number, budgetAmount: number, responsible: string | null, createdAt: string, updatedAt: string } };

export type UpdateWbsNodeMutationVariables = Exact<{
  id: string | number;
  wbsCode?: string | null | undefined;
  name?: string | null | undefined;
  description?: string | null | undefined;
  sequence?: number | null | undefined;
  budgetAmount?: number | null | undefined;
  responsible?: string | null | undefined;
}>;


export type UpdateWbsNodeMutation = { updateWBSNode: { id: string, projectId: string, parentId: string | null, wbsCode: string, name: string, description: string | null, level: number, sequence: number, budgetAmount: number, responsible: string | null, createdAt: string, updatedAt: string } };

export type DeleteWbsNodeMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteWbsNodeMutation = { deleteWBSNode: boolean };

export type CreateActivityMutationVariables = Exact<{
  projectId: string | number;
  wbsId?: string | number | null | undefined;
  activityCode: string;
  name: string;
  activityType?: string | null | undefined;
  plannedStart?: string | null | undefined;
  plannedFinish?: string | null | undefined;
  durationDays?: number | null | undefined;
  responsible?: string | null | undefined;
  location?: string | null | undefined;
  remarks?: string | null | undefined;
  budgetAmount?: number | null | undefined;
  sequence?: number | null | undefined;
}>;


export type CreateActivityMutation = { createActivity: { id: string, projectId: string, wbsId: string | null, activityCode: string, name: string, activityType: string, plannedStart: string | null, plannedFinish: string | null, durationDays: number, baselineStart: string | null, baselineFinish: string | null, baselineDuration: number | null, actualStart: string | null, actualFinish: string | null, percentComplete: number, earlyStart: string | null, earlyFinish: string | null, lateStart: string | null, lateFinish: string | null, totalFloat: number | null, freeFloat: number | null, isCritical: boolean, budgetAmount: number, actualCost: number, responsible: string | null, location: string | null, remarks: string | null, sequence: number, createdAt: string, updatedAt: string, predecessors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, successors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, resources: Array<{ id: string, activityId: string, resourceId: string, resourceName: string | null, unit: string | null, unitsPerDay: number, totalUnits: number | null, budgetedCost: number | null, actualUnits: number | null, actualCost: number | null }> } };

export type UpdateActivityMutationVariables = Exact<{
  id: string | number;
  wbsId?: string | number | null | undefined;
  activityCode?: string | null | undefined;
  name?: string | null | undefined;
  activityType?: string | null | undefined;
  plannedStart?: string | null | undefined;
  plannedFinish?: string | null | undefined;
  durationDays?: number | null | undefined;
  responsible?: string | null | undefined;
  location?: string | null | undefined;
  remarks?: string | null | undefined;
  budgetAmount?: number | null | undefined;
  actualCost?: number | null | undefined;
  sequence?: number | null | undefined;
}>;


export type UpdateActivityMutation = { updateActivity: { id: string, projectId: string, wbsId: string | null, activityCode: string, name: string, activityType: string, plannedStart: string | null, plannedFinish: string | null, durationDays: number, baselineStart: string | null, baselineFinish: string | null, baselineDuration: number | null, actualStart: string | null, actualFinish: string | null, percentComplete: number, earlyStart: string | null, earlyFinish: string | null, lateStart: string | null, lateFinish: string | null, totalFloat: number | null, freeFloat: number | null, isCritical: boolean, budgetAmount: number, actualCost: number, responsible: string | null, location: string | null, remarks: string | null, sequence: number, createdAt: string, updatedAt: string, predecessors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, successors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, resources: Array<{ id: string, activityId: string, resourceId: string, resourceName: string | null, unit: string | null, unitsPerDay: number, totalUnits: number | null, budgetedCost: number | null, actualUnits: number | null, actualCost: number | null }> } };

export type UpdateActivityProgressMutationVariables = Exact<{
  id: string | number;
  percentComplete: number;
  actualStart?: string | null | undefined;
  actualFinish?: string | null | undefined;
}>;


export type UpdateActivityProgressMutation = { updateActivityProgress: { id: string, projectId: string, wbsId: string | null, activityCode: string, name: string, activityType: string, plannedStart: string | null, plannedFinish: string | null, durationDays: number, baselineStart: string | null, baselineFinish: string | null, baselineDuration: number | null, actualStart: string | null, actualFinish: string | null, percentComplete: number, earlyStart: string | null, earlyFinish: string | null, lateStart: string | null, lateFinish: string | null, totalFloat: number | null, freeFloat: number | null, isCritical: boolean, budgetAmount: number, actualCost: number, responsible: string | null, location: string | null, remarks: string | null, sequence: number, createdAt: string, updatedAt: string, predecessors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, successors: Array<{ id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null }>, resources: Array<{ id: string, activityId: string, resourceId: string, resourceName: string | null, unit: string | null, unitsPerDay: number, totalUnits: number | null, budgetedCost: number | null, actualUnits: number | null, actualCost: number | null }> } };

export type DeleteActivityMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteActivityMutation = { deleteActivity: boolean };

export type BulkImportActivitiesMutationVariables = Exact<{
  projectId: string | number;
  activities: Array<Types.ActivityImportInput> | Types.ActivityImportInput;
  dependencies?: Array<Types.DependencyImportInput> | Types.DependencyImportInput | null | undefined;
  clearExisting?: boolean | null | undefined;
}>;


export type BulkImportActivitiesMutation = { bulkImportActivities: boolean };

export type CreateDependencyMutationVariables = Exact<{
  projectId: string | number;
  predecessorId: string | number;
  successorId: string | number;
  dependencyType?: string | null | undefined;
  lagDays?: number | null | undefined;
}>;


export type CreateDependencyMutation = { createDependency: { id: string, predecessorId: string, successorId: string, dependencyType: string, lagDays: number, predecessorCode: string | null, successorCode: string | null } };

export type DeleteDependencyMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteDependencyMutation = { deleteDependency: boolean };

export type RecalculateCpmMutationVariables = Exact<{
  projectId: string | number;
}>;


export type RecalculateCpmMutation = { recalculateCPM: boolean };

export type LevelResourcesMutationVariables = Exact<{
  projectId: string | number;
}>;


export type LevelResourcesMutation = { levelResources: boolean };

export type CreateBaselineMutationVariables = Exact<{
  projectId: string | number;
  name: string;
  description?: string | null | undefined;
}>;


export type CreateBaselineMutation = { createBaseline: { id: string, projectId: string, name: string, description: string | null, baselineDate: string, isActive: boolean, createdAt: string } };

export type SetActiveBaselineMutationVariables = Exact<{
  id: string | number;
}>;


export type SetActiveBaselineMutation = { setActiveBaseline: { id: string, projectId: string, name: string, description: string | null, baselineDate: string, isActive: boolean, createdAt: string } };

export type ApplyBaselineMutationVariables = Exact<{
  id: string | number;
}>;


export type ApplyBaselineMutation = { applyBaseline: boolean };

export type DeleteBaselineMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteBaselineMutation = { deleteBaseline: boolean };

export type CreateResourceMutationVariables = Exact<{
  projectId: string | number;
  name: string;
  resourceType: string;
  unit: string;
  maxUnitsPerDay: number;
  costPerUnit: number;
  currencyCode?: string | null | undefined;
}>;


export type CreateResourceMutation = { createResource: { id: string, projectId: string, name: string, resourceType: string, unit: string, maxUnitsPerDay: number, costPerUnit: number, currencyCode: string, createdAt: string, updatedAt: string } };

export type UpdateResourceMutationVariables = Exact<{
  id: string | number;
  name?: string | null | undefined;
  resourceType?: string | null | undefined;
  unit?: string | null | undefined;
  maxUnitsPerDay?: number | null | undefined;
  costPerUnit?: number | null | undefined;
}>;


export type UpdateResourceMutation = { updateResource: { id: string, projectId: string, name: string, resourceType: string, unit: string, maxUnitsPerDay: number, costPerUnit: number, currencyCode: string, createdAt: string, updatedAt: string } };

export type DeleteResourceMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteResourceMutation = { deleteResource: boolean };

export type SetCalendarDayMutationVariables = Exact<{
  resourceId: string | number;
  workDate: string;
  availableUnits: number;
  isHoliday: boolean;
  note?: string | null | undefined;
}>;


export type SetCalendarDayMutation = { setCalendarDay: { id: string, resourceId: string, workDate: string, availableUnits: number, isHoliday: boolean, note: string | null } };

export type DeleteCalendarDayMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteCalendarDayMutation = { deleteCalendarDay: boolean };

export type AssignResourceMutationVariables = Exact<{
  activityId: string | number;
  resourceId: string | number;
  unitsPerDay: number;
  budgetedCost?: number | null | undefined;
}>;


export type AssignResourceMutation = { assignResource: { id: string, activityId: string, resourceId: string, resourceName: string | null, unit: string | null, unitsPerDay: number, totalUnits: number | null, budgetedCost: number | null, actualUnits: number | null, actualCost: number | null } };

export type UpdateResourceAssignmentMutationVariables = Exact<{
  id: string | number;
  unitsPerDay?: number | null | undefined;
  totalUnits?: number | null | undefined;
  budgetedCost?: number | null | undefined;
  actualUnits?: number | null | undefined;
  actualCost?: number | null | undefined;
}>;


export type UpdateResourceAssignmentMutation = { updateResourceAssignment: { id: string, activityId: string, resourceId: string, resourceName: string | null, unit: string | null, unitsPerDay: number, totalUnits: number | null, budgetedCost: number | null, actualUnits: number | null, actualCost: number | null } };

export type RemoveResourceAssignmentMutationVariables = Exact<{
  id: string | number;
}>;


export type RemoveResourceAssignmentMutation = { removeResourceAssignment: boolean };

export type CostCodeFieldsFragment = { id: string, projectId: string, wbsId: string | null, analyticAccountId: string | null, code: string, name: string, category: string, budgetAmount: number, sequence: number, committedAmount: number, actualAmount: number, forecastEAC: number, remainingBudget: number, percentConsumed: number, createdAt: string, updatedAt: string };

export type CommittedFieldsFragment = { id: string, projectId: string, costCodeId: string | null, costCodeName: string | null, commitmentType: string, referenceId: string | null, referenceNumber: string | null, description: string, vendorName: string | null, committedAmount: number, invoicedAmount: number, paidAmount: number, currencyCode: string, commitmentDate: string | null, expectedInvoiceDate: string | null, status: string, notes: string | null, createdAt: string, updatedAt: string };

export type CashFlowFieldsFragment = { id: string, projectId: string, periodYear: number, periodMonth: number, label: string, plannedOutflow: number, actualOutflow: number, forecastOutflow: number, plannedInflow: number, actualInflow: number, forecastInflow: number, notes: string | null, updatedAt: string, cumPlannedOutflow: number, cumActualOutflow: number, cumForecastOutflow: number };

export type SubcontractFieldsFragment = { id: string, projectId: string, costCodeId: string | null, subcontractNumber: string, subcontractorName: string, description: string | null, scopeOfWork: string | null, contractValue: number, revisedValue: number, retentionPercentage: number, retentionReleased: number, certifiedAmount: number, paidAmount: number, currencyCode: string, startDate: string | null, endDate: string | null, status: string, createdAt: string, updatedAt: string, billings: Array<{ id: string, subcontractId: string, billingNumber: string, billingDate: string, grossAmount: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string }> };

export type LaborFieldsFragment = { id: string, projectId: string, costCodeId: string | null, activityId: string | null, workDate: string, trade: string, workerName: string | null, regularHours: number, overtimeHours: number, costPerHour: number, totalCost: number, notes: string | null, createdAt: string };

export type EquipmentFieldsFragment = { id: string, projectId: string, costCodeId: string | null, logDate: string, equipmentName: string, equipmentType: string | null, ownership: string, workingHours: number, standbyHours: number, costPerHour: number, standbyRate: number, totalCost: number, notes: string | null, createdAt: string };

export type ClientBillingFieldsFragment = { id: string, projectId: string, billingNumber: string, billingDate: string, periodFrom: string | null, periodTo: string | null, grossAmount: number, retentionPercentage: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string, updatedAt: string };

export type ProjectCostCodesQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectCostCodesQuery = { projectCostCodes: Array<{ id: string, projectId: string, wbsId: string | null, analyticAccountId: string | null, code: string, name: string, category: string, budgetAmount: number, sequence: number, committedAmount: number, actualAmount: number, forecastEAC: number, remainingBudget: number, percentConsumed: number, createdAt: string, updatedAt: string }> };

export type ProjectCommittedCostsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectCommittedCostsQuery = { projectCommittedCosts: Array<{ id: string, projectId: string, costCodeId: string | null, costCodeName: string | null, commitmentType: string, referenceId: string | null, referenceNumber: string | null, description: string, vendorName: string | null, committedAmount: number, invoicedAmount: number, paidAmount: number, currencyCode: string, commitmentDate: string | null, expectedInvoiceDate: string | null, status: string, notes: string | null, createdAt: string, updatedAt: string }> };

export type ProjectCashFlowQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectCashFlowQuery = { projectCashFlow: Array<{ id: string, projectId: string, periodYear: number, periodMonth: number, label: string, plannedOutflow: number, actualOutflow: number, forecastOutflow: number, plannedInflow: number, actualInflow: number, forecastInflow: number, notes: string | null, updatedAt: string, cumPlannedOutflow: number, cumActualOutflow: number, cumForecastOutflow: number }> };

export type ProjectSubcontractsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectSubcontractsQuery = { projectSubcontracts: Array<{ id: string, projectId: string, costCodeId: string | null, subcontractNumber: string, subcontractorName: string, description: string | null, scopeOfWork: string | null, contractValue: number, revisedValue: number, retentionPercentage: number, retentionReleased: number, certifiedAmount: number, paidAmount: number, currencyCode: string, startDate: string | null, endDate: string | null, status: string, createdAt: string, updatedAt: string, billings: Array<{ id: string, subcontractId: string, billingNumber: string, billingDate: string, grossAmount: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string }> }> };

export type ProjectLaborEntriesQueryVariables = Exact<{
  projectId: string | number;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
}>;


export type ProjectLaborEntriesQuery = { projectLaborEntries: Array<{ id: string, projectId: string, costCodeId: string | null, activityId: string | null, workDate: string, trade: string, workerName: string | null, regularHours: number, overtimeHours: number, costPerHour: number, totalCost: number, notes: string | null, createdAt: string }> };

export type ProjectEquipmentLogQueryVariables = Exact<{
  projectId: string | number;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
}>;


export type ProjectEquipmentLogQuery = { projectEquipmentLog: Array<{ id: string, projectId: string, costCodeId: string | null, logDate: string, equipmentName: string, equipmentType: string | null, ownership: string, workingHours: number, standbyHours: number, costPerHour: number, standbyRate: number, totalCost: number, notes: string | null, createdAt: string }> };

export type ProjectCostForecastQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectCostForecastQuery = { projectCostForecast: Array<{ id: string, projectId: string, costCodeId: string | null, costCodeName: string | null, forecastDate: string, etcAmount: number, eacAmount: number, notes: string | null, createdAt: string }> };

export type ProjectClientBillingsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectClientBillingsQuery = { projectClientBillings: Array<{ id: string, projectId: string, billingNumber: string, billingDate: string, periodFrom: string | null, periodTo: string | null, grossAmount: number, retentionPercentage: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string, updatedAt: string }> };

export type ProjectCostSummaryQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectCostSummaryQuery = { projectCostSummary: { totalBudget: number, totalCommitted: number, totalActual: number, totalForecastEAC: number, totalRemaining: number, totalVariance: number, percentConsumed: number, totalBilled: number, totalCertified: number, totalPaidByClient: number, totalRetentionHeld: number, outstandingReceivable: number, byCategory: Array<{ category: string, budgetAmount: number, committedAmount: number, actualAmount: number, forecastEAC: number, variance: number }> } };

export type CreateCostCodeMutationVariables = Exact<{
  projectId: string | number;
  wbsId?: string | number | null | undefined;
  analyticAccountId?: string | number | null | undefined;
  code?: string | null | undefined;
  name?: string | null | undefined;
  category: string;
  budgetAmount: number;
  sequence?: number | null | undefined;
}>;


export type CreateCostCodeMutation = { createCostCode: { id: string, projectId: string, wbsId: string | null, analyticAccountId: string | null, code: string, name: string, category: string, budgetAmount: number, sequence: number, committedAmount: number, actualAmount: number, forecastEAC: number, remainingBudget: number, percentConsumed: number, createdAt: string, updatedAt: string } };

export type UpdateCostCodeMutationVariables = Exact<{
  id: string | number;
  wbsId?: string | number | null | undefined;
  code?: string | null | undefined;
  name?: string | null | undefined;
  category?: string | null | undefined;
  budgetAmount?: number | null | undefined;
  sequence?: number | null | undefined;
}>;


export type UpdateCostCodeMutation = { updateCostCode: { id: string, projectId: string, wbsId: string | null, analyticAccountId: string | null, code: string, name: string, category: string, budgetAmount: number, sequence: number, committedAmount: number, actualAmount: number, forecastEAC: number, remainingBudget: number, percentConsumed: number, createdAt: string, updatedAt: string } };

export type DeleteCostCodeMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteCostCodeMutation = { deleteCostCode: boolean };

export type CreateCommittedCostMutationVariables = Exact<{
  projectId: string | number;
  costCodeId?: string | number | null | undefined;
  commitmentType: string;
  referenceNumber?: string | null | undefined;
  description: string;
  vendorName?: string | null | undefined;
  committedAmount: number;
  currencyCode?: string | null | undefined;
  commitmentDate?: string | null | undefined;
  expectedInvoiceDate?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type CreateCommittedCostMutation = { createCommittedCost: { id: string, projectId: string, costCodeId: string | null, costCodeName: string | null, commitmentType: string, referenceId: string | null, referenceNumber: string | null, description: string, vendorName: string | null, committedAmount: number, invoicedAmount: number, paidAmount: number, currencyCode: string, commitmentDate: string | null, expectedInvoiceDate: string | null, status: string, notes: string | null, createdAt: string, updatedAt: string } };

export type UpdateCommittedCostMutationVariables = Exact<{
  id: string | number;
  costCodeId?: string | number | null | undefined;
  description?: string | null | undefined;
  vendorName?: string | null | undefined;
  committedAmount?: number | null | undefined;
  invoicedAmount?: number | null | undefined;
  paidAmount?: number | null | undefined;
  commitmentDate?: string | null | undefined;
  expectedInvoiceDate?: string | null | undefined;
  status?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateCommittedCostMutation = { updateCommittedCost: { id: string, projectId: string, costCodeId: string | null, costCodeName: string | null, commitmentType: string, referenceId: string | null, referenceNumber: string | null, description: string, vendorName: string | null, committedAmount: number, invoicedAmount: number, paidAmount: number, currencyCode: string, commitmentDate: string | null, expectedInvoiceDate: string | null, status: string, notes: string | null, createdAt: string, updatedAt: string } };

export type DeleteCommittedCostMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteCommittedCostMutation = { deleteCommittedCost: boolean };

export type SyncPoCommitmentsMutationVariables = Exact<{
  projectId: string | number;
}>;


export type SyncPoCommitmentsMutation = { syncPOCommitments: boolean };

export type UpsertCashFlowPeriodMutationVariables = Exact<{
  projectId: string | number;
  periodYear: number;
  periodMonth: number;
  plannedOutflow?: number | null | undefined;
  actualOutflow?: number | null | undefined;
  forecastOutflow?: number | null | undefined;
  plannedInflow?: number | null | undefined;
  actualInflow?: number | null | undefined;
  forecastInflow?: number | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpsertCashFlowPeriodMutation = { upsertCashFlowPeriod: { id: string, projectId: string, periodYear: number, periodMonth: number, label: string, plannedOutflow: number, actualOutflow: number, forecastOutflow: number, plannedInflow: number, actualInflow: number, forecastInflow: number, notes: string | null, updatedAt: string, cumPlannedOutflow: number, cumActualOutflow: number, cumForecastOutflow: number } };

export type CreateSubcontractMutationVariables = Exact<{
  projectId: string | number;
  costCodeId?: string | number | null | undefined;
  subcontractNumber: string;
  subcontractorName: string;
  description?: string | null | undefined;
  scopeOfWork?: string | null | undefined;
  contractValue: number;
  retentionPercentage?: number | null | undefined;
  currencyCode?: string | null | undefined;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
}>;


export type CreateSubcontractMutation = { createSubcontract: { id: string, projectId: string, costCodeId: string | null, subcontractNumber: string, subcontractorName: string, description: string | null, scopeOfWork: string | null, contractValue: number, revisedValue: number, retentionPercentage: number, retentionReleased: number, certifiedAmount: number, paidAmount: number, currencyCode: string, startDate: string | null, endDate: string | null, status: string, createdAt: string, updatedAt: string, billings: Array<{ id: string, subcontractId: string, billingNumber: string, billingDate: string, grossAmount: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string }> } };

export type UpdateSubcontractMutationVariables = Exact<{
  id: string | number;
  costCodeId?: string | number | null | undefined;
  subcontractorName?: string | null | undefined;
  description?: string | null | undefined;
  scopeOfWork?: string | null | undefined;
  contractValue?: number | null | undefined;
  revisedValue?: number | null | undefined;
  retentionPercentage?: number | null | undefined;
  retentionReleased?: number | null | undefined;
  certifiedAmount?: number | null | undefined;
  paidAmount?: number | null | undefined;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  status?: string | null | undefined;
}>;


export type UpdateSubcontractMutation = { updateSubcontract: { id: string, projectId: string, costCodeId: string | null, subcontractNumber: string, subcontractorName: string, description: string | null, scopeOfWork: string | null, contractValue: number, revisedValue: number, retentionPercentage: number, retentionReleased: number, certifiedAmount: number, paidAmount: number, currencyCode: string, startDate: string | null, endDate: string | null, status: string, createdAt: string, updatedAt: string, billings: Array<{ id: string, subcontractId: string, billingNumber: string, billingDate: string, grossAmount: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string }> } };

export type DeleteSubcontractMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteSubcontractMutation = { deleteSubcontract: boolean };

export type CreateSubcontractBillingMutationVariables = Exact<{
  subcontractId: string | number;
  billingNumber: string;
  billingDate: string;
  grossAmount: number;
  retentionAmount: number;
  netAmount: number;
  notes?: string | null | undefined;
}>;


export type CreateSubcontractBillingMutation = { createSubcontractBilling: { id: string, subcontractId: string, billingNumber: string, billingDate: string, grossAmount: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string } };

export type UpdateSubcontractBillingMutationVariables = Exact<{
  id: string | number;
  certifiedAmount?: number | null | undefined;
  certifiedDate?: string | null | undefined;
  paidAmount?: number | null | undefined;
  paidDate?: string | null | undefined;
  status?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateSubcontractBillingMutation = { updateSubcontractBilling: { id: string, subcontractId: string, billingNumber: string, billingDate: string, grossAmount: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string } };

export type DeleteSubcontractBillingMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteSubcontractBillingMutation = { deleteSubcontractBilling: boolean };

export type CreateLaborEntryMutationVariables = Exact<{
  projectId: string | number;
  costCodeId?: string | number | null | undefined;
  activityId?: string | number | null | undefined;
  workDate: string;
  trade: string;
  workerName?: string | null | undefined;
  regularHours: number;
  overtimeHours?: number | null | undefined;
  costPerHour: number;
  notes?: string | null | undefined;
}>;


export type CreateLaborEntryMutation = { createLaborEntry: { id: string, projectId: string, costCodeId: string | null, activityId: string | null, workDate: string, trade: string, workerName: string | null, regularHours: number, overtimeHours: number, costPerHour: number, totalCost: number, notes: string | null, createdAt: string } };

export type UpdateLaborEntryMutationVariables = Exact<{
  id: string | number;
  trade?: string | null | undefined;
  workerName?: string | null | undefined;
  regularHours?: number | null | undefined;
  overtimeHours?: number | null | undefined;
  costPerHour?: number | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateLaborEntryMutation = { updateLaborEntry: { id: string, projectId: string, costCodeId: string | null, activityId: string | null, workDate: string, trade: string, workerName: string | null, regularHours: number, overtimeHours: number, costPerHour: number, totalCost: number, notes: string | null, createdAt: string } };

export type DeleteLaborEntryMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteLaborEntryMutation = { deleteLaborEntry: boolean };

export type CreateEquipmentLogMutationVariables = Exact<{
  projectId: string | number;
  costCodeId?: string | number | null | undefined;
  logDate: string;
  equipmentName: string;
  equipmentType?: string | null | undefined;
  ownership?: string | null | undefined;
  workingHours: number;
  standbyHours?: number | null | undefined;
  costPerHour: number;
  standbyRate?: number | null | undefined;
  notes?: string | null | undefined;
}>;


export type CreateEquipmentLogMutation = { createEquipmentLog: { id: string, projectId: string, costCodeId: string | null, logDate: string, equipmentName: string, equipmentType: string | null, ownership: string, workingHours: number, standbyHours: number, costPerHour: number, standbyRate: number, totalCost: number, notes: string | null, createdAt: string } };

export type UpdateEquipmentLogMutationVariables = Exact<{
  id: string | number;
  equipmentName?: string | null | undefined;
  equipmentType?: string | null | undefined;
  workingHours?: number | null | undefined;
  standbyHours?: number | null | undefined;
  costPerHour?: number | null | undefined;
  standbyRate?: number | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateEquipmentLogMutation = { updateEquipmentLog: { id: string, projectId: string, costCodeId: string | null, logDate: string, equipmentName: string, equipmentType: string | null, ownership: string, workingHours: number, standbyHours: number, costPerHour: number, standbyRate: number, totalCost: number, notes: string | null, createdAt: string } };

export type DeleteEquipmentLogMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteEquipmentLogMutation = { deleteEquipmentLog: boolean };

export type UpsertCostForecastMutationVariables = Exact<{
  projectId: string | number;
  costCodeId?: string | number | null | undefined;
  forecastDate: string;
  etcAmount: number;
  eacAmount: number;
  notes?: string | null | undefined;
}>;


export type UpsertCostForecastMutation = { upsertCostForecast: { id: string, projectId: string, costCodeId: string | null, costCodeName: string | null, forecastDate: string, etcAmount: number, eacAmount: number, notes: string | null, createdAt: string } };

export type CreateClientBillingMutationVariables = Exact<{
  projectId: string | number;
  billingNumber: string;
  billingDate: string;
  periodFrom?: string | null | undefined;
  periodTo?: string | null | undefined;
  grossAmount: number;
  retentionPercentage?: number | null | undefined;
  retentionAmount?: number | null | undefined;
  netAmount: number;
  notes?: string | null | undefined;
}>;


export type CreateClientBillingMutation = { createClientBilling: { id: string, projectId: string, billingNumber: string, billingDate: string, periodFrom: string | null, periodTo: string | null, grossAmount: number, retentionPercentage: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string, updatedAt: string } };

export type UpdateClientBillingMutationVariables = Exact<{
  id: string | number;
  billingDate?: string | null | undefined;
  periodFrom?: string | null | undefined;
  periodTo?: string | null | undefined;
  grossAmount?: number | null | undefined;
  retentionPercentage?: number | null | undefined;
  retentionAmount?: number | null | undefined;
  netAmount?: number | null | undefined;
  certifiedAmount?: number | null | undefined;
  certifiedDate?: string | null | undefined;
  paidAmount?: number | null | undefined;
  paidDate?: string | null | undefined;
  status?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateClientBillingMutation = { updateClientBilling: { id: string, projectId: string, billingNumber: string, billingDate: string, periodFrom: string | null, periodTo: string | null, grossAmount: number, retentionPercentage: number, retentionAmount: number, netAmount: number, certifiedAmount: number | null, certifiedDate: string | null, paidAmount: number, paidDate: string | null, status: string, notes: string | null, createdAt: string, updatedAt: string } };

export type DeleteClientBillingMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteClientBillingMutation = { deleteClientBilling: boolean };

export type VoFieldsFragment = { id: string, projectId: string, voNumber: string, title: string, description: string | null, changeType: string, initiatedBy: string, instructionDate: string | null, receivedDate: string | null, scheduleImpactDays: number, voValue: number, approvedValue: number | null, currencyCode: string, clientRef: string | null, impactAnalysis: string | null, technicalNotes: string | null, status: string, submittedAt: string | null, decidedAt: string | null, rejectionReason: string | null, contractId: string | null, appliedValue: number | null, createdAt: string, updatedAt: string, costItems: Array<{ id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string }>, correspondence: Array<{ id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string }>, drawings: Array<{ id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string }> };

export type ProjectVariationOrdersQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectVariationOrdersQuery = { projectVariationOrders: Array<{ id: string, projectId: string, voNumber: string, title: string, description: string | null, changeType: string, initiatedBy: string, instructionDate: string | null, receivedDate: string | null, scheduleImpactDays: number, voValue: number, approvedValue: number | null, currencyCode: string, clientRef: string | null, impactAnalysis: string | null, technicalNotes: string | null, status: string, submittedAt: string | null, decidedAt: string | null, rejectionReason: string | null, contractId: string | null, appliedValue: number | null, createdAt: string, updatedAt: string, costItems: Array<{ id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string }>, correspondence: Array<{ id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string }>, drawings: Array<{ id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string }> }> };

export type ProjectVariationOrderQueryVariables = Exact<{
  id: string | number;
}>;


export type ProjectVariationOrderQuery = { projectVariationOrder: { id: string, projectId: string, voNumber: string, title: string, description: string | null, changeType: string, initiatedBy: string, instructionDate: string | null, receivedDate: string | null, scheduleImpactDays: number, voValue: number, approvedValue: number | null, currencyCode: string, clientRef: string | null, impactAnalysis: string | null, technicalNotes: string | null, status: string, submittedAt: string | null, decidedAt: string | null, rejectionReason: string | null, contractId: string | null, appliedValue: number | null, createdAt: string, updatedAt: string, costItems: Array<{ id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string }>, correspondence: Array<{ id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string }>, drawings: Array<{ id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string }> } | null };

export type CreateVariationOrderMutationVariables = Exact<{
  projectId: string | number;
  voNumber: string;
  title: string;
  description?: string | null | undefined;
  changeType?: string | null | undefined;
  initiatedBy?: string | null | undefined;
  instructionDate?: string | null | undefined;
  receivedDate?: string | null | undefined;
  scheduleImpactDays?: number | null | undefined;
  voValue: number;
  currencyCode?: string | null | undefined;
  clientRef?: string | null | undefined;
  impactAnalysis?: string | null | undefined;
  technicalNotes?: string | null | undefined;
  contractId?: string | number | null | undefined;
}>;


export type CreateVariationOrderMutation = { createVariationOrder: { id: string, projectId: string, voNumber: string, title: string, description: string | null, changeType: string, initiatedBy: string, instructionDate: string | null, receivedDate: string | null, scheduleImpactDays: number, voValue: number, approvedValue: number | null, currencyCode: string, clientRef: string | null, impactAnalysis: string | null, technicalNotes: string | null, status: string, submittedAt: string | null, decidedAt: string | null, rejectionReason: string | null, contractId: string | null, appliedValue: number | null, createdAt: string, updatedAt: string, costItems: Array<{ id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string }>, correspondence: Array<{ id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string }>, drawings: Array<{ id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string }> } };

export type UpdateVariationOrderMutationVariables = Exact<{
  id: string | number;
  title?: string | null | undefined;
  description?: string | null | undefined;
  changeType?: string | null | undefined;
  initiatedBy?: string | null | undefined;
  instructionDate?: string | null | undefined;
  receivedDate?: string | null | undefined;
  scheduleImpactDays?: number | null | undefined;
  voValue?: number | null | undefined;
  currencyCode?: string | null | undefined;
  clientRef?: string | null | undefined;
  impactAnalysis?: string | null | undefined;
  technicalNotes?: string | null | undefined;
  contractId?: string | number | null | undefined;
}>;


export type UpdateVariationOrderMutation = { updateVariationOrder: { id: string, projectId: string, voNumber: string, title: string, description: string | null, changeType: string, initiatedBy: string, instructionDate: string | null, receivedDate: string | null, scheduleImpactDays: number, voValue: number, approvedValue: number | null, currencyCode: string, clientRef: string | null, impactAnalysis: string | null, technicalNotes: string | null, status: string, submittedAt: string | null, decidedAt: string | null, rejectionReason: string | null, contractId: string | null, appliedValue: number | null, createdAt: string, updatedAt: string, costItems: Array<{ id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string }>, correspondence: Array<{ id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string }>, drawings: Array<{ id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string }> } };

export type DeleteVariationOrderMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteVariationOrderMutation = { deleteVariationOrder: boolean };

export type SubmitVariationOrderMutationVariables = Exact<{
  id: string | number;
}>;


export type SubmitVariationOrderMutation = { submitVariationOrder: { id: string, projectId: string, voNumber: string, title: string, description: string | null, changeType: string, initiatedBy: string, instructionDate: string | null, receivedDate: string | null, scheduleImpactDays: number, voValue: number, approvedValue: number | null, currencyCode: string, clientRef: string | null, impactAnalysis: string | null, technicalNotes: string | null, status: string, submittedAt: string | null, decidedAt: string | null, rejectionReason: string | null, contractId: string | null, appliedValue: number | null, createdAt: string, updatedAt: string, costItems: Array<{ id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string }>, correspondence: Array<{ id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string }>, drawings: Array<{ id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string }> } };

export type ApproveVariationOrderMutationVariables = Exact<{
  id: string | number;
  approvedValue: number;
  contractId?: string | number | null | undefined;
}>;


export type ApproveVariationOrderMutation = { approveVariationOrder: { id: string, projectId: string, voNumber: string, title: string, description: string | null, changeType: string, initiatedBy: string, instructionDate: string | null, receivedDate: string | null, scheduleImpactDays: number, voValue: number, approvedValue: number | null, currencyCode: string, clientRef: string | null, impactAnalysis: string | null, technicalNotes: string | null, status: string, submittedAt: string | null, decidedAt: string | null, rejectionReason: string | null, contractId: string | null, appliedValue: number | null, createdAt: string, updatedAt: string, costItems: Array<{ id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string }>, correspondence: Array<{ id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string }>, drawings: Array<{ id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string }> } };

export type RejectVariationOrderMutationVariables = Exact<{
  id: string | number;
  reason: string;
}>;


export type RejectVariationOrderMutation = { rejectVariationOrder: { id: string, projectId: string, voNumber: string, title: string, description: string | null, changeType: string, initiatedBy: string, instructionDate: string | null, receivedDate: string | null, scheduleImpactDays: number, voValue: number, approvedValue: number | null, currencyCode: string, clientRef: string | null, impactAnalysis: string | null, technicalNotes: string | null, status: string, submittedAt: string | null, decidedAt: string | null, rejectionReason: string | null, contractId: string | null, appliedValue: number | null, createdAt: string, updatedAt: string, costItems: Array<{ id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string }>, correspondence: Array<{ id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string }>, drawings: Array<{ id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string }> } };

export type SetVoStatusMutationVariables = Exact<{
  id: string | number;
  status: string;
}>;


export type SetVoStatusMutation = { setVOStatus: { id: string, projectId: string, voNumber: string, title: string, description: string | null, changeType: string, initiatedBy: string, instructionDate: string | null, receivedDate: string | null, scheduleImpactDays: number, voValue: number, approvedValue: number | null, currencyCode: string, clientRef: string | null, impactAnalysis: string | null, technicalNotes: string | null, status: string, submittedAt: string | null, decidedAt: string | null, rejectionReason: string | null, contractId: string | null, appliedValue: number | null, createdAt: string, updatedAt: string, costItems: Array<{ id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string }>, correspondence: Array<{ id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string }>, drawings: Array<{ id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string }> } };

export type CreateVoCostItemMutationVariables = Exact<{
  voId: string | number;
  category: string;
  description: string;
  quantity?: number | null | undefined;
  unit?: string | null | undefined;
  unitRate: number;
  amount: number;
  notes?: string | null | undefined;
}>;


export type CreateVoCostItemMutation = { createVOCostItem: { id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string } };

export type UpdateVoCostItemMutationVariables = Exact<{
  id: string | number;
  category?: string | null | undefined;
  description?: string | null | undefined;
  quantity?: number | null | undefined;
  unit?: string | null | undefined;
  unitRate?: number | null | undefined;
  amount?: number | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateVoCostItemMutation = { updateVOCostItem: { id: string, voId: string, category: string, description: string, quantity: number, unit: string | null, unitRate: number, amount: number, notes: string | null, createdAt: string } };

export type DeleteVoCostItemMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteVoCostItemMutation = { deleteVOCostItem: boolean };

export type CreateVoCorrespondenceMutationVariables = Exact<{
  voId: string | number;
  correspondenceDate: string;
  direction: string;
  referenceNumber?: string | null | undefined;
  subject: string;
  description?: string | null | undefined;
}>;


export type CreateVoCorrespondenceMutation = { createVOCorrespondence: { id: string, voId: string, correspondenceDate: string, direction: string, referenceNumber: string | null, subject: string, description: string | null, createdAt: string } };

export type DeleteVoCorrespondenceMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteVoCorrespondenceMutation = { deleteVOCorrespondence: boolean };

export type AddVoDrawingMutationVariables = Exact<{
  voId: string | number;
  drawingNumber: string;
  revision?: string | null | undefined;
  title?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type AddVoDrawingMutation = { addVODrawing: { id: string, voId: string, drawingNumber: string, revision: string | null, title: string | null, notes: string | null, createdAt: string } };

export type RemoveVoDrawingMutationVariables = Exact<{
  id: string | number;
}>;


export type RemoveVoDrawingMutation = { removeVODrawing: boolean };

export type MeetingActionFieldsFragment = { id: string, meetingId: string, actionNumber: number, description: string, responsiblePerson: string | null, dueDate: string | null, priority: string, status: string, closedAt: string | null, remarks: string | null, carryOverFrom: string | null, createdAt: string };

export type MeetingFieldsFragment = { id: string, projectId: string, meetingNumber: string, meetingType: string, title: string, meetingDate: string, location: string | null, chairperson: string | null, attendees: string | null, agenda: string | null, minutes: string | null, distributionList: string | null, status: string, issuedAt: string | null, createdAt: string, updatedAt: string, actions: Array<{ id: string, meetingId: string, actionNumber: number, description: string, responsiblePerson: string | null, dueDate: string | null, priority: string, status: string, closedAt: string | null, remarks: string | null, carryOverFrom: string | null, createdAt: string }> };

export type ProjectMeetingsQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectMeetingsQuery = { projectMeetings: Array<{ id: string, projectId: string, meetingNumber: string, meetingType: string, title: string, meetingDate: string, location: string | null, chairperson: string | null, attendees: string | null, agenda: string | null, minutes: string | null, distributionList: string | null, status: string, issuedAt: string | null, createdAt: string, updatedAt: string, actions: Array<{ id: string, meetingId: string, actionNumber: number, description: string, responsiblePerson: string | null, dueDate: string | null, priority: string, status: string, closedAt: string | null, remarks: string | null, carryOverFrom: string | null, createdAt: string }> }> };

export type CreateMeetingMutationVariables = Exact<{
  projectId: string | number;
  meetingType: string;
  title: string;
  meetingDate: string;
  location?: string | null | undefined;
  chairperson?: string | null | undefined;
  attendees?: string | null | undefined;
  agenda?: string | null | undefined;
  distributionList?: string | null | undefined;
}>;


export type CreateMeetingMutation = { createMeeting: { id: string, projectId: string, meetingNumber: string, meetingType: string, title: string, meetingDate: string, location: string | null, chairperson: string | null, attendees: string | null, agenda: string | null, minutes: string | null, distributionList: string | null, status: string, issuedAt: string | null, createdAt: string, updatedAt: string, actions: Array<{ id: string, meetingId: string, actionNumber: number, description: string, responsiblePerson: string | null, dueDate: string | null, priority: string, status: string, closedAt: string | null, remarks: string | null, carryOverFrom: string | null, createdAt: string }> } };

export type UpdateMeetingMutationVariables = Exact<{
  id: string | number;
  meetingType?: string | null | undefined;
  title?: string | null | undefined;
  meetingDate?: string | null | undefined;
  location?: string | null | undefined;
  chairperson?: string | null | undefined;
  attendees?: string | null | undefined;
  agenda?: string | null | undefined;
  minutes?: string | null | undefined;
  distributionList?: string | null | undefined;
}>;


export type UpdateMeetingMutation = { updateMeeting: { id: string, projectId: string, meetingNumber: string, meetingType: string, title: string, meetingDate: string, location: string | null, chairperson: string | null, attendees: string | null, agenda: string | null, minutes: string | null, distributionList: string | null, status: string, issuedAt: string | null, createdAt: string, updatedAt: string, actions: Array<{ id: string, meetingId: string, actionNumber: number, description: string, responsiblePerson: string | null, dueDate: string | null, priority: string, status: string, closedAt: string | null, remarks: string | null, carryOverFrom: string | null, createdAt: string }> } };

export type DeleteMeetingMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteMeetingMutation = { deleteMeeting: boolean };

export type IssueMeetingMutationVariables = Exact<{
  id: string | number;
}>;


export type IssueMeetingMutation = { issueMeeting: { id: string, projectId: string, meetingNumber: string, meetingType: string, title: string, meetingDate: string, location: string | null, chairperson: string | null, attendees: string | null, agenda: string | null, minutes: string | null, distributionList: string | null, status: string, issuedAt: string | null, createdAt: string, updatedAt: string, actions: Array<{ id: string, meetingId: string, actionNumber: number, description: string, responsiblePerson: string | null, dueDate: string | null, priority: string, status: string, closedAt: string | null, remarks: string | null, carryOverFrom: string | null, createdAt: string }> } };

export type CloseMeetingMutationVariables = Exact<{
  id: string | number;
}>;


export type CloseMeetingMutation = { closeMeeting: { id: string, projectId: string, meetingNumber: string, meetingType: string, title: string, meetingDate: string, location: string | null, chairperson: string | null, attendees: string | null, agenda: string | null, minutes: string | null, distributionList: string | null, status: string, issuedAt: string | null, createdAt: string, updatedAt: string, actions: Array<{ id: string, meetingId: string, actionNumber: number, description: string, responsiblePerson: string | null, dueDate: string | null, priority: string, status: string, closedAt: string | null, remarks: string | null, carryOverFrom: string | null, createdAt: string }> } };

export type CreateMeetingActionMutationVariables = Exact<{
  meetingId: string | number;
  description: string;
  responsiblePerson?: string | null | undefined;
  dueDate?: string | null | undefined;
  priority?: string | null | undefined;
  carryOverFrom?: string | number | null | undefined;
}>;


export type CreateMeetingActionMutation = { createMeetingAction: { id: string, meetingId: string, actionNumber: number, description: string, responsiblePerson: string | null, dueDate: string | null, priority: string, status: string, closedAt: string | null, remarks: string | null, carryOverFrom: string | null, createdAt: string } };

export type UpdateMeetingActionMutationVariables = Exact<{
  id: string | number;
  description?: string | null | undefined;
  responsiblePerson?: string | null | undefined;
  dueDate?: string | null | undefined;
  priority?: string | null | undefined;
  status?: string | null | undefined;
  remarks?: string | null | undefined;
}>;


export type UpdateMeetingActionMutation = { updateMeetingAction: { id: string, meetingId: string, actionNumber: number, description: string, responsiblePerson: string | null, dueDate: string | null, priority: string, status: string, closedAt: string | null, remarks: string | null, carryOverFrom: string | null, createdAt: string } };

export type DeleteMeetingActionMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteMeetingActionMutation = { deleteMeetingAction: boolean };

export type MiLineFieldsFragment = { id: string, productId: string, productName: string | null, productNameAr: string | null, sku: string | null, uom: string | null, poLineId: string | null, fromLocationName: string | null, toLocationName: string | null, qtyIssued: number, unitCost: number, totalCost: number, isInvoiced: boolean };

export type MiFieldsFragment = { id: string, issueNumber: string, issueDate: string, status: string, notes: string | null, poId: string | null, requisitionId: string | null, poNumber: string | null, requisitionNumber: string | null, projectCode: string | null, projectName: string | null, issuedByName: string | null, createdAt: string, lines: Array<{ id: string, productId: string, productName: string | null, productNameAr: string | null, sku: string | null, uom: string | null, poLineId: string | null, fromLocationName: string | null, toLocationName: string | null, qtyIssued: number, unitCost: number, totalCost: number, isInvoiced: boolean }> };

export type MaterialIssuesQueryVariables = Exact<{
  projectId?: string | number | null | undefined;
  status?: string | null | undefined;
  poId?: string | number | null | undefined;
  requisitionId?: string | number | null | undefined;
  receiptNumber?: string | null | undefined;
}>;


export type MaterialIssuesQuery = { materialIssues: Array<{ id: string, issueNumber: string, issueDate: string, status: string, notes: string | null, poId: string | null, requisitionId: string | null, poNumber: string | null, requisitionNumber: string | null, projectCode: string | null, projectName: string | null, issuedByName: string | null, createdAt: string, lines: Array<{ id: string, productId: string, productName: string | null, productNameAr: string | null, sku: string | null, uom: string | null, poLineId: string | null, fromLocationName: string | null, toLocationName: string | null, qtyIssued: number, unitCost: number, totalCost: number, isInvoiced: boolean }> }> };

export type MaterialIssueQueryVariables = Exact<{
  id: string | number;
}>;


export type MaterialIssueQuery = { materialIssue: { id: string, issueNumber: string, issueDate: string, status: string, notes: string | null, poId: string | null, requisitionId: string | null, poNumber: string | null, requisitionNumber: string | null, projectCode: string | null, projectName: string | null, issuedByName: string | null, createdAt: string, lines: Array<{ id: string, productId: string, productName: string | null, productNameAr: string | null, sku: string | null, uom: string | null, poLineId: string | null, fromLocationName: string | null, toLocationName: string | null, qtyIssued: number, unitCost: number, totalCost: number, isInvoiced: boolean }> } | null };

export type CreateMaterialIssueMutationVariables = Exact<{
  projectId?: string | number | null | undefined;
  poId?: string | number | null | undefined;
  issueDate: string;
  notes?: string | null | undefined;
}>;


export type CreateMaterialIssueMutation = { createMaterialIssue: { id: string, issueNumber: string, issueDate: string, status: string, notes: string | null, poId: string | null, requisitionId: string | null, poNumber: string | null, requisitionNumber: string | null, projectCode: string | null, projectName: string | null, issuedByName: string | null, createdAt: string, lines: Array<{ id: string, productId: string, productName: string | null, productNameAr: string | null, sku: string | null, uom: string | null, poLineId: string | null, fromLocationName: string | null, toLocationName: string | null, qtyIssued: number, unitCost: number, totalCost: number, isInvoiced: boolean }> } };

export type AddMaterialIssueLineMutationVariables = Exact<{
  issueId: string | number;
  productId: string | number;
  poLineId?: string | number | null | undefined;
  qtyIssued: number;
  unitCost: number;
  fromLocationId?: string | number | null | undefined;
}>;


export type AddMaterialIssueLineMutation = { addMaterialIssueLine: { id: string, productId: string, productName: string | null, productNameAr: string | null, sku: string | null, uom: string | null, poLineId: string | null, fromLocationName: string | null, toLocationName: string | null, qtyIssued: number, unitCost: number, totalCost: number, isInvoiced: boolean } };

export type DeleteMaterialIssueLineMutationVariables = Exact<{
  id: string | number;
  issueId: string | number;
}>;


export type DeleteMaterialIssueLineMutation = { deleteMaterialIssueLine: boolean };

export type IssueMaterialIssueMutationVariables = Exact<{
  id: string | number;
}>;


export type IssueMaterialIssueMutation = { issueMaterialIssue: { id: string, issueNumber: string, issueDate: string, status: string, notes: string | null, poId: string | null, requisitionId: string | null, poNumber: string | null, requisitionNumber: string | null, projectCode: string | null, projectName: string | null, issuedByName: string | null, createdAt: string, lines: Array<{ id: string, productId: string, productName: string | null, productNameAr: string | null, sku: string | null, uom: string | null, poLineId: string | null, fromLocationName: string | null, toLocationName: string | null, qtyIssued: number, unitCost: number, totalCost: number, isInvoiced: boolean }> } };

export type CancelMaterialIssueMutationVariables = Exact<{
  id: string | number;
}>;


export type CancelMaterialIssueMutation = { cancelMaterialIssue: { id: string, issueNumber: string, issueDate: string, status: string, notes: string | null, poId: string | null, requisitionId: string | null, poNumber: string | null, requisitionNumber: string | null, projectCode: string | null, projectName: string | null, issuedByName: string | null, createdAt: string, lines: Array<{ id: string, productId: string, productName: string | null, productNameAr: string | null, sku: string | null, uom: string | null, poLineId: string | null, fromLocationName: string | null, toLocationName: string | null, qtyIssued: number, unitCost: number, totalCost: number, isInvoiced: boolean }> } };

export type MrLineFieldsFragment = { id: string, issueLineId: string | null, poLineId: string | null, productId: string, productName: string | null, sku: string | null, toLocationId: string, toLocationName: string | null, qtyReturned: number, unitCost: number, totalCost: number };

export type MrFields2Fragment = { id: string, returnNumber: string, returnDate: string, poId: string, poNumber: string | null, projectId: string | null, projectCode: string | null, projectName: string | null, notes: string | null, createdByName: string | null, createdAt: string, lines: Array<{ id: string, issueLineId: string | null, poLineId: string | null, productId: string, productName: string | null, sku: string | null, toLocationId: string, toLocationName: string | null, qtyReturned: number, unitCost: number, totalCost: number }> };

export type MaterialReturnsQueryVariables = Exact<{
  poId?: string | number | null | undefined;
  projectId?: string | number | null | undefined;
  productId?: string | number | null | undefined;
}>;


export type MaterialReturnsQuery = { materialReturns: Array<{ id: string, returnNumber: string, returnDate: string, poId: string, poNumber: string | null, projectId: string | null, projectCode: string | null, projectName: string | null, notes: string | null, createdByName: string | null, createdAt: string, lines: Array<{ id: string, issueLineId: string | null, poLineId: string | null, productId: string, productName: string | null, sku: string | null, toLocationId: string, toLocationName: string | null, qtyReturned: number, unitCost: number, totalCost: number }> }> };

export type ReturnableMaterialIssueLinesQueryVariables = Exact<{
  poId?: string | number | null | undefined;
  projectId?: string | number | null | undefined;
  productId?: string | number | null | undefined;
}>;


export type ReturnableMaterialIssueLinesQuery = { returnableMaterialIssueLines: Array<{ issueLineId: string, issueId: string, issueNumber: string, issueDate: string, poId: string, poNumber: string | null, productId: string, productName: string | null, sku: string | null, uom: string | null, qtyIssued: number, qtyReturnedSoFar: number, qtyReturnable: number, unitCost: number, fromLocationId: string | null, fromLocationName: string | null }> };

export type ReturnableDirectDeliveryLinesQueryVariables = Exact<{
  poId?: string | number | null | undefined;
  projectId?: string | number | null | undefined;
  productId?: string | number | null | undefined;
}>;


export type ReturnableDirectDeliveryLinesQuery = { returnableDirectDeliveryLines: Array<{ poLineId: string, poId: string, poNumber: string | null, productId: string, productName: string | null, sku: string | null, uom: string | null, qtyReceived: number, qtyReturnedSoFar: number, qtyVendorReturned: number, qtyReturnable: number, unitCost: number }> };

export type CreateMaterialReturnMutationVariables = Exact<{
  input: Types.MaterialReturnInput;
}>;


export type CreateMaterialReturnMutation = { createMaterialReturn: { id: string, returnNumber: string, returnDate: string, poId: string, poNumber: string | null, projectId: string | null, projectCode: string | null, projectName: string | null, notes: string | null, createdByName: string | null, createdAt: string, lines: Array<{ id: string, issueLineId: string | null, poLineId: string | null, productId: string, productName: string | null, sku: string | null, toLocationId: string, toLocationName: string | null, qtyReturned: number, unitCost: number, totalCost: number }> } };

export type TqFieldsFragment = { id: string, projectId: string, tqNumber: string, discipline: string | null, priority: string, subject: string, description: string | null, raisedBy: string | null, raisedDate: string | null, documentId: string | null, documentRef: string | null, documentRevision: string | null, status: string, response: string | null, responseBy: string | null, responseDate: string | null, dueDate: string | null, closedAt: string | null, createdAt: string, updatedAt: string, isOverdue: boolean, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> };

export type ProjectTQsQueryVariables = Exact<{
  projectId: string | number;
  status?: string | null | undefined;
  discipline?: string | null | undefined;
  priority?: string | null | undefined;
}>;


export type ProjectTQsQuery = { projectTQs: Array<{ id: string, projectId: string, tqNumber: string, discipline: string | null, priority: string, subject: string, description: string | null, raisedBy: string | null, raisedDate: string | null, documentId: string | null, documentRef: string | null, documentRevision: string | null, status: string, response: string | null, responseBy: string | null, responseDate: string | null, dueDate: string | null, closedAt: string | null, createdAt: string, updatedAt: string, isOverdue: boolean, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> }> };

export type CreateTqMutationVariables = Exact<{
  projectId: string | number;
  discipline?: string | null | undefined;
  priority?: string | null | undefined;
  subject: string;
  description?: string | null | undefined;
  raisedBy?: string | null | undefined;
  raisedDate?: string | null | undefined;
  documentId?: string | number | null | undefined;
  documentRef?: string | null | undefined;
  documentRevision?: string | null | undefined;
  dueDate?: string | null | undefined;
}>;


export type CreateTqMutation = { createTQ: { id: string, projectId: string, tqNumber: string, discipline: string | null, priority: string, subject: string, description: string | null, raisedBy: string | null, raisedDate: string | null, documentId: string | null, documentRef: string | null, documentRevision: string | null, status: string, response: string | null, responseBy: string | null, responseDate: string | null, dueDate: string | null, closedAt: string | null, createdAt: string, updatedAt: string, isOverdue: boolean, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type UpdateTqMutationVariables = Exact<{
  id: string | number;
  discipline?: string | null | undefined;
  priority?: string | null | undefined;
  subject?: string | null | undefined;
  description?: string | null | undefined;
  raisedBy?: string | null | undefined;
  raisedDate?: string | null | undefined;
  documentId?: string | number | null | undefined;
  documentRef?: string | null | undefined;
  documentRevision?: string | null | undefined;
  dueDate?: string | null | undefined;
}>;


export type UpdateTqMutation = { updateTQ: { id: string, projectId: string, tqNumber: string, discipline: string | null, priority: string, subject: string, description: string | null, raisedBy: string | null, raisedDate: string | null, documentId: string | null, documentRef: string | null, documentRevision: string | null, status: string, response: string | null, responseBy: string | null, responseDate: string | null, dueDate: string | null, closedAt: string | null, createdAt: string, updatedAt: string, isOverdue: boolean, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type ReviewTqMutationVariables = Exact<{
  id: string | number;
}>;


export type ReviewTqMutation = { reviewTQ: { id: string, projectId: string, tqNumber: string, discipline: string | null, priority: string, subject: string, description: string | null, raisedBy: string | null, raisedDate: string | null, documentId: string | null, documentRef: string | null, documentRevision: string | null, status: string, response: string | null, responseBy: string | null, responseDate: string | null, dueDate: string | null, closedAt: string | null, createdAt: string, updatedAt: string, isOverdue: boolean, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type RespondToTqMutationVariables = Exact<{
  id: string | number;
  response: string;
  responseBy?: string | null | undefined;
}>;


export type RespondToTqMutation = { respondToTQ: { id: string, projectId: string, tqNumber: string, discipline: string | null, priority: string, subject: string, description: string | null, raisedBy: string | null, raisedDate: string | null, documentId: string | null, documentRef: string | null, documentRevision: string | null, status: string, response: string | null, responseBy: string | null, responseDate: string | null, dueDate: string | null, closedAt: string | null, createdAt: string, updatedAt: string, isOverdue: boolean, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type CloseTqMutationVariables = Exact<{
  id: string | number;
}>;


export type CloseTqMutation = { closeTQ: { id: string, projectId: string, tqNumber: string, discipline: string | null, priority: string, subject: string, description: string | null, raisedBy: string | null, raisedDate: string | null, documentId: string | null, documentRef: string | null, documentRevision: string | null, status: string, response: string | null, responseBy: string | null, responseDate: string | null, dueDate: string | null, closedAt: string | null, createdAt: string, updatedAt: string, isOverdue: boolean, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteTqMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteTqMutation = { deleteTQ: boolean };

export type UploadTqFileMutationVariables = Exact<{
  tqId: string | number;
  fileId: string | number;
  title?: string | null | undefined;
}>;


export type UploadTqFileMutation = { uploadTQFile: { id: string, projectId: string, tqNumber: string, discipline: string | null, priority: string, subject: string, description: string | null, raisedBy: string | null, raisedDate: string | null, documentId: string | null, documentRef: string | null, documentRevision: string | null, status: string, response: string | null, responseBy: string | null, responseDate: string | null, dueDate: string | null, closedAt: string | null, createdAt: string, updatedAt: string, isOverdue: boolean, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteTqFileMutationVariables = Exact<{
  attachmentId: string | number;
  tqId: string | number;
}>;


export type DeleteTqFileMutation = { deleteTQFile: boolean };

export type PunchPhotoFieldsFragment = { id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string };

export type PunchFieldsFragment = { id: string, projectId: string, punchNo: string, category: string, discipline: string | null, area: string | null, title: string, description: string | null, subcontractor: string | null, responsible: string | null, raisedBy: string | null, raisedDate: string | null, targetDate: string | null, status: string, supervisorSignedBy: string | null, supervisorSignedAt: string | null, pmSignedBy: string | null, pmSignedAt: string | null, closedAt: string | null, photoCount: number, createdAt: string, updatedAt: string, isOverdue: boolean, photos: Array<{ id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string }> };

export type ProjectPunchItemsQueryVariables = Exact<{
  projectId: string | number;
  category?: string | null | undefined;
  status?: string | null | undefined;
  discipline?: string | null | undefined;
  subcontractor?: string | null | undefined;
}>;


export type ProjectPunchItemsQuery = { projectPunchItems: Array<{ id: string, projectId: string, punchNo: string, category: string, discipline: string | null, area: string | null, title: string, description: string | null, subcontractor: string | null, responsible: string | null, raisedBy: string | null, raisedDate: string | null, targetDate: string | null, status: string, supervisorSignedBy: string | null, supervisorSignedAt: string | null, pmSignedBy: string | null, pmSignedAt: string | null, closedAt: string | null, photoCount: number, createdAt: string, updatedAt: string, isOverdue: boolean, photos: Array<{ id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string }> }> };

export type CreatePunchItemMutationVariables = Exact<{
  projectId: string | number;
  category: string;
  discipline?: string | null | undefined;
  area?: string | null | undefined;
  title: string;
  description?: string | null | undefined;
  subcontractor?: string | null | undefined;
  responsible?: string | null | undefined;
  raisedBy?: string | null | undefined;
  raisedDate?: string | null | undefined;
  targetDate?: string | null | undefined;
}>;


export type CreatePunchItemMutation = { createPunchItem: { id: string, projectId: string, punchNo: string, category: string, discipline: string | null, area: string | null, title: string, description: string | null, subcontractor: string | null, responsible: string | null, raisedBy: string | null, raisedDate: string | null, targetDate: string | null, status: string, supervisorSignedBy: string | null, supervisorSignedAt: string | null, pmSignedBy: string | null, pmSignedAt: string | null, closedAt: string | null, photoCount: number, createdAt: string, updatedAt: string, isOverdue: boolean, photos: Array<{ id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string }> } };

export type UpdatePunchItemMutationVariables = Exact<{
  id: string | number;
  category?: string | null | undefined;
  discipline?: string | null | undefined;
  area?: string | null | undefined;
  title?: string | null | undefined;
  description?: string | null | undefined;
  subcontractor?: string | null | undefined;
  responsible?: string | null | undefined;
  raisedBy?: string | null | undefined;
  raisedDate?: string | null | undefined;
  targetDate?: string | null | undefined;
}>;


export type UpdatePunchItemMutation = { updatePunchItem: { id: string, projectId: string, punchNo: string, category: string, discipline: string | null, area: string | null, title: string, description: string | null, subcontractor: string | null, responsible: string | null, raisedBy: string | null, raisedDate: string | null, targetDate: string | null, status: string, supervisorSignedBy: string | null, supervisorSignedAt: string | null, pmSignedBy: string | null, pmSignedAt: string | null, closedAt: string | null, photoCount: number, createdAt: string, updatedAt: string, isOverdue: boolean, photos: Array<{ id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string }> } };

export type UpdatePunchStatusMutationVariables = Exact<{
  id: string | number;
  status: string;
}>;


export type UpdatePunchStatusMutation = { updatePunchStatus: { id: string, projectId: string, punchNo: string, category: string, discipline: string | null, area: string | null, title: string, description: string | null, subcontractor: string | null, responsible: string | null, raisedBy: string | null, raisedDate: string | null, targetDate: string | null, status: string, supervisorSignedBy: string | null, supervisorSignedAt: string | null, pmSignedBy: string | null, pmSignedAt: string | null, closedAt: string | null, photoCount: number, createdAt: string, updatedAt: string, isOverdue: boolean, photos: Array<{ id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string }> } };

export type SupervisorSignPunchMutationVariables = Exact<{
  id: string | number;
  signedBy?: string | null | undefined;
}>;


export type SupervisorSignPunchMutation = { supervisorSignPunch: { id: string, projectId: string, punchNo: string, category: string, discipline: string | null, area: string | null, title: string, description: string | null, subcontractor: string | null, responsible: string | null, raisedBy: string | null, raisedDate: string | null, targetDate: string | null, status: string, supervisorSignedBy: string | null, supervisorSignedAt: string | null, pmSignedBy: string | null, pmSignedAt: string | null, closedAt: string | null, photoCount: number, createdAt: string, updatedAt: string, isOverdue: boolean, photos: Array<{ id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string }> } };

export type PmSignPunchMutationVariables = Exact<{
  id: string | number;
  signedBy?: string | null | undefined;
}>;


export type PmSignPunchMutation = { pmSignPunch: { id: string, projectId: string, punchNo: string, category: string, discipline: string | null, area: string | null, title: string, description: string | null, subcontractor: string | null, responsible: string | null, raisedBy: string | null, raisedDate: string | null, targetDate: string | null, status: string, supervisorSignedBy: string | null, supervisorSignedAt: string | null, pmSignedBy: string | null, pmSignedAt: string | null, closedAt: string | null, photoCount: number, createdAt: string, updatedAt: string, isOverdue: boolean, photos: Array<{ id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string }> } };

export type ReopenPunchMutationVariables = Exact<{
  id: string | number;
}>;


export type ReopenPunchMutation = { reopenPunch: { id: string, projectId: string, punchNo: string, category: string, discipline: string | null, area: string | null, title: string, description: string | null, subcontractor: string | null, responsible: string | null, raisedBy: string | null, raisedDate: string | null, targetDate: string | null, status: string, supervisorSignedBy: string | null, supervisorSignedAt: string | null, pmSignedBy: string | null, pmSignedAt: string | null, closedAt: string | null, photoCount: number, createdAt: string, updatedAt: string, isOverdue: boolean, photos: Array<{ id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string }> } };

export type DeletePunchItemMutationVariables = Exact<{
  id: string | number;
}>;


export type DeletePunchItemMutation = { deletePunchItem: boolean };

export type AddPunchPhotoMutationVariables = Exact<{
  punchId: string | number;
  url?: string | null | undefined;
  caption?: string | null | undefined;
  uploadedBy?: string | null | undefined;
}>;


export type AddPunchPhotoMutation = { addPunchPhoto: { id: string, punchId: string, fileId: string | null, url: string | null, caption: string | null, uploadedBy: string | null, createdAt: string } };

export type DeletePunchPhotoMutationVariables = Exact<{
  id: string | number;
}>;


export type DeletePunchPhotoMutation = { deletePunchPhoto: boolean };

export type RiskReviewFieldsFragment = { id: string, riskId: string, probability: number, impact: number, score: number, notes: string | null, reviewedBy: string | null, reviewedAt: string };

export type RiskFieldsFragment = { id: string, projectId: string, riskNo: string, category: string, title: string, description: string | null, cause: string | null, consequence: string | null, owner: string | null, probability: number, impact: number, riskScore: number, riskLevel: string, mitigationPlan: string | null, contingencyPlan: string | null, residualProbability: number | null, residualImpact: number | null, residualScore: number | null, residualLevel: string | null, status: string, raisedBy: string | null, raisedDate: string | null, reviewDate: string | null, createdAt: string, updatedAt: string, reviews: Array<{ id: string, riskId: string, probability: number, impact: number, score: number, notes: string | null, reviewedBy: string | null, reviewedAt: string }> };

export type ProjectRisksQueryVariables = Exact<{
  projectId: string | number;
  category?: string | null | undefined;
  status?: string | null | undefined;
  level?: string | null | undefined;
}>;


export type ProjectRisksQuery = { projectRisks: Array<{ id: string, projectId: string, riskNo: string, category: string, title: string, description: string | null, cause: string | null, consequence: string | null, owner: string | null, probability: number, impact: number, riskScore: number, riskLevel: string, mitigationPlan: string | null, contingencyPlan: string | null, residualProbability: number | null, residualImpact: number | null, residualScore: number | null, residualLevel: string | null, status: string, raisedBy: string | null, raisedDate: string | null, reviewDate: string | null, createdAt: string, updatedAt: string, reviews: Array<{ id: string, riskId: string, probability: number, impact: number, score: number, notes: string | null, reviewedBy: string | null, reviewedAt: string }> }> };

export type ProjectRiskQueryVariables = Exact<{
  id: string | number;
}>;


export type ProjectRiskQuery = { projectRisk: { id: string, projectId: string, riskNo: string, category: string, title: string, description: string | null, cause: string | null, consequence: string | null, owner: string | null, probability: number, impact: number, riskScore: number, riskLevel: string, mitigationPlan: string | null, contingencyPlan: string | null, residualProbability: number | null, residualImpact: number | null, residualScore: number | null, residualLevel: string | null, status: string, raisedBy: string | null, raisedDate: string | null, reviewDate: string | null, createdAt: string, updatedAt: string, reviews: Array<{ id: string, riskId: string, probability: number, impact: number, score: number, notes: string | null, reviewedBy: string | null, reviewedAt: string }> } | null };

export type CreateRiskMutationVariables = Exact<{
  projectId: string | number;
  category: string;
  title: string;
  description?: string | null | undefined;
  cause?: string | null | undefined;
  consequence?: string | null | undefined;
  owner?: string | null | undefined;
  probability: number;
  impact: number;
  mitigationPlan?: string | null | undefined;
  contingencyPlan?: string | null | undefined;
  residualProbability?: number | null | undefined;
  residualImpact?: number | null | undefined;
  raisedBy?: string | null | undefined;
  raisedDate?: string | null | undefined;
  reviewDate?: string | null | undefined;
}>;


export type CreateRiskMutation = { createRisk: { id: string, projectId: string, riskNo: string, category: string, title: string, description: string | null, cause: string | null, consequence: string | null, owner: string | null, probability: number, impact: number, riskScore: number, riskLevel: string, mitigationPlan: string | null, contingencyPlan: string | null, residualProbability: number | null, residualImpact: number | null, residualScore: number | null, residualLevel: string | null, status: string, raisedBy: string | null, raisedDate: string | null, reviewDate: string | null, createdAt: string, updatedAt: string, reviews: Array<{ id: string, riskId: string, probability: number, impact: number, score: number, notes: string | null, reviewedBy: string | null, reviewedAt: string }> } };

export type UpdateRiskMutationVariables = Exact<{
  id: string | number;
  category?: string | null | undefined;
  title?: string | null | undefined;
  description?: string | null | undefined;
  cause?: string | null | undefined;
  consequence?: string | null | undefined;
  owner?: string | null | undefined;
  probability?: number | null | undefined;
  impact?: number | null | undefined;
  mitigationPlan?: string | null | undefined;
  contingencyPlan?: string | null | undefined;
  residualProbability?: number | null | undefined;
  residualImpact?: number | null | undefined;
  raisedBy?: string | null | undefined;
  raisedDate?: string | null | undefined;
  reviewDate?: string | null | undefined;
}>;


export type UpdateRiskMutation = { updateRisk: { id: string, projectId: string, riskNo: string, category: string, title: string, description: string | null, cause: string | null, consequence: string | null, owner: string | null, probability: number, impact: number, riskScore: number, riskLevel: string, mitigationPlan: string | null, contingencyPlan: string | null, residualProbability: number | null, residualImpact: number | null, residualScore: number | null, residualLevel: string | null, status: string, raisedBy: string | null, raisedDate: string | null, reviewDate: string | null, createdAt: string, updatedAt: string, reviews: Array<{ id: string, riskId: string, probability: number, impact: number, score: number, notes: string | null, reviewedBy: string | null, reviewedAt: string }> } };

export type UpdateRiskStatusMutationVariables = Exact<{
  id: string | number;
  status: string;
}>;


export type UpdateRiskStatusMutation = { updateRiskStatus: { id: string, projectId: string, riskNo: string, category: string, title: string, description: string | null, cause: string | null, consequence: string | null, owner: string | null, probability: number, impact: number, riskScore: number, riskLevel: string, mitigationPlan: string | null, contingencyPlan: string | null, residualProbability: number | null, residualImpact: number | null, residualScore: number | null, residualLevel: string | null, status: string, raisedBy: string | null, raisedDate: string | null, reviewDate: string | null, createdAt: string, updatedAt: string, reviews: Array<{ id: string, riskId: string, probability: number, impact: number, score: number, notes: string | null, reviewedBy: string | null, reviewedAt: string }> } };

export type AddRiskReviewMutationVariables = Exact<{
  riskId: string | number;
  probability: number;
  impact: number;
  notes?: string | null | undefined;
  reviewedBy?: string | null | undefined;
}>;


export type AddRiskReviewMutation = { addRiskReview: { id: string, projectId: string, riskNo: string, category: string, title: string, description: string | null, cause: string | null, consequence: string | null, owner: string | null, probability: number, impact: number, riskScore: number, riskLevel: string, mitigationPlan: string | null, contingencyPlan: string | null, residualProbability: number | null, residualImpact: number | null, residualScore: number | null, residualLevel: string | null, status: string, raisedBy: string | null, raisedDate: string | null, reviewDate: string | null, createdAt: string, updatedAt: string, reviews: Array<{ id: string, riskId: string, probability: number, impact: number, score: number, notes: string | null, reviewedBy: string | null, reviewedAt: string }> } };

export type DeleteRiskMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteRiskMutation = { deleteRisk: boolean };

export type HandoverItemFieldsFragment = { id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string };

export type HandoverCertFileFieldsFragment = { id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null };

export type HandoverCertFieldsFragment = { id: string, projectId: string, certificateNo: string, title: string, areaZone: string | null, handoverDate: string | null, acceptedDate: string | null, contractorRep: string | null, clientRep: string | null, status: string, defectLiabilityStart: string | null, defectLiabilityEnd: string | null, notes: string | null, createdAt: string, updatedAt: string, completedItemCount: number, totalItemCount: number, items: Array<{ id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string }>, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> };

export type ProjectHandoverQueryVariables = Exact<{
  projectId: string | number;
}>;


export type ProjectHandoverQuery = { projectHandoverCertificates: Array<{ id: string, projectId: string, certificateNo: string, title: string, areaZone: string | null, handoverDate: string | null, acceptedDate: string | null, contractorRep: string | null, clientRep: string | null, status: string, defectLiabilityStart: string | null, defectLiabilityEnd: string | null, notes: string | null, createdAt: string, updatedAt: string, completedItemCount: number, totalItemCount: number, items: Array<{ id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string }>, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> }> };

export type CreateHandoverCertificateMutationVariables = Exact<{
  projectId: string | number;
  title: string;
  areaZone?: string | null | undefined;
  handoverDate?: string | null | undefined;
  contractorRep?: string | null | undefined;
  clientRep?: string | null | undefined;
  defectLiabilityStart?: string | null | undefined;
  defectLiabilityEnd?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type CreateHandoverCertificateMutation = { createHandoverCertificate: { id: string, projectId: string, certificateNo: string, title: string, areaZone: string | null, handoverDate: string | null, acceptedDate: string | null, contractorRep: string | null, clientRep: string | null, status: string, defectLiabilityStart: string | null, defectLiabilityEnd: string | null, notes: string | null, createdAt: string, updatedAt: string, completedItemCount: number, totalItemCount: number, items: Array<{ id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string }>, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type UpdateHandoverCertificateMutationVariables = Exact<{
  id: string | number;
  title?: string | null | undefined;
  areaZone?: string | null | undefined;
  handoverDate?: string | null | undefined;
  contractorRep?: string | null | undefined;
  clientRep?: string | null | undefined;
  defectLiabilityStart?: string | null | undefined;
  defectLiabilityEnd?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateHandoverCertificateMutation = { updateHandoverCertificate: { id: string, projectId: string, certificateNo: string, title: string, areaZone: string | null, handoverDate: string | null, acceptedDate: string | null, contractorRep: string | null, clientRep: string | null, status: string, defectLiabilityStart: string | null, defectLiabilityEnd: string | null, notes: string | null, createdAt: string, updatedAt: string, completedItemCount: number, totalItemCount: number, items: Array<{ id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string }>, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type IssueHandoverCertificateMutationVariables = Exact<{
  id: string | number;
}>;


export type IssueHandoverCertificateMutation = { issueHandoverCertificate: { id: string, projectId: string, certificateNo: string, title: string, areaZone: string | null, handoverDate: string | null, acceptedDate: string | null, contractorRep: string | null, clientRep: string | null, status: string, defectLiabilityStart: string | null, defectLiabilityEnd: string | null, notes: string | null, createdAt: string, updatedAt: string, completedItemCount: number, totalItemCount: number, items: Array<{ id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string }>, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type AcceptHandoverCertificateMutationVariables = Exact<{
  id: string | number;
  acceptedDate?: string | null | undefined;
  clientRep?: string | null | undefined;
}>;


export type AcceptHandoverCertificateMutation = { acceptHandoverCertificate: { id: string, projectId: string, certificateNo: string, title: string, areaZone: string | null, handoverDate: string | null, acceptedDate: string | null, contractorRep: string | null, clientRep: string | null, status: string, defectLiabilityStart: string | null, defectLiabilityEnd: string | null, notes: string | null, createdAt: string, updatedAt: string, completedItemCount: number, totalItemCount: number, items: Array<{ id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string }>, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type RejectHandoverCertificateMutationVariables = Exact<{
  id: string | number;
  notes?: string | null | undefined;
}>;


export type RejectHandoverCertificateMutation = { rejectHandoverCertificate: { id: string, projectId: string, certificateNo: string, title: string, areaZone: string | null, handoverDate: string | null, acceptedDate: string | null, contractorRep: string | null, clientRep: string | null, status: string, defectLiabilityStart: string | null, defectLiabilityEnd: string | null, notes: string | null, createdAt: string, updatedAt: string, completedItemCount: number, totalItemCount: number, items: Array<{ id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string }>, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteHandoverCertificateMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteHandoverCertificateMutation = { deleteHandoverCertificate: boolean };

export type UploadHandoverCertFileMutationVariables = Exact<{
  certificateId: string | number;
  fileId: string | number;
  title?: string | null | undefined;
}>;


export type UploadHandoverCertFileMutation = { uploadHandoverCertFile: { id: string, projectId: string, certificateNo: string, title: string, areaZone: string | null, handoverDate: string | null, acceptedDate: string | null, contractorRep: string | null, clientRep: string | null, status: string, defectLiabilityStart: string | null, defectLiabilityEnd: string | null, notes: string | null, createdAt: string, updatedAt: string, completedItemCount: number, totalItemCount: number, items: Array<{ id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string }>, files: Array<{ id: string, fileId: string, filename: string, mimeType: string, sizeBytes: number, title: string | null, createdAt: string, downloadUrl: string | null }> } };

export type DeleteHandoverCertFileMutationVariables = Exact<{
  attachmentId: string | number;
  certificateId: string | number;
}>;


export type DeleteHandoverCertFileMutation = { deleteHandoverCertFile: boolean };

export type CreateHandoverItemMutationVariables = Exact<{
  certificateId: string | number;
  category: string;
  description: string;
  sequence?: number | null | undefined;
  notes?: string | null | undefined;
}>;


export type CreateHandoverItemMutation = { createHandoverItem: { id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string } };

export type UpdateHandoverItemMutationVariables = Exact<{
  id: string | number;
  category?: string | null | undefined;
  description?: string | null | undefined;
  sequence?: number | null | undefined;
  status?: string | null | undefined;
  notes?: string | null | undefined;
}>;


export type UpdateHandoverItemMutation = { updateHandoverItem: { id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string } };

export type VerifyHandoverItemMutationVariables = Exact<{
  id: string | number;
  verifiedBy: string;
}>;


export type VerifyHandoverItemMutation = { verifyHandoverItem: { id: string, certificateId: string, sequence: number, category: string, description: string, status: string, verifiedBy: string | null, verifiedAt: string | null, notes: string | null, createdAt: string } };

export type DeleteHandoverItemMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteHandoverItemMutation = { deleteHandoverItem: boolean };

export type RechargeRequestFieldsFragment = { id: string, companyId: string, companyName: string | null, requestedBy: string | null, requestedByEmail: string | null, requestedForName: string | null, createdBy: string, createdByEmail: string | null, costCenterId: string, costCenterName: string | null, bundleId: string, bundleName: string | null, bundleAmount: number | null, bundleCurrencyCode: string | null, phoneNumber: string, notes: string | null, status: string, fulfilledBy: string | null, fulfilledByEmail: string | null, fulfilledAt: string | null, photoDownloadUrl: string | null, confirmedAt: string | null, photoPendingConfirmation: boolean, createdAt: string, updatedAt: string };

export type RechargeBundlesQueryVariables = Exact<{
  activeOnly?: boolean | null | undefined;
}>;


export type RechargeBundlesQuery = { rechargeBundles: Array<{ id: string, companyId: string, name: string, amount: number, currencyCode: string, isActive: boolean, sortOrder: number, createdAt: string }> };

export type RechargeRequestsQueryVariables = Exact<{
  scope?: string | null | undefined;
  status?: string | null | undefined;
}>;


export type RechargeRequestsQuery = { rechargeRequests: Array<{ id: string, companyId: string, companyName: string | null, requestedBy: string | null, requestedByEmail: string | null, requestedForName: string | null, createdBy: string, createdByEmail: string | null, costCenterId: string, costCenterName: string | null, bundleId: string, bundleName: string | null, bundleAmount: number | null, bundleCurrencyCode: string | null, phoneNumber: string, notes: string | null, status: string, fulfilledBy: string | null, fulfilledByEmail: string | null, fulfilledAt: string | null, photoDownloadUrl: string | null, confirmedAt: string | null, photoPendingConfirmation: boolean, createdAt: string, updatedAt: string }> };

export type RechargeRequestQueryVariables = Exact<{
  id: string | number;
}>;


export type RechargeRequestQuery = { rechargeRequest: { id: string, companyId: string, companyName: string | null, requestedBy: string | null, requestedByEmail: string | null, requestedForName: string | null, createdBy: string, createdByEmail: string | null, costCenterId: string, costCenterName: string | null, bundleId: string, bundleName: string | null, bundleAmount: number | null, bundleCurrencyCode: string | null, phoneNumber: string, notes: string | null, status: string, fulfilledBy: string | null, fulfilledByEmail: string | null, fulfilledAt: string | null, photoDownloadUrl: string | null, confirmedAt: string | null, photoPendingConfirmation: boolean, createdAt: string, updatedAt: string } | null };

export type RechargeCostCenterQueryVariables = Exact<{ [key: string]: never; }>;


export type RechargeCostCenterQuery = { rechargeCostCenter: { id: string, name: string, code: string, defaultFulfillerId: string | null } | null };

export type RechargeMonthlySummaryQueryVariables = Exact<{
  year?: number | null | undefined;
  month?: number | null | undefined;
}>;


export type RechargeMonthlySummaryQuery = { rechargeMonthlySummary: Array<{ requestedBy: string | null, requestedByEmail: string | null, requestCount: number, totalAmount: number, currencyCode: string, requests: Array<{ id: string, companyId: string, companyName: string | null, requestedBy: string | null, requestedByEmail: string | null, requestedForName: string | null, createdBy: string, createdByEmail: string | null, costCenterId: string, costCenterName: string | null, bundleId: string, bundleName: string | null, bundleAmount: number | null, bundleCurrencyCode: string | null, phoneNumber: string, notes: string | null, status: string, fulfilledBy: string | null, fulfilledByEmail: string | null, fulfilledAt: string | null, photoDownloadUrl: string | null, confirmedAt: string | null, photoPendingConfirmation: boolean, createdAt: string, updatedAt: string }> }> };

export type CreateRechargeBundleMutationVariables = Exact<{
  input: Types.RechargeBundleInput;
}>;


export type CreateRechargeBundleMutation = { createRechargeBundle: { id: string, name: string, amount: number, currencyCode: string, isActive: boolean, sortOrder: number, createdAt: string } };

export type UpdateRechargeBundleMutationVariables = Exact<{
  id: string | number;
  input: Types.RechargeBundleInput;
}>;


export type UpdateRechargeBundleMutation = { updateRechargeBundle: { id: string, name: string, amount: number, currencyCode: string, isActive: boolean, sortOrder: number } };

export type DeleteRechargeBundleMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteRechargeBundleMutation = { deleteRechargeBundle: boolean };

export type SetRechargeCostCenterMutationVariables = Exact<{
  costCenterId: string | number;
}>;


export type SetRechargeCostCenterMutation = { setRechargeCostCenter: boolean };

export type RechargeAccountsQueryVariables = Exact<{ [key: string]: never; }>;


export type RechargeAccountsQuery = { rechargeAccounts: { expenseAccountId: string | null, expenseAccountCode: string | null, expenseAccountName: string | null, fundingAccountId: string | null, fundingAccountCode: string | null, fundingAccountName: string | null } };

export type SetRechargeAccountsMutationVariables = Exact<{
  expenseAccountId?: string | number | null | undefined;
  fundingAccountId?: string | number | null | undefined;
}>;


export type SetRechargeAccountsMutation = { setRechargeAccounts: boolean };

export type CreateRechargeRequestMutationVariables = Exact<{
  input: Types.RechargeRequestInput;
}>;


export type CreateRechargeRequestMutation = { createRechargeRequest: { id: string, companyId: string, companyName: string | null, requestedBy: string | null, requestedByEmail: string | null, requestedForName: string | null, createdBy: string, createdByEmail: string | null, costCenterId: string, costCenterName: string | null, bundleId: string, bundleName: string | null, bundleAmount: number | null, bundleCurrencyCode: string | null, phoneNumber: string, notes: string | null, status: string, fulfilledBy: string | null, fulfilledByEmail: string | null, fulfilledAt: string | null, photoDownloadUrl: string | null, confirmedAt: string | null, photoPendingConfirmation: boolean, createdAt: string, updatedAt: string } };

export type CancelRechargeRequestMutationVariables = Exact<{
  id: string | number;
}>;


export type CancelRechargeRequestMutation = { cancelRechargeRequest: { id: string, companyId: string, companyName: string | null, requestedBy: string | null, requestedByEmail: string | null, requestedForName: string | null, createdBy: string, createdByEmail: string | null, costCenterId: string, costCenterName: string | null, bundleId: string, bundleName: string | null, bundleAmount: number | null, bundleCurrencyCode: string | null, phoneNumber: string, notes: string | null, status: string, fulfilledBy: string | null, fulfilledByEmail: string | null, fulfilledAt: string | null, photoDownloadUrl: string | null, confirmedAt: string | null, photoPendingConfirmation: boolean, createdAt: string, updatedAt: string } };

export type FulfillRechargeRequestMutationVariables = Exact<{
  id: string | number;
  fileId: string | number;
}>;


export type FulfillRechargeRequestMutation = { fulfillRechargeRequest: { id: string, companyId: string, companyName: string | null, requestedBy: string | null, requestedByEmail: string | null, requestedForName: string | null, createdBy: string, createdByEmail: string | null, costCenterId: string, costCenterName: string | null, bundleId: string, bundleName: string | null, bundleAmount: number | null, bundleCurrencyCode: string | null, phoneNumber: string, notes: string | null, status: string, fulfilledBy: string | null, fulfilledByEmail: string | null, fulfilledAt: string | null, photoDownloadUrl: string | null, confirmedAt: string | null, photoPendingConfirmation: boolean, createdAt: string, updatedAt: string } };

export type ConfirmRechargeReceiptMutationVariables = Exact<{
  id: string | number;
}>;


export type ConfirmRechargeReceiptMutation = { confirmRechargeReceipt: { id: string, companyId: string, companyName: string | null, requestedBy: string | null, requestedByEmail: string | null, requestedForName: string | null, createdBy: string, createdByEmail: string | null, costCenterId: string, costCenterName: string | null, bundleId: string, bundleName: string | null, bundleAmount: number | null, bundleCurrencyCode: string | null, phoneNumber: string, notes: string | null, status: string, fulfilledBy: string | null, fulfilledByEmail: string | null, fulfilledAt: string | null, photoDownloadUrl: string | null, confirmedAt: string | null, photoPendingConfirmation: boolean, createdAt: string, updatedAt: string } };

export type EquipmentAssetsQueryVariables = Exact<{
  status?: string | null | undefined;
  category?: string | null | undefined;
}>;


export type EquipmentAssetsQuery = { equipmentAssets: Array<{ id: string, asset_number: string, name: string, category: string | null, status: string, daily_rate: string, currency_code: string, total_hours: number | null, total_mileage: number | null, maintenance_status: string | null, condition_rating: number | null, last_maintenance_date: string | null, maintenance_due_hours: number | null }> };

export type EquipmentAssetQueryVariables = Exact<{
  id: string | number;
}>;


export type EquipmentAssetQuery = { equipmentAsset: { id: string, asset_number: string, name: string, description: string | null, category: string | null, serial_number: string | null, status: string, purchase_date: string | null, purchase_price: number | null, current_value: number | null, daily_rate: string, currency_code: string, total_hours: number | null, total_mileage: number | null, maintenance_due_hours: number | null, last_maintenance_date: string | null, maintenance_status: string | null, condition_rating: number | null, usageLogs: Array<{ id: string, usage_date: string, hours_used: number, mileage_km: number | null, operator_name: string, notes: string | null, created_at: string }> | null, maintenanceSchedules: Array<{ id: string, maintenance_type: string, scheduled_date: string, description: string | null, status: string, estimated_cost: number | null, assigned_to: string | null }> | null, conditionReports: Array<{ id: string, report_date: string, rating: number, checklist: unknown, notes: string | null, gps_lat: number | null, gps_lng: number | null, created_by_email: string | null, created_at: string }> | null } | null };

export type RentalContractsQueryVariables = Exact<{
  status?: string | null | undefined;
  projectId?: string | number | null | undefined;
}>;


export type RentalContractsQuery = { rentalContracts: Array<{ id: string, contract_number: string, rental_type: string, status: string, billing_cycle: string, rate_amount: string, start_date: string, client_name: string | null, asset_name: string | null, end_date: string | null, currency_code: string | null }> };

export type RentalContractQueryVariables = Exact<{
  id: string | number;
}>;


export type RentalContractQuery = { rentalContract: { id: string, contract_number: string, rental_type: string, status: string, billing_cycle: string, rate_amount: string, start_date: string, end_date: string | null, deposit_amount: number | null, currency_code: string | null, notes: string | null, client_name: string | null, client_contact: string | null, asset_id: string | null, asset_name: string | null, project_id: string | null, project_name: string | null, depreciation_method: string | null, depreciation_per_day: number | null, useful_life_days: number | null, salvage_value: number | null, usageLogs: Array<{ id: string, usage_date: string, hours_used: number, mileage_km: number | null, operator_name: string }> | null, invoices: Array<{ id: string, invoice_number: string, billing_period_start: string, billing_period_end: string, days_billed: number, total_amount: number, status: string, invoice_date: string, due_date: string }> | null } | null };

export type MaintenanceSchedulesQueryVariables = Exact<{
  assetId?: string | number | null | undefined;
  status?: string | null | undefined;
  fromDate?: string | null | undefined;
  toDate?: string | null | undefined;
}>;


export type MaintenanceSchedulesQuery = { maintenanceSchedules: Array<{ id: string, asset_id: string, asset_name: string | null, maintenance_type: string, scheduled_date: string, description: string | null, status: string, estimated_cost: number | null, assigned_to: string | null }> };

export type MaintenanceRecordsQueryVariables = Exact<{
  assetId?: string | number | null | undefined;
}>;


export type MaintenanceRecordsQuery = { maintenanceRecords: Array<{ id: string, asset_id: string, maintenance_type: string, performed_date: string, description: string, cost: number, performed_by: string, next_due_date: string | null, notes: string | null }> };

export type RentalInvoicesQueryVariables = Exact<{
  contractId?: string | number | null | undefined;
  status?: string | null | undefined;
}>;


export type RentalInvoicesQuery = { rentalInvoices: Array<{ id: string, invoice_number: string, billing_period_start: string, billing_period_end: string, days_billed: number, rate_amount: number, total_amount: number, whtApplies: boolean, whtScenario: string | null, whtRate: number, whtAmount: number, status: string, invoice_date: string, due_date: string, paid_at: string | null }> };

export type CreateEquipmentAssetMutationVariables = Exact<{
  input: Types.EquipmentAssetInput;
}>;


export type CreateEquipmentAssetMutation = { createEquipmentAsset: { id: string, asset_number: string, name: string, status: string } };

export type UpdateEquipmentAssetMutationVariables = Exact<{
  id: string | number;
  input: Types.EquipmentAssetInput;
}>;


export type UpdateEquipmentAssetMutation = { updateEquipmentAsset: { id: string, name: string, status: string } };

export type LogUsageMutationVariables = Exact<{
  input: Types.UsageLogInput;
}>;


export type LogUsageMutation = { logUsage: { id: string, usage_date: string, hours_used: number } };

export type ScheduleMaintenanceItemMutationVariables = Exact<{
  input: Types.MaintenanceScheduleInput;
}>;


export type ScheduleMaintenanceItemMutation = { scheduleMaintenanceItem: { id: string, maintenance_type: string, scheduled_date: string, status: string } };

export type RecordMaintenanceMutationVariables = Exact<{
  input: Types.MaintenanceRecordInput;
}>;


export type RecordMaintenanceMutation = { recordMaintenance: { id: string, performed_date: string, maintenance_type: string } };

export type SubmitConditionReportMutationVariables = Exact<{
  input: Types.ConditionReportInput;
}>;


export type SubmitConditionReportMutation = { submitConditionReport: { id: string, report_date: string, rating: number } };

export type CreateRentalContractMutationVariables = Exact<{
  input: Types.RentalContractInput;
}>;


export type CreateRentalContractMutation = { createRentalContract: { id: string, contract_number: string, status: string } };

export type UpdateRentalContractMutationVariables = Exact<{
  id: string | number;
  input: Types.RentalContractInput;
}>;


export type UpdateRentalContractMutation = { updateRentalContract: { id: string, status: string } };

export type ActivateRentalContractMutationVariables = Exact<{
  id: string | number;
}>;


export type ActivateRentalContractMutation = { activateRentalContract: { id: string, status: string } };

export type CloseRentalContractMutationVariables = Exact<{
  id: string | number;
  notes?: string | null | undefined;
}>;


export type CloseRentalContractMutation = { closeRentalContract: { id: string, status: string } };

export type GenerateRentalInvoiceMutationVariables = Exact<{
  contractId: string | number;
  periodStart: string;
  periodEnd: string;
  whtApplies?: boolean | null | undefined;
  whtScenario?: string | null | undefined;
  whtRate?: number | null | undefined;
}>;


export type GenerateRentalInvoiceMutation = { generateRentalInvoice: { id: string, invoice_number: string, days_billed: number, total_amount: number, whtApplies: boolean, whtScenario: string | null, whtRate: number, whtAmount: number, status: string } };

export type OverdueMaintenanceCountQueryVariables = Exact<{ [key: string]: never; }>;


export type OverdueMaintenanceCountQuery = { overdueMaintenanceCount: number };

export type ExecutiveDashboardQueryVariables = Exact<{ [key: string]: never; }>;


export type ExecutiveDashboardQuery = { executiveDashboard: { totalRevenue: number, totalCosts: number, netProfit: number, activeProjects: number, totalProjectBudget: number, totalHeadcount: number, openPOsValue: number, revenueTrend: Array<{ period: string, value: number }>, costsTrend: Array<{ period: string, value: number }>, profitTrend: Array<{ period: string, value: number }>, entityBreakdown: Array<{ companyId: string, companyName: string, revenueThisMonth: number, costThisMonth: number, netThisMonth: number, headcount: number }>, revenueByEntityMonthly: Array<{ month: string, yakam: number, factory: number, watanyia: number }>, projectProfitabilityScatter: Array<{ id: string, name: string, budget: number, marginPct: number, actualCost: number, status: string, client_name: string | null }> } };

export type ConsolidatedPlQueryVariables = Exact<{
  fromDate: string;
  toDate: string;
  showEliminations?: boolean | null | undefined;
}>;


export type ConsolidatedPlQuery = { consolidatedPL: { currency: string, totalRevenue: number, totalExpenses: number, netProfit: number, rows: Array<{ accountType: string, accountCode: string, accountName: string, companies: unknown, consolidated: number, eliminated: number }>, companies: Array<{ id: string, name: string }> } };

export type ConsolidatedBsQueryVariables = Exact<{
  asOfDate: string;
  showEliminations?: boolean | null | undefined;
}>;


export type ConsolidatedBsQuery = { consolidatedBS: { currency: string, totalAssets: number, totalLiabilities: number, totalEquity: number, isBalanced: boolean, rows: Array<{ accountType: string, accountCode: string, accountName: string, companies: unknown, consolidated: number, eliminated: number }>, companies: Array<{ id: string, name: string }> } };

export type ConsolidatedTrialBalanceQueryVariables = Exact<{
  asOfDate: string;
}>;


export type ConsolidatedTrialBalanceQuery = { consolidatedTrialBalance: { currency: string, totalDebits: number, totalCredits: number, isBalanced: boolean, rows: Array<{ accountType: string, accountCode: string, accountName: string, companies: unknown, consolidated: number, eliminated: number }>, companies: Array<{ id: string, name: string }> } };

export type ProjectProfitabilityReportQueryVariables = Exact<{
  companyId?: string | number | null | undefined;
  status?: Array<string | null | undefined> | string | null | undefined;
  projectType?: string | null | undefined;
  fromDate?: string | null | undefined;
  toDate?: string | null | undefined;
}>;


export type ProjectProfitabilityReportQuery = { projectProfitabilityReport: Array<{ id: string, code: string, name: string, projectType: string | null, companyName: string, budget: number, actualCost: number, revenue: number, margin: number, marginPct: number, status: string, costBreakdown: Array<{ key: string, label: string, amount: number }> }> };

export type PayrollCostReportQueryVariables = Exact<{
  fromDate: string;
  toDate: string;
  companyId?: string | number | null | undefined;
  departmentId?: string | number | null | undefined;
}>;


export type PayrollCostReportQuery = { payrollCostReport: { totalHeadcount: number, totalGross: number, totalNet: number, totalEmployerCost: number, avgCostPerEmployee: number, rows: Array<{ companyName: string, costCenter: string | null, period: string, headcount: number, totalGross: number, totalNet: number, totalIQD: number }>, byCurrency: Array<{ currency: string, amount: number, fxRate: number, iqdEquivalent: number }>, monthlyTrend: Array<{ month: string, yakam: number | null, factory: number | null, watanyia: number | null }> } };

export type AttendanceSummaryReportQueryVariables = Exact<{
  fromDate: string;
  toDate: string;
  companyId?: string | number | null | undefined;
}>;


export type AttendanceSummaryReportQuery = { attendanceSummaryReport: { totalEmployees: number, avgAttendancePct: number, rows: Array<{ employeeName: string, employeeNumber: string, department: string | null, totalPresent: number, totalAbsent: number, totalLeave: number, totalOvertime: number, attendancePct: number }> } };

export type InventoryValuationReportQueryVariables = Exact<{
  asOfDate: string;
  companyId?: string | number | null | undefined;
  locationId?: string | number | null | undefined;
}>;


export type InventoryValuationReportQuery = { inventoryValuationReport: { totalValue: number, totalProducts: number, totalLocations: number, lowStockItems: number, rows: Array<{ productName: string, sku: string | null, locationName: string, locationType: string, qtyOnHand: number, avgCost: number, totalValue: number, currency: string }>, byLocation: Array<{ locationName: string, locationType: string, totalValue: number }> } };

export type WhtReportQueryVariables = Exact<{
  fromDate: string;
  toDate: string;
  companyId: string | number;
}>;


export type WhtReportQuery = { whtReport: { totalWHT: number, vendorCount: number, totalPaymentsSubjectToWHT: number, rows: Array<{ vendorName: string, taxId: string | null, whtType: string, rate: number, paymentAmount: number, whtAmount: number, period: string }> } };

export type FxExposureReportQueryVariables = Exact<{
  asOfDate: string;
  companyId: string | number;
}>;


export type FxExposureReportQuery = { fxExposureReport: { totalIQDExposure: number, rows: Array<{ currency: string, openAR: number, openAP: number, netExposure: number, fxRate: number, iqdEquivalent: number }> } };

export type PayrollTaxReportQueryVariables = Exact<{
  fromDate: string;
  toDate: string;
  companyId: string | number;
}>;


export type PayrollTaxReportQuery = { payrollTaxReport: { rows: Array<{ employeeName: string, employeeNumber: string, period: string, grossPay: number, taxableIncome: number, incomeTaxWithheld: number, socialSecurity: number, netPay: number }> } };

export type CreateRequisitionMutationVariables = Exact<{
  input: Types.RequisitionInput;
}>;


export type CreateRequisitionMutation = { createRequisition: { id: string, requisition_number: string, status: string } };

export type RequisitionStockAvailabilityQueryVariables = Exact<{
  requisitionId: string | number;
}>;


export type RequisitionStockAvailabilityQuery = { requisitionStockAvailability: Array<{ lineId: string, qtyRequired: number, qtyOnHand: number, qtyAvailable: number, isAvailable: boolean, byLocation: Array<{ companyId: string, companyName: string, locationId: string, locationName: string, qtyOnHand: number, qtyAvailable: number }> }> };

export type RequisitionLineProductAvailabilityQueryVariables = Exact<{
  requisitionId: string | number;
  overrides: Array<Types.LineProductOverrideInput> | Types.LineProductOverrideInput;
}>;


export type RequisitionLineProductAvailabilityQuery = { requisitionLineProductAvailability: Array<{ lineId: string, productId: string | null, productName: string | null, productNameAr: string | null, qtyRequired: number, qtyOnHand: number, qtyAvailable: number, isAvailable: boolean, byLocation: Array<{ companyId: string, companyName: string, locationId: string, locationName: string, qtyOnHand: number, qtyAvailable: number }> }> };

export type RequisitionQueryVariables = Exact<{
  id: string | number;
}>;


export type RequisitionQuery = { requisition: { id: string, requisition_number: string, status: string, priority: string | null, purpose: string | null, delivery_destination: string | null, project_id: string | null, projectName: string | null, projectCode: string | null, linked_mo_id: string | null, linkedMoNumber: string | null, branch_id: string | null, branch_name: string | null, organizer_id: string | null, organizerName: string | null, assigned_approver_id: string | null, assigned_receiver_id: string | null, assigned_receiver_name: string | null, notes: string | null, expected_delivery_date: string | null, created_at: string, updated_at: string, callerHasStoreKeeperPosition: boolean | null, callerHasStorePricingPosition: boolean | null, callerHasMarketPricingPosition: boolean | null, callerHasPriceVerificationPosition: boolean | null, callerHasBuyerPosition: boolean | null, callerCanApprove: boolean | null, currencyTotals: Array<{ currency_code: string, subtotal: string, line_count: number }>, lines: Array<{ id: string, description: string | null, product_id: string | null, product_name: string | null, product_name_ar: string | null, sku: string | null, qty: string, uom: string | null, currency_code: string | null, unit_price: string, initial_unit_price: string | null, qty_from_stock: string | null, source_location_id: string | null, source_location_name: string | null, source_average_cost: number | null, store_price: string | null, store_price_currency: string | null, market_price: string | null, market_price_currency: string | null, verified_price: string | null, verified_price_currency: string | null, total: string, qty_received: string | null, actual_unit_price: string | null, short_reason: string | null, short_marked_at: string | null, closed_at: string | null, closed_reason: string | null, flag_reason: string | null, flagged_at: string | null, flagged_by_name: string | null, flagged_from_status: string | null, flag_addressed_at: string | null, flag_resolved_at: string | null, flag_resolved_by_name: string | null, purchases: Array<{ id: string, vendor_id: string, vendor_name: string | null, currency_code: string, qty: string, actual_unit_price: string, bought_at: string, over_tolerance: boolean }> | null }> | null, approval_log: Array<{ id: string, from_status: string, to_status: string, action: string, actor_id: string, actor_name: string | null, actor_position: string | null, notes: string | null, created_at: string }> | null, edit_requests: Array<{ id: string, status: string, changes: string, request_notes: string | null, requested_by_email: string | null, reviewed_by_email: string | null, review_notes: string | null, reviewed_at: string | null, created_at: string }> | null } | null };

export type SubmitRequisitionEditRequestMutationVariables = Exact<{
  requisitionId: string | number;
  changes: string;
  notes?: string | null | undefined;
}>;


export type SubmitRequisitionEditRequestMutation = { submitPOEditRequest: { id: string, status: string, created_at: string, requested_by_email: string | null } };

export type ApproveRequisitionEditRequestMutationVariables = Exact<{
  requisitionId: string | number;
  requestId: string | number;
  reviewNotes?: string | null | undefined;
}>;


export type ApproveRequisitionEditRequestMutation = { approvePOEditRequest: { id: string, status: string, reviewed_at: string | null, reviewed_by_email: string | null, review_notes: string | null } };

export type RejectRequisitionEditRequestMutationVariables = Exact<{
  requisitionId: string | number;
  requestId: string | number;
  reviewNotes: string;
}>;


export type RejectRequisitionEditRequestMutation = { rejectPOEditRequest: { id: string, status: string, reviewed_at: string | null, reviewed_by_email: string | null, review_notes: string | null } };

export type RequisitionChildPurchaseOrdersQueryVariables = Exact<{
  requisitionId: string | number;
}>;


export type RequisitionChildPurchaseOrdersQuery = { requisitionChildPurchaseOrders: Array<{ id: string, po_number: string, status: string, vendor_id: string | null, vendor_name: string | null, total_amount: string, currency_code: string, created_at: string }> };

export type SubmitRequisitionToInventoryCheckMutationVariables = Exact<{
  id: string | number;
  notes?: string | null | undefined;
}>;


export type SubmitRequisitionToInventoryCheckMutation = { submitRequisitionToInventoryCheck: { id: string, status: string } };

export type ConfirmRequisitionInventoryCheckMutationVariables = Exact<{
  id: string | number;
  lineStockQtys: Array<Types.StockConfirmLineInput> | Types.StockConfirmLineInput;
  notes?: string | null | undefined;
}>;


export type ConfirmRequisitionInventoryCheckMutation = { confirmRequisitionInventoryCheck: { id: string, status: string } };

export type SubmitRequisitionStorePricingMutationVariables = Exact<{
  id: string | number;
  linePrices?: Array<Types.RequisitionStorePriceInput> | Types.RequisitionStorePriceInput | null | undefined;
}>;


export type SubmitRequisitionStorePricingMutation = { submitRequisitionStorePricing: { id: string, status: string } };

export type SubmitRequisitionMarketPricingMutationVariables = Exact<{
  id: string | number;
  linePrices?: Array<Types.RequisitionMarketPriceInput> | Types.RequisitionMarketPriceInput | null | undefined;
}>;


export type SubmitRequisitionMarketPricingMutation = { submitRequisitionMarketPricing: { id: string, status: string } };

export type VerifyRequisitionPricesMutationVariables = Exact<{
  id: string | number;
  verificationNotes?: string | null | undefined;
  lineAdjustments?: Array<Types.RequisitionPriceVerificationAdjustment> | Types.RequisitionPriceVerificationAdjustment | null | undefined;
}>;


export type VerifyRequisitionPricesMutation = { verifyRequisitionPrices: { id: string, status: string } };

export type RejectRequisitionVerificationToMarketPricingMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectRequisitionVerificationToMarketPricingMutation = { rejectRequisitionVerificationToMarketPricing: { id: string, status: string } };

export type RejectRequisitionVerificationToStorePricingMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectRequisitionVerificationToStorePricingMutation = { rejectRequisitionVerificationToStorePricing: { id: string, status: string } };

export type ResetRequisitionToDraftMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type ResetRequisitionToDraftMutation = { resetRequisitionToDraft: { id: string, status: string } };

export type RejectRequisitionVerificationToInventoryCheckMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectRequisitionVerificationToInventoryCheckMutation = { rejectRequisitionVerificationToInventoryCheck: { id: string, status: string } };

export type ApproveRequisitionMutationVariables = Exact<{
  id: string | number;
}>;


export type ApproveRequisitionMutation = { approveRequisition: { id: string, status: string } };

export type RejectRequisitionApprovalMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectRequisitionApprovalMutation = { rejectRequisitionApproval: { id: string, status: string } };

export type RejectRequisitionToMarketPricingMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectRequisitionToMarketPricingMutation = { rejectRequisitionToMarketPricing: { id: string, status: string } };

export type RejectRequisitionToInventoryCheckMutationVariables = Exact<{
  id: string | number;
  reason: string;
  lineFlags: Array<Types.LineFlagInput> | Types.LineFlagInput;
}>;


export type RejectRequisitionToInventoryCheckMutation = { rejectRequisitionToInventoryCheck: { id: string, status: string } };

export type CancelRequisitionMutationVariables = Exact<{
  id: string | number;
  reason?: string | null | undefined;
}>;


export type CancelRequisitionMutation = { cancelRequisition: { id: string, status: string } };

export type RequisitionsQueryVariables = Exact<{
  status?: string | null | undefined;
  projectId?: string | number | null | undefined;
  branchId?: string | number | null | undefined;
  myQueueOnly?: boolean | null | undefined;
}>;


export type RequisitionsQuery = { requisitions: Array<{ id: string, requisition_number: string, status: string, priority: string | null, purpose: string | null, delivery_destination: string | null, project_id: string | null, projectName: string | null, projectCode: string | null, branch_id: string | null, branch_name: string | null, organizer_id: string | null, organizerName: string | null, notes: string | null, expected_delivery_date: string | null, created_at: string, updated_at: string, itemSearchText: string | null }> };

export type RequisitionItemsBoughtQueryVariables = Exact<{
  id: string | number;
}>;


export type RequisitionItemsBoughtQuery = { requisition: { id: string, requisition_number: string, status: string, callerHasBuyerPosition: boolean | null, callerCanApprove: boolean | null, lines: Array<{ id: string, description: string | null, product_id: string | null, product_name: string | null, product_name_ar: string | null, sku: string | null, qty: string, uom: string | null, currency_code: string | null, unit_price: string, approved_unit_price: string | null, qty_from_stock: string | null, short_reason: string | null, short_marked_by: string | null, short_marked_at: string | null, account_id: string | null, account_code: string | null, account_name: string | null, cost_center_id: string | null, cost_center_name: string | null, purchases: Array<{ id: string, vendor_id: string, vendor_name: string | null, currency_code: string, qty: string, actual_unit_price: string, bought_by: string | null, bought_by_name: string | null, bought_at: string, over_tolerance: boolean, tolerance_approved_by: string | null, tolerance_approved_by_name: string | null, receipt_file_id: string | null, receipt_filename: string | null }> | null }> | null } | null };

export type RecordLinePurchaseMutationVariables = Exact<{
  input: Types.RecordLinePurchaseInput;
}>;


export type RecordLinePurchaseMutation = { recordLinePurchase: { id: string, po_line_id: string, vendor_id: string, vendor_name: string | null, currency_code: string, qty: string, actual_unit_price: string, bought_by: string | null, bought_by_name: string | null, bought_at: string, over_tolerance: boolean, tolerance_approved_by: string | null, receipt_file_id: string | null, receipt_filename: string | null } };

export type ApproveTolerancePurchaseMutationVariables = Exact<{
  purchaseId: string | number;
}>;


export type ApproveTolerancePurchaseMutation = { approveTolerancePurchase: { id: string, tolerance_approved_by: string | null, tolerance_approved_by_name: string | null } };

export type MarkRequisitionLineShortMutationVariables = Exact<{
  lineId: string | number;
  reason: string;
}>;


export type MarkRequisitionLineShortMutation = { markRequisitionLineShort: { id: string, short_reason: string | null, short_marked_at: string | null } };

export type FinishBuyingRequisitionMutationVariables = Exact<{
  id: string | number;
}>;


export type FinishBuyingRequisitionMutation = { finishBuyingRequisition: { id: string, status: string } };

export type EnsureCashPurchaseVendorMutationVariables = Exact<{ [key: string]: never; }>;


export type EnsureCashPurchaseVendorMutation = { ensureCashPurchaseVendor: { id: string, name: string, is_cash_purchase: boolean } };

export type MyRequisitionApprovalQueueQueryVariables = Exact<{ [key: string]: never; }>;


export type MyRequisitionApprovalQueueQuery = { myRequisitionApprovalQueue: Array<{ id: string, requisition_number: string, status: string, priority: string | null, purpose: string | null, project_id: string | null, projectName: string | null, branch_id: string | null, branch_name: string | null, organizer_id: string | null, organizerName: string | null, created_at: string, updated_at: string }> };

export type MyProfileQueryVariables = Exact<{ [key: string]: never; }>;


export type MyProfileQuery = { myProfile: { id: string, email: string, mfaEnabled: boolean, lastLogin: string | null, createdAt: string } };

export type MyPreferencesQueryVariables = Exact<{ [key: string]: never; }>;


export type MyPreferencesQuery = { myPreferences: { themePreference: string | null, dateFormat: string | null, numberFormat: string | null, notificationPreferences: unknown } };

export type MySessionsQueryVariables = Exact<{ [key: string]: never; }>;


export type MySessionsQuery = { mySessions: Array<{ id: string, deviceName: string | null, platform: string | null, ipAddress: string, createdAt: string, lastActive: string | null, isCurrent: boolean }> };

export type UpdatePasswordMutationVariables = Exact<{
  currentPassword: string;
  newPassword: string;
}>;


export type UpdatePasswordMutation = { updatePassword: boolean };

export type UpdatePreferencesMutationVariables = Exact<{
  input: Types.PreferencesInput;
}>;


export type UpdatePreferencesMutation = { updatePreferences: { themePreference: string | null, dateFormat: string | null, numberFormat: string | null, notificationPreferences: unknown } };

export type EnableMfaMutationVariables = Exact<{ [key: string]: never; }>;


export type EnableMfaMutation = { enableMFA: { secret: string, otpauthUrl: string } };

export type ConfirmMfaMutationVariables = Exact<{
  totpCode: string;
}>;


export type ConfirmMfaMutation = { confirmMFA: boolean };

export type DisableMfaMutationVariables = Exact<{
  password: string;
}>;


export type DisableMfaMutation = { disableMFA: boolean };

export type RevokeMySessionMutationVariables = Exact<{
  sessionId: string | number;
}>;


export type RevokeMySessionMutation = { revokeMySession: boolean };

export type RevokeAllMySessionsMutationVariables = Exact<{ [key: string]: never; }>;


export type RevokeAllMySessionsMutation = { revokeAllMySessions: boolean };
