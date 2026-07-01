import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { buildInvoiceHTML, type InvoiceRenderData, type BankAccount } from '../../lib/invoiceHtml'

interface VerifyResponse {
  valid: boolean
  reason: string | null
  invoice: (InvoiceRenderData & { bankAccountId: string | null }) | null
  bankAccount: BankAccount | null
}

const VERIFY_URL = import.meta.env.VITE_API_URL as string

function fmt(n: number, cur: string) {
  return (
    new Intl.NumberFormat('en-IQ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) +
    ' ' +
    cur
  )
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { margin: 0; }

  .vp { min-height: 100vh; background: #f1f5f9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, Arial, sans-serif; color: #1e293b; }

  /* ── Header ── */
  .vp-header {
    background: #1a3c5e;
    height: 54px;
    display: flex;
    align-items: center;
    padding: 0 28px;
    gap: 14px;
  }
  .vp-header-logo { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.2px; }
  .vp-header-sep { width: 1px; height: 16px; background: rgba(255,255,255,0.18); }
  .vp-header-tag { font-size: 12px; color: rgba(255,255,255,0.5); }

  /* ── Layout ── */
  .vp-body {
    max-width: 1360px;
    margin: 0 auto;
    padding: 28px 24px 48px;
    display: flex;
    gap: 22px;
    align-items: flex-start;
  }

  /* ── Invoice panel (left) ── */
  .vp-invoice {
    flex: 1;
    min-width: 0;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
  }
  .vp-invoice-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid #f1f5f9;
    background: #fafafa;
  }
  .vp-invoice-bar-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; }
  .vp-invoice-bar-num { font-size: 13px; font-weight: 600; color: #1a3c5e; }
  .vp-iframe { width: 100%; border: none; display: block; }

  /* ── Sidebar (right) ── */
  .vp-sidebar {
    width: 310px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: sticky;
    top: 24px;
  }

  /* ── Status card ── */
  .vp-status {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
  }
  .vp-status-hero {
    padding: 28px 22px 20px;
    text-align: center;
    border-bottom: 1px solid #f1f5f9;
  }
  .vp-icon {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 14px;
    font-size: 28px;
  }
  .vp-icon.valid   { background: #dcfce7; }
  .vp-icon.invalid { background: #fee2e2; }
  .vp-status-title { font-size: 19px; font-weight: 700; margin-bottom: 6px; }
  .vp-status-title.valid   { color: #15803d; }
  .vp-status-title.invalid { color: #b91c1c; }
  .vp-status-sub { font-size: 12.5px; color: #64748b; line-height: 1.55; }

  /* ── Rows ── */
  .vp-rows { padding: 6px 20px 10px; }
  .vp-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid #f8fafc;
  }
  .vp-row:last-child { border-bottom: none; }
  .vp-row-label { font-size: 12px; color: #94a3b8; white-space: nowrap; flex-shrink: 0; }
  .vp-row-value { font-size: 12.5px; color: #1e293b; font-weight: 500; text-align: right; }
  .vp-row-value.green { color: #15803d; font-weight: 600; }
  .vp-row-value.red   { color: #b91c1c; font-weight: 600; }
  .vp-row-value.bold  { color: #0f172a; font-weight: 700; font-size: 13px; }

  /* ── Issuer card ── */
  .vp-issuer {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px 20px;
  }
  .vp-issuer-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.9px; margin-bottom: 10px; }
  .vp-issuer-name  { font-size: 15px; font-weight: 700; color: #1a3c5e; margin-bottom: 2px; }
  .vp-issuer-legal { font-size: 12px; color: #64748b; margin-bottom: 10px; }
  .vp-issuer-time  { font-size: 11px; color: #94a3b8; }

  /* ── Print button ── */
  .vp-print {
    width: 100%;
    padding: 12px;
    background: #1a3c5e;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: 0.2px;
  }
  .vp-print:hover { background: #153252; }

  /* ── Loading ── */
  .vp-center { display: flex; align-items: center; justify-content: center; min-height: calc(100vh - 54px); }
  .vp-spinner {
    width: 34px; height: 34px;
    border: 3px solid #e2e8f0;
    border-top-color: #1a3c5e;
    border-radius: 50%;
    animation: vp-spin 0.75s linear infinite;
    margin: 0 auto 14px;
  }
  @keyframes vp-spin { to { transform: rotate(360deg); } }

  /* ── Error card ── */
  .vp-err-card {
    background: #fff;
    border: 1px solid #fecaca;
    border-radius: 14px;
    padding: 48px 36px;
    text-align: center;
    max-width: 380px;
    margin: 0 auto;
  }

  /* ── Mobile ── */
  @media (max-width: 800px) {
    .vp-body { flex-direction: column; padding: 16px 16px 40px; align-items: stretch; }
    .vp-sidebar { width: 100%; position: static; order: 1; }
    .vp-invoice { width: 100%; order: 2; }
  }
`

export default function InvoiceVerifyPage() {
  const { token } = useParams<{ token: string }>()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<VerifyResponse | null>(null)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const invoicePanelRef = useRef<HTMLDivElement>(null)

  const NATURAL_W = 900

  useEffect(() => {
    const el = invoicePanelRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setZoom(Math.min(1, entry.contentRect.width / NATURAL_W))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!token) { setError(true); setLoading(false); return }
    fetch(`${VERIFY_URL}/api/v1/verify/invoice/${token}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.success) setResult(body.data as VerifyResponse)
        else setError(true)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [token])

  const inv = result?.invoice
  const bank = result?.bankAccount
  const valid = result?.valid ?? false
  const notFound = !loading && !error && result && !inv

  const rawHtml = inv ? buildInvoiceHTML(inv, bank ?? undefined, inv.paymentType, inv.companyStampImage) : null
  // Inject zoom into the srcDoc so the full invoice width fits the container and
  // the iframe can size itself to the zoomed content height (scroll works naturally).
  const invoiceHtml = rawHtml
    ? rawHtml.replace('</head>', `<style>html{zoom:${zoom.toFixed(3)};overflow-x:hidden}body{margin:0}</style></head>`)
    : null

  const verifiedAt = new Date()

  return (
    <>
      <style>{CSS}</style>
      <div className="vp">
        {/* Header */}
        <header className="vp-header">
          <span className="vp-header-logo">FNC Group ERP</span>
          <span className="vp-header-sep" />
          <span className="vp-header-tag">Invoice Verification Portal</span>
        </header>

        {/* Loading */}
        {loading && (
          <div className="vp-center">
            <div>
              <div className="vp-spinner" />
              <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'center' }}>Verifying invoice…</div>
            </div>
          </div>
        )}

        {/* Not found / error */}
        {!loading && (error || notFound) && (
          <div className="vp-center">
            <div className="vp-err-card">
              <div style={{ fontSize: '48px', marginBottom: '18px', lineHeight: 1 }}>❌</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#b91c1c', marginBottom: '10px' }}>
                Invalid QR Code
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.65 }}>
                This QR code does not match any invoice in our system. If you received this invoice,
                please contact the issuing company to verify its authenticity.
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        {!loading && !error && inv && (
          <div className="vp-body">
            {/* Invoice preview */}
            <div className="vp-invoice" ref={invoicePanelRef}>
              <div className="vp-invoice-bar">
                <span className="vp-invoice-bar-title">Invoice Preview</span>
                <span className="vp-invoice-bar-num">#{inv.invoiceNumber}</span>
              </div>
              <iframe
                ref={iframeRef}
                srcDoc={invoiceHtml ?? ''}
                className="vp-iframe"
                title={`Invoice ${inv.invoiceNumber}`}
                style={{ height: `${Math.round(1800 * zoom)}px` }}
              />
            </div>

            {/* Sidebar */}
            <div className="vp-sidebar">
              {/* Status card */}
              <div className="vp-status">
                <div className="vp-status-hero">
                  <div className={`vp-icon ${valid ? 'valid' : 'invalid'}`}>
                    {valid ? '✅' : '❌'}
                  </div>
                  <div className={`vp-status-title ${valid ? 'valid' : 'invalid'}`}>
                    {valid ? 'Genuine Invoice' : 'Invoice Revoked'}
                  </div>
                  <div className="vp-status-sub">
                    {valid
                      ? 'This invoice was issued by FNC Group and is authentic.'
                      : `This invoice has been ${result?.reason ?? 'revoked'} and is no longer valid.`}
                  </div>
                </div>

                <div className="vp-rows">
                  <Row label="Invoice #"    value={inv.invoiceNumber} />
                  <Row label="Status"       value={inv.status.charAt(0).toUpperCase() + inv.status.slice(1)} color={valid ? 'green' : 'red'} />
                  <Row label="Invoice Date" value={fmtDate(String(inv.invoiceDate))} />
                  <Row label="Due Date"     value={fmtDate(String(inv.dueDate))} />
                  <Row label="Client"       value={inv.clientName ?? '—'} />
                  <Row label="Project"      value={inv.projectName ?? '—'} />
                  <Row label="Net Payable"  value={fmt(inv.netPayable, inv.currencyCode)} bold />
                </div>
              </div>

              {/* Issuer */}
              <div className="vp-issuer">
                <div className="vp-issuer-label">Issued By</div>
                <div className="vp-issuer-name">{inv.companyName ?? 'FNC Group'}</div>
                <div className="vp-issuer-legal">{inv.companyLegalName ?? ''}</div>
                <div className="vp-issuer-time">
                  Verified {verifiedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} at{' '}
                  {verifiedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              {/* Print */}
              <button className="vp-print" onClick={() => iframeRef.current?.contentWindow?.print()}>
                Print / Save as PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Row({
  label,
  value,
  bold,
  color,
}: {
  label: string
  value: string
  bold?: boolean
  color?: 'green' | 'red'
}) {
  const cls = ['vp-row-value', color ?? '', bold ? 'bold' : ''].filter(Boolean).join(' ')
  return (
    <div className="vp-row">
      <span className="vp-row-label">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  )
}
