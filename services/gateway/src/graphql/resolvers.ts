import { query, pool, getAttachments, createAttachment, removeAttachment, withTransaction } from '@fnc-erp/db'
import { env } from '@fnc-erp/config'
import { resolveTransferPrice } from '@fnc-erp/fx'
import { checkRateStaleness } from '@fnc-erp/fx/staleness'
import { generateUploadUrl, generateDownloadUrl, validateFile } from '@fnc-erp/storage'
import { projectStateMachine, poStateMachine } from '@fnc-erp/workflow'
import type { POStatus, POAction } from '@fnc-erp/workflow'
import { logAudit } from '@fnc-erp/audit'
import { generateMFASecret, verifyMFAToken, encrypt, decrypt, verifyPassword, hashPassword } from '@fnc-erp/auth'

// ── System health cache (refreshes every 5s server-side) ────────
type HealthEntry = {
  service: string; status: string; latencyMs: number
  checks: { database: string; redis: string; outbox: string }
  uptime: number; lastChecked: string
}
let healthCache: HealthEntry[] = []

async function fetchAllHealth(): Promise<HealthEntry[]> {
  const serviceUrls: Record<string, string> = {
    auth:          env.AUTH_SERVICE_URL,
    finance:       env.FINANCE_SERVICE_URL,
    procurement:   env.PROCUREMENT_SERVICE_URL,
    inventory:     env.INVENTORY_SERVICE_URL,
    hr:            env.HR_SERVICE_URL,
    projects:      env.PROJECTS_SERVICE_URL,
    manufacturing: env.MANUFACTURING_SERVICE_URL,
    rental:        env.RENTAL_SERVICE_URL,
    interco:       env.INTERCO_SERVICE_URL,
    notifications: env.NOTIFICATIONS_SERVICE_URL,
    reporting:     env.REPORTING_SERVICE_URL,
    gateway:       `http://localhost:${process.env['PORT'] ?? 3000}`,
  }
  return Promise.all(
    Object.entries(serviceUrls).map(async ([name, baseUrl]) => {
      const start = Date.now()
      try {
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) })
        const latencyMs = Date.now() - start
        const body = res.ok ? await res.json() as Record<string, unknown> : {}
        const checks = (body['checks'] as Record<string, unknown>) ?? {}
        const getStatus = (c: unknown) => {
          if (typeof c === 'object' && c !== null && 'status' in c) return String((c as Record<string,unknown>)['status'])
          return typeof c === 'string' ? c : 'ok'
        }
        return {
          service: name,
          status: res.ok ? String(body['status'] ?? 'ok').replace('ok','healthy').replace('down','unhealthy') : 'unhealthy',
          latencyMs,
          checks: { database: getStatus(checks['database']) || 'ok', redis: getStatus(checks['redis']) || 'ok', outbox: getStatus(checks['outbox']) || 'ok' },
          uptime: typeof body['uptime'] === 'number' ? body['uptime'] : 0,
          lastChecked: new Date().toISOString(),
        }
      } catch {
        return { service: name, status: 'unhealthy', latencyMs: Date.now() - start, checks: { database: 'error', redis: 'error', outbox: 'error' }, uptime: 0, lastChecked: new Date().toISOString() }
      }
    })
  )
}

// Warm cache immediately, then refresh every 5s
fetchAllHealth().then(r => { healthCache = r }).catch(() => null)
setInterval(async () => {
  try { healthCache = await fetchAllHealth() } catch { /* keep stale cache */ }
}, 10000)

// ── PO lifecycle helpers ────────────────────────────────────────

type GWAuth = { userId: string; companyId: string; role: string }

type EditChanges = {
  header?: Record<string, { from: unknown; to: unknown }>
  lines?: { edited?: Array<{ id: string; field: string; from?: unknown; to: unknown }>; added?: Array<Record<string, unknown>>; removed?: string[] }
}

function buildEditChangeSummary(changes: EditChanges): string {
  const parts: string[] = []
  const headerFields = Object.keys(changes.header ?? {})
  if (headerFields.length > 0) {
    const details = headerFields.map(f => {
      const diff = changes.header![f]
      return `${f}: "${diff.from ?? '—'}" → "${diff.to ?? '—'}"`
    })
    parts.push(`Header: ${details.join(', ')}`)
  }
  const edited = changes.lines?.edited ?? []
  const added = changes.lines?.added ?? []
  const removed = changes.lines?.removed ?? []
  if (edited.length > 0) {
    const editDetails = edited.map(e => `${e.field}: "${e.from ?? '—'}" → "${e.to ?? '—'}"`)
    parts.push(`Lines edited (${edited.length}): ${editDetails.join(', ')}`)
  }
  if (added.length > 0) parts.push(`Lines added: ${added.length}`)
  if (removed.length > 0) parts.push(`Lines removed: ${removed.length}`)
  return parts.join(' | ')
}

async function poTransition(
  client: import('@fnc-erp/db').PoolClient,
  poId: string,
  fromStatus: POStatus,
  toStatus: POStatus,
  action: POAction,
  auth: GWAuth,
  notes?: string,
): Promise<void> {
  const cur = await client.query(`SELECT status FROM purchase_orders WHERE id=$1 FOR UPDATE`, [poId])
  if (!cur.rows[0]) throw Object.assign(new Error('PO not found'), { extensions: { code: 'NOT_FOUND' } })
  const cs = cur.rows[0].status as POStatus
  if (cs !== fromStatus) throw Object.assign(new Error(`Expected '${fromStatus}', got '${cs}'`), { extensions: { code: 'INVALID_STATUS' } })
  if (!poStateMachine.canTransition(cs, action)) throw Object.assign(new Error(`Action '${action}' not allowed from '${cs}'`), { extensions: { code: 'INVALID_TRANSITION' } })
  await client.query(`UPDATE purchase_orders SET status=$1, updated_at=NOW() WHERE id=$2`, [toStatus, poId])
  await client.query(
    `INSERT INTO po_approval_log (po_id, from_status, to_status, action, actor_id, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [poId, fromStatus, toStatus, action, auth.userId, notes ?? null],
  )
  await logAudit({ userId: auth.userId, companyId: auth.companyId, action, tableName: 'purchase_orders', recordId: poId, oldValues: { status: fromStatus }, newValues: { status: toStatus }, client })
}

async function getPOForReturn(poId: string): Promise<Record<string, unknown>> {
  const r = await query(
    `SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON v.id=po.vendor_id WHERE po.id=$1`,
    [poId],
  )
  if (!r.rows[0]) throw new Error('PO not found')
  return r.rows[0] as Record<string, unknown>
}

// Post a journal entry when a project-linked PO is completed so that the cost
// flows into project_cost_actuals via trg_sync_project_costs.
async function postPOCompletionJournal(
  client: import('@fnc-erp/db').PoolClient,
  poId: string,
  actorId: string,
): Promise<void> {
  const poRes = await client.query(
    `SELECT po.id, po.po_number, po.project_id, po.total_amount, po.currency_code,
            po.fx_rate, p.analytic_account_id, p.company_id AS project_company_id
     FROM purchase_orders po
     LEFT JOIN projects p ON p.id = po.project_id
     WHERE po.id = $1`,
    [poId],
  )
  const po = poRes.rows[0] as Record<string, unknown> | undefined
  if (!po?.['project_id'] || !po?.['analytic_account_id']) return // not a project PO or no analytic account
  const totalAmount = parseFloat(String(po['total_amount'] ?? 0))
  if (totalAmount <= 0) return

  const companyId = String(po['project_company_id'])
  const currencyCode = String(po['currency_code'] ?? 'IQD')
  let fxRate = 1.0
  if (currencyCode !== 'IQD') {
    const fxRes = await client.query(
      `SELECT rate FROM fx_rates
       WHERE from_currency = $1 AND to_currency = 'IQD'
       ORDER BY rate_date DESC LIMIT 1`,
      [currencyCode],
    )
    fxRate = fxRes.rows[0] ? parseFloat(String(fxRes.rows[0]['rate'])) : 1.0
  }
  const amountCompanyCurrency = totalAmount * fxRate
  const poNumber = String(po['po_number'])
  const analyticAccountId = String(po['analytic_account_id'])

  const expAcctRes = await client.query(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND account_type='expense' AND is_active=true ORDER BY code ASC LIMIT 1`,
    [companyId],
  )
  const apAcctRes = await client.query(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND account_type='liability' AND is_active=true ORDER BY code ASC LIMIT 1`,
    [companyId],
  )
  const expAccountId = expAcctRes.rows[0]?.['id'] as string | undefined
  const apAccountId = apAcctRes.rows[0]?.['id'] as string | undefined
  if (!expAccountId || !apAccountId) return // no GL accounts configured, skip silently

  const je = await client.query(
    `INSERT INTO journal_entries (company_id,reference,description,entry_date,status,source_type,source_id,created_by,posted_at,posted_by)
     VALUES ($1,$2,$3,CURRENT_DATE,'posted','po_completion',$4,$5,NOW(),$5) RETURNING id`,
    [companyId, `PO-${poNumber}-COST`, `Project cost from PO ${poNumber}`, poId, actorId],
  )
  const jeId = je.rows[0]['id'] as string

  // Link this journal to the source PO
  await client.query(
    `INSERT INTO journal_po_links (journal_entry_id, po_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [jeId, poId],
  )

  // Dr. Project Expense (tagged with analytic account → triggers trg_sync_project_costs)
  await client.query(
    `INSERT INTO journal_lines (journal_entry_id,account_id,analytic_account_id,description,debit,credit,currency_code,fx_rate,amount_company_currency)
     VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8)`,
    [jeId, expAccountId, analyticAccountId, `Project expense from PO ${poNumber}`, totalAmount, currencyCode, fxRate, amountCompanyCurrency],
  )
  // Cr. Accounts Payable
  await client.query(
    `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,currency_code,fx_rate,amount_company_currency)
     VALUES ($1,$2,$3,0,$4,$5,$6,$7)`,
    [jeId, apAccountId, `Payable for PO ${poNumber}`, totalAmount, currencyCode, fxRate, amountCompanyCurrency],
  )
}

// ── Manufacturing Request helpers ────────────────────────────────
function mapMR(row: Record<string, unknown>) {
  return {
    id: row['id'],
    requestNumber: row['request_number'],
    projectId: row['project_id'],
    projectName: row['project_name'] ?? null,
    requestingCompanyId: row['requesting_company_id'],
    requestingCompanyName: row['requesting_company_name'] ?? null,
    productId: row['product_id'] ?? null,
    productName: row['product_name'] ?? null,
    productSku: row['product_sku'] ?? null,
    qtyRequested: parseFloat(String(row['qty_requested'] ?? 1)),
    requiredDate: row['required_date'] ? String(row['required_date']) : null,
    description: row['description'] ?? null,
    status: row['status'],
    requestedBy: row['requested_by'],
    requestedByName: row['requested_by_name'] ?? null,
    approvedBy: row['approved_by'] ?? null,
    approvedByName: row['approved_by_name'] ?? null,
    approvedAt: row['approved_at'] ? String(row['approved_at']) : null,
    rejectionReason: row['rejection_reason'] ?? null,
    moId: row['mo_id'] ?? null,
    moNumber: row['mo_number'] ?? null,
    actualCost: row['actual_cost'] ? parseFloat(String(row['actual_cost'])) : null,
    currencyCode: String(row['currency_code'] ?? 'IQD').trim(),
    notes: row['notes'] ?? null,
    createdAt: String(row['created_at']),
  }
}

const MR_SELECT = `
  SELECT mr.*,
    p.name   AS project_name,
    c.name   AS requesting_company_name,
    prod.name AS product_name,
    prod.sku  AS product_sku,
    COALESCE(ru.first_name || ' ' || ru.last_name, ru.email) AS requested_by_name,
    COALESCE(au.first_name || ' ' || au.last_name, au.email) AS approved_by_name,
    mo.mo_number
  FROM manufacturing_requests mr
  LEFT JOIN projects p ON p.id = mr.project_id
  LEFT JOIN companies c ON c.id = mr.requesting_company_id
  LEFT JOIN products prod ON prod.id = mr.product_id
  LEFT JOIN users ru ON ru.id = mr.requested_by
  LEFT JOIN users au ON au.id = mr.approved_by
  LEFT JOIN manufacturing_orders mo ON mo.id = mr.mo_id
`

async function getEmployeeIdGW(userId: string, companyId: string): Promise<string | null> {
  const r = await query(`SELECT id FROM employees WHERE user_id=$1 AND company_id=$2 LIMIT 1`, [userId, companyId])
  return (r.rows[0]?.id as string | null) ?? null
}

async function userHasPositionGW(userId: string, companyId: string, poId: string, position: string): Promise<boolean> {
  const scope = await query(
    `SELECT po.project_id, e.department_id FROM purchase_orders po LEFT JOIN users ou ON ou.id=po.organizer_id LEFT JOIN employees e ON e.user_id=ou.id WHERE po.id=$1 LIMIT 1`,
    [poId],
  )
  if (!scope.rows[0]) return false
  const empId = await getEmployeeIdGW(userId, companyId)
  if (!empId) return false
  const r = await query(
    `SELECT id FROM po_position_assignments WHERE employee_id=$1 AND position=$2 AND is_active=true AND company_id=$3 AND (($4::uuid IS NOT NULL AND project_id=$4) OR ($5::uuid IS NOT NULL AND department_id=$5)) LIMIT 1`,
    [empId, position, companyId, scope.rows[0].project_id ?? null, scope.rows[0].department_id ?? null],
  )
  return r.rows.length > 0
}

async function userIsOrganizerGW(userId: string, poId: string): Promise<boolean> {
  const r = await query(`SELECT id FROM purchase_orders WHERE id=$1 AND organizer_id=$2 LIMIT 1`, [poId, userId])
  return r.rows.length > 0
}

async function userIsDeptHeadGW(userId: string, poId: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM departments d JOIN employees mgr ON mgr.id=d.manager_id JOIN users mu ON mu.id=mgr.user_id
     WHERE mu.id=$1 AND d.id=(SELECT e.department_id FROM employees e JOIN users ou ON ou.id=e.user_id JOIN purchase_orders po ON po.organizer_id=ou.id WHERE po.id=$2 LIMIT 1) LIMIT 1`,
    [userId, poId],
  )
  return r.rows.length > 0
}

async function userIsAssignedApproverGW(userId: string, poId: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM purchase_orders po JOIN employees e ON e.id=po.assigned_approver_id JOIN users u ON u.id=e.user_id WHERE po.id=$1 AND u.id=$2 LIMIT 1`,
    [poId, userId],
  )
  return r.rows.length > 0
}

function isAdminGW(role: string): boolean {
  return ['system_admin', 'company_admin', 'module_admin'].includes(role)
}

async function recalcPO(client: import('@fnc-erp/db').PoolClient, poId: string): Promise<void> {
  await client.query(
    `UPDATE purchase_orders SET subtotal=(SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1), total_amount=(SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1), updated_at=NOW() WHERE id=$1`,
    [poId],
  )
}

// ── Project helpers ────────────────────────────────────────────

async function logActivity(projectId: string, actorId: string | undefined, eventType: string, summary: string) {
  try {
    await query(
      `INSERT INTO project_activity_log (project_id, actor_id, event_type, summary) VALUES ($1,$2,$3,$4)`,
      [projectId, actorId ?? null, eventType, summary],
    )
  } catch { /* never fail the main operation over a log write */ }
}

function projectRowToGQL(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    projectType: row.project_type,
    companyId: row.company_id,
    companyName: row.company_name,
    rfqNumber: row.rfq_number,
    contractName: row.contract_name,
    projectLocation: row.project_location,
    receivingDate: row.receiving_date,
    submissionDate: row.submission_date,
    submissionTime: row.submission_time,
    siteVisitDate: row.site_visit_date,
    siteVisitTime: row.site_visit_time,
    questionDate: row.question_date,
    questionTime: row.question_time,
    daysToSubmission: row.days_to_submission,
    projectValue: row.project_value != null ? parseFloat(String(row.project_value)) : null,
    projectValueCurrency: row.project_value_currency,
    clientName: row.client_name,
    clientContact: row.client_contact,
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    budgetAmount: row.budget_amount != null ? parseFloat(String(row.budget_amount)) : null,
    budgetCurrency: row.budget_currency,
    managerId: row.project_manager_id,
    managerName: row.manager_name,
    costCenterId: row.cost_center_id,
    analyticAccountId: row.analytic_account_id,
    analyticAccountName: row.analytic_account_name,
    holdReason: row.hold_reason,
    cancelReason: row.cancel_reason,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    overallCompletionPct: row.overall_completion_pct != null ? parseInt(String(row.overall_completion_pct)) : 0,
    teamCount: row.team_count != null ? parseInt(String(row.team_count)) : 0,
    openPoCount: row.open_po_count != null ? parseInt(String(row.open_po_count)) : 0,
    stagesCompleted: row.stages_completed != null ? parseInt(String(row.stages_completed)) : 0,
    stagesTotal: row.stages_total != null ? parseInt(String(row.stages_total)) : 0,
    currentStageName: row.current_stage_name,
    totalCosts: row.total_costs != null ? parseFloat(String(row.total_costs)) : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    allowedActions: projectStateMachine.allowedActions(row.status as never),
  }
}

async function assertProjectCancellable(projectId: string): Promise<void> {
  const res = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM purchase_orders
       WHERE project_id = $1 AND status NOT IN ('completed','deleted','cancelled')) AS open_pos,
      (SELECT COUNT(*)::int FROM manufacturing_requests mr
       JOIN interco_transactions it ON it.id = mr.interco_transaction_id
       WHERE mr.project_id = $1 AND it.status = 'pending') AS pending_interco,
      (SELECT COUNT(*)::int FROM manufacturing_requests
       WHERE project_id = $1 AND status NOT IN ('completed','cancelled')) AS open_mrs
  `, [projectId])

  const row = res.rows[0] as { open_pos: number; pending_interco: number; open_mrs: number }
  const blockers: string[] = []
  if (row.open_pos > 0)
    blockers.push(`${row.open_pos} open purchase order${row.open_pos > 1 ? 's' : ''} with outstanding costs`)
  if (row.pending_interco > 0)
    blockers.push(`${row.pending_interco} unposted inter-company transaction${row.pending_interco > 1 ? 's' : ''}`)
  if (row.open_mrs > 0)
    blockers.push(`${row.open_mrs} active manufacturing request${row.open_mrs > 1 ? 's' : ''}`)

  if (blockers.length > 0)
    throw new Error(`Cannot cancel project — resolve the following first: ${blockers.join('; ')}`)
}

async function projectTransition(
  projectId: string,
  companyId: string,
  userId: string,
  action: string,
  toStatus: string,
  extras: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const current = await query(`SELECT status FROM projects WHERE id = $1 AND company_id = $2`, [projectId, companyId])
  if (!current.rows[0]) throw new Error('Project not found')
  const fromStatus = current.rows[0].status as string

  await projectStateMachine.transition(fromStatus as never, action as never)

  const fields: Array<[string, unknown]> = [['status', toStatus]]
  for (const [k, v] of Object.entries(extras)) {
    if (v !== undefined && k !== 'reason') fields.push([k, v])
  }
  const setClause = [...fields.map(([k], i) => `${k} = $${i + 2}`), 'updated_at = NOW()'].join(', ')
  const values = [projectId, ...fields.map(([, v]) => v)]

  const updated = await query(`UPDATE projects SET ${setClause} WHERE id = $1 RETURNING *`, values)
  await query(
    `INSERT INTO project_status_history (project_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,$3,$4,$5)`,
    [projectId, fromStatus, toStatus, userId, extras['reason'] ?? null],
  )
  const reason = extras['reason'] as string | undefined
  await logActivity(projectId, userId, 'status_change',
    `Status changed: ${fromStatus.replace(/_/g, ' ')} → ${toStatus.replace(/_/g, ' ')}` +
    (reason ? ` ("${reason}")` : ''),
  )
  return projectRowToGQL(updated.rows[0] as Record<string, unknown>)
}

interface GQLContext {
  auth?: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}

export const resolvers = {
  Query: {
    health: () => 'FNC ERP Gateway — Phase 3 active',

    // Finance
    accounts: async (_: unknown, args: { type?: string; is_active?: boolean }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const { type, is_active } = args
      let sql = `SELECT * FROM chart_of_accounts WHERE company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (type !== undefined) {
        sql += ` AND account_type = $${idx++}`
        params.push(type)
      }
      if (is_active !== undefined) {
        sql += ` AND is_active = $${idx++}`
        params.push(is_active)
      }
      sql += ' ORDER BY code'
      const result = await query(sql, params)
      return result.rows
    },

    journalEntries: async (
      _: unknown,
      args: { status?: string; from_date?: string; to_date?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      const { status, from_date, to_date } = args
      let sql = `SELECT je.*,
                   COALESCE(SUM(CASE WHEN jl.debit > 0 THEN jl.debit ELSE 0 END), 0) AS total_debit,
                   COALESCE(SUM(CASE WHEN jl.credit > 0 THEN jl.credit ELSE 0 END), 0) AS total_credit,
                   COALESCE(
                     (SELECT jl2.currency_code FROM journal_lines jl2
                      WHERE jl2.journal_entry_id = je.id AND jl2.debit > 0
                      GROUP BY jl2.currency_code ORDER BY SUM(jl2.debit) DESC LIMIT 1),
                     'IQD'
                   ) AS payment_currency
                 FROM journal_entries je LEFT JOIN journal_lines jl ON jl.journal_entry_id=je.id
                 WHERE je.company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (status !== undefined) {
        sql += ` AND je.status = $${idx++}`
        params.push(status)
      }
      if (from_date !== undefined) {
        sql += ` AND je.entry_date >= $${idx++}`
        params.push(from_date)
      }
      if (to_date !== undefined) {
        sql += ` AND je.entry_date <= $${idx++}`
        params.push(to_date)
      }
      sql += ' GROUP BY je.id ORDER BY je.entry_date DESC LIMIT 100'
      const result = await query(sql, params)
      return result.rows
    },

    trialBalance: async (_: unknown, args: { as_of_date?: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const dateFilter = args.as_of_date ? `AND je.entry_date <= '${args.as_of_date}'` : ''
      const result = await query(
        `SELECT coa.id, coa.code, coa.name, coa.account_type,
                COALESCE(SUM(jl.debit),0) AS total_debit,
                COALESCE(SUM(jl.credit),0) AS total_credit,
                COALESCE(SUM(jl.debit - jl.credit),0) AS balance
         FROM chart_of_accounts coa
         LEFT JOIN journal_lines jl ON jl.account_id = coa.id
         LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
           AND je.company_id = $1 AND je.status = 'posted' ${dateFilter}
         WHERE coa.company_id = $1 AND coa.is_active = true
         GROUP BY coa.id, coa.code, coa.name, coa.account_type ORDER BY coa.code`,
        [ctx.auth.companyId],
      )
      return result.rows
    },

    // Inventory
    products: async (_: unknown, args: { category?: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      // Include both this company's own products AND foreign products that have
      // physical stock in this company's locations (e.g. from interco transfers)
      let sql = `SELECT p.*,
                   COALESCE(SUM(CASE WHEN sl.company_id = $1 AND sl.type NOT IN ('virtual_in','virtual_out') THEN sb.qty_on_hand ELSE 0 END), 0) AS qty_on_hand
                 FROM products p
                 LEFT JOIN stock_balances sb ON sb.product_id = p.id
                 LEFT JOIN stock_locations sl ON sl.id = sb.location_id
                 WHERE p.company_id = $1
                    OR (sl.company_id = $1 AND sl.type NOT IN ('virtual_in','virtual_out') AND sb.qty_on_hand > 0)`
      const params: unknown[] = [ctx.auth.companyId]
      if (args.category !== undefined) {
        sql += ` AND p.category = $2`
        params.push(args.category)
      }
      sql += ' GROUP BY p.id ORDER BY p.sku'
      const result = await query(sql, params)
      return result.rows
    },

    stockBalances: async (
      _: unknown,
      args: { product_id?: string; location_id?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT sb.*, p.name AS product_name, sl.name AS location_name
                 FROM stock_balances sb
                 JOIN products p ON p.id = sb.product_id
                 JOIN stock_locations sl ON sl.id = sb.location_id
                 WHERE sl.company_id = $1 AND sl.type NOT IN ('virtual_in','virtual_out') AND sb.qty_on_hand > 0`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.product_id !== undefined) {
        sql += ` AND sb.product_id = $${idx++}`
        params.push(args.product_id)
      }
      if (args.location_id !== undefined) {
        sql += ` AND sb.location_id = $${idx++}`
        params.push(args.location_id)
      }
      sql += ' ORDER BY p.sku'
      const result = await query(sql, params)
      return result.rows
    },

    poStockAvailability: async (_: unknown, args: { poId: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const result = await query(
        `SELECT
           pol.id                                              AS "lineId",
           pol.product_id                                     AS "productId",
           p.name                                             AS "productName",
           pol.description                                    AS description,
           pol.qty_ordered                                    AS "qtyRequired",
           COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_on_hand ELSE 0 END), 0)                  AS "qtyOnHand",
           GREATEST(COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_on_hand ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_reserved ELSE 0 END), 0), 0) AS "qtyAvailable",
           GREATEST(COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_on_hand ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_reserved ELSE 0 END), 0), 0)
             >= pol.qty_ordered                               AS "isAvailable"
         FROM po_lines pol
         JOIN purchase_orders po ON po.id = pol.po_id
         LEFT JOIN products p ON p.id = pol.product_id
         LEFT JOIN stock_balances sb ON sb.product_id = pol.product_id
         LEFT JOIN stock_locations sl ON sl.id = sb.location_id AND sl.company_id = po.company_id AND sl.type NOT IN ('virtual_in','virtual_out')
         WHERE pol.po_id = $1 AND po.company_id = $2
         GROUP BY pol.id, pol.product_id, p.name, pol.description, pol.qty_ordered
         ORDER BY pol.line_number`,
        [args.poId, ctx.auth.companyId],
      )
      return result.rows.map((r: Record<string, unknown>) => ({
        ...r,
        qtyRequired: parseFloat(String(r['qtyRequired'] ?? 0)),
        qtyOnHand: parseFloat(String(r['qtyOnHand'] ?? 0)),
        qtyAvailable: parseFloat(String(r['qtyAvailable'] ?? 0)),
        isAvailable: Boolean(r['isAvailable']),
      }))
    },

    moMissingComponents: async (_: unknown, args: { moId: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const result = await query(
        `SELECT
           bl.id                                   AS "bomLineId",
           bl.component_product_id                 AS "componentProductId",
           p.name                                  AS "productName",
           bl.uom,
           bl.qty_required * mo.qty_planned / b.qty_produced AS "qtyRequired",
           COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_on_hand ELSE 0 END), 0)        AS "qtyOnHand",
           GREATEST(COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_on_hand ELSE 0 END),0) - COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_reserved ELSE 0 END),0), 0) AS "qtyAvailable",
           GREATEST(bl.qty_required * mo.qty_planned / b.qty_produced
             - GREATEST(COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_on_hand ELSE 0 END),0) - COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_reserved ELSE 0 END),0), 0), 0) AS "qtyShortfall",
           (GREATEST(COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_on_hand ELSE 0 END),0) - COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sb.qty_reserved ELSE 0 END),0), 0)
             >= bl.qty_required * mo.qty_planned / b.qty_produced) AS "hasSufficientStock"
         FROM manufacturing_orders mo
         JOIN boms b ON b.id = mo.bom_id
         JOIN bom_lines bl ON bl.bom_id = b.id
         JOIN products p ON p.id = bl.component_product_id
         LEFT JOIN stock_balances sb ON sb.product_id = bl.component_product_id
         LEFT JOIN stock_locations sl ON sl.id = sb.location_id AND sl.company_id = mo.company_id AND sl.type NOT IN ('virtual_in','virtual_out')
         WHERE mo.id = $1 AND mo.company_id = $2
         GROUP BY bl.id, bl.component_product_id, p.name, bl.uom, bl.qty_required, mo.qty_planned, b.qty_produced, bl.sequence
         ORDER BY bl.sequence`,
        [args.moId, ctx.auth.companyId],
      )
      return result.rows.map((r: Record<string, unknown>) => ({
        ...r,
        qtyRequired: parseFloat(String(r['qtyRequired'] ?? 0)),
        qtyOnHand: parseFloat(String(r['qtyOnHand'] ?? 0)),
        qtyAvailable: parseFloat(String(r['qtyAvailable'] ?? 0)),
        qtyShortfall: parseFloat(String(r['qtyShortfall'] ?? 0)),
        hasSufficientStock: Boolean(r['hasSufficientStock']),
      }))
    },

    // Procurement
    vendors: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const result = await query('SELECT * FROM vendors WHERE company_id = $1 ORDER BY name', [
        ctx.auth.companyId,
      ])
      return result.rows
    },

    purchaseOrders: async (
      _: unknown,
      args: { status?: string; vendor_id?: string; project_id?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT po.*, v.name AS vendor_name,
        (SELECT COUNT(*) FROM vendor_invoices vi WHERE vi.po_id = po.id AND vi.company_id = po.company_id)::int AS invoice_count
        FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id WHERE po.company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.status !== undefined) {
        sql += ` AND po.status = $${idx++}`
        params.push(args.status)
      }
      if (args.vendor_id !== undefined) {
        sql += ` AND po.vendor_id = $${idx++}`
        params.push(args.vendor_id)
      }
      if (args.project_id !== undefined) {
        sql += ` AND po.project_id = $${idx++}`
        params.push(args.project_id)
      }
      sql += ' ORDER BY po.created_at DESC LIMIT 200'
      const result = await query(sql, params)
      return result.rows
    },

    myPOQueue: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return []
      try {
        const result = await query(
          `SELECT po.*, v.name AS vendor_name
           FROM purchase_orders po
           JOIN vendors v ON v.id = po.vendor_id
           JOIN employees e ON e.id = po.assigned_approver_id
           JOIN users u ON u.id = e.user_id
           WHERE u.id = $1 AND po.company_id = $2
             AND po.status IN ('pending_review','approved_l1')
           ORDER BY po.created_at DESC`,
          [ctx.auth.userId, ctx.auth.companyId],
        )
        return result.rows
      } catch {
        return []
      }
    },

    // Interco
    intercoTransactions: async (_: unknown, args: { status?: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      let sql = `SELECT it.*, fc.name AS from_company_name, tc.name AS to_company_name
                 FROM interco_transactions it
                 JOIN companies fc ON fc.id = it.from_company_id
                 JOIN companies tc ON tc.id = it.to_company_id
                 WHERE (it.from_company_id = $1 OR it.to_company_id = $1)`
      const params: unknown[] = [ctx.auth.companyId]
      if (args.status !== undefined) {
        sql += ` AND it.status = $2`
        params.push(args.status)
      }
      sql += ' ORDER BY it.created_at DESC LIMIT 100'
      const result = await query(sql, params)
      return result.rows
    },

    // HR
    employees: async (
      _: unknown,
      args: { department_id?: string; is_active?: boolean },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT e.id, e.employee_number, e.first_name, e.last_name, e.email,
                        e.phone, e.national_id, e.job_title, e.department_id,
                        e.work_location_id, e.manager_id, e.employment_type,
                        e.hire_date, e.termination_date, e.status, e.user_id,
                        d.name AS department_name
                 FROM employees e
                 LEFT JOIN departments d ON d.id = e.department_id
                 WHERE e.company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.department_id !== undefined) {
        sql += ` AND e.department_id = $${idx++}`
        params.push(args.department_id)
      }
      if (args.is_active !== undefined) {
        sql += ` AND e.status = $${idx++}`
        params.push(args.is_active ? 'active' : 'inactive')
      }
      sql += ' ORDER BY e.last_name, e.first_name LIMIT 500'
      const result = await query(sql, params)
      return result.rows
    },

    employee: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const result = await query(
        `SELECT e.id, e.employee_number, e.first_name, e.last_name, e.email,
                e.phone, e.national_id, e.passport_number, e.nationality,
                e.date_of_birth, e.gender, e.job_title, e.department_id,
                e.work_location_id, e.manager_id, e.employment_type,
                e.hire_date, e.termination_date, e.status, e.user_id,
                (e.status = 'active') AS is_active,
                d.name AS department_name,
                u.email AS linked_user_email,
                u.profile_picture AS photo_url
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN users u ON u.id = e.user_id
         WHERE e.id = $1 AND e.company_id = $2`,
        [args.id, ctx.auth.companyId],
      )
      return result.rows[0] ?? null
    },

    departments: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const result = await query(
        'SELECT id, name, parent_id, manager_id, is_active FROM departments WHERE company_id = $1 ORDER BY name',
        [ctx.auth.companyId],
      )
      return result.rows
    },

    workLocations: async (_: unknown, args: { is_active?: boolean }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      let sql = `SELECT id, name, address, latitude::text, longitude::text, geofence_radius_m, is_active
                 FROM work_locations WHERE company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      if (args.is_active !== undefined) {
        sql += ` AND is_active = $2`
        params.push(args.is_active)
      }
      sql += ' ORDER BY name'
      const result = await query(sql, params)
      return result.rows
    },

    shiftConfigs: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const result = await query(
        `SELECT id, name, start_time::text, end_time::text, break_minutes,
                overtime_threshold_hours::text, is_active
         FROM shift_configs WHERE company_id = $1 ORDER BY name`,
        [ctx.auth.companyId],
      )
      return result.rows
    },

    employeeCurrentShift: async (_: unknown, args: { employee_id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const r = await query(
        `SELECT es.id, es.employee_id, es.shift_id, es.effective_from::text, es.effective_to::text,
                sc.name AS shift_name, sc.start_time::text, sc.end_time::text,
                sc.break_minutes, sc.overtime_threshold_hours::text
         FROM employee_shifts es
         JOIN shift_configs sc ON sc.id = es.shift_id
         JOIN employees e ON e.id = es.employee_id
         WHERE es.employee_id = $1 AND e.company_id = $2
           AND es.effective_from <= CURRENT_DATE
           AND (es.effective_to IS NULL OR es.effective_to >= CURRENT_DATE)
         ORDER BY es.effective_from DESC
         LIMIT 1`,
        [args.employee_id, ctx.auth.companyId],
      )
      return r.rows[0] ?? null
    },

    attendanceLogs: async (
      _: unknown,
      args: { employee_id?: string; from_date?: string; to_date?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT al.id, al.employee_id, al.punch_type, al.punched_at,
                        al.geofence_valid, al.distance_from_location_m::text, al.work_location_id,
                        e.first_name || ' ' || e.last_name AS employee_name
                 FROM attendance_logs al
                 JOIN employees e ON e.id = al.employee_id
                 WHERE e.company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.employee_id !== undefined) {
        sql += ` AND al.employee_id = $${idx++}`
        params.push(args.employee_id)
      }
      if (args.from_date !== undefined) {
        sql += ` AND al.punched_at >= $${idx++}`
        params.push(args.from_date)
      }
      if (args.to_date !== undefined) {
        sql += ` AND al.punched_at <= $${idx++}`
        params.push(args.to_date)
      }
      sql += ' ORDER BY al.punched_at DESC LIMIT 500'
      const result = await query(sql, params)
      return result.rows
    },

    leaveTypes: async (_: unknown, args: { is_active?: boolean }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      let sql = `SELECT id, name, COALESCE(is_paid, true) AS is_paid,
                        max_days_per_year, COALESCE(requires_approval, true) AS requires_approval,
                        COALESCE(is_active, true) AS is_active
                 FROM leave_types WHERE company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      if (args.is_active !== undefined) {
        sql += ` AND COALESCE(is_active, true) = $2`
        params.push(args.is_active)
      }
      sql += ' ORDER BY name'
      const result = await query(sql, params)
      return result.rows
    },

    leaveBalances: async (_: unknown, args: { employee_id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const result = await query(
        `SELECT lt.id AS leave_type_id, lt.name AS leave_type_name,
                lt.max_days_per_year AS days_allocated,
                COALESCE(SUM(CASE WHEN lr.status IN ('pending','approved') THEN lr.total_days ELSE 0 END), 0) AS days_used,
                GREATEST(0, lt.max_days_per_year - COALESCE(SUM(CASE WHEN lr.status IN ('pending','approved') THEN lr.total_days ELSE 0 END), 0)) AS days_remaining
         FROM leave_types lt
         LEFT JOIN leave_requests lr ON lr.leave_type_id = lt.id AND lr.employee_id = $1
           AND EXTRACT(YEAR FROM lr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
         WHERE lt.company_id = $2 AND lt.is_active = true
         GROUP BY lt.id, lt.name, lt.max_days_per_year
         ORDER BY lt.name`,
        [args.employee_id, ctx.auth.companyId],
      )
      return result.rows
    },

    leaveRequests: async (
      _: unknown,
      args: { employee_id?: string; status?: string; from_date?: string; to_date?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT lr.*,
                        e.first_name || ' ' || e.last_name AS employee_name,
                        lt.name AS leave_type_name
                 FROM leave_requests lr
                 JOIN employees e ON e.id = lr.employee_id
                 JOIN leave_types lt ON lt.id = lr.leave_type_id
                 WHERE e.company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.employee_id !== undefined) {
        sql += ` AND lr.employee_id = $${idx++}`
        params.push(args.employee_id)
      }
      if (args.status !== undefined) {
        sql += ` AND lr.status = $${idx++}`
        params.push(args.status)
      }
      if (args.from_date !== undefined) {
        sql += ` AND lr.start_date >= $${idx++}`
        params.push(args.from_date)
      }
      if (args.to_date !== undefined) {
        sql += ` AND lr.end_date <= $${idx++}`
        params.push(args.to_date)
      }
      sql += ' ORDER BY lr.created_at DESC LIMIT 200'
      const result = await query(sql, params)
      return result.rows
    },

    leaveRequest: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const result = await query(
        `SELECT lr.*,
                e.first_name || ' ' || e.last_name AS employee_name,
                lt.name AS leave_type_name
         FROM leave_requests lr
         JOIN employees e ON e.id = lr.employee_id
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.id = $1 AND e.company_id = $2`,
        [args.id, ctx.auth.companyId],
      )
      return result.rows[0] ?? null
    },

    overtimeRequests: async (
      _: unknown,
      args: { employee_id?: string; from_date?: string; to_date?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT ol.id, ol.employee_id, ol.work_date,
                        ol.regular_hours::text, ol.overtime_hours::text,
                        'approved' AS status, null AS review_notes, null AS reviewed_by_email,
                        1.5 AS overtime_multiplier,
                        e.first_name || ' ' || e.last_name AS employee_name
                 FROM overtime_logs ol
                 JOIN employees e ON e.id = ol.employee_id
                 WHERE e.company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.employee_id !== undefined) {
        sql += ` AND ol.employee_id = $${idx++}`
        params.push(args.employee_id)
      }
      if (args.from_date !== undefined) {
        sql += ` AND ol.work_date >= $${idx++}`
        params.push(args.from_date)
      }
      if (args.to_date !== undefined) {
        sql += ` AND ol.work_date <= $${idx++}`
        params.push(args.to_date)
      }
      sql += ' ORDER BY ol.work_date DESC LIMIT 200'
      const result = await query(sql, params)
      return result.rows
    },

    payrollRuns: async (_: unknown, args: { status?: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      let sql = `SELECT * FROM payroll_runs WHERE company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      if (args.status !== undefined) {
        sql += ` AND status = $2`
        params.push(args.status)
      }
      sql += ' ORDER BY created_at DESC LIMIT 50'
      const result = await query(sql, params)
      return result.rows
    },

    payrollRun: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const result = await query(
        `SELECT * FROM payroll_runs WHERE id = $1 AND company_id = $2`,
        [args.id, ctx.auth.companyId],
      )
      return result.rows[0] ?? null
    },

    payslips: async (
      _: unknown,
      args: { payroll_run_id?: string; employee_id?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT ps.*,
                        e.first_name || ' ' || e.last_name AS employee_name,
                        e.employee_number
                 FROM payslips ps
                 JOIN employees e ON e.id = ps.employee_id
                 JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
                 WHERE pr.company_id = $1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.payroll_run_id !== undefined) {
        sql += ` AND ps.payroll_run_id = $${idx++}`
        params.push(args.payroll_run_id)
      }
      if (args.employee_id !== undefined) {
        sql += ` AND ps.employee_id = $${idx++}`
        params.push(args.employee_id)
      }
      sql += ' ORDER BY e.last_name, e.first_name'
      const result = await query(sql, params)
      return result.rows
    },

    employeeSalaryConfig: async (_: unknown, args: { employee_id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const result = await query(
        `SELECT * FROM salary_configs
         WHERE employee_id = $1
         ORDER BY effective_from DESC LIMIT 1`,
        [args.employee_id],
      )
      return result.rows[0] ?? null
    },

    myPayslips: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const empRes = await query(
        `SELECT id FROM employees WHERE user_id=$1 AND company_id=$2 LIMIT 1`,
        [ctx.auth.userId, ctx.auth.companyId],
      )
      const empId = empRes.rows[0]?.id as string | undefined
      if (!empId) return []
      const result = await query(
        `SELECT ps.*,
                e.first_name || ' ' || e.last_name AS employee_name,
                e.employee_number
         FROM payslips ps
         JOIN employees e ON e.id = ps.employee_id
         WHERE ps.employee_id = $1
         ORDER BY ps.created_at DESC LIMIT 50`,
        [empId],
      )
      return result.rows
    },

    payslip: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const result = await query(
        `SELECT ps.*,
                e.first_name || ' ' || e.last_name AS employee_name,
                e.employee_number
         FROM payslips ps
         JOIN employees e ON e.id = ps.employee_id
         JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
         WHERE ps.id = $1 AND pr.company_id = $2`,
        [args.id, ctx.auth.companyId],
      )
      return result.rows[0] ?? null
    },

    attendanceCalendar: async (
      _: unknown,
      args: { employeeId: string; month: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      // Find the employee by id or by user_id fallback
      const empRes = await query(
        `SELECT id FROM employees WHERE (id=$1 OR user_id=$1::text) AND company_id=$2 LIMIT 1`,
        [args.employeeId, ctx.auth.companyId],
      )
      const empId = (empRes.rows[0] as Record<string, unknown> | undefined)?.['id'] as string | undefined
      if (!empId) return []
      const [year, mon] = args.month.split('-').map(Number)
      const startDate = `${year}-${String(mon).padStart(2, '0')}-01`
      const endDay = new Date(year, mon, 0).getDate()
      const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      // Get all attendance logs for the month
      const logsRes = await query(
        `SELECT DATE(punched_at) AS log_date, punch_type, punched_at
         FROM attendance_logs
         WHERE employee_id=$1 AND DATE(punched_at) BETWEEN $2 AND $3
         ORDER BY punched_at`,
        [empId, startDate, endDate],
      )
      // Get approved leaves for the month
      const leavesRes = await query(
        `SELECT lr.start_date, lr.end_date, lt.name AS leave_type_name
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id=lr.leave_type_id
         WHERE lr.employee_id=$1 AND lr.status='approved'
           AND lr.start_date <= $3 AND lr.end_date >= $2`,
        [empId, startDate, endDate],
      )
      // Build a map of date → leave type
      const leaveMap: Record<string, string> = {}
      for (const lv of leavesRes.rows as Array<Record<string, unknown>>) {
        const s = new Date(lv['start_date'] as string)
        const e2 = new Date(lv['end_date'] as string)
        for (let d = new Date(s); d <= e2; d.setDate(d.getDate() + 1)) {
          const ds = d.toISOString().slice(0, 10)
          if (ds >= startDate && ds <= endDate) leaveMap[ds] = lv['leave_type_name'] as string
        }
      }
      // Group logs by date
      const byDate: Record<string, Array<Record<string, unknown>>> = {}
      for (const row of logsRes.rows as Array<Record<string, unknown>>) {
        const d = row['log_date'] as string
        if (!byDate[d]) byDate[d] = []
        byDate[d].push(row)
      }
      // Build result for each day in month
      const days = []
      for (let day = 1; day <= endDay; day++) {
        const date = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const dow = new Date(date).getDay() // 0=Sun, 5=Fri, 6=Sat
        const isWeekend = dow === 5 || dow === 6
        const punches = byDate[date] ?? []
        const inPunches = punches.filter((p) => p['punch_type'] === 'in')
        const outPunches = punches.filter((p) => p['punch_type'] === 'out')
        let hoursWorked: number | null = null
        if (inPunches.length > 0 && outPunches.length > 0) {
          const firstIn = new Date(inPunches[0]!['punched_at'] as string).getTime()
          const lastOut = new Date(outPunches[outPunches.length - 1]!['punched_at'] as string).getTime()
          hoursWorked = Math.max(0, (lastOut - firstIn) / 3600000)
        } else if (inPunches.length > 0) {
          hoursWorked = null
        }
        const isLeave = !!leaveMap[date]
        const isAbsent = !isWeekend && !isLeave && inPunches.length === 0
        days.push({
          date,
          hoursWorked,
          hasOvertime: (hoursWorked ?? 0) > 8,
          isAbsent,
          isWeekend,
          isLeave,
          leaveTypeName: leaveMap[date] ?? null,
        })
      }
      return days
    },

    attendanceSummary: async (
      _: unknown,
      args: { employeeId: string; month: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return null
      const empRes = await query(
        `SELECT id FROM employees WHERE (id=$1 OR user_id=$1::text) AND company_id=$2 LIMIT 1`,
        [args.employeeId, ctx.auth.companyId],
      )
      const empId = (empRes.rows[0] as Record<string, unknown> | undefined)?.['id'] as string | undefined
      if (!empId) return null
      const [year, mon] = args.month.split('-').map(Number)
      const startDate = `${year}-${String(mon).padStart(2, '0')}-01`
      const endDay = new Date(year, mon, 0).getDate()
      const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      const result = await query(
        `SELECT
           COUNT(DISTINCT DATE(punched_at)) AS days_present,
           COALESCE(SUM(EXTRACT(EPOCH FROM (punched_at - LAG(punched_at) OVER (PARTITION BY DATE(punched_at) ORDER BY punched_at))) / 3600)
             FILTER (WHERE punch_type='out'), 0) AS total_hours
         FROM attendance_logs
         WHERE employee_id=$1 AND DATE(punched_at) BETWEEN $2 AND $3`,
        [empId, startDate, endDate],
      )
      const leaveDaysRes = await query(
        `SELECT COALESCE(SUM(total_days), 0) AS leave_days
         FROM leave_requests
         WHERE employee_id=$1 AND status='approved' AND start_date <= $3 AND end_date >= $2`,
        [empId, startDate, endDate],
      )
      const otRes = await query(
        `SELECT COALESCE(SUM(overtime_hours), 0) AS overtime_hours
         FROM overtime_logs
         WHERE employee_id=$1 AND work_date BETWEEN $2 AND $3`,
        [empId, startDate, endDate],
      )
      const row = result.rows[0] as Record<string, unknown>
      const workDays = [...Array(endDay)].filter((_, i) => {
        const d = new Date(year, mon - 1, i + 1).getDay()
        return d !== 5 && d !== 6
      }).length
      return {
        days_present: parseInt(row['days_present'] as string ?? '0', 10),
        days_absent: Math.max(0, workDays - parseInt(row['days_present'] as string ?? '0', 10)),
        total_hours: parseFloat(row['total_hours'] as string ?? '0'),
        overtime_hours: parseFloat((otRes.rows[0] as Record<string, unknown>)['overtime_hours'] as string ?? '0'),
        leave_days: parseInt((leaveDaysRes.rows[0] as Record<string, unknown>)['leave_days'] as string ?? '0', 10),
      }
    },

    // Notifications
    notifications: async (
      _: unknown,
      args: { is_read?: boolean; limit?: number },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT * FROM notifications WHERE company_id = $1 AND user_id = $2`
      const params: unknown[] = [ctx.auth.companyId, ctx.auth.userId]
      if (args.is_read !== undefined) {
        sql += ` AND is_read = $3`
        params.push(args.is_read)
      }
      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`
      params.push(args.limit ?? 50)
      const result = await query(sql, params)
      return result.rows
    },

    unreadNotificationCount: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return 0
      const result = await query(
        `SELECT COUNT(*) AS cnt FROM notifications WHERE company_id = $1 AND user_id = $2 AND is_read = FALSE`,
        [ctx.auth.companyId, ctx.auth.userId],
      )
      return parseInt(result.rows[0]?.['cnt'] ?? '0', 10)
    },

    // Projects
    projects: async (
      _: unknown,
      args: { status?: string | string[]; projectType?: string; projectManagerId?: string; search?: string; page?: number; limit?: number; includeAll?: boolean },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }
      const page = Math.max(1, args.page ?? 1)
      const lim = Math.min(100, args.limit ?? 20)
      const conditions = [`p.company_id = $1`]
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2

      const isAdmin = isAdminGW(ctx.auth.role)
      if (!isAdmin && !args.includeAll) {
        // Regular users: exclude pending projects and only see projects they're assigned to
        conditions.push(`p.status != 'pending'`)
        conditions.push(`(
          p.project_manager_id IN (SELECT id FROM employees WHERE user_id = $${idx++})
          OR EXISTS (
            SELECT 1 FROM project_members pm_check
            JOIN employees emp_check ON emp_check.id = pm_check.employee_id
            WHERE pm_check.project_id = p.id AND emp_check.user_id = $${idx - 1} AND pm_check.is_active = true
          )
        )`)
        params.push(ctx.auth.userId)
      }

      if (args.status && (Array.isArray(args.status) ? args.status.length > 0 : args.status)) {
        const statuses = Array.isArray(args.status) ? args.status : args.status.split(',').map((s) => s.trim())
        // Non-admins cannot filter by pending even if they try
        const filtered = isAdmin ? statuses : statuses.filter((s) => s !== 'pending')
        if (filtered.length > 0) { conditions.push(`p.status = ANY($${idx++}::text[])`); params.push(filtered) }
      }
      if (args.projectType) { conditions.push(`p.project_type = $${idx++}`); params.push(args.projectType) }
      if (args.projectManagerId) { conditions.push(`p.project_manager_id = $${idx++}`); params.push(args.projectManagerId) }
      if (args.search) {
        conditions.push(`(p.name ILIKE $${idx++} OR p.code ILIKE $${idx - 1} OR p.rfq_number ILIKE $${idx - 1} OR p.project_location ILIKE $${idx - 1})`)
        params.push(`%${args.search}%`)
      }

      const where = `WHERE ${conditions.join(' AND ')}`
      const [rows, cnt] = await Promise.all([
        query(
          `SELECT p.*,
            e.first_name || ' ' || e.last_name AS manager_name,
            COALESCE(ROUND(AVG(ps.completion_pct))::integer, 0) AS overall_completion_pct,
            COUNT(ps.id) FILTER (WHERE ps.status = 'completed') AS stages_completed,
            COUNT(ps.id) AS stages_total,
            COUNT(DISTINCT pm.id) FILTER (WHERE pm.is_active = true) AS team_count,
            COUNT(DISTINCT po.id) FILTER (WHERE po.status NOT IN ('completed','deleted')) AS open_po_count,
            COALESCE(SUM(pca.amount), 0) AS total_costs
          FROM projects p
          LEFT JOIN employees e ON e.id = p.project_manager_id
          LEFT JOIN project_stages ps ON ps.project_id = p.id
          LEFT JOIN project_members pm ON pm.project_id = p.id
          LEFT JOIN purchase_orders po ON po.project_id = p.id
          LEFT JOIN project_cost_actuals pca ON pca.project_id = p.id
          ${where}
          GROUP BY p.id, e.first_name, e.last_name
          ORDER BY p.created_at DESC
          LIMIT $${idx++} OFFSET $${idx++}`,
          [...params, lim, (page - 1) * lim],
        ),
        query(`SELECT COUNT(*) FROM projects p ${where}`, params),
      ])

      const total = parseInt(String(cnt.rows[0]?.count ?? '0'))
      return {
        data: rows.rows.map(projectRowToGQL),
        pagination: { page, limit: lim, total, totalPages: Math.ceil(total / lim) },
      }
    },

    project: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const result = await query(
        `SELECT p.*,
          e.first_name || ' ' || e.last_name AS manager_name,
          e.id AS manager_employee_id,
          c.name AS company_name,
          aa.name AS analytic_account_name,
          COALESCE(ROUND(AVG(ps.completion_pct))::integer, 0) AS overall_completion_pct,
          (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id AND pm2.is_active = true)::integer AS team_count,
          (SELECT COUNT(*) FROM purchase_orders po2 WHERE po2.project_id = p.id AND po2.status NOT IN ('completed','deleted'))::integer AS open_po_count,
          COALESCE(
            json_agg(json_build_object(
              'id', ps.id, 'name', ps.name, 'sequence', ps.sequence,
              'status', ps.status, 'completionPct', ps.completion_pct,
              'plannedStartDate', ps.planned_start_date, 'plannedEndDate', ps.planned_end_date,
              'actualStartDate', ps.actual_start_date, 'actualEndDate', ps.actual_end_date,
              'notes', ps.notes,
              'assignedTo', ps.assigned_to,
              'assignedToName', (SELECT emp.first_name || ' ' || emp.last_name FROM employees emp WHERE emp.id = ps.assigned_to)
            ) ORDER BY ps.sequence) FILTER (WHERE ps.id IS NOT NULL),
            '[]'
          ) AS stages,
          CASE WHEN p.submission_date IS NOT NULL
            THEN (p.submission_date - CURRENT_DATE)::integer
            ELSE NULL
          END AS days_to_submission,
          COALESCE(
            (SELECT json_agg(h_data)
             FROM (SELECT json_build_object(
               'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
               'changedBy', u2.email, 'reason', h.reason, 'created_at', h.created_at
             ) AS h_data
             FROM project_status_history h JOIN users u2 ON u2.id = h.changed_by
             WHERE h.project_id = p.id ORDER BY h.created_at DESC LIMIT 10) hist),
            '[]'
          ) AS status_history,
          COALESCE(
            (SELECT json_agg(json_build_object(
               'id', al.id,
               'actorName', COALESCE(u3.first_name || ' ' || u3.last_name, 'System'),
               'eventType', al.event_type,
               'summary', al.summary,
               'createdAt', al.created_at
             ) ORDER BY al.created_at DESC)
             FROM project_activity_log al
             LEFT JOIN users u3 ON u3.id = al.actor_id
             WHERE al.project_id = p.id),
            '[]'
          ) AS activity_log,
          COALESCE(
            (SELECT json_agg(json_build_object(
               'id', pm.id, 'employeeId', pm.employee_id,
               'name', emp.first_name || ' ' || emp.last_name,
               'role', pm.role, 'allocatedHours', pm.allocated_hours,
               'isActive', pm.is_active
             ))
             FROM project_members pm
             JOIN employees emp ON emp.id = pm.employee_id
             WHERE pm.project_id = p.id AND pm.is_active = true),
            '[]'
          ) AS team,
          COALESCE(
            (SELECT json_agg(json_build_object(
               'id', po.id, 'po_number', po.po_number,
               'vendor_name', v.name, 'status', po.status,
               'total_amount', po.total_amount, 'currency_code', po.currency_code,
               'created_at', po.created_at
             ) ORDER BY po.created_at DESC)
             FROM purchase_orders po
             LEFT JOIN vendors v ON v.id = po.vendor_id
             WHERE po.project_id = p.id),
            '[]'
          ) AS recent_pos,
          (SELECT json_build_object(
             'currencyCode',            p.budget_currency,
             'grossMarginCurrencyCode', p.project_value_currency,
             'budgetAmount',    p.budget_amount,
             'actualCosts',     COALESCE(SUM(pca.amount * fx_to_budget(pca.currency_code, p.budget_currency)), 0),
             'equipmentRentalCosts', COALESCE(SUM(pca.amount * fx_to_budget(pca.currency_code, p.budget_currency)) FILTER (WHERE pca.cost_category = 'equipment_rental'), 0),
             'committedCosts',  COALESCE((
               SELECT SUM(po3.total_amount * fx_to_budget(po3.currency_code, p.budget_currency))
               FROM purchase_orders po3 WHERE po3.project_id = p.id AND po3.status NOT IN ('completed','deleted')
             ), 0),
             'budgetRemaining', p.budget_amount
               - COALESCE(SUM(pca.amount * fx_to_budget(pca.currency_code, p.budget_currency)), 0)
               - COALESCE((
                 SELECT SUM(po3.total_amount * fx_to_budget(po3.currency_code, p.budget_currency))
                 FROM purchase_orders po3 WHERE po3.project_id = p.id AND po3.status NOT IN ('completed','deleted')
               ), 0),
             'grossMargin',     p.project_value
               - COALESCE(SUM(pca.amount * fx_to_budget(pca.currency_code, p.project_value_currency)), 0)
           )
           FROM project_cost_actuals pca WHERE pca.project_id = p.id
          ) AS cost_summary
        FROM projects p
        LEFT JOIN employees e ON e.id = p.project_manager_id
        LEFT JOIN companies c ON c.id = p.company_id
        LEFT JOIN analytic_accounts aa ON aa.id = p.analytic_account_id
        LEFT JOIN project_stages ps ON ps.project_id = p.id
        WHERE p.id = $1 AND p.company_id = $2
        GROUP BY p.id, e.first_name, e.last_name, e.id, c.name, aa.name`,
        [args.id, ctx.auth.companyId],
      )
      if (!result.rows[0]) return null
      // Non-admins cannot see pending projects or unassigned projects
      if (!isAdminGW(ctx.auth.role)) {
        const row0 = result.rows[0] as Record<string, unknown>
        if (row0['status'] === 'pending') return null
        const isAssigned = await query(
          `SELECT 1 FROM employees e WHERE e.user_id = $1 AND (
            e.id = (SELECT project_manager_id FROM projects WHERE id = $2)
            OR EXISTS (SELECT 1 FROM project_members pm JOIN employees emp ON emp.id = pm.employee_id WHERE pm.project_id = $2 AND emp.user_id = $1 AND pm.is_active = true)
          )`,
          [ctx.auth.userId, args.id],
        )
        if (!isAssigned.rows[0]) return null
      }
      const row = result.rows[0] as Record<string, unknown>
      return {
        ...projectRowToGQL(row),
        team: row.team ?? [],
        recentPos: row.recent_pos ?? [],
        costSummary: row.cost_summary ?? null,
        statusHistory: row.status_history ?? [],
        activityLog: row.activity_log ?? [],
      }
    },

    projectCompletionBlockers: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const blockers: string[] = []
      const [openPOs, activeMOs, incompleteStages] = await Promise.all([
        query(`SELECT COUNT(*) FROM purchase_orders WHERE project_id=$1 AND status NOT IN ('completed','deleted')`, [args.id]),
        query(`SELECT COUNT(*) FROM manufacturing_orders WHERE project_id=$1 AND status NOT IN ('completed','cancelled')`, [args.id]),
        query(`SELECT COUNT(*) FROM project_stages WHERE project_id=$1 AND status NOT IN ('completed','cancelled')`, [args.id]),
      ])
      const po = parseInt(String(openPOs.rows[0]?.count ?? '0'))
      const mo = parseInt(String(activeMOs.rows[0]?.count ?? '0'))
      const st = parseInt(String(incompleteStages.rows[0]?.count ?? '0'))
      if (po > 0) blockers.push(`${po} open purchase order(s) must be completed first`)
      if (mo > 0) blockers.push(`${mo} active manufacturing order(s) must be completed first`)
      if (st > 0) blockers.push(`${st} stage(s) are not yet completed`)
      return { canComplete: blockers.length === 0, blockers }
    },

    // Manufacturing
    manufacturingOrders: async (
      _: unknown,
      args: { status?: string; projectId?: string; page?: number; limit?: number },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      const page = Math.max(1, args.page ?? 1)
      const lim = Math.min(100, args.limit ?? 20)
      let sql = `SELECT mo.*, p.name AS product_name, prj.analytic_account_id AS project_analytic_account_id
                 FROM manufacturing_orders mo
                 JOIN products p ON p.id = mo.finished_product_id
                 LEFT JOIN projects prj ON prj.id = mo.project_id
                 WHERE mo.company_id=$1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.status) {
        sql += ` AND mo.status = $${idx++}`
        params.push(args.status)
      }
      if (args.projectId) {
        sql += ` AND mo.project_id = $${idx++}`
        params.push(args.projectId)
      }
      sql += ` ORDER BY mo.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
      params.push(lim, (page - 1) * lim)
      return (await query(sql, params)).rows
    },

    boms: async (
      _: unknown,
      args: { finishedProductId?: string; isActive?: boolean; allCompanies?: boolean },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT b.*, p.name AS product_name FROM boms b
                 JOIN products p ON p.id = b.finished_product_id WHERE 1=1`
      const params: unknown[] = []
      let idx = 1
      if (!args.allCompanies) {
        sql += ` AND b.company_id=$${idx++}`
        params.push(ctx.auth.companyId)
      }
      if (args.finishedProductId) {
        sql += ` AND b.finished_product_id=$${idx++}`
        params.push(args.finishedProductId)
      }
      if (args.isActive !== undefined) {
        sql += ` AND b.is_active=$${idx++}`
        params.push(args.isActive)
      }
      sql += ` ORDER BY p.name ASC`
      return (await query(sql, params)).rows
    },

    // Manufacturing Requests
    manufacturingRequests: async (
      _: unknown,
      args: { projectId?: string; status?: string; companyId?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = MR_SELECT + ` WHERE 1=1`
      const params: unknown[] = []
      let idx = 1
      // If projectId given: show that project's requests (regardless of company)
      // If companyId explicitly given: filter by requesting company
      // If neither: factory view — show all non-draft requests
      if (args.projectId) {
        sql += ` AND mr.project_id=$${idx++}`; params.push(args.projectId)
      } else if (args.companyId) {
        sql += ` AND mr.requesting_company_id=$${idx++}`; params.push(args.companyId)
      } else {
        // Factory view: exclude drafts (those are private to the requesting company)
        sql += ` AND mr.status != 'draft'`
      }
      if (args.status) { sql += ` AND mr.status=$${idx++}`; params.push(args.status) }
      sql += ` ORDER BY mr.created_at DESC`
      return (await query(sql, params)).rows.map(mapMR)
    },

    manufacturingRequest: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(MR_SELECT + ` WHERE mr.id=$1`, [args.id])
      if (!r.rows[0]) return null
      return mapMR(r.rows[0] as Record<string, unknown>)
    },

    // Rental
    equipmentAssets: async (
      _: unknown,
      args: { status?: string; category?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT * FROM equipment_assets WHERE company_id=$1 AND is_active=true`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.status) {
        sql += ` AND status=$${idx++}`
        params.push(args.status)
      }
      if (args.category) {
        sql += ` AND category=$${idx++}`
        params.push(args.category)
      }
      return (await query(sql, params)).rows
    },

    rentalContracts: async (
      _: unknown,
      args: { status?: string; projectId?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT rc.*, ea.name AS asset_name, p.name AS project_name
                 FROM rental_contracts rc
                 LEFT JOIN equipment_assets ea ON ea.id=rc.asset_id
                 LEFT JOIN projects p ON p.id=rc.project_id
                 WHERE rc.company_id=$1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.status) {
        sql += ` AND rc.status=$${idx++}`
        params.push(args.status)
      }
      if (args.projectId) {
        sql += ` AND rc.project_id=$${idx++}`
        params.push(args.projectId)
      }
      return (await query(sql, params)).rows
    },

    // Interco stock transfers
    intercoStockTransfers: async (
      _: unknown,
      args: { fromCompanyId?: string; toCompanyId?: string; status?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT ist.*, fc.name AS from_company_name, tc.name AS to_company_name,
                        COALESCE((SELECT SUM(istl.total_transfer_value) FROM interco_stock_transfer_lines istl WHERE istl.transfer_id=ist.id),0) AS total_transfer_value
                 FROM interco_stock_transfers ist
                 JOIN companies fc ON fc.id=ist.from_company_id
                 JOIN companies tc ON tc.id=ist.to_company_id
                 WHERE (ist.from_company_id=$1 OR ist.to_company_id=$1)`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.fromCompanyId) { sql += ` AND ist.from_company_id=$${idx++}`; params.push(args.fromCompanyId) }
      if (args.toCompanyId) { sql += ` AND ist.to_company_id=$${idx++}`; params.push(args.toCompanyId) }
      if (args.status) { sql += ` AND ist.status=$${idx++}`; params.push(args.status) }
      sql += ' ORDER BY ist.created_at DESC LIMIT 100'
      return (await query(sql, params)).rows.map((r: Record<string, unknown>) => ({
        id: r['id'],
        transferNumber: r['transfer_number'],
        fromCompanyId: r['from_company_id'],
        toCompanyId: r['to_company_id'],
        fromCompanyName: r['from_company_name'],
        toCompanyName: r['to_company_name'],
        transferDate: r['transfer_date'],
        pricingMethod: r['pricing_method'],
        status: r['status'],
        totalTransferValue: parseFloat(String(r['total_transfer_value'])),
        lines: [],
      }))
    },

    intercoStockTransfer: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const t = await query(
        `SELECT ist.*, fc.name AS from_company_name, tc.name AS to_company_name
         FROM interco_stock_transfers ist
         JOIN companies fc ON fc.id=ist.from_company_id
         JOIN companies tc ON tc.id=ist.to_company_id
         WHERE ist.id=$1 AND (ist.from_company_id=$2 OR ist.to_company_id=$2)`,
        [args.id, ctx.auth.companyId],
      )
      if (!t.rows[0]) return null
      const r = t.rows[0] as Record<string, unknown>
      const lines = await query(
        `SELECT istl.*, p.name AS product_name FROM interco_stock_transfer_lines istl
         JOIN products p ON p.id=istl.product_id WHERE istl.transfer_id=$1`,
        [args.id],
      )
      return {
        id: r['id'],
        transferNumber: r['transfer_number'],
        fromCompanyId: r['from_company_id'],
        toCompanyId: r['to_company_id'],
        fromCompanyName: r['from_company_name'],
        toCompanyName: r['to_company_name'],
        transferDate: r['transfer_date'],
        pricingMethod: r['pricing_method'],
        status: r['status'],
        totalTransferValue: lines.rows.reduce(
          (s, l) => s + parseFloat(String((l as Record<string, unknown>)['total_transfer_value'])),
          0,
        ),
        lines: lines.rows.map((l: Record<string, unknown>) => ({
          id: l['id'],
          productId: l['product_id'],
          productName: l['product_name'],
          qty: parseFloat(String(l['qty'])),
          avcoAtTransfer: parseFloat(String(l['avco_at_transfer'])),
          transferPrice: parseFloat(String(l['transfer_price'])),
          markupPctApplied: l['markup_pct_applied'] != null ? parseFloat(String(l['markup_pct_applied'])) : null,
          totalTransferValue: parseFloat(String(l['total_transfer_value'])),
        })),
      }
    },

    previewTransferPrice: async (
      _: unknown,
      args: { productId: string; fromCompanyId: string; fromLocationId: string; qty: number; marketPrice?: number },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const client = await pool.connect()
      try {
        const pricing = await resolveTransferPrice({
          client,
          productId: args.productId,
          fromCompanyId: args.fromCompanyId,
          fromLocationId: args.fromLocationId,
          ...(args.marketPrice != null ? { manualPrice: args.marketPrice } : {}),
        })
        return {
          method: pricing.method,
          avcoAtTransfer: pricing.avco_at_transfer,
          transferPrice: pricing.transfer_price,
          markupPctApplied: pricing.markup_pct_applied,
          totalTransferValue: pricing.requires_manual_input ? 0 : args.qty * pricing.transfer_price,
          requiresManualInput: pricing.requires_manual_input,
        }
      } finally {
        client.release()
      }
    },

    // File management
    fileDownloadUrl: async (_: unknown, args: { fileId: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const file = await query<{ file_key: string; original_filename: string; mime_type: string }>(
        `SELECT file_key, original_filename, mime_type FROM files WHERE id=$1 AND company_id=$2 AND status != 'deleted'`,
        [args.fileId, ctx.auth.companyId],
      )
      if (!file.rows[0]) throw new Error('File not found')
      const r = file.rows[0]
      const { downloadUrl, expiresInSeconds } = await generateDownloadUrl(r.file_key, r.original_filename)
      return { downloadUrl, filename: r.original_filename, mimeType: r.mime_type, expiresInSeconds }
    },

    entityAttachments: async (
      _: unknown,
      args: { entityType: string; entityId: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      const result = await getAttachments(args.entityType as Parameters<typeof getAttachments>[0], args.entityId)
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r['id'],
        file: {
          id: r['file_id'], originalFilename: r['original_filename'],
          mimeType: r['mime_type'], sizeBytes: parseInt(String(r['size_bytes'])),
          category: r['category'], status: 'attached', uploadedAt: r['uploaded_at'],
        },
        label: r['label'],
        isPrimary: r['is_primary'],
        createdAt: r['created_at'],
        uploadedByEmail: r['uploaded_by_email'],
      }))
    },

    companyIntercoPricingSettings: async (_: unknown, args: { companyId: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const [settings, history] = await Promise.all([
        query<{ interco_transfer_pricing_method: string; interco_cost_plus_markup_pct: string }>(
          `SELECT interco_transfer_pricing_method, interco_cost_plus_markup_pct FROM companies WHERE id=$1`,
          [args.companyId],
        ),
        query(
          `SELECT * FROM interco_pricing_config_log WHERE company_id=$1 ORDER BY created_at DESC LIMIT 10`,
          [args.companyId],
        ),
      ])
      if (!settings.rows[0]) throw new Error('Company not found')
      return {
        method: settings.rows[0].interco_transfer_pricing_method,
        costPlusMarkupPct: parseFloat(settings.rows[0].interco_cost_plus_markup_pct),
        configHistory: history.rows.map((r: Record<string, unknown>) => ({
          id: r['id'],
          previousMethod: r['previous_method'],
          newMethod: r['new_method'],
          previousMarkupPct: r['previous_markup_pct'] != null ? parseFloat(String(r['previous_markup_pct'])) : null,
          newMarkupPct: r['new_markup_pct'] != null ? parseFloat(String(r['new_markup_pct'])) : null,
          effectiveFrom: r['effective_from'],
          notes: r['notes'],
        })),
      }
    },

    // Invoicing — contracts
    projectContracts: async (
      _: unknown,
      args: { projectId?: string; status?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT pc.*,
                        COALESCE((SELECT SUM(pi.gross_total) FROM project_invoices pi WHERE pi.contract_id=pc.id AND pi.status!='cancelled'),0) AS total_invoiced,
                        COALESCE((SELECT SUM(pip.amount) FROM project_invoice_payments pip JOIN project_invoices pi2 ON pi2.id=pip.invoice_id WHERE pi2.contract_id=pc.id),0) AS total_paid
                 FROM project_contracts pc WHERE pc.company_id=$1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.projectId) {
        sql += ` AND pc.project_id=$${idx++}`
        params.push(args.projectId)
      }
      if (args.status) {
        sql += ` AND pc.status=$${idx++}`
        params.push(args.status)
      }
      sql += ' ORDER BY pc.created_at DESC LIMIT 100'
      const rows = (await query(sql, params)).rows as Record<string, unknown>[]
      return rows.map((r) => ({
        id: r['id'],
        contractNumber: r['contract_number'],
        contractName: r['contract_name'],
        clientName: r['client_name'],
        contractValue: parseFloat(String(r['contract_value'])),
        currencyCode: r['currency_code'],
        defaultBillingMethod: r['default_billing_method'],
        defaultMarginPct: parseFloat(String(r['default_margin_pct'])),
        retentionPct: parseFloat(String(r['retention_pct'])),
        status: r['status'],
        totalInvoiced: parseFloat(String(r['total_invoiced'])),
        totalPaid: parseFloat(String(r['total_paid'])),
        outstanding: parseFloat(String(r['total_invoiced'])) - parseFloat(String(r['total_paid'])),
        milestones: [],
        invoices: [],
      }))
    },

    projectContract: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const c = await query(
        `SELECT pc.*,
                COALESCE((SELECT SUM(pi.gross_total) FROM project_invoices pi WHERE pi.contract_id=pc.id AND pi.status!='cancelled'),0) AS total_invoiced,
                COALESCE((SELECT SUM(pip.amount) FROM project_invoice_payments pip JOIN project_invoices pi2 ON pi2.id=pip.invoice_id WHERE pi2.contract_id=pc.id),0) AS total_paid
         FROM project_contracts pc WHERE pc.id=$1 AND pc.company_id=$2`,
        [args.id, ctx.auth.companyId],
      )
      if (!c.rows[0]) return null
      const r = c.rows[0] as Record<string, unknown>
      const [milestones, invoices] = await Promise.all([
        query('SELECT * FROM project_milestones WHERE contract_id=$1 ORDER BY sequence', [args.id]),
        query(
          `SELECT pi.*, COALESCE((SELECT SUM(pip.amount) FROM project_invoice_payments pip WHERE pip.invoice_id=pi.id),0) AS total_paid
               FROM project_invoices pi WHERE pi.contract_id=$1 ORDER BY pi.created_at DESC`,
          [args.id],
        ),
      ])
      return {
        id: r['id'],
        contractNumber: r['contract_number'],
        contractName: r['contract_name'],
        clientName: r['client_name'],
        contractValue: parseFloat(String(r['contract_value'])),
        currencyCode: r['currency_code'],
        defaultBillingMethod: r['default_billing_method'],
        defaultMarginPct: parseFloat(String(r['default_margin_pct'])),
        retentionPct: parseFloat(String(r['retention_pct'])),
        status: r['status'],
        totalInvoiced: parseFloat(String(r['total_invoiced'])),
        totalPaid: parseFloat(String(r['total_paid'])),
        outstanding: parseFloat(String(r['total_invoiced'])) - parseFloat(String(r['total_paid'])),
        milestones: milestones.rows.map((m: Record<string, unknown>) => ({
          id: m['id'],
          name: m['name'],
          sequence: m['sequence'],
          billableAmount: parseFloat(String(m['billable_amount'])),
          currencyCode: String(m['currency_code']).trim(),
          status: m['status'],
          reachedAt: m['reached_at'] ?? null,
        })),
        invoices: invoices.rows.map((i: Record<string, unknown>) => ({
          id: i['id'],
          invoiceNumber: i['invoice_number'],
          billingMethod: i['billing_method'],
          displayMode: i['display_mode'],
          grossTotal: parseFloat(String(i['gross_total'])),
          retentionAmount: parseFloat(String(i['retention_amount'])),
          netPayable: parseFloat(String(i['net_payable'])),
          status: i['status'],
          invoiceDate: i['invoice_date'],
          dueDate: i['due_date'],
          lines: [],
          payments: [],
        })),
      }
    },

    projectInvoices: async (
      _: unknown,
      args: { projectId?: string; contractId?: string; status?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT pi.* FROM project_invoices pi WHERE pi.company_id=$1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.projectId) {
        sql += ` AND pi.project_id=$${idx++}`
        params.push(args.projectId)
      }
      if (args.contractId) {
        sql += ` AND pi.contract_id=$${idx++}`
        params.push(args.contractId)
      }
      if (args.status) {
        sql += ` AND pi.status=$${idx++}`
        params.push(args.status)
      }
      sql += ' ORDER BY pi.created_at DESC LIMIT 100'
      return (await query(sql, params)).rows.map((i: Record<string, unknown>) => ({
        id: i['id'],
        invoiceNumber: i['invoice_number'],
        billingMethod: i['billing_method'],
        displayMode: i['display_mode'],
        grossTotal: parseFloat(String(i['gross_total'])),
        discountPct: parseFloat(String(i['discount_pct'] ?? 0)),
        discountAmount: parseFloat(String(i['discount_amount'] ?? 0)),
        retentionAmount: parseFloat(String(i['retention_amount'])),
        netPayable: parseFloat(String(i['net_payable'])),
        whtApplies: Boolean(i['wht_applies'] ?? false),
        whtScenario: i['wht_scenario'] ?? null,
        whtRate: parseFloat(String(i['wht_rate'] ?? 0)),
        whtAmount: parseFloat(String(i['wht_amount'] ?? 0)),
        status: i['status'],
        invoiceDate: i['invoice_date'],
        dueDate: i['due_date'],
        lines: [],
        payments: [],
      }))
    },

    projectInvoice: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const inv = await query(
        `SELECT pi.*,
                p.code  AS project_code,  p.name  AS project_name,
                pc.contract_number, pc.client_name, pc.retention_pct,
                co.name AS company_name,  co.legal_name AS company_legal_name,
                co.country_code AS company_country, co.stamp_image AS company_stamp,
                co.letterhead_image AS company_letterhead,
                co.address AS company_address, co.phone AS company_phone, co.email AS company_email,
                cb.name AS branch_name, cb.address AS branch_address,
                cb.city AS branch_city, cb.phone AS branch_phone,
                COALESCE(sc.default_payment_terms_days, 30) AS payment_terms_days
         FROM project_invoices pi
         LEFT JOIN projects          p  ON p.id  = pi.project_id
         LEFT JOIN project_contracts pc ON pc.id = pi.contract_id
         LEFT JOIN companies         co ON co.id = pi.company_id
         LEFT JOIN system_configuration sc ON sc.company_id = pi.company_id
         LEFT JOIN LATERAL (
           SELECT name, address, city, phone
           FROM company_branches
           WHERE company_id = pi.company_id AND is_active = TRUE
           ORDER BY created_at ASC LIMIT 1
         ) cb ON TRUE
         WHERE pi.id=$1 AND pi.company_id=$2`,
        [args.id, ctx.auth.companyId],
      )
      if (!inv.rows[0]) return null
      const i = inv.rows[0] as Record<string, unknown>
      const [lines, payments] = await Promise.all([
        query('SELECT * FROM project_invoice_lines WHERE invoice_id=$1 ORDER BY line_number', [args.id]),
        query('SELECT * FROM project_invoice_payments WHERE invoice_id=$1 ORDER BY payment_date', [args.id]),
      ])
      return {
        id: i['id'],
        invoiceNumber: i['invoice_number'],
        billingMethod: i['billing_method'],
        displayMode: i['display_mode'],
        grossTotal: parseFloat(String(i['gross_total'])),
        discountPct: parseFloat(String(i['discount_pct'] ?? 0)),
        discountAmount: parseFloat(String(i['discount_amount'] ?? 0)),
        retentionAmount: parseFloat(String(i['retention_amount'])),
        netPayable: parseFloat(String(i['net_payable'])),
        whtApplies: Boolean(i['wht_applies'] ?? false),
        whtScenario: i['wht_scenario'] ?? null,
        whtRate: parseFloat(String(i['wht_rate'] ?? 0)),
        whtAmount: parseFloat(String(i['wht_amount'] ?? 0)),
        status: i['status'],
        invoiceDate: i['invoice_date'],
        dueDate: i['due_date'],
        currencyCode: i['currency_code'] ?? 'IQD',
        bankAccountId: i['bank_account_id'] ?? null,
        paymentType: i['payment_type'] ?? 'wire_transfer',
        projectCode: i['project_code'] ?? null,
        projectName: i['project_name'] ?? null,
        contractNumber: i['contract_number'] ?? null,
        clientName: i['client_name'] ?? null,
        retentionPct: parseFloat(String(i['retention_pct'] ?? 0)),
        companyName: i['company_name'] ?? null,
        companyLegalName: i['company_legal_name'] ?? null,
        companyCountry: i['company_country'] ?? 'IQ',
        companyStampImage: i['company_stamp'] ?? null,
        companyLetterheadImage: i['company_letterhead'] ?? null,
        companyAddress: i['company_address'] ?? null,
        companyPhone: i['company_phone'] ?? null,
        companyEmail: i['company_email'] ?? null,
        companyBranchName: i['branch_name'] ?? null,
        companyBranchAddress: i['branch_address'] ?? null,
        companyBranchCity: i['branch_city'] ?? null,
        companyBranchPhone: i['branch_phone'] ?? null,
        paymentTermsDays: parseInt(String(i['payment_terms_days'] ?? 30)),
        verificationToken: i['verification_token'] ?? null,
        lines: lines.rows.map((l: Record<string, unknown>) => ({
          id: l['id'],
          lineNumber: l['line_number'],
          description: l['description'],
          sourceType: l['source_type'],
          qty: parseFloat(String(l['qty'])),
          unitCost: parseFloat(String(l['unit_cost'])),
          subtotal: parseFloat(String(l['subtotal'])),
          marginPct: parseFloat(String(l['margin_pct'])),
          marginAmount: parseFloat(String(l['margin_amount'])),
          taxPct: parseFloat(String(l['tax_pct'] ?? 0)),
          taxAmount: parseFloat(String(l['tax_amount'] ?? 0)),
          lineTotal: parseFloat(String(l['line_total'])),
          moComponents: l['mo_components'] ?? null,
        })),
        payments: payments.rows.map((p: Record<string, unknown>) => ({
          id: p['id'],
          paymentDate: p['payment_date'],
          amount: parseFloat(String(p['amount'])),
          paymentReference: p['payment_reference'] ?? null,
          paymentMethod: p['payment_method'] ?? null,
        })),
      }
    },

    materialIssues: async (_: unknown, args: { projectId: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const result = await query(
        `SELECT pmi.*, JSON_AGG(JSON_BUILD_OBJECT(
           'id', pmil.id, 'productId', pmil.product_id,
           'qtyIssued', pmil.qty_issued, 'unitCost', pmil.unit_cost,
           'totalCost', pmil.total_cost, 'isInvoiced', pmil.is_invoiced
         )) AS lines
         FROM project_material_issues pmi
         LEFT JOIN project_material_issue_lines pmil ON pmil.issue_id=pmi.id
         WHERE pmi.project_id=$1 AND pmi.company_id=$2
         GROUP BY pmi.id ORDER BY pmi.created_at DESC`,
        [args.projectId, ctx.auth.companyId],
      )
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r['id'],
        issueNumber: r['issue_number'],
        issueDate: r['issue_date'],
        status: r['status'],
        lines: (r['lines'] as unknown[] | null) ?? [],
      }))
    },

    availableInvoiceCosts: async (
      _: unknown,
      args: { invoiceId: string; sourceType?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth)
        return {
          milestones: [],
          manufacturing_orders: [],
          purchase_orders: [],
          stock_issues: [],
          rental: [],
        }
      const inv = await query<{ project_id: string; contract_id: string }>(
        'SELECT project_id, contract_id FROM project_invoices WHERE id=$1 AND company_id=$2',
        [args.invoiceId, ctx.auth.companyId],
      )
      if (!inv.rows[0])
        return {
          milestones: [],
          manufacturing_orders: [],
          purchase_orders: [],
          stock_issues: [],
          rental: [],
        }
      const { project_id: projectId, contract_id: contractId } = inv.rows[0]
      const result: Record<string, unknown[]> = {
        milestones: [],
        manufacturing_orders: [],
        purchase_orders: [],
        stock_issues: [],
        rental: [],
      }
      if (!args.sourceType || args.sourceType === 'milestone') {
        result['milestones'] = (
          await query(
            `SELECT id, name, sequence, billable_amount AS billableAmount, status, reached_at AS reachedAt
           FROM project_milestones WHERE contract_id=$1 AND status='reached'`,
            [contractId],
          )
        ).rows
      }
      if (!args.sourceType || args.sourceType === 'manufacturing_order') {
        result['manufacturing_orders'] = (
          await query(
            `SELECT mo.id, mo.mo_number, p.name AS product_name, mo.qty_produced, mo.actual_cost
           FROM manufacturing_orders mo JOIN products p ON p.id=mo.finished_product_id
           WHERE mo.project_id=$1 AND mo.status='completed' AND mo.is_invoiced=false`,
            [projectId],
          )
        ).rows
      }
      if (!args.sourceType || args.sourceType === 'purchase_order') {
        result['purchase_orders'] = (
          await query(
            `SELECT por.id, po.po_number, v.name AS vendor_name
           FROM po_receipts por JOIN purchase_orders po ON po.id=por.po_id JOIN vendors v ON v.id=po.vendor_id
           WHERE po.analytic_account_id=(SELECT analytic_account_id FROM projects WHERE id=$1) AND por.is_invoiced=false`,
            [projectId],
          )
        ).rows
      }
      if (!args.sourceType || args.sourceType === 'stock_issue') {
        result['stock_issues'] = (
          await query(
            `SELECT pmil.id, p.name AS product_name, pmil.qty_issued, pmil.unit_cost, pmi.issue_number
           FROM project_material_issue_lines pmil JOIN project_material_issues pmi ON pmi.id=pmil.issue_id
           JOIN products p ON p.id=pmil.product_id
           WHERE pmi.project_id=$1 AND pmi.status='issued' AND pmil.is_invoiced=false`,
            [projectId],
          )
        ).rows
      }
      if (!args.sourceType || args.sourceType === 'rental') {
        result['rental'] = (
          await query(
            `SELECT ri.id, rc.contract_number, ri.days_billed, ri.amount
           FROM rental_invoices ri JOIN rental_contracts rc ON rc.id=ri.contract_id
           WHERE rc.project_id=$1 AND ri.status='issued' AND ri.is_invoiced=false`,
            [projectId],
          )
        ).rows
      }
      return result
    },

    // Reporting
    projectProfitability: async (_: unknown, args: { status?: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      let sql = `SELECT * FROM v_project_profitability WHERE company_id=$1`
      const params: unknown[] = [ctx.auth.companyId]
      if (args.status) {
        sql += ` AND status=$2`
        params.push(args.status)
      }
      sql += ' ORDER BY gross_margin ASC'
      return (await query(sql, params)).rows
    },

    // Outbox monitoring — system_admin only
    outboxMonitor: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Forbidden')
      const [summary, byEventType, pendingDLQ, stuckEvents] = await Promise.all([
        query(`SELECT status, COUNT(*) AS count, MIN(created_at) AS oldest_event FROM service_outbox GROUP BY status`),
        query(`SELECT event_type, service, status, COUNT(*) AS count, MAX(attempts) AS max_attempts_seen, MIN(created_at) AS oldest FROM service_outbox WHERE status IN ('pending','failed','processing') GROUP BY event_type, service, status ORDER BY count DESC`),
        query(`SELECT id, event_type, service, priority, status, total_attempts, last_error, error_history, last_attempted_at AS created_at, reviewed_by, review_notes, retry_outbox_id FROM outbox_dead_letters WHERE status='pending' ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END, last_attempted_at DESC LIMIT 20`),
        query(`SELECT id, service, event_type, status, attempts, max_attempts, last_error, next_retry_at, created_at, processed_at, event_priority FROM service_outbox WHERE status='processing' AND updated_at < NOW() - INTERVAL '5 minutes'`),
      ])
      const pendingCount = Number(summary.rows.find((r: Record<string, unknown>) => r['status'] === 'pending')?.['count'] ?? 0)
      const failedCount = Number(summary.rows.find((r: Record<string, unknown>) => r['status'] === 'failed')?.['count'] ?? 0)
      const dlqCount = pendingDLQ.rows.length
      const stuckCount = stuckEvents.rows.length
      const health = dlqCount > 0 || stuckCount > 0 ? 'degraded' : failedCount > 10 ? 'degraded' : 'ok'
      return {
        health,
        counts: { pending: pendingCount, failed: failedCount, dlq: dlqCount, stuck: stuckCount },
        byEventType: byEventType.rows.map((r: Record<string, unknown>) => ({
          eventType: r['event_type'], service: r['service'], status: r['status'],
          count: Number(r['count']), maxAttemptsSeen: Number(r['max_attempts_seen']),
          oldest: r['oldest'] ?? null,
        })),
        pendingDLQ: pendingDLQ.rows.map((r: Record<string, unknown>) => ({
          id: r['id'], eventType: r['event_type'], service: r['service'],
          priority: r['priority'], status: r['status'],
          totalAttempts: Number(r['total_attempts']), lastError: String(r['last_error'] ?? ''),
          errorHistory: r['error_history'] ?? [], createdAt: String(r['created_at']),
          reviewNotes: r['review_notes'] ?? null, retryOutboxId: r['retry_outbox_id'] ?? null,
        })),
        stuckEvents: stuckEvents.rows.map((r: Record<string, unknown>) => ({
          id: r['id'], service: r['service'], eventType: r['event_type'],
          status: r['status'], attempts: Number(r['attempts']),
          maxAttempts: Number(r['max_attempts']), lastError: r['last_error'] ?? null,
          nextRetryAt: r['next_retry_at'] ?? null, createdAt: String(r['created_at']),
          processedAt: r['processed_at'] ?? null, eventPriority: String(r['event_priority'] ?? 'normal'),
        })),
        generatedAt: new Date().toISOString(),
      }
    },

    outboxEvents: async (_: unknown, args: { status?: string; service?: string; eventType?: string; page?: number; limit?: number }, ctx: GQLContext) => {
      if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Forbidden')
      const page = Math.max(1, args.page ?? 1)
      const lim = Math.min(200, args.limit ?? 50)
      const conditions: string[] = []
      const values: unknown[] = []
      let p = 0
      if (args.status) { conditions.push(`status=$${++p}`); values.push(args.status) }
      if (args.service) { conditions.push(`service=$${++p}`); values.push(args.service) }
      if (args.eventType) { conditions.push(`event_type=$${++p}`); values.push(args.eventType) }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      values.push(lim, (page - 1) * lim)
      const result = await query(`SELECT id, service, event_type, status, attempts, max_attempts, last_error, next_retry_at, created_at, processed_at, event_priority FROM service_outbox ${where} ORDER BY created_at DESC LIMIT $${p+1} OFFSET $${p+2}`, values)
      const cnt = await query(`SELECT COUNT(*) FROM service_outbox ${where}`.trimEnd(), values.slice(0, p))
      return {
        items: result.rows.map((r: Record<string, unknown>) => ({
          id: r['id'], service: r['service'], eventType: r['event_type'], status: r['status'],
          attempts: Number(r['attempts']), maxAttempts: Number(r['max_attempts']),
          lastError: r['last_error'] ?? null, nextRetryAt: r['next_retry_at'] ?? null,
          createdAt: String(r['created_at']), processedAt: r['processed_at'] ?? null,
          eventPriority: String(r['event_priority'] ?? 'normal'),
          payload: r['payload'] ?? null,
        })),
        total: parseInt(String(cnt.rows[0]?.['count'] ?? '0')),
        page,
        limit: lim,
      }
    },

    outboxDLQ: async (_: unknown, args: { status?: string; priority?: string; eventType?: string; page?: number; limit?: number }, ctx: GQLContext) => {
      if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Forbidden')
      const page = Math.max(1, args.page ?? 1)
      const lim = Math.min(200, args.limit ?? 50)
      const conditions: string[] = [`status=$1`]
      const values: unknown[] = [args.status ?? 'pending']
      let p = 1
      if (args.priority) { conditions.push(`priority=$${++p}`); values.push(args.priority) }
      if (args.eventType) { conditions.push(`event_type=$${++p}`); values.push(args.eventType) }
      const filterValues = values.slice()
      values.push(lim, (page - 1) * lim)
      const result = await query(`SELECT dl.*, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS reviewed_by_email FROM outbox_dead_letters dl LEFT JOIN users u ON u.id=dl.reviewed_by WHERE ${conditions.join(' AND ')} ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END, created_at DESC LIMIT $${p+1} OFFSET $${p+2}`, values)
      const cnt = await query(`SELECT COUNT(*) FROM outbox_dead_letters WHERE ${conditions.join(' AND ')}`, filterValues)
      return {
        items: result.rows.map((r: Record<string, unknown>) => ({
          id: r['id'], eventType: r['event_type'], service: r['service'],
          priority: r['priority'], status: r['status'], totalAttempts: Number(r['total_attempts']),
          lastError: String(r['last_error'] ?? ''), errorHistory: r['error_history'] ?? [],
          createdAt: String(r['created_at']), reviewedByEmail: r['reviewed_by_email'] ?? null,
          reviewNotes: r['review_notes'] ?? null, retryOutboxId: r['retry_outbox_id'] ?? null,
          payload: r['payload'] ?? null,
        })),
        total: parseInt(String(cnt.rows[0]?.['count'] ?? '0')),
        page,
        limit: lim,
      }
    },

    outboxDLQEntry: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Forbidden')
      const result = await query(`SELECT dl.*, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS reviewed_by_email FROM outbox_dead_letters dl LEFT JOIN users u ON u.id=dl.reviewed_by WHERE dl.id=$1`, [args.id])
      if (!result.rows[0]) return null
      const r = result.rows[0] as Record<string, unknown>
      return {
        id: r['id'], eventType: r['event_type'], service: r['service'],
        priority: r['priority'], status: r['status'], totalAttempts: Number(r['total_attempts']),
        lastError: String(r['last_error'] ?? ''), errorHistory: r['error_history'] ?? [],
        createdAt: String(r['created_at']), reviewedByEmail: r['reviewed_by_email'] ?? null,
        reviewNotes: r['review_notes'] ?? null, retryOutboxId: r['retry_outbox_id'] ?? null,
      }
    },

    // FX monitoring
    fxRateStaleness: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const PAIRS = [
        { from: 'USD', to: 'IQD' }, { from: 'EUR', to: 'IQD' },
        { from: 'GBP', to: 'IQD' }, { from: 'IQD', to: 'USD' }, { from: 'IQD', to: 'EUR' },
      ]
      const statuses = await checkRateStaleness(ctx.auth.companyId, PAIRS)
      const hasAnyCritical = statuses.some((s) => s.status === 'critical' || s.status === 'missing')
      const hasAnyWarn = statuses.some((s) => s.status === 'warn')
      return {
        overall: hasAnyCritical ? 'critical' : hasAnyWarn ? 'warn' : 'ok',
        pairs: statuses.map((s) => ({
          currencyPair: s.currencyPair,
          lastRateDate: s.lastRateDate?.toISOString() ?? null,
          ageHours: s.ageHours,
          status: s.status,
          lastRate: s.lastRate,
          message: s.message,
        })),
      }
    },

    fxSyncHistory: async (_: unknown, args: { page?: number; limit?: number }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const page = Math.max(1, args.page ?? 1)
      const lim = Math.min(100, args.limit ?? 20)
      const offset = (page - 1) * lim
      const result = await query(
        `SELECT fsl.*, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS triggered_by_email FROM fx_rate_sync_log fsl LEFT JOIN users u ON u.id=fsl.triggered_by ORDER BY fsl.created_at DESC LIMIT $1 OFFSET $2`,
        [lim, offset],
      )
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r['id'], syncType: r['sync_type'], source: r['source'], status: r['status'],
        ratesUpdated: Number(r['rates_updated']), ratesSkipped: Number(r['rates_skipped']),
        errorMessage: r['error_message'] ?? null, durationMs: r['duration_ms'] ? Number(r['duration_ms']) : null,
        triggeredByEmail: r['triggered_by_email'] ?? null, createdAt: String(r['created_at']),
      }))
    },

    fxRateChangeLog: async (_: unknown, args: { fromCurrency?: string; toCurrency?: string; days?: number }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const days = Math.min(365, Math.max(1, args.days ?? 30))
      const conditions: string[] = [`frc.created_at >= NOW() - INTERVAL '${days} days'`]
      const values: unknown[] = []
      let p = 0
      if (args.fromCurrency) { conditions.push(`frc.from_currency=$${++p}`); values.push(args.fromCurrency) }
      if (args.toCurrency) { conditions.push(`frc.to_currency=$${++p}`); values.push(args.toCurrency) }
      const result = await query(
        `SELECT frc.* FROM fx_rate_changes frc WHERE ${conditions.join(' AND ')} ORDER BY frc.rate_date DESC, frc.created_at DESC LIMIT 200`,
        values,
      )
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r['id'], fromCurrency: r['from_currency'], toCurrency: r['to_currency'],
        rateDate: String(r['rate_date']), rate: parseFloat(String(r['rate'])),
        previousRate: r['previous_rate'] != null ? parseFloat(String(r['previous_rate'])) : null,
        changePct: r['change_pct'] != null ? parseFloat(String(r['change_pct'])) : null,
        source: r['source'], createdAt: String(r['created_at']),
      }))
    },

    outboxEventConfigs: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Forbidden')
      const result = await query(`SELECT * FROM outbox_event_configs ORDER BY dlq_priority, event_type`)
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r['id'], eventType: r['event_type'], maxAttempts: Number(r['max_attempts']),
        initialRetryDelaySeconds: Number(r['initial_retry_delay_seconds']),
        backoffMultiplier: parseFloat(String(r['backoff_multiplier'])),
        maxRetryDelaySeconds: Number(r['max_retry_delay_seconds']),
        dlqPriority: r['dlq_priority'], alertOnDlq: Boolean(r['alert_on_dlq']),
        description: r['description'] ?? null,
      }))
    },

    consolidatedTrialBalance: async (_: unknown, args: { asOfDate?: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const dateClause = args.asOfDate ? `AND je.entry_date <= '${args.asOfDate}'` : ''
      return (
        await query(
          `SELECT coa.account_type, coa.code AS account_code, coa.name AS account_name,
                c.id AS company_id, c.name AS company_name,
                SUM(jl.debit*jl.fx_rate) AS total_debit_iqd,
                SUM(jl.credit*jl.fx_rate) AS total_credit_iqd,
                SUM((jl.debit-jl.credit)*jl.fx_rate) AS balance_iqd
         FROM journal_lines jl
         JOIN journal_entries je ON je.id=jl.journal_entry_id
         JOIN chart_of_accounts coa ON coa.id=jl.account_id
         JOIN companies c ON c.id=je.company_id
         WHERE je.status='posted' ${dateClause}
         GROUP BY coa.account_type, coa.code, coa.name, c.id, c.name
         ORDER BY coa.code`,
        )
      ).rows
    },

    // ── Phase 2: Finance queries ─────────────────────────────────

    account: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const r = await query(
        `SELECT coa.*, p.code AS parent_code, p.name AS parent_name,
                (SELECT COUNT(*)>0 FROM journal_lines jl
                 JOIN journal_entries je ON je.id=jl.journal_entry_id
                 WHERE jl.account_id=coa.id AND je.status='posted') AS has_posted_lines
         FROM chart_of_accounts coa
         LEFT JOIN chart_of_accounts p ON p.id=coa.parent_id
         WHERE coa.id=$1 AND coa.company_id=$2`,
        [args.id, ctx.auth.companyId],
      )
      return r.rows[0] ?? null
    },

    accountLedger: async (
      _: unknown,
      args: { accountId: string; fromDate?: string; toDate?: string; page?: number; limit?: number },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const page = Math.max(1, args.page ?? 1)
      const lim = Math.min(200, args.limit ?? 50)
      const offset = (page - 1) * lim
      const conditions: string[] = ['jl.account_id=$1', 'je.company_id=$2', "je.status='posted'"]
      const params: unknown[] = [args.accountId, ctx.auth.companyId]
      let idx = 3
      if (args.fromDate) { conditions.push(`je.entry_date>=$${idx++}`); params.push(args.fromDate) }
      if (args.toDate) { conditions.push(`je.entry_date<=$${idx++}`); params.push(args.toDate) }
      const where = conditions.join(' AND ')
      const [rows, totals, cnt] = await Promise.all([
        query(
          `SELECT jl.id, je.entry_date AS date, je.reference, jl.description,
                  jl.debit, jl.credit, je.id AS journal_entry_id,
                  SUM(jl.debit - jl.credit) OVER (ORDER BY je.entry_date, je.id ROWS UNBOUNDED PRECEDING) AS running_balance
           FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
           WHERE ${where} ORDER BY je.entry_date, je.id LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, lim, offset],
        ),
        query(
          `SELECT COALESCE(SUM(jl.debit),0) AS total_debit, COALESCE(SUM(jl.credit),0) AS total_credit,
                  COALESCE(SUM(jl.debit-jl.credit),0) AS net_balance
           FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE ${where}`,
          params,
        ),
        query(
          `SELECT COUNT(*) AS total FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE ${where}`,
          params,
        ),
      ])
      const t = totals.rows[0] as Record<string, unknown>
      return {
        items: rows.rows,
        total: Number(cnt.rows[0]?.['total'] ?? 0),
        page,
        limit: lim,
        totalDebit: String(t?.['total_debit'] ?? '0'),
        totalCredit: String(t?.['total_credit'] ?? '0'),
        netBalance: String(t?.['net_balance'] ?? '0'),
      }
    },

    journalEntry: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const [je, lines, linkedPos] = await Promise.all([
        query(
          `SELECT je.*, co.journal_template_image,
                  COALESCE(u.first_name  || ' ' || u.last_name,  u.email)  AS created_by_email,
                  COALESCE(ac.first_name || ' ' || ac.last_name, ac.email) AS accountant_email,
                  COALESCE(au.first_name || ' ' || au.last_name, au.email) AS auditor_email,
                  COALESCE(SUM(jl.debit),0)  AS total_debit,
                  COALESCE(SUM(jl.credit),0) AS total_credit
           FROM journal_entries je
           LEFT JOIN companies co ON co.id=je.company_id
           LEFT JOIN users u  ON u.id=je.created_by
           LEFT JOIN users ac ON ac.id=je.accountant_id
           LEFT JOIN users au ON au.id=je.audited_by
           LEFT JOIN journal_lines jl ON jl.journal_entry_id=je.id
           WHERE je.id=$1 AND je.company_id=$2
           GROUP BY je.id, co.journal_template_image, u.email, u.first_name, u.last_name, ac.email, ac.first_name, ac.last_name, au.email, au.first_name, au.last_name`,
          [args.id, ctx.auth.companyId],
        ),
        query(
          `SELECT jl.*, coa.code AS account_code, coa.name AS account_name
           FROM journal_lines jl JOIN chart_of_accounts coa ON coa.id=jl.account_id
           WHERE jl.journal_entry_id=$1 ORDER BY jl.id`,
          [args.id],
        ),
        query(
          `SELECT DISTINCT ON (po.id) po.id AS po_id, po.po_number, v.name AS vendor_name, po.status, po.total_amount, po.currency_code
           FROM (
             -- Explicitly linked POs via junction table
             SELECT jpl.po_id FROM journal_po_links jpl WHERE jpl.journal_entry_id=$1
             UNION
             -- Auto-link: PO that sourced this journal (po_completion, po_receipt, etc.)
             SELECT je.source_id FROM journal_entries je
             WHERE je.id=$1
               AND je.source_type IN ('po_completion','po_receipt','po_invoice','purchase_order')
               AND je.source_id IS NOT NULL
           ) src
           JOIN purchase_orders po ON po.id=src.po_id
           LEFT JOIN vendors v ON v.id=po.vendor_id`, [args.id],
        ),
      ])
      if (!je.rows[0]) return null
      return { ...je.rows[0], lines: lines.rows, linked_pos: linkedPos.rows }
    },

    paymentVouchers: async (_: unknown, args: { status?: string; fromDate?: string; toDate?: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      let sql = `
        SELECT pv.*,
               COALESCE(u.first_name  || ' ' || u.last_name,  u.email)  AS created_by_email,
               COALESCE(cb.first_name || ' ' || cb.last_name, cb.email) AS cashier_email,
               COALESCE(ab.first_name || ' ' || ab.last_name, ab.email) AS auditor_email,
               (SELECT COUNT(*) FROM payment_voucher_journals pvj WHERE pvj.payment_voucher_id=pv.id) AS journal_count
        FROM payment_vouchers pv
        LEFT JOIN users u  ON u.id=pv.created_by
        LEFT JOIN users cb ON cb.id=pv.cashier_id
        LEFT JOIN users ab ON ab.id=pv.audited_by
        WHERE pv.company_id=$1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.status)   { sql += ` AND pv.status=$${idx++}`;         params.push(args.status) }
      if (args.fromDate) { sql += ` AND pv.voucher_date>=$${idx++}`;  params.push(args.fromDate) }
      if (args.toDate)   { sql += ` AND pv.voucher_date<=$${idx++}`;  params.push(args.toDate) }
      sql += ' ORDER BY pv.voucher_date DESC, pv.created_at DESC LIMIT 200'
      return (await query(sql, params)).rows
    },

    paymentVoucher: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const [pv, lines, journals] = await Promise.all([
        query(
          `SELECT pv.*, co.pv_template_image,
                  COALESCE(u.first_name  || ' ' || u.last_name,  u.email)  AS created_by_email,
                  COALESCE(cb.first_name || ' ' || cb.last_name, cb.email) AS cashier_email,
                  COALESCE(ab.first_name || ' ' || ab.last_name, ab.email) AS auditor_email
           FROM payment_vouchers pv
           LEFT JOIN companies co ON co.id=pv.company_id
           LEFT JOIN users u  ON u.id=pv.created_by
           LEFT JOIN users cb ON cb.id=pv.cashier_id
           LEFT JOIN users ab ON ab.id=pv.audited_by
           WHERE pv.id=$1 AND pv.company_id=$2`, [args.id, ctx.auth.companyId]),
        query(`SELECT * FROM payment_voucher_lines WHERE payment_voucher_id=$1 ORDER BY sequence`, [args.id]),
        query(
          `SELECT je.id, je.reference, je.entry_date, je.status, je.description, je.audited_at,
                  COALESCE(json_agg(DISTINCT jsonb_build_object('po_id',jpl.po_id,'po_number',po.po_number,'vendor_name',v.name,'status',po.status,'total_amount',po.total_amount::text,'currency_code',po.currency_code))
                    FILTER (WHERE jpl.po_id IS NOT NULL), '[]') AS linked_pos
           FROM payment_voucher_journals pvj
           JOIN journal_entries je ON je.id=pvj.journal_entry_id
           LEFT JOIN journal_po_links jpl ON jpl.journal_entry_id=je.id
           LEFT JOIN purchase_orders po ON po.id=jpl.po_id
           LEFT JOIN vendors v ON v.id=po.vendor_id
           WHERE pvj.payment_voucher_id=$1
           GROUP BY je.id`, [args.id]),
      ])
      if (!pv.rows[0]) return null
      return { ...pv.rows[0], lines: lines.rows, journals: journals.rows }
    },

    fxRates: async (
      _: unknown,
      args: { fromCurrency?: string; toCurrency?: string; fromDate?: string; toDate?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT fr.* FROM fx_rates fr WHERE 1=1`
      const params: unknown[] = []
      let idx = 1
      if (args.fromCurrency) { sql += ` AND fr.from_currency=$${idx++}`; params.push(args.fromCurrency) }
      if (args.toCurrency) { sql += ` AND fr.to_currency=$${idx++}`; params.push(args.toCurrency) }
      if (args.fromDate) { sql += ` AND fr.rate_date>=$${idx++}`; params.push(args.fromDate) }
      if (args.toDate) { sql += ` AND fr.rate_date<=$${idx++}`; params.push(args.toDate) }
      sql += ' ORDER BY fr.rate_date DESC LIMIT 200'
      return (await query(sql, params)).rows
    },

    accountingPeriods: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return []
      return (
        await query(
          `SELECT ap.*, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS closed_by_email FROM accounting_periods ap LEFT JOIN users u ON u.id=ap.closed_by WHERE ap.company_id=$1 ORDER BY ap.start_date DESC`,
          [ctx.auth.companyId],
        )
      ).rows
    },

    profitLoss: async (
      _: unknown,
      args: { fromDate: string; toDate: string; costCenterId?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const params: unknown[] = [ctx.auth.companyId, args.fromDate, args.toDate]
      let costFilter = ''
      if (args.costCenterId) { costFilter = ` AND jl.cost_center_id=$4`; params.push(args.costCenterId) }
      const rows = (
        await query(
          `SELECT coa.id AS account_id, coa.code, coa.name, coa.account_type,
                  SUM(jl.credit - jl.debit) AS amount
           FROM journal_lines jl
           JOIN journal_entries je ON je.id=jl.journal_entry_id
           JOIN chart_of_accounts coa ON coa.id=jl.account_id
           WHERE je.company_id=$1 AND je.entry_date>=$2 AND je.entry_date<=$3
             AND je.status='posted' AND coa.account_type IN ('revenue','expense')${costFilter}
           GROUP BY coa.id, coa.code, coa.name, coa.account_type ORDER BY coa.code`,
          params,
        )
      ).rows as Array<{ account_id: string; code: string; name: string; account_type: string; amount: string }>
      const revenue = rows.filter((r) => r.account_type === 'revenue')
      const expenses = rows.filter((r) => r.account_type === 'expense')
      const totalRevenue = revenue.reduce((s, r) => s + parseFloat(r.amount ?? '0'), 0)
      const totalExpenses = expenses.reduce((s, r) => s + parseFloat(r.amount ?? '0'), 0)
      return {
        revenue,
        expenses,
        totalRevenue: String(totalRevenue),
        totalExpenses: String(totalExpenses),
        netProfit: String(totalRevenue - totalExpenses),
      }
    },

    balanceSheet: async (_: unknown, args: { asOfDate: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const params = [ctx.auth.companyId, args.asOfDate]

      // Use amount_company_currency (IQD base) for FX-consistent totals.
      // Assets are debit-normal (debit adds, credit subtracts).
      // Liabilities/equity are credit-normal (credit adds, debit subtracts).
      const bsRows = (await query(
        `SELECT coa.id AS account_id, coa.code, coa.name, coa.account_type,
                COALESCE(SUM(
                  CASE WHEN coa.account_type = 'asset'
                       THEN CASE WHEN jl.debit > 0 THEN jl.amount_company_currency ELSE -jl.amount_company_currency END
                       ELSE CASE WHEN jl.credit > 0 THEN jl.amount_company_currency ELSE -jl.amount_company_currency END
                  END
                ), 0) AS amount
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE je.company_id = $1 AND je.entry_date <= $2 AND je.status = 'posted'
           AND coa.account_type IN ('asset','liability','equity')
         GROUP BY coa.id, coa.code, coa.name, coa.account_type ORDER BY coa.code`,
        params,
      )).rows as Array<{ account_id: string; code: string; name: string; account_type: string; amount: string }>

      // Retained earnings = net of all revenue (credit-normal) and expense (debit-normal) accounts.
      // Revenue credits increase retained earnings; expense debits decrease it.
      const reRes = await query(
        `SELECT COALESCE(SUM(
           CASE
             WHEN coa.account_type = 'revenue'
               THEN CASE WHEN jl.credit > 0 THEN jl.amount_company_currency ELSE -jl.amount_company_currency END
             WHEN coa.account_type = 'expense'
               THEN CASE WHEN jl.debit  > 0 THEN -jl.amount_company_currency ELSE jl.amount_company_currency END
           END
         ), 0) AS retained_earnings
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE je.company_id = $1 AND je.entry_date <= $2 AND je.status = 'posted'
           AND coa.account_type IN ('revenue','expense')`,
        params,
      )
      const retainedEarnings = parseFloat(String(reRes.rows[0]?.['retained_earnings'] ?? 0))

      const assets      = bsRows.filter((r) => r.account_type === 'asset')
      const liabilities = bsRows.filter((r) => r.account_type === 'liability')
      const equity      = bsRows.filter((r) => r.account_type === 'equity')

      const totalAssets      = assets.reduce((s, r) => s + parseFloat(r.amount ?? '0'), 0)
      const totalLiabilities = liabilities.reduce((s, r) => s + parseFloat(r.amount ?? '0'), 0)
      const totalEquityAccts = equity.reduce((s, r) => s + parseFloat(r.amount ?? '0'), 0)
      const totalEquity      = totalEquityAccts + retainedEarnings

      return {
        assets, liabilities, equity,
        retainedEarnings: String(retainedEarnings),
        totalAssets: String(totalAssets),
        totalLiabilities: String(totalLiabilities),
        totalEquity: String(totalEquity),
        isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
      }
    },

    analyticAccounts: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return []
      return (await query('SELECT * FROM analytic_accounts WHERE company_id=$1 ORDER BY name', [ctx.auth.companyId])).rows
    },

    costCenters: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return []
      return (await query('SELECT * FROM cost_centers WHERE company_id=$1 ORDER BY name', [ctx.auth.companyId])).rows
    },

    // ── Phase 2: Procurement queries ─────────────────────────────

    vendor: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const r = await query('SELECT * FROM vendors WHERE id=$1 AND company_id=$2', [args.id, ctx.auth.companyId])
      return r.rows[0] ?? null
    },

    purchaseOrder: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      try {
        const [po, lines, receipts, approvals] = await Promise.all([
          query(
            `SELECT po.*, v.name AS vendor_name, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS created_by_email,
                    aa.name AS analytic_account_name, COALESCE(au.first_name || ' ' || au.last_name, au.email) AS assigned_to_email,
                    po.linked_project_id AS "linkedProjectId", po.linked_mo_id AS "linkedMoId",
                    COALESCE(NULLIF(TRIM(re.first_name || ' ' || re.last_name), ''), re.email) AS assigned_receiver_name
             FROM purchase_orders po
             LEFT JOIN vendors v ON v.id=po.vendor_id
             LEFT JOIN users u ON u.id=po.created_by
             LEFT JOIN analytic_accounts aa ON aa.id=po.analytic_account_id
             LEFT JOIN users au ON au.id=po.assigned_to
             LEFT JOIN employees re ON re.id=po.assigned_receiver_id
             WHERE po.id=$1 AND po.company_id=$2`,
            [args.id, ctx.auth.companyId],
          ),
          query(
            `SELECT pol.id, pol.po_id, pol.description, pol.product_id, pol.qty_ordered AS qty,
                    pol.qty_received, pol.unit_price, pol.total_price AS total, pol.currency_code, pol.uom,
                    pol.actual_unit_price,
                    pol.store_price, pol.store_price_currency,
                    pol.market_price, pol.market_price_currency, pol.verified_price, pol.verified_price_currency,
                    pol.in_stock, pol.qty_from_stock,
                    pol.audit_status, pol.audit_note, pol.audit_flagged_by_email, pol.audit_flagged_at,
                    pol.line_number, p.name AS product_name
             FROM po_lines pol LEFT JOIN products p ON p.id=pol.product_id
             WHERE pol.po_id=$1 ORDER BY pol.line_number`,
            [args.id],
          ),
          query(
            `SELECT por.id, por.po_id, por.receipt_number, por.received_date AS receipt_date,
                    por.received_by, por.received_by_name, por.location_notes, por.notes, por.created_at, por.is_invoiced,
                    sl.name AS location_name, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS received_by_email,
                    COALESCE(json_agg(DISTINCT jsonb_build_object('po_line_id',porl.po_line_id,'qty_received',porl.qty_received,'description',COALESCE(pol.description, ''))) FILTER (WHERE porl.id IS NOT NULL), '[]') AS lines,
                    COALESCE(json_agg(DISTINCT jsonb_build_object('id',da.id,'fileId',f.id,'label',da.label,'originalFilename',f.original_filename,'fileKey',f.file_key,'createdAt',da.created_at)) FILTER (WHERE da.id IS NOT NULL), '[]') AS photos
             FROM po_receipts por
             LEFT JOIN stock_locations sl ON sl.id=por.warehouse_location_id
             LEFT JOIN users u ON u.id=por.received_by
             LEFT JOIN po_receipt_lines porl ON porl.receipt_id=por.id
             LEFT JOIN po_lines pol ON pol.id=porl.po_line_id
             LEFT JOIN document_attachments da ON da.entity_type='po_receipt' AND da.entity_id=por.id
             LEFT JOIN files f ON f.id=da.file_id AND f.status='uploaded'
             WHERE por.po_id=$1
             GROUP BY por.id, sl.name, u.email, u.first_name, u.last_name ORDER BY por.received_date`,
            [args.id],
          ),
          query(
            `SELECT poa.id, poa.po_id, poa.from_status, poa.to_status, poa.action, poa.notes, poa.created_at,
                    COALESCE(u.first_name || ' ' || u.last_name, u.email) AS user_email
             FROM po_approval_log poa LEFT JOIN users u ON u.id=poa.actor_id
             WHERE poa.po_id=$1 ORDER BY poa.created_at`,
            [args.id],
          ),
        ])
        if (!po.rows[0]) return null
        let editRequests: unknown[] = []
        try {
          const er = await query(
            `SELECT er.*, req.email AS requested_by_email, rev.email AS reviewed_by_email
             FROM po_edit_requests er
             JOIN users req ON req.id = er.requested_by
             LEFT JOIN users rev ON rev.id = er.reviewed_by
             WHERE er.po_id = $1 ORDER BY er.created_at DESC`,
            [args.id],
          )
          editRequests = er.rows.map((r) => ({ ...r, changes: JSON.stringify(r.changes) }))
        } catch { /* ignore if table absent */ }
        const receiptsWithUrls = await Promise.all(
          receipts.rows.map(async (r) => {
            const row = r as Record<string, unknown>
            const photos = (row['photos'] as Array<Record<string, unknown>>) ?? []
            const photosWithUrls = await Promise.all(
              photos.map(async (ph) => {
                const fileKey = ph['fileKey'] as string | undefined
                if (!fileKey) return { ...ph, downloadUrl: null }
                try {
                  const { downloadUrl } = await generateDownloadUrl(fileKey, ph['originalFilename'] as string)
                  return { ...ph, downloadUrl }
                } catch {
                  return { ...ph, downloadUrl: null }
                }
              }),
            )
            return { ...row, photos: photosWithUrls }
          }),
        )
        return { ...po.rows[0], lines: lines.rows, receipts: receiptsWithUrls, approval_log: approvals.rows, edit_requests: editRequests }
      } catch { return null }
    },

    myApprovalQueue: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const empResult = await query(
        `SELECT id, department_id FROM employees WHERE user_id=$1 AND company_id=$2 LIMIT 1`,
        [ctx.auth.userId, ctx.auth.companyId],
      )
      const employeeId: string | null = (empResult.rows[0]?.['id'] as string | null) ?? null
      const departmentId: string | null = (empResult.rows[0]?.['department_id'] as string | null) ?? null
      return (
        await query(
          `SELECT DISTINCT po.*, v.name AS vendor_name, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS assigned_to_email,
                  (SELECT created_at FROM po_approval_log WHERE po_id=po.id AND action='submitted' LIMIT 1) AS submitted_at
           FROM purchase_orders po
           LEFT JOIN vendors v ON v.id=po.vendor_id
           LEFT JOIN users u ON u.id=po.assigned_to
           WHERE po.company_id=$1
             AND po.status NOT IN ('deleted','completed')
             AND (
               (po.organizer_id=$2 AND po.status IN ('opening','review'))
               OR (po.status='inventory_check' AND EXISTS (
                     SELECT 1 FROM po_position_assignments ppa
                     WHERE ppa.employee_id=$3 AND ppa.position='store_keeper' AND ppa.is_active=true
                       AND (ppa.project_id=po.project_id OR ppa.department_id=$4)))
               OR (po.status='store_pricing' AND EXISTS (
                     SELECT 1 FROM po_position_assignments ppa
                     WHERE ppa.employee_id=$3 AND ppa.position='store_pricing' AND ppa.is_active=true
                       AND (ppa.project_id=po.project_id OR ppa.department_id=$4)))
               OR (po.status='market_pricing' AND EXISTS (
                     SELECT 1 FROM po_position_assignments ppa
                     WHERE ppa.employee_id=$3 AND ppa.position='procurement_officer' AND ppa.is_active=true
                       AND (ppa.project_id=po.project_id OR ppa.department_id=$4)))
               OR (po.status='price_verification' AND EXISTS (
                     SELECT 1 FROM po_position_assignments ppa
                     WHERE ppa.employee_id=$3 AND ppa.position='procurement_2nd' AND ppa.is_active=true
                       AND (ppa.project_id=po.project_id OR ppa.department_id=$4)))
               OR (po.status IN ('pending_approval','dept_assigned') AND (
                     EXISTS (SELECT 1 FROM departments d WHERE d.manager_id=$3 AND d.id=$4)
                     OR po.assigned_approver_id=$3))
               OR ($5='system_admin' AND po.status IN (
                     'inventory_check','store_pricing','market_pricing',
                     'price_verification','pending_approval','dept_assigned'))
             )
           ORDER BY po.created_at DESC`,
          [ctx.auth.companyId, ctx.auth.userId, employeeId, departmentId, ctx.auth.role],
        )
      ).rows
    },

    // ── Phase 2: Inventory queries ───────────────────────────────

    product: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const [prod, balances] = await Promise.all([
        query(
          `SELECT p.*,
                  (SELECT COUNT(*)>0 FROM stock_moves WHERE product_id=p.id) AS has_stock_moves
           FROM products p WHERE p.id=$1 AND p.company_id=$2`,
          [args.id, ctx.auth.companyId],
        ),
        query(
          `SELECT sb.*, sl.name AS location_name, sl.type AS location_type,
                  sb.qty_on_hand - sb.qty_reserved AS available,
                  sb.qty_on_hand * sb.average_cost AS total_value
           FROM stock_balances sb JOIN stock_locations sl ON sl.id=sb.location_id
           WHERE sb.product_id=$1 AND sl.type NOT IN ('virtual_in','virtual_out')`,
          [args.id],
        ),
      ])
      if (!prod.rows[0]) return null
      return { ...prod.rows[0], balances: balances.rows }
    },

    stockLocations: async (_: unknown, args: { type?: string; isActive?: boolean; companyId?: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      const cid = args.companyId ?? ctx.auth.companyId
      let sql = `SELECT sl.*, p.name AS parent_name FROM stock_locations sl LEFT JOIN stock_locations p ON p.id=sl.parent_id WHERE sl.company_id=$1`
      const params: unknown[] = [cid]
      let idx = 2
      if (args.type !== undefined) { sql += ` AND sl.type=$${idx++}`; params.push(args.type) }
      if (args.isActive !== undefined) { sql += ` AND sl.is_active=$${idx++}`; params.push(args.isActive) }
      sql += ' ORDER BY sl.name'
      return (await query(sql, params)).rows
    },

    stockBalanceSnapshot: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const rows = (
        await query(
          `SELECT p.id AS product_id, p.sku, p.name AS product_name, p.category,
                  sl.id AS location_id, sl.name AS location_name, sl.type AS location_type,
                  sb.qty_on_hand, sb.qty_reserved,
                  sb.qty_on_hand - sb.qty_reserved AS available,
                  sb.average_cost,
                  sb.qty_on_hand * sb.average_cost AS total_value,
                  (p.reorder_point IS NOT NULL AND sb.qty_on_hand < p.reorder_point) AS is_low_stock
           FROM stock_balances sb
           JOIN products p ON p.id=sb.product_id
           JOIN stock_locations sl ON sl.id=sb.location_id
           WHERE sl.company_id=$1 AND sl.type NOT IN ('virtual_in','virtual_out') AND sb.qty_on_hand > 0
           ORDER BY p.sku, sl.name`,
          [ctx.auth.companyId],
        )
      ).rows as Array<Record<string, unknown>>
      const totalValue = rows.reduce((s, r) => s + parseFloat(String(r['total_value'] ?? '0')), 0)
      return { totalValue: String(totalValue), currency: 'IQD', rows }
    },

    stockMoves: async (
      _: unknown,
      args: { productId?: string; fromLocationId?: string; toLocationId?: string; sourceType?: string; fromDate?: string; toDate?: string; page?: number; limit?: number },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) return []
      let sql = `SELECT sm.*, sm.moved_at AS move_date, p.name AS product_name, p.sku,
                        fl.name AS from_location_name, tl.name AS to_location_name,
                        sl.lot_number, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS moved_by_email
                 FROM stock_moves sm
                 JOIN products p ON p.id=sm.product_id
                 JOIN stock_locations fl ON fl.id=sm.from_location_id
                 JOIN stock_locations tl ON tl.id=sm.to_location_id
                 LEFT JOIN stock_lots sl ON sl.id=sm.lot_id
                 LEFT JOIN users u ON u.id=sm.moved_by
                 WHERE p.company_id=$1`
      const params: unknown[] = [ctx.auth.companyId]
      let idx = 2
      if (args.productId) { sql += ` AND sm.product_id=$${idx++}`; params.push(args.productId) }
      if (args.fromLocationId) { sql += ` AND sm.from_location_id=$${idx++}`; params.push(args.fromLocationId) }
      if (args.toLocationId) { sql += ` AND sm.to_location_id=$${idx++}`; params.push(args.toLocationId) }
      if (args.sourceType) { sql += ` AND sm.source_type=$${idx++}`; params.push(args.sourceType) }
      if (args.fromDate) { sql += ` AND sm.moved_at>=$${idx++}`; params.push(args.fromDate) }
      if (args.toDate) { sql += ` AND sm.moved_at<=$${idx++}`; params.push(args.toDate) }
      const page = Math.max(1, args.page ?? 1)
      const lim = Math.min(500, args.limit ?? 100)
      sql += ` ORDER BY sm.moved_at DESC, sm.id DESC LIMIT $${idx} OFFSET $${idx + 1}`
      params.push(lim, (page - 1) * lim)
      return (await query(sql, params)).rows
    },

    stockLots: async (_: unknown, args: { productId?: string }, ctx: GQLContext) => {
      if (!ctx.auth) return []
      let sql = `SELECT sl.*, p.name AS product_name, p.sku,
                        loc.name AS current_location_name
                 FROM stock_lots sl
                 JOIN products p ON p.id=sl.product_id
                 LEFT JOIN stock_locations loc ON loc.id=sl.current_location_id
                 WHERE p.company_id=$1`
      const params: unknown[] = [ctx.auth.companyId]
      if (args.productId) { sql += ` AND sl.product_id=$2`; params.push(args.productId) }
      sql += ' ORDER BY sl.created_at DESC LIMIT 500'
      return (await query(sql, params)).rows
    },

    stockLot: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) return null
      const [lot, moves] = await Promise.all([
        query(
          `SELECT sl.*, p.name AS product_name, p.sku, loc.name AS current_location_name
           FROM stock_lots sl JOIN products p ON p.id=sl.product_id
           LEFT JOIN stock_locations loc ON loc.id=sl.current_location_id
           WHERE sl.id=$1 AND p.company_id=$2`,
          [args.id, ctx.auth.companyId],
        ),
        query(
          `SELECT sm.id, sm.moved_at AS move_date,
                  CASE WHEN sm.to_location_id IS NOT NULL THEN 'in' ELSE 'out' END AS direction,
                  fl.name AS from_location_name, tl.name AS to_location_name,
                  sm.qty, sm.source_type, sm.notes AS reference, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS moved_by_email
           FROM stock_moves sm
           LEFT JOIN stock_locations fl ON fl.id=sm.from_location_id
           LEFT JOIN stock_locations tl ON tl.id=sm.to_location_id
           LEFT JOIN users u ON u.id=sm.moved_by
           WHERE sm.lot_id=$1 ORDER BY sm.moved_at`,
          [args.id],
        ),
      ])
      if (!lot.rows[0]) return null
      return { ...lot.rows[0], moves: moves.rows }
    },

  // ── Permission System ─────────────────────────────────────────────────────────

  userPermissions: async (_: unknown, args: { userId: string; companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    if (ctx.auth.role !== 'system_admin' && ctx.auth.userId !== args.userId) throw new Error('Forbidden')
    const userRow = await query(`SELECT role FROM users WHERE id=$1`, [args.userId])
    const role = (userRow.rows[0] as Record<string, string> | undefined)?.['role'] ?? ''
    const isAdmin = ['system_admin', 'company_admin'].includes(role)
    const permsRes = await query(
      `SELECT up.permission_key AS key, p.label, p.module, p.submodule, up.access_level AS "accessLevel"
       FROM user_permissions up
       JOIN permissions p ON p.key = up.permission_key
       WHERE up.user_id=$1 AND up.company_id=$2`,
      [args.userId, args.companyId],
    )
    return {
      userId: args.userId,
      companyId: args.companyId,
      isAdmin,
      permissions: permsRes.rows.map((r: Record<string, string>) => ({
        key: r['key'],
        label: r['label'],
        module: r['module'],
        submodule: r['submodule'],
        accessLevel: r['accessLevel'],
      })),
    }
  },

  userCompanies: async (_: unknown, args: { userId: string }, ctx: GQLContext) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Unauthorized')
    const res = await query(
      `SELECT DISTINCT c.id, c.name
       FROM companies c
       WHERE c.id IN (
         SELECT company_id FROM user_company_roles WHERE user_id=$1
         UNION
         SELECT company_id FROM user_permissions WHERE user_id=$1
       )
       ORDER BY c.name`,
      [args.userId],
    )
    return res.rows.map((r: Record<string, string>) => ({ id: r['id'], name: r['name'] }))
  },

  roleTemplates: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const res = await query(`SELECT * FROM role_templates ORDER BY is_system DESC, name ASC`)
    return Promise.all(
      res.rows.map(async (r: Record<string, unknown>) => {
        const perms = await query(
          `SELECT permission_key AS key, access_level AS "accessLevel" FROM role_template_permissions WHERE template_id=$1`,
          [r['id']],
        )
        return {
          id: r['id'],
          name: r['name'],
          description: r['description'] ?? null,
          isSystem: r['is_system'],
          createdAt: r['created_at'],
          permissions: perms.rows.map((p: Record<string, string>) => ({ key: p['key'], accessLevel: p['accessLevel'] })),
        }
      }),
    )
  },

  roleTemplate: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const res = await query(`SELECT * FROM role_templates WHERE id=$1`, [args.id])
    const r = res.rows[0] as Record<string, unknown> | undefined
    if (!r) return null
    const perms = await query(
      `SELECT permission_key AS key, access_level AS "accessLevel" FROM role_template_permissions WHERE template_id=$1`,
      [args.id],
    )
    return {
      id: r['id'],
      name: r['name'],
      description: r['description'] ?? null,
      isSystem: r['is_system'],
      createdAt: r['created_at'],
      permissions: perms.rows.map((p: Record<string, string>) => ({ key: p['key'], accessLevel: p['accessLevel'] })),
    }
  },

  userPOPositions: async (_: unknown, args: { userId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const res = await query(
      `SELECT ppa.id, ppa.employee_id AS "employeeId",
         (e.first_name || ' ' || e.last_name) AS "employeeName",
         ppa.position, ppa.project_id AS "projectId", proj.name AS "projectName",
         ppa.department_id AS "departmentId", d.name AS "departmentName",
         ppa.is_active AS "isActive", ppa.created_at AS "createdAt"
       FROM po_position_assignments ppa
       JOIN employees e ON e.id = ppa.employee_id
       LEFT JOIN projects proj ON proj.id = ppa.project_id
       LEFT JOIN departments d ON d.id = ppa.department_id
       WHERE e.user_id = $1`,
      [args.userId],
    )
    return res.rows
  },

  bankDetailsSummary: async (_: unknown, args: { employee_id: string }, ctx: GQLContext) => {
    if (!ctx.auth) return null
    const result = await query(
      `SELECT bank_account_encrypted FROM employees WHERE id=$1 AND company_id=$2`,
      [args.employee_id, ctx.auth.companyId],
    )
    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) return null
    try {
      const raw = row['bank_account_encrypted'] as string | null
      if (!raw) return { bank_name: null, currency_code: null, has_account: false }
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return {
        bank_name: parsed.bank_name ?? null,
        currency_code: parsed.currency_code ?? null,
        has_account: !!(parsed.account_number || parsed.iban),
      }
    } catch {
      return { bank_name: null, currency_code: null, has_account: false }
    }
  },
  },

  Mutation: {
    requestUploadUrl: async (
      _: unknown,
      args: { filename: string; mimeType: string; sizeBytes: number; category: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const maxSize = parseInt(process.env['MAX_FILE_SIZE_BYTES'] ?? '52428800')
      const validation = validateFile(args.filename, args.mimeType, args.sizeBytes, args.category, maxSize)
      if (!validation.valid) throw new Error(validation.reason)
      const upload = await generateUploadUrl({
        filename: args.filename,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        category: args.category,
        companyId: ctx.auth.companyId,
        uploadedBy: ctx.auth.userId,
      })
      await query(
        `INSERT INTO files (id, company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
        [
          upload.fileId, ctx.auth.companyId, ctx.auth.userId,
          upload.fileKey, args.filename, args.mimeType, args.sizeBytes, args.category,
        ],
      )
      return {
        uploadUrl: upload.uploadUrl,
        fileId: upload.fileId,
        fileKey: upload.fileKey,
        expiresInSeconds: upload.expiresInSeconds,
      }
    },

    confirmUpload: async (_: unknown, args: { fileId: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const file = await query<{
        id: string; status: string; original_filename: string
        category: string; size_bytes: string; mime_type: string
      }>('SELECT * FROM files WHERE id=$1 AND company_id=$2', [args.fileId, ctx.auth.companyId])
      if (!file.rows[0]) throw new Error('File not found')
      if (file.rows[0].status !== 'pending') throw new Error('File already confirmed')
      await query(`UPDATE files SET status='uploaded', uploaded_at=NOW() WHERE id=$1`, [args.fileId])
      const r = file.rows[0]
      return {
        id: r.id, originalFilename: r.original_filename, mimeType: r.mime_type,
        sizeBytes: parseInt(r.size_bytes), category: r.category,
        status: 'uploaded', uploadedAt: new Date().toISOString(),
      }
    },

    attachFile: async (
      _: unknown,
      args: { fileId: string; entityType: string; entityId: string; label?: string; isPrimary?: boolean },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const file = await query(
        `SELECT id FROM files WHERE id=$1 AND company_id=$2 AND status='uploaded'`,
        [args.fileId, ctx.auth.companyId],
      )
      if (!file.rows[0]) throw new Error('File not found or not yet uploaded')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await createAttachment(client, {
          entityType: args.entityType as Parameters<typeof createAttachment>[1]['entityType'],
          entityId: args.entityId,
          fileId: args.fileId,
          label: args.label ?? null,
          isPrimary: args.isPrimary ?? false,
          uploadedBy: ctx.auth.userId,
        })
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
      const result = await query(
        `SELECT da.*, f.id AS file_id, f.original_filename, f.mime_type, f.size_bytes, f.category, f.uploaded_at
         FROM document_attachments da JOIN files f ON f.id=da.file_id
         WHERE da.file_id=$1 AND da.entity_type=$2 AND da.entity_id=$3`,
        [args.fileId, args.entityType, args.entityId],
      )
      const r = result.rows[0] as Record<string, unknown>
      return {
        id: r['id'],
        file: {
          id: r['file_id'], originalFilename: r['original_filename'],
          mimeType: r['mime_type'], sizeBytes: parseInt(String(r['size_bytes'])),
          category: r['category'], status: 'attached', uploadedAt: r['uploaded_at'],
        },
        label: r['label'],
        isPrimary: r['is_primary'],
        createdAt: r['created_at'],
      }
    },

    detachFile: async (
      _: unknown,
      args: { attachmentId: string; entityType: string; entityId: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const removed = await removeAttachment(
          client,
          args.attachmentId,
          args.entityType as Parameters<typeof removeAttachment>[2],
          args.entityId,
        )
        await client.query('COMMIT')
        return !!removed
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    },

    reachMilestone: async (
      _: unknown,
      args: { contractId: string; milestoneId: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const result = await query(
        `UPDATE project_milestones SET status='reached', reached_at=NOW(), reached_by=$1, updated_at=NOW()
         WHERE id=$2 AND contract_id=$3 AND status='pending' RETURNING *`,
        [ctx.auth.userId, args.milestoneId, args.contractId],
      )
      if (!result.rows[0]) throw new Error('Milestone not found or cannot be reached')
      const m = result.rows[0] as Record<string, unknown>
      return {
        id: m['id'],
        name: m['name'],
        sequence: m['sequence'],
        billableAmount: parseFloat(String(m['billable_amount'])),
        currencyCode: String(m['currency_code']).trim(),
        status: m['status'],
        reachedAt: m['reached_at'] ?? null,
      }
    },

    createContractMilestone: async (
      _: unknown,
      args: { contractId: string; input: { name: string; sequence?: number; billableAmount: number; currencyCode?: string; description?: string } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const contract = await query(`SELECT project_id FROM project_contracts WHERE id=$1`, [args.contractId])
      if (!contract.rows[0]) throw new Error('Contract not found')
      const projectId = (contract.rows[0] as Record<string, unknown>)['project_id']
      const seq = args.input.sequence ?? 0
      const currency = args.input.currencyCode ?? 'IQD'
      const result = await query(
        `INSERT INTO project_milestones (contract_id, project_id, name, sequence, billable_amount, currency_code, description, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
        [args.contractId, projectId, args.input.name, seq, args.input.billableAmount, currency, args.input.description ?? null],
      )
      const m = result.rows[0] as Record<string, unknown>
      return {
        id: m['id'],
        name: m['name'],
        sequence: m['sequence'],
        billableAmount: parseFloat(String(m['billable_amount'])),
        currencyCode: String(m['currency_code']).trim(),
        status: m['status'],
        reachedAt: m['reached_at'] ?? null,
      }
    },

    updateContractMilestone: async (
      _: unknown,
      args: { id: string; input: { name: string; sequence?: number; billableAmount: number; currencyCode?: string; description?: string } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const result = await query(
        `UPDATE project_milestones SET name=$1, sequence=$2, billable_amount=$3, currency_code=$4, description=$5, updated_at=NOW()
         WHERE id=$6 AND status='pending' RETURNING *`,
        [
          args.input.name,
          args.input.sequence ?? 0,
          args.input.billableAmount,
          args.input.currencyCode ?? 'IQD',
          args.input.description ?? null,
          args.id,
        ],
      )
      if (!result.rows[0]) throw new Error('Milestone not found or already reached')
      const m = result.rows[0] as Record<string, unknown>
      return {
        id: m['id'],
        name: m['name'],
        sequence: m['sequence'],
        billableAmount: parseFloat(String(m['billable_amount'])),
        currencyCode: String(m['currency_code']).trim(),
        status: m['status'],
        reachedAt: m['reached_at'] ?? null,
      }
    },

    deleteContractMilestone: async (
      _: unknown,
      args: { id: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const result = await query(
        `DELETE FROM project_milestones WHERE id=$1 AND status='pending' RETURNING id`,
        [args.id],
      )
      if (!result.rows[0]) throw new Error('Milestone not found or already reached — cannot delete')
      return true
    },

    triggerFXSync: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `INSERT INTO service_outbox (service, event_type, payload) VALUES ('worker','FX_SYNC_REQUESTED',$1::jsonb)`,
        [JSON.stringify({ triggeredBy: ctx.auth.userId, syncType: 'manual' })],
      )
      return true
    },

    retryOutboxEvent: async (_: unknown, args: { eventId: string }, ctx: GQLContext) => {
      if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Forbidden')
      const event = await query(`SELECT id, status FROM service_outbox WHERE id=$1`, [args.eventId])
      if (!event.rows[0]) throw new Error('Outbox event not found')
      const status = String((event.rows[0] as Record<string, unknown>)['status'])
      if (!['failed', 'processing'].includes(status)) throw new Error(`Cannot retry event with status '${status}'`)
      await query(`UPDATE service_outbox SET status='pending', attempts=0, last_error=NULL, error_history='[]'::jsonb, next_retry_at=NOW(), processed_at=NULL WHERE id=$1`, [args.eventId])
      return true
    },

    retryDLQEntry: async (_: unknown, args: { dlqId: string; notes?: string }, ctx: GQLContext) => {
      if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Forbidden')
      const entry = await query(`SELECT * FROM outbox_dead_letters WHERE id=$1 AND status='pending'`, [args.dlqId])
      if (!entry.rows[0]) throw new Error('DLQ entry not found or already processed')
      const dlqEntry = entry.rows[0] as Record<string, unknown>
      await withTransaction({ companyId: ctx.auth.companyId, userId: ctx.auth.userId, role: 'system_admin' }, async (client) => {
        const newEvent = await client.query<{ id: string }>(`INSERT INTO service_outbox (service, event_type, payload, status, attempts, next_retry_at) VALUES ($1,$2,$3,'pending',0,NOW()) RETURNING id`, [dlqEntry['service'], dlqEntry['event_type'], JSON.stringify(dlqEntry['payload'])])
        const newEventId = newEvent.rows[0]!['id']
        await client.query(`UPDATE outbox_dead_letters SET status='retried', reviewed_by=$1, reviewed_at=NOW(), review_notes=$2, retry_outbox_id=$3, retried_at=NOW() WHERE id=$4`, [ctx.auth!.userId, args.notes ?? `Retried by ${ctx.auth!.userId}`, newEventId, args.dlqId])
      })
      return true
    },

    dismissDLQEntry: async (_: unknown, args: { dlqId: string; notes: string }, ctx: GQLContext) => {
      if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Forbidden')
      if (!args.notes || args.notes.trim().length < 10) throw new Error('Dismissal notes must be at least 10 characters')
      const result = await query(`UPDATE outbox_dead_letters SET status='dismissed', reviewed_by=$1, reviewed_at=NOW(), review_notes=$2 WHERE id=$3 AND status='pending' RETURNING id`, [ctx.auth.userId, args.notes, args.dlqId])
      if (result.rows.length === 0) throw new Error('DLQ entry not found or already processed')
      return true
    },

    resetStuckEvents: async (_: unknown, __: unknown, ctx: GQLContext) => {
      if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Forbidden')
      const result = await query(`UPDATE service_outbox SET status='pending', next_retry_at=NOW(), attempts=GREATEST(0, attempts-1) WHERE status='processing' AND updated_at < NOW() - INTERVAL '5 minutes' RETURNING id`)
      return result.rows.length
    },

    recordInvoicePayment: async (
      _: unknown,
      args: {
        invoiceId: string
        paymentDate: string
        amount: number
        currencyCode?: string
        paymentReference?: string
        paymentMethod?: string
        notes?: string
      },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const inv = await query<{ status: string; net_payable: string; currency_code: string }>(
        'SELECT status, net_payable, currency_code FROM project_invoices WHERE id=$1 AND company_id=$2',
        [args.invoiceId, ctx.auth.companyId],
      )
      if (!inv.rows[0]) throw new Error('Invoice not found')
      const existing = inv.rows[0]
      if (!['issued', 'partial'].includes(existing.status))
        throw new Error('Invoice is not in a payable state')
      const paid = await query<{ total: string }>(
        'SELECT COALESCE(SUM(amount),0) AS total FROM project_invoice_payments WHERE invoice_id=$1',
        [args.invoiceId],
      )
      const alreadyPaid = parseFloat(paid.rows[0]?.total ?? '0')
      const outstanding = parseFloat(existing.net_payable) - alreadyPaid
      if (args.amount > outstanding + 0.001)
        throw new Error(`Payment exceeds outstanding balance ${String(outstanding)}`)
      const result = await query<{ id: string; payment_date: string; amount: string }>(
        `INSERT INTO project_invoice_payments
           (invoice_id, payment_date, amount, currency_code, payment_reference, payment_method, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          args.invoiceId,
          args.paymentDate,
          args.amount,
          args.currencyCode ?? existing.currency_code,
          args.paymentReference ?? null,
          args.paymentMethod ?? null,
          args.notes ?? null,
          ctx.auth.userId,
        ],
      )
      const p = result.rows[0]
      if (!p) throw new Error('Payment insert failed')
      const newTotal = alreadyPaid + args.amount
      const newStatus = newTotal >= parseFloat(existing.net_payable) - 0.001 ? 'paid' : 'partial'
      await query(`UPDATE project_invoices SET status=$1, updated_at=NOW() WHERE id=$2`, [
        newStatus,
        args.invoiceId,
      ])
      return {
        id: p.id,
        paymentDate: p.payment_date,
        amount: parseFloat(p.amount),
        paymentReference: args.paymentReference ?? null,
        paymentMethod: args.paymentMethod ?? null,
      }
    },

    // ── Phase 2: Finance mutations ───────────────────────────────

    createAccount: async (
      _: unknown,
      args: { input: { code: string; name: string; account_type: string; parent_id?: string; currency_code?: string; is_reconcilable?: boolean; is_active?: boolean } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const { code, name, account_type, parent_id, currency_code, is_reconcilable, is_active } = args.input
      const r = await query(
        `INSERT INTO chart_of_accounts (company_id,code,name,account_type,parent_id,currency_code,is_reconcilable,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [ctx.auth.companyId, code, name, account_type, parent_id ?? null, currency_code ?? 'IQD', is_reconcilable ?? false, is_active ?? true],
      )
      return r.rows[0]
    },

    updateAccount: async (
      _: unknown,
      args: { id: string; input: { code?: string; name?: string; account_type?: string; parent_id?: string; currency_code?: string; is_reconcilable?: boolean; is_active?: boolean } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const { code, name, account_type, parent_id, currency_code, is_reconcilable, is_active } = args.input
      const r = await query(
        `UPDATE chart_of_accounts SET
           code=COALESCE($3,code), name=COALESCE($4,name), account_type=COALESCE($5,account_type),
           parent_id=COALESCE($6,parent_id), currency_code=COALESCE($7,currency_code),
           is_reconcilable=COALESCE($8,is_reconcilable), is_active=COALESCE($9,is_active),
           updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [args.id, ctx.auth.companyId, code ?? null, name ?? null, account_type ?? null, parent_id ?? null, currency_code ?? null, is_reconcilable ?? null, is_active ?? null],
      )
      if (!r.rows[0]) throw new Error('Account not found')
      return r.rows[0]
    },

    createJournalEntry: async (
      _: unknown,
      args: { input: { entry_date: string; description?: string; source_type?: string; lines: Array<{ account_id: string; debit: number; credit: number; description?: string; currency_code?: string; fx_rate?: number; analytic_account_id?: string; cost_center_id?: string }> } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const { entry_date, description, source_type, lines } = args.input
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
      if (Math.abs(totalDebit - totalCredit) > 0.001) throw new Error('Journal entry must be balanced')
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const je = await client.query(
          `INSERT INTO journal_entries (company_id,entry_date,description,source_type,status,total_debit,total_credit,created_by)
           VALUES ($1,$2,$3,$4,'draft',$5,$6,$7) RETURNING *`,
          [ctx.auth!.companyId, entry_date, description ?? null, source_type ?? 'manual', totalDebit, totalCredit, ctx.auth!.userId],
        )
        const entry = je.rows[0] as Record<string, unknown>
        for (const l of lines) {
          await client.query(
            `INSERT INTO journal_lines (journal_entry_id,account_id,description,currency_code,debit,credit,fx_rate,analytic_account_id,cost_center_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [entry['id'], l.account_id, l.description ?? null, l.currency_code ?? 'IQD', l.debit, l.credit, l.fx_rate ?? 1, l.analytic_account_id ?? null, l.cost_center_id ?? null],
          )
        }
        return entry
      })
    },

    postJournalEntry: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const jeCheck = await query(
        `SELECT * FROM journal_entries WHERE id=$1 AND company_id=$2 AND status='draft'`,
        [args.id, ctx.auth.companyId],
      )
      if (!jeCheck.rows[0]) throw new Error('Journal entry not found or not in draft status')
      const je = jeCheck.rows[0] as { id: string; source_type: string; source_id: string }
      const r = await query(
        `UPDATE journal_entries SET status='posted', posted_at=NOW(), posted_by=$3, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [args.id, ctx.auth.companyId, ctx.auth.userId],
      )
      if (je.source_type === 'vendor_payment') {
        await query(`UPDATE vendor_payments SET posted = true WHERE id = $1`, [je.source_id])
      } else if (je.source_type === 'combined') {
        await query(`UPDATE vendor_payments SET posted = true WHERE journal_entry_id = $1`, [je.id])
      }
      return r.rows[0]
    },

    cancelJournalEntry: async (_: unknown, args: { id: string; reason?: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(
        `UPDATE journal_entries SET status='cancelled', cancel_reason=$3, updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status IN ('draft','posted') RETURNING *`,
        [args.id, ctx.auth.companyId, args.reason ?? null],
      )
      if (!r.rows[0]) throw new Error('Journal entry not found or cannot be cancelled')
      return r.rows[0]
    },

    upsertFXRate: async (
      _: unknown,
      args: { input: { from_currency: string; to_currency: string; rate: number; rate_date: string; source?: string } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const { from_currency, to_currency, rate, rate_date, source } = args.input
      const r = await query(
        `INSERT INTO fx_rates (from_currency,to_currency,rate,rate_date,source,created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (from_currency,to_currency,rate_date) DO UPDATE SET rate=$3, source=$5, created_by=$6, updated_at=NOW()
         RETURNING *`,
        [from_currency, to_currency, rate, rate_date, source ?? 'manual', ctx.auth.userId],
      )
      return r.rows[0]
    },

    createAccountingPeriod: async (
      _: unknown,
      args: { input: { name: string; start_date: string; end_date: string } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const { name, start_date, end_date } = args.input
      const r = await query(
        `INSERT INTO accounting_periods (company_id,name,start_date,end_date,status) VALUES ($1,$2,$3,$4,'open') RETURNING *`,
        [ctx.auth.companyId, name, start_date, end_date],
      )
      return r.rows[0]
    },

    closeAccountingPeriod: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(
        `UPDATE accounting_periods SET status='closed', closed_by=$3, closed_at=NOW() WHERE id=$1 AND company_id=$2 AND status='open' RETURNING *`,
        [args.id, ctx.auth.companyId, ctx.auth.userId],
      )
      if (!r.rows[0]) throw new Error('Period not found or already closed')
      return r.rows[0]
    },

    auditJournalEntry: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const je = await query(`SELECT id, status FROM journal_entries WHERE id=$1 AND company_id=$2`, [args.id, ctx.auth.companyId])
      if (!je.rows[0]) throw new Error('Journal entry not found')
      if ((je.rows[0] as { status: string }).status !== 'posted') throw new Error('Only posted journals can be audited')
      const r = await query(
        `UPDATE journal_entries SET audited_by=$1, audited_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`,
        [ctx.auth.userId, args.id])
      return r.rows[0]
    },

    linkJournalPOs: async (_: unknown, args: { id: string; poIds: string[] }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const jeCheck = await query(`SELECT id FROM journal_entries WHERE id=$1 AND company_id=$2`, [args.id, ctx.auth.companyId])
      if (!jeCheck.rows[0]) throw new Error('Journal entry not found')
      await query(`DELETE FROM journal_po_links WHERE journal_entry_id=$1`, [args.id])
      for (const poId of args.poIds) {
        await query(`INSERT INTO journal_po_links (journal_entry_id, po_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [args.id, poId])
      }
      const links = await query(
        `SELECT jpl.po_id, po.po_number, v.name AS vendor_name, po.status, po.total_amount, po.currency_code
         FROM journal_po_links jpl
         JOIN purchase_orders po ON po.id=jpl.po_id
         LEFT JOIN vendors v ON v.id=po.vendor_id
         WHERE jpl.journal_entry_id=$1`, [args.id])
      return links.rows
    },

    combineJournalEntries: async (_: unknown, args: { journalIds: string[]; description?: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      if (!args.journalIds || args.journalIds.length < 2) throw new Error('At least 2 journal entries are required to combine')
      const companyId = ctx.auth.companyId
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const jeResult = await client.query(
          `SELECT * FROM journal_entries WHERE id = ANY($1) AND company_id = $2`,
          [args.journalIds, companyId],
        )
        if (jeResult.rows.length !== args.journalIds.length)
          throw new Error('One or more journal entries not found')
        const nonDrafts = (jeResult.rows as Array<{ status: string; reference: string }>).filter((r) => r.status !== 'draft')
        if (nonDrafts.length > 0)
          throw new Error(`Only draft entries can be combined. Not draft: ${nonDrafts.map((r) => r.reference).join(', ')}`)

        const linesResult = await client.query(
          `SELECT * FROM journal_lines WHERE journal_entry_id = ANY($1)`,
          [args.journalIds],
        )

        const maxDate = (jeResult.rows as Array<{ entry_date: string }>).reduce(
          (max, r) => (r.entry_date > max ? r.entry_date : max),
          (jeResult.rows[0] as { entry_date: string }).entry_date,
        )
        const refs = (jeResult.rows as Array<{ reference: string }>).map((r) => r.reference).join(', ')
        const combinedDesc = args.description || `Combined: ${refs}`
        const combinedRef = `COMB-${Date.now().toString(36).toUpperCase().slice(-8)}`

        const newJeResult = await client.query(
          `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
           VALUES ($1,$2,$3,$4,'draft','combined',$5) RETURNING *`,
          [companyId, combinedRef, combinedDesc, maxDate, ctx.auth!.userId],
        )
        const newJeId = (newJeResult.rows[0] as { id: string }).id

        for (const line of linesResult.rows as Array<{
          account_id: string; analytic_account_id: string | null; cost_center_id: string | null
          description: string | null; debit: string; credit: string; currency_code: string
          fx_rate: string; amount_company_currency: string
        }>) {
          await client.query(
            `INSERT INTO journal_lines
               (journal_entry_id, account_id, analytic_account_id, cost_center_id,
                description, debit, credit, currency_code, fx_rate, amount_company_currency)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [newJeId, line.account_id, line.analytic_account_id, line.cost_center_id,
             line.description, line.debit, line.credit, line.currency_code, line.fx_rate, line.amount_company_currency],
          )
        }

        const poLinksResult = await client.query(
          `SELECT DISTINCT po_id FROM journal_po_links WHERE journal_entry_id = ANY($1)`,
          [args.journalIds],
        )
        for (const row of poLinksResult.rows as Array<{ po_id: string }>) {
          await client.query(
            `INSERT INTO journal_po_links (journal_entry_id, po_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [newJeId, row.po_id],
          )
        }

        // Move vendor_payment references to the new combined journal
        await client.query(
          `UPDATE vendor_payments SET journal_entry_id=$1 WHERE journal_entry_id=ANY($2)`,
          [newJeId, args.journalIds],
        )
        // Also cover payments where worker hadn't set journal_entry_id yet (lookup via source_id)
        await client.query(
          `UPDATE vendor_payments SET journal_entry_id=$1
           WHERE journal_entry_id IS NULL AND id IN (
             SELECT source_id::uuid FROM journal_entries
             WHERE id=ANY($2) AND source_type='vendor_payment'
           )`,
          [newJeId, args.journalIds],
        )

        // Delete originals — journal_lines and journal_po_links cascade
        await client.query(`DELETE FROM journal_entries WHERE id=ANY($1)`, [args.journalIds])

        await logAudit({
          companyId, userId: ctx.auth!.userId, action: 'CREATE', tableName: 'journal_entries',
          recordId: newJeId, newValues: { reference: combinedRef, combinedFrom: args.journalIds }, client,
        })

        await client.query('COMMIT')

        const full = await query('SELECT * FROM journal_entries WHERE id=$1', [newJeId])
        const fullLines = await query(
          `SELECT jl.*, coa.code AS account_code, coa.name AS account_name
           FROM journal_lines jl
           JOIN chart_of_accounts coa ON coa.id=jl.account_id
           WHERE jl.journal_entry_id=$1`, [newJeId],
        )
        return { ...(full.rows[0] as object), lines: fullLines.rows }
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    },

    createPaymentVoucher: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const voucherNumber = (i['voucher_number'] as string | undefined)
        ?? `PV-${crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()}`
      const lines = (i['lines'] as Array<Record<string, unknown>>) ?? []
      const total_iqd = lines.reduce((s, l) => s + ((l['amount_iqd'] as number) ?? 0), 0)
      const total_usd = lines.reduce((s, l) => s + ((l['amount_usd'] as number) ?? 0), 0)
      const pvR = await query(
        `INSERT INTO payment_vouchers
           (company_id, voucher_number, voucher_date, received_from, reference_to, bank_account_fund,
            receiver_name, notes, total_amount_iqd, total_amount_usd, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [ctx.auth.companyId, voucherNumber, i['voucher_date'], i['received_from'],
         i['reference_to'] ?? null, i['bank_account_fund'] ?? null, i['receiver_name'] ?? null,
         i['notes'] ?? null, total_iqd, total_usd, ctx.auth.userId],
      )
      const pv = pvR.rows[0] as { id: string }
      for (let seq = 0; seq < lines.length; seq++) {
        const l = lines[seq]!
        await query(
          `INSERT INTO payment_voucher_lines (payment_voucher_id, statement, acct_1, acct_2, acct_3, acct_4, acct_5, amount_iqd, amount_usd, sequence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [pv.id, l['statement'], l['acct_1'] ?? null, l['acct_2'] ?? null, l['acct_3'] ?? null,
           l['acct_4'] ?? null, l['acct_5'] ?? null, l['amount_iqd'] ?? 0, l['amount_usd'] ?? 0, l['sequence'] ?? seq + 1],
        )
      }
      for (const jeId of (i['journal_ids'] as string[]) ?? []) {
        const jeCheck = await query(`SELECT id FROM journal_entries WHERE id=$1 AND company_id=$2`, [jeId, ctx.auth.companyId])
        if (jeCheck.rows[0]) {
          await query(`INSERT INTO payment_voucher_journals (payment_voucher_id, journal_entry_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pv.id, jeId])
        }
      }
      return pv
    },

    updatePaymentVoucher: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const pvCheck = await query(`SELECT id, status, voucher_number FROM payment_vouchers WHERE id=$1 AND company_id=$2`, [args.id, ctx.auth.companyId])
      if (!pvCheck.rows[0]) throw new Error('Payment voucher not found')
      if ((pvCheck.rows[0] as { status: string }).status !== 'draft') throw new Error('Only draft vouchers can be edited')
      const i = args.input
      const existingNum = (pvCheck.rows[0] as { voucher_number: string }).voucher_number
      const voucherNumber = (i['voucher_number'] as string | undefined) ?? existingNum
      const lines = (i['lines'] as Array<Record<string, unknown>>) ?? []
      const total_iqd = lines.reduce((s, l) => s + ((l['amount_iqd'] as number) ?? 0), 0)
      const total_usd = lines.reduce((s, l) => s + ((l['amount_usd'] as number) ?? 0), 0)
      await query(
        `UPDATE payment_vouchers SET voucher_number=$1, voucher_date=$2, received_from=$3, reference_to=$4, bank_account_fund=$5, receiver_name=$6, notes=$7, total_amount_iqd=$8, total_amount_usd=$9, updated_at=NOW() WHERE id=$10`,
        [voucherNumber, i['voucher_date'], i['received_from'], i['reference_to'] ?? null, i['bank_account_fund'] ?? null, i['receiver_name'] ?? null, i['notes'] ?? null, total_iqd, total_usd, args.id],
      )
      await query(`DELETE FROM payment_voucher_lines WHERE payment_voucher_id=$1`, [args.id])
      for (let seq = 0; seq < lines.length; seq++) {
        const l = lines[seq]!
        await query(
          `INSERT INTO payment_voucher_lines (payment_voucher_id, statement, acct_1, acct_2, acct_3, acct_4, acct_5, amount_iqd, amount_usd, sequence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [args.id, l['statement'], l['acct_1'] ?? null, l['acct_2'] ?? null, l['acct_3'] ?? null, l['acct_4'] ?? null, l['acct_5'] ?? null, l['amount_iqd'] ?? 0, l['amount_usd'] ?? 0, l['sequence'] ?? seq + 1],
        )
      }
      if (i['journal_ids'] !== undefined) {
        await query(`DELETE FROM payment_voucher_journals WHERE payment_voucher_id=$1`, [args.id])
        for (const jeId of (i['journal_ids'] as string[]) ?? []) {
          const jeCheck = await query(`SELECT id FROM journal_entries WHERE id=$1 AND company_id=$2`, [jeId, ctx.auth.companyId])
          if (jeCheck.rows[0]) await query(`INSERT INTO payment_voucher_journals (payment_voucher_id, journal_entry_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [args.id, jeId])
        }
      }
      const r = await query(`SELECT * FROM payment_vouchers WHERE id=$1`, [args.id])
      return r.rows[0]
    },

    approvePaymentVoucher: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const upd = await query(
        `UPDATE payment_vouchers SET status='approved', audited_by=$1, audited_at=NOW(), updated_at=NOW() WHERE id=$2 AND company_id=$3 AND status='draft' RETURNING id`,
        [ctx.auth.userId, args.id, ctx.auth.companyId])
      if (!upd.rows[0]) throw new Error('Payment voucher not found or not in draft status')
      const r = await query(
        `SELECT pv.*, COALESCE(ab.first_name || ' ' || ab.last_name, ab.email) AS auditor_email
         FROM payment_vouchers pv
         LEFT JOIN users ab ON ab.id=pv.audited_by
         WHERE pv.id=$1`, [upd.rows[0].id])
      return r.rows[0]
    },

    markPaymentVoucherPaid: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(
        `UPDATE payment_vouchers SET status='paid', cashier_id=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 AND status='approved' RETURNING *`,
        [ctx.auth.userId, args.id, ctx.auth.companyId])
      if (!r.rows[0]) throw new Error('Payment voucher not found or not approved')
      return r.rows[0]
    },

    // ── Phase 2: Procurement mutations ───────────────────────────

    createVendor: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      if (i['country_code'] && (i['country_code'] as string).length > 2)
        throw new Error('country_code must be a 2-character ISO code (e.g. IQ, US)')
      const r = await query(
        `INSERT INTO vendors (company_id,name,legal_name,tax_id,currency_code,payment_terms_days,country_code,city,address,contact_name,contact_email,contact_phone,withholding_tax_type,withholding_tax_rate,bank_name,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [ctx.auth.companyId, i['name'], i['legal_name'] ?? null, i['tax_id'] ?? null, i['currency_code'] ?? 'IQD', i['payment_terms_days'] ?? 30, i['country_code'] ?? null, i['city'] ?? null, i['address'] ?? null, i['contact_name'] ?? null, i['contact_email'] ?? null, i['contact_phone'] ?? null, i['withholding_tax_type'] ?? null, i['withholding_tax_rate'] ?? null, i['bank_name'] ?? null, i['is_active'] ?? true],
      )
      return r.rows[0]
    },

    updateVendor: async (
      _: unknown,
      args: { id: string; input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      if (i['country_code'] && (i['country_code'] as string).length > 2)
        throw new Error('country_code must be a 2-character ISO code (e.g. IQ, US)')
      const r = await query(
        `UPDATE vendors SET name=COALESCE($3,name), legal_name=COALESCE($4,legal_name), tax_id=COALESCE($5,tax_id),
           currency_code=COALESCE($6,currency_code), payment_terms_days=COALESCE($7,payment_terms_days),
           country_code=COALESCE($8,country_code), city=COALESCE($9,city), address=COALESCE($10,address),
           contact_name=COALESCE($11,contact_name), contact_email=COALESCE($12,contact_email),
           contact_phone=COALESCE($13,contact_phone),
           is_active=COALESCE($14,is_active), updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [args.id, ctx.auth.companyId, i['name'] ?? null, i['legal_name'] ?? null, i['tax_id'] ?? null, i['currency_code'] ?? null, i['payment_terms_days'] ?? null, i['country_code'] ?? null, i['city'] ?? null, i['address'] ?? null, i['contact_name'] ?? null, i['contact_email'] ?? null, i['contact_phone'] ?? null, i['is_active'] ?? null],
      )
      if (!r.rows[0]) throw new Error('Vendor not found')
      return r.rows[0]
    },

    createPurchaseOrder: async (
      _: unknown,
      args: { input: { vendor_id?: string; currency_code?: string; analytic_account_id?: string; expected_delivery_date?: string; notes?: string; assigned_to?: string; assigned_receiver_id?: string; fx_rate?: number; purpose?: string; linkedProjectId?: string; linkedMoId?: string; lines: Array<{ product_id?: string; description?: string; qty: number; unit_price: number; uom?: string }> } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const poNum = `PO-${Date.now()}`
        const subtotal = i.lines.reduce((s, l) => s + l.qty * l.unit_price, 0)
        const po = await client.query(
          `INSERT INTO purchase_orders (company_id,po_number,vendor_id,currency_code,analytic_account_id,expected_delivery_date,notes,assigned_to,assigned_receiver_id,fx_rate,subtotal,total_amount,status,purpose,project_id,linked_project_id,linked_mo_id,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$15,$9,$10,$10,'draft',$11,$12,$12,$13,$14) RETURNING *`,
          [ctx.auth!.companyId, poNum, i.vendor_id || null, i.currency_code ?? 'IQD', i.analytic_account_id ?? null, i.expected_delivery_date ?? null, i.notes ?? null, i.assigned_to ?? null, i.fx_rate ?? 1, subtotal, i.purpose ?? 'stock', i.linkedProjectId ?? null, i.linkedMoId ?? null, ctx.auth!.userId, i.assigned_receiver_id ?? null],
        )
        const poRow = po.rows[0] as Record<string, unknown>
        for (let idx = 0; idx < i.lines.length; idx++) {
          const l = i.lines[idx]!
          await client.query(
            `INSERT INTO po_lines (po_id,product_id,description,line_number,qty_ordered,unit_price,total_price,uom) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [poRow['id'], l.product_id ?? null, l.description ?? '', idx + 1, l.qty, l.unit_price, l.qty * l.unit_price, l.uom ?? 'unit'],
          )
        }
        return poRow
      })
    },

    updatePurchaseOrder: async (
      _: unknown,
      args: { id: string; input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query('SELECT status FROM purchase_orders WHERE id=$1 AND company_id=$2', [args.id, ctx.auth.companyId])
      if (!r.rows[0]) throw new Error('PO not found')
      if ((r.rows[0] as Record<string, unknown>)['status'] !== 'draft') throw new Error('Only draft POs can be edited')
      const upd = await query(
        `UPDATE purchase_orders SET
           expected_delivery_date=COALESCE($3,expected_delivery_date),
           notes=COALESCE($4,notes), fx_rate=COALESCE($5,fx_rate), updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [args.id, ctx.auth.companyId, args.input['expected_delivery_date'] ?? null, args.input['notes'] ?? null, args.input['fx_rate'] ?? null],
      )
      return upd.rows[0]
    },

    submitPO: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const r = await client.query(
          `UPDATE purchase_orders SET status='submitted', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
          [args.id, ctx.auth!.companyId],
        )
        if (!r.rows[0]) throw new Error('PO not found or not in draft')
        await client.query(`INSERT INTO po_approval_log (po_id,action,user_id) VALUES ($1,'submitted',$2)`, [args.id, ctx.auth!.userId])
        return r.rows[0]
      })
    },

    approveL1PO: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const r = await client.query(
          `UPDATE purchase_orders SET status='approved_l1', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status IN ('submitted','pending_review','under_review') RETURNING *`,
          [args.id, ctx.auth!.companyId],
        )
        if (!r.rows[0]) throw new Error('PO not found or invalid status for L1 approval')
        await client.query(`INSERT INTO po_approval_log (po_id,action,user_id) VALUES ($1,'approved_l1',$2)`, [args.id, ctx.auth!.userId])
        return r.rows[0]
      })
    },

    approveL2PO: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const r = await client.query(
          `UPDATE purchase_orders SET status='approved_l2', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status='approved_l1' RETURNING *`,
          [args.id, ctx.auth!.companyId],
        )
        if (!r.rows[0]) throw new Error('PO not found or not at L1 approval')
        await client.query(`INSERT INTO po_approval_log (po_id,action,user_id) VALUES ($1,'approved_l2',$2)`, [args.id, ctx.auth!.userId])
        return r.rows[0]
      })
    },

    rejectPO: async (_: unknown, args: { id: string; notes: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const r = await client.query(
          `UPDATE purchase_orders SET status='rejected', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status NOT IN ('closed','cancelled') RETURNING *`,
          [args.id, ctx.auth!.companyId],
        )
        if (!r.rows[0]) throw new Error('PO not found or cannot be rejected')
        await client.query(`INSERT INTO po_approval_log (po_id,action,user_id,notes) VALUES ($1,'rejected',$2,$3)`, [args.id, ctx.auth!.userId, args.notes])
        return r.rows[0]
      })
    },

    cancelPO: async (_: unknown, args: { id: string; notes?: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const r = await client.query(
          `UPDATE purchase_orders SET status='cancelled', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status NOT IN ('closed','cancelled') RETURNING *`,
          [args.id, ctx.auth!.companyId],
        )
        if (!r.rows[0]) throw new Error('PO not found or cannot be cancelled')
        await client.query(`INSERT INTO po_approval_log (po_id,action,user_id,notes) VALUES ($1,'cancelled',$2,$3)`, [args.id, ctx.auth!.userId, args.notes ?? null])
        return r.rows[0]
      })
    },

    markOrderedPO: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const r = await client.query(
          `UPDATE purchase_orders SET status='ordered', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status IN ('approved_l1','approved_l2') RETURNING *`,
          [args.id, ctx.auth!.companyId],
        )
        if (!r.rows[0]) throw new Error('PO not found or not approved')
        await client.query(`INSERT INTO po_approval_log (po_id,action,user_id) VALUES ($1,'ordered',$2)`, [args.id, ctx.auth!.userId])
        return r.rows[0]
      })
    },

    recordReceipt: async (
      _: unknown,
      args: { poId: string; input: { receipt_date: string; location_id?: string; notes?: string; received_by_name?: string; location_notes?: string; lines: Array<{ po_line_id: string; qty_received: number }> } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const po = await client.query('SELECT * FROM purchase_orders WHERE id=$1 AND company_id=$2', [args.poId, ctx.auth!.companyId])
        if (!po.rows[0]) throw new Error('PO not found')
        const poStatus = po.rows[0]['status'] as string
        if (!['approved', 'goods_received'].includes(poStatus)) {
          throw new Error(`Cannot record receipt on a PO with status '${poStatus}'`)
        }
        const receiptNumber = `RCPT-${Date.now()}`
        const receipt = await client.query(
          `INSERT INTO po_receipts (po_id,receipt_number,received_date,warehouse_location_id,notes,received_by,received_by_name,location_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [args.poId, receiptNumber, i.receipt_date, i.location_id ?? null, i.notes ?? null, ctx.auth!.userId, i.received_by_name ?? null, i.location_notes ?? null],
        )
        const dbRow = receipt.rows[0] as Record<string, unknown>
        const rRow: Record<string, unknown> = {
          ...dbRow,
          receipt_date: dbRow['received_date'],
          location_id: dbRow['warehouse_location_id'],
        }
        let virtualInId: string | undefined
        for (const l of i.lines) {
          await client.query(
            `INSERT INTO po_receipt_lines (receipt_id,po_line_id,qty_received) VALUES ($1,$2,$3)`,
            [rRow['id'], l.po_line_id, l.qty_received],
          )
          await client.query(
            `UPDATE po_lines SET qty_received=COALESCE(qty_received,0)+$1 WHERE id=$2`,
            [l.qty_received, l.po_line_id],
          )
          const polRes = await client.query(`SELECT product_id, unit_price FROM po_lines WHERE id=$1`, [l.po_line_id])
          const polProductId = polRes.rows[0]?.['product_id'] as string | null
          const polUnitPrice = parseFloat(String(polRes.rows[0]?.['unit_price'] ?? 0))
          if (polProductId) {
            if (!virtualInId) {
              const virtInRes = await client.query(
                `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
                [ctx.auth!.companyId],
              )
              virtualInId = virtInRes.rows[0]?.id ?? (await client.query(
                `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,'Virtual Receipts','virtual_in',true) RETURNING id`,
                [ctx.auth!.companyId],
              )).rows[0].id as string
            }
            await client.query(
              `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,source_type,source_id,notes,moved_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'po_receipt',$9,$10,$11)`,
              [ctx.auth!.companyId, polProductId, virtualInId, i.location_id, i.receipt_date, l.qty_received, polUnitPrice, polUnitPrice * l.qty_received, rRow['id'], i.notes ?? null, ctx.auth!.userId],
            )
          }
        }
        // If PO is linked to an MO, update mo_consumptions for received components
        const poForMO = await client.query(`SELECT linked_mo_id FROM purchase_orders WHERE id=$1`, [args.poId])
        const linkedMoId = poForMO.rows[0]?.['linked_mo_id'] as string | null
        if (linkedMoId) {
          for (const l of i.lines) {
            const lineRes = await client.query(`SELECT product_id FROM po_lines WHERE id=$1`, [l.po_line_id])
            const productId = lineRes.rows[0]?.['product_id'] as string | null
            if (productId) {
              await client.query(
                `UPDATE mo_consumptions SET qty_consumed=LEAST(qty_planned, qty_consumed+$1)
                 WHERE mo_id=$2 AND component_product_id=$3`,
                [l.qty_received, linkedMoId, productId],
              )
            }
          }
          const moCheck = await client.query(
            `SELECT COUNT(*) FILTER (WHERE qty_consumed < qty_planned) AS unsatisfied FROM mo_consumptions WHERE mo_id=$1`,
            [linkedMoId],
          )
          if (parseInt(String(moCheck.rows[0]?.['unsatisfied'] ?? '1')) === 0) {
            await client.query(
              `UPDATE manufacturing_orders SET status='confirmed', updated_at=NOW() WHERE id=$1 AND status='draft'`,
              [linkedMoId],
            )
          }
        }
        // Auto-transition approved → goods_received on first receipt
        const currentStatus = po.rows[0]['status'] as POStatus
        if (currentStatus === 'approved') {
          await poTransition(client, args.poId, 'approved', 'goods_received', 'receive_goods', ctx.auth!, 'Auto-transitioned on first receipt')
        }
        return { ...rRow, lines: i.lines.map((l) => ({ po_line_id: l.po_line_id, qty_received: String(l.qty_received), description: null })) }
      })
    },

    attachReceiptPhoto: async (
      _: unknown,
      args: { receiptId: string; fileId: string; label?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      // Verify the receipt belongs to a PO the user can access
      const rcpt = await query(
        `SELECT por.id FROM po_receipts por JOIN purchase_orders po ON po.id=por.po_id WHERE por.id=$1 AND po.company_id=$2`,
        [args.receiptId, ctx.auth.companyId],
      )
      if (!rcpt.rows[0]) throw new Error('Receipt not found')
      // Verify the file exists and is uploaded
      const file = await query(`SELECT id, original_filename FROM files WHERE id=$1 AND status='uploaded'`, [args.fileId])
      if (!file.rows[0]) throw new Error('File not found or not yet uploaded')
      const da = await query(
        `INSERT INTO document_attachments (entity_type,entity_id,file_id,label,uploaded_by)
         VALUES ('po_receipt',$1,$2,$3,$4) RETURNING id, created_at`,
        [args.receiptId, args.fileId, args.label ?? null, ctx.auth.userId],
      )
      const daRow = da.rows[0] as Record<string, unknown>
      const fRow = file.rows[0] as Record<string, unknown>
      return {
        id: daRow['id'],
        fileId: args.fileId,
        label: args.label ?? null,
        originalFilename: fRow['original_filename'],
        downloadUrl: null,
        createdAt: daRow['created_at'],
      }
    },

    // ── Phase 2: Inventory mutations ─────────────────────────────

    createProduct: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO products (company_id,sku,name,description,category,sub_category,uom,valuation_method,standard_cost,reorder_point,reorder_qty,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [ctx.auth.companyId, i['sku'], i['name'], i['description'] ?? null, i['category'] ?? null, i['sub_category'] ?? null, i['uom'], i['valuation_method'] ?? 'avco', i['standard_cost'] ?? 0, i['reorder_point'] ?? null, i['reorder_qty'] ?? null, i['is_active'] ?? true],
      )
      return r.rows[0]
    },

    updateProduct: async (
      _: unknown,
      args: { id: string; input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `UPDATE products SET name=COALESCE($3,name), description=COALESCE($4,description), category=COALESCE($5,category),
           sub_category=COALESCE($6,sub_category), uom=COALESCE($7,uom), standard_cost=COALESCE($8,standard_cost),
           reorder_point=COALESCE($9,reorder_point), reorder_qty=COALESCE($10,reorder_qty),
           is_active=COALESCE($11,is_active), updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [args.id, ctx.auth.companyId, i['name'] ?? null, i['description'] ?? null, i['category'] ?? null, i['sub_category'] ?? null, i['uom'] ?? null, i['standard_cost'] ?? null, i['reorder_point'] ?? null, i['reorder_qty'] ?? null, i['is_active'] ?? null],
      )
      if (!r.rows[0]) throw new Error('Product not found')
      return r.rows[0]
    },

    createStockLocation: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO stock_locations (company_id,name,code,type,parent_id,address,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [ctx.auth.companyId, i['name'], i['code'] ?? null, i['type'], i['parent_id'] ?? null, i['address'] ?? null, i['is_active'] ?? true],
      )
      return r.rows[0]
    },

    createManualTransfer: async (
      _: unknown,
      args: { input: { from_location_id: string; to_location_id: string; move_date: string; reference?: string; notes?: string; lines: Array<{ product_id: string; qty: number; unit_cost?: number; lot_id?: string }> } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        let lastMove: Record<string, unknown> = {}
        for (const l of i.lines) {
          const mv = await client.query(
            `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,source_type,notes,lot_id,moved_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9,$10,$11) RETURNING *, moved_at AS move_date`,
            [ctx.auth!.companyId, l.product_id, i.from_location_id, i.to_location_id, i.move_date, l.qty, l.unit_cost ?? 0, l.unit_cost ? l.qty * l.unit_cost : 0, i.notes ?? i.reference ?? null, l.lot_id ?? null, ctx.auth!.userId],
          )
          lastMove = mv.rows[0] as Record<string, unknown>
          await client.query(
            `UPDATE stock_balances SET qty_on_hand=qty_on_hand-$1, updated_at=NOW() WHERE product_id=$2 AND location_id=$3`,
            [l.qty, l.product_id, i.from_location_id],
          )
          await client.query(
            `INSERT INTO stock_balances (product_id,location_id,qty_on_hand,qty_reserved,average_cost)
             VALUES ($1,$2,$3,0,$4)
             ON CONFLICT (product_id,location_id) DO UPDATE SET qty_on_hand=stock_balances.qty_on_hand+$3, updated_at=NOW()`,
            [l.product_id, i.to_location_id, l.qty, l.unit_cost ?? 0],
          )
        }
        return lastMove
      })
    },

    createStockAdjustment: async (
      _: unknown,
      args: { input: { product_id: string; location_id: string; new_qty: number; unit_cost?: number; notes?: string; adjustment_date?: string } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const adjustedAt = i.adjustment_date ? `${i.adjustment_date}T00:00:00Z` : new Date().toISOString()

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Get current balance (lot_id IS NULL for non-lot items — constraint is product+location+lot_id)
        const balRes = await client.query(
          `SELECT qty_on_hand, average_cost FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
          [i.product_id, i.location_id],
        )
        const currentQty = parseFloat(String(balRes.rows[0]?.['qty_on_hand'] ?? 0))
        const currentCost = parseFloat(String(balRes.rows[0]?.['average_cost'] ?? 0))
        const diff = i.new_qty - currentQty
        const unitCost = i.unit_cost && i.unit_cost > 0 ? i.unit_cost : currentCost

        if (diff === 0) {
          await client.query('ROLLBACK')
          return { id: null, move_date: adjustedAt, qty: 0 }
        }

        // Directly set stock_balances to the exact new quantity.
        // We do NOT insert into stock_moves here because the trigger on that table
        // would update balances automatically, and we cannot use same location for
        // both from/to (net zero) or null locations (NOT NULL constraint).
        await client.query(
          `INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, qty_reserved, average_cost, last_move_at, updated_at)
           VALUES ($1, $2, NULL, $3, 0, $4, $5, NOW())
           ON CONFLICT (product_id, location_id, lot_id) DO UPDATE
             SET qty_on_hand = $3,
                 average_cost = CASE WHEN $4 > 0 THEN $4 ELSE stock_balances.average_cost END,
                 last_move_at = $5,
                 updated_at = NOW()`,
          [i.product_id, i.location_id, i.new_qty, unitCost, adjustedAt],
        )

        // Check reorder point after adjustment and notify if now below threshold
        if (i.new_qty < currentQty) {
          const lowRes = await client.query(
            `SELECT p.id, p.name, p.sku, p.reorder_point,
                    COALESCE(SUM(sb.qty_on_hand), 0) AS qty_on_hand
             FROM products p
             LEFT JOIN stock_balances sb ON sb.product_id = p.id
             LEFT JOIN stock_locations sl ON sl.id = sb.location_id AND sl.type NOT IN ('virtual_in','virtual_out')
             WHERE p.id=$1 AND p.reorder_point IS NOT NULL AND p.company_id=$2 AND (sb.id IS NULL OR sl.id IS NOT NULL)
             GROUP BY p.id, p.name, p.sku, p.reorder_point
             HAVING COALESCE(SUM(sb.qty_on_hand), 0) < p.reorder_point`,
            [i.product_id, ctx.auth.companyId],
          )
          if (lowRes.rows.length > 0) {
            const product = lowRes.rows[0] as Record<string, unknown>
            const qty = parseFloat(String(product['qty_on_hand'] ?? 0))
            const reorder = parseFloat(String(product['reorder_point'] ?? 0))
            const users = await client.query(
              `SELECT DISTINCT user_id FROM user_company_roles WHERE company_id=$1 AND module='inventory'`,
              [ctx.auth.companyId],
            )
            for (const u of users.rows as Record<string, unknown>[]) {
              await client.query(
                `INSERT INTO notifications (company_id,user_id,type,title,body,data)
                 VALUES ($1,$2,'low_stock',$3,$4,$5)`,
                [
                  ctx.auth.companyId,
                  u['user_id'],
                  `Low Stock: ${String(product['name'])}`,
                  `${String(product['sku'])} is below reorder point after stock adjustment. On hand: ${qty.toFixed(2)}, reorder point: ${reorder.toFixed(2)}.`,
                  JSON.stringify({ product_id: product['id'], qty_on_hand: qty, reorder_point: reorder }),
                ],
              )
            }
          }
        }

        await client.query('COMMIT')

        // Return a synthetic move-like object so the frontend mutation response works
        return {
          id: `adj-${Date.now()}`,
          move_date: adjustedAt,
          qty: String(Math.abs(diff)),
        }
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    },

    // ── Phase 4: Projects ─────────────────────────────────────

    createProject: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      if (!isAdminGW(ctx.auth.role)) throw new Error('Forbidden: only administrators can create projects')
      const i = args.input
      const code = (i['code'] as string | undefined) ?? `PRJ-${Date.now().toString().slice(-8)}`
      // Auto-create analytic account — code capped at VARCHAR(20)
      const aaCode = code.slice(0, 20)
      const aa = await query(
        `INSERT INTO analytic_accounts (company_id, name, code, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
        [ctx.auth.companyId, `Project: ${i['name']}`, aaCode],
      )
      const r = await query(
        `INSERT INTO projects (
          company_id, name, code, description, project_type,
          client_name, client_contact, rfq_number, contract_name, project_location,
          receiving_date, submission_date, project_value, project_value_currency,
          planned_start_date, planned_end_date, budget_amount, budget_currency,
          project_manager_id, cost_center_id, analytic_account_id, remarks,
          submission_time, site_visit_date, site_visit_time, question_date, question_time,
          status, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'pending',$28)
        RETURNING *`,
        [
          ctx.auth.companyId, i['name'], code,
          i['description'] ?? null, i['projectType'] ?? 'construction',
          i['clientName'] ?? null, i['clientContact'] ?? null,
          i['rfqNumber'] ?? null, i['contractName'] ?? null, i['projectLocation'] ?? null,
          i['receivingDate'] ?? null, i['submissionDate'] ?? null,
          i['projectValue'] ?? null, i['projectValueCurrency'] ?? 'IQD',
          i['plannedStartDate'] ?? null, i['plannedEndDate'] ?? null,
          i['budgetAmount'] ?? 0, i['budgetCurrency'] ?? 'IQD',
          i['projectManagerId'] ?? null, i['costCenterId'] ?? null,
          aa.rows[0].id, i['remarks'] ?? null,
          i['submissionTime'] ?? null, i['siteVisitDate'] ?? null, i['siteVisitTime'] ?? null,
          i['questionDate'] ?? null, i['questionTime'] ?? null,
          ctx.auth.userId,
        ],
      )
      await query(
        `INSERT INTO project_status_history (project_id, from_status, to_status, changed_by) VALUES ($1, NULL, 'pending', $2)`,
        [r.rows[0].id, ctx.auth.userId],
      )
      return projectRowToGQL(r.rows[0] as Record<string, unknown>)
    },

    updateProject: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `UPDATE projects SET
          name                   = COALESCE($3,  name),
          description            = COALESCE($4,  description),
          project_type           = COALESCE($5,  project_type),
          client_name            = COALESCE($6,  client_name),
          client_contact         = COALESCE($7,  client_contact),
          rfq_number             = COALESCE($8,  rfq_number),
          contract_name          = COALESCE($9,  contract_name),
          project_location       = COALESCE($10, project_location),
          receiving_date         = COALESCE($11, receiving_date),
          submission_date        = COALESCE($12, submission_date),
          project_value          = COALESCE($13, project_value),
          project_value_currency = COALESCE($14, project_value_currency),
          planned_start_date     = COALESCE($15, planned_start_date),
          planned_end_date       = COALESCE($16, planned_end_date),
          budget_amount          = COALESCE($17, budget_amount),
          budget_currency        = COALESCE($18, budget_currency),
          project_manager_id     = COALESCE($19, project_manager_id),
          cost_center_id         = COALESCE($20, cost_center_id),
          remarks                = COALESCE($21, remarks),
          submission_time        = COALESCE($22, submission_time),
          site_visit_date        = COALESCE($23, site_visit_date),
          site_visit_time        = COALESCE($24, site_visit_time),
          question_date          = COALESCE($25, question_date),
          question_time          = COALESCE($26, question_time),
          updated_at             = NOW()
        WHERE id = $1 AND company_id = $2 RETURNING *`,
        [
          args.id, ctx.auth.companyId,
          i['name'] ?? null, i['description'] ?? null, i['projectType'] ?? null,
          i['clientName'] ?? null, i['clientContact'] ?? null,
          i['rfqNumber'] ?? null, i['contractName'] ?? null, i['projectLocation'] ?? null,
          i['receivingDate'] ?? null, i['submissionDate'] ?? null,
          i['projectValue'] ?? null, i['projectValueCurrency'] ?? null,
          i['plannedStartDate'] ?? null, i['plannedEndDate'] ?? null,
          i['budgetAmount'] ?? null, i['budgetCurrency'] ?? null,
          i['projectManagerId'] ?? null, i['costCenterId'] ?? null,
          i['remarks'] ?? null,
          i['submissionTime'] ?? null, i['siteVisitDate'] ?? null, i['siteVisitTime'] ?? null,
          i['questionDate'] ?? null, i['questionTime'] ?? null,
        ],
      )
      if (!r.rows[0]) throw new Error('Project not found')
      const FIELD_LABELS: Record<string, string> = {
        name: 'name', description: 'description', projectType: 'project type',
        clientName: 'client name', clientContact: 'client contact',
        rfqNumber: 'RFQ number', contractName: 'contract name', projectLocation: 'location',
        receivingDate: 'receiving date', submissionDate: 'submission date', submissionTime: 'submission time',
        siteVisitDate: 'site visit date', siteVisitTime: 'site visit time',
        questionDate: 'question date', questionTime: 'question time',
        projectValue: 'project value', plannedStartDate: 'start date', plannedEndDate: 'end date',
        budgetAmount: 'budget amount', remarks: 'remarks',
      }
      const changed = Object.entries(FIELD_LABELS)
        .filter(([k]) => i[k] !== null && i[k] !== undefined)
        .map(([, label]) => label)
      if (changed.length > 0) {
        await logActivity(args.id, ctx.auth.userId, 'field_update', `Updated: ${changed.join(', ')}`)
      }
      return projectRowToGQL(r.rows[0] as Record<string, unknown>)
    },

    startProject: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return projectTransition(args.id, ctx.auth.companyId, ctx.auth.userId, 'start', 'ongoing')
    },

    holdProject: async (_: unknown, args: { id: string; reason: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return projectTransition(args.id, ctx.auth.companyId, ctx.auth.userId, 'hold', 'on_hold', { hold_reason: args.reason, reason: args.reason })
    },

    resumeProject: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return projectTransition(args.id, ctx.auth.companyId, ctx.auth.userId, 'resume', 'ongoing')
    },

    submitProject: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return projectTransition(args.id, ctx.auth.companyId, ctx.auth.userId, 'submit', 'submitted', { submitted_at: new Date().toISOString() })
    },

    approveProject: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return projectTransition(args.id, ctx.auth.companyId, ctx.auth.userId, 'approve', 'approved', { approved_at: new Date().toISOString() })
    },

    rejectBackProject: async (_: unknown, args: { id: string; reason: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return projectTransition(args.id, ctx.auth.companyId, ctx.auth.userId, 'reject_back', 'ongoing', { reason: args.reason })
    },

    completeProject: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return projectTransition(args.id, ctx.auth.companyId, ctx.auth.userId, 'complete', 'completed', { completed_at: new Date().toISOString() })
    },

    cancelProject: async (_: unknown, args: { id: string; reason: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await assertProjectCancellable(args.id)
      return projectTransition(args.id, ctx.auth.companyId, ctx.auth.userId, 'cancel', 'cancelled', { cancel_reason: args.reason, reason: args.reason, cancelled_at: new Date().toISOString() })
    },

    cancelProjectAfterApproval: async (_: unknown, args: { id: string; reason: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await assertProjectCancellable(args.id)
      return projectTransition(args.id, ctx.auth.companyId, ctx.auth.userId, 'cancel_after_approval', 'cancelled_after_approval', { cancel_reason: args.reason, reason: args.reason, cancelled_at: new Date().toISOString() })
    },

    adminSetProjectStatus: async (_: unknown, args: { id: string; status: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      if (!isAdminGW(ctx.auth.role)) throw new Error('Forbidden: admin only')
      const r = await query(
        `UPDATE projects SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`,
        [args.status, args.id, ctx.auth.companyId],
      )
      if (!r.rows[0]) throw new Error('Project not found')
      return projectRowToGQL(r.rows[0] as Record<string, unknown>)
    },

    adminSetPOStatus: async (_: unknown, args: { id: string; status: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      if (!isAdminGW(ctx.auth.role)) throw new Error('Forbidden: admin only')
      const r = await query(
        `UPDATE purchase_orders SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`,
        [args.status, args.id, ctx.auth.companyId],
      )
      if (!r.rows[0]) throw new Error('PO not found')
      return r.rows[0]
    },

    setPOPriority: async (_: unknown, args: { id: string; priority: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      if (!['low', 'high', 'emergency'].includes(args.priority)) throw new Error('Invalid priority')
      const r = await query(
        `UPDATE purchase_orders SET priority=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`,
        [args.priority, args.id, ctx.auth.companyId],
      )
      if (!r.rows[0]) throw new Error('PO not found')
      return r.rows[0]
    },

    setPOReceiver: async (_: unknown, args: { id: string; employeeId?: string | null }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      if (args.employeeId) {
        const empCheck = await query(`SELECT id FROM employees WHERE id=$1 AND company_id=$2`, [args.employeeId, ctx.auth.companyId])
        if (!empCheck.rows[0]) throw new Error('Employee not found')
      }
      const r = await query(
        `UPDATE purchase_orders SET assigned_receiver_id=$1, updated_at=NOW()
         WHERE id=$2 AND company_id=$3 RETURNING *`,
        [args.employeeId ?? null, args.id, ctx.auth.companyId],
      )
      if (!r.rows[0]) throw new Error('PO not found')
      const po = r.rows[0] as Record<string, unknown>
      if (po['assigned_receiver_id']) {
        const emp = await query(
          `SELECT COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS name FROM employees WHERE id=$1`,
          [po['assigned_receiver_id']],
        )
        po['assigned_receiver_name'] = emp.rows[0]?.['name'] ?? null
      }
      return po
    },

    setPOLineActualPrice: async (_: unknown, args: { poId: string; lineId: string; actualUnitPrice?: number | null }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const check = await query(
        `SELECT pl.id FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id
         WHERE pl.id=$1 AND pl.po_id=$2 AND po.company_id=$3`,
        [args.lineId, args.poId, ctx.auth.companyId],
      )
      if (!check.rows[0]) throw new Error('PO line not found')
      const r = await query(
        `UPDATE po_lines
         SET actual_unit_price=$1::NUMERIC,
             total_price = CASE WHEN $1::NUMERIC IS NOT NULL THEN qty_ordered * $1::NUMERIC ELSE qty_ordered * unit_price END
         WHERE id=$2 RETURNING *`,
        [args.actualUnitPrice ?? null, args.lineId],
      )
      // Recalculate PO-level subtotal and total_amount
      await query(
        `UPDATE purchase_orders
         SET subtotal=(SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1),
             total_amount=(SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1),
             updated_at=NOW()
         WHERE id=$1`,
        [args.poId],
      )
      return r.rows[0]
    },

    createProjectStage: async (_: unknown, args: { projectId: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const seq = await query(`SELECT COALESCE(MAX(sequence),0)+1 AS s FROM project_stages WHERE project_id=$1`, [args.projectId])
      const r = await query(
        `INSERT INTO project_stages (project_id,name,sequence,status,completion_pct,planned_start_date,planned_end_date,notes)
         VALUES ($1,$2,$3,'pending',0,$4,$5,$6) RETURNING *`,
        [args.projectId, i['name'], i['sequence'] ?? seq.rows[0]?.s ?? 1, i['plannedStartDate'] ?? null, i['plannedEndDate'] ?? null, i['notes'] ?? null],
      )
      const row = r.rows[0] as Record<string, unknown>
      await logActivity(args.projectId, ctx.auth.userId, 'stage_create', `Stage added: "${String(row.name)}"`)
      return { id: row.id, name: row.name, sequence: row.sequence, status: row.status, completionPct: row.completion_pct ?? 0, plannedStartDate: row.planned_start_date, plannedEndDate: row.planned_end_date, actualStartDate: row.actual_start_date, actualEndDate: row.actual_end_date, notes: row.notes }
    },

    updateProjectStage: async (_: unknown, args: { projectId: string; stageId: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const assignedTo = 'assignedTo' in i ? (i['assignedTo'] || null) : undefined
      const r = await query(
        `UPDATE project_stages SET
          name=COALESCE($3,name), status=COALESCE($4,status), completion_pct=COALESCE($5,completion_pct),
          planned_start_date=COALESCE($6,planned_start_date), planned_end_date=COALESCE($7,planned_end_date),
          actual_start_date=COALESCE($8,actual_start_date), actual_end_date=COALESCE($9,actual_end_date),
          notes=COALESCE($10,notes),
          assigned_to=CASE WHEN $11::uuid IS NOT NULL THEN $11::uuid ELSE assigned_to END,
          updated_at=NOW()
         WHERE id=$1 AND project_id=$2 RETURNING *`,
        [args.stageId, args.projectId, i['name']??null, i['status']??null, i['completionPct']??null, i['plannedStartDate']??null, i['plannedEndDate']??null, i['actualStartDate']??null, i['actualEndDate']??null, i['notes']??null, assignedTo??null],
      )
      if (!r.rows[0]) throw new Error('Stage not found')
      const row = r.rows[0] as Record<string, unknown>
      const assigneeName = row['assigned_to']
        ? (await query(`SELECT first_name||' '||last_name AS n FROM employees WHERE id=$1`, [row['assigned_to']])).rows[0]?.['n'] ?? null
        : null
      const stageParts: string[] = []
      if (i['status']) stageParts.push(`status → ${String(i['status']).replace(/_/g, ' ')}`)
      if (i['completionPct'] !== null && i['completionPct'] !== undefined) stageParts.push(`${String(i['completionPct'])}% complete`)
      if (assigneeName) stageParts.push(`assigned to ${assigneeName}`)
      await logActivity(args.projectId, ctx.auth.userId, 'stage_update',
        `Stage "${String(row.name)}" updated${stageParts.length ? ': ' + stageParts.join(', ') : ''}`)
      return { id: row.id, name: row.name, sequence: row.sequence, status: row.status, completionPct: row.completion_pct ?? 0, plannedStartDate: row.planned_start_date, plannedEndDate: row.planned_end_date, actualStartDate: row.actual_start_date, actualEndDate: row.actual_end_date, notes: row.notes, assignedTo: row['assigned_to'] ?? null, assignedToName: assigneeName }
    },

    addProjectMember: async (_: unknown, args: { projectId: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO project_members (project_id,employee_id,role,allocated_hours,start_date,end_date)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (project_id,employee_id) DO UPDATE SET is_active=true, role=EXCLUDED.role, updated_at=NOW()
         RETURNING *`,
        [args.projectId, i['employeeId'], i['role']??null, i['allocatedHours']??null, i['startDate']??null, i['endDate']??null],
      )
      const row = r.rows[0] as Record<string, unknown>
      const emp = await query(`SELECT first_name||' '||last_name AS name FROM employees WHERE id=$1`, [i['employeeId']])
      const empName = emp.rows[0]?.name ?? 'Unknown'
      await logActivity(args.projectId, ctx.auth.userId, 'team_add', `Team member added: ${empName}`)
      return { id: row.id, employeeId: row.employee_id, name: empName, role: row.role, allocatedHours: row.allocated_hours, startDate: row.start_date, endDate: row.end_date, isActive: row.is_active }
    },

    removeProjectMember: async (_: unknown, args: { projectId: string; memberId: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const empRow = await query(
        `SELECT e.first_name||' '||e.last_name AS name FROM project_members pm JOIN employees e ON e.id = pm.employee_id WHERE pm.id=$1`,
        [args.memberId],
      )
      await query(`UPDATE project_members SET is_active=false, updated_at=NOW() WHERE id=$1 AND project_id=$2`, [args.memberId, args.projectId])
      await logActivity(args.projectId, ctx.auth.userId, 'team_remove', `Team member removed: ${empRow.rows[0]?.name ?? 'Unknown'}`)
      return true
    },

    addProjectTeamMember: async (_: unknown, args: { projectId: string; employeeId: string; role: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(
        `INSERT INTO project_members (project_id, employee_id, role)
         VALUES ($1,$2,$3)
         ON CONFLICT (project_id, employee_id) DO UPDATE SET is_active = true, role = EXCLUDED.role, updated_at = NOW()
         RETURNING *`,
        [args.projectId, args.employeeId, args.role],
      )
      const emp = await query(`SELECT first_name || ' ' || last_name AS name FROM employees WHERE id = $1`, [args.employeeId])
      return { id: r.rows[0].id, employee_id: args.employeeId, employee_name: emp.rows[0]?.name ?? '', role: args.role }
    },

    removeProjectTeamMember: async (_: unknown, args: { projectId: string; memberId: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(`UPDATE project_members SET is_active = false, updated_at = NOW() WHERE id=$1 AND project_id=$2`, [args.memberId, args.projectId])
      return true
    },

    createProjectContract: async (_: unknown, args: { projectId: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const num = `CTR-${Date.now()}`
      const billingMethodMap: Record<string, string> = {
        fixed: 'fixed_lump_sum', fixed_lump_sum: 'fixed_lump_sum',
        milestone: 'milestone',
        time_material: 'cost_plus', cost_plus: 'cost_plus',
        percentage: 'progress', progress: 'progress',
      }
      const billingMethod = billingMethodMap[String(i['defaultBillingMethod'])] ?? 'fixed_lump_sum'
      const r = await query(
        `INSERT INTO project_contracts (company_id,project_id,contract_number,contract_name,client_name,
           contract_value,currency_code,default_billing_method,default_margin_pct,retention_pct,contract_date,status,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_DATE,$11,$12) RETURNING *`,
        [ctx.auth.companyId, args.projectId, num, i['contractName'], i['clientName'],
         i['contractValue'] ?? 0, i['currencyCode'] ?? 'IQD', billingMethod,
         i['defaultMarginPct'] ?? 0, i['retentionPct'] ?? 0, i['status'] ?? 'draft', ctx.auth.userId],
      )
      const row = r.rows[0] as Record<string, unknown>
      return {
        id: row['id'], contractNumber: row['contract_number'], contractName: row['contract_name'],
        clientName: row['client_name'], contractValue: parseFloat(String(row['contract_value'])),
        currencyCode: row['currency_code'], defaultBillingMethod: row['default_billing_method'],
        defaultMarginPct: parseFloat(String(row['default_margin_pct'])),
        retentionPct: parseFloat(String(row['retention_pct'])),
        status: row['status'], milestones: [], invoices: [], totalInvoiced: 0, totalPaid: 0, outstanding: 0,
      }
    },

    updateProjectContract: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const billingMethodMap: Record<string, string> = {
        fixed: 'fixed_lump_sum', fixed_lump_sum: 'fixed_lump_sum',
        milestone: 'milestone',
        time_material: 'cost_plus', cost_plus: 'cost_plus',
        percentage: 'progress', progress: 'progress',
      }
      const billingMethod = i['defaultBillingMethod'] != null
        ? (billingMethodMap[String(i['defaultBillingMethod'])] ?? 'fixed_lump_sum')
        : null
      const r = await query(
        `UPDATE project_contracts SET contract_name=COALESCE($3,contract_name), client_name=COALESCE($4,client_name),
           contract_value=COALESCE($5,contract_value), default_billing_method=COALESCE($6,default_billing_method),
           default_margin_pct=COALESCE($7,default_margin_pct), retention_pct=COALESCE($8,retention_pct),
           status=COALESCE($9,status), updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [args.id, ctx.auth.companyId, i['contractName'] ?? null, i['clientName'] ?? null,
         i['contractValue'] ?? null, billingMethod,
         i['defaultMarginPct'] ?? null, i['retentionPct'] ?? null, i['status'] ?? null],
      )
      if (!r.rows[0]) throw new Error('Contract not found')
      const row = r.rows[0] as Record<string, unknown>
      return {
        id: row['id'], contractNumber: row['contract_number'], contractName: row['contract_name'],
        clientName: row['client_name'], contractValue: parseFloat(String(row['contract_value'])),
        currencyCode: row['currency_code'], defaultBillingMethod: row['default_billing_method'],
        defaultMarginPct: parseFloat(String(row['default_margin_pct'])),
        retentionPct: parseFloat(String(row['retention_pct'])),
        status: row['status'], milestones: [], invoices: [], totalInvoiced: 0, totalPaid: 0, outstanding: 0,
      }
    },

    createProjectInvoice: async (_: unknown, args: { contractId: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input

      // Billing method mapping: UI values → DB CHECK constraint values
      const methodMap: Record<string, string> = {
        fixed: 'fixed_lump_sum',
        time_material: 'cost_plus',
        milestone: 'milestone',
        percentage: 'progress',
        fixed_lump_sum: 'fixed_lump_sum',
        cost_plus: 'cost_plus',
        progress: 'progress',
      }
      const billingMethod = methodMap[String(i['billingMethod'])] ?? 'fixed_lump_sum'

      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        // Resolve project_id from contract (required NOT NULL column)
        const contractRow = await client.query(
          `SELECT project_id FROM project_contracts WHERE id=$1 AND company_id=$2`,
          [args.contractId, ctx.auth!.companyId],
        )
        if (!contractRow.rows[0]) throw new Error('Contract not found')
        const projectId = contractRow.rows[0].project_id

        const num = `INV-${Date.now()}`
        const lines = (i['lines'] as Array<Record<string, unknown>>) ?? []
        const subtotalBeforeTax = lines.reduce((s, l) => s + (Number(l['qty'] ?? 1) * Number(l['unitCost'] ?? 0)), 0)
        const taxTotal = lines.reduce((s, l) => {
          const sub = Number(l['qty'] ?? 1) * Number(l['unitCost'] ?? 0)
          return s + sub * (Number(l['taxPct'] ?? 0) / 100)
        }, 0)
        const grossTotal     = subtotalBeforeTax + taxTotal
        const discountPct    = Number(i['discountPct']    ?? 0)
        const discountAmount = Number(i['discountAmount'] ?? 0)
        const discountTotal  = discountAmount + (grossTotal * discountPct / 100)
        const basePayable    = Math.max(0, grossTotal - discountTotal)
        const whtApplies     = Boolean(i['whtApplies'] ?? false)
        const whtScenario    = whtApplies ? (String(i['whtScenario'] ?? '')) : null
        const whtRate        = whtApplies ? Number(i['whtRate'] ?? 0) : 0
        const whtAmount      = whtApplies ? Math.round(basePayable * whtRate * 10000) / 10000 : 0
        const netPayable     = basePayable  // AR = gross (WHT handled at payment receipt)

        const inv = await client.query(
          `INSERT INTO project_invoices
             (company_id,project_id,contract_id,invoice_number,billing_method,display_mode,
              gross_total,discount_pct,discount_amount,retention_amount,net_payable,
              wht_applies,wht_scenario,wht_rate,wht_amount,
              status,invoice_date,due_date,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13,$14,'draft',NOW(),$15,$16) RETURNING *`,
          [ctx.auth!.companyId, projectId, args.contractId, num, billingMethod,
           i['displayMode'] ?? 'detailed', grossTotal, discountPct, discountAmount,
           netPayable, whtApplies, whtScenario, whtRate, whtAmount,
           i['dueDate'], ctx.auth!.userId],
        )
        const invId = inv.rows[0].id
        for (let idx = 0; idx < lines.length; idx++) {
          const l = lines[idx]
          const sub       = Number(l['qty'] ?? 1) * Number(l['unitCost'] ?? 0)
          const margin    = sub * (Number(l['marginPct'] ?? 0) / 100)
          const taxPct    = Number(l['taxPct'] ?? 0)
          const taxAmount = sub * (taxPct / 100)
          await client.query(
            `INSERT INTO project_invoice_lines
               (invoice_id,line_number,description,source_type,qty,unit_cost,subtotal,margin_pct,margin_amount,tax_pct,tax_amount,line_total,source_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [invId, idx + 1, l['description'], l['sourceType'] ?? 'manual',
             l['qty'] ?? 1, l['unitCost'] ?? 0, sub, l['marginPct'] ?? 0, margin,
             taxPct, taxAmount, sub + margin + taxAmount, l['sourceId'] ?? null],
          )
        }
        const r = inv.rows[0] as Record<string, unknown>
        return {
          id: r['id'], invoiceNumber: r['invoice_number'], billingMethod: r['billing_method'],
          displayMode: r['display_mode'], grossTotal: parseFloat(String(r['gross_total'])),
          discountPct: parseFloat(String(r['discount_pct'] ?? 0)),
          discountAmount: parseFloat(String(r['discount_amount'] ?? 0)),
          retentionAmount: parseFloat(String(r['retention_amount'] ?? 0)),
          netPayable: parseFloat(String(r['net_payable'])),
          whtApplies: Boolean(r['wht_applies'] ?? false),
          whtScenario: r['wht_scenario'] ?? null,
          whtRate: parseFloat(String(r['wht_rate'] ?? 0)),
          whtAmount: parseFloat(String(r['wht_amount'] ?? 0)),
          status: r['status'], invoiceDate: r['invoice_date'], dueDate: r['due_date'],
          lines: [], payments: [],
        }
      })
    },

    updateProjectInvoice: async (
      _: unknown,
      args: { id: string; invoiceDate?: string; lines?: Array<{ id?: string; description?: string; qty?: number; unitCost?: number }> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const auth = ctx.auth as GWAuth
      const isAdmin = isAdminGW(auth.role)
      if (!isAdmin) throw new Error('Admin role required to edit invoices')
      const invRow = await query(`SELECT * FROM project_invoices WHERE id=$1 AND company_id=$2`, [args.id, auth.companyId])
      if (!invRow.rows[0]) throw new Error('Invoice not found')
      const inv = invRow.rows[0] as Record<string, unknown>

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        if (args.lines !== undefined) {
          // Delete lines that were removed (exist in DB but not in the new list)
          const keptIds = (args.lines).filter(l => l.id).map(l => l.id as string)
          if (keptIds.length > 0) {
            await client.query(
              `DELETE FROM project_invoice_lines WHERE invoice_id=$1 AND id NOT IN (${keptIds.map((_, i) => `$${i + 2}`).join(',')})`,
              [args.id, ...keptIds],
            )
          } else {
            await client.query(`DELETE FROM project_invoice_lines WHERE invoice_id=$1`, [args.id])
          }

          // Process each line in order
          for (let i = 0; i < args.lines.length; i++) {
            const line = args.lines[i]
            const lineNum = i + 1

            if (line.id) {
              // UPDATE existing line
              const ex = await client.query(`SELECT * FROM project_invoice_lines WHERE id=$1 AND invoice_id=$2`, [line.id, args.id])
              if (!ex.rows[0]) continue
              const exRow    = ex.rows[0] as Record<string, unknown>
              const qty      = line.qty      ?? parseFloat(String(exRow['qty']))
              const unitCost = line.unitCost ?? parseFloat(String(exRow['unit_cost']))
              const subtotal = qty * unitCost
              const marginPct    = parseFloat(String(exRow['margin_pct'] ?? 0))
              const marginAmount = subtotal * marginPct
              const lineTotal    = subtotal + marginAmount
              await client.query(
                `UPDATE project_invoice_lines
                    SET line_number=$1, description=$2, qty=$3, unit_cost=$4, subtotal=$5, margin_amount=$6, line_total=$7
                  WHERE id=$8`,
                [lineNum, line.description ?? exRow['description'], qty, unitCost, subtotal, marginAmount, lineTotal, line.id],
              )
            } else {
              // INSERT new line
              const qty      = line.qty      ?? 1
              const unitCost = line.unitCost ?? 0
              const subtotal = qty * unitCost
              await client.query(
                `INSERT INTO project_invoice_lines
                   (invoice_id, line_number, description, source_type, qty, unit_cost, subtotal, margin_pct, margin_amount, tax_pct, tax_amount, line_total)
                 VALUES ($1,$2,$3,'manual',$4,$5,$6,0,0,0,0,$6)`,
                [args.id, lineNum, line.description ?? 'New item', qty, unitCost, subtotal],
              )
            }
          }
        }

        // Recalculate invoice header totals from lines
        const totals = await client.query(
          `SELECT COALESCE(SUM(subtotal),0) AS sub, COALESCE(SUM(line_total),0) AS gross, COALESCE(SUM(margin_amount),0) AS margin
             FROM project_invoice_lines WHERE invoice_id=$1`,
          [args.id],
        )
        const t = totals.rows[0] as Record<string, unknown>
        const newSubtotal   = parseFloat(String(t['sub']))
        const newGross      = parseFloat(String(t['gross']))
        const newMargin     = parseFloat(String(t['margin']))
        const retentionAmt  = parseFloat(String(inv['retention_amount'] ?? 0))
        const whtAmt        = parseFloat(String(inv['wht_amount'] ?? 0))
        const newNetPayable = newGross - retentionAmt - whtAmt

        const headerSets: string[] = [
          `subtotal=$1`, `margin_total=$2`, `gross_total=$3`, `net_payable=$4`, `updated_at=NOW()`,
        ]
        const headerParams: unknown[] = [newSubtotal, newMargin, newGross, newNetPayable]
        if (args.invoiceDate) {
          headerSets.push(`invoice_date=$${headerParams.length + 1}`)
          headerParams.push(args.invoiceDate)
        }

        // Recalculate status if there are payments so editing lines doesn't leave
        // the invoice showing 'paid' when more is now owed (or 'partial' when now fully covered)
        const currentStatus = String(inv['status'] ?? '')
        if (['issued', 'sent', 'partial', 'paid'].includes(currentStatus)) {
          const paidRes = await client.query<{ total: string }>(
            `SELECT COALESCE(SUM(amount),0) AS total FROM project_invoice_payments WHERE invoice_id=$1`,
            [args.id],
          )
          const totalPaidNow = parseFloat(paidRes.rows[0]?.['total'] ?? '0')
          if (totalPaidNow > 0) {
            const whtScenario = inv['wht_scenario'] as string | null
            const cashTarget  = whtScenario === 'client_withholds' ? newNetPayable - whtAmt : newNetPayable
            const recalcStatus = totalPaidNow >= cashTarget - 0.001 ? 'paid' : 'partial'
            if (recalcStatus !== currentStatus) {
              headerSets.push(`status=$${headerParams.length + 1}`)
              headerParams.push(recalcStatus)
            }
          }
        }

        headerParams.push(args.id)
        await client.query(
          `UPDATE project_invoices SET ${headerSets.join(', ')} WHERE id=$${headerParams.length}`,
          headerParams,
        )

        await client.query('COMMIT')
      } catch (e) { await client.query('ROLLBACK'); throw e }
      finally { client.release() }

      // Re-fetch and return full invoice shape
      const updated = await query(
        `SELECT pi.*, p.code AS project_code, p.name AS project_name, pc.contract_number, pc.client_name, pc.retention_pct,
                co.name AS company_name, co.legal_name AS company_legal_name, co.country_code AS company_country,
                co.stamp_image AS company_stamp, co.letterhead_image AS company_letterhead,
                co.address AS company_address, co.phone AS company_phone, co.email AS company_email,
                cb.name AS branch_name, cb.address AS branch_address,
                cb.city AS branch_city, cb.phone AS branch_phone,
                COALESCE(sc.default_payment_terms_days,30) AS payment_terms_days
           FROM project_invoices pi
           LEFT JOIN projects p ON p.id=pi.project_id
           LEFT JOIN project_contracts pc ON pc.id=pi.contract_id
           LEFT JOIN companies co ON co.id=pi.company_id
           LEFT JOIN system_configuration sc ON sc.company_id=pi.company_id
           LEFT JOIN LATERAL (
             SELECT name, address, city, phone
             FROM company_branches
             WHERE company_id = pi.company_id AND is_active = TRUE
             ORDER BY created_at ASC LIMIT 1
           ) cb ON TRUE
          WHERE pi.id=$1`,
        [args.id],
      )
      const u = updated.rows[0] as Record<string, unknown>
      const [uLines, uPayments] = await Promise.all([
        query('SELECT * FROM project_invoice_lines WHERE invoice_id=$1 ORDER BY line_number', [args.id]),
        query('SELECT * FROM project_invoice_payments WHERE invoice_id=$1 ORDER BY payment_date', [args.id]),
      ])
      return {
        id: u['id'], invoiceNumber: u['invoice_number'], billingMethod: u['billing_method'],
        displayMode: u['display_mode'], grossTotal: parseFloat(String(u['gross_total'])),
        retentionAmount: parseFloat(String(u['retention_amount'])), netPayable: parseFloat(String(u['net_payable'])),
        whtApplies: Boolean(u['wht_applies'] ?? false), whtScenario: u['wht_scenario'] ?? null,
        whtRate: parseFloat(String(u['wht_rate'] ?? 0)), whtAmount: parseFloat(String(u['wht_amount'] ?? 0)),
        status: u['status'], invoiceDate: u['invoice_date'], dueDate: u['due_date'],
        currencyCode: u['currency_code'] ?? 'IQD', bankAccountId: u['bank_account_id'] ?? null,
        paymentType: u['payment_type'] ?? 'wire_transfer', projectCode: u['project_code'] ?? null,
        projectName: u['project_name'] ?? null, contractNumber: u['contract_number'] ?? null,
        clientName: u['client_name'] ?? null, retentionPct: parseFloat(String(u['retention_pct'] ?? 0)),
        companyName: u['company_name'] ?? null, companyLegalName: u['company_legal_name'] ?? null,
        companyCountry: u['company_country'] ?? 'IQ', companyStampImage: u['company_stamp'] ?? null,
        companyLetterheadImage: u['company_letterhead'] ?? null,
        companyAddress: u['company_address'] ?? null, companyPhone: u['company_phone'] ?? null,
        companyEmail: u['company_email'] ?? null,
        companyBranchName: u['branch_name'] ?? null,
        companyBranchAddress: u['branch_address'] ?? null,
        companyBranchCity: u['branch_city'] ?? null,
        companyBranchPhone: u['branch_phone'] ?? null,
        paymentTermsDays: parseInt(String(u['payment_terms_days'] ?? 30)),
        verificationToken: u['verification_token'] ?? null,
        lines: uLines.rows.map((l: Record<string, unknown>) => ({
          id: l['id'], lineNumber: l['line_number'], description: l['description'], sourceType: l['source_type'],
          qty: parseFloat(String(l['qty'])), unitCost: parseFloat(String(l['unit_cost'])),
          subtotal: parseFloat(String(l['subtotal'])), marginPct: parseFloat(String(l['margin_pct'])),
          marginAmount: parseFloat(String(l['margin_amount'])), taxPct: parseFloat(String(l['tax_pct'] ?? 0)),
          taxAmount: parseFloat(String(l['tax_amount'] ?? 0)), lineTotal: parseFloat(String(l['line_total'])),
          moComponents: l['mo_components'] ?? null,
        })),
        payments: uPayments.rows.map((p: Record<string, unknown>) => ({
          id: p['id'], paymentDate: p['payment_date'], amount: parseFloat(String(p['amount'])),
          paymentReference: p['payment_reference'] ?? null, paymentMethod: p['payment_method'] ?? null,
        })),
      }
    },

    voidProjectInvoice: async (_: unknown, args: { id: string; reason?: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(
        `UPDATE project_invoices SET status='void', void_reason=$3, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,
        [args.id, ctx.auth.companyId, args.reason ?? null],
      )
      if (!r.rows[0]) throw new Error('Invoice not found')
      const row = r.rows[0] as Record<string, unknown>
      return {
        id: row['id'], invoiceNumber: row['invoice_number'], billingMethod: row['billing_method'],
        displayMode: row['display_mode'], grossTotal: parseFloat(String(row['gross_total'] ?? 0)),
        discountPct: parseFloat(String(row['discount_pct'] ?? 0)),
        discountAmount: parseFloat(String(row['discount_amount'] ?? 0)),
        retentionAmount: parseFloat(String(row['retention_amount'] ?? 0)),
        netPayable: parseFloat(String(row['net_payable'] ?? 0)),
        status: row['status'], invoiceDate: row['invoice_date'], dueDate: row['due_date'],
        lines: [], payments: [],
      }
    },

    createWorkCenter: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO work_centers (company_id,code,name,capacity_hours_per_day,cost_per_hour,currency_code,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [ctx.auth.companyId, i['code'], i['name'], i['capacity_hours_per_day'] ?? 8, i['cost_per_hour'] ?? 0, i['currency_code'] ?? 'IQD', i['is_active'] ?? true],
      )
      return r.rows[0]
    },

    updateWorkCenter: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `UPDATE work_centers SET name=COALESCE($3,name), capacity_hours_per_day=COALESCE($4,capacity_hours_per_day),
           cost_per_hour=COALESCE($5,cost_per_hour), is_active=COALESCE($6,is_active), updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [args.id, ctx.auth.companyId, i['name'] ?? null, i['capacity_hours_per_day'] ?? null, i['cost_per_hour'] ?? null, i['is_active'] ?? null],
      )
      if (!r.rows[0]) throw new Error('Work center not found')
      return r.rows[0]
    },

    createBOM: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const bom = await client.query(
          `INSERT INTO boms (company_id,finished_product_id,version,name,qty_produced,notes,is_active,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING *`,
          [ctx.auth!.companyId, i['finished_product_id'], i['version'] ?? '1.0', i['name'] ?? null, i['qty_produced'] ?? 1, i['notes'] ?? null, ctx.auth!.userId],
        )
        const bomId = bom.rows[0].id as string
        const lines = (i['lines'] as Array<Record<string, unknown>>) ?? []
        for (let idx = 0; idx < lines.length; idx++) {
          const l = lines[idx]!
          await client.query(
            `INSERT INTO bom_lines (bom_id,sequence,component_product_id,qty_required,uom,unit_cost,notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [bomId, l['sequence'] ?? idx + 1, l['component_product_id'], l['qty_required'] ?? l['qty'], l['uom'] ?? 'unit', l['unit_cost'] ?? 0, l['notes'] ?? null],
          )
        }
        return bom.rows[0]
      })
    },

    updateBOM: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const bom = await client.query(
          `UPDATE boms SET version=COALESCE($3,version), name=COALESCE($4,name), qty_produced=COALESCE($5,qty_produced), notes=COALESCE($6,notes), updated_at=NOW()
           WHERE id=$1 AND company_id=$2 RETURNING *`,
          [args.id, ctx.auth!.companyId, i['version'] ?? null, i['name'] ?? null, i['qty_produced'] ?? null, i['notes'] ?? null],
        )
        if (!bom.rows[0]) throw new Error('BOM not found')
        const lines = i['lines'] as Array<Record<string, unknown>> | undefined
        if (lines) {
          await client.query(`DELETE FROM bom_lines WHERE bom_id=$1`, [args.id])
          for (let idx = 0; idx < lines.length; idx++) {
            const l = lines[idx]!
            await client.query(
              `INSERT INTO bom_lines (bom_id,sequence,component_product_id,qty_required,uom,unit_cost,notes) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [args.id, l['sequence'] ?? idx + 1, l['component_product_id'], l['qty_required'] ?? l['qty'], l['uom'] ?? 'unit', l['unit_cost'] ?? 0, l['notes'] ?? null],
            )
          }
        }
        return bom.rows[0]
      })
    },

    createManufacturingOrder: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const bomR = await client.query(`SELECT * FROM boms WHERE id=$1 AND company_id=$2`, [i['bom_id'], ctx.auth!.companyId])
        if (!bomR.rows[0]) throw new Error('BOM not found')
        const bom = bomR.rows[0]
        const moNum = `MO-${Date.now()}`
        const lines = await client.query(`SELECT bl.*, p.standard_cost FROM bom_lines bl JOIN products p ON p.id=bl.component_product_id WHERE bl.bom_id=$1`, [i['bom_id']])
        const plannedCost = lines.rows.reduce((s: number, l: Record<string, unknown>) => s + (Number(l['qty_required']) * Number(l['standard_cost'] ?? 0) * Number(i['qty_planned'] ?? 1) / Number(bom.qty_produced)), 0)
        const mo = await client.query(
          `INSERT INTO manufacturing_orders (company_id,mo_number,finished_product_id,bom_id,work_center_id,project_id,
             qty_planned,qty_produced,planned_cost,actual_cost,dispatch_type,status,
             scheduled_start,scheduled_end,notes,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,0,'warehouse_first','draft',$9,$10,$11,$12) RETURNING *`,
          [ctx.auth!.companyId, moNum, bom.finished_product_id, i['bom_id'], i['work_center_id'] ?? null, i['project_id'] ?? null,
           i['qty_planned'], plannedCost, i['scheduled_start'] ?? null, i['scheduled_end'] ?? null, i['notes'] ?? null, ctx.auth!.userId],
        )
        const moId = mo.rows[0].id as string
        for (const l of lines.rows) {
          const qtyNeeded = (Number(l['qty_required']) * Number(i['qty_planned'] ?? 1)) / Number(bom.qty_produced)
          await client.query(
            `INSERT INTO mo_consumptions (mo_id,component_product_id,qty_planned,qty_consumed,unit_cost,total_cost)
             VALUES ($1,$2,$3,0,$4,$5)`,
            [moId, l['component_product_id'], qtyNeeded, l['standard_cost'] ?? 0, qtyNeeded * Number(l['standard_cost'] ?? 0)],
          )
        }
        return mo.rows[0]
      })
    },

    confirmMO: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(`UPDATE manufacturing_orders SET status='confirmed', updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`, [args.id, ctx.auth.companyId])
      if (!r.rows[0]) throw new Error('MO not found')
      return r.rows[0]
    },

    startMO: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(`UPDATE manufacturing_orders SET status='in_progress', actual_start=NOW(), updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`, [args.id, ctx.auth.companyId])
      if (!r.rows[0]) throw new Error('MO not found')
      return r.rows[0]
    },

    completeMO: async (
      _: unknown,
      args: { id: string; input: { qty_produced: number; actual_cost?: number; lines?: Array<{ component_product_id: string; qty_consumed: number; unit_cost?: number }>; notes?: string } },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const auth = ctx.auth!
      return withTransaction({ companyId: auth.companyId, userId: auth.userId, role: auth.role }, async (client) => {
        const actualCost = i.actual_cost ?? (i.lines ?? []).reduce((s, l) => s + l.qty_consumed * (l.unit_cost ?? 0), 0)

        // Fetch MO with BOM finished product info
        const moRes = await client.query(
          `SELECT mo.*, b.finished_product_id, b.qty_produced AS bom_qty_produced
           FROM manufacturing_orders mo
           LEFT JOIN boms b ON b.id = mo.bom_id
           WHERE mo.id=$1 AND mo.company_id=$2`,
          [args.id, auth.companyId],
        )
        const mo = moRes.rows[0] as Record<string, unknown>
        if (!mo) throw new Error('MO not found')

        // Mark MO done
        await client.query(
          `UPDATE manufacturing_orders SET status='completed', qty_produced=$3, actual_cost=$4, actual_end=NOW(), updated_at=NOW()
           WHERE id=$1 AND company_id=$2`,
          [args.id, auth.companyId, i.qty_produced, actualCost],
        )

        // Find or auto-create virtual locations for this company
        const virtOutRes = await client.query(
          `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_out' AND is_active=true LIMIT 1`,
          [auth.companyId],
        )
        const virtualOutId: string = virtOutRes.rows[0]?.id ?? (await client.query(
          `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,'Virtual Consumption','virtual_out',true) RETURNING id`,
          [auth.companyId],
        )).rows[0].id as string

        const virtInRes = await client.query(
          `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
          [auth.companyId],
        )
        const virtualInId: string = virtInRes.rows[0]?.id ?? (await client.query(
          `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,'Virtual Receipts','virtual_in',true) RETURNING id`,
          [auth.companyId],
        )).rows[0].id as string

        // Default warehouse (for finished product output)
        const warehouseRes = await client.query(
          `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true ORDER BY created_at LIMIT 1`,
          [auth.companyId],
        )
        const defaultWarehouseId = warehouseRes.rows[0]?.id as string | undefined

        // Get consumptions from mo_consumptions
        const consRes = await client.query(
          `SELECT mc.*, p.name AS product_name, p.reorder_point
           FROM mo_consumptions mc
           JOIN products p ON p.id = mc.component_product_id
           WHERE mc.mo_id=$1`,
          [args.id],
        )
        const consumptions = consRes.rows as Record<string, unknown>[]

        // Merge with input lines (input overrides planned qty if provided)
        const consumedMap: Record<string, { qty: number; unitCost: number }> = {}
        for (const c of consumptions) {
          const productId = String(c['component_product_id'])
          consumedMap[productId] = {
            qty: parseFloat(String(c['qty_planned'] ?? 0)),
            unitCost: parseFloat(String(c['unit_cost'] ?? 0)),
          }
        }
        for (const l of i.lines ?? []) {
          consumedMap[l.component_product_id] = {
            qty: l.qty_consumed,
            unitCost: l.unit_cost ?? consumedMap[l.component_product_id]?.unitCost ?? 0,
          }
        }

        // Deduct each component from the location where it actually has stock
        for (const [productId, { qty, unitCost }] of Object.entries(consumedMap)) {
          if (qty <= 0) continue

          // Find the warehouse location that actually holds this product's stock
          const stockLocRes = await client.query(
            `SELECT sb.location_id FROM stock_balances sb
             JOIN stock_locations sl ON sl.id = sb.location_id
             WHERE sb.product_id=$1 AND sl.company_id=$2 AND sl.type='warehouse' AND sb.qty_on_hand > 0
             ORDER BY sb.qty_on_hand DESC LIMIT 1`,
            [productId, auth.companyId],
          )
          const fromLocationId = stockLocRes.rows[0]?.location_id as string | undefined ?? defaultWarehouseId
          if (!fromLocationId) continue

          await client.query(
            `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,source_type,notes,moved_by)
             VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'mo_consumption',$8,$9)`,
            [auth.companyId, productId, fromLocationId, virtualOutId, qty, unitCost, qty * unitCost,
             `MO ${String(mo['mo_number'] ?? args.id)} consumption`, auth.userId],
          )
          await client.query(
            `UPDATE mo_consumptions SET qty_consumed=$1, unit_cost=$2, total_cost=$3 WHERE mo_id=$4 AND component_product_id=$5`,
            [qty, unitCost, qty * unitCost, args.id, productId],
          )
        }

        // Add finished product to warehouse: virtual_in → warehouse
        const finishedProductId = mo['finished_product_id'] as string | null
        if (finishedProductId && i.qty_produced > 0 && defaultWarehouseId) {
          const finCostPerUnit = actualCost > 0 ? actualCost / i.qty_produced : 0
          const srcId = virtualInId ?? virtualOutId ?? defaultWarehouseId
          await client.query(
            `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,source_type,notes,moved_by)
             VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'mo_output',$8,$9)`,
            [auth.companyId, finishedProductId, srcId, defaultWarehouseId, i.qty_produced, finCostPerUnit, actualCost,
             `MO ${String(mo['mo_number'] ?? args.id)} output`, auth.userId],
          )
        }

        // Check reorder points for all consumed components and send notifications
        const lowStockProducts = await client.query(
          `SELECT p.id, p.name, p.sku, p.reorder_point,
                  COALESCE(SUM(sb.qty_on_hand), 0) AS qty_on_hand
           FROM products p
           LEFT JOIN stock_balances sb ON sb.product_id = p.id
           LEFT JOIN stock_locations sl ON sl.id = sb.location_id AND sl.type NOT IN ('virtual_in','virtual_out')
           WHERE p.id = ANY($1) AND p.reorder_point IS NOT NULL AND p.company_id=$2 AND (sb.id IS NULL OR sl.id IS NOT NULL)
           GROUP BY p.id, p.name, p.sku, p.reorder_point
           HAVING COALESCE(SUM(sb.qty_on_hand), 0) < p.reorder_point`,
          [Object.keys(consumedMap), auth.companyId],
        )

        if (lowStockProducts.rows.length > 0) {
          // Notify all users with inventory module access in this company
          const inventoryUsers = await client.query(
            `SELECT DISTINCT user_id FROM user_company_roles WHERE company_id=$1 AND module='inventory'`,
            [auth.companyId],
          )
          for (const product of lowStockProducts.rows as Record<string, unknown>[]) {
            const qty = parseFloat(String(product['qty_on_hand'] ?? 0))
            const reorder = parseFloat(String(product['reorder_point'] ?? 0))
            for (const u of inventoryUsers.rows as Record<string, unknown>[]) {
              await client.query(
                `INSERT INTO notifications (company_id,user_id,type,title,body,data)
                 VALUES ($1,$2,'low_stock',$3,$4,$5)`,
                [
                  auth.companyId,
                  u['user_id'],
                  `Low Stock: ${String(product['name'])}`,
                  `${String(product['sku'])} is below reorder point. On hand: ${qty.toFixed(2)}, reorder point: ${reorder.toFixed(2)}.`,
                  JSON.stringify({ product_id: product['id'], qty_on_hand: qty, reorder_point: reorder }),
                ],
              )
            }
          }
        }

        // Update linked manufacturing request if any
        const mrRes2 = await client.query(
          `SELECT mr.*, p.company_id AS project_company_id, p.analytic_account_id AS project_analytic_account_id
           FROM manufacturing_requests mr
           LEFT JOIN projects p ON p.id = mr.project_id
           WHERE mr.mo_id=$1`,
          [args.id],
        )
        const linkedMR = mrRes2.rows[0] as Record<string, unknown> | undefined
        if (linkedMR) {
          await client.query(
            `UPDATE manufacturing_requests SET status='completed', actual_cost=$2, updated_at=NOW() WHERE id=$1`,
            [linkedMR['id'], actualCost],
          )

          // Create interco transaction if requesting company differs from manufacturing company
          const reqCompanyId = String(linkedMR['requesting_company_id'] ?? '')
          if (reqCompanyId && reqCompanyId !== auth.companyId && actualCost > 0) {
            const itRes = await client.query(
              `INSERT INTO interco_transactions
                 (from_company_id, to_company_id, transaction_type, amount, currency_code,
                  description, reference, status, created_by)
               VALUES ($1,$2,'service_charge',$3,'IQD',$4,$5,'pending',$6) RETURNING id`,
              [
                auth.companyId,
                reqCompanyId,
                actualCost,
                `Manufacturing service: MO ${String(mo['mo_number'] ?? args.id)}`,
                String(mo['mo_number'] ?? args.id),
                auth.userId,
              ],
            )
            await client.query(
              `UPDATE manufacturing_requests SET interco_transaction_id=$1 WHERE id=$2`,
              [itRes.rows[0].id, linkedMR['id']],
            )
          } else {
            // Same-company manufacturing for a project: post the cost directly to GL so it
            // flows into project_cost_actuals via trg_sync_project_costs (keyed on analytic_account_id).
            const projectAnalyticAccountId = linkedMR['project_analytic_account_id'] as string | null
            if (projectAnalyticAccountId && actualCost > 0) {
              const costAcctRes = await client.query(
                `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND account_type='expense' AND is_active=true ORDER BY code ASC LIMIT 1`,
                [auth.companyId],
              )
              const invAcctRes = await client.query(
                `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND account_type='asset' AND name ILIKE '%inventory%' AND is_active=true ORDER BY code ASC LIMIT 1`,
                [auth.companyId],
              )
              const costAccountId = costAcctRes.rows[0]?.id as string | undefined
              const invAccountId = invAcctRes.rows[0]?.id as string | undefined
              if (costAccountId && invAccountId) {
                const moNumber = String(mo['mo_number'] ?? args.id)
                const je = await client.query(
                  `INSERT INTO journal_entries (company_id,reference,description,entry_date,status,source_type,source_id,created_by,posted_at,posted_by)
                   VALUES ($1,$2,$3,CURRENT_DATE,'posted','mo_completion',$4,$5,NOW(),$5) RETURNING id`,
                  [auth.companyId, `MO-${moNumber}-COST`, `Manufacturing cost: MO ${moNumber}`, args.id, auth.userId],
                )
                const jeId = je.rows[0].id as string
                await client.query(
                  `INSERT INTO journal_lines (journal_entry_id,account_id,analytic_account_id,description,debit,credit,amount_company_currency)
                   VALUES ($1,$2,$3,$4,$5,0,$5)`,
                  [jeId, costAccountId, projectAnalyticAccountId, `Project cost from MO ${moNumber}`, actualCost],
                )
                await client.query(
                  `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency)
                   VALUES ($1,$2,$3,0,$4,$4)`,
                  [jeId, invAccountId, `Inventory consumed for MO ${moNumber}`, actualCost],
                )
              }
            }
          }
        }

        return moRes.rows[0]
      })
    },

    cancelMO: async (_: unknown, args: { id: string; notes?: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(`UPDATE manufacturing_orders SET status='cancelled', cancel_notes=$3, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`, [args.id, ctx.auth.companyId, args.notes ?? null])
      if (!r.rows[0]) throw new Error('MO not found')
      return r.rows[0]
    },

    // ── Manufacturing Requests ────────────────────────────────
    createManufacturingRequest: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const reqNum = `MR-${Date.now()}`
      const r = await query(
        `INSERT INTO manufacturing_requests
           (request_number, project_id, requesting_company_id, product_id, qty_requested,
            required_date, description, notes, status, requested_by, currency_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,'IQD') RETURNING id`,
        [reqNum, i['projectId'], ctx.auth.companyId, i['productId'] ?? null,
         i['qtyRequested'] ?? 1, i['requiredDate'] ?? null, i['description'] ?? null,
         i['notes'] ?? null, ctx.auth.userId],
      )
      const newId = r.rows[0].id as string
      const full = await query(MR_SELECT + ` WHERE mr.id=$1`, [newId])
      return mapMR(full.rows[0] as Record<string, unknown>)
    },

    submitManufacturingRequest: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE manufacturing_requests SET status='pending_approval', updated_at=NOW() WHERE id=$1 AND requested_by=$2 AND status='draft'`,
        [args.id, ctx.auth.userId],
      )
      const r = await query(MR_SELECT + ` WHERE mr.id=$1`, [args.id])
      if (!r.rows[0]) throw new Error('Request not found')
      const mr = r.rows[0] as Record<string, unknown>

      // Notify all manufacturing managers across all companies
      const approvers = await query(
        `SELECT DISTINCT user_id, company_id FROM user_company_roles WHERE module='manufacturing'`,
      )
      for (const u of approvers.rows as Record<string, unknown>[]) {
        await query(
          `INSERT INTO notifications (company_id, user_id, type, title, body, data)
           VALUES ($1,$2,'manufacturing_request',$3,$4,$5)`,
          [
            u['company_id'], u['user_id'],
            `New Manufacturing Request: ${String(mr['request_number'])}`,
            `${String(mr['requesting_company_name'] ?? 'A company')} submitted a manufacturing request for ${String(mr['product_name'] ?? 'a product')} × ${String(mr['qty_requested'])}. Project: ${String(mr['project_name'] ?? '—')}.`,
            JSON.stringify({ manufacturing_request_id: args.id, request_number: mr['request_number'], link: `/manufacturing/requests/${args.id}` }),
          ],
        )
      }

      return mapMR(mr)
    },

    approveManufacturingRequest: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE manufacturing_requests SET status='approved', approved_by=$2, approved_at=NOW(), updated_at=NOW() WHERE id=$1 AND status='pending_approval'`,
        [args.id, ctx.auth.userId],
      )
      const r = await query(MR_SELECT + ` WHERE mr.id=$1`, [args.id])
      if (!r.rows[0]) throw new Error('Request not found')
      const mr = r.rows[0] as Record<string, unknown>

      // Notify the original requester
      await query(
        `INSERT INTO notifications (company_id, user_id, type, title, body, data)
         VALUES ($1,$2,'manufacturing_request_approved',$3,$4,$5)`,
        [
          mr['requesting_company_id'], mr['requested_by'],
          `Manufacturing Request Approved: ${String(mr['request_number'])}`,
          `Your request for ${String(mr['product_name'] ?? 'a product')} × ${String(mr['qty_requested'])} has been approved by ${String(mr['approved_by_name'] ?? 'a manager')}.`,
          JSON.stringify({ manufacturing_request_id: args.id, request_number: mr['request_number'], link: `/manufacturing/requests/${args.id}` }),
        ],
      )

      return mapMR(mr)
    },

    rejectManufacturingRequest: async (_: unknown, args: { id: string; reason: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE manufacturing_requests SET status='cancelled', rejection_reason=$2, updated_at=NOW() WHERE id=$1 AND status='pending_approval'`,
        [args.id, args.reason],
      )
      const r = await query(MR_SELECT + ` WHERE mr.id=$1`, [args.id])
      if (!r.rows[0]) throw new Error('Request not found')
      const mr = r.rows[0] as Record<string, unknown>

      // Notify the original requester
      await query(
        `INSERT INTO notifications (company_id, user_id, type, title, body, data)
         VALUES ($1,$2,'manufacturing_request_rejected',$3,$4,$5)`,
        [
          mr['requesting_company_id'], mr['requested_by'],
          `Manufacturing Request Rejected: ${String(mr['request_number'])}`,
          `Your request for ${String(mr['product_name'] ?? 'a product')} × ${String(mr['qty_requested'])} was rejected. Reason: ${args.reason}.`,
          JSON.stringify({ manufacturing_request_id: args.id, request_number: mr['request_number'], reason: args.reason, link: `/manufacturing/requests/${args.id}` }),
        ],
      )

      return mapMR(mr)
    },

    cancelManufacturingRequest: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE manufacturing_requests SET status='cancelled', updated_at=NOW() WHERE id=$1 AND status IN ('draft','pending_approval')`,
        [args.id],
      )
      const r = await query(MR_SELECT + ` WHERE mr.id=$1`, [args.id])
      if (!r.rows[0]) throw new Error('Request not found')
      return mapMR(r.rows[0] as Record<string, unknown>)
    },

    createMOFromRequest: async (
      _: unknown,
      args: { requestId: string; bomId: string; workCenterId?: string; scheduledStart?: string; scheduledEnd?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const auth = ctx.auth!
      return withTransaction({ companyId: auth.companyId, userId: auth.userId, role: auth.role }, async (client) => {
        // Load request
        const mrRes = await client.query(`SELECT * FROM manufacturing_requests WHERE id=$1`, [args.requestId])
        const mr = mrRes.rows[0] as Record<string, unknown>
        if (!mr) throw new Error('Manufacturing request not found')
        if (!['approved'].includes(String(mr['status']))) throw new Error('Request must be approved before creating MO')

        // Load BOM — allow cross-company (MR requester may be different company than factory)
        const bomRes = await client.query(`SELECT * FROM boms WHERE id=$1`, [args.bomId])
        if (!bomRes.rows[0]) throw new Error('BOM not found')
        const bom = bomRes.rows[0] as Record<string, unknown>
        // MO belongs to the factory that owns the BOM, not necessarily the requesting company
        const moCompanyId = bom['company_id'] as string

        const moNum = `MO-${Date.now()}`
        const lines = await client.query(
          `SELECT bl.*, p.standard_cost FROM bom_lines bl JOIN products p ON p.id=bl.component_product_id WHERE bl.bom_id=$1`,
          [args.bomId],
        )
        const qtyPlanned = parseFloat(String(mr['qty_requested'] ?? 1))
        const bomQtyProduced = parseFloat(String(bom['qty_produced'] ?? 1))
        const plannedCost = lines.rows.reduce(
          (s: number, l: Record<string, unknown>) =>
            s + (Number(l['qty_required']) * Number(l['standard_cost'] ?? 0) * qtyPlanned) / bomQtyProduced,
          0,
        )

        const moInsert = await client.query(
          `INSERT INTO manufacturing_orders (company_id, mo_number, finished_product_id, bom_id, work_center_id,
             project_id, qty_planned, qty_produced, planned_cost, actual_cost, dispatch_type, status,
             scheduled_start, scheduled_end, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,0,'warehouse_first','draft',$9,$10,$11) RETURNING id`,
          [moCompanyId, moNum, bom['finished_product_id'], args.bomId, args.workCenterId ?? null,
           mr['project_id'], qtyPlanned, plannedCost,
           args.scheduledStart ?? null, args.scheduledEnd ?? null, auth.userId],
        )
        const moId = moInsert.rows[0].id as string

        for (const l of lines.rows as Record<string, unknown>[]) {
          const qtyNeeded = (Number(l['qty_required']) * qtyPlanned) / bomQtyProduced
          await client.query(
            `INSERT INTO mo_consumptions (mo_id, component_product_id, qty_planned, qty_consumed, unit_cost, total_cost)
             VALUES ($1,$2,$3,0,$4,$5)`,
            [moId, l['component_product_id'], qtyNeeded, l['standard_cost'] ?? 0, qtyNeeded * Number(l['standard_cost'] ?? 0)],
          )
        }

        // Link MO to request and update status
        await client.query(
          `UPDATE manufacturing_requests SET mo_id=$1, status='in_production', updated_at=NOW() WHERE id=$2`,
          [moId, args.requestId],
        )

        const full = await client.query(MR_SELECT + ` WHERE mr.id=$1`, [args.requestId])
        return mapMR(full.rows[0] as Record<string, unknown>)
      })
    },

    // ── HR Mutations ─────────────────────────────────────────────

    createEmployee: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO employees (company_id, employee_number, first_name, last_name, email, phone,
           national_id, passport_number, nationality, date_of_birth, gender,
           job_title, department_id, work_location_id, manager_id,
           employment_type, hire_date, status, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,COALESCE($18,'active'),$19)
         RETURNING id`,
        [ctx.auth.companyId, i['employee_number'] ?? null, i['first_name'], i['last_name'],
         i['email'] ?? null, i['phone'] ?? null, i['national_id'] ?? null,
         i['passport_number'] ?? null, i['nationality'] ?? null,
         i['date_of_birth'] ?? null, i['gender'] ?? null,
         i['job_title'] ?? null, i['department_id'] ?? null, i['work_location_id'] ?? null,
         i['manager_id'] ?? null, i['employment_type'] ?? 'full_time',
         i['hire_date'] ?? null, i['status'] ?? 'active', i['user_id'] ?? null],
      )
      const id = r.rows[0].id as string
      const emp = await query(
        `SELECT e.*, d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1`,
        [id],
      )
      return emp.rows[0]
    },

    updateEmployee: async (
      _: unknown,
      args: { id: string; input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      await query(
        `UPDATE employees SET
           employee_number=COALESCE($1,employee_number), first_name=COALESCE($2,first_name),
           last_name=COALESCE($3,last_name), email=COALESCE($4,email), phone=$5,
           national_id=$6, passport_number=$7, nationality=$8, date_of_birth=$9, gender=$10,
           job_title=$11, department_id=$12, work_location_id=$13,
           manager_id=$14, employment_type=$15, hire_date=$16, status=COALESCE($17,status),
           user_id=$18, updated_at=NOW()
         WHERE id=$19 AND company_id=$20`,
        [i['employee_number'] ?? null, i['first_name'] ?? null, i['last_name'] ?? null,
         i['email'] ?? null, i['phone'] ?? null, i['national_id'] ?? null,
         i['passport_number'] ?? null, i['nationality'] ?? null,
         i['date_of_birth'] ?? null, i['gender'] ?? null,
         i['job_title'] ?? null, i['department_id'] ?? null, i['work_location_id'] ?? null,
         i['manager_id'] ?? null, i['employment_type'] ?? null,
         i['hire_date'] ?? null, i['status'] ?? null, i['user_id'] ?? null,
         args.id, ctx.auth.companyId],
      )
      const emp = await query(
        `SELECT e.*, d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1`,
        [args.id],
      )
      return emp.rows[0] ?? null
    },

    linkEmployeeUser: async (
      _: unknown,
      args: { employee_id: string; user_id?: string | null },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE employees SET user_id=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3`,
        [args.user_id ?? null, args.employee_id, ctx.auth.companyId],
      )
      const r = await query(
        `SELECT e.*, d.name AS department_name FROM employees e
         LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1`,
        [args.employee_id],
      )
      return r.rows[0] ?? null
    },

    terminateEmployee: async (
      _: unknown,
      args: { id: string; terminationDate: string; reason: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE employees SET status='terminated', termination_date=$1, updated_at=NOW()
         WHERE id=$2 AND company_id=$3`,
        [args.terminationDate, args.id, ctx.auth.companyId],
      )
      const emp = await query(
        `SELECT e.*, d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1`,
        [args.id],
      )
      return emp.rows[0] ?? null
    },

    createDepartment: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO departments (company_id, name, parent_id, manager_id, is_active)
         VALUES ($1,$2,$3,$4,COALESCE($5,true)) RETURNING *`,
        [ctx.auth.companyId, i['name'], i['parent_id'] ?? null, i['manager_id'] ?? null, i['is_active'] ?? null],
      )
      return r.rows[0]
    },

    updateDepartment: async (
      _: unknown,
      args: { id: string; input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      await query(
        `UPDATE departments SET name=COALESCE($1,name), parent_id=$2, manager_id=$3,
           is_active=COALESCE($4,is_active), updated_at=NOW()
         WHERE id=$5 AND company_id=$6`,
        [i['name'] ?? null, i['parent_id'] ?? null, i['manager_id'] ?? null,
         i['is_active'] ?? null, args.id, ctx.auth.companyId],
      )
      const r = await query(`SELECT * FROM departments WHERE id=$1`, [args.id])
      return r.rows[0] ?? null
    },

    createWorkLocation: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO work_locations (company_id, name, address, latitude, longitude, geofence_radius_m, is_active)
         VALUES ($1,$2,$3,ROUND($4::numeric,7),ROUND($5::numeric,7),COALESCE($6,200),COALESCE($7,true))
         RETURNING id, name, address, latitude::text, longitude::text, geofence_radius_m, is_active`,
        [ctx.auth.companyId, i['name'], i['address'] ?? null,
         i['latitude'] ?? null, i['longitude'] ?? null,
         i['geofence_radius_m'] ?? null, i['is_active'] ?? null],
      )
      return r.rows[0]
    },

    updateWorkLocation: async (
      _: unknown,
      args: { id: string; input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      await query(
        `UPDATE work_locations SET name=COALESCE($1,name), address=$2,
           latitude=ROUND($3::numeric,7), longitude=ROUND($4::numeric,7),
           geofence_radius_m=COALESCE($5,geofence_radius_m), is_active=COALESCE($6,is_active), updated_at=NOW()
         WHERE id=$7 AND company_id=$8`,
        [i['name'] ?? null, i['address'] ?? null,
         i['latitude'] ?? null, i['longitude'] ?? null,
         i['geofence_radius_m'] ?? null, i['is_active'] ?? null,
         args.id, ctx.auth.companyId],
      )
      const r = await query(
        `SELECT id, name, address, latitude::text, longitude::text, geofence_radius_m, is_active FROM work_locations WHERE id=$1`,
        [args.id],
      )
      return r.rows[0] ?? null
    },

    assignShift: async (
      _: unknown,
      args: { employee_id: string; shift_id: string; effective_from: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      // Close any currently open assignment
      await query(
        `UPDATE employee_shifts SET effective_to = $1::date - INTERVAL '1 day'
         WHERE employee_id = $2 AND effective_to IS NULL`,
        [args.effective_from, args.employee_id],
      )
      const r = await query(
        `INSERT INTO employee_shifts (employee_id, shift_id, effective_from)
         VALUES ($1, $2, $3::date)
         RETURNING id, employee_id, shift_id, effective_from::text, effective_to::text`,
        [args.employee_id, args.shift_id, args.effective_from],
      )
      const row = r.rows[0] as Record<string, unknown>
      // Fetch shift details to return full EmployeeShift
      const sc = await query(
        `SELECT name AS shift_name, start_time::text, end_time::text, break_minutes, overtime_threshold_hours::text
         FROM shift_configs WHERE id = $1`,
        [args.shift_id],
      )
      return { ...row, ...(sc.rows[0] ?? {}) }
    },

    unassignShift: async (
      _: unknown,
      args: { employee_id: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE employee_shifts SET effective_to = CURRENT_DATE
         WHERE employee_id = $1 AND effective_to IS NULL`,
        [args.employee_id],
      )
      return true
    },

    createShiftConfig: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO shift_configs (company_id, name, start_time, end_time, break_minutes, overtime_threshold_hours)
         VALUES ($1,$2,$3,$4,COALESCE($5,60),COALESCE($6::numeric,8.0))
         RETURNING id, name, start_time::text, end_time::text, break_minutes, overtime_threshold_hours::text, is_active`,
        [ctx.auth.companyId, i['name'], i['start_time'] ?? null, i['end_time'] ?? null,
         i['break_minutes'] ?? null, i['overtime_threshold_hours'] ?? null],
      )
      return r.rows[0]
    },

    updateShiftConfig: async (
      _: unknown,
      args: { id: string; input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      await query(
        `UPDATE shift_configs SET name=COALESCE($1,name), start_time=COALESCE($2,start_time),
           end_time=COALESCE($3,end_time), break_minutes=COALESCE($4,break_minutes),
           overtime_threshold_hours=COALESCE($5::numeric,overtime_threshold_hours), updated_at=NOW()
         WHERE id=$6 AND company_id=$7`,
        [i['name'] ?? null, i['start_time'] ?? null, i['end_time'] ?? null,
         i['break_minutes'] ?? null, i['overtime_threshold_hours'] ?? null,
         args.id, ctx.auth.companyId],
      )
      const r = await query(
        `SELECT id, name, start_time::text, end_time::text, break_minutes, overtime_threshold_hours::text, is_active FROM shift_configs WHERE id=$1`,
        [args.id],
      )
      return r.rows[0] ?? null
    },

    createLeaveType: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO leave_types (company_id, name, is_paid, max_days_per_year, requires_approval)
         VALUES ($1,$2,COALESCE($3,true),$4,COALESCE($5,true)) RETURNING *`,
        [ctx.auth.companyId, i['name'], i['is_paid'] ?? null,
         i['max_days_per_year'] ?? null, i['requires_approval'] ?? null],
      )
      return r.rows[0]
    },

    deleteLeaveType: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const check = await query(
        `SELECT COUNT(*) AS cnt FROM leave_requests WHERE leave_type_id=$1 AND company_id=$2`,
        [args.id, ctx.auth.companyId],
      )
      if (parseInt(check.rows[0].cnt) > 0) {
        throw new Error('Cannot delete a leave type that has existing leave requests. Deactivate it instead.')
      }
      await query(
        `DELETE FROM leave_types WHERE id=$1 AND company_id=$2`,
        [args.id, ctx.auth.companyId],
      )
      return true
    },

    createLeaveRequest: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      let employeeId: string | null = null
      if (args.input['employee_id']) {
        employeeId = String(args.input['employee_id'])
      } else {
        const empRow = await query(
          `SELECT id FROM employees WHERE user_id=$1 AND company_id=$2 LIMIT 1`,
          [ctx.auth.userId, ctx.auth.companyId],
        )
        employeeId = (empRow.rows[0]?.id as string | undefined) ?? null
      }
      if (!employeeId) throw new Error('No employee record linked to your account')
      const i = args.input
      const startDate = new Date(String(i['start_date']))
      const endDate = new Date(String(i['end_date']))
      const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
      const r = await query(
        `INSERT INTO leave_requests (employee_id, company_id, leave_type_id, start_date, end_date, total_days, reason, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,
        [employeeId, ctx.auth.companyId, i['leave_type_id'], i['start_date'], i['end_date'], totalDays, i['reason'] ?? null, ctx.auth.userId],
      )
      const row = r.rows[0] as Record<string, unknown>
      const lt = await query(`SELECT name FROM leave_types WHERE id=$1`, [row['leave_type_id']])
      const emp = await query(`SELECT first_name||' '||last_name AS name FROM employees WHERE id=$1`, [employeeId])
      return { ...row, leave_type_name: lt.rows[0]?.name ?? null, employee_name: emp.rows[0]?.name ?? null }
    },

    approveLeaveRequest: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE leave_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW() WHERE id=$2`,
        [ctx.auth.userId, args.id],
      )
      const r = await query(
        `SELECT lr.*, e.first_name||' '||e.last_name AS employee_name, lt.name AS leave_type_name
         FROM leave_requests lr JOIN employees e ON e.id=lr.employee_id JOIN leave_types lt ON lt.id=lr.leave_type_id
         WHERE lr.id=$1`,
        [args.id],
      )
      return r.rows[0] ?? null
    },

    rejectLeaveRequest: async (
      _: unknown,
      args: { id: string; reviewNotes?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE leave_requests SET status='rejected', reviewed_by=$1, reviewed_at=NOW() WHERE id=$2`,
        [ctx.auth.userId, args.id],
      )
      const r = await query(
        `SELECT lr.*, e.first_name||' '||e.last_name AS employee_name, lt.name AS leave_type_name
         FROM leave_requests lr JOIN employees e ON e.id=lr.employee_id JOIN leave_types lt ON lt.id=lr.leave_type_id
         WHERE lr.id=$1`,
        [args.id],
      )
      return r.rows[0] ?? null
    },

    cancelLeaveRequest: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE leave_requests SET status='cancelled' WHERE id=$1 AND status='pending'`,
        [args.id],
      )
      const r = await query(
        `SELECT lr.*, e.first_name||' '||e.last_name AS employee_name, lt.name AS leave_type_name
         FROM leave_requests lr JOIN employees e ON e.id=lr.employee_id JOIN leave_types lt ON lt.id=lr.leave_type_id
         WHERE lr.id=$1`,
        [args.id],
      )
      return r.rows[0] ?? null
    },

    updateSalaryConfig: async (
      _: unknown,
      args: { employee_id: string; input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const existing = await query(
        `SELECT id FROM salary_configs WHERE employee_id=$1 ORDER BY effective_from DESC LIMIT 1`,
        [args.employee_id],
      )
      let id: string
      if (existing.rows[0]) {
        id = existing.rows[0].id as string
        await query(
          `UPDATE salary_configs SET base_salary=$1, currency_code=COALESCE($2,currency_code),
             housing_allowance=$3, transport_allowance=$4, other_allowances=$5,
             income_tax_pct=$6, social_security_pct=$7, effective_from=COALESCE($8,effective_from),
             updated_at=NOW()
           WHERE id=$9`,
          [i['base_salary'], i['currency_code'] ?? null, i['housing_allowance'] ?? 0,
           i['transport_allowance'] ?? 0, i['other_allowances'] ?? 0,
           i['income_tax_pct'] ?? 0, i['social_security_pct'] ?? 0,
           i['effective_from'] ?? null, id],
        )
      } else {
        const r = await query(
          `INSERT INTO salary_configs (employee_id, company_id, base_salary, currency_code, housing_allowance,
             transport_allowance, other_allowances, income_tax_pct, social_security_pct, effective_from)
           VALUES ($1,$2,$3,COALESCE($4,'IQD'),$5,$6,$7,$8,$9,COALESCE($10,CURRENT_DATE)) RETURNING id`,
          [args.employee_id, ctx.auth.companyId, i['base_salary'], i['currency_code'] ?? null,
           i['housing_allowance'] ?? 0, i['transport_allowance'] ?? 0,
           i['other_allowances'] ?? 0, i['income_tax_pct'] ?? 0,
           i['social_security_pct'] ?? 0, i['effective_from'] ?? null],
        )
        id = r.rows[0].id as string
      }
      const r = await query(`SELECT * FROM salary_configs WHERE id=$1`, [id])
      return r.rows[0] ?? null
    },

    createPayrollRun: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `INSERT INTO payroll_runs (company_id, period_name, start_date, end_date, status, total_gross, total_net, total_deductions, created_by)
         VALUES ($1,$2,$3,$4,'draft',0,0,0,$5) RETURNING *`,
        [ctx.auth.companyId, i['period_name'], i['start_date'], i['end_date'], ctx.auth.userId],
      )
      return r.rows[0]
    },

    processPayrollRun: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')

      // Lock the run into processing
      const lockResult = await query(
        `UPDATE payroll_runs SET status='processing', processed_by=$3, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
        [args.id, ctx.auth.companyId, ctx.auth.userId],
      )
      if (!lockResult.rows[0]) throw new Error('Payroll run not found or not in draft status')
      const run = lockResult.rows[0] as Record<string, unknown>

      // Get all active employees with a current salary config
      const empResult = await query(
        `SELECT e.id AS employee_id, sc.base_salary, sc.housing_allowance, sc.transport_allowance,
                sc.other_allowances, sc.income_tax_pct, sc.social_security_pct, sc.currency_code
         FROM employees e
         JOIN salary_configs sc ON sc.employee_id = e.id AND sc.effective_to IS NULL
         WHERE e.company_id = $1 AND e.status = 'active'`,
        [ctx.auth.companyId],
      )

      // Overtime hours per employee for the period
      const otResult = await query(
        `SELECT employee_id, COALESCE(SUM(overtime_hours),0) AS total_ot_hours
         FROM overtime_logs
         WHERE company_id=$1 AND work_date BETWEEN $2 AND $3
         GROUP BY employee_id`,
        [ctx.auth.companyId, run['start_date'], run['end_date']],
      )
      const otMap = new Map<string, number>()
      for (const row of otResult.rows as Array<{ employee_id: string; total_ot_hours: string }>) {
        otMap.set(row.employee_id, parseFloat(row.total_ot_hours))
      }

      // Leave days per employee for the period (approved only)
      const leaveResult = await query(
        `SELECT employee_id, COALESCE(SUM(total_days),0) AS leave_days
         FROM leave_requests
         WHERE company_id=$1 AND status='approved'
           AND start_date <= $3 AND end_date >= $2
         GROUP BY employee_id`,
        [ctx.auth.companyId, run['start_date'], run['end_date']],
      )
      const leaveMap = new Map<string, number>()
      for (const row of leaveResult.rows as Array<{ employee_id: string; leave_days: string }>) {
        leaveMap.set(row.employee_id, parseFloat(row.leave_days))
      }

      // Calculate working days in the period (Mon-Fri)
      const startD = new Date(run['start_date'] as string)
      const endD = new Date(run['end_date'] as string)
      let workingDaysInPeriod = 0
      for (const d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) workingDaysInPeriod++
      }
      if (workingDaysInPeriod < 1) workingDaysInPeriod = 1

      // Generate payslips
      let totalGross = 0; let totalNet = 0; let totalDeductions = 0
      for (const emp of empResult.rows as Array<Record<string, string>>) {
        const base = parseFloat(emp['base_salary'] ?? '0')
        const housing = parseFloat(emp['housing_allowance'] ?? '0')
        const transport = parseFloat(emp['transport_allowance'] ?? '0')
        const other = parseFloat(emp['other_allowances'] ?? '0')
        const taxPct = parseFloat(emp['income_tax_pct'] ?? '0')
        const ssPct = parseFloat(emp['social_security_pct'] ?? '0')
        const currency = emp['currency_code'] ?? 'IQD'

        const otHours = otMap.get(emp['employee_id'] ?? '') ?? 0
        const leaveDays = leaveMap.get(emp['employee_id'] ?? '') ?? 0
        const absentDays = 0

        // Daily rate for overtime calculation
        const dailyRate = base / workingDaysInPeriod
        const hourlyRate = dailyRate / 8
        const otPay = hourlyRate * otHours * 1.5

        const gross = base + housing + transport + other + otPay
        const incomeTax = gross * taxPct / 100
        const socialSec = gross * ssPct / 100
        const deductions = incomeTax + socialSec
        const net = gross - deductions

        await query(
          `INSERT INTO payslips
             (payroll_run_id, employee_id, company_id, base_salary, housing_allowance, transport_allowance,
              other_allowances, overtime_hours, overtime_pay, gross_salary, income_tax, social_security,
              other_deductions, net_salary, currency_code, working_days, absent_days, leave_days)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (payroll_run_id, employee_id) DO UPDATE
             SET gross_salary=EXCLUDED.gross_salary, net_salary=EXCLUDED.net_salary,
                 income_tax=EXCLUDED.income_tax, social_security=EXCLUDED.social_security,
                 overtime_hours=EXCLUDED.overtime_hours, overtime_pay=EXCLUDED.overtime_pay,
                 updated_at=NOW()`,
          [
            args.id, emp['employee_id'], ctx.auth.companyId,
            base, housing, transport, other,
            otHours, otPay, gross, incomeTax, socialSec, 0, net, currency,
            workingDaysInPeriod, absentDays, leaveDays,
          ],
        )

        totalGross += gross; totalNet += net; totalDeductions += deductions
      }

      // Transition to review with totals
      await query(
        `UPDATE payroll_runs SET status='review', total_gross=$2, total_net=$3, total_deductions=$4, updated_at=NOW()
         WHERE id=$1`,
        [args.id, totalGross.toFixed(4), totalNet.toFixed(4), totalDeductions.toFixed(4)],
      )

      const r = await query(`SELECT * FROM payroll_runs WHERE id=$1`, [args.id])
      return r.rows[0] ?? null
    },

    approvePayrollRun: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE payroll_runs SET status='approved', approved_by=$3, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='review'`,
        [args.id, ctx.auth.companyId, ctx.auth.userId],
      )
      const r = await query(`SELECT * FROM payroll_runs WHERE id=$1`, [args.id])
      return r.rows[0] ?? null
    },

    postPayrollRun: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE payroll_runs SET status='posted', posted_by=$3, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='approved'`,
        [args.id, ctx.auth.companyId, ctx.auth.userId],
      )
      const r = await query(`SELECT * FROM payroll_runs WHERE id=$1`, [args.id])
      return r.rows[0] ?? null
    },

    cancelPayrollRun: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      await query(
        `UPDATE payroll_runs SET status='cancelled', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status IN ('draft','processing')`,
        [args.id, ctx.auth.companyId],
      )
      const r = await query(`SELECT * FROM payroll_runs WHERE id=$1`, [args.id])
      return r.rows[0] ?? null
    },

    approveOvertimeRequest: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(
        `SELECT ol.*, e.first_name||' '||e.last_name AS employee_name FROM overtime_logs ol JOIN employees e ON e.id=ol.employee_id WHERE ol.id=$1`,
        [args.id],
      )
      const row = r.rows[0] as Record<string, unknown> | undefined
      if (!row) throw new Error('Overtime log not found')
      return { ...row, status: 'approved', review_notes: null, reviewed_by_email: null, overtime_multiplier: 1.5 }
    },

    rejectOvertimeRequest: async (
      _: unknown,
      args: { id: string; reviewNotes?: string },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(
        `SELECT ol.*, e.first_name||' '||e.last_name AS employee_name FROM overtime_logs ol JOIN employees e ON e.id=ol.employee_id WHERE ol.id=$1`,
        [args.id],
      )
      const row = r.rows[0] as Record<string, unknown> | undefined
      if (!row) throw new Error('Overtime log not found')
      return { ...row, status: 'rejected', review_notes: args.reviewNotes ?? null, reviewed_by_email: null, overtime_multiplier: 1.5 }
    },

    bulkApproveOvertime: async (_: unknown, args: { ids: string[] }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const r = await query(
        `SELECT ol.*, e.first_name||' '||e.last_name AS employee_name FROM overtime_logs ol JOIN employees e ON e.id=ol.employee_id WHERE ol.id=ANY($1::uuid[])`,
        [args.ids],
      )
      return r.rows.map((row: Record<string, unknown>) => ({
        ...row, status: 'approved', review_notes: null, reviewed_by_email: null, overtime_multiplier: 1.5,
      }))
    },

    revealBankDetails: async (_: unknown, args: { employee_id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const result = await query(
        `SELECT bank_account_encrypted FROM employees WHERE id=$1 AND company_id=$2`,
        [args.employee_id, ctx.auth.companyId],
      )
      const row = result.rows[0] as Record<string, unknown> | undefined
      if (!row) throw new Error('Employee not found')
      try {
        const raw = row['bank_account_encrypted'] as string | null
        if (!raw) return { bank_name: null, account_number: null, iban: null, currency_code: null }
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        return {
          bank_name: parsed.bank_name ?? null,
          account_number: parsed.account_number ?? null,
          iban: parsed.iban ?? null,
          currency_code: parsed.currency_code ?? null,
        }
      } catch {
        return { bank_name: null, account_number: null, iban: null, currency_code: null }
      }
    },

    updateBankDetails: async (
      _: unknown,
      args: { employee_id: string; input: Record<string, unknown> },
      ctx: GQLContext,
    ) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const payload = JSON.stringify({
        bank_name: args.input['bank_name'] ?? null,
        account_number: args.input['account_number'] ?? null,
        iban: args.input['iban'] ?? null,
        currency_code: args.input['currency_code'] ?? null,
      })
      const result = await query(
        `UPDATE employees SET bank_account_encrypted=$1, updated_at=NOW()
         WHERE id=$2 AND company_id=$3 RETURNING *`,
        [payload, args.employee_id, ctx.auth.companyId],
      )
      return result.rows[0] ?? null
    },

    // ── Phase 4: Equipment Rental ─────────────────────────────

    createEquipmentAsset: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const num = i['asset_number'] ?? `EQ-${Date.now()}`
      const r = await query(
        `INSERT INTO equipment_assets (company_id,asset_number,name,description,category,serial_number,
           purchase_date,purchase_price,daily_rate,currency_code,maintenance_due_hours,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [ctx.auth.companyId, num, i['name'], i['description'] ?? null, i['category'] ?? null,
         i['serial_number'] ?? null, i['purchase_date'] ?? null, i['purchase_price'] ?? null,
         i['daily_rate'] ?? 0, i['currency_code'] ?? 'IQD', i['maintenance_due_hours'] ?? null, i['status'] ?? 'available'],
      )
      return r.rows[0]
    },

    updateEquipmentAsset: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `UPDATE equipment_assets SET name=COALESCE($3,name), description=COALESCE($4,description),
           category=COALESCE($5,category), daily_rate=COALESCE($6,daily_rate), status=COALESCE($7,status),
           maintenance_due_hours=COALESCE($8,maintenance_due_hours), updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [args.id, ctx.auth.companyId, i['name'] ?? null, i['description'] ?? null, i['category'] ?? null,
         i['daily_rate'] ?? null, i['status'] ?? null, i['maintenance_due_hours'] ?? null],
      )
      if (!r.rows[0]) throw new Error('Asset not found')
      return r.rows[0]
    },

    logUsage: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const log = await client.query(
          `INSERT INTO equipment_usage_logs (company_id,asset_id,log_date,hours_operated,odometer_km,operator_name,notes,recorded_by,recorded_via)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'web') RETURNING *`,
          [ctx.auth!.companyId, i['asset_id'], i['usage_date'], i['hours_used'], i['mileage_km'] ?? null, i['operator_name'] ?? null, i['notes'] ?? null, ctx.auth!.userId],
        )
        await client.query(
          `UPDATE equipment_assets SET total_hours=COALESCE(total_hours,0)+$2, total_mileage=COALESCE(total_mileage,0)+$3 WHERE id=$1`,
          [i['asset_id'], i['hours_used'], i['mileage_km'] ?? 0],
        )
        const row = log.rows[0] as Record<string, unknown>
        return {
          id: row['id'],
          asset_id: row['asset_id'],
          usage_date: row['log_date'],
          hours_used: parseFloat(String(row['hours_operated'] ?? 0)),
          mileage_km: row['odometer_km'] !== null && row['odometer_km'] !== undefined ? parseFloat(String(row['odometer_km'])) : null,
          operator_name: row['operator_name'] ?? '',
          notes: row['notes'] ?? null,
          created_at: row['created_at'],
        }
      })
    },

    scheduleMaintenanceItem: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const scheduleName = String(i['description'] ?? i['maintenance_type'] ?? 'Scheduled Maintenance')
      const r = await query(
        `INSERT INTO maintenance_schedules (company_id,asset_id,name,maintenance_type,scheduled_date,description,status,estimated_cost,assigned_to)
         VALUES ($1,$2,$3,$4,$5,$6,'scheduled',$7,$8) RETURNING *`,
        [ctx.auth.companyId, i['asset_id'], scheduleName, i['maintenance_type'], i['scheduled_date'], i['description'] ?? null, i['estimated_cost'] ?? null, i['assigned_to'] ?? null],
      )
      return r.rows[0]
    },

    recordMaintenance: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const rec = await client.query(
          `INSERT INTO maintenance_records (company_id,asset_id,maintenance_type,performed_date,description,cost,performed_by,next_due_date,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [ctx.auth!.companyId, i['asset_id'], i['maintenance_type'], i['performed_date'], i['description'], i['cost'] ?? 0, i['performed_by'], i['next_due_date'] ?? null, i['notes'] ?? null],
        )
        await client.query(
          `UPDATE equipment_assets SET last_maintenance_date=$2, maintenance_status='ok', updated_at=NOW() WHERE id=$1`,
          [i['asset_id'], i['performed_date']],
        )
        return rec.rows[0]
      })
    },

    submitConditionReport: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const rep = await client.query(
          `INSERT INTO condition_reports (company_id,asset_id,report_date,rating,checklist,notes,gps_lat,gps_lng,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [ctx.auth!.companyId, i['asset_id'], i['report_date'], i['rating'], i['checklist'] ?? null, i['notes'] ?? null, i['gps_lat'] ?? null, i['gps_lng'] ?? null, ctx.auth!.userId],
        )
        await client.query(`UPDATE equipment_assets SET condition_rating=$2 WHERE id=$1`, [i['asset_id'], i['rating']])
        return rep.rows[0]
      })
    },

    createRentalContract: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const num = `RC-${Date.now()}`
      const r = await query(
        `INSERT INTO rental_contracts (company_id,contract_number,asset_id,project_id,client_name,client_contact,
           rental_type,billing_cycle,rate_amount,currency_code,start_date,end_date,deposit_amount,notes,
           depreciation_method,depreciation_per_day,useful_life_days,salvage_value,status,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'draft',$19) RETURNING *`,
        [ctx.auth.companyId, num, i['asset_id'], i['project_id'] ?? null, i['client_name'], i['client_contact'] ?? null,
         i['rental_type'], i['billing_cycle'], i['rate_amount'], i['currency_code'] ?? 'IQD',
         i['start_date'], i['end_date'] ?? null, i['deposit_amount'] ?? null, i['notes'] ?? null,
         i['depreciation_method'] ?? 'straight_line', i['depreciation_per_day'] ?? null,
         i['useful_life_days'] ?? null, i['salvage_value'] ?? null, ctx.auth.userId],
      )
      return r.rows[0]
    },

    updateRentalContract: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const i = args.input
      const r = await query(
        `UPDATE rental_contracts SET
           client_name=COALESCE($3,client_name), rate_amount=COALESCE($4,rate_amount),
           end_date=COALESCE($5,end_date), notes=COALESCE($6,notes),
           depreciation_method=COALESCE($7,depreciation_method),
           depreciation_per_day=COALESCE($8,depreciation_per_day),
           useful_life_days=COALESCE($9,useful_life_days),
           salvage_value=COALESCE($10,salvage_value),
           updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [args.id, ctx.auth.companyId, i['client_name'] ?? null, i['rate_amount'] ?? null,
         i['end_date'] ?? null, i['notes'] ?? null,
         i['depreciation_method'] ?? null, i['depreciation_per_day'] ?? null,
         i['useful_life_days'] ?? null, i['salvage_value'] ?? null],
      )
      if (!r.rows[0]) throw new Error('Contract not found')
      return r.rows[0]
    },

    activateRentalContract: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const r = await client.query(`UPDATE rental_contracts SET status='active', updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`, [args.id, ctx.auth!.companyId])
        if (!r.rows[0]) throw new Error('Contract not found')
        await client.query(`UPDATE equipment_assets SET status='rented' WHERE id=$1`, [r.rows[0].asset_id])
        return r.rows[0]
      })
    },

    closeRentalContract: async (_: unknown, args: { id: string; notes?: string }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      return withTransaction({ companyId: ctx.auth!.companyId, userId: ctx.auth!.userId, role: ctx.auth!.role }, async (client) => {
        const r = await client.query(`UPDATE rental_contracts SET status='closed', close_notes=$3, closed_at=NOW(), updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`, [args.id, ctx.auth!.companyId, args.notes ?? null])
        if (!r.rows[0]) throw new Error('Contract not found')
        await client.query(`UPDATE equipment_assets SET status='available' WHERE id=$1`, [r.rows[0].asset_id])
        return r.rows[0]
      })
    },

    generateRentalInvoice: async (_: unknown, args: { contractId: string; periodStart: string; periodEnd: string; whtApplies?: boolean; whtScenario?: string; whtRate?: number }, ctx: GQLContext) => {
      if (!ctx.auth) throw new Error('Unauthorized')
      const rc = await query(`SELECT * FROM rental_contracts WHERE id=$1 AND company_id=$2`, [args.contractId, ctx.auth.companyId])
      if (!rc.rows[0]) throw new Error('Contract not found')
      const contract = rc.rows[0]
      const start = new Date(args.periodStart)
      const end = new Date(args.periodEnd)
      const daysBilled = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const totalAmount = daysBilled * parseFloat(contract.rate_amount)
      const whtApplies  = Boolean(args.whtApplies ?? false)
      const whtScenario = whtApplies ? (args.whtScenario ?? null) : null
      const whtRate     = whtApplies ? Number(args.whtRate ?? 0) : 0
      const whtAmount   = whtApplies ? Math.round(totalAmount * whtRate * 10000) / 10000 : 0
      const num = `RI-${Date.now()}`
      const due = new Date(end)
      due.setDate(due.getDate() + 30)
      const r = await query(
        `INSERT INTO rental_invoices (company_id,contract_id,invoice_number,billing_period_start,billing_period_end,
           days_billed,rate_amount,total_amount,amount,wht_applies,wht_scenario,wht_rate,wht_amount,status,invoice_date,due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,'draft',NOW(),$13) RETURNING *`,
        [ctx.auth.companyId, args.contractId, num, args.periodStart, args.periodEnd, daysBilled, contract.rate_amount, totalAmount, whtApplies, whtScenario, whtRate, whtAmount, due.toISOString().slice(0, 10)],
      )
      const row = r.rows[0] as Record<string, unknown>

      // If this contract is linked to a project, record the cost in project_cost_actuals
      // so it appears in the project's cost summary and profitability reports.
      if (contract.project_id) {
        await query(
          `INSERT INTO project_cost_actuals
             (project_id, source_type, source_id, cost_category, amount, currency_code, entry_date)
           VALUES ($1, 'rental', $2, 'equipment_rental', $3, $4, $5)
           ON CONFLICT (source_id) WHERE source_type = 'rental' AND source_id IS NOT NULL DO NOTHING`,
          [contract.project_id, row['id'], totalAmount, contract.currency_code ?? 'IQD', args.periodStart],
        )
      }

      return {
        ...row,
        whtApplies: Boolean(row['wht_applies']),
        whtScenario: row['wht_scenario'] ?? null,
        whtRate: parseFloat(String(row['wht_rate'] ?? 0)),
        whtAmount: parseFloat(String(row['wht_amount'] ?? 0)),
      }
    },
  },
}

// ─── Phase 5 resolver extensions ─────────────────────────────────────────────

function companyRowToDetail(row: Record<string, unknown>) {
  const cfg = row.fiscal_year_start_month != null ? {
    companyId: row.id,
    fiscalYearStartMonth: row.fiscal_year_start_month ?? 1,
    fiscalYearStartDay: row.fiscal_year_start_day ?? 1,
    defaultCurrency: row.default_currency ?? 'IQD',
    defaultPaymentTermsDays: row.default_payment_terms_days ?? 30,
    defaultPOCurrency: row.default_po_currency ?? 'IQD',
    incomeTaxEnabled: row.income_tax_enabled ?? true,
    socialSecurityRate: parseFloat(String(row.social_security_rate ?? 0.05)),
    employerSocialSecurityRate: parseFloat(String(row.employer_social_security_rate ?? 0.12)),
    defaultWHTRate: parseFloat(String(row.default_wht_rate ?? 0.03)),
    companyEmailFrom: row.company_email_from,
    companyEmailSignature: row.company_email_signature,
    setupCompleted: row.config_setup_completed ?? false,
  } : null
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    countryCode: row.country_code,
    city: row.city,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    registrationNumber: row.registration_number,
    vatNumber: row.vat_number,
    currencyCode: row.currency_code ?? 'IQD',
    bankName: row.bank_name,
    bankAccount: row.bank_account,
    bankIban: row.bank_iban,
    bankSwift: row.bank_swift,
    intercoTransferPricingMethod: row.interco_transfer_pricing_method,
    isActive: row.is_active ?? true,
    setupCompleted: row.setup_completed ?? false,
    stampImage: row.stamp_image ?? null,
    letterheadImage: row.letterhead_image ?? null,
    pvTemplateImage: row.pv_template_image ?? null,
    journalTemplateImage: row.journal_template_image ?? null,
    userCount: parseInt(String(row.user_count ?? 0)),
    createdAt: row.created_at,
    configuration: cfg,
  }
}

const phase5QueryResolvers = {
  executiveDashboard: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = ctx.auth.companyId
    const [revenueRes, costsRes, projectsRes, headcountRes, poRes, trendRes, entityRes, entityTrendRes, scatterRes, entityHcRes] = await Promise.all([
      // Revenue: credit-side of income accounts this month for current company
      query(
        `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS total
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE je.company_id=$1 AND je.status='posted'
           AND coa.account_type IN ('revenue','income')
           AND je.entry_date >= date_trunc('month', CURRENT_DATE)`,
        [cid],
      ),
      // Costs: debit-side of expense accounts this month
      query(
        `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS total
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE je.company_id=$1 AND je.status='posted'
           AND coa.account_type IN ('expense','cost')
           AND je.entry_date >= date_trunc('month', CURRENT_DATE)`,
        [cid],
      ),
      query(`SELECT COUNT(*) AS cnt, COALESCE(SUM(budget_amount),0) AS budget FROM projects WHERE company_id=$1 AND status='active'`, [cid]),
      query(`SELECT COUNT(*) AS cnt FROM employees WHERE company_id=$1 AND status='active'`, [cid]),
      query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM purchase_orders WHERE company_id=$1 AND status IN ('draft','submitted','approved')`, [cid]),
      // 6-month revenue + cost trend
      query(
        `SELECT TO_CHAR(m.month,'YYYY-MM') AS period,
                COALESCE(SUM(CASE WHEN coa.account_type IN ('revenue','income') THEN jl.credit - jl.debit ELSE 0 END),0) AS revenue,
                COALESCE(SUM(CASE WHEN coa.account_type IN ('expense','cost')   THEN jl.debit - jl.credit ELSE 0 END),0) AS costs
         FROM generate_series(date_trunc('month', CURRENT_DATE - INTERVAL '5 months'), date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m(month)
         LEFT JOIN journal_entries je ON je.company_id=$1 AND je.status='posted'
           AND date_trunc('month', je.entry_date) = m.month
         LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
         LEFT JOIN chart_of_accounts coa ON coa.id = jl.account_id
           AND coa.account_type IN ('revenue','income','expense','cost')
         GROUP BY m.month ORDER BY m.month`,
        [cid],
      ),
      // Entity breakdown: all companies, revenue + costs this month
      query(
        `SELECT c.id AS company_id, c.name AS company_name,
                COALESCE(SUM(CASE WHEN coa.account_type IN ('revenue','income') THEN jl.credit - jl.debit ELSE 0 END),0) AS revenue,
                COALESCE(SUM(CASE WHEN coa.account_type IN ('expense','cost') THEN jl.debit - jl.credit ELSE 0 END),0) AS costs
         FROM companies c
         LEFT JOIN journal_entries je ON je.company_id=c.id AND je.status='posted'
           AND je.entry_date >= date_trunc('month', CURRENT_DATE)
         LEFT JOIN journal_lines jl ON jl.journal_entry_id=je.id
         LEFT JOIN chart_of_accounts coa ON coa.id=jl.account_id
           AND coa.account_type IN ('revenue','income','expense','cost')
         GROUP BY c.id, c.name ORDER BY c.name`,
        [],
      ),
      // Revenue by entity, 6-month trend
      query(
        `SELECT c.name AS company_name, TO_CHAR(m.month,'YYYY-MM') AS period,
                COALESCE(SUM(CASE WHEN coa.account_type IN ('revenue','income') THEN jl.credit - jl.debit ELSE 0 END),0) AS revenue
         FROM companies c
         CROSS JOIN generate_series(date_trunc('month', CURRENT_DATE - INTERVAL '5 months'), date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m(month)
         LEFT JOIN journal_entries je ON je.company_id=c.id AND je.status='posted'
           AND date_trunc('month', je.entry_date)=m.month
         LEFT JOIN journal_lines jl ON jl.journal_entry_id=je.id
         LEFT JOIN chart_of_accounts coa ON coa.id=jl.account_id
           AND coa.account_type IN ('revenue','income')
         GROUP BY c.name, m.month ORDER BY m.month, c.name`,
        [],
      ),
      // Project profitability scatter: active + completed projects, actual cost from cost_actuals
      query(
        `SELECT p.id, p.name, COALESCE(p.budget_amount,0) AS budget,
                COALESCE(SUM(pca.amount),0) AS actual_cost, p.status,
                COALESCE(p.client_name,'') AS client_name,
                CASE WHEN COALESCE(p.budget_amount,0)>0
                     THEN ((COALESCE(p.budget_amount,0) - COALESCE(SUM(pca.amount),0)) / p.budget_amount) * 100
                     ELSE 0 END AS margin_pct
         FROM projects p
         LEFT JOIN project_cost_actuals pca ON pca.project_id=p.id
         WHERE p.status IN ('active','completed')
         GROUP BY p.id, p.name, p.budget_amount, p.status, p.client_name
         ORDER BY p.budget_amount DESC NULLS LAST LIMIT 60`,
        [],
      ),
      // Headcount per company
      query(`SELECT company_id, COUNT(*) AS cnt FROM employees WHERE status='active' GROUP BY company_id`, []),
    ])
    const totalRevenue = parseFloat(String((revenueRes.rows[0] as Record<string, unknown>)['total'] ?? '0'))
    const totalCosts   = parseFloat(String((costsRes.rows[0]   as Record<string, unknown>)['total'] ?? '0'))
    const trend = trendRes.rows as Array<{ period: string; revenue: string; costs: string }>

    // Entity breakdown
    const hcMap: Record<string, number> = {}
    for (const r of entityHcRes.rows as Array<Record<string, unknown>>) {
      hcMap[String(r['company_id'])] = parseInt(String(r['cnt'] ?? '0'))
    }
    const entityBreakdown = (entityRes.rows as Array<Record<string, unknown>>).map((r) => {
      const rev  = parseFloat(String(r['revenue'] ?? '0'))
      const cost = parseFloat(String(r['costs']   ?? '0'))
      return {
        companyId: String(r['company_id']),
        companyName: String(r['company_name']),
        revenueThisMonth: rev,
        costThisMonth: cost,
        netThisMonth: rev - cost,
        headcount: hcMap[String(r['company_id'])] ?? 0,
      }
    })

    // Revenue by entity monthly (pivot company name → yakam/factory/watanyia)
    const monthMap: Record<string, { month: string; yakam: number; factory: number; watanyia: number }> = {}
    for (const r of entityTrendRes.rows as Array<Record<string, unknown>>) {
      const period = String(r['period'])
      if (!monthMap[period]) monthMap[period] = { month: period, yakam: 0, factory: 0, watanyia: 0 }
      const rev  = parseFloat(String(r['revenue'] ?? '0'))
      const name = String(r['company_name'] ?? '').toLowerCase()
      if (name.includes('yakam'))                                   monthMap[period].yakam    += rev
      else if (name.includes('factory') || name.includes('mfg'))   monthMap[period].factory  += rev
      else if (name.includes('watanyia') || name.includes('watania')) monthMap[period].watanyia += rev
    }
    const revenueByEntityMonthly = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))

    // Project scatter
    const projectProfitabilityScatter = (scatterRes.rows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r['id']),
      name: String(r['name']),
      budget: parseFloat(String(r['budget'] ?? '0')),
      actualCost: parseFloat(String(r['actual_cost'] ?? '0')),
      marginPct: parseFloat(String(r['margin_pct'] ?? '0')),
      status: String(r['status']),
      client_name: String(r['client_name'] ?? ''),
    }))

    return {
      totalRevenue,
      totalCosts,
      netProfit: totalRevenue - totalCosts,
      activeProjects: parseInt(String((projectsRes.rows[0] as Record<string, unknown>)['cnt'] ?? '0')),
      totalProjectBudget: parseFloat(String((projectsRes.rows[0] as Record<string, unknown>)['budget'] ?? '0')),
      totalHeadcount: parseInt(String((headcountRes.rows[0] as Record<string, unknown>)['cnt'] ?? '0')),
      openPOsValue: parseFloat(String((poRes.rows[0] as Record<string, unknown>)['total'] ?? '0')),
      revenueTrend: trend.map((r) => ({ period: r['period'], value: parseFloat(r['revenue']) })),
      costsTrend:   trend.map((r) => ({ period: r['period'], value: parseFloat(r['costs']) })),
      profitTrend:  trend.map((r) => ({ period: r['period'], value: parseFloat(r['revenue']) - parseFloat(r['costs']) })),
      entityBreakdown,
      revenueByEntityMonthly,
      projectProfitabilityScatter,
    }
  },

  consolidatedPL: async (_: unknown, args: { fromDate: string; toDate: string; showEliminations?: boolean }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const rows = await query(
      `SELECT coa.account_type, coa.code as account_code, coa.name as account_name,
              COALESCE(SUM(jl.debit - jl.credit), 0) as consolidated
       FROM journal_lines jl
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.company_id = $1 AND je.status = 'posted'
         AND je.entry_date BETWEEN $2 AND $3
       GROUP BY coa.account_type, coa.code, coa.name ORDER BY coa.code`,
      [ctx.auth.companyId, args.fromDate, args.toDate]
    )
    return {
      rows: rows.rows.map((r: Record<string, unknown>) => ({ accountType: r.account_type, accountCode: r.account_code, accountName: r.account_name, companies: [], consolidated: parseFloat(String(r.consolidated)), eliminated: 0 })),
      companies: [],
      currency: 'IQD',
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
    }
  },

  consolidatedBS: async (_: unknown, args: { asOfDate: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = ctx.auth.companyId
    const r = await query(
      `SELECT coa.account_type, coa.code AS account_code, coa.name AS account_name,
              COALESCE(SUM(jl.debit - jl.credit), 0) AS consolidated
       FROM journal_lines jl
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.company_id=$1 AND je.status='posted' AND je.entry_date <= $2
         AND coa.account_type IN ('asset','liability','equity')
       GROUP BY coa.account_type, coa.code, coa.name
       ORDER BY coa.code`,
      [cid, args.asOfDate],
    )
    const rows = r.rows.map((row: Record<string, unknown>) => ({
      accountType: row['account_type'], accountCode: row['account_code'], accountName: row['account_name'],
      companies: [], consolidated: parseFloat(String(row['consolidated'])), eliminated: 0,
    }))
    const totalAssets      = rows.filter((r) => r.accountType === 'asset').reduce((s, r) => s + r.consolidated, 0)
    const totalLiabilities = rows.filter((r) => r.accountType === 'liability').reduce((s, r) => s + r.consolidated, 0)
    const totalEquity      = rows.filter((r) => r.accountType === 'equity').reduce((s, r) => s + r.consolidated, 0)
    return { rows, companies: [], currency: 'IQD', totalAssets, totalLiabilities, totalEquity, isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01 }
  },

  consolidatedTrialBalance: async (_: unknown, args: { asOfDate: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = ctx.auth.companyId
    const r = await query(
      `SELECT coa.account_type, coa.code AS account_code, coa.name AS account_name,
              COALESCE(SUM(jl.debit), 0) AS total_debit,
              COALESCE(SUM(jl.credit), 0) AS total_credit,
              COALESCE(SUM(jl.debit - jl.credit), 0) AS consolidated
       FROM journal_lines jl
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.company_id=$1 AND je.status='posted' AND je.entry_date <= $2
       GROUP BY coa.account_type, coa.code, coa.name
       ORDER BY coa.code`,
      [cid, args.asOfDate],
    )
    const rows = r.rows.map((row: Record<string, unknown>) => ({
      accountType: row['account_type'], accountCode: row['account_code'], accountName: row['account_name'],
      companies: [], consolidated: parseFloat(String(row['consolidated'])), eliminated: 0,
    }))
    const totalDebits  = r.rows.reduce((s, row: Record<string, unknown>) => s + parseFloat(String(row['total_debit'])),  0)
    const totalCredits = r.rows.reduce((s, row: Record<string, unknown>) => s + parseFloat(String(row['total_credit'])), 0)
    return { rows, companies: [], currency: 'IQD', totalDebits, totalCredits, isBalanced: Math.abs(totalDebits - totalCredits) < 0.01 }
  },

  projectProfitabilityReport: async (_: unknown, args: { companyId?: string; status?: string[]; projectType?: string; fromDate?: string; toDate?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = args.companyId ?? ctx.auth.companyId
    const r = await query(
      `SELECT p.id, p.code, p.name, p.project_type, p.status, p.budget_amount AS budget,
              COALESCE(SUM(pca.amount),0) AS actual_cost,
              COALESCE(p.client_name,'') AS client_name,
              CASE WHEN COALESCE(p.budget_amount,0)>0
                   THEN ((p.budget_amount - COALESCE(SUM(pca.amount),0)) / p.budget_amount) * 100
                   ELSE 0 END AS margin_pct
       FROM projects p
       LEFT JOIN project_cost_actuals pca ON pca.project_id=p.id
       WHERE p.company_id=$1
       GROUP BY p.id, p.code, p.name, p.project_type, p.status, p.budget_amount, p.client_name
       ORDER BY p.created_at DESC LIMIT 50`,
      [cid]
    )
    return r.rows.map((row: Record<string, unknown>) => ({
      id: row['id'], code: row['code'], name: row['name'], projectType: row['project_type'], companyName: cid,
      budget: parseFloat(String(row['budget'] ?? 0)), actualCost: parseFloat(String(row['actual_cost'] ?? 0)),
      revenue: parseFloat(String(row['budget'] ?? 0)) - parseFloat(String(row['actual_cost'] ?? 0)),
      margin: parseFloat(String(row['budget'] ?? 0)) - parseFloat(String(row['actual_cost'] ?? 0)),
      marginPct: parseFloat(String(row['margin_pct'] ?? 0)), status: row['status'],
      costBreakdown: [],
    }))
  },

  payrollCostReport: async (_: unknown, args: { fromDate: string; toDate: string; companyId?: string; departmentId?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = args.companyId ?? ctx.auth.companyId
    const r = await query(
      `SELECT d.name AS cost_center, pr.period_name AS period,
              COUNT(DISTINCT ps.employee_id) AS headcount,
              COALESCE(SUM(ps.gross_salary), 0) AS total_gross,
              COALESCE(SUM(ps.net_salary),   0) AS total_net,
              ps.currency_code
       FROM payslips ps
       JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
       JOIN employees e ON e.id = ps.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE ps.company_id=$1 AND pr.start_date >= $2 AND pr.end_date <= $3
         ${args.departmentId ? 'AND e.department_id = $4' : ''}
       GROUP BY d.name, pr.period_name, ps.currency_code
       ORDER BY pr.period_name, d.name`,
      args.departmentId ? [cid, args.fromDate, args.toDate, args.departmentId] : [cid, args.fromDate, args.toDate],
    )
    const rows = r.rows as Array<Record<string, unknown>>
    const totalGross = rows.reduce((s, r) => s + parseFloat(String(r['total_gross'])), 0)
    const totalNet   = rows.reduce((s, r) => s + parseFloat(String(r['total_net'])),   0)
    const totalHeadcount = rows.reduce((s, r) => s + parseInt(String(r['headcount'])), 0)
    return {
      rows: rows.map((r) => ({
        companyName: cid, costCenter: String(r['cost_center'] ?? 'Unassigned'),
        period: String(r['period']), headcount: parseInt(String(r['headcount'])),
        totalGross: parseFloat(String(r['total_gross'])), totalNet: parseFloat(String(r['total_net'])),
        totalIQD: parseFloat(String(r['total_gross'])),
      })),
      totalHeadcount, totalGross, totalNet,
      totalEmployerCost: totalGross,
      avgCostPerEmployee: totalHeadcount > 0 ? totalGross / totalHeadcount : 0,
      byCurrency: [], monthlyTrend: [],
    }
  },

  attendanceSummaryReport: async (_: unknown, args: { fromDate: string; toDate: string; companyId?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = args.companyId ?? ctx.auth.companyId
    // Derive from payslips which carry absent_days, leave_days, working_days, overtime_hours
    const r = await query(
      `SELECT (e.first_name || ' ' || e.last_name) AS employee_name,
              e.employee_number,
              d.name AS department,
              pr.period_name AS period,
              COALESCE(ps.working_days, 22) AS working_days,
              COALESCE(ps.absent_days,  0)  AS absent_days,
              COALESCE(ps.leave_days,   0)  AS leave_days,
              COALESCE(ps.overtime_hours, 0) AS overtime_hours
       FROM payslips ps
       JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
       JOIN employees e ON e.id = ps.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE ps.company_id=$1 AND pr.start_date >= $2 AND pr.end_date <= $3
       ORDER BY e.last_name, e.first_name`,
      [cid, args.fromDate, args.toDate],
    )
    const rows = r.rows as Array<Record<string, unknown>>
    const summaryRows = rows.map((row) => {
      const workingDays  = parseInt(String(row['working_days']))
      const absentDays   = parseInt(String(row['absent_days']))
      const presentDays  = Math.max(0, workingDays - absentDays)
      const attendancePct = workingDays > 0 ? (presentDays / workingDays) * 100 : 100
      return {
        employeeName: String(row['employee_name']),
        employeeNumber: String(row['employee_number'] ?? ''),
        department: row['department'] ? String(row['department']) : null,
        period: String(row['period']),
        totalPresent: presentDays,
        totalAbsent: absentDays,
        totalLeave: Math.round(parseFloat(String(row['leave_days']))),
        totalOvertime: parseFloat(String(row['overtime_hours'])),
        attendancePct: Math.round(attendancePct * 10) / 10,
      }
    })
    const avgAttendancePct = summaryRows.length > 0
      ? summaryRows.reduce((s, r) => s + r.attendancePct, 0) / summaryRows.length : 0
    return { rows: summaryRows, totalEmployees: summaryRows.length, avgAttendancePct: Math.round(avgAttendancePct * 10) / 10 }
  },

  inventoryValuationReport: async (_: unknown, args: { asOfDate: string; companyId?: string; locationId?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(
      `SELECT p.name as product_name, p.sku, l.name as location_name, l.location_type,
              sb.qty_on_hand, sb.avg_cost, (sb.qty_on_hand * sb.avg_cost) as total_value, 'IQD' as currency
       FROM stock_balances sb
       JOIN products p ON p.id = sb.product_id
       JOIN locations l ON l.id = sb.location_id
       WHERE sb.company_id = $1 AND sb.qty_on_hand > 0 ORDER BY total_value DESC`,
      [ctx.auth.companyId]
    )
    const totalValue = r.rows.reduce((s: number, row: Record<string, unknown>) => s + parseFloat(String(row.total_value ?? 0)), 0)
    return {
      rows: r.rows.map((row: Record<string, unknown>) => ({
        productName: row.product_name, sku: row.sku, locationName: row.location_name, locationType: row.location_type,
        qtyOnHand: parseFloat(String(row.qty_on_hand)), avgCost: parseFloat(String(row.avg_cost)),
        totalValue: parseFloat(String(row.total_value)), currency: 'IQD',
      })),
      totalValue, totalProducts: r.rows.length, totalLocations: 0, lowStockItems: 0, byLocation: [],
    }
  },

  dashboardKPIs: async (_: unknown, _args: { companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = ctx.auth.companyId

    const [revenueRes, revenueLastRes, openPOsRes, openPOsLastRes, projectsRes, headcountRes] = await Promise.all([
      query(`SELECT COALESCE(SUM(net_payable),0) AS v FROM project_invoices
             WHERE company_id=$1 AND status IN ('issued','partial','paid')
               AND invoice_date >= date_trunc('month', CURRENT_DATE)`, [cid]),
      query(`SELECT COALESCE(SUM(net_payable),0) AS v FROM project_invoices
             WHERE company_id=$1 AND status IN ('issued','partial','paid')
               AND invoice_date >= date_trunc('month', CURRENT_DATE - interval '1 month')
               AND invoice_date < date_trunc('month', CURRENT_DATE)`, [cid]),
      query(`SELECT COUNT(*) AS v FROM purchase_orders
             WHERE company_id=$1 AND status NOT IN ('completed','deleted')`, [cid]),
      query(`SELECT COUNT(*) AS v FROM purchase_orders
             WHERE company_id=$1 AND status NOT IN ('completed','deleted')
               AND created_at >= date_trunc('month', CURRENT_DATE - interval '1 month')
               AND created_at < date_trunc('month', CURRENT_DATE)`, [cid]),
      query(`SELECT COUNT(*) AS v FROM projects WHERE company_id=$1 AND status='ongoing'`, [cid]),
      query(`SELECT COUNT(*) AS v FROM employees WHERE company_id=$1 AND status='active'`, [cid]),
    ])

    const revenue = parseFloat(String(revenueRes.rows[0]?.['v'] ?? 0))
    const revenueLast = parseFloat(String(revenueLastRes.rows[0]?.['v'] ?? 0))
    const openPOs = parseInt(String(openPOsRes.rows[0]?.['v'] ?? 0))
    const openPOsLast = parseInt(String(openPOsLastRes.rows[0]?.['v'] ?? 0))
    const revenueDelta = revenueLast > 0 ? Math.round(((revenue - revenueLast) / revenueLast) * 100) : 0

    return {
      revenue,
      openPOs,
      activeProjects: parseInt(String(projectsRes.rows[0]?.['v'] ?? 0)),
      headcount: parseInt(String(headcountRes.rows[0]?.['v'] ?? 0)),
      revenueDelta,
      openPOsDelta: openPOs - openPOsLast,
    }
  },

  recentPurchaseOrders: async (_: unknown, args: { companyId: string; limit?: number }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = ctx.auth.companyId
    const limit = args.limit ?? 5
    const r = await query(
      `SELECT po.id, po.po_number AS number, COALESCE(v.name,'—') AS vendor,
              COALESCE(po.total_amount,0) AS amount,
              COALESCE(po.currency_code,'IQD') AS currency,
              po.status, po.created_at::date::text AS date
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       WHERE po.company_id=$1
       ORDER BY po.created_at DESC LIMIT $2`,
      [cid, limit],
    )
    return r.rows.map((row) => ({
      id: row['id'], number: row['number'], vendor: row['vendor'],
      amount: parseFloat(String(row['amount'])), currency: row['currency'],
      status: String(row['status']), date: String(row['date']),
    }))
  },

  activityFeed: async (_: unknown, args: { companyId: string; limit?: number }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = ctx.auth.companyId
    const limit = args.limit ?? 8
    const r = await query(
      `SELECT al.id, al.action, al.table_name AS entity,
              COALESCE(u.first_name || ' ' || u.last_name, u.email, 'system') AS "user", al.created_at AS timestamp
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.company_id=$1
       ORDER BY al.created_at DESC LIMIT $2`,
      [cid, limit],
    )
    return r.rows.map((row) => ({
      id: String(row['id']),
      action: String(row['action']),
      entity: String(row['entity']),
      user: String(row['user']),
      timestamp: String(row['timestamp']),
    }))
  },

  spendByCategory: async (_: unknown, _args: { companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = ctx.auth.companyId
    const r = await query(
      `SELECT COALESCE(aa.name, 'Unallocated') AS category,
              SUM(po.total_amount) AS amount
       FROM purchase_orders po
       LEFT JOIN analytic_accounts aa ON aa.id = po.analytic_account_id
       WHERE po.company_id=$1 AND po.status NOT IN ('deleted')
         AND po.created_at >= CURRENT_DATE - interval '90 days'
       GROUP BY 1 ORDER BY amount DESC LIMIT 8`,
      [cid],
    )
    return r.rows.map((row) => ({
      category: String(row['category']),
      amount: parseFloat(String(row['amount'] ?? 0)),
    }))
  },

  revenueVsTarget: async (_: unknown, _args: { companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = ctx.auth.companyId
    const r = await query(
      `SELECT TO_CHAR(date_trunc('month', invoice_date), 'Mon YYYY') AS month,
              SUM(net_payable) AS revenue
       FROM project_invoices
       WHERE company_id=$1 AND status IN ('issued','partial','paid')
         AND invoice_date >= CURRENT_DATE - interval '6 months'
       GROUP BY date_trunc('month', invoice_date)
       ORDER BY date_trunc('month', invoice_date)`,
      [cid],
    )
    return r.rows.map((row) => ({
      month: String(row['month']),
      revenue: parseFloat(String(row['revenue'] ?? 0)),
    }))
  },

  whtReport: async (_: unknown, args: { fromDate: string; toDate: string; companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = args.companyId ?? ctx.auth.companyId
    const r = await query(
      `SELECT v.name AS vendor_name, v.tax_id,
              'WHT' AS wht_type,
              COALESCE(v.withholding_tax_rate, 0) AS rate,
              COALESCE(SUM(vi.total_amount), 0)   AS payment_amount,
              COALESCE(SUM(vi.wht_amount),   0)   AS wht_amount,
              TO_CHAR(vi.invoice_date, 'YYYY-MM')  AS period
       FROM vendor_invoices vi
       JOIN vendors v ON v.id = vi.vendor_id
       WHERE vi.company_id=$1 AND vi.wht_amount > 0
         AND vi.invoice_date BETWEEN $2 AND $3
       GROUP BY v.name, v.tax_id, v.withholding_tax_rate, TO_CHAR(vi.invoice_date, 'YYYY-MM')
       ORDER BY period, v.name`,
      [cid, args.fromDate, args.toDate],
    )
    const rows = r.rows as Array<Record<string, unknown>>
    const totalWHT = rows.reduce((s, r) => s + parseFloat(String(r['wht_amount'])), 0)
    const totalPayments = rows.reduce((s, r) => s + parseFloat(String(r['payment_amount'])), 0)
    const vendorCount = new Set(rows.map((r) => r['vendor_name'])).size
    return {
      rows: rows.map((r) => ({
        vendorName: String(r['vendor_name']), taxId: r['tax_id'] ? String(r['tax_id']) : null,
        whtType: 'WHT', rate: parseFloat(String(r['rate'])),
        paymentAmount: parseFloat(String(r['payment_amount'])),
        whtAmount: parseFloat(String(r['wht_amount'])),
        period: String(r['period']),
      })),
      totalWHT, vendorCount, totalPaymentsSubjectToWHT: totalPayments,
    }
  },

  fxExposureReport: async (_: unknown, args: { asOfDate: string; companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = args.companyId ?? ctx.auth.companyId
    // Open AR (project_invoices) and AP (vendor_invoices) in non-IQD currencies
    const [arRes, apRes, fxRes] = await Promise.all([
      query(
        `SELECT currency_code,
                COALESCE(SUM(total_amount - amount_paid), 0) AS open_amount
         FROM project_invoices
         WHERE company_id=$1 AND currency_code != 'IQD'
           AND status NOT IN ('paid','void','cancelled') AND issue_date <= $2
         GROUP BY currency_code`,
        [cid, args.asOfDate],
      ),
      query(
        `SELECT currency_code,
                COALESCE(SUM(net_payable - amount_paid), 0) AS open_amount
         FROM vendor_invoices
         WHERE company_id=$1 AND currency_code != 'IQD'
           AND status NOT IN ('paid','cancelled') AND invoice_date <= $2
         GROUP BY currency_code`,
        [cid, args.asOfDate],
      ),
      query(
        `SELECT currency_code, rate FROM fx_rates
         WHERE valid_date = (SELECT MAX(valid_date) FROM fx_rates WHERE valid_date <= $1)`,
        [args.asOfDate],
      ),
    ])
    const fxRates: Record<string, number> = {}
    for (const row of fxRes.rows as Array<Record<string, unknown>>) {
      fxRates[String(row['currency_code'])] = parseFloat(String(row['rate']))
    }
    const currencies = new Set([
      ...(arRes.rows as Array<Record<string, unknown>>).map((r) => String(r['currency_code'])),
      ...(apRes.rows as Array<Record<string, unknown>>).map((r) => String(r['currency_code'])),
    ])
    const rows = Array.from(currencies).map((currency) => {
      const openAR = parseFloat(String((arRes.rows as Array<Record<string, unknown>>).find((r) => r['currency_code'] === currency)?.['open_amount'] ?? '0'))
      const openAP = parseFloat(String((apRes.rows as Array<Record<string, unknown>>).find((r) => r['currency_code'] === currency)?.['open_amount'] ?? '0'))
      const fxRate = fxRates[currency] ?? 1
      const netExposure = openAR - openAP
      return { currency, openAR, openAP, netExposure, fxRate, iqdEquivalent: netExposure * fxRate }
    })
    return { rows, totalIQDExposure: rows.reduce((s, r) => s + r.iqdEquivalent, 0) }
  },

  payrollTaxReport: async (_: unknown, args: { fromDate: string; toDate: string; companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const cid = args.companyId ?? ctx.auth.companyId
    const r = await query(
      `SELECT (e.first_name || ' ' || e.last_name) AS employee_name,
              e.employee_number,
              pr.period_name AS period,
              ps.gross_salary,
              ps.gross_salary AS taxable_income,
              ps.income_tax,
              ps.social_security,
              ps.net_salary
       FROM payslips ps
       JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
       JOIN employees e ON e.id = ps.employee_id
       WHERE ps.company_id=$1 AND pr.start_date >= $2 AND pr.end_date <= $3
         AND (ps.income_tax > 0 OR ps.social_security > 0)
       ORDER BY pr.period_name, e.last_name`,
      [cid, args.fromDate, args.toDate],
    )
    return {
      rows: (r.rows as Array<Record<string, unknown>>).map((row) => ({
        employeeName: String(row['employee_name']),
        employeeNumber: String(row['employee_number'] ?? ''),
        period: String(row['period']),
        grossPay: parseFloat(String(row['gross_salary'])),
        taxableIncome: parseFloat(String(row['taxable_income'])),
        incomeTaxWithheld: parseFloat(String(row['income_tax'])),
        socialSecurity: parseFloat(String(row['social_security'])),
        netPay: parseFloat(String(row['net_salary'])),
      })),
    }
  },

  // Inter-company
  intercoTransactions: async (_: unknown, args: { fromCompanyId?: string; toCompanyId?: string; status?: string; page?: number; limit?: number }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const page = args.page ?? 1; const lim = args.limit ?? 20; const offset = (page - 1) * lim
    let sql = `SELECT it.*, fc.name as from_company_name, tc.name as to_company_name
               FROM interco_transactions it
               JOIN companies fc ON fc.id = it.from_company_id
               JOIN companies tc ON tc.id = it.to_company_id
               WHERE (it.from_company_id = $1 OR it.to_company_id = $1)`
    const params: unknown[] = [ctx.auth.companyId]
    let idx = 2
    if (args.status) { sql += ` AND it.status = $${idx++}`; params.push(args.status) }
    sql += ` ORDER BY it.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(lim, offset)
    const r = await query(sql, params)
    const countR = await query(`SELECT COUNT(*) FROM interco_transactions WHERE from_company_id=$1 OR to_company_id=$1`, [ctx.auth.companyId])
    return {
      items: r.rows.map((row: Record<string, unknown>) => ({
        id: row.id, reference: row.reference, transactionType: row.transaction_type,
        fromCompanyName: row.from_company_name, toCompanyName: row.to_company_name,
        amount: parseFloat(String(row.amount)), currencyCode: row.currency_code, status: row.status,
        createdAt: String(row.created_at),
      })),
      total: parseInt(String(countR.rows[0]?.count ?? '0')), page, limit: lim,
    }
  },

  intercoTransaction: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(
      `SELECT it.*, fc.name as from_company_name, tc.name as to_company_name,
              fa.name as from_account_name, ta.name as to_account_name
       FROM interco_transactions it
       JOIN companies fc ON fc.id=it.from_company_id
       JOIN companies tc ON tc.id=it.to_company_id
       LEFT JOIN chart_of_accounts fa ON fa.id=it.from_account_id
       LEFT JOIN chart_of_accounts ta ON ta.id=it.to_account_id
       WHERE it.id=$1`, [args.id])
    if (!r.rows[0]) return null
    const row = r.rows[0] as Record<string, unknown>
    return { ...row, fromCompanyName: row.from_company_name, toCompanyName: row.to_company_name, transactionType: row.transaction_type, currencyCode: row.currency_code, fromCompanyId: row.from_company_id, toCompanyId: row.to_company_id, fromAccountId: row.from_account_id ?? null, fromAccountName: row.from_account_name ?? null, toAccountId: row.to_account_id ?? null, toAccountName: row.to_account_name ?? null, postedAt: row.posted_at, postedBy: row.posted_by, fromJournalId: row.from_journal_entry_id, toJournalId: row.to_journal_entry_id, createdAt: row.created_at, fromCompanyApprovedBy: row.from_company_approved_by ?? null, fromCompanyApprovedAt: row.from_company_approved_at ?? null, toCompanyApprovedBy: row.to_company_approved_by ?? null, toCompanyApprovedAt: row.to_company_approved_at ?? null }
  },

  intercoStockTransfers: async (_: unknown, args: { page?: number; limit?: number }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const page = args.page ?? 1; const lim = args.limit ?? 20; const offset = (page - 1) * lim
    const r = await query(`SELECT ist.*, fc.name as from_company_name, tc.name as to_company_name FROM interco_stock_transfers ist JOIN companies fc ON fc.id=ist.from_company_id JOIN companies tc ON tc.id=ist.to_company_id WHERE ist.from_company_id=$1 OR ist.to_company_id=$1 ORDER BY ist.created_at DESC LIMIT $2 OFFSET $3`, [ctx.auth.companyId, lim, offset])
    const cnt = await query(`SELECT COUNT(*) FROM interco_stock_transfers WHERE from_company_id=$1 OR to_company_id=$1`, [ctx.auth.companyId])
    return { items: r.rows.map((row: Record<string, unknown>) => ({ id: row.id, transferNumber: row.transfer_number, fromCompanyName: row.from_company_name, toCompanyName: row.to_company_name, totalValue: parseFloat(String(row.total_value ?? 0)), pricingMethod: row.pricing_method ?? 'avco', status: row.status, transferDate: String(row.transfer_date) })), total: parseInt(String(cnt.rows[0]?.count ?? '0')), page, limit: lim }
  },

  intercoStockTransfer: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT ist.*, fc.name as from_company_name, tc.name as to_company_name FROM interco_stock_transfers ist JOIN companies fc ON fc.id=ist.from_company_id JOIN companies tc ON tc.id=ist.to_company_id WHERE ist.id=$1`, [args.id])
    if (!r.rows[0]) return null
    const lines = await query(
      `SELECT istl.*, p.name AS product_name, p.sku FROM interco_stock_transfer_lines istl
       JOIN products p ON p.id=istl.product_id WHERE istl.transfer_id=$1`,
      [args.id],
    )
    const row = r.rows[0] as Record<string, unknown>
    return {
      id: row['id'],
      transferNumber: row['transfer_number'],
      fromCompanyId: row['from_company_id'],
      fromCompanyName: row['from_company_name'],
      toCompanyId: row['to_company_id'],
      toCompanyName: row['to_company_name'],
      pricingMethod: row['pricing_method'],
      status: row['status'],
      transferDate: String(row['transfer_date']),
      fromStockMoveId: row['from_stock_move_id'] ?? null,
      toStockMoveId: row['to_stock_move_id'] ?? null,
      fromJournalId: row['from_journal_id'] ?? null,
      toJournalId: row['to_journal_id'] ?? null,
      lines: lines.rows.map((l: Record<string, unknown>) => ({
        id: l['id'],
        productName: l['product_name'] ?? '',
        sku: l['sku'] ?? null,
        qty: parseFloat(String(l['qty'] ?? 0)),
        avcoAtTransfer: parseFloat(String(l['avco_at_transfer'] ?? 0)),
        transferPrice: parseFloat(String(l['transfer_price'] ?? 0)),
        markupPct: parseFloat(String(l['markup_pct_applied'] ?? 0)),
        totalValue: parseFloat(String(l['total_transfer_value'] ?? 0)),
      })),
    }
  },

  companyIntercoPricingSettings: async (_: unknown, args: { companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT ipc.*, c.name as company_name FROM interco_pricing_configs ipc JOIN companies c ON c.id=ipc.company_id WHERE ipc.company_id=$1`, [args.companyId])
    if (!r.rows[0]) return null
    const row = r.rows[0] as Record<string, unknown>
    return { companyId: row.company_id, companyName: row.company_name, method: row.method, costPlusMarkupPct: row.cost_plus_markup_pct ? parseFloat(String(row.cost_plus_markup_pct)) : null, updatedAt: row.updated_at, updatedByEmail: row.updated_by_email }
  },

  intercoPricingConfigHistory: async (_: unknown, args: { companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT * FROM interco_pricing_config_history WHERE company_id=$1 ORDER BY changed_at DESC LIMIT 20`, [args.companyId])
    return r.rows.map((row: Record<string, unknown>) => ({ previousMethod: row.previous_method, newMethod: row.new_method, changedBy: row.changed_by, changedAt: row.changed_at, notes: row.notes }))
  },

  // Admin — Companies
  companies: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(
      `SELECT c.*, sc.fiscal_year_start_month, sc.fiscal_year_start_day,
              sc.default_currency, sc.default_payment_terms_days, sc.default_po_currency,
              sc.income_tax_enabled, sc.social_security_rate, sc.employer_social_security_rate,
              sc.default_wht_rate,
              sc.company_email_from, sc.company_email_signature, sc.setup_completed as config_setup_completed,
              (SELECT COUNT(*) FROM user_company_roles ucr WHERE ucr.company_id=c.id AND ucr.is_active=true) as user_count
       FROM companies c
       LEFT JOIN system_configuration sc ON sc.company_id = c.id
       ORDER BY c.name`,
      [],
    )
    return r.rows.map((row: Record<string, unknown>) => companyRowToDetail(row))
  },

  company: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(
      `SELECT c.*, sc.fiscal_year_start_month, sc.fiscal_year_start_day,
              sc.default_currency, sc.default_payment_terms_days, sc.default_po_currency,
              sc.income_tax_enabled, sc.social_security_rate, sc.employer_social_security_rate,
              sc.default_wht_rate,
              sc.company_email_from, sc.company_email_signature, sc.setup_completed as config_setup_completed,
              (SELECT COUNT(*) FROM user_company_roles ucr WHERE ucr.company_id=c.id AND ucr.is_active=true) as user_count
       FROM companies c
       LEFT JOIN system_configuration sc ON sc.company_id = c.id
       WHERE c.id=$1`,
      [args.id],
    )
    if (!r.rows[0]) return null
    return companyRowToDetail(r.rows[0] as Record<string, unknown>)
  },

  companyUsers: async (_: unknown, args: { companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(
      `SELECT u.id, u.email, u.is_active, u.last_login_at,
              json_agg(json_build_object('id', ucr.id, 'role', ucr.role, 'module', ucr.module, 'isActive', ucr.is_active)) as roles
       FROM users u
       JOIN user_company_roles ucr ON ucr.user_id = u.id
       WHERE ucr.company_id = $1
       GROUP BY u.id, u.email, u.is_active, u.last_login_at
       ORDER BY u.email`,
      [args.companyId],
    )
    return r.rows.map((row: Record<string, unknown>) => ({
      id: row.id, email: row.email, isActive: row.is_active, lastLoginAt: row.last_login_at,
      roles: (row.roles as Array<Record<string, unknown>>) ?? [],
    }))
  },

  userInvitations: async (_: unknown, args: { companyId?: string; status?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    let sql = `SELECT ui.*, u.email as invited_by_email, c.name as company_name
               FROM user_invitations ui
               LEFT JOIN users u ON u.id = ui.invited_by
               LEFT JOIN companies c ON c.id = ui.company_id
               WHERE 1=1`
    const params: unknown[] = []; let idx = 1
    if (args.companyId) { sql += ` AND ui.company_id=$${idx++}`; params.push(args.companyId) }
    if (args.status) { sql += ` AND ui.status=$${idx++}`; params.push(args.status) }
    sql += ' ORDER BY ui.created_at DESC'
    const r = await query(sql, params)
    return r.rows.map((row: Record<string, unknown>) => ({
      id: row.id, email: row.email, invitedByEmail: row.invited_by_email, companyId: row.company_id,
      companyName: row.company_name, role: row.role, module: row.module, status: row.status,
      expiresAt: row.expires_at, acceptedAt: row.accepted_at, createdAt: row.created_at,
    }))
  },

  roleAssignments: async (_: unknown, args: { userId?: string; companyId?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    let sql = `SELECT ucr.*, c.name as company_name FROM user_company_roles ucr JOIN companies c ON c.id=ucr.company_id WHERE 1=1`
    const params: unknown[] = []; let idx = 1
    if (args.userId) { sql += ` AND ucr.user_id=$${idx++}`; params.push(args.userId) }
    if (args.companyId) { sql += ` AND ucr.company_id=$${idx++}`; params.push(args.companyId) }
    sql += ' ORDER BY c.name'
    const r = await query(sql, params)
    return r.rows.map((row: Record<string, unknown>) => ({
      id: row.id, companyId: row.company_id, companyName: row.company_name ?? '',
      module: row.module ?? '', role: row.role, isActive: row.is_active,
    }))
  },

  // Admin — Users
  users: async (_: unknown, args: { search?: string; isActive?: boolean; page?: number; limit?: number }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const page = args.page ?? 1; const lim = args.limit ?? 20; const offset = (page - 1) * lim
    let sql = `SELECT u.id, u.email, u.is_active, u.mfa_enabled, u.last_login FROM users u WHERE 1=1`
    const params: unknown[] = []; let idx = 1
    if (args.search) { sql += ` AND u.email ILIKE $${idx++}`; params.push(`%${args.search}%`) }
    if (args.isActive !== undefined) { sql += ` AND u.is_active=$${idx++}`; params.push(args.isActive) }
    sql += ` ORDER BY u.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(lim, offset)
    const r = await query(sql, params)
    const cnt = await query(`SELECT COUNT(*) FROM users`, [])
    return { items: r.rows.map((row: Record<string, unknown>) => ({ id: row.id, email: row.email, isActive: row.is_active, mfaEnabled: row.mfa_enabled, lastLogin: row.last_login, activeSessions: 0, companies: [], roles: [] })), total: parseInt(String(cnt.rows[0]?.count ?? '0')), page, limit: lim }
  },

  user: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT * FROM users WHERE id=$1`, [args.id])
    if (!r.rows[0]) return null
    const row = r.rows[0] as Record<string, unknown>
    const roles = await query(`SELECT ur.*, c.name as company_name FROM user_company_roles ur JOIN companies c ON c.id=ur.company_id WHERE ur.user_id=$1`, [args.id])
    return { id: row.id, email: row.email, isActive: row.is_active, mfaEnabled: row.mfa_enabled, lastLogin: row.last_login, failedLoginAttempts: row.failed_login_attempts ?? 0, lockedUntil: row.locked_until, createdAt: row.created_at, roles: roles.rows.map((rl: Record<string, unknown>) => ({ id: rl.id, companyId: rl.company_id, companyName: rl.company_name, module: rl.module, role: rl.role, isActive: rl.is_active })) }
  },

  userSessions: async (_: unknown, args: { userId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT * FROM sessions WHERE user_id=$1 AND expires_at > NOW() ORDER BY created_at DESC`, [args.userId])
    return r.rows.map((row: Record<string, unknown>) => ({ id: row.id, deviceName: row.device_name, platform: row.platform, ipAddress: row.ip_address, createdAt: row.created_at, expiresAt: row.expires_at, isCurrent: row.session_id === ctx.auth?.sessionId }))
  },

  outboxEventConfigs: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT * FROM outbox_event_configs ORDER BY event_type`, [])
    return r.rows.map((row: Record<string, unknown>) => ({ id: row['id'], eventType: row['event_type'], maxAttempts: Number(row['max_attempts'] ?? 5), initialRetryDelaySeconds: Number(row['initial_retry_delay_seconds'] ?? 60), backoffMultiplier: parseFloat(String(row['backoff_multiplier'] ?? 2)), maxRetryDelaySeconds: Number(row['max_retry_delay_seconds'] ?? 3600), dlqPriority: String(row['dlq_priority'] ?? 'normal'), alertOnDlq: Boolean(row['alert_on_dlq']), description: row['description'] ?? null }))
  },

  systemHealth: (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    return healthCache
  },

  auditLog: async (_: unknown, args: { userId?: string; companyId?: string; tableName?: string; action?: string; fromDate?: string; toDate?: string; page?: number; limit?: number }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const page = args.page ?? 1; const lim = args.limit ?? 50; const offset = (page - 1) * lim
    const companyId = ctx.auth.companyId

    return withTransaction({ companyId, userId: ctx.auth.userId, role: ctx.auth.role }, async (client) => {
      // Start with company scope — RLS also enforces this, but explicit is clearer
      let sql = `SELECT al.*, u.email as user_email, c.name as company_name
                 FROM audit_log al
                 LEFT JOIN users u ON u.id = al.user_id
                 LEFT JOIN companies c ON c.id = al.company_id
                 WHERE al.company_id = $1`
      const params: unknown[] = [companyId]; let idx = 2
      if (args.tableName) { sql += ` AND al.table_name=$${idx++}`; params.push(args.tableName) }
      if (args.action) { sql += ` AND al.action=$${idx++}`; params.push(args.action) }
      // fromDate: inclusive start of day
      if (args.fromDate) { sql += ` AND al.created_at >= $${idx++}::date`; params.push(args.fromDate) }
      // toDate: inclusive end of day (compare date part only to avoid midnight cutoff)
      if (args.toDate) { sql += ` AND al.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(args.toDate) }
      sql += ` ORDER BY al.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`; params.push(lim, offset)

      const r = await client.query(sql, params)
      const cnt = await client.query(`SELECT COUNT(*) FROM audit_log WHERE company_id=$1`, [companyId])
      return {
        items: r.rows.map((row: Record<string, unknown>) => ({
          id: row['id'], createdAt: row['created_at'], userEmail: row['user_email'] ?? '',
          companyName: row['company_name'], action: row['action'], tableName: row['table_name'],
          recordId: row['record_id'], ipAddress: row['ip_address'],
          oldValues: row['old_values'], newValues: row['new_values'],
        })),
        total: parseInt(String(cnt.rows[0]?.['count'] ?? '0')),
        page,
        limit: lim,
      }
    })
  },

  // Settings
  myProfile: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT * FROM users WHERE id=$1`, [ctx.auth.userId])
    const row = r.rows[0] as Record<string, unknown>
    return { id: row.id, email: row.email, mfaEnabled: row.mfa_enabled, lastLogin: row.last_login, createdAt: row.created_at }
  },

  myPreferences: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT theme_preference, date_format, number_format, notification_preferences FROM users WHERE id=$1`, [ctx.auth.userId])
    const row = r.rows[0] as Record<string, unknown>
    return { themePreference: row?.theme_preference, dateFormat: row?.date_format, numberFormat: row?.number_format, notificationPreferences: row?.notification_preferences }
  },

  mySessions: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT * FROM sessions WHERE user_id=$1 AND expires_at > NOW() ORDER BY created_at DESC`, [ctx.auth.userId])
    return r.rows.map((row: Record<string, unknown>) => ({ id: row['id'], deviceName: row['device_name'], platform: row['platform'], ipAddress: row['ip_address'], createdAt: row['created_at'], lastActive: row['last_active'] ?? row['created_at'], isCurrent: row['id'] === ctx.auth?.sessionId }))
  },

  // ── Phase 4: Projects (moved from Mutation block) ─────────────────────────

  projectTeamMembers: async (_: unknown, args: { projectId: string }, ctx: GQLContext) => {
    if (!ctx.auth) return []
    const r = await query(
      `SELECT ptm.*, e.first_name||' '||e.last_name AS employee_name
       FROM project_team_members ptm
       JOIN employees e ON e.id=ptm.employee_id
       WHERE ptm.project_id=$1 AND ptm.company_id=$2`,
      [args.projectId, ctx.auth.companyId],
    )
    return r.rows
  },

  workCenters: async (_: unknown, args: { isActive?: boolean; allCompanies?: boolean }, ctx: GQLContext) => {
    if (!ctx.auth) return []
    let sql = `SELECT * FROM work_centers WHERE 1=1`
    const params: unknown[] = []
    let idx = 1
    if (!args.allCompanies) { sql += ` AND company_id=$${idx++}`; params.push(ctx.auth.companyId) }
    if (args.isActive !== undefined) { sql += ` AND is_active=$${idx++}`; params.push(args.isActive) }
    sql += ' ORDER BY name'
    const r = await query(sql, params)
    return r.rows
  },

  bom: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) return null
    const r = await query(
      `SELECT b.*, fp.name AS product_name FROM boms b JOIN products fp ON fp.id=b.finished_product_id WHERE b.id=$1 AND b.company_id=$2`,
      [args.id, ctx.auth.companyId],
    )
    if (!r.rows[0]) return null
    const lines = await query(
      `SELECT bl.id, bl.sequence, bl.component_product_id, bl.qty_required AS qty, bl.uom, bl.unit_cost, bl.notes,
              p.name AS component_name
       FROM bom_lines bl
       JOIN products p ON p.id=bl.component_product_id
       WHERE bl.bom_id=$1 ORDER BY bl.sequence`,
      [args.id],
    )
    return { ...r.rows[0], lines: lines.rows }
  },

  manufacturingOrder: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) return null
    const r = await query(
      `SELECT mo.*, p.name AS product_name, wc.name AS work_center_name, proj.name AS project_name
       FROM manufacturing_orders mo
       LEFT JOIN products p ON p.id=mo.finished_product_id
       LEFT JOIN work_centers wc ON wc.id=mo.work_center_id
       LEFT JOIN projects proj ON proj.id=mo.project_id
       WHERE mo.id=$1 AND mo.company_id=$2`,
      [args.id, ctx.auth.companyId],
    )
    if (!r.rows[0]) return null
    const lines = await query(
      `SELECT mol.*, p.name AS component_name FROM mo_consumptions mol JOIN products p ON p.id=mol.component_product_id WHERE mol.mo_id=$1`,
      [args.id],
    )
    return { ...r.rows[0], lines: lines.rows }
  },

  moCostAnalysis: async (_: unknown, args: { moId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(
      `SELECT mo.planned_cost, mo.actual_cost, mol.component_product_id,
         p.name AS component_name, mol.qty_consumed, mol.unit_cost, mol.total_cost
       FROM manufacturing_orders mo
       LEFT JOIN mo_consumptions mol ON mol.mo_id=mo.id
       LEFT JOIN products p ON p.id=mol.component_product_id
       WHERE mo.id=$1 AND mo.company_id=$2`,
      [args.moId, ctx.auth.companyId],
    )
    const rows = r.rows
    if (!rows.length) throw new Error('MO not found')
    const plannedCost = parseFloat(rows[0].planned_cost ?? '0')
    const actualCost = parseFloat(rows[0].actual_cost ?? '0')
    const variance = actualCost - plannedCost
    const variancePct = plannedCost ? (variance / plannedCost) * 100 : 0
    const componentBreakdown = rows.filter(row => row.component_product_id).map(row => ({
      key: row.component_product_id,
      label: row.component_name ?? row.component_product_id,
      amount: parseFloat(row.total_cost ?? '0'),
    }))
    return { plannedCost, actualCost, variance, variancePct, componentBreakdown }
  },

  // ── Phase 4: Equipment Rental (moved from Mutation block) ────────────────

  equipmentAsset: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) return null
    const r = await query(`SELECT * FROM equipment_assets WHERE id=$1 AND company_id=$2`, [args.id, ctx.auth.companyId])
    return r.rows[0] ?? null
  },

  maintenanceSchedules: async (_: unknown, args: { assetId?: string; status?: string; fromDate?: string; toDate?: string }, ctx: GQLContext) => {
    if (!ctx.auth) return []
    let sql = `SELECT ms.*, ea.name AS asset_name FROM maintenance_schedules ms LEFT JOIN equipment_assets ea ON ea.id=ms.asset_id WHERE ms.company_id=$1`
    const params: unknown[] = [ctx.auth.companyId]
    let idx = 2
    if (args.assetId) { sql += ` AND ms.asset_id=$${idx++}`; params.push(args.assetId) }
    if (args.status) { sql += ` AND ms.status=$${idx++}`; params.push(args.status) }
    if (args.fromDate) { sql += ` AND ms.scheduled_date>=$${idx++}`; params.push(args.fromDate) }
    if (args.toDate) { sql += ` AND ms.scheduled_date<=$${idx++}`; params.push(args.toDate) }
    sql += ' ORDER BY ms.scheduled_date'
    const r = await query(sql, params)
    return r.rows
  },

  maintenanceRecords: async (_: unknown, args: { assetId?: string }, ctx: GQLContext) => {
    if (!ctx.auth) return []
    let sql = `SELECT * FROM maintenance_records WHERE company_id=$1`
    const params: unknown[] = [ctx.auth.companyId]
    if (args.assetId) { sql += ` AND asset_id=$2`; params.push(args.assetId) }
    sql += ' ORDER BY performed_date DESC'
    const r = await query(sql, params)
    return r.rows
  },

  rentalContract: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) return null
    const r = await query(
      `SELECT rc.*, ea.name AS asset_name FROM rental_contracts rc LEFT JOIN equipment_assets ea ON ea.id=rc.asset_id WHERE rc.id=$1 AND rc.company_id=$2`,
      [args.id, ctx.auth.companyId],
    )
    return r.rows[0] ?? null
  },

  rentalInvoices: async (_: unknown, args: { contractId?: string; status?: string }, ctx: GQLContext) => {
    if (!ctx.auth) return []
    let sql = `SELECT * FROM rental_invoices WHERE company_id=$1`
    const params: unknown[] = [ctx.auth.companyId]
    let idx = 2
    if (args.contractId) { sql += ` AND contract_id=$${idx++}`; params.push(args.contractId) }
    if (args.status) { sql += ` AND status=$${idx++}`; params.push(args.status) }
    sql += ' ORDER BY invoice_date DESC'
    const r = await query(sql, params)
    return r.rows.map((row: Record<string, unknown>) => ({
      ...row,
      whtApplies: Boolean(row['wht_applies'] ?? false),
      whtScenario: row['wht_scenario'] ?? null,
      whtRate: parseFloat(String(row['wht_rate'] ?? 0)),
      whtAmount: parseFloat(String(row['wht_amount'] ?? 0)),
    }))
  },

  overdueMaintenanceCount: async (_: unknown, _args: unknown, ctx: GQLContext) => {
    if (!ctx.auth) return 0
    const r = await query(
      `SELECT COUNT(*) AS c FROM maintenance_schedules WHERE company_id=$1 AND status='scheduled' AND scheduled_date < CURRENT_DATE`,
      [ctx.auth.companyId],
    )
    return parseInt(r.rows[0]?.c ?? '0', 10)
  },

  poPositions: async (_: unknown, args: { projectId?: string; departmentId?: string }, ctx: GQLContext) => {
    if (!ctx.auth) return []
    let sql = `
      SELECT ppa.id, ppa.employee_id, ppa.position, ppa.project_id, ppa.department_id, ppa.is_active, ppa.created_at,
             e.first_name || ' ' || e.last_name AS employee_name,
             p.name AS project_name, d.name AS department_name
      FROM po_position_assignments ppa
      JOIN employees e ON e.id = ppa.employee_id
      LEFT JOIN projects p ON p.id = ppa.project_id
      LEFT JOIN departments d ON d.id = ppa.department_id
      WHERE ppa.company_id = $1`
    const params: unknown[] = [ctx.auth.companyId]
    let idx = 2
    if (args.projectId) { sql += ` AND ppa.project_id=$${idx++}`; params.push(args.projectId) }
    if (args.departmentId) { sql += ` AND ppa.department_id=$${idx++}`; params.push(args.departmentId) }
    sql += ' ORDER BY ppa.created_at DESC'
    const r = await query(sql, params)
    return r.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      position: row.position,
      projectId: row.project_id,
      projectName: row.project_name,
      departmentId: row.department_id,
      departmentName: row.department_name,
      isActive: row.is_active,
      createdAt: row.created_at,
    }))
  },
}

const phase5MutationResolvers = {
  // ── PO edit requests ──────────────────────────────────────────────────────

  submitPOEditRequest: async (
    _: unknown,
    args: { id: string; changes: string; notes?: string },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const isAdminRole = ['system_admin', 'company_admin', 'module_admin'].includes(ctx.auth.role)

    if (!isAdminRole) {
      const scope = await query(
        `SELECT 1 FROM purchase_orders po
         WHERE po.id=$1 AND po.company_id=$2
           AND (po.created_by=$3 OR po.assigned_to=$3 OR EXISTS (
             SELECT 1 FROM project_members pm JOIN employees emp ON emp.id=pm.employee_id
             WHERE pm.project_id=po.project_id AND emp.user_id=$3 AND pm.is_active=true
           )) LIMIT 1`,
        [args.id, ctx.auth.companyId, ctx.auth.userId],
      )
      if (!scope.rows[0]) throw new Error('You are not associated with this PO or its project')
    }

    const existing = await query(
      `SELECT id FROM po_edit_requests WHERE po_id=$1 AND status='pending' LIMIT 1`,
      [args.id],
    )
    if (existing.rows[0]) throw new Error('A pending edit request already exists. It must be approved or rejected first.')

    let changesObj: unknown
    try { changesObj = JSON.parse(args.changes) } catch { throw new Error('changes must be valid JSON') }

    const r = await query(
      `INSERT INTO po_edit_requests (po_id, requested_by, changes, request_notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [args.id, ctx.auth.userId, JSON.stringify(changesObj), args.notes ?? null],
    )
    const row = r.rows[0] as Record<string, unknown>
    const usr = await query(`SELECT email FROM users WHERE id=$1`, [ctx.auth.userId])
    return { ...row, changes: args.changes, requested_by_email: usr.rows[0]?.email ?? null, reviewed_by_email: null }
  },

  approvePOEditRequest: async (
    _: unknown,
    args: { id: string; requestId: string; reviewNotes?: string },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const isAdminRole = ['system_admin', 'company_admin', 'module_admin'].includes(ctx.auth.role)
    if (!isAdminRole) throw new Error('Admin role required')

    const erRow = await query(
      `SELECT * FROM po_edit_requests WHERE id=$1 AND po_id=$2 AND status='pending'`,
      [args.requestId, args.id],
    )
    if (!erRow.rows[0]) throw new Error('Pending edit request not found')

    const changes = (erRow.rows[0] as Record<string, unknown>)['changes'] as {
      header?: Record<string, { from: unknown; to: unknown }>
      lines?: { edited?: Array<{ id: string; field: string; to: unknown }>; added?: Array<Record<string, unknown>>; removed?: string[] }
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const allowed = ['notes', 'expected_delivery_date', 'vendor_id', 'analytic_account_id', 'currency_code']
      if (changes.header && Object.keys(changes.header).length > 0) {
        const sets: string[] = []; const vals: unknown[] = []
        for (const [field, diff] of Object.entries(changes.header)) {
          if (!allowed.includes(field)) continue
          sets.push(`${field}=$${vals.length + 1}`); vals.push(diff.to)
        }
        if (sets.length > 0) { vals.push(args.id); await client.query(`UPDATE purchase_orders SET ${sets.join(',')},updated_at=NOW() WHERE id=$${vals.length}`, vals) }
      }
      const lineAllowed = ['description', 'qty_ordered', 'unit_price', 'uom', 'product_id']
      for (const e of changes.lines?.edited ?? []) {
        if (!lineAllowed.includes(e.field)) continue
        await client.query(`UPDATE po_lines SET ${e.field}=$1 WHERE id=$2 AND po_id=$3`, [e.to, e.id, args.id])
      }
      for (const line of changes.lines?.added ?? []) {
        const qty = Number(line['qty_ordered'] ?? 0), price = Number(line['unit_price'] ?? 0)
        await client.query(
          `INSERT INTO po_lines (po_id,line_number,description,product_id,qty_ordered,unit_price,currency_code,uom,total_price)
           VALUES ($1,(SELECT COALESCE(MAX(line_number),0)+1 FROM po_lines WHERE po_id=$1),$2,$3,$4,$5,$6,$7,$8)`,
          [args.id, line['description'], line['product_id'] ?? null, qty, price, line['currency_code'] ?? 'IQD', line['uom'] ?? 'unit', qty * price],
        )
      }
      for (const lineId of changes.lines?.removed ?? []) {
        await client.query(`DELETE FROM po_lines WHERE id=$1 AND po_id=$2`, [lineId, args.id])
      }
      if (changes.lines) {
        await client.query(
          `UPDATE purchase_orders SET subtotal=(SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1),total_amount=(SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1),updated_at=NOW() WHERE id=$1`,
          [args.id],
        )
      }
      await client.query(
        `UPDATE po_edit_requests SET status='approved',reviewed_by=$1,review_notes=$2,reviewed_at=NOW() WHERE id=$3`,
        [ctx.auth.userId, args.reviewNotes ?? null, args.requestId],
      )
      const poStatusRow = await client.query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
      const currentStatus = poStatusRow.rows[0]?.status ?? 'unknown'
      const changeSummary = buildEditChangeSummary(changes)
      const logNotes = [args.reviewNotes, changeSummary].filter(Boolean).join(' — ')
      await client.query(
        `INSERT INTO po_approval_log (po_id,from_status,to_status,actor_id,action,notes) VALUES ($1,$2,$2,$3,'edit_approved',$4)`,
        [args.id, currentStatus, ctx.auth.userId, logNotes],
      )
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }

    const updated = await query(
      `SELECT er.*,req.email AS requested_by_email,rev.email AS reviewed_by_email FROM po_edit_requests er JOIN users req ON req.id=er.requested_by LEFT JOIN users rev ON rev.id=er.reviewed_by WHERE er.id=$1`,
      [args.requestId],
    )
    const row = updated.rows[0] as Record<string, unknown>
    return { ...row, changes: JSON.stringify(row['changes']) }
  },

  rejectPOEditRequest: async (
    _: unknown,
    args: { id: string; requestId: string; reviewNotes: string },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const isAdminRole = ['system_admin', 'company_admin', 'module_admin'].includes(ctx.auth.role)
    if (!isAdminRole) throw new Error('Admin role required')
    if (!args.reviewNotes?.trim()) throw new Error('reviewNotes is required when rejecting')

    const r = await query(
      `UPDATE po_edit_requests SET status='rejected',reviewed_by=$1,review_notes=$2,reviewed_at=NOW()
       WHERE id=$3 AND po_id=$4 AND status='pending' RETURNING *`,
      [ctx.auth.userId, args.reviewNotes, args.requestId, args.id],
    )
    if (!r.rows[0]) throw new Error('Pending edit request not found')
    const rejectedChanges = (r.rows[0] as Record<string, unknown>)['changes'] as EditChanges
    const rejectSummary = buildEditChangeSummary(rejectedChanges)
    const poStatusRes = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    const currentPoStatus = poStatusRes.rows[0]?.status ?? 'unknown'
    const rejectLogNotes = [args.reviewNotes, rejectSummary].filter(Boolean).join(' — ')
    await query(
      `INSERT INTO po_approval_log (po_id,from_status,to_status,actor_id,action,notes) VALUES ($1,$2,$2,$3,'edit_rejected',$4)`,
      [args.id, currentPoStatus, ctx.auth.userId, rejectLogNotes],
    )
    const updated = await query(
      `SELECT er.*,req.email AS requested_by_email,rev.email AS reviewed_by_email FROM po_edit_requests er JOIN users req ON req.id=er.requested_by LEFT JOIN users rev ON rev.id=er.reviewed_by WHERE er.id=$1`,
      [args.requestId],
    )
    const row = updated.rows[0] as Record<string, unknown>
    return { ...row, changes: JSON.stringify(row['changes']) }
  },

  // ── PO lifecycle mutations ────────────────────────────────────────────────

  submitPOToInventoryCheck: async (_: unknown, args: { id: string; notes?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const isOrganizer = await userIsOrganizerGW(auth.userId, args.id)
    if (!isAdmin && !isOrganizer) throw new Error('Only the PO organizer or an admin can submit to inventory check')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, 'draft', 'inventory_check', 'submit_to_inventory_check', auth, args.notes)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  confirmPOInventoryCheck: async (_: unknown, args: { id: string; lineStockQtys: Array<{ lineId: string; qtyFromStock: number }>; notes?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const hasPos = await userHasPositionGW(auth.userId, auth.companyId, args.id, 'store_keeper')
    if (!isAdmin && !hasPos) throw new Error('store_keeper position required')
    const empId = await getEmployeeIdGW(auth.userId, auth.companyId)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Update qty_from_stock per line
      for (const lsq of args.lineStockQtys) {
        await client.query(
          `UPDATE po_lines SET qty_from_stock=$1, in_stock=($1>=qty_ordered) WHERE id=$2 AND po_id=$3`,
          [lsq.qtyFromStock, lsq.lineId, args.id],
        )
      }

      // Check if ALL lines are fully covered from stock
      const check = await client.query(
        `SELECT COUNT(*) FILTER (WHERE qty_from_stock < qty_ordered) AS needs_purchase FROM po_lines WHERE po_id=$1`,
        [args.id],
      )
      const needsPurchase = parseInt(String(check.rows[0]?.['needs_purchase'] ?? '1')) > 0

      if (needsPurchase) {
        await poTransition(client, args.id, 'inventory_check', 'store_pricing', 'confirm_inventory_check', auth, args.notes)
      } else {
        await poTransition(client, args.id, 'inventory_check', 'ready_to_issue', 'confirm_inventory_check', auth, args.notes)
      }

      if (empId) await client.query(`UPDATE purchase_orders SET store_keeper_id=$1 WHERE id=$2`, [empId, args.id])
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  approveStockIssuance: async (_: unknown, args: { id: string; notes?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const hasPos = await userHasPositionGW(auth.userId, auth.companyId, args.id, 'store_keeper')
    if (!isAdmin && !hasPos) throw new Error('store_keeper or admin required to approve stock issuance')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Get PO + lines
      const poRes = await client.query(
        `SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON v.id=po.vendor_id WHERE po.id=$1`,
        [args.id],
      )
      const po = poRes.rows[0] as Record<string, unknown>
      if (!po) throw new Error('PO not found')

      const linesRes = await client.query(
        `SELECT * FROM po_lines WHERE po_id=$1 AND qty_from_stock > 0`,
        [args.id],
      )

      // Find warehouse location for the company
      const warehouseRes = await client.query(
        `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
        [auth.companyId],
      )
      // Fallback: find any active stock location
      const fallbackRes = await client.query(
        `SELECT id FROM stock_locations WHERE company_id=$1 AND is_active=true LIMIT 1`,
        [auth.companyId],
      )
      const fromLocationId = warehouseRes.rows[0]?.['id'] ?? fallbackRes.rows[0]?.['id']
      if (!fromLocationId) throw new Error('No warehouse location found for company')

      // Find destination location (virtual), fallback to source
      const destRes = await client.query(
        `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual' AND is_active=true LIMIT 1`,
        [auth.companyId],
      )
      const toLocationId = destRes.rows[0]?.['id'] ?? fromLocationId

      for (const line of linesRes.rows as Record<string, unknown>[]) {
        if (!line['product_id']) continue // skip non-product lines

        const qty = parseFloat(String(line['qty_from_stock'] ?? 0))
        if (qty <= 0) continue

        // Create stock move
        await client.query(
          `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,source_type,notes,moved_by)
           VALUES ($1,$2,$3,$4,NOW(),$5,
             (SELECT average_cost FROM stock_balances WHERE product_id=$2 AND location_id=$3 LIMIT 1),
             $5 * COALESCE((SELECT average_cost FROM stock_balances WHERE product_id=$2 AND location_id=$3 LIMIT 1), 0),
             'po_stock_issuance',$6,$7)`,
          [auth.companyId, line['product_id'], fromLocationId, toLocationId, qty, args.id, auth.userId],
        )

        // Update stock balances
        await client.query(
          `UPDATE stock_balances SET qty_on_hand=qty_on_hand-$1, updated_at=NOW() WHERE product_id=$2 AND location_id=$3`,
          [qty, line['product_id'], fromLocationId],
        )
        await client.query(
          `INSERT INTO stock_balances (product_id, location_id, qty_on_hand, qty_reserved, average_cost)
           VALUES ($1,$2,$3,0,0)
           ON CONFLICT (product_id,location_id) DO UPDATE SET qty_on_hand=stock_balances.qty_on_hand+$3, updated_at=NOW()`,
          [line['product_id'], toLocationId, qty],
        )

        // If linked to MO, update mo_consumptions
        if (po['linked_mo_id']) {
          await client.query(
            `UPDATE mo_consumptions SET qty_consumed=LEAST(qty_planned, qty_consumed+$1)
             WHERE mo_id=$2 AND component_product_id=$3`,
            [qty, po['linked_mo_id'], line['product_id']],
          )
        }
      }

      // If linked to MO, check if all components now satisfied → confirm MO
      if (po['linked_mo_id']) {
        const moCheck = await client.query(
          `SELECT COUNT(*) FILTER (WHERE qty_consumed < qty_planned) AS unsatisfied
           FROM mo_consumptions WHERE mo_id=$1`,
          [po['linked_mo_id']],
        )
        if (parseInt(String(moCheck.rows[0]?.['unsatisfied'] ?? '1')) === 0) {
          await client.query(
            `UPDATE manufacturing_orders SET status='confirmed', updated_at=NOW() WHERE id=$1 AND status='draft'`,
            [po['linked_mo_id']],
          )
        }
      }

      await poTransition(client, args.id, 'ready_to_issue', 'completed', 'approve_stock_issuance', auth, args.notes)
      await postPOCompletionJournal(client, args.id, auth.userId)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  submitPOStorePricing: async (
    _: unknown,
    args: { id: string; linePrices?: Array<{ lineId: string; storePrice: number; currencyCode: string; notes?: string }> },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const hasPos = await userHasPositionGW(auth.userId, auth.companyId, args.id, 'store_pricing')
    if (!isAdmin && !hasPos) throw new Error('store_pricing position required')
    const empId = await getEmployeeIdGW(auth.userId, auth.companyId)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const lp of args.linePrices ?? []) {
        await client.query(
          `UPDATE po_lines SET store_price=$1, store_price_currency=$2 WHERE id=$3 AND po_id=$4`,
          [lp.storePrice, lp.currencyCode, lp.lineId, args.id],
        )
      }
      if (empId) await client.query(`UPDATE purchase_orders SET store_pricing_id=$1 WHERE id=$2`, [empId, args.id])
      await poTransition(client, args.id, 'store_pricing', 'market_pricing', 'submit_to_market_pricing', auth)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  submitPOMarketPricing: async (
    _: unknown,
    args: { id: string; vendorId?: string; linePrices?: Array<{ lineId: string; marketPrice: number; vendorQuoteRef?: string; currencyCode: string }> },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const hasPos = await userHasPositionGW(auth.userId, auth.companyId, args.id, 'procurement_officer')
    if (!isAdmin && !hasPos) throw new Error('procurement_officer position required')
    const empId = await getEmployeeIdGW(auth.userId, auth.companyId)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const lp of args.linePrices ?? []) {
        await client.query(
          `UPDATE po_lines SET unit_price=$1, market_price=$1, market_price_currency=$2, vendor_quote_ref=$3, total_price=qty_ordered*$1 WHERE id=$4 AND po_id=$5`,
          [lp.marketPrice, lp.currencyCode, lp.vendorQuoteRef ?? null, lp.lineId, args.id],
        )
      }
      if (args.vendorId) await client.query(`UPDATE purchase_orders SET vendor_id=$1 WHERE id=$2`, [args.vendorId, args.id])
      if (empId) await client.query(`UPDATE purchase_orders SET procurement_officer_id=$1 WHERE id=$2`, [empId, args.id])
      await recalcPO(client, args.id)
      await poTransition(client, args.id, 'market_pricing', 'price_verification', 'submit_to_price_verification', auth)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  submitPOPriceVerification: async (
    _: unknown,
    args: { id: string; verificationNotes?: string; lineAdjustments?: Array<{ lineId: string; verifiedPrice: number; notes?: string }> },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const hasPos = await userHasPositionGW(auth.userId, auth.companyId, args.id, 'procurement_2nd')
    if (!isAdmin && !hasPos) throw new Error('procurement_2nd position required')
    const empId = await getEmployeeIdGW(auth.userId, auth.companyId)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const la of args.lineAdjustments ?? []) {
        await client.query(
          `UPDATE po_lines SET verified_price=$1, verified_price_currency=(SELECT currency_code FROM purchase_orders WHERE id=$3), unit_price=$1, total_price=qty_ordered*$1 WHERE id=$2 AND po_id=$3`,
          [la.verifiedPrice, la.lineId, args.id],
        )
      }
      if (empId) await client.query(`UPDATE purchase_orders SET procurement_2nd_id=$1 WHERE id=$2`, [empId, args.id])
      if (args.lineAdjustments?.length) await recalcPO(client, args.id)
      await poTransition(client, args.id, 'price_verification', 'pending_approval', 'submit_for_approval', auth, args.verificationNotes)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  rejectPOToMarketPricing: async (_: unknown, args: { id: string; reason: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const isDeptHead = await userIsDeptHeadGW(auth.userId, args.id)
    const isApprover = await userIsAssignedApproverGW(auth.userId, args.id)
    if (!isAdmin && !isDeptHead && !isApprover) throw new Error('Not authorized to reject this PO')
    if (!args.reason?.trim()) throw new Error('reason is required')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    const fromStatus = poRow.rows[0].status as POStatus
    if (fromStatus !== 'pending_approval') throw new Error(`Cannot reject to market pricing from status '${fromStatus}'`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, 'pending_approval', 'market_pricing', 'reject_to_market_pricing', auth, args.reason)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  approvePO: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const isDeptHead = await userIsDeptHeadGW(auth.userId, args.id)
    const isApprover = await userIsAssignedApproverGW(auth.userId, args.id)
    if (!isAdmin && !isDeptHead && !isApprover) throw new Error('Not authorized to approve this PO')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    if (poRow.rows[0].status !== 'pending_approval') throw new Error(`Cannot approve PO in status '${poRow.rows[0].status as string}'`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, 'pending_approval', 'approved', 'approve', auth)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  rejectPO: async (_: unknown, args: { id: string; reason: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const isDeptHead = await userIsDeptHeadGW(auth.userId, args.id)
    const isApprover = await userIsAssignedApproverGW(auth.userId, args.id)
    if (!isAdmin && !isDeptHead && !isApprover) throw new Error('Not authorized to reject this PO')
    if (!args.reason?.trim()) throw new Error('reason is required')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    if (poRow.rows[0].status !== 'pending_approval') throw new Error(`Cannot reject PO in status '${poRow.rows[0].status as string}'`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, 'pending_approval', 'rejected', 'reject', auth, args.reason)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  reopenPO: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const isOrganizer = await userIsOrganizerGW(auth.userId, args.id)
    if (!isAdmin && !isOrganizer) throw new Error('Only the PO organizer or an admin can reopen a rejected PO')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    if (poRow.rows[0].status !== 'rejected') throw new Error(`Cannot reopen PO in status '${poRow.rows[0].status as string}'`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, 'rejected', 'draft', 'reopen', auth)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  cancelPO: async (_: unknown, args: { id: string; reason?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const isOrganizer = await userIsOrganizerGW(auth.userId, args.id)
    if (!isAdmin && !isOrganizer) throw new Error('Only the PO organizer or an admin can cancel a PO')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    const fromStatus = poRow.rows[0].status as POStatus
    const cancellable = ['draft','inventory_check','store_pricing','market_pricing','price_verification','pending_approval','approved','ready_to_issue','goods_received','finance_audit','invoiced']
    if (!cancellable.includes(fromStatus)) throw new Error(`Cannot cancel PO in status '${fromStatus}'`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, fromStatus, 'cancelled', 'cancel', auth, args.reason)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  sendPOToAudit: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const isOrganizer = await userIsOrganizerGW(auth.userId, args.id)
    if (!isAdmin && !isOrganizer) throw new Error('Only the PO organizer or an admin can send a PO to finance audit')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    if (poRow.rows[0].status !== 'goods_received') throw new Error(`PO must be in goods_received status to send to audit`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, 'goods_received', 'finance_audit', 'send_to_audit', auth)
      // Reset all line audit statuses to pending
      await client.query(`UPDATE po_lines SET audit_status='pending', audit_note=NULL WHERE po_id=$1`, [args.id])
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  passPOAudit: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    if (!isAdmin && auth.role !== 'finance') throw new Error('Finance or admin role required to pass audit')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    if (poRow.rows[0].status !== 'finance_audit') throw new Error(`PO must be in finance_audit status to pass audit`)
    const flaggedRes = await query(`SELECT COUNT(*) AS c FROM po_lines WHERE po_id=$1 AND audit_status='flagged'`, [args.id])
    const flagged = parseInt(String(flaggedRes.rows[0]?.['c'] ?? '0'))
    if (flagged > 0) throw new Error(`Cannot pass audit: ${flagged} line${flagged > 1 ? 's are' : ' is'} flagged`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, 'finance_audit', 'invoiced', 'pass_audit', auth)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  failPOAudit: async (_: unknown, args: { id: string; notes?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    if (!isAdmin && auth.role !== 'finance') throw new Error('Finance or admin role required to fail audit')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    if (poRow.rows[0].status !== 'finance_audit') throw new Error(`PO must be in finance_audit status`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, 'finance_audit', 'goods_received', 'fail_audit', auth, args.notes)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  setPOLineAuditStatus: async (_: unknown, args: { poId: string; lineId: string; auditStatus: string; auditNote?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    if (!isAdmin && auth.role !== 'finance') throw new Error('Finance or admin role required to audit PO lines')
    const valid = ['pending', 'ok', 'flagged']
    if (!valid.includes(args.auditStatus)) throw new Error(`auditStatus must be one of: ${valid.join(', ')}`)
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.poId])
    if (!poRow.rows[0]) throw new Error('PO not found')
    if (poRow.rows[0].status !== 'finance_audit') throw new Error('PO must be in finance_audit status to audit lines')
    let flaggedByEmail: string | null = null
    if (args.auditStatus === 'flagged') {
      const uRow = await query(`SELECT email FROM users WHERE id=$1`, [auth.userId])
      flaggedByEmail = uRow.rows[0]?.email ?? null
    }
    const flaggedAt = args.auditStatus === 'flagged' ? new Date().toISOString() : null
    const result = await query(
      `UPDATE po_lines
          SET audit_status=$1, audit_note=$2,
              audit_flagged_by_email = COALESCE($5, audit_flagged_by_email),
              audit_flagged_at       = COALESCE($6::timestamptz, audit_flagged_at)
        WHERE id=$3 AND po_id=$4
       RETURNING id, actual_unit_price, qty_received, audit_status, audit_note,
                 audit_flagged_by_email, audit_flagged_at`,
      [args.auditStatus, args.auditNote ?? null, args.lineId, args.poId, flaggedByEmail, flaggedAt],
    )
    if (!result.rows[0]) throw new Error('PO line not found')
    return result.rows[0]
  },

  completePO: async (_: unknown, args: { id: string; receiptNotes?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    if (!isAdmin && auth.role !== 'finance') throw new Error('Finance or admin role required to complete a PO')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    if (poRow.rows[0].status !== 'invoiced') throw new Error(`PO must be in invoiced status to complete. Current: '${poRow.rows[0].status as string}'`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, 'invoiced', 'completed', 'complete', auth, args.receiptNotes)
      await postPOCompletionJournal(client, args.id, auth.userId)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  deletePO: async (_: unknown, args: { id: string; reason?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth as GWAuth
    const isAdmin = isAdminGW(auth.role)
    const isOrganizer = await userIsOrganizerGW(auth.userId, args.id)
    if (!isAdmin && !isOrganizer) throw new Error('Only the PO organizer or an admin can delete a PO')
    const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [args.id])
    if (!poRow.rows[0]) throw new Error('PO not found')
    const fromStatus = poRow.rows[0].status as POStatus
    if (fromStatus !== 'draft' && fromStatus !== 'inventory_check') throw new Error(`Cannot delete PO in status '${fromStatus}'`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await poTransition(client, args.id, fromStatus, 'deleted', 'delete', auth, args.reason)
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return getPOForReturn(args.id)
  },

  // ── PO position management ────────────────────────────────────────────────

  assignPOPosition: async (
    _: unknown,
    args: { input: { employeeId: string; position: string; projectId?: string; departmentId?: string } },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    if (ctx.auth.role !== 'system_admin') throw new Error('system_admin role required')
    const { employeeId, position, projectId, departmentId } = args.input
    if (!projectId && !departmentId) throw new Error('Either projectId or departmentId must be provided')
    const r = await query(
      `INSERT INTO po_position_assignments (company_id, employee_id, position, project_id, department_id, assigned_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ctx.auth.companyId, employeeId, position, projectId ?? null, departmentId ?? null, ctx.auth.userId],
    )
    const row = r.rows[0] as Record<string, unknown>
    const empRes = await query(`SELECT first_name || ' ' || last_name AS name FROM employees WHERE id=$1`, [employeeId])
    const projRes = projectId ? await query(`SELECT name FROM projects WHERE id=$1`, [projectId]) : null
    const deptRes = departmentId ? await query(`SELECT name FROM departments WHERE id=$1`, [departmentId]) : null
    return {
      id: row.id,
      employeeId: row.employee_id,
      employeeName: empRes.rows[0]?.name ?? '',
      position: row.position,
      projectId: row.project_id,
      projectName: projRes?.rows[0]?.name ?? null,
      departmentId: row.department_id,
      departmentName: deptRes?.rows[0]?.name ?? null,
      isActive: row.is_active,
      createdAt: row.created_at,
    }
  },

  removePOPosition: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    if (ctx.auth.role !== 'system_admin') throw new Error('system_admin role required')
    const r = await query(
      `UPDATE po_position_assignments SET is_active=false, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id`,
      [args.id, ctx.auth.companyId],
    )
    if (!r.rows[0]) throw new Error('Position assignment not found')
    return true
  },

  createIntercoStockTransfer: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const i = args.input
    const auth = ctx.auth!
    const lines = (i['lines'] as Array<Record<string, unknown>>) ?? []
    if (lines.length === 0) throw new Error('At least one line is required')

    return withTransaction({ companyId: auth.companyId, userId: auth.userId, role: auth.role }, async (client) => {
      const toCompanyId = String(i['to_company_id'])
      const transferNum = `IST-${Date.now()}`
      const transferDate = String(i['transfer_date'] ?? new Date().toISOString().slice(0, 10))

      // Find or create virtual_out for from_company (for deduction)
      const vOutRes = await client.query(
        `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_out' AND is_active=true LIMIT 1`,
        [auth.companyId],
      )
      const virtualOutId: string = vOutRes.rows[0]?.id ?? (await client.query(
        `INSERT INTO stock_locations (company_id,name,type,is_active) VALUES ($1,'Virtual Consumption','virtual_out',true) RETURNING id`,
        [auth.companyId],
      )).rows[0].id

      // Find or create virtual_in for to_company (for receipt)
      const vInRes = await client.query(
        `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
        [toCompanyId],
      )
      const virtualInId: string = vInRes.rows[0]?.id ?? (await client.query(
        `INSERT INTO stock_locations (company_id,name,type,is_active) VALUES ($1,'Virtual Receipts','virtual_in',true) RETURNING id`,
        [toCompanyId],
      )).rows[0].id

      // Create transfer header
      const transfer = await client.query(
        `INSERT INTO interco_stock_transfers
           (from_company_id,to_company_id,source_type,transfer_number,transfer_date,pricing_method,status,initiated_by,notes)
         VALUES ($1,$2,'manual',$3,$4,'avco','pending',$5,$6) RETURNING *`,
        [auth.companyId, toCompanyId, transferNum, transferDate, auth.userId, i['notes'] ?? null],
      )
      const transferId = transfer.rows[0].id as string

      for (const l of lines) {
        const productId    = String(l['product_id'])
        const fromLocId    = String(l['from_location_id'])
        const toLocId      = String(l['to_location_id'])
        const qty          = Number(l['qty'])

        // Get current avco from stock_balances
        const balRes = await client.query(
          `SELECT average_cost FROM stock_balances WHERE product_id=$1 AND location_id=$2 LIMIT 1`,
          [productId, fromLocId],
        )
        const avco = Number(balRes.rows[0]?.average_cost ?? l['unit_cost'] ?? 0)

        // Stock move: deduct from source (from_company warehouse → virtual_out)
        const fromMove = await client.query(
          `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,source_type,notes,moved_by)
           VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'interco',$8,$9) RETURNING id`,
          [auth.companyId, productId, fromLocId, virtualOutId, qty, avco, qty * avco,
           `Interco transfer ${transferNum} to company ${toCompanyId}`, auth.userId],
        )

        // Stock move: add to destination (virtual_in → to_company warehouse)
        const toMove = await client.query(
          `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,source_type,notes,moved_by)
           VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'interco',$8,$9) RETURNING id`,
          [toCompanyId, productId, virtualInId, toLocId, qty, avco, qty * avco,
           `Interco transfer ${transferNum} from company ${auth.companyId}`, auth.userId],
        )

        await client.query(
          `INSERT INTO interco_stock_transfer_lines
             (transfer_id,product_id,from_location_id,to_location_id,qty,avco_at_transfer,transfer_price,total_transfer_value,currency_code,from_stock_move_id,to_stock_move_id)
           VALUES ($1,$2,$3,$4,$5,$6,$6,$7,'IQD',$8,$9)`,
          [transferId, productId, fromLocId, toLocId, qty, avco, qty * avco,
           fromMove.rows[0].id, toMove.rows[0].id],
        )
      }

      // Mark as posted immediately (manual transfers are instant)
      await client.query(
        `UPDATE interco_stock_transfers SET status='posted', posted_at=NOW() WHERE id=$1`,
        [transferId],
      )

      const result = await client.query(
        `SELECT ist.*, fc.name AS from_company_name, tc.name AS to_company_name
         FROM interco_stock_transfers ist
         JOIN companies fc ON fc.id=ist.from_company_id
         JOIN companies tc ON tc.id=ist.to_company_id
         WHERE ist.id=$1`,
        [transferId],
      )
      const transferLines = await client.query(
        `SELECT istl.*, p.name AS product_name, p.sku FROM interco_stock_transfer_lines istl
         JOIN products p ON p.id=istl.product_id WHERE istl.transfer_id=$1`,
        [transferId],
      )
      const row = result.rows[0] as Record<string, unknown>
      return {
        id: row['id'],
        transferNumber: row['transfer_number'],
        fromCompanyId: row['from_company_id'],
        fromCompanyName: row['from_company_name'],
        toCompanyId: row['to_company_id'],
        toCompanyName: row['to_company_name'],
        pricingMethod: row['pricing_method'],
        status: row['status'],
        transferDate: String(row['transfer_date']),
        fromStockMoveId: row['from_stock_move_id'] ?? null,
        toStockMoveId: row['to_stock_move_id'] ?? null,
        fromJournalId: null,
        toJournalId: null,
        lines: transferLines.rows.map((l: Record<string, unknown>) => ({
          id: l['id'],
          productName: l['product_name'] ?? '',
          sku: l['sku'] ?? null,
          qty: parseFloat(String(l['qty'] ?? 0)),
          avcoAtTransfer: parseFloat(String(l['avco_at_transfer'] ?? 0)),
          transferPrice: parseFloat(String(l['transfer_price'] ?? 0)),
          markupPct: parseFloat(String(l['markup_pct_applied'] ?? 0)),
          totalValue: parseFloat(String(l['total_transfer_value'] ?? 0)),
        })),
      }
    })
  },

  createIntercoTransaction: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const ref = `IT-${Date.now()}`
    const r = await query(
      `INSERT INTO interco_transactions (from_company_id, to_company_id, transaction_type, amount, currency_code, description, reference, from_account_id, to_account_id, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10) RETURNING id, reference, status`,
      [args.input.fromCompanyId, args.input.toCompanyId, args.input.transactionType, args.input.amount, args.input.currencyCode ?? 'IQD', args.input.description ?? null, args.input.reference ?? ref, args.input.fromAccountId ?? null, args.input.toAccountId ?? null, ctx.auth.userId]
    )
    return r.rows[0]
  },

  postIntercoTransaction: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const auth = ctx.auth
    return withTransaction({ companyId: auth.companyId, userId: auth.userId, role: auth.role }, async (client) => {
      const txRes = await client.query(`SELECT * FROM interco_transactions WHERE id=$1 FOR UPDATE`, [args.id])
      const tx = txRes.rows[0] as Record<string, unknown> | undefined
      if (!tx) throw new Error('Transaction not found')
      if (tx['status'] !== 'pending') throw new Error('Only pending transactions can be posted')
      if (!tx['from_company_approved_by'] && !tx['to_company_approved_by']) throw new Error('At least one company must approve before posting')
      if (!tx['from_account_id'] || !tx['to_account_id']) throw new Error('Both companies must select a posting account before posting')

      const fromCompanyId = tx['from_company_id'] as string
      const toCompanyId = tx['to_company_id'] as string
      const amount = parseFloat(String(tx['amount']))
      const fxRate = parseFloat(String(tx['fx_rate'] ?? 1))
      const currencyCode = String(tx['currency_code'] ?? 'IQD')
      const reference = String(tx['reference'] ?? `IT-${args.id}`)

      const receivableRes = await client.query(
        `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND name ILIKE 'Intercompany Receivable' AND is_active=true ORDER BY code ASC LIMIT 1`,
        [fromCompanyId],
      )
      const receivableAccountId = receivableRes.rows[0]?.id as string | undefined
      if (!receivableAccountId) throw new Error('From-company has no Intercompany Receivable account configured')

      const payableRes = await client.query(
        `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND name ILIKE 'Intercompany Payable' AND is_active=true ORDER BY code ASC LIMIT 1`,
        [toCompanyId],
      )
      const payableAccountId = payableRes.rows[0]?.id as string | undefined
      if (!payableAccountId) throw new Error('To-company has no Intercompany Payable account configured')

      const amountCompanyCurrency = amount * fxRate

      const fromJe = await client.query(
        `INSERT INTO journal_entries (company_id,reference,description,entry_date,status,source_type,source_id,created_by,posted_at,posted_by)
         VALUES ($1,$2,$3,CURRENT_DATE,'posted','interco_transaction',$4,$5,NOW(),$5) RETURNING id`,
        [fromCompanyId, `${reference}-FROM`, tx['description'] ?? `Interco transaction ${reference}`, args.id, auth.userId],
      )
      const fromJeId = fromJe.rows[0].id as string
      await client.query(
        `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,currency_code,fx_rate,amount_company_currency)
         VALUES ($1,$2,$3,$4,0,$5,$6,$7)`,
        [fromJeId, receivableAccountId, `Receivable from ${reference}`, amount, currencyCode, fxRate, amountCompanyCurrency],
      )
      await client.query(
        `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,currency_code,fx_rate,amount_company_currency)
         VALUES ($1,$2,$3,0,$4,$5,$6,$7)`,
        [fromJeId, tx['from_account_id'], `Revenue from ${reference}`, amount, currencyCode, fxRate, amountCompanyCurrency],
      )

      const toJe = await client.query(
        `INSERT INTO journal_entries (company_id,reference,description,entry_date,status,source_type,source_id,created_by,posted_at,posted_by)
         VALUES ($1,$2,$3,CURRENT_DATE,'posted','interco_transaction',$4,$5,NOW(),$5) RETURNING id`,
        [toCompanyId, `${reference}-TO`, tx['description'] ?? `Interco transaction ${reference}`, args.id, auth.userId],
      )
      const toJeId = toJe.rows[0].id as string
      const linkedMrRes = await client.query(
        `SELECT p.analytic_account_id FROM manufacturing_requests mr
         JOIN projects p ON p.id = mr.project_id
         WHERE mr.interco_transaction_id = $1`,
        [args.id],
      )
      const projectAnalyticAccountId = linkedMrRes.rows[0]?.analytic_account_id as string | undefined ?? null
      await client.query(
        `INSERT INTO journal_lines (journal_entry_id,account_id,analytic_account_id,description,debit,credit,currency_code,fx_rate,amount_company_currency)
         VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8)`,
        [toJeId, tx['to_account_id'], projectAnalyticAccountId, `Expense from ${reference}`, amount, currencyCode, fxRate, amountCompanyCurrency],
      )
      await client.query(
        `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,currency_code,fx_rate,amount_company_currency)
         VALUES ($1,$2,$3,0,$4,$5,$6,$7)`,
        [toJeId, payableAccountId, `Payable from ${reference}`, amount, currencyCode, fxRate, amountCompanyCurrency],
      )

      const r = await client.query(
        `UPDATE interco_transactions SET status='posted', posted_at=NOW(), posted_by=$2, from_journal_entry_id=$3, to_journal_entry_id=$4 WHERE id=$1 RETURNING *`,
        [args.id, auth.userId, fromJeId, toJeId],
      )
      const row = r.rows[0] as Record<string, unknown>
      const companies = await client.query(`SELECT fc.name as from_name, tc.name as to_name FROM companies fc, companies tc WHERE fc.id=$1 AND tc.id=$2`, [fromCompanyId, toCompanyId])
      const comp = companies.rows[0] as { from_name: string; to_name: string } | undefined
      return { ...row, fromCompanyName: comp?.from_name ?? '', toCompanyName: comp?.to_name ?? '', transactionType: row.transaction_type, currencyCode: row.currency_code, fromCompanyId: row.from_company_id, toCompanyId: row.to_company_id, postedAt: row.posted_at, postedBy: row.posted_by, fromJournalId: row.from_journal_entry_id, toJournalId: row.to_journal_entry_id, createdAt: row.created_at, fromCompanyApprovedBy: row.from_company_approved_by ?? null, fromCompanyApprovedAt: row.from_company_approved_at ?? null, toCompanyApprovedBy: row.to_company_approved_by ?? null, toCompanyApprovedAt: row.to_company_approved_at ?? null }
    })
  },

  setIntercoTransactionAccount: async (_: unknown, args: { id: string; accountId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const txResult = await query(`SELECT * FROM interco_transactions WHERE id=$1 AND (from_company_id=$2 OR to_company_id=$2)`, [args.id, ctx.auth.companyId])
    const tx = txResult.rows[0] as Record<string, unknown> | undefined
    if (!tx) throw new Error('Transaction not found')
    if (tx['status'] !== 'pending') throw new Error('Account can only be set while transaction is pending')
    const isFrom = tx['from_company_id'] === ctx.auth.companyId
    const acctCheck = await query(`SELECT id FROM chart_of_accounts WHERE id=$1 AND company_id=$2`, [args.accountId, ctx.auth.companyId])
    if (!acctCheck.rows[0]) throw new Error('Account does not belong to your company')
    const updateSql = isFrom
      ? `UPDATE interco_transactions SET from_account_id=$2 WHERE id=$1 RETURNING *`
      : `UPDATE interco_transactions SET to_account_id=$2 WHERE id=$1 RETURNING *`
    const r = await query(updateSql, [args.id, args.accountId])
    const row = r.rows[0] as Record<string, unknown>
    const companies = await query(`SELECT fc.name as from_name, tc.name as to_name FROM companies fc, companies tc WHERE fc.id=$1 AND tc.id=$2`, [row['from_company_id'], row['to_company_id']])
    const comp = companies.rows[0] as { from_name: string; to_name: string } | undefined
    const accts = await query(`SELECT fa.name as from_account_name, ta.name as to_account_name FROM chart_of_accounts fa, chart_of_accounts ta WHERE fa.id=$1 AND ta.id=$2`, [row['from_account_id'] ?? null, row['to_account_id'] ?? null])
    const acctNames = accts.rows[0] as { from_account_name: string | null; to_account_name: string | null } | undefined
    return { ...row, fromCompanyName: comp?.from_name ?? '', toCompanyName: comp?.to_name ?? '', transactionType: row['transaction_type'], currencyCode: row['currency_code'], fromCompanyId: row['from_company_id'], toCompanyId: row['to_company_id'], fromAccountId: row['from_account_id'] ?? null, fromAccountName: acctNames?.from_account_name ?? null, toAccountId: row['to_account_id'] ?? null, toAccountName: acctNames?.to_account_name ?? null, postedAt: row['posted_at'], postedBy: row['posted_by'], fromJournalId: row['from_journal_entry_id'], toJournalId: row['to_journal_entry_id'], createdAt: row['created_at'], fromCompanyApprovedBy: row['from_company_approved_by'] ?? null, fromCompanyApprovedAt: row['from_company_approved_at'] ?? null, toCompanyApprovedBy: row['to_company_approved_by'] ?? null, toCompanyApprovedAt: row['to_company_approved_at'] ?? null }
  },

  cancelIntercoTransaction: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`UPDATE interco_transactions SET status='cancelled' WHERE id=$1 AND status='pending' RETURNING *`, [args.id])
    if (!r.rows[0]) throw new Error('Cannot cancel: not found or already posted')
    const row = r.rows[0] as Record<string, unknown>
    return { ...row, fromCompanyName: '', toCompanyName: '', transactionType: row.transaction_type, currencyCode: row.currency_code, fromCompanyId: row.from_company_id, toCompanyId: row.to_company_id, postedAt: row.posted_at, postedBy: row.posted_by, fromJournalId: row.from_journal_id, toJournalId: row.to_journal_id, createdAt: row.created_at, fromCompanyApprovedBy: row.from_company_approved_by ?? null, fromCompanyApprovedAt: row.from_company_approved_at ?? null, toCompanyApprovedBy: row.to_company_approved_by ?? null, toCompanyApprovedAt: row.to_company_approved_at ?? null }
  },

  approveIntercoCompany: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const txResult = await query(`SELECT * FROM interco_transactions WHERE id=$1 AND (from_company_id=$2 OR to_company_id=$2)`, [args.id, ctx.auth.companyId])
    const tx = txResult.rows[0] as Record<string, unknown> | undefined
    if (!tx) throw new Error('Transaction not found')
    if (tx['status'] === 'posted') throw new Error('Transaction already posted')
    if (tx['status'] === 'cancelled') throw new Error('Transaction is cancelled')
    const isFrom = tx['from_company_id'] === ctx.auth.companyId
    const updateSql = isFrom
      ? `UPDATE interco_transactions SET from_company_approved_by=$2, from_company_approved_at=NOW() WHERE id=$1 RETURNING *`
      : `UPDATE interco_transactions SET to_company_approved_by=$2, to_company_approved_at=NOW() WHERE id=$1 RETURNING *`
    const r = await query(updateSql, [args.id, ctx.auth.userId])
    const row = r.rows[0] as Record<string, unknown>
    const companies = await query(`SELECT fc.name as from_name, tc.name as to_name FROM companies fc, companies tc WHERE fc.id=$1 AND tc.id=$2`, [row['from_company_id'], row['to_company_id']])
    const comp = companies.rows[0] as { from_name: string; to_name: string } | undefined
    return { ...row, fromCompanyName: comp?.from_name ?? '', toCompanyName: comp?.to_name ?? '', transactionType: row['transaction_type'], currencyCode: row['currency_code'], fromCompanyId: row['from_company_id'], toCompanyId: row['to_company_id'], postedAt: row['posted_at'], postedBy: row['posted_by'], fromJournalId: row['from_journal_entry_id'], toJournalId: row['to_journal_entry_id'], createdAt: row['created_at'], fromCompanyApprovedBy: row['from_company_approved_by'] ?? null, fromCompanyApprovedAt: row['from_company_approved_at'] ?? null, toCompanyApprovedBy: row['to_company_approved_by'] ?? null, toCompanyApprovedAt: row['to_company_approved_at'] ?? null }
  },

  updateIntercoPricing: async (_: unknown, args: { companyId: string; input: { method: string; costPlusMarkupPct?: number; notes?: string } }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(
      `INSERT INTO interco_pricing_configs (company_id, method, cost_plus_markup_pct, updated_at, updated_by)
       VALUES ($1,$2,$3,NOW(),$4)
       ON CONFLICT (company_id) DO UPDATE SET method=$2, cost_plus_markup_pct=$3, updated_at=NOW(), updated_by=$4`,
      [args.companyId, args.input.method, args.input.costPlusMarkupPct ?? null, ctx.auth.userId]
    )
    const r = await query(`SELECT ipc.*, c.name as company_name FROM interco_pricing_configs ipc JOIN companies c ON c.id=ipc.company_id WHERE ipc.company_id=$1`, [args.companyId])
    const row = r.rows[0] as Record<string, unknown>
    return { companyId: row.company_id, companyName: row.company_name, method: row.method, costPlusMarkupPct: row.cost_plus_markup_pct ? parseFloat(String(row.cost_plus_markup_pct)) : null, updatedAt: row.updated_at, updatedByEmail: row.updated_by_email }
  },

  addUserRole: async (_: unknown, args: { userId: string; input: { companyId: string; module: string; role: string; isActive?: boolean } }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`INSERT INTO user_company_roles (user_id, company_id, module, role, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id, company_id, module, role, is_active`, [args.userId, args.input.companyId, args.input.module, args.input.role, args.input.isActive ?? true])
    const cn = await query(`SELECT name FROM companies WHERE id=$1`, [args.input.companyId])
    return { ...r.rows[0], companyName: cn.rows[0]?.name ?? '' }
  },

  updateUserRole: async (_: unknown, args: { roleId: string; input: { isActive?: boolean } }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`UPDATE user_company_roles SET is_active=$2 WHERE id=$1 RETURNING id, company_id, module, role, is_active`, [args.roleId, args.input.isActive])
    return { ...r.rows[0], companyName: '' }
  },

  removeUserRole: async (_: unknown, args: { roleId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`DELETE FROM user_company_roles WHERE id=$1`, [args.roleId])
    return true
  },

  deactivateUser: async (_: unknown, args: { userId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`UPDATE users SET is_active=false WHERE id=$1 RETURNING *`, [args.userId])
    const row = r.rows[0] as Record<string, unknown>
    return { id: row.id, email: row.email, isActive: false, mfaEnabled: row.mfa_enabled, lastLogin: row.last_login, failedLoginAttempts: row.failed_login_attempts ?? 0, lockedUntil: row.locked_until, createdAt: row.created_at, roles: [] }
  },

  unlockUser: async (_: unknown, args: { userId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE id=$1 RETURNING *`, [args.userId])
    const row = r.rows[0] as Record<string, unknown>
    return { id: row.id, email: row.email, isActive: row.is_active, mfaEnabled: row.mfa_enabled, lastLogin: row.last_login, failedLoginAttempts: 0, lockedUntil: null, createdAt: row.created_at, roles: [] }
  },

  resetUserMFA: async (_: unknown, args: { userId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`UPDATE users SET mfa_enabled=false, mfa_secret=NULL WHERE id=$1`, [args.userId])
    return true
  },

  revokeUserSession: async (_: unknown, args: { sessionId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`DELETE FROM sessions WHERE id=$1`, [args.sessionId])
    return true
  },

  revokeAllUserSessions: async (_: unknown, args: { userId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`DELETE FROM sessions WHERE user_id=$1 AND session_id != $2`, [args.userId, ctx.auth.sessionId])
    return true
  },

  retryOutboxEvent: async (_: unknown, args: { eventId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`UPDATE service_outbox SET status='pending', next_retry_at=NOW() WHERE id=$1`, [args.eventId])
    return true
  },

  retryDLQEntry: async (_: unknown, args: { dlqId: string; notes?: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`UPDATE outbox_dead_letter_queue SET status='retrying', reviewed_by=$2, review_notes=$3 WHERE id=$1`, [args.dlqId, ctx.auth.userId, args.notes ?? null])
    return true
  },

  dismissDLQEntry: async (_: unknown, args: { dlqId: string; notes: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`UPDATE outbox_dead_letter_queue SET status='dismissed', reviewed_by=$2, review_notes=$3 WHERE id=$1`, [args.dlqId, ctx.auth.userId, args.notes])
    return true
  },

  resetStuckEvents: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`UPDATE service_outbox SET status='pending' WHERE status='processing' AND updated_at < NOW() - INTERVAL '10 minutes' RETURNING id`, [])
    return r.rows.length
  },

  updateOutboxEventConfig: async (_: unknown, args: { eventType: string; input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const updates: string[] = []
    const params: unknown[] = [args.eventType]
    let idx = 2
    if (args.input['maxAttempts'] !== undefined) { updates.push(`max_attempts=$${idx++}`); params.push(args.input['maxAttempts']) }
    if (args.input['initialRetryDelaySeconds'] !== undefined) { updates.push(`initial_retry_delay_seconds=$${idx++}`); params.push(args.input['initialRetryDelaySeconds']) }
    if (args.input['backoffMultiplier'] !== undefined) { updates.push(`backoff_multiplier=$${idx++}`); params.push(args.input['backoffMultiplier']) }
    if (args.input['maxRetryDelaySeconds'] !== undefined) { updates.push(`max_retry_delay_seconds=$${idx++}`); params.push(args.input['maxRetryDelaySeconds']) }
    if (args.input['dlqPriority'] !== undefined) { updates.push(`dlq_priority=$${idx++}`); params.push(args.input['dlqPriority']) }
    if (args.input['alertOnDlq'] !== undefined) { updates.push(`alert_on_dlq=$${idx++}`); params.push(args.input['alertOnDlq']) }
    if (updates.length === 0) throw new Error('No fields to update')
    const r = await query(`UPDATE outbox_event_configs SET ${updates.join(',')} WHERE event_type=$1 RETURNING *`, params)
    const row = r.rows[0] as Record<string, unknown>
    return { eventType: row['event_type'], service: row['service'], maxAttempts: row['max_attempts'], initialRetryDelaySeconds: row['initial_retry_delay_seconds'], backoffMultiplier: parseFloat(String(row['backoff_multiplier'])), maxRetryDelaySeconds: row['max_retry_delay_seconds'], dlqPriority: row['dlq_priority'], alertOnDlq: row['alert_on_dlq'] }
  },

  updatePassword: async (_: unknown, args: { currentPassword: string; newPassword: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id=$1`, [ctx.auth.userId])
    const row = r.rows[0]
    if (!row) throw new Error('User not found')
    const valid = await verifyPassword(args.currentPassword, row.password_hash)
    if (!valid) throw new Error('Current password is incorrect')
    const newHash = await hashPassword(args.newPassword)
    await query(`UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1`, [ctx.auth.userId, newHash])
    return true
  },

  updatePreferences: async (_: unknown, args: { input: { themePreference?: string; dateFormat?: string; numberFormat?: string; notificationPreferences?: unknown } }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(
      `UPDATE users SET theme_preference=COALESCE($2, theme_preference), date_format=COALESCE($3, date_format), number_format=COALESCE($4, number_format), notification_preferences=COALESCE($5::jsonb, notification_preferences) WHERE id=$1`,
      [ctx.auth.userId, args.input.themePreference ?? null, args.input.dateFormat ?? null, args.input.numberFormat ?? null, args.input.notificationPreferences ? JSON.stringify(args.input.notificationPreferences) : null]
    )
    return { themePreference: args.input.themePreference, dateFormat: args.input.dateFormat, numberFormat: args.input.numberFormat, notificationPreferences: args.input.notificationPreferences }
  },

  enableMFA: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const userRes = await query<{ email: string }>(`SELECT email FROM users WHERE id=$1`, [ctx.auth.userId])
    const user = userRes.rows[0]
    if (!user) throw new Error('User not found')
    const { secret, otpauthUrl } = generateMFASecret(user.email)
    const encryptedSecret = encrypt(secret)
    await query(`UPDATE users SET mfa_secret=$2, updated_at=NOW() WHERE id=$1`, [ctx.auth.userId, encryptedSecret])
    return { secret, otpauthUrl }
  },

  confirmMFA: async (_: unknown, args: { totpCode: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const userRes = await query<{ mfa_secret: string | null }>(`SELECT mfa_secret FROM users WHERE id=$1`, [ctx.auth.userId])
    const user = userRes.rows[0]
    if (!user?.mfa_secret) throw new Error('MFA setup not initiated — call enableMFA first')
    const decryptedSecret = decrypt(user.mfa_secret)
    if (!verifyMFAToken(decryptedSecret, args.totpCode)) throw new Error('Invalid TOTP code')
    await query(`UPDATE users SET mfa_enabled=true, updated_at=NOW() WHERE id=$1`, [ctx.auth.userId])
    return true
  },

  disableMFA: async (_: unknown, args: { password: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const userRes = await query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id=$1`, [ctx.auth.userId])
    const user = userRes.rows[0]
    if (!user) throw new Error('User not found')
    const valid = await verifyPassword(args.password, user.password_hash)
    if (!valid) throw new Error('Password is incorrect')
    await query(`UPDATE users SET mfa_enabled=false, mfa_secret=NULL, updated_at=NOW() WHERE id=$1`, [ctx.auth.userId])
    return true
  },

  revokeMySession: async (_: unknown, args: { sessionId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`DELETE FROM sessions WHERE id=$1 AND user_id=$2`, [args.sessionId, ctx.auth.userId])
    return true
  },

  revokeAllMySessions: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`DELETE FROM sessions WHERE user_id=$1 AND session_id != $2`, [ctx.auth.userId, ctx.auth.sessionId])
    return true
  },

  // Admin — Company mutations
  createCompany: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const i = args.input
    const r = await query(
      `INSERT INTO companies (name, legal_name, country_code, city, address, phone, email, website,
        registration_number, vat_number, currency_code, bank_name, bank_account, bank_iban, bank_swift,
        interco_transfer_pricing_method, is_active, setup_completed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,false)
       RETURNING *`,
      [i.name, i.legal_name ?? i.name, i.country_code ?? null, i.city ?? null, i.address ?? null,
       i.phone ?? null, i.email ?? null, i.website ?? null, i.registration_number ?? null,
       i.vat_number ?? null, i.functional_currency ?? i.currencyCode ?? 'IQD',
       i.bank_name ?? null, i.bank_account ?? null, i.bank_iban ?? null, i.bank_swift ?? null,
       i.interco_transfer_pricing_method ?? null],
    )
    const company = r.rows[0] as Record<string, unknown>
    // Seed config row
    await query(`INSERT INTO system_configuration (company_id) VALUES ($1) ON CONFLICT DO NOTHING`, [company.id])
    return companyRowToDetail(company)
  },

  updateCompany: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const i = args.input
    const fields: string[] = []; const params: unknown[] = []; let idx = 1
    const map: Record<string, string> = {
      name: 'name', legal_name: 'legal_name', country_code: 'country_code', city: 'city',
      address: 'address', phone: 'phone', email: 'email', website: 'website',
      registration_number: 'registration_number', vat_number: 'vat_number',
      bank_name: 'bank_name', bank_account: 'bank_account', bank_iban: 'bank_iban', bank_swift: 'bank_swift',
      interco_transfer_pricing_method: 'interco_transfer_pricing_method',
      interco_cost_plus_markup_pct: 'interco_cost_plus_markup_pct', is_active: 'is_active',
      stamp_image: 'stamp_image',
      letterhead_image: 'letterhead_image',
      pv_template_image: 'pv_template_image',
      journal_template_image: 'journal_template_image',
    }
    for (const [key, col] of Object.entries(map)) {
      if (i[key] !== undefined) { fields.push(`${col}=$${idx++}`); params.push(i[key]) }
    }
    if (fields.length === 0) throw new Error('No fields to update')
    fields.push(`updated_at=NOW()`)
    params.push(args.id)
    await query(`UPDATE companies SET ${fields.join(',')} WHERE id=$${idx}`, params)
    const r = await query(
      `SELECT c.*, sc.fiscal_year_start_month, sc.default_currency,
              (SELECT COUNT(*) FROM user_company_roles ucr WHERE ucr.company_id=c.id AND ucr.is_active=true) as user_count
       FROM companies c LEFT JOIN system_configuration sc ON sc.company_id=c.id WHERE c.id=$1`,
      [args.id],
    )
    return companyRowToDetail(r.rows[0] as Record<string, unknown>)
  },

  updateCompanyConfiguration: async (_: unknown, args: { companyId: string; input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const i = args.input
    const fields: string[] = []; const params: unknown[] = []; let idx = 1
    const map: Record<string, string> = {
      fiscal_year_start_month: 'fiscal_year_start_month', fiscal_year_start_day: 'fiscal_year_start_day',
      default_currency: 'default_currency', default_payment_terms_days: 'default_payment_terms_days',
      default_po_currency: 'default_po_currency', income_tax_enabled: 'income_tax_enabled',
      social_security_rate: 'social_security_rate', employer_social_security_rate: 'employer_social_security_rate',
      default_wht_rate: 'default_wht_rate',
      company_email_from: 'company_email_from', company_email_signature: 'company_email_signature',
    }
    for (const [key, col] of Object.entries(map)) {
      if (i[key] !== undefined) { fields.push(`${col}=$${idx++}`); params.push(i[key]) }
    }
    fields.push('updated_at=NOW()')
    params.push(args.companyId)
    await query(
      `INSERT INTO system_configuration (company_id) VALUES ($${idx}) ON CONFLICT (company_id) DO UPDATE SET ${fields.join(',')}`,
      params,
    )
    const r = await query(`SELECT * FROM system_configuration WHERE company_id=$1`, [args.companyId])
    const row = r.rows[0] as Record<string, unknown>
    return {
      companyId: row.company_id, fiscalYearStartMonth: row.fiscal_year_start_month, fiscalYearStartDay: row.fiscal_year_start_day,
      defaultCurrency: row.default_currency, defaultPaymentTermsDays: row.default_payment_terms_days,
      defaultPOCurrency: row.default_po_currency, incomeTaxEnabled: row.income_tax_enabled,
      socialSecurityRate: parseFloat(String(row.social_security_rate)), employerSocialSecurityRate: parseFloat(String(row.employer_social_security_rate)),
      defaultWHTRate: parseFloat(String(row.default_wht_rate ?? 0.03)),
      companyEmailFrom: row.company_email_from, companyEmailSignature: row.company_email_signature, setupCompleted: row.setup_completed ?? false,
    }
  },

  assignRole: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const i = args.input
    const r = await query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module, is_active)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (user_id, company_id, role, COALESCE(module, '')) DO UPDATE SET is_active=true, updated_at=NOW()
       RETURNING *`,
      [i.user_id, i.company_id, i.role, i.module ?? null],
    )
    const cn = await query(`SELECT name FROM companies WHERE id=$1`, [i.company_id])
    const row = r.rows[0] as Record<string, unknown>
    return { id: row.id, companyId: row.company_id, companyName: cn.rows[0]?.name ?? '', module: row.module ?? '', role: row.role, isActive: row.is_active }
  },

  toggleRole: async (_: unknown, args: { roleId: string; isActive: boolean }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(
      `UPDATE user_company_roles SET is_active=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [args.roleId, args.isActive],
    )
    if (!r.rows[0]) throw new Error('Role not found')
    const row = r.rows[0] as Record<string, unknown>
    const cn = await query(`SELECT name FROM companies WHERE id=$1`, [row.company_id])
    return { id: row.id, companyId: row.company_id, companyName: cn.rows[0]?.name ?? '', module: row.module ?? '', role: row.role, isActive: row.is_active }
  },

  deleteRole: async (_: unknown, args: { roleId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    await query(`DELETE FROM user_company_roles WHERE id=$1`, [args.roleId])
    return true
  },

  // Admin — User mutations
  createUser: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const i = args.input
    const { hashPassword } = await import('@fnc-erp/auth')
    const pw = String(i.password ?? Math.random().toString(36).slice(2) + 'Aa1!')
    const hash = await hashPassword(pw)
    const r = await query(
      `INSERT INTO users (email, password_hash, is_active) VALUES ($1,$2,true) RETURNING id, email, is_active, mfa_enabled, created_at`,
      [String(i.email).toLowerCase(), hash],
    )
    const row = r.rows[0] as Record<string, unknown>
    if (i.company_id && i.role) {
      await query(
        `INSERT INTO user_company_roles (user_id, company_id, role, module, is_active) VALUES ($1,$2,$3,$4,true)`,
        [row.id, i.company_id, i.role, i.module ?? null],
      )
    }
    return { id: row.id, email: row.email, isActive: row.is_active, mfaEnabled: row.mfa_enabled, lastLogin: null, failedLoginAttempts: 0, lockedUntil: null, createdAt: row.created_at, roles: [] }
  },

  inviteUser: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const i = args.input
    const token = `inv_${crypto.randomUUID().replace(/-/g, '')}`
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const r = await query(
      `INSERT INTO user_invitations (email, invited_by, company_id, role, module, token, expires_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [String(i.email).toLowerCase(), ctx.auth.userId, i.company_id ?? null, i.role ?? null, i.module ?? null, token, expiresAt],
    )
    const row = r.rows[0] as Record<string, unknown>

    // Look up inviter email and company name for the email body
    const [inviterR, companyR] = await Promise.all([
      query(`SELECT email FROM users WHERE id=$1`, [ctx.auth.userId]),
      i.company_id ? query(`SELECT name FROM companies WHERE id=$1`, [i.company_id]) : Promise.resolve({ rows: [] }),
    ])
    const inviterEmail = String((inviterR.rows[0] as Record<string, unknown>)?.['email'] ?? '')
    const companyName = String((companyR.rows[0] as Record<string, unknown>)?.['name'] ?? 'FNC ERP')

    await query(
      `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications','USER_INVITATION_EMAIL',$1::jsonb)`,
      [JSON.stringify({
        email: String(i.email).toLowerCase(),
        inviteUrl: `${env.FRONTEND_URL}/accept-invitation?token=${token}`,
        invitedByName: inviterEmail,
        companyName,
      })],
    )

    return { id: row.id, email: row.email, invitedByEmail: ctx.auth.userId, companyId: row.company_id, companyName, role: row.role, module: row.module, status: row.status, expiresAt: row.expires_at, acceptedAt: null, createdAt: row.created_at }
  },

  activateUser: async (_: unknown, args: { userId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`UPDATE users SET is_active=true, updated_at=NOW() WHERE id=$1 RETURNING *`, [args.userId])
    if (!r.rows[0]) throw new Error('User not found')
    const row = r.rows[0] as Record<string, unknown>
    return { id: row.id, email: row.email, isActive: row.is_active, mfaEnabled: row.mfa_enabled, lastLogin: row.last_login, failedLoginAttempts: row.failed_login_attempts ?? 0, lockedUntil: row.locked_until, createdAt: row.created_at, roles: [] }
  },
}

// Merge phase5 resolvers into main resolvers object
Object.assign(resolvers.Query, phase5QueryResolvers)
Object.assign(resolvers.Mutation, phase5MutationResolvers)

// ── Rental type resolvers (nested fields) ────────────────────────────────────
Object.assign(resolvers, {
  EquipmentAsset: {
    usageLogs: async (parent: Record<string, unknown>) => {
      const r = await query(
        `SELECT *, log_date AS usage_date, hours_operated AS hours_used, odometer_km AS mileage_km
         FROM equipment_usage_logs WHERE asset_id=$1 ORDER BY log_date DESC LIMIT 100`,
        [parent['id']],
      )
      return r.rows.map((row: Record<string, unknown>) => ({
        ...row,
        usage_date: row['log_date'],
        hours_used: parseFloat(String(row['hours_operated'] ?? 0)),
        mileage_km: row['odometer_km'] !== null ? parseFloat(String(row['odometer_km'])) : null,
        operator_name: row['operator_name'] ?? '',
      }))
    },
    maintenanceSchedules: async (parent: Record<string, unknown>) => {
      const r = await query(
        `SELECT * FROM maintenance_schedules WHERE asset_id=$1 ORDER BY COALESCE(scheduled_date, created_at::DATE) ASC`,
        [parent['id']],
      )
      return r.rows
    },
    conditionReports: async (parent: Record<string, unknown>) => {
      const r = await query(
        `SELECT cr.*, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS created_by_email
         FROM condition_reports cr
         LEFT JOIN users u ON u.id=cr.created_by
         WHERE cr.asset_id=$1 ORDER BY cr.created_at DESC LIMIT 50`,
        [parent['id']],
      )
      return r.rows
    },
  },

  RentalContract: {
    usageLogs: async (parent: Record<string, unknown>) => {
      if (!parent['id']) return []
      const r = await query(
        `SELECT *, log_date AS usage_date, hours_operated AS hours_used, odometer_km AS mileage_km
         FROM equipment_usage_logs WHERE contract_id=$1 ORDER BY log_date DESC`,
        [parent['id']],
      )
      return r.rows.map((row: Record<string, unknown>) => ({
        ...row,
        usage_date: row['log_date'],
        hours_used: parseFloat(String(row['hours_operated'] ?? 0)),
        mileage_km: row['odometer_km'] !== null ? parseFloat(String(row['odometer_km'])) : null,
        operator_name: row['operator_name'] ?? '',
      }))
    },
    invoices: async (parent: Record<string, unknown>) => {
      if (!parent['id']) return []
      const r = await query(
        `SELECT * FROM rental_invoices WHERE contract_id=$1 ORDER BY billing_period_start DESC`,
        [parent['id']],
      )
      return r.rows.map((row: Record<string, unknown>) => ({
        ...row,
        whtApplies: Boolean(row['wht_applies'] ?? false),
        whtScenario: row['wht_scenario'] ?? null,
        whtRate: parseFloat(String(row['wht_rate'] ?? 0)),
        whtAmount: parseFloat(String(row['wht_amount'] ?? 0)),
      }))
    },
  },
})

// ── Company branches + bank accounts ────────────────────────────────────────
function branchRow(r: Record<string, unknown>) {
  return {
    id: r['id'], companyId: r['company_id'], name: r['name'],
    address: r['address'] ?? null, city: r['city'] ?? null,
    countryCode: r['country_code'], phone: r['phone'] ?? null,
    isActive: r['is_active'], createdAt: r['created_at'],
  }
}

function bankRow(r: Record<string, unknown>) {
  return {
    id: r['id'], accountName: r['account_name'], bankName: r['bank_name'],
    beneficiaryName: r['beneficiary_name'] ?? null,
    accountNumber: r['account_number'] ?? null, iban: r['iban'] ?? null,
    branchCode: r['branch_code'] ?? null, bankAddress: r['bank_address'] ?? null,
    intermediaryBankName: r['intermediary_bank_name'] ?? null,
    intermediarySwift: r['intermediary_swift'] ?? null,
    intermediaryCountry: r['intermediary_country'] ?? null,
    swift: r['swift'] ?? null, currencyCode: r['currency_code'],
    isActive: r['is_active'], createdAt: r['created_at'],
  }
}

Object.assign(resolvers.Query, {
  companyBranches: async (_: unknown, args: { companyId: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT * FROM company_branches WHERE company_id=$1 ORDER BY name`, [args.companyId])
    return r.rows.map((row: Record<string, unknown>) => branchRow(row))
  },
  bankAccounts: async (_: unknown, __: unknown, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const r = await query(`SELECT * FROM bank_accounts ORDER BY account_name`)
    return r.rows.map((row: Record<string, unknown>) => bankRow(row))
  },
})

Object.assign(resolvers.Mutation, {
  createCompanyBranch: async (_: unknown, args: { companyId: string; input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Unauthorized')
    const i = args.input
    const r = await query(
      `INSERT INTO company_branches (company_id, name, address, city, country_code, phone, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [args.companyId, i['name'], i['address'] ?? null, i['city'] ?? null, i['countryCode'] ?? 'IQ', i['phone'] ?? null, i['isActive'] ?? true],
    )
    return branchRow(r.rows[0] as Record<string, unknown>)
  },

  updateCompanyBranch: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Unauthorized')
    const i = args.input
    const r = await query(
      `UPDATE company_branches SET name=COALESCE($2,name), address=COALESCE($3,address), city=COALESCE($4,city),
       country_code=COALESCE($5,country_code), phone=COALESCE($6,phone),
       is_active=COALESCE($7,is_active), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [args.id, i['name'] ?? null, i['address'] ?? null, i['city'] ?? null, i['countryCode'] ?? null, i['phone'] ?? null, i['isActive'] ?? null],
    )
    if (!r.rows[0]) throw new Error('Branch not found')
    return branchRow(r.rows[0] as Record<string, unknown>)
  },

  deleteCompanyBranch: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Unauthorized')
    await query(`DELETE FROM company_branches WHERE id=$1`, [args.id])
    return true
  },

  createBankAccount: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Unauthorized')
    const i = args.input
    const r = await query(
      `INSERT INTO bank_accounts (account_name, bank_name, beneficiary_name, account_number, iban, swift, branch_code, bank_address, intermediary_bank_name, intermediary_swift, intermediary_country, currency_code, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [i['accountName'], i['bankName'], i['beneficiaryName'] ?? null, i['accountNumber'] ?? null, i['iban'] ?? null, i['swift'] ?? null, i['branchCode'] ?? null, i['bankAddress'] ?? null, i['intermediaryBankName'] ?? null, i['intermediarySwift'] ?? null, i['intermediaryCountry'] ?? null, i['currencyCode'] ?? 'IQD', i['isActive'] ?? true],
    )
    return bankRow(r.rows[0] as Record<string, unknown>)
  },

  updateBankAccount: async (_: unknown, args: { id: string; input: Record<string, unknown> }, ctx: GQLContext) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Unauthorized')
    const i = args.input
    const r = await query(
      `UPDATE bank_accounts SET account_name=COALESCE($2,account_name), bank_name=COALESCE($3,bank_name),
       beneficiary_name=$4, account_number=$5, iban=$6, swift=$7,
       branch_code=$8, bank_address=$9, intermediary_bank_name=$10, intermediary_swift=$11, intermediary_country=$12,
       currency_code=COALESCE($13,currency_code), is_active=COALESCE($14,is_active), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [args.id, i['accountName'] ?? null, i['bankName'] ?? null, i['beneficiaryName'] ?? null, i['accountNumber'] ?? null, i['iban'] ?? null, i['swift'] ?? null, i['branchCode'] ?? null, i['bankAddress'] ?? null, i['intermediaryBankName'] ?? null, i['intermediarySwift'] ?? null, i['intermediaryCountry'] ?? null, i['currencyCode'] ?? null, i['isActive'] ?? null],
    )
    if (!r.rows[0]) throw new Error('Bank account not found')
    return bankRow(r.rows[0] as Record<string, unknown>)
  },

  deleteBankAccount: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('Unauthorized')
    await query(`DELETE FROM bank_accounts WHERE id=$1`, [args.id])
    return true
  },

  setInvoiceBankAccount: async (_: unknown, args: { invoiceId: string; bankAccountId: string | null }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const inv = await query(`SELECT status FROM project_invoices WHERE id=$1 AND company_id=$2`, [args.invoiceId, ctx.auth.companyId])
    if (!inv.rows[0]) throw new Error('Invoice not found')
    const status = (inv.rows[0] as Record<string, unknown>)['status'] as string
    if (['issued', 'paid', 'void', 'cancelled'].includes(status)) throw new Error('Cannot change bank account on an issued invoice')
    await query(`UPDATE project_invoices SET bank_account_id=$2, updated_at=NOW() WHERE id=$1`, [args.invoiceId, args.bankAccountId ?? null])
    return true
  },

  setInvoicePaymentType: async (_: unknown, args: { invoiceId: string; paymentType: string }, ctx: GQLContext) => {
    if (!ctx.auth) throw new Error('Unauthorized')
    const inv = await query(`SELECT status FROM project_invoices WHERE id=$1 AND company_id=$2`, [args.invoiceId, ctx.auth.companyId])
    if (!inv.rows[0]) throw new Error('Invoice not found')
    const status = (inv.rows[0] as Record<string, unknown>)['status'] as string
    if (['issued', 'paid', 'void', 'cancelled'].includes(status)) throw new Error('Cannot change payment type on an issued invoice')
    if (!['wire_transfer', 'cash'].includes(args.paymentType)) throw new Error('Invalid payment type')
    await query(`UPDATE project_invoices SET payment_type=$2, updated_at=NOW() WHERE id=$1`, [args.invoiceId, args.paymentType])
    return true
  },

  // ── Permission System ─────────────────────────────────────────────────────────

  saveUserPermissions: async (
    _: unknown,
    args: { input: { userId: string; companyId: string; permissions: Record<string, string> } },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('system_admin required')
    const { userId, companyId, permissions } = args.input
    await query(`DELETE FROM user_permissions WHERE user_id=$1 AND company_id=$2`, [userId, companyId])
    for (const [key, level] of Object.entries(permissions)) {
      if (!level || level === 'none') continue
      await query(
        `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level, granted_by) VALUES ($1,$2,$3,$4,$5)`,
        [userId, companyId, key, level, ctx.auth.userId],
      )
    }
    const userRow = await query(`SELECT role FROM users WHERE id=$1`, [userId])
    const role = (userRow.rows[0] as Record<string, string> | undefined)?.['role'] ?? ''
    const isAdmin = ['system_admin', 'company_admin'].includes(role)
    const permsRes = await query(
      `SELECT up.permission_key AS key, p.label, p.module, p.submodule, up.access_level AS "accessLevel"
       FROM user_permissions up
       JOIN permissions p ON p.key = up.permission_key
       WHERE up.user_id=$1 AND up.company_id=$2`,
      [userId, companyId],
    )
    return {
      userId,
      companyId,
      isAdmin,
      permissions: permsRes.rows.map((r: Record<string, string>) => ({
        key: r['key'],
        label: r['label'],
        module: r['module'],
        submodule: r['submodule'],
        accessLevel: r['accessLevel'],
      })),
    }
  },

  createRoleTemplate: async (
    _: unknown,
    args: { input: { name: string; description?: string; permissions: Record<string, string> } },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('system_admin required')
    const { name, description, permissions } = args.input
    const res = await query(
      `INSERT INTO role_templates (name, description, is_system, created_by) VALUES ($1,$2,false,$3) RETURNING *`,
      [name, description ?? null, ctx.auth.userId],
    )
    const r = res.rows[0] as Record<string, unknown>
    for (const [key, level] of Object.entries(permissions)) {
      if (!level || level === 'none') continue
      await query(
        `INSERT INTO role_template_permissions (template_id, permission_key, access_level) VALUES ($1,$2,$3)`,
        [r['id'], key, level],
      )
    }
    const perms = await query(
      `SELECT permission_key AS key, access_level AS "accessLevel" FROM role_template_permissions WHERE template_id=$1`,
      [r['id']],
    )
    return {
      id: r['id'],
      name: r['name'],
      description: r['description'] ?? null,
      isSystem: false,
      createdAt: r['created_at'],
      permissions: perms.rows.map((p: Record<string, string>) => ({ key: p['key'], accessLevel: p['accessLevel'] })),
    }
  },

  updateRoleTemplate: async (
    _: unknown,
    args: { id: string; input: { name: string; description?: string; permissions: Record<string, string> } },
    ctx: GQLContext,
  ) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('system_admin required')
    const existing = await query(`SELECT is_system FROM role_templates WHERE id=$1`, [args.id])
    const r0 = existing.rows[0] as Record<string, unknown> | undefined
    if (!r0) throw new Error('Template not found')
    if (r0['is_system']) throw new Error('Cannot modify system templates')
    const { name, description, permissions } = args.input
    const res = await query(
      `UPDATE role_templates SET name=$2, description=$3, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [args.id, name, description ?? null],
    )
    const r = res.rows[0] as Record<string, unknown>
    await query(`DELETE FROM role_template_permissions WHERE template_id=$1`, [args.id])
    for (const [key, level] of Object.entries(permissions)) {
      if (!level || level === 'none') continue
      await query(
        `INSERT INTO role_template_permissions (template_id, permission_key, access_level) VALUES ($1,$2,$3)`,
        [args.id, key, level],
      )
    }
    const perms = await query(
      `SELECT permission_key AS key, access_level AS "accessLevel" FROM role_template_permissions WHERE template_id=$1`,
      [args.id],
    )
    return {
      id: r['id'],
      name: r['name'],
      description: r['description'] ?? null,
      isSystem: r['is_system'] as boolean,
      createdAt: r['created_at'],
      permissions: perms.rows.map((p: Record<string, string>) => ({ key: p['key'], accessLevel: p['accessLevel'] })),
    }
  },

  deleteRoleTemplate: async (_: unknown, args: { id: string }, ctx: GQLContext) => {
    if (!ctx.auth || ctx.auth.role !== 'system_admin') throw new Error('system_admin required')
    const existing = await query(`SELECT is_system FROM role_templates WHERE id=$1`, [args.id])
    const r = existing.rows[0] as Record<string, unknown> | undefined
    if (!r) throw new Error('Template not found')
    if (r['is_system']) throw new Error('Cannot delete system templates')
    await query(`DELETE FROM role_template_permissions WHERE template_id=$1`, [args.id])
    await query(`DELETE FROM role_templates WHERE id=$1`, [args.id])
    return true
  },
})

