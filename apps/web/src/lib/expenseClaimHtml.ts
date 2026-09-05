export interface ExpenseClaimPrintLine {
  expenseDate: string
  categoryName?: string | null
  accountCode?: string | null
  accountName?: string | null
  description?: string | null
  amount: number
  currencyCode?: string | null
}

export interface ExpenseClaimPrintData {
  claimNumber: string
  employeeName: string
  currencyCode: string
  totalAmount: number
  description?: string | null
  createdAt: string
  submittedAt?: string | null
  approvedAt?: string | null
  approvedByName?: string | null
  paidAt?: string | null
  paidByName?: string | null
  requestedByName?: string | null
  companyName?: string | null
  lines: ExpenseClaimPrintLine[]
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-IQ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

export function buildExpenseClaimHTML(ec: ExpenseClaimPrintData): string {
  const ccy = ec.currencyCode

  const lineRows = ec.lines
    .map((l, i) => {
      const lineCcy = l.currencyCode ?? ccy
      return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#666">${fmtDate(l.expenseDate)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px">${l.categoryName ?? '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px">
        ${l.accountCode ? `<span style="color:#888;font-family:monospace">${l.accountCode}</span> ` : ''}${l.accountName ?? ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#666">${l.description ?? '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-family:monospace;font-weight:600">${fmt(l.amount)} ${lineCcy}</td>
    </tr>
  `
    })
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Expense Claim ${ec.claimNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #1a1a1a; line-height: 1.5; background: white; }
    .page { padding: 40px; max-width: 900px; margin: 0 auto; }
    @media print {
      .page { padding: 20px; max-width: 100%; }
      @page { size: A4; margin: 15mm; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #1a3c5e;margin-bottom:32px">
    <div>
      <div style="font-size:22px;font-weight:700;color:#1a3c5e;margin-bottom:4px">${ec.companyName ?? ''}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Expense Claim</div>
      <div style="font-size:15px;font-family:monospace;color:#1a3c5e;margin-top:4px;font-weight:600">${ec.claimNumber}</div>
    </div>
  </div>

  <!-- Meta grid -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
    <div>
      <div style="font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Employee</div>
      <div style="font-size:15px;font-weight:600;color:#1a1a1a">${ec.employeeName}</div>
      ${
        ec.requestedByName && ec.requestedByName !== ec.employeeName
          ? `<div style="font-size:12px;color:#888;margin-top:4px">Requested by: ${ec.requestedByName}</div>`
          : ''
      }
    </div>
    <div style="text-align:right">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Created</td>
          <td style="padding:4px 0;font-size:12px;font-weight:600;text-align:right">${fmtDate(ec.createdAt)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Submitted</td>
          <td style="padding:4px 0;font-size:12px;text-align:right;color:#555">${fmtDate(ec.submittedAt)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Approved</td>
          <td style="padding:4px 0;font-size:12px;text-align:right;color:#555">${fmtDate(ec.approvedAt)}${ec.approvedByName ? ` — ${ec.approvedByName}` : ''}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Paid</td>
          <td style="padding:4px 0;font-size:12px;text-align:right;color:#555">${fmtDate(ec.paidAt)}${ec.paidByName ? ` — ${ec.paidByName}` : ''}</td>
        </tr>
      </table>
    </div>
  </div>

  ${
    ec.description
      ? `<div style="margin-bottom:24px;padding:12px 16px;background:#f8f9fa;border-radius:6px;font-size:12px;color:#555">
    <strong style="color:#1a3c5e">Description:</strong> ${ec.description}
  </div>`
      : ''
  }

  <!-- Lines table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <thead>
      <tr style="background:#1a3c5e;color:#fff">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;width:36px">#</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600">Date</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600">Category</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600">Account</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600">Description</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600">Amount</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <!-- Total -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:48px">
    <table style="border-collapse:collapse;min-width:280px">
      <tr style="border-top:2px solid #1a3c5e;background:#f8f9fa">
        <td style="padding:10px 16px;font-size:14px;font-weight:700;color:#1a3c5e">Total</td>
        <td style="padding:10px 16px;font-size:14px;font-weight:700;text-align:right;font-family:monospace;color:#1a3c5e">${fmt(ec.totalAmount)} ${ccy}</td>
      </tr>
    </table>
  </div>

  <!-- Signatures -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-bottom:32px">
    <div>
      <div style="border-bottom:1px solid #1a1a1a;height:48px"></div>
      <div style="font-size:11px;color:#888;margin-top:6px">Claimed By — Signature &amp; Date</div>
    </div>
    <div>
      <div style="border-bottom:1px solid #1a1a1a;height:48px"></div>
      <div style="font-size:11px;color:#888;margin-top:6px">Approved By — Signature &amp; Date</div>
    </div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-between;font-size:11px;color:#888">
    <div>${ec.companyName ?? ''} — ${ec.claimNumber}</div>
    <div>Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
  </div>

</div>
</body>
</html>`
}
