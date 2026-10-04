import { emailWrapper } from './base.js'

// Generic project-event email — covers creation, every status transition,
// and team assignment (see notifyProjectEventGW in services/gateway).
// title/body are already human-readable (built per event at the call
// site), so this template just lays them out rather than re-deriving them.
export function renderProjectLifecycleEmail(data: {
  recipientName: string
  projectName: string
  projectCode: string
  title: string
  body: string
  projectUrl: string
}): string {
  return emailWrapper(
    data.title,
    `${data.projectName} (${data.projectCode})`,
    `
      <h2>Hello ${data.recipientName},</h2>
      <p>${data.body}</p>

      <div style="text-align:center;margin:24px 0">
        <a href="${data.projectUrl}"
           style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          View Project
        </a>
      </div>
    `,
  )
}
