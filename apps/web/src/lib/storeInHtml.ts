export interface StoreInPrintLine {
  productName?: string | null
  sku?: string | null
  qtyReceived: number
  uom?: string | null
  unitPrice: number
  currencyCode?: string | null
  fxRateToBase?: number | null
}

export interface StoreInPrintData {
  receiptNumber: string
  receiptDate: string
  poNumber?: string | null
  receivedFromName?: string | null
  locationName?: string | null
  notes?: string | null
  receivedByName?: string | null
  companyName?: string | null
  baseCurrencyCode?: string | null
  lines: StoreInPrintLine[]
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-IQ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
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

export function buildStoreInHTML(si: StoreInPrintData): string {
  const baseCcy = si.baseCurrencyCode ?? 'IQD'
  const lineTotal = (l: StoreInPrintLine) => l.qtyReceived * l.unitPrice * (l.fxRateToBase ?? 1)
  const totalCost = si.lines.reduce((s, l) => s + lineTotal(l), 0)

  const lineRows = si.lines
    .map((l, i) => {
      const total = lineTotal(l)
      const ccy = l.currencyCode ?? baseCcy
      return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px">
        <div style="font-weight:600;color:#1a1a1a">${l.productName ?? '—'}</div>
        ${l.sku ? `<div style="color:#888;margin-top:2px">${l.sku}</div>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right">${l.qtyReceived}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;color:#666">${l.uom ?? ''}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-family:monospace">${fmt(l.unitPrice)} ${ccy}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-family:monospace;font-weight:600">${fmt(total)} ${baseCcy}</td>
    </tr>
  `
    })
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Store In ${si.receiptNumber}</title>
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
      <div style="font-size:22px;font-weight:700;color:#1a3c5e;margin-bottom:4px">${si.companyName ?? ''}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Store In</div>
      <div style="font-size:15px;font-family:monospace;color:#1a3c5e;margin-top:4px;font-weight:600">${si.receiptNumber}</div>
    </div>
  </div>

  <!-- Meta grid -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
    <div>
      <div style="font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Received From</div>
      <div style="font-size:15px;font-weight:600;color:#1a1a1a">${si.receivedFromName ?? '—'}</div>
      ${si.poNumber ? `<div style="font-size:12px;color:#888;margin-top:4px">Purchase Order: ${si.poNumber}</div>` : ''}
    </div>
    <div style="text-align:right">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Receipt date</td>
          <td style="padding:4px 0;font-size:12px;font-weight:600;text-align:right">${fmtDate(si.receiptDate)}</td>
        </tr>
        ${
          si.locationName
            ? `<tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Location</td>
          <td style="padding:4px 0;font-size:12px;font-weight:600;text-align:right">${si.locationName}</td>
        </tr>`
            : ''
        }
        <tr>
          <td style="padding:4px 0;font-size:11px;color:#888">Received by</td>
          <td style="padding:4px 0;font-size:12px;text-align:right;color:#555">${si.receivedByName ?? '—'}</td>
        </tr>
      </table>
    </div>
  </div>

  ${
    si.notes
      ? `<div style="margin-bottom:24px;padding:12px 16px;background:#f8f9fa;border-radius:6px;font-size:12px;color:#555">
    <strong style="color:#1a3c5e">Notes:</strong> ${si.notes}
  </div>`
      : ''
  }

  <!-- Lines table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <thead>
      <tr style="background:#1a3c5e;color:#fff">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;width:36px">#</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600">Item</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600">Qty</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600">UOM</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600">Unit price</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600">Total</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <!-- Total -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:48px">
    <table style="border-collapse:collapse;min-width:280px">
      <tr style="border-top:2px solid #1a3c5e;background:#f8f9fa">
        <td style="padding:10px 16px;font-size:14px;font-weight:700;color:#1a3c5e">Total</td>
        <td style="padding:10px 16px;font-size:14px;font-weight:700;text-align:right;font-family:monospace;color:#1a3c5e">${fmt(totalCost)} ${baseCcy}</td>
      </tr>
    </table>
  </div>

  <!-- Signatures -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-bottom:32px">
    <div>
      <div style="border-bottom:1px solid #1a1a1a;height:48px"></div>
      <div style="font-size:11px;color:#888;margin-top:6px">Delivered By — Signature &amp; Date</div>
    </div>
    <div>
      <div style="border-bottom:1px solid #1a1a1a;height:48px"></div>
      <div style="font-size:11px;color:#888;margin-top:6px">Received By — Signature &amp; Date</div>
    </div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-between;font-size:11px;color:#888">
    <div>${si.companyName ?? ''} — ${si.receiptNumber}</div>
    <div>Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
  </div>

</div>
</body>
</html>`
}
