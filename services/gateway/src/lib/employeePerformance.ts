// What an employee's Performance tab shows: how their requisitions fared at each approval, whose work was sent back, how Finance
// judged their purchase orders, what happened to the claims they filed and, for people who approve things, how fast they answer.
//
// Nothing is stored for this. Every figure is read from the logs the documents already keep (requisition_approval_log,
// po_approval_log, the claim and advance tables) each time the tab opens, so a past month needs no backfill and the tab can
// never disagree with the log. Every query is scoped to the caller's company (tenancy: joins count too).
//
// Two rules decide who gets the blame, and both are written once here:
//  * A requisition that was sent back is counted against its ORGANIZER in the "their requisitions" section (it is theirs).
//  * In "their work that others sent back", a rejection is credited to whoever did the step that was rejected: the actor of the
//    latest earlier log row that moved the requisition INTO the status the rejection came from (see CREDITED_STEP_SQL).
//    Rows that leave a status where they entered it (edit_applied, review_*) are not steps and are skipped.
import { query } from '@fnc-erp/db'

/** The periods the tab offers, in days. `null` (omitted) means all time. */
export const PERFORMANCE_PERIODS = [30, 90, 365] as const

export function normalizePerformanceDays(days: number | null | undefined): number | null {
  if (days === null || days === undefined || days === 0) return null
  if (!(PERFORMANCE_PERIODS as readonly number[]).includes(days)) {
    throw new Error('days must be 30, 90 or 365, or left out for all time')
  }
  return days
}

/**
 * Requisition log actions that send a requisition back, and the place each one sends it to. `send_back_to_buying` is the organizer
 * sending it back to the buyers himself, so it is deliberately not here: it is not a rejection of the organizer.
 * `reopen_review` is Finance returning a purchase order to the organizer's review (playbook #129).
 */
export const SEND_BACK_STAGE_BY_ACTION: Readonly<Record<string, string>> = {
  reject_to_inventory_check: 'inventory_check',
  reject_verification_to_store_pricing: 'store_pricing',
  reject_to_market_pricing: 'market_pricing',
  reject_verification_to_market_pricing: 'market_pricing',
  reject: 'draft',
  reset_to_draft: 'draft',
  reject_review: 'organizer_review',
  reopen_review: 'finance_return',
}
export const SEND_BACK_ACTIONS = Object.keys(SEND_BACK_STAGE_BY_ACTION)

/** Stages in the order the tab lists them. */
export const SEND_BACK_STAGE_ORDER = [
  'draft',
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'organizer_review',
  'finance_return',
] as const

/** What a rejection says about the step that was rejected, keyed by the status it was rejected from. */
export const WORK_KEY_BY_REJECTED_FROM: Readonly<Record<string, string>> = {
  price_verification: 'pricing_rejected',
  pending_approval: 'verification_rejected',
  review_approval: 'review_rejected',
}
export const WORK_KEY_ORDER = [
  'pricing_rejected',
  'verification_rejected',
  'review_rejected',
  'over_tolerance',
  'lines_flagged',
  'audit_returned',
] as const

export interface SendBackEvent {
  action: string
  requisitionId: string
  number: string
  note: string | null
}
export interface StageCount {
  key: string
  count: number
  examples: { number: string; note: string | null }[]
}

/** Group send-back events by where they sent the requisition, in display order, with up to `max` examples each. Pure. */
export function groupSendBacks(events: SendBackEvent[], max = 5): StageCount[] {
  const byStage = new Map<string, StageCount>()
  for (const e of events) {
    const key = SEND_BACK_STAGE_BY_ACTION[e.action]
    if (!key) continue
    const slot = byStage.get(key) ?? { key, count: 0, examples: [] }
    slot.count += 1
    if (slot.examples.length < max) slot.examples.push({ number: e.number, note: e.note })
    byStage.set(key, slot)
  }
  return SEND_BACK_STAGE_ORDER.map((key) => byStage.get(key) ?? { key, count: 0, examples: [] })
}

