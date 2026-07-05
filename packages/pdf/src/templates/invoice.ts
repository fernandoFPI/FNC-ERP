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

const FIRST_PAGE_ITEMS = 6
const OTHER_PAGE_ITEMS = 10

function renderRow(line: InvoiceData['lines'][0], showMargin: boolean): string {
  return `
    <tr>
      <td>${line.lineNumber}</td>
      <td>
        ${line.description}
        ${line.components ? `
          <div style="margin-top:6px;padding-left:12px;border-left:2px solid #e2e8f0;font-size:11px;color:#666">
            ${line.components.map(c => `
              <div style="display:flex;justify-content:space-between;padding:2px 0">
                <span>${c.productName} × ${c.qty}</span>
                <span>${formatCurrency(c.totalCost, line.currency)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </td>
      <td class="text-right">${line.qty}</td>
      <td class="text-right amount">${formatCurrency(line.unitCost, line.currency)}</td>
      <td class="text-right amount">${formatCurrency(line.subtotal, line.currency)}</td>
      ${showMargin
        ? (line.marginPct > 0
            ? `<td class="text-right">${(line.marginPct * 100).toFixed(1)}%</td>
               <td class="text-right amount">${formatCurrency(line.marginAmount, line.currency)}</td>`
            : `<td>—</td><td>—</td>`)
        : ''}
      <td class="text-right amount" style="font-weight:600">${formatCurrency(line.lineTotal, line.currency)}</td>
    </tr>
  `
}

function tableHead(showMargin: boolean): string {
  return `
    <table class="doc-table">
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th>Description</th>
          <th class="text-right" style="width:55px">Qty</th>
          <th class="text-right" style="width:130px">Unit Cost</th>
          <th class="text-right" style="width:130px">Subtotal</th>
          ${showMargin
            ? `<th class="text-right" style="width:65px">Margin%</th>
               <th class="text-right" style="width:110px">Margin</th>`
            : ''}
          <th class="text-right" style="width:130px">Total</th>
        </tr>
      </thead>
  `
}

function totalsBlock(data: InvoiceData): string {
  return `
    <div class="totals-section">
      <div class="totals-box">
        <div class="totals-row">
          <span>Subtotal</span>
          <span class="amount">${formatCurrency(data.totals.subtotal, data.totals.currency)}</span>
        </div>
        ${data.totals.marginTotal > 0 ? `
          <div class="totals-row">
            <span>Margin</span>
            <span class="amount">${formatCurrency(data.totals.marginTotal, data.totals.currency)}</span>
          </div>
        ` : ''}
        <div class="totals-row">
          <span>Gross Total</span>
          <span class="amount">${formatCurrency(data.totals.grossTotal, data.totals.currency)}</span>
        </div>
        ${data.totals.retentionAmount > 0 ? `
          <div class="totals-row" style="color:#e53e3e">
            <span>Retention (${(data.totals.retentionPct * 100).toFixed(0)}%)</span>
            <span class="amount">(${formatCurrency(data.totals.retentionAmount, data.totals.currency)})</span>
          </div>
        ` : ''}
        <div class="totals-row total">
          <span>NET PAYABLE</span>
          <span class="amount">${formatCurrency(data.totals.netPayable, data.totals.currency)}</span>
        </div>
      </div>
    </div>
  `
}

function signatureBlock(data: InvoiceData): string {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr${data.qrCodeDataUrl ? ' auto' : ''};gap:32px;
                margin-bottom:24px;padding:20px;background:#f8fafc;border-radius:8px;align-items:end">
      <div>
        <p style="font-size:11px;font-weight:600;color:#1a3c5e;margin-bottom:8px">PAYMENT INSTRUCTIONS</p>
        <p style="font-size:11px;color:#666;line-height:1.7">
          Payment type: Wire Transfer<br>
          Please transfer payment within ${data.paymentTerms} days of invoice date.<br>
          Reference invoice number ${data.invoice.number} in your payment.
        </p>
      </div>
      <div>
        <p style="font-size:11px;font-weight:600;color:#1a3c5e;margin-bottom:8px">AUTHORIZED BY</p>
        <div style="border-top:1px solid #cbd5e0;margin-top:32px;padding-top:8px;font-size:11px;color:#666">
          Signature &amp; stamp
        </div>
      </div>
      ${data.qrCodeDataUrl ? `
        <div style="text-align:center;flex-shrink:0">
          <img src="${data.qrCodeDataUrl}" alt="Scan to verify"
               style="width:90px;height:90px;display:block;margin:0 auto 4px" />
          <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Scan to verify</div>
        </div>
      ` : ''}
    </div>
  `
}

function docFooter(data: InvoiceData, pageNum: number, totalPages: number): string {
  return `
    <div class="doc-footer">
      This is an official tax invoice &nbsp;•&nbsp; FNC Group ERP &nbsp;•&nbsp;
      ${data.company.legalName} &nbsp;•&nbsp; ${data.company.city}, Iraq
      &nbsp;&nbsp;&nbsp;
      <strong>Page ${pageNum} of ${totalPages}</strong>
    </div>
  `
}

export function renderInvoice(data: InvoiceData): string {
  const showMargin = data.lines.some((l) => l.marginPct > 0)

  // Split lines into pages
  const pages: Array<typeof data.lines> = []
  if (data.lines.length <= FIRST_PAGE_ITEMS) {
    pages.push(data.lines)
  } else {
    pages.push(data.lines.slice(0, FIRST_PAGE_ITEMS))
    let i = FIRST_PAGE_ITEMS
    while (i < data.lines.length) {
      pages.push(data.lines.slice(i, i + OTHER_PAGE_ITEMS))
      i += OTHER_PAGE_ITEMS
    }
  }

  const totalPages = pages.length

  const pageHtmls = pages.map((pageLines, pageIdx) => {
    const isFirstPage = pageIdx === 0
    const isLastPage  = pageIdx === totalPages - 1
    const pageNum     = pageIdx + 1

    const rows = pageLines.map((l) => renderRow(l, showMargin)).join('')

    const header = isFirstPage
      ? `
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
            <p><strong>${data.client.name}</strong><br>${data.client.contact ?? ''}</p>
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
              Code: <strong>${data.invoice.projectCode}</strong><br>
              Name: ${data.invoice.projectName}<br>
              Contract: ${data.invoice.contractNumber}
            </p>
          </div>
        </div>
      `
      : `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding-bottom:12px;border-bottom:2px solid #1a3c5e;margin-bottom:20px">
          <div style="font-size:13px;color:#666;font-style:italic">
            Continued from previous page
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:700;color:#1a3c5e;letter-spacing:1px">INVOICE</div>
            <div style="font-size:12px;color:#666">${data.invoice.number}</div>
          </div>
        </div>
      `

    const tableFooterRow = !isLastPage
      ? `
        <tfoot>
          <tr>
            <td colspan="${showMargin ? 8 : 6}"
                style="padding:10px 12px;font-size:11px;color:#999;font-style:italic;
                        border-top:2px solid #e2e8f0;text-align:right">
              Continued on next page →
            </td>
          </tr>
        </tfoot>
      `
      : ''

    return `
      <div class="page" ${pageIdx > 0 ? 'style="page-break-before:always"' : ''}>
        ${header}
        ${tableHead(showMargin)}
          <tbody>${rows}</tbody>
          ${tableFooterRow}
        </table>

        ${isLastPage ? `
          ${totalsBlock(data)}
          ${data.notes ? `
            <div style="background:#fffbeb;border:1px solid #fcd34d;
                        border-radius:8px;padding:16px;margin-bottom:24px">
              <p style="font-size:11px;font-weight:600;color:#92400e;margin-bottom:4px">Notes</p>
              <p style="font-size:12px;color:#78350f">${data.notes}</p>
            </div>
          ` : ''}
          ${signatureBlock(data)}
        ` : ''}

        ${docFooter(data, pageNum, totalPages)}
      </div>
    `
  }).join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${data.invoice.number}</title>
      <style>
        ${BASE_STYLES}
        @media print {
          .page { page-break-after: always; }
          .page:last-child { page-break-after: avoid; }
        }
      </style>
    </head>
    <body>
      ${pageHtmls}
    </body>
    </html>
  `
}
