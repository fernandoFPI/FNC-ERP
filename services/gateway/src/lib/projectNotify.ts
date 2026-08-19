import { query } from '@fnc-erp/db'
import { env } from '@fnc-erp/config'

// Fired whenever a file is uploaded anywhere on a project (client documents,
// bid packages/deliverables, RFI, site instructions, inspection requests,
// NCRs, HSE records, handover certificates, RFQ phases, or a direct project
// attachment) — notifies the project manager and every active team member,
// in-app and by email, with a link straight to the project. Non-fatal:
// failures here should never block the upload itself, so callers should
// `void` this and let it run in the background.
export async function notifyProjectFileUploadGW(
  projectId: string,
  companyId: string,
  actorUserId: string,
  fileType: string,
  fileLabel: string,
): Promise<void> {
  try {
    const projectRes = await query<{
      name: string
      code: string
      manager_user_id: string | null
      manager_email: string | null
      manager_name: string | null
    }>(
      `SELECT p.name, p.code, mu.id AS manager_user_id, mu.email AS manager_email,
              COALESCE(NULLIF(TRIM(me.first_name || ' ' || me.last_name), ''), mu.email) AS manager_name
       FROM projects p
       LEFT JOIN employees me ON me.id = p.project_manager_id
       LEFT JOIN users mu ON mu.id = me.user_id
       WHERE p.id=$1 AND p.company_id=$2`,
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

    const membersRes = await query<{ user_id: string; email: string | null; name: string | null }>(
      `SELECT DISTINCT u.id AS user_id, u.email,
              COALESCE(NULLIF(TRIM(e.first_name || ' ' || e.last_name), ''), u.email) AS name
       FROM project_members pm
       JOIN employees e ON e.id = pm.employee_id
       JOIN users u ON u.id = e.user_id
       WHERE pm.project_id=$1 AND pm.is_active=true`,
      [projectId],
    )

    const recipients = new Map<string, { email: string | null; name: string }>()
    if (project.manager_user_id) {
      recipients.set(project.manager_user_id, {
        email: project.manager_email,
        name: project.manager_name ?? 'Team Member',
      })
    }
    for (const m of membersRes.rows) {
      recipients.set(m.user_id, { email: m.email, name: m.name ?? 'Team Member' })
    }
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