export interface AuditRow {
  passed: boolean
  firstPass: Date | string | null
  firstReturn: Date | string | null
}
export interface AuditSummary {
  passedFirst: number
  returned: number
  passedAfterReturn: number
}

/** How Finance judged each purchase order that reached an audit decision. A PO that passed with no earlier return passed first time. Pure. */
export function summariseAudit(rows: AuditRow[]): AuditSummary {
  const out: AuditSummary = { passedFirst: 0, returned: 0, passedAfterReturn: 0 }
  for (const r of rows) {
    const pass = r.firstPass ? new Date(r.firstPass).getTime() : null
    const ret = r.firstReturn ? new Date(r.firstReturn).getTime() : null
    if (r.passed && pass !== null) {
      if (ret !== null && ret < pass) out.passedAfterReturn += 1
      else out.passedFirst += 1
    } else if (ret !== null) {
      out.returned += 1
    }
  }
  return out
}

/** The last `n` calendar months (UTC) up to and including `now`'s, oldest first, as 'YYYY-MM'. Pure. */
export function lastMonths(now: Date, n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export interface TrendPoint {
  month: string
  total: number
  sentBack: number
}

/** Put the months the database returned on the full list of months, with zeros for the quiet ones. Pure. */
export function fillTrend(
  months: string[],
  rows: { month: string; total: number; sentBack: number }[],
): TrendPoint[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]))
  return months.map((month) => {
    const r = byMonth.get(month)
    return { month, total: r?.total ?? 0, sentBack: r?.sentBack ?? 0 }
  })
}

export interface PerformanceArgs {
  companyId: string
  employeeId: string
  /** The employee's login. Requisition and approval logs are keyed by user, not by employee. Null when not linked. */
  userId: string | null
  days: number | null
  now?: Date
}

export interface EmployeePerformanceResult {
  employeeId: string
  linked: boolean
  days: number | null
  since: string | null
  requisitions: {
    organized: number
    completed: number
    inProgress: number
    cancelled: number
    sentBack: number
  }
  sentBackStages: StageCount[]
  workSentBack: { key: string; count: number }[]
  trend: TrendPoint[]
  audit: AuditSummary
  claims: { key: string; filed: number; rejected: number }[]
  approver: { key: string; approved: number; sentBack: number; medianHours: number | null }[]
}

/**
 * $1 requisition company, $2 log action list. The latest log row that moved the requisition into the status the rejection came from.
 * A row whose from and to are the same is an edit or a review note, not a step, so it never counts as "the step that was rejected".
 */
const CREDITED_STEP_SQL = `
  LEFT JOIN LATERAL (
    SELECT p.actor_id, p.created_at
      FROM requisition_approval_log p
     WHERE p.requisition_id = l.requisition_id
       AND p.to_status = l.from_status
       AND p.from_status <> p.to_status
       AND p.created_at <= l.created_at
       AND p.id <> l.id
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT 1
  ) prev ON true`

const num = (v: unknown): number => Number(v ?? 0)

