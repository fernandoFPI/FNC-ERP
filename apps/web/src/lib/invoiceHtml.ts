export interface InvoiceLine {
  id?: string
  lineNumber: number
  description: string
  qty: number
  unitCost: number
  subtotal: number
  marginPct: number
  marginAmount: number
  taxPct: number
  taxAmount: number
  lineTotal: number
  sourceType?: string
}

export interface BankAccount {
  id: string
  accountName: string
  bankName: string
  beneficiaryName?: string | null
  accountNumber?: string | null
  iban?: string | null
  swift?: string | null
  branchCode?: string | null
  bankAddress?: string | null
  intermediaryBankName?: string | null
  intermediarySwift?: string | null
  intermediaryCountry?: string | null
  currencyCode: string
  isActive: boolean
}

export interface InvoiceRenderData {
  invoiceNumber: string
  status: string
  invoiceDate: string
  dueDate: string
  billingMethod: string
  paymentTermsDays: number
  currencyCode: string
  paymentType?: string
  projectCode?: string | null
  projectName?: string | null
  contractNumber?: string | null
  clientName?: string | null
  companyName?: string | null
  companyLegalName?: string | null
  companyCountry?: string | null
  companyStampImage?: string | null
  companyLetterheadImage?: string | null
  companyAddress?: string | null
  companyPhone?: string | null
  companyEmail?: string | null
  companyBranchName?: string | null
  companyBranchAddress?: string | null
  companyBranchCity?: string | null
  companyBranchPhone?: string | null
  grossTotal: number
  retentionAmount: number
  retentionPct: number
  netPayable: number
  whtApplies?: boolean
  whtAmount?: number
  lines: InvoiceLine[]
}

