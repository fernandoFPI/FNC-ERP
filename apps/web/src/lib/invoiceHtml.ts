import { esc, safeImageSrc } from './htmlEscape'

// Everything that comes from the database goes into the page through esc() (or safeImageSrc()
// for images): the document is shown in an iframe without a sandbox, so markup in a line
// description or a client name would otherwise run as script. See lib/htmlEscape.ts.

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
  paymentTermsDays: number | null
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
  /** The CLIENT's contract / PO / RFQ number (not our internal contract number). */
  clientContractNo?: string | null
  /** Free text, one line per line break. */
  billToAddress?: string | null
  deliverToAddress?: string | null
  /** YYYY-MM-DD */
  deliveryDate?: string | null
  periodOfPerformance?: string | null
  companyAddress?: string | null
  companyPhone?: string | null
  companyEmail?: string | null
  companyBranchName?: string | null
  companyBranchAddress?: string | null
  companyBranchCity?: string | null
  companyBranchPhone?: string | null
  grossTotal: number
  retentionAmount: number
  retentionPct: number | null
  netPayable: number
  whtApplies?: boolean
  whtAmount?: number
  lines: InvoiceLine[]
}

function fmt(n: number, currency: string): string {
  return (
    new Intl.NumberFormat('en-IQ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      n,
    ) +
    ' ' +
    esc(currency)
  )
}

/** The text, or the fallback when it is missing or only spaces (an empty string is a blank, not a value). */
function orElse(v: string | null | undefined, fallback: string): string {
  const t = v?.trim()
  if (!t) return fallback
  return t
}

/** dd/mm/yyyy, read from the string itself so a time zone cannot move the day. */
function fmtShortDate(d: string | null | undefined): string | null {
  if (!d) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString('en-GB')
}

