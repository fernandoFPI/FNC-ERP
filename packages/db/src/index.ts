export { pool, query, checkConnection } from './client.js'
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
  listDocumentSequences,
  upsertDocumentSequence,
  DOC_TYPES,
} from './document-sequence.js'
export type { DocumentSequence, DocType } from './document-sequence.js'
export {
  listPoFxRates,
  upsertPoFxRate,
  deletePoFxRate,
  setDefaultPoFxRate,
} from './po-fx-rate.js'
export type { PoFxRate } from './po-fx-rate.js'
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
