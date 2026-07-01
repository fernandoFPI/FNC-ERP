import { emailWrapper } from './base.js'

export function renderPayslipEmail(data: {
  employeeName: string
  period: string
  netPay: string
  currency: string
  companyName: string
}): string {
  return emailWrapper(
    'Your Payslip',
    `Payslip for ${data.period}`,
    `
      <h2>Hello ${data.employeeName},</h2>
      <p>Your payslip for <strong>${data.period}</strong> is ready.</p>

      <table class="info-table">
        <tr><td>Period</td><td>${data.period}</td></tr>
        <tr><td>Company</td><td>${data.companyName}</td></tr>
        <tr><td>Net pay</td><td class="amount">${data.netPay} ${data.currency}</td></tr>
      </table>

      <p>Your payslip is attached to this email as a PDF.</p>

      <div class="alert alert-info">
        If you have any questions about your payslip, please contact the HR department.
      </div>
    `,
  )
}