export function buildInvoiceHTML(
  inv: InvoiceRenderData,
  bankAccount?: BankAccount | null,
  paymentType?: string,
  stampImage?: string | null,
  qrDataUrlInput?: string | null,
): string {
  const cur = inv.currencyCode
  const pt = paymentType ?? inv.paymentType ?? 'wire_transfer'
  const stamp = safeImageSrc(stampImage ?? inv.companyStampImage ?? null)
  const letterhead = safeImageSrc(inv.companyLetterheadImage ?? null)
  const qrDataUrl = safeImageSrc(qrDataUrlInput)
  const invoiceNo = esc(inv.invoiceNumber)
  const companyLabel = esc(inv.companyName ?? 'FNC Group')

  const subtotal = inv.lines.reduce((s, l) => s + l.subtotal, 0)
  const marginTotal = inv.lines.reduce((s, l) => s + l.marginAmount, 0)
  const taxTotal = inv.lines.reduce((s, l) => s + l.taxAmount, 0)
  const hasMargin = marginTotal > 0
  const hasTax = taxTotal > 0
  const retentionPct = inv.retentionPct ?? 0

  // ── Header block (dates, Deliver To / Bill To, contract row) ─────────────
  const none = '—'
  const hdrLine = '#c3ccd6'
  const hdrCell = `padding:7px 10px;border:1px solid ${hdrLine};font-size:11.5px;line-height:1.45;overflow-wrap:anywhere`
  const hdrLabel = `${hdrCell};background:#dfe6ee;color:#1a3c5e;font-weight:700;text-align:center`
  const hdrValue = `${hdrCell};color:#1a1a1a;text-align:center`
  const hdrHead = `${hdrCell};background:#1a3c5e;border-color:#1a3c5e;color:#fff;font-weight:700;text-align:center`
  const hdrText = `${hdrCell};border:0;color:#1a1a1a;text-align:left;white-space:pre-line;min-height:62px`
  // The gateway always sends both addresses (typed, or derived from the project); the client name
  // only stands in for Bill To when a caller sends none at all. An empty string is a blank on purpose.
  const billTo = inv.billToAddress ?? inv.clientName ?? ''
  const deliverTo = inv.deliverToAddress ?? ''

  const FIRST_PAGE_ROWS = 6
  const OTHER_PAGE_ROWS = 6

  function buildRow(l: InvoiceLine, idx: number): string {
    const bg = idx % 2 === 1 ? 'background:#f8fafc;' : ''
    return `
    <tr style="page-break-inside:avoid;break-inside:avoid">
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;color:#888;${bg}">${esc(l.lineNumber)}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;${bg}">${esc(l.description)}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;${bg}">${esc(l.qty)}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;${bg}">${fmt(l.unitCost, cur)}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;${bg}">${fmt(l.subtotal, cur)}</td>
      ${
        hasMargin
          ? `
        <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;${bg}">${(l.marginPct * 100).toFixed(1)}%</td>
        <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;${bg}">${fmt(l.marginAmount, cur)}</td>
      `
          : ''
      }
      ${
        hasTax
          ? `
        <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;${bg}">${l.taxPct.toFixed(1)}%</td>
        <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;${bg}">${fmt(l.taxAmount, cur)}</td>
      `
          : ''
      }
      <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12px;text-align:right;font-family:monospace;font-weight:700;color:#1a3c5e;${bg}">${fmt(l.lineTotal, cur)}</td>
    </tr>`
  }

  const isMultiPage = inv.lines.length > FIRST_PAGE_ROWS
  const page1Lines = isMultiPage ? inv.lines.slice(0, FIRST_PAGE_ROWS) : inv.lines
  const continuationChunks: InvoiceLine[][] = []
  if (isMultiPage) {
    let i = FIRST_PAGE_ROWS
    while (i < inv.lines.length) {
      continuationChunks.push(inv.lines.slice(i, i + OTHER_PAGE_ROWS))
      i += OTHER_PAGE_ROWS
    }
  }
  const totalPages = 1 + continuationChunks.length

  const lineRows = page1Lines.map((l, i) => buildRow(l, i)).join('')

  function tableHeadRow(): string {
    return `
      <tr>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:left;width:36px">#</th>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:left">Description</th>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:56px">Qty</th>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:140px">Unit Cost</th>
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:140px">Subtotal</th>
        ${
          hasMargin
            ? `
          <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:70px">Margin%</th>
          <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:130px">Margin</th>
        `
            : ''
        }
        ${
          hasTax
            ? `
          <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:60px">Tax%</th>
          <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:120px">Tax</th>
        `
            : ''
        }
        <th style="background:#1a3c5e;color:white;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:11px 14px;text-align:right;width:150px">Total</th>
      </tr>
    `
  }

  const statusBadgeStyle = `display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;${
    inv.status === 'paid'
      ? 'background:#d1fae5;color:#065f46'
      : inv.status === 'issued' || inv.status === 'sent'
        ? 'background:#dbeafe;color:#1e40af'
        : inv.status === 'approved'
          ? 'background:#fef3c7;color:#92400e'
          : 'background:#f3f4f6;color:#374151'
  }`

  // ── Letterhead-specific sections ─────────────────────────────────────────

  const letterheadHeader = `
  <!-- Invoice title top-right, level with the letterhead logo. The number is not repeated here (the Invoice No. box
       right below carries it) and neither is the QR code: letterhead artwork often fills this corner (Al Watanyia's
       Arabic company name sat under the QR), so the QR goes in the footer band, which the letterhead scan keeps clear
       (see .page-footer-bar). -->
  <div style="position:absolute;top:16mm;right:15mm;text-align:right">
    <div style="font-size:20px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Invoice</div>
  </div>

  <!-- Divider between letterhead header zone and invoice content -->
  <div style="border-bottom:2px solid #1a3c5e;margin-bottom:22px"></div>`

  const letterheadBottom = `
  <div class="lh-stamp">
    ${
      stamp
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
      ${
        stamp
          ? `<img src="${stamp}" alt="Company stamp" style="max-height:80px;max-width:160px;object-fit:contain;margin-bottom:8px"/>`
          : `<div style="height:64px;border-bottom:1px solid #cbd5e0;margin-bottom:8px"></div>`
      }
      <div style="font-size:11px;color:#666">Signature &amp; stamp</div>
    </div>
    ${
      qrDataUrl
        ? `
    <div style="text-align:center;flex-shrink:0">
      <img src="${qrDataUrl}" alt="Scan to verify" style="width:90px;height:90px;display:block;margin:0 auto 4px"/>
      <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Scan to verify</div>
    </div>`
        : ''
    }
  </div>
  <div style="border-top:1px solid #e5e5e5;padding-top:16px;font-size:10px;color:#999;text-align:center">
    FNC Group ERP &bull; Generated ${new Date().toLocaleDateString('en-GB')}
  </div>`

  // ── Content shared by every continuation page ────────────────────────────

  const continuedHeaderHtml = letterhead
    ? `
    <!-- Screen: flex header (no overlap) -->
    <div class="p2-screen-hdr">
      <div style="font-size:11px;color:#999;font-style:italic">Continued from previous page</div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Invoice</div>
        <div style="font-size:12px;color:#555;font-family:monospace;margin-top:4px">${invoiceNo}</div>
      </div>
    </div>
    <!-- Print: absolute title mirrors page 1 (hidden on screen via inline style). Only the title: the number would land
         on letterhead artwork under it (Al Watanyia's Arabic company name), so it sits on the free row above the rule. -->
    <div class="p2-print-hdr" style="display:none">
      <div style="font-size:20px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Invoice</div>
    </div>
    <div class="p2-print-divider" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:8px">
        <span style="font-size:11px;color:#999;font-style:italic">Continued from previous page</span>
        <span style="font-size:12px;color:#555;font-family:monospace;letter-spacing:0.3px">${invoiceNo}</span>
      </div>
    </div>
    `
    : `
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:2px solid #1a3c5e;margin-bottom:20px">
      <div style="font-size:13px;color:#666;font-style:italic">Continued from previous page</div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:1px">Invoice</div>
        <div style="font-size:12px;color:#666;font-family:monospace">${invoiceNo}</div>
      </div>
    </div>
    `

  // Letterhead invoices: the page number and the "continued" note sit together, bottom right, on every page, just
  // above the letterhead's footer artwork, and the verification QR code sits bottom left on the same line (see
  // printGeometryCss). This band is the one the footer scan keeps clear (the stamp is centred in it), unlike the
  // header corner, which the letterhead may fill. It takes no room in the page's flow, so neither the table nor the
  // totals have to leave space for it.
  const continuedNote = `<div class="page-continued">Continued on next page →</div>`
  const qrImg = qrDataUrl ? `<img class="page-qr" src="${qrDataUrl}" alt="Scan to verify"/>` : ''

  function pageFooterBar(pageNum: number): string {
    if (letterhead) {
      return `
  <div class="page-footer-bar">
    ${qrImg}<div class="page-count" data-page-num="${pageNum}">Page ${pageNum} of ${totalPages}</div>${pageNum < totalPages ? continuedNote : ''}
  </div>`
    }
    return `
  <div class="page-footer-bar" style="border-top:1px solid #e5e5e5;padding-top:10px;margin-top:16px;font-size:10px;color:#999;display:flex;justify-content:space-between">
    <span>${companyLabel} &bull; ${invoiceNo}</span>
    <span class="page-count" data-page-num="${pageNum}">Page ${pageNum} of ${totalPages}</span>
  </div>`
  }

  // "Continued on next page" bar closing every lines table that is followed by another page.
  // The pagination script re-creates it when it moves rows, so there is a single copy of the markup.
  const continuedTfoot = `
    <tfoot>
      <tr>
        <td colspan="99" style="padding:10px 14px;font-size:11px;color:#999;font-style:italic;text-align:right;border-top:1px solid #e2e8f0">
          Continued on next page →
        </td>
      </tr>
    </tfoot>`
  // The letterhead layout says it in the page marker instead, so its table has no such bar.
  const tableContinuedBar = letterhead ? '' : continuedTfoot

  // Totals + payment/bank details + signature block — appended only to the last page.
  // Wrapped in #trailing-content so the overflow-correction script (letterhead mode
  // only) can move the whole block onto a fresh page if it doesn't fit.
  const trailingContent = `
  <div id="trailing-content">
  <!-- Totals -->
  <section class="js-trailing-section" style="display:flex;justify-content:flex-end;margin-bottom:28px">
    <div style="min-width:340px">
      ${
        hasMargin || hasTax
          ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#555;border-bottom:1px solid #eef0f3">
        <span>Subtotal</span><span style="font-family:monospace">${fmt(subtotal, cur)}</span>
      </div>`
          : ''
      }
      ${
        hasMargin
          ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#555;border-bottom:1px solid #eef0f3">
        <span>Margin</span><span style="font-family:monospace">${fmt(marginTotal, cur)}</span>
      </div>`
          : ''
      }
      ${
        hasTax
          ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#555;border-bottom:1px solid #eef0f3">
        <span>Tax</span><span style="font-family:monospace">${fmt(taxTotal, cur)}</span>
      </div>`
          : ''
      }
      ${
        inv.retentionAmount > 0
          ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#c53030;border-bottom:1px solid #eef0f3">
        <span>Retention (${(retentionPct * 100).toFixed(0)}%)</span>
        <span style="font-family:monospace">(${fmt(inv.retentionAmount, cur)})</span>
      </div>`
          : ''
      }
      ${
        inv.whtApplies && (inv.whtAmount ?? 0) > 0
          ? `
      <div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#c53030;border-bottom:1px solid #eef0f3">
        <span>WHT</span>
        <span style="font-family:monospace">(${fmt(inv.whtAmount ?? 0, cur)})</span>
      </div>`
          : ''
      }
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#1a3c5e;border-radius:6px;margin-top:8px">
        <span style="font-size:13px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:0.8px">Net Payable</span>
        <span style="font-size:18px;font-weight:700;font-family:monospace;color:white">${fmt(inv.netPayable, cur)}</span>
      </div>
    </div>
  </section>

  <!-- Payment type badge + bank details -->
  <section class="js-trailing-section" style="margin-bottom:32px">
  <div style="margin-bottom:16px">
    <span style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:600;background:#1a3c5e;color:#fff;text-transform:uppercase;letter-spacing:0.5px">
      Payment Type: ${pt === 'cash' ? 'Cash' : 'Wire Transfer'}
    </span>
  </div>

  <!-- Payment instructions + bank details -->
  <div style="padding:20px;background:#f8fafc;border-radius:8px">
    <p style="font-size:11px;color:#666;line-height:1.7;margin-bottom:${pt === 'cash' || !bankAccount ? '0' : '16px'}">
      Please ${pt === 'cash' ? 'arrange cash payment' : 'transfer payment'} within ${esc(inv.paymentTermsDays ?? 30)} days of invoice date.
      Reference invoice number ${invoiceNo} in your payment.
    </p>
    ${
      pt !== 'cash' && bankAccount
        ? `
    <div>
      <p style="font-size:12px;font-weight:700;color:#1a3c5e;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">
        Banking Information &mdash; ${esc(bankAccount.accountName)} (${esc(bankAccount.currencyCode)})
      </p>
      <div style="display:grid;grid-template-columns:1fr${bankAccount.intermediaryBankName ? ' 1fr' : ''};gap:24px">
        <div style="font-size:12px;color:#444;line-height:2">
          <span style="color:#666">Bank Name: </span><strong>${esc(bankAccount.bankName)}</strong><br>
          ${bankAccount.beneficiaryName ? `<span style="color:#666">Beneficiary Name: </span><strong>${esc(bankAccount.beneficiaryName)}</strong><br>` : ''}
          ${bankAccount.accountNumber ? `<span style="color:#666">Account Number: </span>${esc(bankAccount.accountNumber)}<br>` : ''}
          ${bankAccount.iban ? `<span style="color:#666">IBAN: </span><span style="font-family:monospace">${esc(bankAccount.iban)}</span><br>` : ''}
          ${bankAccount.swift ? `<span style="color:#666">SWIFT Code: </span>${esc(bankAccount.swift)}<br>` : ''}
          ${bankAccount.branchCode ? `<span style="color:#666">Branch Code: </span>${esc(bankAccount.branchCode)}<br>` : ''}
          ${bankAccount.bankAddress ? `<span style="color:#666">Bank Address:</span><br><span style="color:#555">${esc(bankAccount.bankAddress)}</span>` : ''}
        </div>
        ${
          bankAccount.intermediaryBankName
            ? `
        <div style="font-size:12px;color:#444;line-height:2">
          <p style="font-size:11px;font-weight:600;color:#1a3c5e;margin-bottom:6px">Intermediary Bank:</p>
          <strong>${esc(bankAccount.intermediaryBankName)}</strong><br>
          ${bankAccount.intermediarySwift ? `SWIFT: ${esc(bankAccount.intermediarySwift)}<br>` : ''}
          ${bankAccount.intermediaryCountry ? esc(bankAccount.intermediaryCountry) : ''}
        </div>
        `
            : ''
        }
      </div>
    </div>
    `
        : ''
    }
  </div>
  </section>

  <section>
  ${letterhead ? letterheadBottom : standardBottom}
  </section>
  </div>`

  function jsStringLiteral(s: string): string {
    return JSON.stringify(s).replace(/</g, '\\u003c')
  }

  // Letterhead mode only: the company stamp and header graphic are position:fixed,
  // repeating identically on every physical printed page, so nothing in a page's flow
  // may reach into the band they occupy. The server-side split into pages of a fixed
  // row count cannot promise that: one long description wraps onto several lines and
  // pushes the table into the stamp. So this script re-paginates from what the browser
  // really lays out. Rows stay on a page until the next one would cross the reserve and
  // then start a new page, and the totals/payment block moves on afterwards if it does
  // not fit either.
  //
  // The stamp sits just above the footer artwork of THIS company's letterhead, read from
  // the image itself (placeStamp), and the reserve follows it. A letterhead whose footer
  // is low gets more room for rows than one whose footer rises high; when the image
  // cannot be read the stamp stays 43 mm up and the reserve 85 mm, the values that were
  // fixed before.
  //
  // It measures with `html.measuring` switched on, which gives the page its print
  // geometry (A4 width, print paddings, stamp out of the flow): the on-screen layout is
  // wider, wraps less, and would under-measure the printed one. If anything throws, the
  // server-rendered pages are put back untouched.
  const overflowFixScript = letterhead
    ? `
  <script>
  (function () {
    var root = document.querySelector('.page');
    if (!root) return;
    var rootId = root.id;
    var done = false;
    var mmPx = 96 / 25.4;
    var continuedNote = ${jsStringLiteral(continuedNote)};
    var qrImg = ${jsStringLiteral(qrImg)};
    var continuedHeader = ${jsStringLiteral(continuedHeaderHtml)};

    // Pixels per mm in the same coordinate space getBoundingClientRect reports, so a
    // zoom set on <html> (the verification page does that) cannot skew the comparison.
    function measureMm() {
      var probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;width:1px;height:100mm';
      document.body.appendChild(probe);
      var h = probe.getBoundingClientRect().height;
      document.body.removeChild(probe);
      return h > 0 ? h / 100 : 96 / 25.4;
    }

    function mmToPx(mm) { return mm * mmPx; }

    // The stamp sits stampBottomMm above the bottom edge and the band above it, up to
    // reserveMm, is kept clear. These defaults suit a letterhead whose footer rises about
    // 41 mm from the edge (Al Watanyia's); placeStamp() lowers both for a letterhead with a
    // lower footer, which gives that company's pages more room for rows.
    var STAMP_BLOCK_MM = 34.3; // 110 px stamp image + margin + "Authorized By" label
    var STAMP_GAP_MM = 4; // clear space kept between the table and the stamp
    var stampBottomMm = 43;
    var reserveMm = 85;

    function budgetFor(pageEl) {
      var topReserveMm = pageEl.classList.contains('page2-break') ? 74 : 54;
      return mmToPx(297 - topReserveMm - reserveMm);
    }

    // Distance from the bottom edge to the first visible ink of the letterhead's footer
    // artwork, or null when it cannot be read (image not decoded yet, or a tainted canvas).
    function footerStartMm() {
      var img = document.querySelector('.lh-bg img');
      if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      var scale = Math.min(1, 1500 / w);
      var cropTop = Math.floor(h * 0.6); // the footer lives in the bottom 40 %
      var cw = Math.round(w * scale);
      var ch = Math.round((h - cropTop) * scale);
      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch); // transparent pixels count as paper
      ctx.drawImage(img, 0, cropTop, w, h - cropTop, 0, 0, cw, ch);
      var px = ctx.getImageData(0, 0, cw, ch).data;
      for (var y = 0; y < ch; y++) {
        var ink = 0;
        for (var x = 0; x < cw; x++) {
          var i = (y * cw + x) * 4;
          if ((px[i] + px[i + 1] + px[i + 2]) / 3 < 240) ink++;
        }
        if (ink >= 3) return 297 - ((cropTop + y / scale) / h) * 297;
      }
      return 0;
    }

    function placeStamp() {
      var footer = null;
      try { footer = footerStartMm(); } catch (e) { footer = null; }
      if (footer === null) return; // keep the defaults
      stampBottomMm = Math.min(75, Math.max(12, footer + 2));
      reserveMm = stampBottomMm + STAMP_BLOCK_MM + STAMP_GAP_MM;
      document.documentElement.style.setProperty('--stamp-bottom', stampBottomMm + 'mm');
    }

    function anchorOf(pageEl) { return pageEl.querySelector(':scope > .content-anchor'); }

    // Measures only up to the last MOVABLE (.js-trailing-section) child — not the box's
    // own bottom. The signature block after it is not marked movable: its stamp is
    // position:fixed (repeats on every page, contributes zero flow height).
    function contentSpan(anchorEl, boxEl) {
      var sections = boxEl.querySelectorAll(':scope > .js-trailing-section');
      if (sections.length === 0) return 0;
      var bottom = sections[sections.length - 1].getBoundingClientRect().bottom;
      return bottom - anchorEl.getBoundingClientRect().top;
    }

    // Not "page-mid": that class adds 85 mm of padding below the content in print, and Chrome cannot break between the
    // last block and the padding under it, so a page holding the payment block (about 85 mm) was pushed whole onto
    // an extra sheet with no header or page number, leaving this one empty. The script budgets the content itself.
    function makePage() {
      var el = document.createElement('div');
      el.className = 'page2-break';
      var anchor = document.createElement('div');
      anchor.className = 'content-anchor';
      anchor.style.height = '0';
      el.appendChild(anchor);
      el.insertAdjacentHTML('beforeend', continuedHeader);
      return el;
    }

    // The QR code (bottom left) and the page number (bottom right). "Continued on next page" is added to every page but
    // the last by markContinued().
    function footerBar(num, total) {
      var footer = document.createElement('div');
      footer.className = 'page-footer-bar';
      footer.innerHTML = qrImg + '<div class="page-count" data-page-num="' + num + '">Page ' + num + ' of ' + total + '</div>';
      return footer;
    }

    function addFooter(pageEl) {
      var num = document.querySelectorAll('.page-count').length + 1;
      pageEl.appendChild(footerBar(num, num));
    }

    // Every page but the last says the invoice goes on. Run once the pages are final: the totals block can still
    // move to a page of its own after the rows are placed, which turns the page it left into a "continued" one.
    function markContinued() {
      var bars = document.querySelectorAll('.page-footer-bar');
      for (var i = 0; i < bars.length - 1; i++) {
        if (!bars[i].querySelector('.page-continued')) bars[i].insertAdjacentHTML('beforeend', continuedNote);
      }
    }

    // A continuation page holding an empty copy of the lines table (same head, no rows).
    function newLinesPage(template) {
      var el = makePage();
      el.className = 'page2-break';
      var table = template.cloneNode(false);
      table.style.marginBottom = '28px';
      table.appendChild(template.tHead.cloneNode(true));
      table.appendChild(document.createElement('tbody'));
      el.appendChild(table);
      return el;
    }

    function overflows(pageEl, table) {
      var top = anchorOf(pageEl).getBoundingClientRect().top;
      return table.getBoundingClientRect().bottom - top > budgetFor(pageEl);
    }

    // The zebra stripe restarts on every page, as it did when rows were chunked on the server.
    function stripe(table) {
      var trs = table.tBodies[0].rows;
      for (var j = 0; j < trs.length; j++) {
        var bg = j % 2 === 1 ? '#f8fafc' : '';
        for (var c = 0; c < trs[j].cells.length; c++) trs[j].cells[c].style.background = bg;
      }
    }

    // Puts every line row on a page where its table still ends above the stamp band.
    function paginate() {
      var oldTables = root.querySelectorAll('table.inv-lines');
      var trailing = document.getElementById('trailing-content');
      if (oldTables.length === 0 || !oldTables[0].tHead || !trailing) return;
      var firstTable = oldTables[0];

      var rows = [];
      for (var t = 0; t < oldTables.length; t++) {
        var oldBody = oldTables[t].tBodies[0];
        for (var r = 0; r < oldBody.rows.length; r++) rows.push(oldBody.rows[r]);
      }

      // Drop the server-rendered split; the rows and the trailing block are placed again below.
      for (var q = 0; q < rows.length; q++) rows[q].parentNode.removeChild(rows[q]);
      trailing.parentNode.removeChild(trailing);
      var oldPages = root.querySelectorAll(':scope > .page2-break');
      for (var p = 0; p < oldPages.length; p++) root.removeChild(oldPages[p]);
      var oldFooters = root.querySelectorAll(':scope > .page-footer-bar');
      for (var f = 0; f < oldFooters.length; f++) root.removeChild(oldFooters[f]);
      root.removeAttribute('id');

      var pages = [root];
      var tables = [firstTable];
      var cur = 0;
      for (var k = 0; k < rows.length; k++) {
        var tbody = tables[cur].tBodies[0];
        tbody.appendChild(rows[k]);
        // A page keeps at least one row, however tall, so this always terminates.
        if (tbody.rows.length > 1 && overflows(pages[cur], tables[cur])) {
          tbody.removeChild(rows[k]);
          var next = newLinesPage(firstTable);
          root.appendChild(next);
          pages.push(next);
          tables.push(next.querySelector('table.inv-lines'));
          cur++;
          tables[cur].tBodies[0].appendChild(rows[k]);
        }
      }

      tables[0].style.marginBottom = cur === 0 ? '28px' : '0';
      pages[cur].id = 'page-last';
      tables[cur].parentNode.insertBefore(trailing, tables[cur].nextSibling);
      for (var i = 0; i < pages.length; i++) {
        var after = i === cur ? trailing : tables[i];
        after.parentNode.insertBefore(footerBar(i + 1, pages.length), after.nextSibling);
        stripe(tables[i]);
      }
    }

    // Moves the totals/payment sections onto a fresh page when they do not fit under the rows.
    function fixTrailing() {
      var pageLast = document.getElementById('page-last');
      if (!pageLast) return;
      var trailingBox = document.getElementById('trailing-content');
      if (!trailingBox || !pageLast.contains(trailingBox)) return;

      var currentPage = pageLast;
      var currentBox = trailingBox;
      var didSplit = false;
      var guard = 0;

      while (guard < 6) {
        guard++;
        var anchor = currentPage.querySelector('.content-anchor');
        if (!anchor) break;
        if (contentSpan(anchor, currentBox) <= budgetFor(currentPage)) break;

        var sections = currentBox.querySelectorAll(':scope > .js-trailing-section');
        if (sections.length === 0) break;

        var newPage = makePage();
        currentPage.parentNode.insertBefore(newPage, currentPage.nextSibling);
        var newBox = document.createElement('div');
        newPage.appendChild(newBox);

        // Move sections from the tail of the current trailing box onto the new page,
        // one at a time, until the current page fits (or nothing is left to move).
        while (
          contentSpan(anchor, currentBox) > budgetFor(currentPage) &&
          currentBox.querySelectorAll(':scope > .js-trailing-section').length > 0
        ) {
          var tail = currentBox.querySelectorAll(':scope > .js-trailing-section');
          newBox.insertBefore(tail[tail.length - 1], newBox.firstChild);
        }

        addFooter(newPage);
        didSplit = true;
        currentPage = newPage;
        currentBox = newBox;
      }

      if (didSplit) {
        var counters = document.querySelectorAll('.page-count');
        var total = counters.length;
        for (var i = 0; i < counters.length; i++) {
          counters[i].textContent = 'Page ' + counters[i].getAttribute('data-page-num') + ' of ' + total;
        }
      }
    }

    function run() {
      if (done) return;
      done = true;
      var snapshot = root.innerHTML;
      document.documentElement.classList.add('measuring');
      try {
        mmPx = measureMm();
        placeStamp();
        paginate();
        fixTrailing();
        markContinued();
      } catch (e) {
        root.innerHTML = snapshot;
        if (rootId) root.id = rootId;
      } finally {
        document.documentElement.classList.remove('measuring');
      }
    }

    // Wait for the web font so rows wrap as they will in print; the timer covers a font
    // request that hangs, and beforeprint covers a print started before either fired.
    function start() {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(run, run);
      else run();
    }
    window.addEventListener('beforeprint', run);
    setTimeout(run, 3000);
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start);
  })();
  </script>
  `
    : ''

  // Letterhead rules that decide how tall each page's flow is. Written once and emitted twice:
  // inside @media print, and under `html.measuring` so the pagination script can measure on
  // screen exactly what the printer will lay out.
  const printGeometryCss = (scope: string): string => {
    const sel = (s: string) => (scope ? `${scope} ${s}` : s)
    return `
      ${sel('.lh-stamp')} { position: fixed; bottom: var(--stamp-bottom, 43mm); left: 0; right: 0; border-top: none; padding-top: 0; margin-top: 0; z-index: 10; }
      ${sel('.lh-stamp-img')} { max-height: 110px; max-width: 160px; }
      /* QR code (bottom left) and page number with the "continued" note (bottom right): the bottom of the row is level with
         the stamp's bottom edge, on every sheet. A page starts at the top of a sheet, so a distance from the page's top is the
         same distance on the sheet. The box is a fixed 19 mm high (the QR code) and the page number sits 10 mm down in it, so
         it stays at one height whether or not a "continued" note sits below it. No flow height. */
      ${sel('.page-footer-bar')} { position: absolute; top: calc(297mm - var(--stamp-bottom, 43mm) - 19mm); left: 15mm; right: 15mm; height: 19mm; margin: 0; grid-template-rows: 10mm auto auto; }
      /* A continuation page sits inside the first page's 15 mm side padding, so it is already 15 mm in from the sheet edge. */
      ${sel('.page .page2-break > .page-footer-bar')} { left: 0; right: 0; }
      ${sel('.page .page2-break > .p2-print-hdr')} { right: 0; }
      ${sel('.page')} { padding: 54mm 15mm 50mm; }
      /* Page 2 header: show absolute version in print only */
      ${sel('.p2-screen-hdr')} { display: none !important; }
      ${sel('.p2-print-hdr')}  { display: block !important; position: absolute; top: 16mm; right: 15mm; text-align: right; }
      ${sel('.p2-print-divider')} { display: block !important; border-bottom: 2px solid #1a3c5e; margin-bottom: 22px; }`
  }

  const continuationPagesHtml = continuationChunks
    .map((chunk, idx) => {
      const isLast = idx === continuationChunks.length - 1
      const pageNum = idx + 2
      const rows = chunk.map((l, i) => buildRow(l, i)).join('')
      return `
  <!-- PAGE ${pageNum} BREAK -->
  <div class="page2-break${isLast ? '' : ' page-mid'}"${isLast ? ' id="page-last"' : ''}>
    <div class="content-anchor" style="height:0"></div>
    ${continuedHeaderHtml}

    <!-- Remaining rows table -->
    <table class="inv-lines" style="width:100%;border-collapse:collapse;margin-bottom:28px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead>${tableHeadRow()}</thead>
      <tbody>${rows}</tbody>
      ${!isLast ? tableContinuedBar : ''}
    </table>

    ${isLast ? trailingContent : ''}

    ${pageFooterBar(pageNum)}
  </div>`
    })
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoiceNo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #1a1a1a; line-height: 1.5; background: white; }
    section { page-break-inside: avoid; break-inside: avoid; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    .page2-break {
      page-break-before: always;
      break-before: page;
      position: relative;
    }
    @media screen {
      .page2-break {
        margin-top: 48px;
        padding-top: 24px;
        border-top: 3px dashed #e2e8f0;
      }
    }
    @media print {
      .page2-break {
        padding-top: ${letterhead ? '74mm' : '15mm'};
      }
      .page2-break.page-mid {
        padding-bottom: ${letterhead ? '85mm' : '15mm'};
      }
    }
    ${
      letterhead
        ? `
    html, body { margin: 0; padding: 0; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Fixed elements hidden on screen, shown on print */
    .lh-bg { display: none; }
    .lh-bg { display: none; }
    .lh-qr { display: none; }
    .screen-auth { display: flex; }
    .page { position: relative; padding: 74mm 15mm 85mm; max-width: 100%; min-height: 297mm; }
    .lh-stamp { text-align: center; padding-top: 12px; border-top: 1px solid #e5e5e5; margin-top: 8px; }
    .page-footer-bar { margin-top: 16px; display: grid; grid-template-columns: 19mm 1fr; grid-template-rows: 1fr auto auto; align-items: start; text-align: right; font-size: 10px; color: #999; }
    .page-footer-bar .page-qr { grid-column: 1; grid-row: 1 / span 3; display: block; width: 19mm; height: 19mm; }
    .page-footer-bar .page-count { grid-column: 2; grid-row: 2; }
    .page-footer-bar .page-continued { grid-column: 2; grid-row: 3; margin-top: 1px; font-size: 11px; font-style: italic; }
    .lh-stamp-img { max-height: 230px; max-width: 320px; object-fit: contain; display: block; margin: 0 auto 6px; }
    @media print {
      .lh-bg { display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; }
      .lh-bg img { width: 100%; height: 100%; display: block; }
      .lh-qr { display: block; position: fixed; bottom: 40mm; right: 14mm; text-align: center; z-index: 10; }
      .screen-auth { display: none; }
      @page { size: A4; margin: 0; }
      ${printGeometryCss('')}
    }
    /* Same geometry on screen while the pagination script measures (see overflowFixScript) */
    ${printGeometryCss('html.measuring')}
    html.measuring .page { width: 210mm; max-width: none; }
    html.measuring .page2-break { margin-top: 0; border-top: 0; padding-top: 74mm; }
    `
        : `
    .page { padding: 40px; max-width: 900px; margin: 0 auto; }
    @media print {
      .page { padding: 15mm; max-width: 100%; }
      @page { size: A4; margin: 0; }
    }
    `
    }
  </style>
  ${
    letterhead
      ? `
  <style>
    @media screen {
      body {
        background-image: url('${letterhead.replace(/&/g, '%26')}');
        background-size: 100% 297mm;
        background-repeat: no-repeat;
        background-attachment: scroll;
      }
    }
  </style>`
      : ''
  }
</head>
<body>
${
  letterhead
    ? `
<div class="lh-bg"><img src="${letterhead}" alt=""/></div>
<!--
<div class="lh-qr">
  ${
    qrDataUrl
      ? `<img src="${qrDataUrl}" alt="Scan to verify" style="width:72px;height:72px;display:block;margin:0 auto 3px"/>
  <div style="font-size:8px;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Scan to verify</div>`
      : ''
  }
  <div style="font-size:9px;color:#1a3c5e;white-space:nowrap;border-top:1px solid #cbd5e0;padding-top:4px">
    <strong style="text-transform:uppercase;letter-spacing:0.4px">Authorized By</strong>&ensp;&bull;&ensp;Signature &amp; stamp
  </div>
</div>-->
`
    : ''
}
<div class="page"${!isMultiPage ? ' id="page-last"' : ''}>
<div class="content-anchor" style="height:0"></div>

  ${
    letterhead
      ? letterheadHeader
      : `
  <!-- Standard mode: full company header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #1a3c5e;margin-bottom:32px">
    <div>
      <div style="font-size:22px;font-weight:700;color:#1a3c5e;margin-bottom:4px">${companyLabel}</div>
      <div style="font-size:11px;color:#666;line-height:1.6">
        ${esc(inv.companyLegalName ?? '')}<br>
        ${esc(inv.companyCountry ?? 'IQ')}<br>
        FNC Group
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:2px">Invoice</div>
      <div style="font-size:14px;color:#666;margin-top:4px">${invoiceNo}</div>
      <div style="margin-top:8px"><span style="${statusBadgeStyle}">${esc(inv.status)}</span></div>
    </div>
  </div>
  `
  }

  <!-- Invoice header block: dates and number, then Deliver To / Bill To, then the contract row -->
  <section style="margin-bottom:24px">
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:12px">
      <tr>
        <td style="${hdrLabel};width:17%">Date of Issue</td>
        <td style="${hdrValue};width:16%">${esc(fmtShortDate(inv.invoiceDate) ?? none)}</td>
        <td style="${hdrLabel};width:14%">Due Date</td>
        <td style="${hdrValue};width:16%">${esc(fmtShortDate(inv.dueDate) ?? none)}</td>
        <td style="${hdrLabel};width:16%">Invoice No.</td>
        <td style="${hdrValue};width:21%;color:#1d4ed8;font-weight:700">${invoiceNo}</td>
      </tr>
    </table>

    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:28px;margin-bottom:12px">
      <div style="display:grid;grid-template-columns:27% 1fr;border:1px solid ${hdrLine}">
        <div style="${hdrLabel};border:0;border-right:1px solid ${hdrLine};text-align:left;display:flex;align-items:center">Deliver To</div>
        <div style="${hdrText}">${esc(deliverTo) || none}</div>
      </div>
      <div style="display:grid;grid-template-columns:27% 1fr;border:1px solid ${hdrLine}">
        <div style="${hdrLabel};border:0;border-right:1px solid ${hdrLine};text-align:left;display:flex;align-items:center">Bill To</div>
        <div style="${hdrText}">${esc(billTo) || none}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;table-layout:fixed">
      <tr>
        <th style="${hdrHead};width:19%">Contract No.</th>
        <th style="${hdrHead};width:25%">Job</th>
        <th style="${hdrHead};width:17%">Period of Performance</th>
        <th style="${hdrHead};width:16%">Date of Delivery</th>
        <th style="${hdrHead};width:23%">Reference</th>
      </tr>
      <tr>
        <td style="${hdrValue}">${esc(orElse(inv.clientContractNo, none))}</td>
        <td style="${hdrValue}">${esc(inv.projectName ?? none)}</td>
        <td style="${hdrValue}">${esc(orElse(inv.periodOfPerformance, 'n/a'))}</td>
        <td style="${hdrValue}">${esc(fmtShortDate(inv.deliveryDate) ?? none)}</td>
        <td style="${hdrValue}">${esc(inv.projectCode ?? none)}</td>
      </tr>
    </table>
  </section>

  <!-- Lines table (page 1 rows) -->
  <table class="inv-lines" style="width:100%;border-collapse:collapse;margin-bottom:${isMultiPage ? '0' : '28px'};border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
    <thead>${tableHeadRow()}</thead>
    <tbody>${lineRows}</tbody>
    ${isMultiPage ? tableContinuedBar : ''}
  </table>

  ${
    isMultiPage
      ? `
  <!-- Page footer for page 1 -->
  ${pageFooterBar(1)}

  ${continuationPagesHtml}
  `
      : ''
  }

  ${!isMultiPage ? trailingContent : ''}

  ${!isMultiPage ? pageFooterBar(1) : ''}

</div>
${overflowFixScript}
</body>
</html>`
}
