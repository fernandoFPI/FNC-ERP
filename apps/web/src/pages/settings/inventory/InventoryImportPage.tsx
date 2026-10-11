import { tl } from '../../../i18n'
import { useTranslation } from 'react-i18next'
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
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface StockLocation {
  id: string
  name: string
  code: string
  type: string
}

interface ImportRowError {
  sku: string
  name: string
  message: string
}

interface SkippedSheet {
  sheet: string
  reason: string
}

interface ImportResult {
  created: number
  updated: number
  total: number
  errors: ImportRowError[]
  skippedSheets: SkippedSheet[]
}

export default function InventoryImportPage() {
  const { t } = useTranslation()
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
      let msg = t('settings.invImport.importFailed')
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

  const errorColumns: Column<ImportRowError>[] = [
    {
      key: 'sku',
      header: t('settings.invImport.sku'),
      mobilePrimary: true,
      render: (e) => <span style={{ fontFamily: 'monospace', color: theme.accent }}>{e.sku}</span>,
    },
    {
      key: 'name',
      header: t('settings.invImport.name'),
      mobileSecondary: true,
      render: (e) => <span style={{ color: theme.textPrimary }}>{e.name}</span>,
    },
    {
      key: 'message',
      header: t('settings.invImport.error'),
      mobilePriority: 1,
      render: (e) => <span style={{ color: '#dc2626' }}>{e.message}</span>,
    },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '860px', margin: '0 auto' }}>
      <PageHeader
        title={t('settings.invImport.inventoryImport')}
        subtitle={t('settings.invImport.uploadAStoreInventoryExcelFile')}
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
            {t('settings.invImport.excelFileXlsx')}
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
              {t('settings.invImport.chooseFile')}
            </button>
            <span style={{ fontSize: '13px', color: file ? theme.textPrimary : theme.textMuted }}>
              {file ? file.name : t('settings.invImport.noFileSelected')}
            </span>
          </div>
          <p style={{ marginTop: '6px', fontSize: '11px', color: theme.textMuted }}>
            {t('settings.invImport.expectedFormatMultiSheetWorkbookOne')}
          </p>
        </div>

        {/* Location selector */}
        <div style={{ marginBottom: '24px', maxWidth: '340px' }}>
          <Select
            label={t('settings.invImport.targetStockLocation')}
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value)
            }}
          >
            <option value="">{t('settings.invImport.selectLocation')}</option>
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
            {status === 'loading' ? t('settings.invImport.importing') : t('settings.invImport.runImport')}
          </Button>
          {(status === 'done' || status === 'error') && (
            <Button variant="ghost" onClick={reset}>
              {t('settings.invImport.reset')}
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
            {t('settings.invImport.importComplete')}
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
                  {tl('settings.invImport.statOpts', label, label)}
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

          {/* Skipped sheets */}
          {result.skippedSheets.length > 0 && (
            <div
              style={{
                marginBottom: result.errors.length > 0 ? '20px' : 0,
                padding: '12px 14px',
                borderRadius: '6px',
                background: '#fffbeb',
                border: '1px solid #fcd34d',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#92400e', marginBottom: '6px' }}>
                {t('settings.invImport.skippedSheets', { count: result.skippedSheets.length })}
              </div>
              <ul style={{ margin: 0, paddingInlineStart: '18px' }}>
                {result.skippedSheets.map((s) => (
                  <li key={s.sheet} style={{ fontSize: '12px', color: '#92400e' }}>
                    <strong>{s.sheet}</strong> — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error table */}
          {result.errors.length > 0 && (
            <>
              <div
                style={{ fontWeight: 600, fontSize: '13px', color: '#991b1b', marginBottom: '8px' }}
              >
                {t('settings.invImport.failedRows', { count: result.errors.length })}
              </div>
              <div
                style={{
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  overflow: 'hidden',
                }}
              >
                <Table
                  columns={errorColumns}
                  data={result.errors}
                  emptyMessage={t('settings.invImport.noFailedRows')}
                  maxHeight="60vh"
                  stickyHeader
                />
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
