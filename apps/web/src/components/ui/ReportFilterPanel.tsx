import { useState, useRef } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Select } from './Select'
import { Input } from './Input'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { formatRelativeTime } from '../../lib/format'

interface Company { id: string; name: string }
interface CostCenter { id: string; name: string }

interface ReportFilterPanelProps {
  type: 'date_range' | 'single_date' | 'period_select'
  companies?: Company[]
  selectedCompanyId?: string
  onCompanyChange?: (id: string) => void
  fromDate?: string
  toDate?: string
  asOfDate?: string
  onDateChange?: (from: string, to: string) => void
  onAsOfDateChange?: (date: string) => void
  costCenters?: CostCenter[]
  selectedCostCenterId?: string
  onCostCenterChange?: (id: string) => void
  onExport?: (format: 'csv' | 'xlsx' | 'pdf') => void
  onPrint?: () => void
  lastRun?: string
  autoRefresh?: boolean
  onAutoRefreshToggle?: (enabled: boolean) => void
}

const PERIODS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'last_year', label: 'Last Year' },
]

export function ReportFilterPanel({
  type,
  companies,
  selectedCompanyId,
  onCompanyChange,
  fromDate,
  toDate,
  asOfDate,
  onDateChange,
  onAsOfDateChange,
  costCenters,
  selectedCostCenterId,
  onCostCenterChange,
  onExport,
  onPrint,
  lastRun,
  autoRefresh = false,
  onAutoRefreshToggle,
}: ReportFilterPanelProps) {
  const { theme } = useTheme()
  const [exportOpen, setExportOpen] = useState(false)
  const [localFrom, setLocalFrom] = useState(fromDate ?? '')
  const [localTo, setLocalTo] = useState(toDate ?? '')
  const [localPeriod, setLocalPeriod] = useState('this_month')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const companyOptions = [
    { value: '', label: 'All Companies' },
    ...(companies ?? []).map(c => ({ value: c.id, label: c.name })),
  ]

  const costCenterOptions = [
    { value: '', label: 'All Cost Centers' },
    ...(costCenters ?? []).map(cc => ({ value: cc.id, label: cc.name })),
  ]

  const handleExport = (fmt: 'csv' | 'xlsx' | 'pdf') => {
    setExportOpen(false)
    onExport?.(fmt)
  }

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      background: theme.bgSurface,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: '12px 16px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'flex-end',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      {/* Company selector */}
      {companies && companies.length > 0 && (
        <Select
          label="Company"
          value={selectedCompanyId ?? ''}
          onChange={e => onCompanyChange?.(e.target.value)}
          options={companyOptions}
          style={{ minWidth: 160 }}
        />
      )}

      {/* Cost center */}
      {costCenters && costCenters.length > 0 && (
        <Select
          label="Cost Center"
          value={selectedCostCenterId ?? ''}
          onChange={e => onCostCenterChange?.(e.target.value)}
          options={costCenterOptions}
          style={{ minWidth: 160 }}
        />
      )}

      {/* Date controls */}
      {type === 'date_range' && (
        <>
          <Input
            label="From"
            type="date"
            value={localFrom}
            onChange={e => {
              setLocalFrom(e.target.value)
              onDateChange?.(e.target.value, localTo)
            }}
            style={{ width: 140 }}
          />
          <Input
            label="To"
            type="date"
            value={localTo}
            onChange={e => {
              setLocalTo(e.target.value)
              onDateChange?.(localFrom, e.target.value)
            }}
            style={{ width: 140 }}
          />
        </>
      )}

      {type === 'single_date' && (
        <Input
          label="As of Date"
          type="date"
          value={asOfDate ?? ''}
          onChange={e => onAsOfDateChange?.(e.target.value)}
          style={{ width: 140 }}
        />
      )}

      {type === 'period_select' && (
        <Select
          label="Period"
          value={localPeriod}
          onChange={e => setLocalPeriod(e.target.value)}
          options={PERIODS}
          style={{ width: 160 }}
        />
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Auto-refresh toggle */}
      {onAutoRefreshToggle !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
          <Checkbox
            checked={autoRefresh}
            onChange={onAutoRefreshToggle}
            label="Auto-refresh"
          />
        </div>
      )}

      {/* Last run */}
      {lastRun && (
        <span style={{ color: theme.textMuted, fontSize: 12, paddingBottom: 6 }}>
          Last run: {formatRelativeTime(lastRun)}
        </span>
      )}

      {/* Print */}
      {onPrint && (
        <Button onClick={onPrint} size="sm">Print</Button>
      )}

      {/* Export dropdown */}
      {onExport && (
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <Button onClick={() => setExportOpen(o => !o)} size="sm">
            Export ▾
          </Button>
          {exportOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 4,
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              zIndex: 100,
              minWidth: 120,
              overflow: 'hidden',
            }}>
              {(['csv', 'xlsx', 'pdf'] as const).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => handleExport(fmt)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: theme.textPrimary,
                    fontSize: 13,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = theme.bgSurfaceHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
