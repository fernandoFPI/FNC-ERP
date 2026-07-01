import { BASE_STYLES, formatCurrency, formatDate, companyHeader } from './base.js'

export interface PayslipData {
  company: {
    name: string
    legalName: string
    city: string
    country: string
  }
  employee: {
    name: string
    employeeNumber: string
    jobTitle: string
    department: string
    email?: string
    bankAccount?: string
  }
  payrollRun: {
    name: string
    periodStart: string
    periodEnd: string
  }
  earnings: {
    basePay: number
    allowances: Array<{ name: string; amount: number }>
    overtimePay: number
    grossPay: number
    currency: string
  }
  deductions: {
    incomeTax: number
    socialSecurity: number
    others: Array<{ name: string; amount: number }>
    totalDeductions: number
  }
  net: {
    netPay: number
    currency: string
    netPayIQD: number
    fxRate: number
  }
  daysAttendance: {
    workingDays: number
    daysPresent: number
    daysAbsent: number
    overtimeHours: number
  }
}

export function renderPayslip(data: PayslipData): string {
  const allowanceRows = data.earnings.allowances
    .map(
      (a) => `
    <tr>
      <td>${a.name}</td>
      <td class="text-right amount">${formatCurrency(a.amount, data.earnings.currency)}</td>
    </tr>
  `,
    )
    .join('')

  const deductionRows = data.deductions.others
    .map(
      (d) => `
    <tr>
      <td>${d.name}</td>
      <td class="text-right amount">${formatCurrency(d.amount, data.earnings.currency)}</td>
    </tr>
  `,
    )
    .join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Payslip — ${data.employee.name}</title>
      <style>${BASE_STYLES}</style>
    </head>
    <body>
    <div class="page">

      <div class="doc-header">
        ${companyHeader(data.company)}
        <div class="doc-title">
          <h1>Payslip</h1>
          <div class="doc-number">${data.payrollRun.name}</div>
          <div class="doc-number">
            Period: ${formatDate(data.payrollRun.periodStart)}
            — ${formatDate(data.payrollRun.periodEnd)}
          </div>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-section">
          <h3>Employee</h3>
          <p>
            <strong>${data.employee.name}</strong><br>
            ${data.employee.employeeNumber}<br>
            ${data.employee.jobTitle}<br>
            ${data.employee.department}
          </p>
        </div>
        <div class="meta-section">
          <h3>Attendance Summary</h3>
          <p>
            Working days: ${data.daysAttendance.workingDays}<br>
            Days present: ${data.daysAttendance.daysPresent}<br>
            Days absent: ${data.daysAttendance.daysAbsent}<br>
            Overtime hours: ${data.daysAttendance.overtimeHours}
          </p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:32px">

        <div>
          <h3 style="font-size:12px;font-weight:600;color:#1a3c5e;
                     text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Earnings</h3>
          <table class="doc-table">
            <thead>
              <tr><th>Description</th><th class="text-right">Amount</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Base salary</td>
                <td class="text-right amount">
                  ${formatCurrency(data.earnings.basePay, data.earnings.currency)}
                </td>
              </tr>
              ${allowanceRows}
              ${
                data.earnings.overtimePay > 0
                  ? `
                <tr>
                  <td>Overtime (${data.daysAttendance.overtimeHours} hrs)</td>
                  <td class="text-right amount">
                    ${formatCurrency(data.earnings.overtimePay, data.earnings.currency)}
                  </td>
                </tr>
              `
                  : ''
              }
              <tr style="font-weight:600;background:#f0f4f8">
                <td>Gross pay</td>
                <td class="text-right amount">
                  ${formatCurrency(data.earnings.grossPay, data.earnings.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h3 style="font-size:12px;font-weight:600;color:#1a3c5e;
                     text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Deductions</h3>
          <table class="doc-table">
            <thead>
              <tr><th>Description</th><th class="text-right">Amount</th></tr>
            </thead>
            <tbody>
              ${
                data.deductions.incomeTax > 0
                  ? `
                <tr>
                  <td>Income tax</td>
                  <td class="text-right amount">
                    ${formatCurrency(data.deductions.incomeTax, data.earnings.currency)}
                  </td>
                </tr>
              `
                  : ''
              }
              ${
                data.deductions.socialSecurity > 0
                  ? `
                <tr>
                  <td>Social security</td>
                  <td class="text-right amount">
                    ${formatCurrency(data.deductions.socialSecurity, data.earnings.currency)}
                  </td>
                </tr>
              `
                  : ''
              }
              ${deductionRows}
              <tr style="font-weight:600;background:#f0f4f8">
                <td>Total deductions</td>
                <td class="text-right amount">
                  ${formatCurrency(data.deductions.totalDeductions, data.earnings.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      <div class="totals-section">
        <div class="totals-box">
          <div class="totals-row">
            <span>Gross pay</span>
            <span class="amount">${formatCurrency(data.earnings.grossPay, data.earnings.currency)}</span>
          </div>
          <div class="totals-row">
            <span>Total deductions</span>
            <span class="amount">(${formatCurrency(data.deductions.totalDeductions, data.earnings.currency)})</span>
          </div>
          <div class="totals-row total">
            <span>NET PAY</span>
            <span class="amount">${formatCurrency(data.net.netPay, data.net.currency)}</span>
          </div>
          ${
            data.net.currency !== 'IQD'
              ? `
            <div class="totals-row" style="color:#666;font-size:11px">
              <span>Equivalent (IQD @ ${data.net.fxRate})</span>
              <span class="amount">${formatCurrency(data.net.netPayIQD, 'IQD')}</span>
            </div>
          `
              : ''
          }
        </div>
      </div>

      ${
        data.employee.bankAccount
          ? `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;
                    border-radius:8px;padding:16px;margin-bottom:24px">
          <p style="font-size:11px;color:#666">
            Payment will be transferred to bank account ending in
            <strong>****${data.employee.bankAccount.slice(-4)}</strong>
          </p>
        </div>
      `
          : ''
      }

      <div class="doc-footer">
        This payslip is computer generated and does not require a signature. •
        FNC Group ERP • Confidential — for recipient only
      </div>

    </div>
    </body>
    </html>
  `
}
