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

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function generateMeetingICS(data: {
  uid: string
  meetingNumber: string
  title: string
  meetingDate: string   // YYYY-MM-DD
  location: string | null
  agenda: string | null
  chairperson: string | null
}): Buffer {
  const dateStr = data.meetingDate.replace(/-/g, '')
  const d = new Date(data.meetingDate + 'T00:00:00Z')
  d.setDate(d.getDate() + 1)
  const endStr = d.toISOString().slice(0, 10).replace(/-/g, '')
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'

  const description = data.agenda
    ? 'Agenda:\\n' + data.agenda.split('\n').filter(Boolean).map((l, i) => `${i + 1}. ${l.trim()}`).join('\\n')
    : ''

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FNC Group ERP//MOM//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${icsEscape(data.uid)}-${dateStr}@fnc-erp`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dateStr}`,
    `DTEND;VALUE=DATE:${endStr}`,
    `SUMMARY:[MOM] ${icsEscape(data.meetingNumber)}: ${icsEscape(data.title)}`,
    data.location ? `LOCATION:${icsEscape(data.location)}` : null,
    description ? `DESCRIPTION:${description}` : null,
    data.chairperson ? `ORGANIZER;CN=${icsEscape(data.chairperson)}:mailto:noreply@fnc-erp.local` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null)

  return Buffer.from(lines.join('\r\n'), 'utf-8')
}

export function renderMeetingInvitationEmail(data: {
  meetingNumber: string
  title: string
  meetingType: string
  meetingDate: string
  location: string | null
  chairperson: string | null
  attendees: string | null
  agenda: string | null
  projectName: string
}): string {
  const typeLabel = MEETING_TYPE_LABEL[data.meetingType] ?? 'Meeting'
  const isOnlineLink = data.location ? /^https?:\/\//i.test(data.location) : false

  const agendaItems = data.agenda
    ? data.agenda.split('\n').map(l => l.trim()).filter(Boolean)
    : []

  const agendaHtml = agendaItems.length
    ? `<h2>Agenda</h2><ol style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;margin:0 0 16px;">${agendaItems.map(l => `<li>${l}</li>`).join('')}</ol>`
    : ''

  const attendeesText = data.attendees
    ? data.attendees.split(/[\n,]/).map(a => a.trim()).filter(Boolean).join(', ')
    : null

  const locationDisplay = isOnlineLink
    ? `<a href="${data.location}" style="color:#1a3c5e;">${data.location}</a>`
    : (data.location ?? '—')

  return emailWrapper(
    `${data.meetingNumber} — ${data.title}`,
    `${typeLabel} · ${data.projectName}`,
    `
      <h2 style="margin:0 0 4px;">${data.meetingNumber}: ${data.title}</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">
        You are receiving this as a member of the distribution list for this meeting.
      </p>

      <table class="info-table">
        <tr><td>Project</td><td>${data.projectName}</td></tr>
        <tr><td>Type</td><td>${typeLabel}</td></tr>
        <tr><td>Date</td><td><strong>${data.meetingDate}</strong></td></tr>
        ${data.location ? `<tr><td>Location / Link</td><td>${locationDisplay}</td></tr>` : ''}
        ${data.chairperson ? `<tr><td>Chairperson</td><td>${data.chairperson}</td></tr>` : ''}
        ${attendeesText ? `<tr><td>Attendees</td><td>${attendeesText}</td></tr>` : ''}
      </table>

      ${agendaHtml}

      ${isOnlineLink
        ? `<p style="text-align:center;margin:24px 0 8px;">
             <a class="btn" href="${data.location}">Join Meeting</a>
           </p>`
        : ''
      }

      <div class="alert alert-info">
        Please confirm your attendance by replying to the chairperson.
        Reference: <strong>${data.meetingNumber}</strong>
      </div>
    `,
  )
}
