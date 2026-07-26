export interface POPrintLine {
  description: string
  product_name?: string | null
  qty: number
  uom: string
  unit_price: number
  total: number
}

export interface POPrintData {
  po_number: string
  status: string
  priority: string
  created_at: string
  expected_delivery_date?: string | null
  currency_code: string
  total_amount: number
  subtotal: number
  vendor_name?: string | null
  created_by_email?: string | null
  companyName?: string | null
  lines: POPrintLine[]
}

function fmt(n: number, currency: string): string {
  return (
    new Intl.NumberFormat('en-IQ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      n,
    ) +
    ' ' +
    currency
  )
}

function fmtDate(d: string): string {
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

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Standard',
  high: 'High Priority',
  emergency: 'EMERGENCY',
}
const PRIORITY_COLOR: Record<string, string> = {
  low: '#1a3c5e',
  high: '#d97706',
  emergency: '#dc2626',
}

export function buildPurchaseOrderHTML(po: POPrintData): string {
  const cur = po.currency_code ?? 'IQD'

  const lineRows = po.lines
    .map(
      (l, i) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px">
        ${l.product_name ? `<div style="font-weight:600;color:#1a1a1a">${l.product_name}</div><div style="color:#888;margin-top:2px">${l.description}</div>` : `<div>${l.description}</div>`}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right">${l.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;color:#666">${l.uom}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-family:monospace">${fmt(l.unit_price, cur)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-family:monospace;font-weight:600">${fmt(l.total, cur)}</td>
    </tr>
  `,
    )
    .join('')

  const priorityColor = PRIORITY_COLOR[po.priority] ?? PRIORITY_COLOR.low
  const priorityLabel = PRIORITY_LABEL[po.priority] ?? 'Standard'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Purchase Order ${po.po_number}</title>
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
      <div style="font-size:22px;font-weight:700;color:#1a3c5e;margin-bottom:4px">${po.companyName ?? 'FNC Group'}</div>
      <div style="font-size:11px;color:#888">Farage Printing Industries</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Purchase Order</div>
      <div style="font-size:15px;font-family:monospace;color:#1a3c5e;margin-top:4px;font-weight:600">${po.po_number}</div>
      ${
        po.priority !== 'low'
          ? `
      <div style="margin-top:6px;display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:${priorityColor}18;color:${priorityColor};border:1px solid ${priorityColor}40">
        ${priorityLabel}
      </div>`
          : ''
      }
    </div>
  </div>

  <!-- Meta grid -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
    <div>
      <div style="font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Vendor</div>
      <div style="font-size:15px;font-weight:600;color:#1a1a1a">${po.vendor_name ?? '—'}</div>
    </div>
    <div style="text-align:right">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Issue date</td>
          <td style="padding:4px 0;font-size:12px;font-weight:600;text-align:right">${fmtDate(po.created_at)}</td>
        </tr>
        ${
          po.expected_delivery_date
            ? `
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Expected delivery</td>
          <td style="padding:4px 0;font-size:12px;font-weight:600;text-align:right">${fmtDate(po.expected_delivery_date)}</td>
        </tr>`
            : ''
        }
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Currency</td>
          <td style="padding:4px 0;font-size:12px;font-weight:600;text-align:right">${cur}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Prepared by</td>
          <td style="padding:4px 0;font-size:12px;text-align:right;color:#555">${po.created_by_email ?? '—'}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- Lines table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <thead>
      <tr style="background:#1a3c5e;color:#fff">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;width:36px">#</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600">Description</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600">Qty</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600">UOM</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600">Unit price</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600">Total</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <!-- Total -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:32px">
    <table style="border-collapse:collapse;min-width:280px">
      <tr>
        <td style="padding:8px 16px;font-size:13px;color:#555">Subtotal</td>
        <td style="padding:8px 16px;font-size:13px;text-align:right;font-family:monospace">${fmt(po.subtotal ?? po.total_amount, cur)}</td>
      </tr>
      <tr style="border-top:2px solid #1a3c5e;background:#f8f9fa">
        <td style="padding:10px 16px;font-size:14px;font-weight:700;color:#1a3c5e">Total</td>
        <td style="padding:10px 16px;font-size:14px;font-weight:700;text-align:right;font-family:monospace;color:#1a3c5e">${fmt(po.total_amount, cur)}</td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-between;font-size:11px;color:#888">
    <div>${po.companyName ?? 'FNC Group'} — ${po.po_number}</div>
    <div>Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
  </div>

</div>
</body>
</html>`
}
