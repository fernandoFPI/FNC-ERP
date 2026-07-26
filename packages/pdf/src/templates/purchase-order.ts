import { BASE_STYLES, formatCurrency, formatDate, companyHeader } from './base.js'

export interface POData {
  company: { name: string; legalName: string; city: string; country: string }
  vendor: { name: string; legalName?: string; address?: string; contact?: string; email?: string }
  po: {
    number: string
    date: string
    expectedDeliveryDate?: string
    status: string
    currency: string
    notes?: string
  }
  lines: {
    lineNumber: number
    description: string
    qty: number
    uom: string
    unitPrice: number
    totalPrice: number
    currency: string
  }[]
  totals: {
    subtotal: number
    taxAmount: number
    total: number
    currency: string
  }
  approvedBy?: string
  approvedAt?: string
}

export function renderPurchaseOrder(data: POData): string {
  const lineRows = data.lines
    .map(
      (line) => `
    <tr>
      <td>${line.lineNumber}</td>
      <td>${line.description}</td>
      <td class="text-center">${line.qty} ${line.uom}</td>
      <td class="text-right amount">${formatCurrency(line.unitPrice, line.currency)}</td>
      <td class="text-right amount" style="font-weight:600">
        ${formatCurrency(line.totalPrice, line.currency)}
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
      <title>Purchase Order ${data.po.number}</title>
      <style>${BASE_STYLES}</style>
    </head>
    <body>
    <div class="page">

      <div class="doc-header">
        ${companyHeader(data.company)}
        <div class="doc-title">
          <h1>Purchase Order</h1>
          <div class="doc-number">${data.po.number}</div>
          <span class="status-badge status-${data.po.status.toLowerCase()}">
            ${data.po.status}
          </span>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-section">
          <h3>Vendor</h3>
          <p>
            <strong>${data.vendor.name}</strong><br>
            ${data.vendor.legalName ?? ''}<br>
            ${data.vendor.address ?? ''}<br>
            ${data.vendor.contact ?? ''}
          </p>
        </div>
        <div class="meta-section">
          <h3>Order Details</h3>
          <p>
            PO date: ${formatDate(data.po.date)}<br>
            ${data.po.expectedDeliveryDate ? `Expected delivery: ${formatDate(data.po.expectedDeliveryDate)}<br>` : ''}
            Currency: ${data.po.currency}
            ${data.approvedBy ? `<br>Approved by: ${data.approvedBy}` : ''}
            ${data.approvedAt ? `<br>Approved on: ${formatDate(data.approvedAt)}` : ''}
          </p>
        </div>
      </div>

      <table class="doc-table">
        <thead>
          <tr>
            <th style="width:40px">#</th>
            <th>Description</th>
            <th class="text-center" style="width:100px">Qty / UOM</th>
            <th class="text-right" style="width:130px">Unit price</th>
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
            data.totals.taxAmount > 0
              ? `
            <div class="totals-row">
              <span>Tax</span>
              <span class="amount">${formatCurrency(data.totals.taxAmount, data.totals.currency)}</span>
            </div>
          `
              : ''
          }
          <div class="totals-row total">
            <span>TOTAL</span>
            <span class="amount">${formatCurrency(data.totals.total, data.totals.currency)}</span>
          </div>
        </div>
      </div>

      ${
        data.po.notes
          ? `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;
                    border-radius:8px;padding:16px;margin-bottom:24px">
          <p style="font-size:11px;font-weight:600;margin-bottom:4px">Notes</p>
          <p style="font-size:12px;color:#666">${data.po.notes}</p>
        </div>
      `
          : ''
      }

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;
                  margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0">
        <div>
          <p style="font-size:11px;color:#666;margin-bottom:32px">Authorized signature</p>
          <div style="border-top:1px solid #cbd5e0;padding-top:8px;font-size:11px;color:#666">
            ${data.company.name}
          </div>
        </div>
        <div>
          <p style="font-size:11px;color:#666;margin-bottom:32px">Vendor acknowledgment</p>
          <div style="border-top:1px solid #cbd5e0;padding-top:8px;font-size:11px;color:#666">
            ${data.vendor.name}
          </div>
        </div>
      </div>

      <div class="doc-footer">
        Official purchase order • FNC Group ERP •
        ${data.company.legalName} • ${data.company.city}, Iraq
      </div>

    </div>
    </body>
    </html>
  `
}
