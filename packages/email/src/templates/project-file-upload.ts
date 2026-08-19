import { emailWrapper } from './base.js'

export function renderProjectFileUploadEmail(data: {
  recipientName: string
  projectName: string
  projectCode: string
  fileType: string
  fileLabel: string
  uploadedBy: string
  projectUrl: string
}): string {
  return emailWrapper(
    `New file uploaded: ${data.fileLabel}`,
    `New file uploaded to project ${data.projectCode}`,
    `
      <h2>Hello ${data.recipientName},</h2>
      <p>
        A new file has been uploaded to project
        <strong>${data.projectName}</strong> (${data.projectCode}).
      </p>

      <table class="info-table">
        <tr><td>File</td><td>${data.fileLabel}</td></tr>
        <tr><td>Type</td><td>${data.fileType}</td></tr>
        <tr><td>Uploaded By</td><td>${data.uploadedBy}</td></tr>
      </table>

      <p>
        Please log in to the ERP system to review the file.
      </p>

      <div style="text-align:center;margin:24px 0">
        <a href="${data.projectUrl}"
           style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          View Project
        </a>
      </div>
    `,
  )
}
