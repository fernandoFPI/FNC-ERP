import { emailWrapper } from './base.js'

export function renderEngineeringRevisionEmail(data: {
  recipientName: string
  projectName: string
  projectCode: string
  revisionCode: string
  notes?: string
  itemCount: number
  issuedBy: string
  projectUrl: string
}): string {
  return emailWrapper(
    `Scope Revision ${data.revisionCode} Issued — ${data.projectCode}`,
    `Engineering scope formally revised on project ${data.projectCode}`,
    `
      <h2>Hello ${data.recipientName},</h2>
      <p>
        The engineering scope for project <strong>${data.projectName}</strong> (${data.projectCode})
        has been formally revised and issued.
      </p>

      <table class="info-table">
        <tr><td>Revision</td><td><strong>${data.revisionCode}</strong></td></tr>
        <tr><td>Issued By</td><td>${data.issuedBy}</td></tr>
        <tr><td>Scope Items</td><td>${data.itemCount} line item${data.itemCount !== 1 ? 's' : ''}</td></tr>
        ${data.notes ? `<tr><td>Notes</td><td>${data.notes}</td></tr>` : ''}
      </table>

      <p>
        Please review the updated scope in the ERP system. All previous revisions
        have been archived and are still accessible in the revision history.
      </p>

      <div style="text-align:center;margin:24px 0">
        <a href="${data.projectUrl}"
           style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          View Engineering Scope
        </a>
      </div>
    `,
  )
}
