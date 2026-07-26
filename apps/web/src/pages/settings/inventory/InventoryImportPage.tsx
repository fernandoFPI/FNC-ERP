import { useRef, useState } from 'react'
import { useQuery } from '@apollo/client'
import axios from 'axios'
import { STOCK_LOCATIONS_QUERY } from '../../../graphql/inventory'
import { api } from '../../../lib/axios'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'

interface StockLocation {
  id: string
  name: string
  code: string
  type: string
}

interface ImportResult {
  created: number
  updated: number
  total: number
  errors: { sku: string; name: string; message: string }[]
}

export default function InventoryImportPage() {
  const { theme } = useTheme()
  const user = useAuthStore((s) => s.user)

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [locationId, setLocationId] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const { data: locData } = useQuery<{ stockLocations: StockLocation[] }>(STOCK_LOCATIONS_QUERY, {
    variables: { isActive: true },
  })
  const locations = locData?.stockLocations ?? []

  async function handleImport() {
    if (!file) {
      setErrorMsg('Please select an Excel file first.')
      setStatus('error')
      return
    }
    if (!locationId) {
      setErrorMsg('Please select a stock location.')
      setStatus('error')
      return
    }
    if (!user?.companyId) {
      setErrorMsg('No company context — please log in again.')
      setStatus('error')
      return
    }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('company_id', user.companyId)
    fd.append('location_id', locationId)

    setStatus('loading')
    setResult(null)
    setErrorMsg('')

    try {
      const { data } = await api.post<ImportResult>('/admin/inventory-import', fd, {
        timeout: 180_000,
      })
      setResult(data)
      setStatus('done')
    } catch (err) {
      let msg = 'Import failed'
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as { error?: { message?: string } } | undefined
        msg = body?.error?.message ?? err.message
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

  return (
    <div style={{ padding: '24px', maxWidth: '860px', margin: '0 auto' }}>
      <PageHeader
        title="Inventory Import"
        subtitle="Upload a store inventory Excel file to create or update products and stock balances"
      />

      <Card style={{ marginTop: '20px', padding: '24px' }}>
        {/* File picker */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textSecondary,
              marginBottom: '6px',
            }}
          >
            Excel File (.xlsx)
          </label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
              {file ? file.name : 'No file selected'}
            </span>
          </div>
          <p style={{ marginTop: '6px', fontSize: '11px', color: theme.textMuted }}>
            Expected format: multi-sheet workbook named "Store Inventory 2025.xlsx" with one sheet
            per store
          </p>
        </div>

        {/* Location selector */}
        <div style={{ marginBottom: '24px', maxWidth: '340px' }}>
          <Select
            label="Target Stock Location"
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value)
            }}
          >
            <option value="">— Select location —</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </Select>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Button
            variant="primary"
            onClick={() => {
              void handleImport()
            }}
            loading={status === 'loading'}
            disabled={!file || !locationId || status === 'loading'}
          >
            {status === 'loading' ? 'Importing…' : 'Run Import'}
          </Button>
          {(status === 'done' || status === 'error') && (
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          )}
        </div>
      </Card>

      {/* Error state */}
      {status === 'error' && errorMsg && (
        <div
          style={{
            marginTop: '16px',
            padding: '14px 18px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            fontSize: '13px',
            color: '#991b1b',
            fontWeight: 500,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Success results */}
      {status === 'done' && result && (
        <Card style={{ marginTop: '16px', padding: '20px' }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '15px',
              color: theme.textPrimary,
              marginBottom: '16px',
            }}
          >
            Import Complete
          </div>

          {/* Summary KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            {(
              [
                ['Total Rows', result.total, theme.textPrimary],
                ['Created', result.created, theme.success],
                ['Updated', result.updated, theme.accent],
                [
                  'Errors',
                  result.errors.length,
                  result.errors.length > 0 ? '#dc2626' : theme.textMuted,
                ],
              ] as [string, number, string][]
            ).map(([label, value, color]) => (
              <div
                key={label}
                style={{
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color,
                    fontFamily: 'monospace',
                    marginTop: '4px',
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Error table */}
          {result.errors.length > 0 && (
            <>
              <div
                style={{ fontWeight: 600, fontSize: '13px', color: '#991b1b', marginBottom: '8px' }}
              >
                Failed rows ({result.errors.length})
              </div>
              <div
                style={{
                  overflowX: 'auto',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: theme.bgSurface }}>
                      {['SKU', 'Name', 'Error'].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: theme.textSecondary,
                            borderBottom: `1px solid ${theme.border}`,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td
                          style={{
                            padding: '7px 12px',
                            fontFamily: 'monospace',
                            color: theme.accent,
                          }}
                        >
                          {e.sku}
                        </td>
                        <td style={{ padding: '7px 12px', color: theme.textPrimary }}>{e.name}</td>
                        <td style={{ padding: '7px 12px', color: '#dc2626' }}>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
