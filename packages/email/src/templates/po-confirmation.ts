import { emailWrapper } from './base.js'

export function renderPOConfirmationEmail(data: {
  vendorName: string
  poNumber: string
  totalAmount: string
  currency: string
  expectedDelivery?: string
  companyName: string
  companyCity: string
}): string {
  return emailWrapper(
    `Purchase Order ${data.poNumber}`,
    `Purchase Order from ${data.companyName}`,
    `
      <h2>Dear ${data.vendorName},</h2>
      <p>
        Please find attached our Purchase Order <strong>${data.poNumber}</strong>.
        This order is now approved and confirmed.
      </p>

      <table class="info-table">
        <tr><td>PO number</td><td>${data.poNumber}</td></tr>
        <tr><td>From</td><td>${data.companyName}, ${data.companyCity}</td></tr>
        <tr><td>Total value</td><td class="amount">${data.totalAmount} ${data.currency}</td></tr>
        ${data.expectedDelivery ? `<tr><td>Expected delivery</td><td>${data.expectedDelivery}</td></tr>` : ''}
      </table>

      <p>
        Please confirm receipt of this PO and advise if you have any questions
        regarding the specifications or delivery schedule.
      </p>

      <div class="alert alert-warning">
        Please quote PO number <strong>${data.poNumber}</strong>
        on all correspondence and delivery documents.
      </div>
    `,
  )
}
