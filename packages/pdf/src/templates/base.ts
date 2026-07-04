export const BASE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', Arial, sans-serif;
    font-size: 13px;
    color: #1a1a1a;
    line-height: 1.5;
    background: white;
  }

  .page { padding: 0; background: white; }

  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 24px;
    border-bottom: 3px solid #1a3c5e;
    margin-bottom: 32px;
  }

  .company-name { font-size: 22px; font-weight: 700; color: #1a3c5e; margin-bottom: 4px; }
  .company-meta { font-size: 11px; color: #666; line-height: 1.6; }

  .doc-title { text-align: right; }
  .doc-title h1 {
    font-size: 24px; font-weight: 700; color: #1a3c5e;
    text-transform: uppercase; letter-spacing: 2px;
  }
  .doc-title .doc-number { font-size: 14px; color: #666; margin-top: 4px; }

  .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .meta-section h3 {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 1px; color: #999; margin-bottom: 8px;
  }
  .meta-section p { font-size: 13px; color: #1a1a1a; line-height: 1.6; }

  .doc-table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  .doc-table thead { display: table-header-group; }
  .doc-table th {
    background: #1a3c5e; color: white; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 12px; text-align: left;
  }
  .doc-table td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
  .doc-table tbody tr { page-break-inside: avoid; }
  .doc-table tr:nth-child(even) td { background: #fafafa; }
  .doc-table .text-right { text-align: right; }
  .doc-table .text-center { text-align: center; }

  .totals-section { display: flex; justify-content: flex-end; margin-bottom: 32px; page-break-inside: avoid; }
  .totals-box { width: 320px; }
  .totals-row {
    display: flex; justify-content: space-between;
    padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;
  }
  .totals-row.total {
    font-weight: 700; font-size: 15px; color: #1a3c5e;
    border-top: 2px solid #1a3c5e; border-bottom: 2px solid #1a3c5e;
    padding: 10px 0; margin-top: 4px;
  }

  .status-badge {
    display: inline-block; padding: 3px 10px; border-radius: 12px;
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .status-paid     { background: #d1fae5; color: #065f46; }
  .status-issued   { background: #dbeafe; color: #1e40af; }
  .status-draft    { background: #f3f4f6; color: #374151; }
  .status-approved { background: #fef3c7; color: #92400e; }

  .doc-footer {
    border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 32px;
    font-size: 10px; color: #999; text-align: center;
  }

  .amount { font-family: 'Courier New', monospace; font-size: 12px; }
`

export function formatCurrency(amount: number, currency: string): string {
  return (
    new Intl.NumberFormat('en-IQ', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) +
    ' ' +
    currency
  )
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function companyHeader(company: {
  name: string
  legalName: string
  city: string
  country: string
}): string {
  return `
    <div class="doc-header-left">
      <div class="company-name">${company.name}</div>
      <div class="company-meta">
        ${company.legalName}<br>
        ${company.city}, ${company.country}<br>
        FNC Group
      </div>
    </div>
  `
}
