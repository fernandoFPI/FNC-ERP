import { emailWrapper } from './base.js'

export type EngDocEventType = 'assigned' | 'returned' | 'approved' | 'issued' | 'client_response' | 'update' | 'overdue' | 'urgent' | 'critical'

export function renderEngDocNotificationEmail(data: {
  recipientName:  string
  eventType:      EngDocEventType
  role:           string
  docRef:         string
  docTitle:       string
  projectName:    string
  fromName:       string
  actionLabel:    string
  dueDate?:       string | undefined
  daysOverdue?:   number | undefined
  notes?:         string | undefined
  appUrl:         string
}): string {
  const ROLE_LABELS: Record<string, string> = {
    checker:     'Checker',
    approver:    'Approver',
    originator:  'Originator',
    pm:          'Project Manager',
  }

  const urgencyBanner = (): string => {
    if (data.eventType === 'critical') {
      return `<div class="alert" style="background:#fef2f2;border-left:4px solid #dc2626;color:#7f1d1d;margin:0 0 20px;">
        <strong>&#x1F534; CRITICAL — ${data.daysOverdue} days overdue</strong><br>
        This document requires immediate attention. The project manager has also been notified.
      </div>`
    }
    if (data.eventType === 'urgent') {
      return `<div class="alert" style="background:#fff7ed;border-left:4px solid #f97316;color:#7c2d12;margin:0 0 20px;">
        <strong>&#x26A0;&#xFE0F; URGENT — ${data.daysOverdue} days overdue</strong><br>
        This document is severely overdue and requires your immediate attention.
      </div>`
    }
    if (data.eventType === 'overdue') {
      return `<div class="alert alert-warning" style="margin:0 0 20px;">
        <strong>Overdue${data.daysOverdue ? ` — ${data.daysOverdue} day${data.daysOverdue !== 1 ? 's' : ''}` : ''}</strong><br>
        The response deadline for this document has passed.
      </div>`
    }
    return ''
  }

  const actionLine = (): string => {
    if (data.eventType === 'assigned') {
      const roleLabel = ROLE_LABELS[data.role] ?? data.role
      return `<p>You have been assigned as <strong>${roleLabel}</strong> for the following engineering document. Your review is required.</p>`
    }
    if (data.eventType === 'returned') {
      return `<p><strong>${data.fromName}</strong> has returned the following document to you with comments. Please review and action accordingly.</p>`
    }
    if (data.eventType === 'approved') {
      return `<p>Good news — <strong>${data.fromName}</strong> has approved the following document. ${data.actionLabel}.</p>`
    }
    if (data.eventType === 'issued') {
      return `<p>The following document has been issued to the client by <strong>${data.fromName}</strong>.</p>`
    }
    if (data.eventType === 'client_response') {
      return `<p>A client response has been recorded for the following document by <strong>${data.fromName}</strong>.</p>`
    }
    // overdue / urgent / critical
    return `<p>The following engineering document is awaiting your ${ROLE_LABELS[data.role] ?? 'review'} action and is now overdue.</p>`
  }

  const dueDateRow = data.dueDate
    ? `<tr><td>Response Due</td><td><strong style="color:${data.eventType === 'overdue' || data.eventType === 'urgent' || data.eventType === 'critical' ? '#dc2626' : '#1a1a1a'}">${data.dueDate}</strong></td></tr>`
    : ''

  const daysOverdueRow = data.daysOverdue !== undefined
    ? `<tr><td>Days Overdue</td><td><strong style="color:#dc2626">${data.daysOverdue} day${data.daysOverdue !== 1 ? 's' : ''}</strong></td></tr>`
    : ''

  const notesRow = data.notes
    ? `<tr><td>Notes</td><td style="font-style:italic;color:#555">${data.notes}</td></tr>`
    : ''

  const subjectPrefix = data.eventType === 'critical' ? '🔴 CRITICAL' :
                        data.eventType === 'urgent'   ? '🚨 URGENT' :
                        data.eventType === 'overdue'  ? '⚠ Overdue' :
                        'Action Required'

  return emailWrapper(
    `${subjectPrefix}: ${data.docRef} — ${data.projectName}`,
    `Engineering Document Notification — ${data.projectName}`,
    `
      <h2>Hello ${data.recipientName},</h2>
      ${urgencyBanner()}
      ${actionLine()}

      <table class="info-table">
        <tr><td>Document</td><td><strong style="font-family:'Courier New',monospace">${data.docRef}</strong></td></tr>
        <tr><td>Title</td><td>${data.docTitle}</td></tr>
        <tr><td>Project</td><td>${data.projectName}</td></tr>
        <tr><td>Action</td><td>${data.actionLabel}</td></tr>
        ${dueDateRow}
        ${daysOverdueRow}
        ${notesRow}
      </table>

      <div style="text-align:center;margin:24px 0">
        <a href="${data.appUrl}" class="btn"
           style="background:${data.eventType === 'critical' ? '#dc2626' : data.eventType === 'urgent' ? '#f97316' : '#1a3c5e'}">
          View Document &rarr;
        </a>
      </div>

      ${data.eventType === 'assigned' && data.dueDate ? `
      <div class="alert alert-info">
        Please complete your review by <strong>${data.dueDate}</strong>.
        You will receive reminder notifications if this deadline is not met.
      </div>` : ''}
    `,
  )
}
