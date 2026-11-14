export { pool, query, checkConnection, firstRowOrThrow } from './client.js'
export { asyncHandler } from './async-handler.js'
export { buildHealthStatus, checkDatabase, checkRedis, checkOutbox } from './health.js'
export type { HealthStatus, CheckResult } from './health.js'
export {
  registerAttachmentRoutes,
  getAttachments,
  createAttachment,
  removeAttachment,
} from './attachments.js'
export type { EntityType, AttachmentRouteOptions } from './attachments.js'
export type { PoolClient, QueryResult } from './client.js'
export { withRLS, setRLSContext } from './rls.js'
export { withTransaction, withSystemTransaction, withIntercoTransaction } from './transaction.js'
export type { TransactionContext } from './transaction.js'
export { getSystemConfig } from './system-config.js'
export {
  nextDocumentNumber,
  nextDocumentNumberInTransaction,
  formatDocumentNumber,
  documentNumberPattern,
  listDocumentSequences,
  upsertDocumentSequence,
  DOC_TYPES,
  PRODUCT_CATEGORY_SKU_PREFIXES,
} from './document-sequence.js'
export type { DocumentSequence, DocType } from './document-sequence.js'
export { listPoFxRates, upsertPoFxRate, deletePoFxRate, setDefaultPoFxRate } from './po-fx-rate.js'
export type { PoFxRate } from './po-fx-rate.js'
export {
  listProductStoreCategories,
  getProductStoreCategoryPrefix,
  createProductStoreCategory,
  setProductStoreCategoryActive,
} from './product-store-category.js'
export type { ProductStoreCategory } from './product-store-category.js'
export {
  isEmailEnabled,
  listNotificationRouting,
  setNotificationRouting,
  NOTIFICATION_ROUTES,
} from './notification-routing.js'
export type { RoutingEntry, NotificationRouteKey } from './notification-routing.js'
export {
  startJobRun,
  finishJobRun,
  partialJobRun,
  failJobRun,
  recordCompletedJobRun,
  listJobRuns,
  getJobSummaries,
  JOB_NAMES,
} from './job-runs.js'
export type { JobRun, JobSummary } from './job-runs.js'
export {
  resolvePostingAccount,
  listCompanyPostingAccounts,
  upsertCompanyPostingAccount,
  deleteCompanyPostingAccount,
  PostingAccountNotConfiguredError,
  POSTING_ACCOUNT_ROLES,
} from './posting-accounts.js'
export type { PostingAccountRole, CompanyPostingAccount } from './posting-accounts.js'
export {
  getProjectCloseoutInvoiceState,
  summariseInvoiceStatusCounts,
  projectCloseoutBlocker,
  OPEN_INVOICE_STATUSES,
  PAID_INVOICE_STATUS,
  DEAD_INVOICE_STATUSES,
} from './projectCloseout.js'
export type { ProjectCloseoutInvoiceState } from './projectCloseout.js'
