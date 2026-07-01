// Print HTML templates for General Journal and Payment Voucher
// Matching the physical FNC forms shown in company documents

export interface JournalPrintLine {
  account_code?: string
  account_name?: string
  description?: string
  debit: number
  credit: number
  currency_code: string
  debit_usd?: number
  credit_usd?: number
}

export interface JournalLinkedPO {
  po_number: string
  vendor_name?: string
  total_amount?: string
  currency_code?: string
}

export interface JournalPrintData {
  reference: string
  entry_date: string
  description?: string
  lines: JournalPrintLine[]
  linked_pos: JournalLinkedPO[]
  companyName?: string
  created_by_email?: string
  accountant_email?: string
  auditor_email?: string
  total_debit: number
  total_credit: number
  journalTemplateImage?: string | null
}

export interface VoucherPrintLine {
  statement: string
  acct_1?: string
  acct_2?: string
  acct_3?: string
  acct_4?: string
  acct_5?: string
  amount_iqd: number
  amount_usd: number
}

export interface VoucherPrintJournal {
  reference: string
  entry_date: string
  description?: string
}

export interface VoucherPrintData {
  voucher_number: string
  voucher_date: string
  received_from: string
  reference_to?: string
  bank_account_fund?: string
  receiver_name?: string
  total_amount_iqd: number
  total_amount_usd: number
  lines: VoucherPrintLine[]
  journals: VoucherPrintJournal[]
  companyName?: string
  cashier_email?: string
  auditor_email?: string
  pvTemplateImage?: string | null
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return d }
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-IQ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// ─── Shared base styles ──────────────────────────────────────────────────────

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: white; }
  .page { padding: 20px 28px; max-width: 100%; }
  @media print { .no-print { display: none !important; } @page { size: A4 portrait; margin: 8mm; } }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #aaa; padding: 4px 6px; }
  th { background: #d0d7e0; font-size: 11px; font-weight: 600; text-align: center; }
`

// CSS used when a form template image is provided as background
const TEMPLATE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; background: white; font-family: 'Inter', Arial, sans-serif; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page {
    position: relative;
    width: 297mm;
    min-height: 210mm;
    overflow: hidden;
  }
  .tmpl-bg {
    position: absolute;
    top: 0; left: 0;
    width: 297mm; height: 210mm;
    z-index: 0;
    pointer-events: none;
  }
  .tmpl-bg img { width: 100%; height: 100%; display: block; }
  .val {
    position: absolute;
    z-index: 1;
    font-size: 10px;
    color: #1a1a1a;
    white-space: nowrap;
    overflow: hidden;
  }
  .val-r { text-align: right; }
  .val-c { text-align: center; }
  @media print {
    @page { size: A4 landscape; margin: 0; }
    .tmpl-bg { position: fixed; }
  }
`

// ─── PAYMENT VOUCHER ─────────────────────────────────────────────────────────

function buildPVTemplateHTML(data: VoucherPrintData, template: string): string {
  const journalList = data.journals.length > 0
    ? data.journals.map((j) => `${j.reference} (${fmtDate(j.entry_date)})`).join('، ')
    : '—'

  const refText = data.reference_to ?? journalList

  // ── Column x-positions (A4 landscape 297mm wide)
  // 5 acct cols × 14mm = 70mm | Statement 100mm | دينار 35mm | دولار 35mm
  const C5  = { l: 39,   w: 14 }  // column "5"
  const C4  = { l: 55,  w: 14 }  // column "4"
  const C3  = { l: 73,  w: 14 }  // column "3"
  const C2  = { l: 89,  w: 14 }  // column "2"
  const C1  = { l: 106,  w: 14 }  // column "1"
  const CS  = { l: 125,  w: 115 } // Statement / البيان
  const CIQD = { l: 195, w: 45 } // دينار (IQD)
  const CUSD = { l: 232, w: 38 } // دولار (USD)

  // ── Row y-positions: landscape A4, data rows start ~100mm, pitch 10mm
  const ROW_START = 100
  const ROW_H = 10
  const MAX_ROWS = 7

  const lineOverlays = data.lines.slice(0, MAX_ROWS).map((l, i) => {
    const y = ROW_START + i * ROW_H
    return `
      <span class="val val-c" style="top:${y}mm;left:${C5.l}mm;width:${C5.w}mm">${l.acct_1 ?? ''}</span>
      <span class="val val-c" style="top:${y}mm;left:${C4.l}mm;width:${C4.w}mm">${l.acct_2 ?? ''}</span>
      <span class="val val-c" style="top:${y}mm;left:${C3.l}mm;width:${C3.w}mm">${l.acct_3 ?? ''}</span>
      <span class="val val-c" style="top:${y}mm;left:${C2.l}mm;width:${C2.w}mm">${l.acct_4 ?? ''}</span>
      <span class="val val-c" style="top:${y}mm;left:${C1.l}mm;width:${C1.w}mm">${l.acct_5 ?? ''}</span>
      <span class="val" style="top:${y}mm;left:${CS.l}mm;width:${CS.w}mm;font-size:9.5px">${l.statement}</span>
      <span class="val val-r" style="top:${y}mm;left:${CIQD.l}mm;width:${CIQD.w}mm">${l.amount_iqd > 0 ? fmtNum(l.amount_iqd) : ''}</span>
      <span class="val val-r" style="top:${y}mm;left:${CUSD.l}mm;width:${CUSD.w}mm">${l.amount_usd > 0 ? fmtNum(l.amount_usd) : ''}</span>
    `
  }).join('')

  const totalY = ROW_START + MAX_ROWS * ROW_H  -13      // e.g. 100 + 70 = 170mm
  const sigY   = totalY + 13                        // ~192mm — just above bottom of landscape page                        

  return `<!DOCTYPE html><html dir="ltr">
<head style="font-weight:600">
  <meta charset="UTF-8">
  <title>Payment Voucher – ${data.voucher_number}</title>
  <style>${TEMPLATE_CSS}</style>
</head>
<body>
<div class="page">
  <div class="tmpl-bg"><img src="${template}" alt=""/></div>

  <!-- Top-left amount boxes (landscape): دينار عراقي left, دولار right -->
  <span class="val val-r" style="top:20mm;left:18mm;width:45mm;font-size:11px;font-weight:600">${data.total_amount_iqd > 0 ? fmtNum(data.total_amount_iqd) : ''}</span>
  <span class="val val-r" style="top:20mm;left:53mm;width:40mm;font-size:11px;font-weight:600">${data.total_amount_usd > 0 ? fmtNum(data.total_amount_usd) : ''}</span>

  <!-- Voucher number -->
  <span class="val val-c" style="top:33mm;left:115mm;width:90mm;font-size:10px">${data.voucher_number}</span>

  <!-- Field lines -->
  <span class="val" style="top:42mm;left:68mm;width:220mm">${data.received_from}</span>
  <span class="val" style="top:51mm;left:100mm;width:220mm">${data.total_amount_iqd > 0 ? fmtNum(data.total_amount_iqd) + ' IQD' : ''}${data.total_amount_usd > 0 ? '   /   ' + fmtNum(data.total_amount_usd) + ' USD' : ''}</span>
  <span class="val" style="top:66mm;left:66mm;width:120mm">${refText}</span>
  <span class="val val-r" style="top:65mm;left:110mm;width:80mm">${fmtDate(data.voucher_date)}</span>
  <span class="val val-r" style="top:78mm;left:105mm;width:80mm">${data.bank_account_fund ?? ''}</span>

  <!-- Data rows -->
  ${lineOverlays}

  <!-- Total row -->
  <span class="val val-r" style="top:${totalY}mm;left:${CIQD.l}mm;width:${CIQD.w}mm;font-weight:600">${fmtNum(data.total_amount_iqd)}</span>
  <span class="val val-r" style="top:${totalY}mm;left:${CUSD.l}mm;width:${CUSD.w}mm;font-weight:600">${data.total_amount_usd > 0 ? fmtNum(data.total_amount_usd) : ''}</span>

  <!-- Signatures -->
  <span class="val" style="top:${sigY}mm;left:58mm;width:45mm;font-size:9px">${data.auditor_email ?? ''}</span>
  <span class="val val-c" style="top:${sigY}mm;left:105mm;width:55mm;font-size:9px">${data.receiver_name ?? ''}</span>
  <span class="val val-c" style="top:${sigY}mm;left:180mm;width:50mm;font-size:9px">${data.cashier_email ?? ''}</span>
</div>
</body></html>`
}

export function buildPaymentVoucherHTML(data: VoucherPrintData): string {
  if (data.pvTemplateImage) return buildPVTemplateHTML(data, data.pvTemplateImage)

  // ─── Standalone fallback (no template) ──────────────────────────────────────
  const lineRows = data.lines.map((l) => `<tr>
    <td style="text-align:center;font-size:10px">${l.acct_5 ?? ''}</td>
    <td style="text-align:center;font-size:10px">${l.acct_4 ?? ''}</td>
    <td style="text-align:center;font-size:10px">${l.acct_3 ?? ''}</td>
    <td style="text-align:center;font-size:10px">${l.acct_2 ?? ''}</td>
    <td style="text-align:center;font-size:10px">${l.acct_1 ?? ''}</td>
    <td>${l.statement}</td>
    <td style="text-align:right;font-family:monospace">${l.amount_usd > 0 ? fmtNum(l.amount_usd) : ''}</td>
    <td style="text-align:right;font-family:monospace">${l.amount_iqd > 0 ? fmtNum(l.amount_iqd) : ''}</td>
  </tr>`).join('')

  const blankCount = Math.max(0, 6 - data.lines.length)
  const blankRows  = Array(blankCount).fill('<tr><td colspan="8" style="height:22px"></td></tr>').join('')

  const journalList = data.journals.length > 0
    ? data.journals.map((j) => `${j.reference} (${fmtDate(j.entry_date)})`).join('، ')
    : '—'

  return `<!DOCTYPE html><html dir="ltr">
<head><meta charset="UTF-8"><title>Payment Voucher – ${data.voucher_number}</title>
<style>${BASE_CSS}</style></head>
<body><div class="page">

  <table style="border:none;margin-bottom:12px">
    <tr>
      <td style="border:none;width:30%;vertical-align:top">
        <table style="border:1px solid #aaa;width:100%">
          <tr>
            <th style="background:#d0d7e0">دينار عراقي</th>
            <th style="background:#d0d7e0">دولار</th>
          </tr>
          <tr>
            <td style="height:30px;text-align:right;font-family:monospace;font-weight:600">${fmtNum(data.total_amount_iqd)}</td>
            <td style="text-align:right;font-family:monospace;font-weight:600">${data.total_amount_usd > 0 ? fmtNum(data.total_amount_usd) : ''}</td>
          </tr>
        </table>
      </td>
      <td style="border:none;width:40%;text-align:center;vertical-align:top">
        <div style="display:inline-block;background:#f5c400;color:#000;font-size:18px;font-weight:700;padding:4px 18px;border-radius:4px;margin-bottom:4px">سند صرف</div>
        <div style="font-size:14px;font-weight:600">Payment Voucher</div>
        <div style="font-size:12px;color:#333;margin-top:4px">No. <strong>${data.voucher_number}</strong></div>
      </td>
      <td style="border:none;width:30%;text-align:right;vertical-align:top">
        <div style="font-size:13px;font-weight:700;color:#1a3c5e">${data.companyName ?? 'FNC Group'}</div>
        <div style="font-size:10px;color:#888">First National Company</div>
      </td>
    </tr>
  </table>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;font-size:11px">
    <div style="border-bottom:1px dotted #999;padding:2px 0">Received from ادفعوا لأمر: <strong>${data.received_from}</strong></div>
    <div style="border-bottom:1px dotted #999;padding:2px 0;text-align:right">Date تاريخ: <strong>${fmtDate(data.voucher_date)}</strong></div>
    <div style="border-bottom:1px dotted #999;padding:2px 0">Reference to وذلك عن: <strong>${data.reference_to ?? journalList}</strong></div>
    <div style="border-bottom:1px dotted #999;padding:2px 0;text-align:right">Bank / Fund حسابات البنك/الصندوق: <strong>${data.bank_account_fund ?? '—'}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:46px">5</th>
        <th style="width:46px">4</th>
        <th style="width:46px">3</th>
        <th style="width:46px">2</th>
        <th style="width:46px">1</th>
        <th>Statement البيان</th>
        <th style="width:90px">دولار $</th>
        <th style="width:90px">دينار</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
      ${blankRows}
      <tr style="background:#e8ecf0;font-weight:600">
        <td colspan="5"></td>
        <td style="text-align:right;padding-right:8px">Total المجموع</td>
        <td style="text-align:right;font-family:monospace">${data.total_amount_usd > 0 ? fmtNum(data.total_amount_usd) : ''}</td>
        <td style="text-align:right;font-family:monospace">${fmtNum(data.total_amount_iqd)}</td>
      </tr>
    </tbody>
  </table>

  ${data.journals.length > 0 ? `
  <div style="margin-top:8px;font-size:10px;color:#555;padding:4px 6px;border:1px solid #ddd;border-radius:3px">
    Journals: ${journalList}
  </div>` : ''}

  <table style="margin-top:14px;border:none">
    <tr>
      <td style="border:none;width:33%;font-size:11px">
        Cashier أمين الصندوق: <span style="border-bottom:1px solid #999;display:inline-block;min-width:100px">${data.cashier_email ?? ''}</span>
      </td>
      <td style="border:none;width:34%;text-align:center;font-size:11px">
        Received by المستلم: <span style="border-bottom:1px solid #999;display:inline-block;min-width:100px">${data.receiver_name ?? ''}</span>
      </td>
      <td style="border:none;width:33%;text-align:right;font-size:11px">
        Auditor المدقق: <span style="border-bottom:1px solid #999;display:inline-block;min-width:100px">${data.auditor_email ?? ''}</span>
      </td>
    </tr>
  </table>

</div></body></html>`
}

// ─── GENERAL JOURNAL ─────────────────────────────────────────────────────────

function buildJournalTemplateHTML(data: JournalPrintData, template: string): string {
  const linkedPOList = data.linked_pos.length > 0
    ? data.linked_pos.map((p) => `${p.po_number}${p.vendor_name ? ' – ' + p.vendor_name : ''}`).join(', ')
    : ''

  // Row y-positions: table header 40-53mm, data rows from 54mm, pitch 14mm
  const ROW_START = 54
  const ROW_H = 7
  const MAX_ROWS = 10

  const lineOverlays = data.lines.slice(0, MAX_ROWS).map((l, i) => {
    const y = ROW_START + i * ROW_H
    const debitIqd  = l.currency_code === 'IQD' ? l.debit  : 0
    const creditIqd = l.currency_code === 'IQD' ? l.credit : 0
    const debitUsd  = l.currency_code !== 'IQD' ? l.debit  : (l.debit_usd ?? 0)
    const creditUsd = l.currency_code !== 'IQD' ? l.credit : (l.credit_usd ?? 0)
    return `
      <span class="val val-c" style="top:${y}mm;left:8mm;width:12mm;font-size:9px">${i + 1}</span>
      <span class="val" style="top:${y}mm;left:46mm;width:58mm;font-size:9px">${l.description ?? (l.account_name ?? '')}</span>
      <span class="val val-r" style="top:${y}mm;left:104mm;width:16mm;font-size:9px">${creditUsd > 0 ? fmtNum(creditUsd) : ''}</span>
      <span class="val val-r" style="top:${y}mm;left:120mm;width:16mm;font-size:9px">${debitUsd > 0 ? fmtNum(debitUsd) : ''}</span>
      <span class="val val-r" style="top:${y}mm;left:136mm;width:16mm;font-size:9px">${creditIqd > 0 ? fmtNum(creditIqd) : ''}</span>
      <span class="val val-r" style="top:${y}mm;left:152mm;width:16mm;font-size:9px">${debitIqd > 0 ? fmtNum(debitIqd) : ''}</span>
      <span class="val val-r" style="top:${y}mm;left:182mm;width:20mm;font-size:9px">${l.account_code ?? ''}</span>
    `
  }).join('')

  const totalY = ROW_START + MAX_ROWS * ROW_H + 2
  const sigY = totalY + 80

  return `<!DOCTYPE html><html dir="ltr">
<head><meta charset="UTF-8"><title>General Journal – ${data.reference}</title>
<style>${TEMPLATE_CSS}</style></head>
<body>
<div class="page">
  <div class="tmpl-bg"><img src="${template}" alt=""/></div>

  <!-- Reference and page fields (top-left) -->
  <span class="val" style="top:19mm;left:30mm;width:80mm;font-size:9.5px">${linkedPOList || data.description || ''}</span>
  <span class="val val-c" style="top:19mm;left:155mm;width:40mm;font-size:10px;font-weight:600">${data.reference}</span>
  <span class="val val-c" style="top:26mm;left:155mm;width:40mm;font-size:10px">${fmtDate(data.entry_date)}</span>

  <!-- Data rows -->
  ${lineOverlays}

  <!-- Totals row -->
  <span class="val val-r" style="top:${totalY}mm;left:104mm;width:16mm;font-weight:600;font-size:9px">${fmtNum(data.total_credit)}</span>
  <span class="val val-r" style="top:${totalY}mm;left:120mm;width:16mm;font-weight:600;font-size:9px">${fmtNum(data.total_debit)}</span>
  <span class="val val-r" style="top:${totalY}mm;left:136mm;width:16mm;font-weight:600;font-size:9px">${fmtNum(data.total_credit)}</span>
  <span class="val val-r" style="top:${totalY}mm;left:152mm;width:16mm;font-weight:600;font-size:9px">${fmtNum(data.total_debit)}</span>

  <!-- Signatures -->
  <span class="val" style="top:${sigY}mm;left:8mm;width:80mm;font-size:9px">${data.accountant_email ?? ''}</span>
  <span class="val val-r" style="top:${sigY}mm;left:120mm;width:80mm;font-size:9px">${data.auditor_email ?? ''}</span>
</div>
</body></html>`
}

export function buildGeneralJournalHTML(data: JournalPrintData): string {
  if (data.journalTemplateImage) return buildJournalTemplateHTML(data, data.journalTemplateImage)

  // ─── Standalone fallback (no template) ──────────────────────────────────────
  const linkedPOList = data.linked_pos.length > 0
    ? data.linked_pos.map((p) => `${p.po_number}${p.vendor_name ? ' – ' + p.vendor_name : ''}`).join(', ')
    : '—'

  const lineRows = data.lines.map((l, i) => {
    const debitIqd  = l.currency_code === 'IQD' ? l.debit  : 0
    const creditIqd = l.currency_code === 'IQD' ? l.credit : 0
    const debitUsd  = l.currency_code !== 'IQD' ? l.debit  : (l.debit_usd ?? 0)
    const creditUsd = l.currency_code !== 'IQD' ? l.credit : (l.credit_usd ?? 0)
    return `<tr>
      <td style="text-align:center;color:#666">${i + 1}</td>
      <td colspan="3" style="text-align:center"></td>
      <td style="text-align:left">${l.description ?? (l.account_name ?? '')}</td>
      <td style="text-align:right;font-family:monospace">${debitUsd  > 0 ? fmtNum(debitUsd)  : ''}</td>
      <td style="text-align:right;font-family:monospace">${creditUsd > 0 ? fmtNum(creditUsd) : ''}</td>
      <td style="text-align:right;font-family:monospace">${debitIqd  > 0 ? fmtNum(debitIqd)  : ''}</td>
      <td style="text-align:right;font-family:monospace">${creditIqd > 0 ? fmtNum(creditIqd) : ''}</td>
      <td style="text-align:center;font-size:10px;color:#555">${l.account_code ?? ''}</td>
    </tr>`
  }).join('')

  const blankCount = Math.max(0, 8 - data.lines.length)
  const blankRows  = Array(blankCount).fill('<tr><td colspan="10" style="height:22px"></td></tr>').join('')

  return `<!DOCTYPE html><html dir="ltr">
<head><meta charset="UTF-8"><title>General Journal – ${data.reference}</title>
<style>${BASE_CSS}</style></head>
<body><div class="page">

  <table style="border:none;margin-bottom:10px">
    <tr>
      <td style="border:none;width:33%;vertical-align:top">
        <div style="font-size:11px;color:#555">وذلك عن: <span style="border-bottom:1px dotted #999;display:inline-block;min-width:160px">${linkedPOList}</span></div>
        <div style="font-size:11px;color:#555;margin-top:4px">صفحة: <span style="border-bottom:1px dotted #999;display:inline-block;min-width:60px"></span></div>
      </td>
      <td style="border:none;width:34%;text-align:center;vertical-align:top">
        <div style="font-size:20px;font-weight:700;color:#1a1a1a">General Journal</div>
        <div style="font-size:16px;color:#333;margin-top:2px">قيد اليومية</div>
        <div style="font-size:11px;color:#555;margin-top:6px">Entry No.: <strong>${data.reference}</strong> &nbsp;|&nbsp; Date: <strong>${fmtDate(data.entry_date)}</strong></div>
      </td>
      <td style="border:none;width:33%;text-align:right;vertical-align:top">
        <div style="font-size:13px;font-weight:700;color:#1a3c5e">${data.companyName ?? 'FNC Group'}</div>
        <div style="font-size:10px;color:#888">First National Company</div>
      </td>
    </tr>
  </table>

  ${data.description ? `<div style="font-size:11px;color:#555;margin-bottom:6px;padding:4px 8px;border:1px solid #ddd;border-radius:4px">${data.description}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width:28px">#</th>
        <th style="width:50px">خماسي<br><span style="font-weight:400">quintuple</span></th>
        <th style="width:50px">رباعي<br><span style="font-weight:400">quadrilateral</span></th>
        <th style="width:50px">ثلاثي<br><span style="font-weight:400">tripartite</span></th>
        <th style="min-width:180px">Statement</th>
        <th style="width:90px">دالن $</th>
        <th style="width:90px">مدين $</th>
        <th style="width:90px">دالن</th>
        <th style="width:90px">مدين</th>
        <th style="width:70px">رقم القيد<br>Entry Number</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
      ${blankRows}
      <tr style="background:#e8ecf0;font-weight:600">
        <td colspan="5" style="text-align:right;padding-right:8px">المجموع</td>
        <td style="text-align:right;font-family:monospace">${fmtNum(data.total_debit)}</td>
        <td style="text-align:right;font-family:monospace">${fmtNum(data.total_credit)}</td>
        <td style="text-align:right;font-family:monospace">${fmtNum(data.total_debit)}</td>
        <td style="text-align:right;font-family:monospace">${fmtNum(data.total_credit)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <table style="margin-top:16px;border:none">
    <tr>
      <td style="border:none;width:50%;padding-right:20px">
        <span style="font-size:11px">Accountant المحاسب: </span>
        <span style="border-bottom:1px solid #999;display:inline-block;min-width:180px;font-size:11px">${data.accountant_email ?? ''}</span>
      </td>
      <td style="border:none;width:50%;text-align:right">
        <span style="font-size:11px">Auditor المدقق: </span>
        <span style="border-bottom:1px solid #999;display:inline-block;min-width:180px;font-size:11px">${data.auditor_email ?? ''}</span>
      </td>
    </tr>
  </table>

</div></body></html>`
}
