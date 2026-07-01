import React, { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { SearchInput } from './SearchInput'
import { Select } from './Select'
import { Button } from './Button'

interface FilterOption { value: string; label: string }

interface FilterBarFilter {
  key: string
  label: string
  options: FilterOption[]
  value: string
  onChange: (v: string) => void
}

interface FilterBarProps {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string } | string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  filters?: FilterBarFilter[]
  dateRange?: { from: string; to: string; onChange: (from: string, to: string) => void }
  fromDate?: string
  toDate?: string
  onFromDateChange?: (v: string) => void
  onToDateChange?: (v: string) => void
  onExport?: () => void
  onRefresh?: () => void
  resultCount?: number
  children?: React.ReactNode
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  dateRange,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onExport,
  onRefresh,
  resultCount,
  children,
}: FilterBarProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  const searchValue = typeof search === 'object' ? search.value : (typeof search === 'string' ? search : '')
  const searchOnChange = typeof search === 'object' ? search.onChange : onSearchChange
  const searchPlaceholderResolved = typeof search === 'object'
    ? (search.placeholder ?? 'Search…')
    : (searchPlaceholder ?? 'Search…')

  const resolvedFrom = dateRange ? dateRange.from : (fromDate ?? '')
  const resolvedTo   = dateRange ? dateRange.to   : (toDate ?? '')
  const hasDateRange = !!(dateRange || onFromDateChange || onToDateChange)
  const hasSearch    = searchOnChange != null || typeof search === 'object'

  const hasSecondaryFilters = !!(
    (filters && filters.length > 0) ||
    hasDateRange ||
    onRefresh ||
    onExport ||
    children
  )

  // ── PHONE — Collapsible filter row ──────────────────────────────────────────
  if (isPhone) {
    return (
      <div style={{ marginBottom: '12px' }}>
        {/* Always-visible: search + toggle */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: filtersExpanded && hasSecondaryFilters ? '10px' : '0',
        }}>
          {hasSearch && (
            <div style={{ flex: 1 }}>
              <SearchInput
                value={searchValue}
                onChange={searchOnChange ?? (() => undefined)}
                placeholder={searchPlaceholderResolved}
              />
            </div>
          )}
          {hasSecondaryFilters && (
            <button
              onClick={() => setFiltersExpanded((e) => !e)}
              style={{
                background: filtersExpanded ? theme.accentBg : theme.bgSurface,
                border: `0.5px solid ${filtersExpanded ? theme.accent : theme.border}`,
                borderRadius: '10px',
                padding: '0 14px',
                color: filtersExpanded ? theme.accent : theme.textSecondary,
                fontSize: '13px',
                cursor: 'pointer',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span>Filters</span>
              <span>{filtersExpanded ? '▲' : '▼'}</span>
            </button>
          )}
        </div>

        {/* Expandable filter section */}
        {filtersExpanded && hasSecondaryFilters && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filters?.map((filter) => (
              <Select
                key={filter.key}
                value={filter.value}
                onChange={(e) => filter.onChange(e.target.value)}
                options={[{ value: '', label: `All ${filter.label}` }, ...filter.options]}
              />
            ))}
            {hasDateRange && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="date"
                  value={resolvedFrom}
                  onChange={(e) => {
                    if (dateRange) dateRange.onChange(e.target.value, resolvedTo)
                    else onFromDateChange?.(e.target.value)
                  }}
                  style={{
                    background: theme.bgSurface,
                    border: `1px solid ${theme.borderInput}`,
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '16px',
                    color: theme.textSecondary,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    width: '100%',
                    minHeight: '44px',
                    outline: 'none',
                  }}
                />
                <input
                  type="date"
                  value={resolvedTo}
                  onChange={(e) => {
                    if (dateRange) dateRange.onChange(resolvedFrom, e.target.value)
                    else onToDateChange?.(e.target.value)
                  }}
                  style={{
                    background: theme.bgSurface,
                    border: `1px solid ${theme.borderInput}`,
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '16px',
                    color: theme.textSecondary,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    width: '100%',
                    minHeight: '44px',
                    outline: 'none',
                  }}
                />
              </div>
            )}
            {resultCount !== undefined && (
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                {resultCount.toLocaleString()} result{resultCount !== 1 ? 's' : ''}
              </span>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              {onRefresh && (
                <Button variant="secondary" size="sm" fullWidthOnMobile onClick={onRefresh} icon={
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                }>Refresh</Button>
              )}
              {onExport && (
                <Button variant="secondary" size="sm" fullWidthOnMobile onClick={onExport} icon={
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                }>Export</Button>
              )}
            </div>
            {children}
          </div>
        )}
      </div>
    )
  }

  // ── DESKTOP / TABLET — Horizontal row (existing behaviour) ───────────────────
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
      {hasSearch && (
        <SearchInput
          value={searchValue}
          onChange={searchOnChange ?? (() => undefined)}
          placeholder={searchPlaceholderResolved}
        />
      )}
      {filters?.map((filter) => (
        <Select
          key={filter.key}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          options={[{ value: '', label: `All ${filter.label}` }, ...filter.options]}
          style={{ minWidth: '130px' }}
        />
      ))}
      {hasDateRange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>From</span>
          <input
            type="date"
            value={resolvedFrom}
            onChange={(e) => {
              if (dateRange) dateRange.onChange(e.target.value, resolvedTo)
              else onFromDateChange?.(e.target.value)
            }}
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.borderInput}`,
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              color: theme.textSecondary,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: '12px', color: theme.textMuted }}>To</span>
          <input
            type="date"
            value={resolvedTo}
            onChange={(e) => {
              if (dateRange) dateRange.onChange(resolvedFrom, e.target.value)
              else onToDateChange?.(e.target.value)
            }}
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.borderInput}`,
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              color: theme.textSecondary,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          />
        </div>
      )}
      <div style={{ flex: 1 }} />
      {resultCount !== undefined && (
        <span style={{ fontSize: '12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
          {resultCount.toLocaleString()} result{resultCount !== 1 ? 's' : ''}
        </span>
      )}
      {onRefresh && (
        <Button variant="ghost" size="sm" onClick={onRefresh} icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        } />
      )}
      {onExport && (
        <Button variant="ghost" size="sm" onClick={onExport} icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        }>Export</Button>
      )}
      {children}
    </div>
  )
}
