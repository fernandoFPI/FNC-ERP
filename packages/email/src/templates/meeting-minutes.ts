import { emailWrapper } from './base.js'

const MEETING_TYPE_LABEL: Record<string, string> = {
  site: 'Site Meeting',
  technical: 'Technical Meeting',
  commercial: 'Commercial Meeting',
  kickoff: 'Kick-off Meeting',
  coordination: 'Coordination Meeting',
  closeout: 'Closeout Meeting',
  subcontractor: 'Subcontractor Meeting',
  hse: 'HSE Meeting',
  other: 'Meeting',
}

type ActionItem = {
  actionNumber: number
  description: string
  responsiblePerson: string | null
  dueDate: string | null
  priority: string
  status: string
}

const PRIORITY_COLOR: Record<string, string> = {
  low: '#6b7280', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
}

export function renderMeetingMinutesEmail(data: {
  meetingNumber: string
  title: string
  meetingType: string
  meetingDate: string
  location: string | null
  chairperson: string | null
  attendees: string | null
  agenda: string | null
  minutes: string | null
  projectName: string
  actions: ActionItem[]
}): string {
  const typeLabel = MEETING_TYPE_LABEL[data.meetingType] ?? 'Meeting'

  const attendeesText = data.attendees
    ? data.attendees.split(/[\n,]/).map(a => a.trim()).filter(Boolean).join(', ')
    : null

  const agendaItems = data.agenda
    ? data.agenda.split('\n').map(l => l.trim()).filter(Boolean)
    : []

  const agendaHtml = agendaItems.length
    ? `<h2>Agenda</h2>
       <ol style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;margin:0 0 24px;">${agendaItems.map(l => `<li>${l}</li>`).join('')}</ol>`
    : ''

  const minutesHtml = data.minutes
    ? `<h2>Minutes</h2>
       <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;margin:0 0 24px;padding:16px;background:#f8fafc;border-radius:6px;border-left:3px solid #1a3c5e;">${data.minutes}</div>`
    : ''

  const openActions = data.actions.filter(a => a.status !== 'closed')
  const actionsHtml = openActions.length
    ? `<h2>Open Action Items</h2>
       <table class="info-table" style="margin:0 0 24px;">
         <tr style="background:#f8fafc;">
           <td style="font-weight:700;color:#1a3c5e;">#</td>
           <td style="font-weight:700;color:#1a3c5e;">Action</td>
           <td style="font-weight:700;color:#1a3c5e;">Responsible</td>
           <td style="font-weight:700;color:#1a3c5e;">Due</td>
           <td style="font-weight:700;color:#1a3c5e;">Priority</td>
         </tr>
         ${openActions.map(a => `
           <tr>
             <td style="color:#6b7280;font-size:12px;">${a.actionNumber}</td>
             <td>${a.description}</td>
             <td>${a.responsiblePerson ?? '—'}</td>
             <td>${a.dueDate ?? '—'}</td>
             <td style="color:${PRIORITY_COLOR[a.priority] ?? '#6b7280'};font-weight:600;text-transform:capitalize;">${a.priority}</td>
           </tr>
         `).join('')}
       </table>`
    : ''

  return emailWrapper(
    `MOM: ${data.meetingNumber} — ${data.title}`,
    `Minutes of Meeting · ${data.projectName}`,
    `
      <div style="border-bottom:2px solid #1a3c5e;padding-bottom:16px;margin-bottom:20px;">
        <h2 style="margin:0 0 4px;">Minutes of Meeting</h2>
        <div style="font-size:20px;font-weight:700;color:#1a3c5e;">${data.meetingNumber}: ${data.title}</div>
      </div>

      <table class="info-table" style="margin-bottom:24px;">
        <tr><td>Project</td><td>${data.projectName}</td></tr>
        <tr><td>Type</td><td>${typeLabel}</td></tr>
        <tr><td>Date</td><td><strong>${data.meetingDate}</strong></td></tr>
        ${data.location ? `<tr><td>Location</td><td>${data.location}</td></tr>` : ''}
        ${data.chairperson ? `<tr><td>Chairperson</td><td>${data.chairperson}</td></tr>` : ''}
        ${attendeesText ? `<tr><td>Attendees</td><td>${attendeesText}</td></tr>` : ''}
      </table>

      ${agendaHtml}
      ${minutesHtml}
      ${actionsHtml}

      <div class="alert alert-warning">
        This is the official Minutes of Meeting for <strong>${data.meetingNumber}</strong>.
        Please review and raise any corrections within 48 hours of receipt.
      </div>
    `,
  )
}
