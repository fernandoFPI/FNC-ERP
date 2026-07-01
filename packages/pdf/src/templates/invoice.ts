import { BASE_STYLES, formatCurrency, formatDate, companyHeader } from './base.js'

export interface InvoiceData {
  company: { name: string; legalName: string; city: string; country: string }
  client: { name: string; contact?: string; email?: string }
  invoice: {
    number: string
    date: string
    dueDate: string
    status: string
    billingMethod: string
    projectCode: string
    projectName: string
    contractNumber: string
  }
  lines: Array<{
    lineNumber: number
    description: string
    qty: number
    unitCost: number
    subtotal: number
    marginPct: number
    marginAmount: number
    lineTotal: number
    currency: string
    components?: Array<{
      productName: string
      qty: number
      unitCost: number
      totalCost: number
    }>
  }>
  totals: {
    subtotal: number
    marginTotal: number
    grossTotal: number
    retentionAmount: number
    retentionPct: number
    netPayable: number
    currency: string
  }
  paymentTerms: number
  notes?: string
  qrCodeDataUrl?: string
}

export function renderInvoice(data: InvoiceData): string {
  const lineRows = data.lines
    .map(
      (line) => `
    <tr>
      <td>${line.lineNumber}</td>
      <td>
        ${line.description}
        ${
          line.components
            ? `
          <div style="margin-top:6px;padding-left:12px;
                      border-left:2px solid #e2e8f0;font-size:11px;color:#666">
            ${line.components
              .map(
                (c) => `
              <div style="display:flex;justify-content:space-between;padding:2px 0">
                <span>${c.productName} × ${c.qty}</span>
                <span>${formatCurrency(c.totalCost, line.currency)}</span>
              </div>
            `,
              )
              .join('')}
          </div>
        `
            : ''
        }
      </td>
      <td class="text-right">${line.qty}</td>
      <td class="text-right amount">${formatCurrency(line.unitCost, line.currency)}</td>
      <td class="text-right amount">${formatCurrency(line.subtotal, line.currency)}</td>
      ${
        line.marginPct > 0
          ? `
        <td class="text-right">${(line.marginPct * 100).toFixed(1)}%</td>
        <td class="text-right amount">${formatCurrency(line.marginAmount, line.currency)}</td>
      `
          : `<td>—</td><td>—</td>`
      }
      <td class="text-right amount" style="font-weight:600">
        ${formatCurrency(line.lineTotal, line.currency)}
      </td>
    </tr>
  `,
    )
    .join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${data.invoice.number}</title>
      <style>${BASE_STYLES}</style>
    </head>
    <body>
    <div class="page">

      <div class="doc-header">
        ${companyHeader(data.company)}
        <div class="doc-title">
          <h1>Invoice</h1>
          <div class="doc-number">${data.invoice.number}</div>
          <span class="status-badge status-${data.invoice.status.toLowerCase()}">
            ${data.invoice.status}
          </span>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-section">
          <h3>Bill To</h3>
          <p>
            <strong>${data.client.name}</strong><br>
            ${data.client.contact ?? ''}
          </p>
        </div>
        <div class="meta-section">
          <h3>Invoice Details</h3>
          <p>
            Invoice date: ${formatDate(data.invoice.date)}<br>
            Due date: ${formatDate(data.invoice.dueDate)}<br>
            Payment terms: Net ${data.paymentTerms} days<br>
            Billing method: ${data.invoice.billingMethod.replace('_', ' ')}
          </p>
        </div>
        <div class="meta-section">
          <h3>Project</h3>
          <p>
            ${data.invoice.projectCode} — ${data.invoice.projectName}<br>
            Contract: ${data.invoice.contractNumber}
          </p>
        </div>
      </div>

      <table class="doc-table">
        <thead>
          <tr>
            <th style="width:40px">#</th>
            <th>Description</th>
            <th class="text-right" style="width:60px">Qty</th>
            <th class="text-right" style="width:120px">Unit cost</th>
            <th class="text-right" style="width:120px">Subtotal</th>
            <th class="text-right" style="width:70px">Margin%</th>
            <th class="text-right" style="width:120px">Margin</th>
            <th class="text-right" style="width:130px">Total</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>

      <div class="totals-section">
        <div class="totals-box">
          <div class="totals-row">
            <span>Subtotal</span>
            <span class="amount">${formatCurrency(data.totals.subtotal, data.totals.currency)}</span>
          </div>
          ${
            data.totals.marginTotal > 0
              ? `
            <div class="totals-row">
              <span>Margin</span>
              <span class="amount">${formatCurrency(data.totals.marginTotal, data.totals.currency)}</span>
            </div>
          `
              : ''
          }
          <div class="totals-row">
            <span>Gross total</span>
            <span class="amount">${formatCurrency(data.totals.grossTotal, data.totals.currency)}</span>
          </div>
          ${
            data.totals.retentionAmount > 0
              ? `
            <div class="totals-row" style="color:#e53e3e">
              <span>Retention (${(data.totals.retentionPct * 100).toFixed(0)}%)</span>
              <span class="amount">(${formatCurrency(data.totals.retentionAmount, data.totals.currency)})</span>
            </div>
          `
              : ''
          }
          <div class="totals-row total">
            <span>NET PAYABLE</span>
            <span class="amount">${formatCurrency(data.totals.netPayable, data.totals.currency)}</span>
          </div>
        </div>
      </div>

      ${
        data.notes
          ? `
        <div style="background:#fffbeb;border:1px solid #fcd34d;
                    border-radius:8px;padding:16px;margin-bottom:24px">
          <p style="font-size:11px;font-weight:600;color:#92400e;margin-bottom:4px">Notes</p>
          <p style="font-size:12px;color:#78350f">${data.notes}</p>
        </div>
      `
          : ''
      }

      <div style="display:grid;grid-template-columns:1fr 1fr${data.qrCodeDataUrl ? ' auto' : ''};gap:32px;
                  margin-bottom:32px;padding:20px;background:#f8fafc;border-radius:8px;align-items:end">
        <div>
          <p style="font-size:11px;font-weight:600;color:#1a3c5e;margin-bottom:8px">
            PAYMENT INSTRUCTIONS
          </p>
          <p style="font-size:11px;color:#666;line-height:1.7">
            Please transfer payment within ${data.paymentTerms} days of invoice date.<br>
            Reference invoice number ${data.invoice.number} in your payment.
          </p>
        </div>
        <div>
          <p style="font-size:11px;font-weight:600;color:#1a3c5e;margin-bottom:8px">
            AUTHORIZED BY
          </p>
          <div style="border-top:1px solid #cbd5e0;margin-top:32px;
                      padding-top:8px;font-size:11px;color:#666">
            Signature &amp; stamp
          </div>
        </div>
        ${data.qrCodeDataUrl ? `
        <div style="text-align:center;flex-shrink:0">
          <img src="${data.qrCodeDataUrl}" alt="Scan to verify" style="width:90px;height:90px;display:block;margin:0 auto 4px" />
          <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Scan to verify</div>
        </div>
        ` : ''}
      </div>

      <div class="doc-footer">
        This is an official tax invoice • FNC Group ERP •
        ${data.company.legalName} • ${data.company.city}, Iraq
      </div>

    </div>
    </body>
    </html>
  `
}
