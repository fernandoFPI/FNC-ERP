import { useRef, useState } from 'react'
import axios from 'axios'
import { api } from '../../../lib/axios'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'

interface ImportStats {
  projects: number
  pos: number
  poLines: number
  contracts: number
  invoices: number
  invLines: number
  skipped: number
  parsed: {
    projects: number
    pos: number
    poItems: number
    invoices: number
    invItems: number
  }
  errors: string[]
}

export default function WorkflowImportPage() {
  const { theme } = useTheme()
  const user = useAuthStore((s) => s.user)

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<ImportStats | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleImport() {
    if (!file) { setErrorMsg('Please select a .sql file first.'); setStatus('error'); return }
    if (!user?.companyId) { setErrorMsg('No company context — please log in again.'); setStatus('error'); return }

    const fd = new FormData()
    fd.append('file', file)

    setStatus('loading')
    setResult(null)
    setErrorMsg('')

    try {
      const { data } = await api.post<ImportStats>('/admin/workflow-import', fd, { timeout: 600_000 })
      setResult(data)
      setStatus('done')
    } catch (err) {
      let msg = 'Import failed'
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as { error?: { message?: string } } | undefined
        msg = body?.error?.message ?? err.message
      } else if (err instanceof Error) {
        msg = err.message
      }
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  function reset() {
    setFile(null)
    setStatus('idle')
    setResult(null)
    setErrorMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const kpi = (label: string, value: number | string, color?: string) => (
    <div key={label} style={{
      background: theme.bgSurface,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '12px 16px',
    }}>
      <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: color ?? theme.textPrimary, fontFamily: 'monospace' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <PageHeader
        title="Workflow Import"
        subtitle="Upload workflow.sql to import historical projects, purchase orders, and invoices from the legacy system"
      />

      <Card style={{ marginTop: '20px', padding: '24px' }}>
        {/* File picker */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '6px' }}>
            SQL Dump File (.sql)
          </label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".sql,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                setStatus('idle')
                setResult(null)
                setErrorMsg('')
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                background: theme.bgSurface,
                color: theme.textSecondary,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Choose File
            </button>
            <span style={{ fontSize: '13px', color: file ? theme.textPrimary : theme.textMuted }}>
              {file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : 'No file selected'}
            </span>
          </div>
          <p style={{ marginTop: '6px', fontSize: '11px', color: theme.textMuted }}>
            Expected: MySQL/MariaDB dump from workflow_fnc_v3.1 containing tables: projects, po, po_items, invoices, invoice_items
          </p>
        </div>

        {/* Info box */}
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: `${theme.accent}14`,
          border: `1px solid ${theme.accent}30`,
          fontSize: '12px',
          color: theme.textSecondary,
          marginBottom: '24px',
          lineHeight: '1.7',
        }}>
          <strong style={{ color: theme.textPrimary }}>What gets imported:</strong><br />
          Projects → <code>projects</code> table &nbsp;·&nbsp;
          POs + items → <code>purchase_orders</code> + <code>po_lines</code><br />
          Invoices → <code>project_contracts</code> + <code>project_invoices</code> + <code>project_invoice_lines</code><br />
          Existing records (same code / po_number / invoice_number) are skipped silently.
          This import can be re-run safely.
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Button
            variant="primary"
            onClick={() => { void handleImport() }}
            loading={status === 'loading'}
            disabled={!file || status === 'loading'}
          >
            {status === 'loading' ? 'Importing… (may take a few minutes)' : 'Run Import'}
          </Button>
          {(status === 'done' || status === 'error') && (
            <Button variant="ghost" onClick={reset}>Reset</Button>
          )}
        </div>
      </Card>

      {status === 'error' && errorMsg && (
        <div style={{
          marginTop: '16px',
          padding: '14px 18px',
          borderRadius: '8px',
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          fontSize: '13px',
          color: '#991b1b',
          fontWeight: 500,
        }}>
          {errorMsg}
        </div>
      )}

      {status === 'done' && result && (
        <div style={{ marginTop: '16px' }}>
          <Card style={{ padding: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: theme.textPrimary, marginBottom: '8px' }}>
              Import Complete
            </div>
            {result.projects === 0 && result.pos === 0 && result.poLines === 0 && result.parsed.projects > 0 && (
              <div style={{
                padding: '10px 14px', borderRadius: '6px', marginBottom: '16px',
                background: `${theme.accent}14`, border: `1px solid ${theme.accent}40`,
                fontSize: '12px', color: theme.textSecondary,
              }}>
                All records already exist from a previous run — no duplicates created. The database is up to date.
              </div>
            )}

            {/* Parsed (from file) */}
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Parsed from file
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '20px' }}>
              {kpi('Projects', result.parsed.projects, theme.textSecondary)}
              {kpi('POs', result.parsed.pos, theme.textSecondary)}
              {kpi('PO Items', result.parsed.poItems, theme.textSecondary)}
              {kpi('Invoices', result.parsed.invoices, theme.textSecondary)}
              {kpi('Inv Lines', result.parsed.invItems, theme.textSecondary)}
            </div>

            {/* Inserted */}
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Inserted into database
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '20px' }}>
              {kpi('Projects', result.projects, theme.success)}
              {kpi('POs', result.pos, theme.success)}
              {kpi('PO Lines', result.poLines, theme.success)}
              {kpi('Contracts', result.contracts, theme.accent)}
              {kpi('Invoices', result.invoices, theme.accent)}
              {kpi('Inv Lines', result.invLines, theme.accent)}
              {kpi('Skipped', result.skipped, theme.textMuted)}
              {kpi('Row Errors', result.errors.length, result.errors.length > 0 ? '#dc2626' : theme.textMuted)}
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#991b1b', marginBottom: '8px' }}>
                  Batch / row errors ({result.errors.length})
                </div>
                <div style={{
                  maxHeight: '240px',
                  overflowY: 'auto',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                }}>
                  {result.errors.map((e, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '6px 12px',
                        fontSize: '11px',
                        color: '#dc2626',
                        fontFamily: 'monospace',
                        borderBottom: i < result.errors.length - 1 ? `1px solid ${theme.border}` : undefined,
                      }}
                    >
                      {e}
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
