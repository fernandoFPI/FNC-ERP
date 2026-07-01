import { emailWrapper } from './base.js'

export function renderInvoiceEmail(data: {
  clientName: string
  invoiceNumber: string
  projectName: string
  netPayable: string
  currency: string
  dueDate: string
  companyName: string
}): string {
  return emailWrapper(
    `Invoice ${data.invoiceNumber}`,
    `Invoice from ${data.companyName}`,
    `
      <h2>Dear ${data.clientName},</h2>
      <p>
        Please find attached invoice <strong>${data.invoiceNumber}</strong>
        for project <strong>${data.projectName}</strong>.
      </p>

      <table class="info-table">
        <tr><td>Invoice number</td><td>${data.invoiceNumber}</td></tr>
        <tr><td>Project</td><td>${data.projectName}</td></tr>
        <tr><td>Amount due</td><td class="amount">${data.netPayable} ${data.currency}</td></tr>
        <tr><td>Due date</td><td>${data.dueDate}</td></tr>
      </table>

      <p>Please arrange payment by the due date referencing the invoice number.</p>

      <div class="alert alert-info">
        For payment queries, please contact our finance team.
      </div>
    `,
  )
}
