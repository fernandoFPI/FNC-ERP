import cron from 'node-cron'
import { pool, startJobRun, finishJobRun, failJobRun } from '@fnc-erp/db'
import { createServiceLogger } from '@fnc-erp/logger'
import { sendEmail, renderEngDocNotificationEmail } from '@fnc-erp/email'

const log = createServiceLogger('eng-doc-reminders')

const APP_URL = process.env['APP_URL'] ?? 'http://localhost:5173'

// Escalation schedule: (reminder_count → days until next reminder)
const NEXT_REMIND_DAYS: Record<number, number> = {
  0: 1,   // initial sent → remind on due date (1 day after initial)
  1: 2,   // due-date reminder → remind 2 days later (1d overdue)
  2: 4,   // 1d overdue → remind 4 days later (3d overdue threshold)
  3: 7,   // 3d overdue → remind 7 days later (critical)
}
const DEFAULT_NEXT_DAYS = 14

function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000))
}

function priorityForCount(count: number): 'normal' | 'high' | 'urgent' | 'critical' {
  if (count <= 1) return 'normal'
  if (count === 2) return 'high'
  if (count === 3) return 'urgent'
  return 'critical'
}

function eventTypeForCount(count: number): 'overdue' | 'urgent' | 'critical' {
  if (count <= 2) return 'overdue'
  if (count === 3) return 'urgent'
  return 'critical'
}

function urgencySubject(count: number, docRef: string, role: string, overdueDays: number): string {
  const roleLabel = role === 'checker' ? 'Check' : 'Approval'
  if (count <= 1) return `Reminder: Document ${roleLabel} Overdue — ${docRef}`
  if (count === 2) return `⚠️ OVERDUE: Document ${roleLabel} Required — ${docRef}`
  if (count === 3) return `🚨 URGENT: Document ${roleLabel} Severely Overdue — ${docRef}`
  return `🔴 CRITICAL: Document ${roleLabel} ${overdueDays} Days Overdue — ${docRef}`
}