export async function loadEmployeePerformance(
  a: PerformanceArgs,
): Promise<EmployeePerformanceResult> {
  const now = a.now ?? new Date()
  const since = a.days === null ? null : new Date(now.getTime() - a.days * 24 * 3600 * 1000)
  const empty: EmployeePerformanceResult = {
    employeeId: a.employeeId,
    linked: a.userId !== null,
    days: a.days,
    since: since ? since.toISOString() : null,
    requisitions: { organized: 0, completed: 0, inProgress: 0, cancelled: 0, sentBack: 0 },
    sentBackStages: groupSendBacks([]),
    workSentBack: WORK_KEY_ORDER.map((key) => ({ key, count: 0 })),
    trend: [],
    audit: { passedFirst: 0, returned: 0, passedAfterReturn: 0 },
    claims: [
      { key: 'expense_claim', filed: 0, rejected: 0 },
      { key: 'advance_request', filed: 0, rejected: 0 },
    ],
    approver: [],
  }

  // Claims and advances belong to the EMPLOYEE record, so they are read even when no login is linked.
  const claimFiled = `(x.submitted_at IS NOT NULL OR x.status <> 'draft')`
  const claimWhen = `COALESCE(x.submitted_at, x.created_at)`
  const [ec, ea] = await Promise.all([
    query(
      `SELECT count(*) FILTER (WHERE ${claimFiled}) AS filed,
              count(*) FILTER (WHERE ${claimFiled} AND (x.rejected_at IS NOT NULL OR x.status = 'rejected')) AS rejected
         FROM expense_claims x
        WHERE x.company_id = $1 AND x.employee_id = $2 AND ($3::timestamptz IS NULL OR ${claimWhen} >= $3)`,
      [a.companyId, a.employeeId, since],
    ),
    query(
      `SELECT count(*) FILTER (WHERE ${claimFiled}) AS filed,
              count(*) FILTER (WHERE ${claimFiled} AND (x.rejected_at IS NOT NULL OR x.status = 'rejected')) AS rejected
         FROM employee_advances x
        WHERE x.company_id = $1 AND x.employee_id = $2 AND ($3::timestamptz IS NULL OR ${claimWhen} >= $3)`,
      [a.companyId, a.employeeId, since],
    ),
  ])
  empty.claims = [
    { key: 'expense_claim', filed: num(ec.rows[0]?.filed), rejected: num(ec.rows[0]?.rejected) },
    { key: 'advance_request', filed: num(ea.rows[0]?.filed), rejected: num(ea.rows[0]?.rejected) },
  ]
  if (a.userId === null) return empty
  const userId = a.userId

  const trendMonths = lastMonths(now, a.days === 30 || a.days === 90 ? 6 : 12)

  const [orgs, sends, work, tol, flagged, audit, trend, appReq, appExp, appAdv] = await Promise.all(
    [
      // Requisitions they organized (the cohort: created in the period).
      query(
        `SELECT count(*) AS organized,
              count(*) FILTER (WHERE r.status = 'completed') AS completed,
              count(*) FILTER (WHERE r.status = 'cancelled') AS cancelled
         FROM requisitions r
        WHERE r.company_id = $1 AND r.organizer_id = $2 AND r.status <> 'deleted'
          AND ($3::timestamptz IS NULL OR r.created_at >= $3)`,
        [a.companyId, userId, since],
      ),
      // Every send-back of those requisitions, whenever it happened.
      query(
        `SELECT l.action, l.requisition_id, r.requisition_number AS number, l.notes
         FROM requisitions r
         JOIN requisition_approval_log l ON l.requisition_id = r.id
        WHERE r.company_id = $1 AND r.organizer_id = $2 AND r.status <> 'deleted'
          AND ($3::timestamptz IS NULL OR r.created_at >= $3)
          AND l.action = ANY($4::text[])
        ORDER BY l.created_at DESC, l.id DESC`,
        [a.companyId, userId, since, SEND_BACK_ACTIONS],
      ),
      // Rejections credited to the person who did the rejected step, in the period.
      query(
        `SELECT l.from_status, count(*) AS n
         FROM requisition_approval_log l
         JOIN requisitions r ON r.id = l.requisition_id AND r.company_id = $1
         ${CREDITED_STEP_SQL}
        WHERE l.action = ANY($2::text[]) AND l.action <> 'reopen_review'
          AND prev.actor_id = $3
          AND ($4::timestamptz IS NULL OR l.created_at >= $4)
        GROUP BY l.from_status`,
        [a.companyId, SEND_BACK_ACTIONS, userId, since],
      ),
      // Purchases they recorded that were over the approved price plus tolerance.
      query(
        `SELECT count(*) AS n
         FROM po_line_purchases plp
         JOIN po_lines pl ON pl.id = plp.po_line_id
         JOIN requisitions r ON r.id = pl.requisition_id
        WHERE r.company_id = $1 AND plp.bought_by = $2 AND plp.over_tolerance = true
          AND ($3::timestamptz IS NULL OR plp.bought_at >= $3)`,
        [a.companyId, userId, since],
      ),
      // Lines an approver flagged on their requisitions.
      query(
        `SELECT count(*) AS n
         FROM po_lines pl
         JOIN requisitions r ON r.id = pl.requisition_id
        WHERE r.company_id = $1 AND r.organizer_id = $2 AND r.status <> 'deleted'
          AND pl.flagged_at IS NOT NULL
          AND ($3::timestamptz IS NULL OR pl.flagged_at >= $3)`,
        [a.companyId, userId, since],
      ),
      // Finance's decisions on purchase orders they organize.
      query(
        `SELECT bool_or(l.action = 'pass_audit') AS passed,
              min(l.created_at) FILTER (WHERE l.action = 'pass_audit') AS first_pass,
              min(l.created_at) FILTER (WHERE l.action <> 'pass_audit') AS first_return
         FROM purchase_orders po
         JOIN po_approval_log l ON l.po_id = po.id
        WHERE po.company_id = $1 AND po.organizer_id = $2 AND po.status <> 'deleted'
          AND ($3::timestamptz IS NULL OR po.created_at >= $3)
          AND l.action IN ('pass_audit', 'fail_audit', 'return_to_organizer')
        GROUP BY po.id`,
        [a.companyId, userId, since],
      ),
      // Sent-back rate by month the requisition was created.
      query(
        `SELECT to_char(date_trunc('month', r.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
              count(*) AS total,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM requisition_approval_log l WHERE l.requisition_id = r.id AND l.action = ANY($4::text[])
              )) AS sent_back
         FROM requisitions r
        WHERE r.company_id = $1 AND r.organizer_id = $2 AND r.status <> 'deleted'
          AND r.created_at >= $3::timestamptz
        GROUP BY 1`,
        [
          a.companyId,
          userId,
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (trendMonths.length - 1), 1)),
          SEND_BACK_ACTIONS,
        ],
      ),
      // As an approver: requisitions (decisions and how long each waited), then claims, then advance requests.
      query(
        `SELECT count(*) FILTER (WHERE l.action IN ('approve', 'approve_review')) AS approved,
              count(*) FILTER (WHERE l.action = ANY($2::text[])) AS sent_back,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l.created_at - prev.created_at)) / 3600.0)
                FILTER (WHERE prev.created_at IS NOT NULL) AS median_hours
         FROM requisition_approval_log l
         JOIN requisitions r ON r.id = l.requisition_id AND r.company_id = $1
         ${CREDITED_STEP_SQL}
        WHERE l.actor_id = $3
          -- a Finance return (reopen_review) is Finance's decision about a purchase, not this person's send-back
          AND (l.action IN ('approve', 'approve_review') OR (l.action = ANY($2::text[]) AND l.action <> 'reopen_review'))
          AND ($4::timestamptz IS NULL OR l.created_at >= $4)`,
        [a.companyId, SEND_BACK_ACTIONS, userId, since],
      ),
      query(
        `SELECT count(*) FILTER (WHERE x.approved_by = $2 AND ($3::timestamptz IS NULL OR x.approved_at >= $3)) AS approved,
              count(*) FILTER (WHERE x.rejected_by = $2 AND ($3::timestamptz IS NULL OR x.rejected_at >= $3)) AS sent_back,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (
                CASE WHEN x.approved_by = $2 THEN x.approved_at ELSE x.rejected_at END - x.submitted_at)) / 3600.0)
                FILTER (WHERE x.submitted_at IS NOT NULL
                          AND ((x.approved_by = $2 AND ($3::timestamptz IS NULL OR x.approved_at >= $3))
                            OR (x.rejected_by = $2 AND ($3::timestamptz IS NULL OR x.rejected_at >= $3)))) AS median_hours
         FROM expense_claims x
        WHERE x.company_id = $1 AND (x.approved_by = $2 OR x.rejected_by = $2)`,
        [a.companyId, userId, since],
      ),
      query(
        `SELECT count(*) FILTER (WHERE x.approved_by = $2 AND ($3::timestamptz IS NULL OR x.approved_at >= $3)) AS approved,
              count(*) FILTER (WHERE x.rejected_by = $2 AND ($3::timestamptz IS NULL OR x.rejected_at >= $3)) AS sent_back,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (
                CASE WHEN x.approved_by = $2 THEN x.approved_at ELSE x.rejected_at END - x.submitted_at)) / 3600.0)
                FILTER (WHERE x.submitted_at IS NOT NULL
                          AND ((x.approved_by = $2 AND ($3::timestamptz IS NULL OR x.approved_at >= $3))
                            OR (x.rejected_by = $2 AND ($3::timestamptz IS NULL OR x.rejected_at >= $3)))) AS median_hours
         FROM employee_advances x
        WHERE x.company_id = $1 AND (x.approved_by = $2 OR x.rejected_by = $2)`,
        [a.companyId, userId, since],
      ),
    ],
  )

  const events: SendBackEvent[] = sends.rows.map((r) => ({
    action: String(r.action),
    requisitionId: String(r.requisition_id),
    number: String(r.number),
    note: (r.notes as string | null) ?? null,
  }))
  const organized = num(orgs.rows[0]?.organized)
  const completed = num(orgs.rows[0]?.completed)
  const cancelled = num(orgs.rows[0]?.cancelled)
  const distinctSentBack = new Set(events.map((e) => e.requisitionId)).size

  const rejectedByKey = new Map<string, number>()
  for (const r of work.rows) {
    const key = WORK_KEY_BY_REJECTED_FROM[String(r.from_status)]
    if (key) rejectedByKey.set(key, (rejectedByKey.get(key) ?? 0) + num(r.n))
  }
  const auditSummary = summariseAudit(
    audit.rows.map((r) => ({
      passed: r.passed === true,
      firstPass: r.first_pass as string | null,
      firstReturn: r.first_return as string | null,
    })),
  )
  const workCounts: Record<string, number> = {
    pricing_rejected: rejectedByKey.get('pricing_rejected') ?? 0,
    verification_rejected: rejectedByKey.get('verification_rejected') ?? 0,
    review_rejected: rejectedByKey.get('review_rejected') ?? 0,
    over_tolerance: num(tol.rows[0]?.n),
    lines_flagged: num(flagged.rows[0]?.n),
    audit_returned: auditSummary.returned + auditSummary.passedAfterReturn,
  }

  const approverRows = [
    { key: 'requisition', row: appReq.rows.at(0) },
    { key: 'expense_claim', row: appExp.rows.at(0) },
    { key: 'advance_request', row: appAdv.rows.at(0) },
  ]
    .map(({ key, row }) => ({
      key,
      approved: num(row?.approved),
      sentBack: num(row?.sent_back),
      medianHours:
        row?.median_hours === null || row?.median_hours === undefined
          ? null
          : Number(row.median_hours),
    }))
    .filter((r) => r.approved + r.sentBack > 0)

  return {
    ...empty,
    requisitions: {
      organized,
      completed,
      cancelled,
      inProgress: Math.max(organized - completed - cancelled, 0),
      sentBack: distinctSentBack,
    },
    sentBackStages: groupSendBacks(events),
    workSentBack: WORK_KEY_ORDER.map((key) => ({ key, count: workCounts[key] ?? 0 })),
    trend: fillTrend(
      trendMonths,
      trend.rows.map((r) => ({
        month: String(r.month),
        total: num(r.total),
        sentBack: num(r.sent_back),
      })),
    ),
    audit: auditSummary,
    approver: approverRows,
  }
}
