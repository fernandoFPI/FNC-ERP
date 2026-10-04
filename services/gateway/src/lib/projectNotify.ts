import { query } from '@fnc-erp/db'
import { env } from '@fnc-erp/config'

// Every project notification (file upload, lifecycle transitions, team
// changes) shares the same recipient set: the project manager, every
// active team member, and — previously missing from all three, which is
// the actual bug behind "module admins never get project emails" — every
// company-wide project module_admin (projects.view at 'admin' access
// level, same bar isProjectsModuleAdminGW checks per-caller in
// resolvers.ts, just resolved for every holder instead of one).
async function resolveProjectRecipientsGW(
  projectId: string,
  companyId: string,
): Promise<Map<string, { email: string | null; name: string }>> {
  const membersRes = await query<{ user_id: string; email: string | null; name: string | null }>(
    `SELECT DISTINCT u.id AS user_id, u.email,
            COALESCE(NULLIF(TRIM(e.first_name || ' ' || e.last_name), ''), u.email) AS name
     FROM project_members pm
     JOIN employees e ON e.id = pm.employee_id
     JOIN users u ON u.id = e.user_id
     WHERE pm.project_id=$1 AND pm.is_active=true`,
    [projectId],
  )
  const managerRes = await query<{ user_id: string | null; email: string | null; name: string | null }>(
    `SELECT mu.id AS user_id, mu.email,
            COALESCE(NULLIF(TRIM(me.first_name || ' ' || me.last_name), ''), mu.email) AS name
     FROM projects p
     LEFT JOIN employees me ON me.id = p.project_manager_id
     LEFT JOIN users mu ON mu.id = me.user_id
     WHERE p.id=$1`,
    [projectId],
  )
  const moduleAdminsRes = await query<{ user_id: string; email: string | null; name: string | null }>(
    `SELECT DISTINCT u.id AS user_id, u.email,
            COALESCE(NULLIF(TRIM(e.first_name || ' ' || e.last_name), ''), u.email) AS name
     FROM user_permissions up
     JOIN users u ON u.id = up.user_id
     LEFT JOIN employees e ON e.user_id = u.id
     WHERE up.company_id=$1 AND up.permission_key='projects.view' AND up.access_level='admin' AND u.is_active=true`,
    [companyId],
  )

  const recipients = new Map<string, { email: string | null; name: string }>()
  const mgr = managerRes.rows[0]
  if (mgr?.user_id) recipients.set(mgr.user_id, { email: mgr.email, name: mgr.name ?? 'Team Member' })
  for (const m of membersRes.rows) {
    recipients.set(m.user_id, { email: m.email, name: m.name ?? 'Team Member' })
  }
  for (const a of moduleAdminsRes.rows) {
    recipients.set(a.user_id, { email: a.email, name: a.name ?? 'Admin' })
  }
  return recipients
}

// Fired whenever a file is uploaded anywhere on a project (client documents,
// bid packages/deliverables, RFI, site instructions, inspection requests,
// NCRs, HSE records, handover certificates, RFQ phases, or a direct project
// attachment) — notifies the project manager, every active team member, and
// every project module_admin, in-app and by email (unless Settings ->
// Notification Routing has 'email.project_file_upload' turned off), with a
// link straight to the project. Non-fatal: failures here should never block
// the upload itself, so callers should `void` this and let it run in the
// background.
export async function notifyProjectFileUploadGW(
  projectId: string,
  companyId: string,
  actorUserId: string,
  fileType: string,
  fileLabel: string,
): Promise<void> {
  try {
    const projectRes = await query<{ name: string; code: string }>(
      `SELECT name, code FROM projects WHERE id=$1 AND company_id=$2`,
      [projectId, companyId],
    )
    const project = projectRes.rows[0]
    if (!project) return

    const actorRes = await query<{ name: string | null }>(
      `SELECT COALESCE(NULLIF(TRIM(e.first_name || ' ' || e.last_name), ''), u.email) AS name
       FROM users u LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id=$1`,
      [actorUserId],
    )
    const actorName = actorRes.rows[0]?.name ?? 'A team member'

    const recipients = await resolveProjectRecipientsGW(projectId, companyId)
    recipients.delete(actorUserId)

    const projectName = project.name
    const projectCode = project.code
    const projectUrl = `${env.FRONTEND_URL}/projects/${projectId}`
    const notifTitle = `New file: ${fileLabel}`
    const notifBody = `${actorName} uploaded a new ${fileType} to ${projectCode} — ${fileLabel}`

    for (const [userId, r] of recipients) {
      await query(
        `INSERT INTO notifications (company_id, user_id, type, title, body, data)
         VALUES ($1,$2,'project_file_upload',$3,$4,$5::jsonb)`,
        [companyId, userId, notifTitle, notifBody, JSON.stringify({ projectId })],
      ).catch(() => {
        /* non-fatal */
      })

      if (r.email) {
        await query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications','PROJECT_FILE_UPLOAD_EMAIL',$1::jsonb)`,
          [
            JSON.stringify({
              to: r.email,
              recipientName: r.name,
              projectName,
              projectCode,
              fileType,
              fileLabel,
              uploadedBy: actorName,
              projectUrl,
            }),
          ],
        ).catch(() => {
          /* non-fatal */
        })
      }
    }
  } catch {
    /* non-fatal — never let a notification failure block an upload */
  }
}

// Generic project-event notifier — covers creation (createRFQ) and every
// status transition (projectTransition, approveRFQ): one shared recipient
// resolution + one shared email template (PROJECT_LIFECYCLE_EMAIL), with
// `routingKey` naming which Settings -> Notification Routing switch gates
// the email (in-app notifications are never gated, same as every other
// routed email in this system — see NotificationRoutingPage's own note).
// Non-fatal and fire-and-forget, same contract as notifyProjectFileUploadGW
// — callers should `void` this.
export async function notifyProjectEventGW(
  projectId: string,
  companyId: string,
  actorUserId: string,
  eventType: string,
  title: string,
  body: string,
  routingKey: 'email.project_lifecycle' | 'email.project_member_added',
): Promise<void> {
  try {
    const projectRes = await query<{ name: string; code: string }>(
      `SELECT name, code FROM projects WHERE id=$1 AND company_id=$2`,
      [projectId, companyId],
    )
    const project = projectRes.rows[0]
    if (!project) return

    const recipients = await resolveProjectRecipientsGW(projectId, companyId)
    recipients.delete(actorUserId)

    const projectUrl = `${env.FRONTEND_URL}/projects/${projectId}`

    for (const [userId, r] of recipients) {
      await query(
        `INSERT INTO notifications (company_id, user_id, type, title, body, data)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [companyId, userId, eventType, title, body, JSON.stringify({ projectId })],
      ).catch(() => {
        /* non-fatal */
      })

      if (r.email) {
        await query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications','PROJECT_LIFECYCLE_EMAIL',$1::jsonb)`,
          [
            JSON.stringify({
              to: r.email,
              recipientName: r.name,
              projectName: project.name,
              projectCode: project.code,
              title,
              body,
              projectUrl,
              routingKey,
            }),
          ],
        ).catch(() => {
          /* non-fatal */
        })
      }
    }
  } catch {
    /* non-fatal */
  }
}