export async function checkEngDocReminders(): Promise<void> {
  const runId = await startJobRun('eng-doc-reminders')
  let sent = 0
  let pmAlerts = 0

  try {
    const overdueRows = await pool.query<Record<string, unknown>>(`
      SELECT
        r.*,
        ed.ref_number, ed.title AS doc_title,
        ed.originator_name, ed.checker_name, ed.approver_name,
        p.name AS project_name, p.code AS project_code,
        p.id AS proj_id, p.company_id,
        pm_emp.first_name AS pm_first_name, pm_emp.last_name AS pm_last_name,
        pm_user.id AS pm_user_id, pm_user.email AS pm_email
      FROM eng_doc_review_reminders r
      JOIN engineering_documents ed ON ed.id = r.document_id
      JOIN projects p ON p.id = r.project_id
      LEFT JOIN employees pm_emp ON pm_emp.id = p.project_manager_id AND pm_emp.status = 'active'
      LEFT JOIN users pm_user ON pm_user.id = pm_emp.user_id
      WHERE r.resolved_at IS NULL
        AND r.next_remind_at <= NOW()
      ORDER BY r.due_date ASC
    `)

    for (const rem of overdueRows.rows) {
      const count      = Number(rem['reminder_count'])
      const dueDateStr = String(rem['due_date']).slice(0, 10)
      const overdueDays = daysOverdue(dueDateStr)
      const priority   = priorityForCount(count)
      const eventType  = eventTypeForCount(count)
      const role       = String(rem['role'])
      const docRef     = String(rem['ref_number'])
      const docTitle   = String(rem['doc_title'])
      const projName   = String(rem['project_name'])
      const projId     = String(rem['proj_id'])
      const companyId  = String(rem['company_id'])
      const reviewerName  = String(rem['reviewer_name'] ?? '')
      const reviewerEmail = rem['reviewer_email'] ? String(rem['reviewer_email']) : null
      const reviewerUserId = rem['reviewer_user_id'] ? String(rem['reviewer_user_id']) : null
      const actionLabel = role === 'checker' ? 'Internal Check Required' : 'Internal Approval Required'

      // In-app notification to reviewer
      if (reviewerUserId) {
        await pool.query(
          `INSERT INTO notifications (company_id, user_id, type, title, body, data, is_read)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, FALSE)`,
          [
            companyId, reviewerUserId,
            `eng_doc_${role}_${eventType}`,
            urgencySubject(count, docRef, role, overdueDays),
            `${docRef} — ${docTitle} requires your ${role} action. ${overdueDays > 0 ? `Now ${overdueDays} day${overdueDays !== 1 ? 's' : ''} overdue.` : 'Due today.'}`,
            JSON.stringify({ priority, entityType: 'engineering_document', entityId: rem['document_id'], entityRef: docRef, projectId: projId }),
          ],
        )
      }

      // Email to reviewer
      if (reviewerEmail && reviewerName) {
        const html = renderEngDocNotificationEmail({
          recipientName: reviewerName,
          eventType,
          role,
          docRef,
          docTitle,
          projectName: projName,
          fromName:    'FNC ERP System',
          actionLabel,
          dueDate:     dueDateStr,
          daysOverdue: overdueDays,
          appUrl:      `${APP_URL}/projects/${projId}?tab=rfq_lines`,
        })
        await sendEmail({
          to: reviewerEmail,
          subject: urgencySubject(count, docRef, role, overdueDays),
          html,
        }).catch((e: unknown) => log.error({ err: e }, 'Email send failed for reviewer reminder'))
      }

      // Critical escalation: also notify the project manager
      if (count >= 3) {
        const pmUserId = rem['pm_user_id'] ? String(rem['pm_user_id']) : null
        const pmEmail  = rem['pm_email'] ? String(rem['pm_email']) : null
        if (pmUserId && pmEmail) {
          const pmFullName = `${rem['pm_first_name']} ${rem['pm_last_name']}`

          await pool.query(
            `INSERT INTO notifications (company_id, user_id, type, title, body, data, is_read)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, FALSE)`,
            [
              companyId, pmUserId,
              'eng_doc_critical_pm_alert',
              `🔴 Critical: ${docRef} ${role} overdue ${overdueDays} days`,
              `${reviewerName} has not completed the ${role} for ${docRef} — ${docTitle}. Now ${overdueDays} days overdue.`,
              JSON.stringify({ priority: 'critical', entityType: 'engineering_document', entityId: rem['document_id'], entityRef: docRef, projectId: projId }),
            ],
          )

          const pmHtml = renderEngDocNotificationEmail({
            recipientName: pmFullName,
            eventType:     'critical',
            role:          'pm',
            docRef,
            docTitle,
            projectName:   projName,
            fromName:      'FNC ERP System',
            actionLabel:   `${role === 'checker' ? 'Check' : 'Approval'} assigned to ${reviewerName}`,
            dueDate:       dueDateStr,
            daysOverdue:   overdueDays,
            appUrl:        `${APP_URL}/projects/${projId}?tab=rfq_lines`,
          })
          await sendEmail({
            to: pmEmail,
            subject: `🔴 CRITICAL: ${docRef} ${role} ${overdueDays}d overdue — Project Manager Alert`,
            html: pmHtml,
          }).catch((e: unknown) => log.error({ err: e }, 'Email send failed for PM critical alert'))
          pmAlerts++
        }
      }

      // Update reminder: increment count and schedule next escalation
      const nextDays = NEXT_REMIND_DAYS[count] ?? DEFAULT_NEXT_DAYS
      await pool.query(
        `UPDATE eng_doc_review_reminders
         SET reminder_count   = reminder_count + 1,
             last_reminded_at = NOW(),
             next_remind_at   = NOW() + ($1 || ' days')::INTERVAL
         WHERE id = $2`,
        [nextDays, rem['id']],
      )

      sent++
      log.info({ docRef, role, count: count + 1, overdueDays }, 'Reminder sent')
    }

    await finishJobRun(runId, { reminders: sent, pmAlerts })
    if (sent > 0) log.info({ sent, pmAlerts }, 'Eng doc reminder run complete')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    await failJobRun(runId, msg).catch(() => {})
    log.error({ err }, 'Eng doc reminder job failed')
    throw err
  }
}

// Self-registering: every 2 hours
cron.schedule('0 */2 * * *', () => {
  void checkEngDocReminders().catch((e: unknown) => log.error({ err: e }, 'Unhandled reminder error'))
})
log.info({ cron: '0 */2 * * *' }, 'Eng doc reminder cron registered')
