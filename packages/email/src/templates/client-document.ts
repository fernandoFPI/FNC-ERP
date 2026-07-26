import { emailWrapper } from './base.js'

const CATEGORY_LABELS: Record<string, string> = {
  rfq_tender: 'RFQ / Tender',
  drawings: 'Technical Drawings',
  boq_specs: 'BOQ / Specifications',
  correspondence: 'Correspondence',
  contracts: 'Contracts',
  other: 'General',
}

export function renderClientDocumentEmail(data: {
  recipientName: string
  projectName: string
  projectCode: string
  documentTitle: string
  category: string
  documentNumber?: string
  revision?: string
  receivedFrom?: string
  uploadedBy: string
  projectUrl: string
}): string {
  const categoryLabel = CATEGORY_LABELS[data.category] ?? data.category
  return emailWrapper(
    `New Document: ${data.documentTitle}`,
    `New document uploaded to project ${data.projectCode}`,
    `
      <h2>Hello ${data.recipientName},</h2>
      <p>
        A new client document has been uploaded to project
        <strong>${data.projectName}</strong> (${data.projectCode}).
      </p>

      <table class="info-table">
        <tr><td>Title</td><td>${data.documentTitle}</td></tr>
        <tr><td>Category</td><td>${categoryLabel}</td></tr>
        ${data.documentNumber ? `<tr><td>Document No.</td><td>${data.documentNumber}</td></tr>` : ''}
        ${data.revision ? `<tr><td>Revision</td><td>${data.revision}</td></tr>` : ''}
        ${data.receivedFrom ? `<tr><td>Received From</td><td>${data.receivedFrom}</td></tr>` : ''}
        <tr><td>Uploaded By</td><td>${data.uploadedBy}</td></tr>
      </table>

      <p>
        Please log in to the ERP system to review the document.
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