function fmt(n: number, currency: string): string {
  return (
    new Intl.NumberFormat('en-IQ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) +
    ' ' + currency
  )
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function buildInvoiceHTML(
  inv: InvoiceRenderData,
  bankAccount?: BankAccount | null,
  paymentType?: string,
  stampImage?: string | null,
  qrDataUrl?: string | null,
): string {
  const cur = inv.currencyCode ?? 'IQD'
  const pt = paymentType ?? inv.paymentType ?? 'wire_transfer'
  const stamp = stampImage ?? inv.companyStampImage ?? null
  const letterhead = inv.companyLetterheadImage ?? null

  const subtotal = inv.lines.reduce((s, l) => s + l.subtotal, 0)
  const marginTotal = inv.lines.reduce((s, l) => s + l.marginAmount, 0)
  const taxTotal = inv.lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0)
  const hasMargin = marginTotal > 0
  const hasTax = taxTotal > 0
  const retentionPct = inv.retentionPct ?? 0

  const lineRows = inv.lines.map((l, idx) => {
    const bg = idx % 2 === 1 ? 'background:#f8fafc;' : ''
    return `
    <tr>
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;color:#888;${bg}">${l.lineNumber}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;${bg}">${l.description}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;${bg}">${l.qty}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;${bg}">${fmt(l.unitCost, cur)}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;${bg}">${fmt(l.subtotal, cur)}</td>
      ${hasMargin ? `
        <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;${bg}">${(l.marginPct * 100).toFixed(1)}%</td>
        <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;${bg}">${fmt(l.marginAmount, cur)}</td>
      ` : ''}
      ${hasTax ? `
        <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;${bg}">${(l.taxPct ?? 0).toFixed(1)}%</td>
        <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;${bg}">${fmt(l.taxAmount ?? 0, cur)}</td>
      ` : ''}
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;font-weight:700;color:#1a3c5e;${bg}">${fmt(l.lineTotal, cur)}</td>
    </tr>
  `}).join('')

  const statusBadgeStyle = `display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;${
    inv.status === 'paid' ? 'background:#d1fae5;color:#065f46' :
    inv.status === 'issued' || inv.status === 'sent' ? 'background:#dbeafe;color:#1e40af' :
    inv.status === 'approved' ? 'background:#fef3c7;color:#92400e' :
    'background:#f3f4f6;color:#374151'
  }`

  // ── Letterhead-specific sections ─────────────────────────────────────────

  const letterheadHeader = `
  <!-- Invoice title + number + QR positioned top-right, level with the letterhead logo -->
  <div style="position:absolute;top:16mm;right:15mm;text-align:right">
    <div style="font-size:20px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Invoice</div>
    <div style="font-size:12px;color:#555;font-family:monospace;margin-top:5px;letter-spacing:0.3px">${inv.invoiceNumber}</div>
    ${qrDataUrl ? `
    <div class="header-qr" style="margin-top:8px;display:flex;justify-content:flex-end">
      <div style="text-align:center">
        <img src="${qrDataUrl}" alt="Scan to verify" style="width:72px;height:72px;display:block;"/>
        <div style="font-size:8px;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px">Scan to verify</div>
      </div>
    </div>` : ''}
  </div>

  <!-- Divider between letterhead header zone and invoice content -->
  <div style="border-bottom:2px solid #1a3c5e;margin-bottom:22px"></div>`

  const letterheadBottom = `
  <div class="lh-stamp">
    ${stamp
      ? `<img class="lh-stamp-img" src="${stamp}" alt="Company stamp"/>`
      : `<div style="height:100px;width:180px;border-bottom:1px solid #cbd5e0;margin:0 auto 6px"></div>`
    }
    <div style="font-size:9px;color:#1a3c5e;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Authorized By</div>
  </div>`

  // ── Standard (non-letterhead) bottom section ─────────────────────────────

  const standardBottom = `
  <div style="display:grid;grid-template-columns:1fr 1fr${qrDataUrl ? ' auto' : ''};gap:32px;margin-bottom:32px;align-items:end">
    <div>
      <p style="font-size:11px;font-weight:600;color:#1a3c5e;margin-bottom:8px">NOTES</p>
     
    </div>
    <div style="text-align:right">
      <p style="font-size:11px;font-weight:600;color:#1a3c5e;margin-bottom:8px">AUTHORIZED BY</p>
      ${stamp
        ? `<img src="${stamp}" alt="Company stamp" style="max-height:80px;max-width:160px;object-fit:contain;margin-bottom:8px"/>`
        : `<div style="height:64px;border-bottom:1px solid #cbd5e0;margin-bottom:8px"></div>`
      }
      <div style="font-size:11px;color:#666">Signature &amp; stamp</div>
    </div>
    ${qrDataUrl ? `
    <div style="text-align:center;flex-shrink:0">
      <img src="${qrDataUrl}" alt="Scan to verify" style="width:90px;height:90px;display:block;margin:0 auto 4px"/>
      <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Scan to verify</div>
    </div>` : ''}
  </div>
  <div style="border-top:1px solid #e5e5e5;padding-top:16px;font-size:10px;color:#999;text-align:center">
    FNC Group ERP &bull; Generated ${new Date().toLocaleDateString('en-GB')}
  </div>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${inv.invoiceNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #1a1a1a; line-height: 1.5; background: white; }
    section { page-break-inside: avoid; break-inside: avoid; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    ${letterhead ? `
    html, body { margin: 0; padding: 0; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Fixed elements hidden on screen, shown on print */
    .lh-bg { display: none; }
    .lh-bg { display: none; }
    .lh-qr { display: none; }
    .screen-auth { display: flex; }
    .header-qr { display: block; }
    .page { position: relative; padding: 74mm 15mm 85mm; max-width: 100%; min-height: 297mm; }
    .lh-stamp { text-align: center; padding-top: 12px; border-top: 1px solid #e5e5e5; margin-top: 8px; }
    .lh-stamp-img { max-height: 230px; max-width: 320px; object-fit: contain; display: block; margin: 0 auto 6px; }
    @media print {
      .lh-bg { display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; }
      .lh-bg img { width: 100%; height: 100%; display: block; }
      .lh-qr { display: block; position: fixed; bottom: 40mm; right: 14mm; text-align: center; z-index: 10; }
      .screen-auth { display: none; }
      .header-qr { display: none; }
      .lh-stamp { position: fixed; bottom: 43mm; left: 0; right: 0; border-top: none; padding-top: 0; margin-top: 0; z-index: 10; }
      .lh-stamp-img { max-height: 110px; max-width: 160px; }
      .page { padding: 54mm 15mm 50mm; }
      @page { size: A4; margin: 0; }
    }
    ` : `
    .page { padding: 40px; max-width: 900px; margin: 0 auto; }
    @media print {
      .page { padding: 15mm; max-width: 100%; }
      @page { size: A4; margin: 0; }
    }
    `}
  </style>
  ${letterhead ? `
  <style>
    @media screen {
      body {
        background-image: url('${letterhead}');
        background-size: 100% 297mm;
        background-repeat: no-repeat;
        background-attachment: scroll;
      }
    }
  </style>` : ''}
</head>
<body>
${letterhead ? `
<div class="lh-bg"><img src="${letterhead}" alt=""/></div>
<!--
<div class="lh-qr">
  ${qrDataUrl ? `<img src="${qrDataUrl}" alt="Scan to verify" style="width:72px;height:72px;display:block;margin:0 auto 3px"/>
  <div style="font-size:8px;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Scan to verify</div>` : ''}
  <div style="font-size:9px;color:#1a3c5e;white-space:nowrap;border-top:1px solid #cbd5e0;padding-top:4px">
    <strong style="text-transform:uppercase;letter-spacing:0.4px">Authorized By</strong>&ensp;&bull;&ensp;Signature &amp; stamp
  </div>
</div>-->
` : ''}
<div class="page">

  ${letterhead ? letterheadHeader : `
  <!-- Standard mode: full company header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #1a3c5e;margin-bottom:32px">
    <div>
      <div style="font-size:22px;font-weight:700;color:#1a3c5e;margin-bottom:4px">${inv.companyName ?? 'FNC Group'}</div>
      <div style="font-size:11px;color:#666;line-height:1.6">
        ${inv.companyLegalName ?? ''}<br>
        ${inv.companyCountry ?? 'IQ'}<br>
        FNC Group
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Invoice</div>
      <div style="font-size:14px;color:#666;margin-top:4px">${inv.invoiceNumber}</div>
      <div style="margin-top:8px"><span style="${statusBadgeStyle}">${inv.status}</span></div>
    </div>
  </div>
  `}

  <!-- Meta grid -->
  <section style="display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:0;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;overflow:hidden">
    <div style="padding:16px 20px;border-right:1px solid #e2e8f0">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:10px">Bill To</div>
      <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:2px">${inv.clientName ?? '—'}</div>
    </div>
    <div style="padding:16px 20px;border-right:1px solid #e2e8f0">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:10px">Invoice Details</div>
      <table style="font-size:12px;color:#444;line-height:2;width:100%;border-collapse:collapse">
        <tr><td style="color:#888;padding-right:10px;white-space:nowrap">Invoice date</td><td style="font-weight:500">${fmtDate(inv.invoiceDate)}</td></tr>
        <tr><td style="color:#888;white-space:nowrap">Due date</td><td style="color:#c53030;font-weight:600">${fmtDate(inv.dueDate)}</td></tr>
        <tr><td style="color:#888;white-space:nowrap">Payment terms</td><td>Net ${inv.paymentTermsDays ?? 30} days</td></tr>
        <tr><td style="color:#888;white-space:nowrap">Billing method</td><td style="text-transform:capitalize">${(inv.billingMethod ?? '').replace(/_/g, ' ')}</td></tr>
      </table>
    </div>
    <div style="padding:16px 20px">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:10px">Project</div>
      <table style="font-size:12px;color:#444;line-height:2;width:100%;border-collapse:collapse">
        <tr><td style="color:#888;padding-right:10px;white-space:nowrap">Code</td><td style="font-family:monospace;color:#1a3c5e;font-weight:600">${inv.projectCode ?? '—'}</td></tr>
        <tr><td style="color:#888;white-space:nowrap">Name</td><td style="font-weight:500">${inv.projectName ?? '—'}</td></tr>
        <tr><td style="color:#888;white-space:nowrap">Contract</td><td style="font-family:monospace;font-size:11px">${inv.contractNumber ?? '—'}</td></tr>
      </table>
    </div>
  </section>

  <!-- Lines table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:28px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
    <thead>
      <tr>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:left;width:36px">#</th>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:left">Description</th>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:56px">Qty</th>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:140px">Unit Cost</th>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:140px">Subtotal</th>
        ${hasMargin ? `
          <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:70px">Margin%</th>
          <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:130px">Margin</th>
        ` : ''}
        ${hasTax ? `
          <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:60px">Tax%</th>
          <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:120px">Tax</th>
        ` : ''}
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:150px">Total</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <!-- Totals -->
  <section style="display:flex;justify-content:flex-end;margin-bottom:28px">
    <div style="min-width:340px">
      ${(hasMargin || hasTax) ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#555;border-bottom:1px solid #eef0f3">
        <span>Subtotal</span><span style="font-family:monospace">${fmt(subtotal, cur)}</span>
      </div>` : ''}
      ${hasMargin ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#555;border-bottom:1px solid #eef0f3">
        <span>Margin</span><span style="font-family:monospace">${fmt(marginTotal, cur)}</span>
      </div>` : ''}
      ${hasTax ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#555;border-bottom:1px solid #eef0f3">
        <span>Tax</span><span style="font-family:monospace">${fmt(taxTotal, cur)}</span>
      </div>` : ''}
      ${inv.retentionAmount > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#c53030;border-bottom:1px solid #eef0f3">
        <span>Retention (${(retentionPct * 100).toFixed(0)}%)</span>
        <span style="font-family:monospace">(${fmt(inv.retentionAmount, cur)})</span>
      </div>` : ''}
      ${inv.whtApplies && (inv.whtAmount ?? 0) > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#c53030;border-bottom:1px solid #eef0f3">
        <span>WHT</span>
        <span style="font-family:monospace">(${fmt(inv.whtAmount ?? 0, cur)})</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#1a3c5e;border-radius:6px;margin-top:8px">
        <span style="font-size:13px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.8px">Net Payable</span>
        <span style="font-size:18px;font-weight:700;font-family:monospace;color:white">${fmt(inv.netPayable, cur)}</span>
      </div>
    </div>
  </section>

  <!-- Payment type badge + bank details -->
  <section style="margin-bottom:32px">
  <div style="margin-bottom:16px">
    <span style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:600;background:#1a3c5e;color:#fff;text-transform:uppercase;letter-spacing:0.5px">
      Payment Type: ${pt === 'cash' ? 'Cash' : 'Wire Transfer'}
    </span>
  </div>

  <!-- Payment instructions + bank details -->
  <div style="padding:20px;background:#f8fafc;border-radius:8px">
    <p style="font-size:11px;color:#666;line-height:1.7;margin-bottom:${pt === 'cash' || !bankAccount ? '0' : '16px'}">
      Please ${pt === 'cash' ? 'arrange cash payment' : 'transfer payment'} within ${inv.paymentTermsDays ?? 30} days of invoice date.
      Reference invoice number ${inv.invoiceNumber} in your payment.
    </p>
    ${pt !== 'cash' && bankAccount ? `
    <div>
      <p style="font-size:12px;font-weight:700;color:#1a3c5e;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">
        Banking Information &mdash; ${bankAccount.accountName} (${bankAccount.currencyCode})
      </p>
      <div style="display:grid;grid-template-columns:1fr${bankAccount.intermediaryBankName ? ' 1fr' : ''};gap:24px">
        <div style="font-size:12px;color:#444;line-height:2">
          <span style="color:#666">Bank Name: </span><strong>${bankAccount.bankName}</strong><br>
          ${bankAccount.beneficiaryName ? `<span style="color:#666">Beneficiary Name: </span><strong>${bankAccount.beneficiaryName}</strong><br>` : ''}
          ${bankAccount.accountNumber ? `<span style="color:#666">Account Number: </span>${bankAccount.accountNumber}<br>` : ''}
          ${bankAccount.iban ? `<span style="color:#666">IBAN: </span><span style="font-family:monospace">${bankAccount.iban}</span><br>` : ''}
          ${bankAccount.swift ? `<span style="color:#666">SWIFT Code: </span>${bankAccount.swift}<br>` : ''}
          ${bankAccount.branchCode ? `<span style="color:#666">Branch Code: </span>${bankAccount.branchCode}<br>` : ''}
          ${bankAccount.bankAddress ? `<span style="color:#666">Bank Address:</span><br><span style="color:#555">${bankAccount.bankAddress}</span>` : ''}
        </div>
        ${bankAccount.intermediaryBankName ? `
        <div style="font-size:12px;color:#444;line-height:2">
          <p style="font-size:11px;font-weight:600;color:#1a3c5e;margin-bottom:6px">Intermediary Bank:</p>
          <strong>${bankAccount.intermediaryBankName}</strong><br>
          ${bankAccount.intermediarySwift ? `SWIFT: ${bankAccount.intermediarySwift}<br>` : ''}
          ${bankAccount.intermediaryCountry ? `${bankAccount.intermediaryCountry}` : ''}
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}
  </div>
  </section>

  <section>
  ${letterhead ? letterheadBottom : standardBottom}
  </section>

</div>
</body>
</html>`
}
