export interface ReqPrintLine {
  description: string
  product_name?: string | null
  product_name_ar?: string | null
  qty: number
  /** Qty of this line covered from existing stock, out of qty above — shown
   *  as an explicit note so it's clear how much (if any) came from
   *  inventory rather than being purchased, for both a fully- and a
   *  partially-covered line. */
  qty_from_stock?: number
  uom: string
  currency_code: string
  unit_price: number
  total: number
  /** Reference-only per-unit store price behind fromStock's value — a
   *  fully-from-stock line's unit_price is 0/unset (nothing was purchased),
   *  so showing that next to a nonzero total reads as a bug; store_price is
   *  what actually produced that number. */
  store_price?: number | null
  store_price_currency?: string | null
  /** Set whenever any of this line's qty came from stock (qty_from_stock >
   *  0) — total above only ever reflects the purchased portion (0 when
   *  fully covered from stock, see RequisitionDetail.tsx's
   *  fromStockDisplayValue), so a partially-covered line needs both total
   *  AND this shown, not just one. */
  fromStock?: { amount: number; currency: string } | null
}

export interface ReqPrintApprovalStep {
  label: string
  name: string
  date: string
}

export interface ReqPrintCurrencyTotal {
  currency: string
  amount: number
}

export interface ReqPrintData {
  requisition_number: string
  /** Display-ready label (e.g. "Pending Approval") — pass through getRequisitionStatusLabel first. */
  status: string
  priority: string
  purpose?: string | null
  created_at: string
  expected_delivery_date?: string | null
  projectCode?: string | null
  projectName?: string | null
  branchName?: string | null
  organizerName?: string | null
  lines: ReqPrintLine[]
  /** Purchased-amount subtotal per currency (mirrors req.currencyTotals — excludes from-stock lines, which are 0 there by design). */
  currencyTotals: ReqPrintCurrencyTotal[]
  /** From-stock reference value per currency, folded in separately — see ReqPrintLine.fromStock. */
  fromStockTotals: ReqPrintCurrencyTotal[]
  approvalTrail?: ReqPrintApprovalStep[]
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

function fmtDateTime(d: string): string {
  try {
    return new Date(d).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

export function buildRequisitionHTML(req: ReqPrintData): string {
  const lineRows = req.lines
    .map((l, i) => {
      const qtyFromStock = l.qty_from_stock ?? 0
      const toBuy = Math.max(0, l.qty - qtyFromStock)
      return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px">
        <div style="font-weight:600;color:#1a1a1a">${l.description || l.product_name || '—'}</div>
        ${l.product_name_ar ? `<div dir="rtl" style="color:#888;margin-top:2px;text-align:left">${l.product_name_ar}</div>` : ''}
        ${
          qtyFromStock > 0
            ? `<div style="color:#0369a1;font-size:11px;margin-top:2px">${qtyFromStock} ${l.uom} from stock${toBuy > 0 ? ` · ${toBuy} ${l.uom} to buy` : ''}</div>`
            : ''
        }
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right">${l.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;color:#666">${l.uom}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-family:monospace">
        ${
          // A from-stock line's unit_price is 0/unset since nothing was
          // purchased — showing that next to a nonzero total (below) reads
          // as a bug. store_price is the figure that actually produced it.
          toBuy > 0
            ? fmt(l.unit_price, l.currency_code)
            : l.store_price != null
              ? fmt(l.store_price, l.store_price_currency ?? l.currency_code)
              : '—'
        }
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-family:monospace;font-weight:600">
        ${
          toBuy > 0
            ? fmt(l.total, l.currency_code) +
              (l.fromStock
                ? `<br><span style="font-size:10px;font-weight:400;color:#888">+ ${fmt(l.fromStock.amount, l.fromStock.currency)} (from stock)</span>`
                : '')
            : l.fromStock
              ? `<span style="color:#888;font-weight:400">${fmt(l.fromStock.amount, l.fromStock.currency)}<br><span style="font-size:10px">(from stock)</span></span>`
              : fmt(l.total, l.currency_code)
        }
      </td>
    </tr>
  `
    })
    .join('')

  const priorityColor = PRIORITY_COLOR[req.priority] ?? PRIORITY_COLOR.low
  const priorityLabel = PRIORITY_LABEL[req.priority] ?? 'Standard'

  const totalRows = [
    ...req.currencyTotals.map(
      (ct) => `
      <tr>
        <td style="padding:8px 16px;font-size:13px;color:#555">Total (${ct.currency})</td>
        <td style="padding:8px 16px;font-size:13px;text-align:right;font-family:monospace;font-weight:600">${fmt(ct.amount, ct.currency)}</td>
      </tr>`,
    ),
    ...req.fromStockTotals.map(
      (ft) => `
      <tr>
        <td style="padding:8px 16px;font-size:12px;color:#888">+ From stock (${ft.currency})</td>
        <td style="padding:8px 16px;font-size:12px;text-align:right;font-family:monospace;color:#888">${fmt(ft.amount, ft.currency)}</td>
      </tr>`,
    ),
  ].join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Requisition ${req.requisition_number}</title>
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
      <div style="font-size:22px;font-weight:700;color:#1a3c5e;margin-bottom:4px">FNC Group</div>
      <div style="font-size:11px;color:#888">${req.branchName ?? 'Farage Printing Industries'}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Requisition</div>
      <div style="font-size:15px;font-family:monospace;color:#1a3c5e;margin-top:4px;font-weight:600">${req.requisition_number}</div>
      <div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
        <div style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:#1a3c5e18;color:#1a3c5e;border:1px solid #1a3c5e40">
          ${req.status}
        </div>
        ${
          req.priority !== 'low'
            ? `
        <div style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:${priorityColor}18;color:${priorityColor};border:1px solid ${priorityColor}40">
          ${priorityLabel}
        </div>`
            : ''
        }
      </div>
    </div>
  </div>

  <!-- Meta grid -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
    <div>
      <div style="font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Project</div>
      <div style="font-size:15px;font-weight:600;color:#1a1a1a">${req.projectCode ? `${req.projectCode} — ${req.projectName ?? ''}` : (req.projectName ?? (req.purpose === 'stock' ? 'Stock replenishment' : '—'))}</div>
    </div>
    <div style="text-align:right">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Issue date</td>
          <td style="padding:4px 0;font-size:12px;font-weight:600;text-align:right">${fmtDate(req.created_at)}</td>
        </tr>
        ${
          req.expected_delivery_date
            ? `
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Expected delivery</td>
          <td style="padding:4px 0;font-size:12px;font-weight:600;text-align:right">${fmtDate(req.expected_delivery_date)}</td>
        </tr>`
            : ''
        }
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Prepared by</td>
          <td style="padding:4px 0;font-size:12px;text-align:right;color:#555">${req.organizerName ?? '—'}</td>
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
      ${
        totalRows ||
        `<tr><td style="padding:8px 16px;font-size:13px;color:#888">No purchase amount — every line is from stock</td></tr>`
      }
    </table>
  </div>

  ${
    req.approvalTrail && req.approvalTrail.length > 0
      ? `
  <!-- Approval trail -->
  <div style="margin-bottom:24px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">
    <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px">
      Approval Trail
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${req.approvalTrail
        .map(
          (s) => `
      <tr>
        <td style="padding:3px 0;font-size:12px;color:#78350f;width:140px">${s.label}</td>
        <td style="padding:3px 0;font-size:12px;font-weight:600;color:#1a1a1a">${s.name}</td>
        <td style="padding:3px 0;font-size:11px;text-align:right;color:#92400e">${fmtDateTime(s.date)}</td>
      </tr>`,
        )
        .join('')}
    </table>
  </div>`
      : ''
  }

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-between;font-size:11px;color:#888">
    <div>${req.branchName ?? 'Farage Printing Industries'} — ${req.requisition_number}</div>
    <div>Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
  </div>

</div>
</body>
</html>`
}
