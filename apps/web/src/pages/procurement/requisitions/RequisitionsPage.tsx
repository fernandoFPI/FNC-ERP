import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { REQUISITIONS_QUERY } from '../../../graphql/requisitions'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { FilterChipStrip } from '../../../components/ui/FilterChipStrip'
import { Button } from '../../../components/ui/Button'
import {
  REQUISITION_STATUSES,
  REQUISITION_PRIORITY_LABELS,
  getRequisitionStatusVariant,
  getRequisitionStatusLabel,
} from '../../../lib/requisition-constants'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'

const FILTER_DEFAULTS = { search: '', status: '', fromDate: '', toDate: '' }

const PRIORITY_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  low: { color: '#6b7280', bg: 'transparent', border: 'transparent' },
  high: { color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.3)' },
  emergency: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.3)' },
}

interface Requisition {
  id: string
  requisition_number: string
  status: string
  priority?: string
  purpose?: string
  delivery_destination?: string
  project_id?: string | null
  projectName?: string | null
  branch_id?: string | null
  branch_name?: string | null
  organizer_id?: string | null
  organizerName?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

const STATUS_OPTIONS = [
  ...REQUISITION_STATUSES.map((s) => ({ value: s.key, label: s.label })),
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

function downloadCSV(rows: string[][], filename: string) {
  const content = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + content, ''], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function RequisitionsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [myRequisitionsOnly, setMyRequisitionsOnly] = useState(false)

  const { data, loading, refetch } = useQuery(REQUISITIONS_QUERY, {
    variables: {
      status: statusFilter || undefined,
      myQueueOnly: myRequisitionsOnly || undefined,
    },
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('requisition', () => void refetch())

  const currentFilters = { search, status: statusFilter, fromDate, toDate }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'requisitions',
    FILTER_DEFAULTS,
  )

  const requisitions: Requisition[] = data?.requisitions ?? []
  const filtered = requisitions.filter((r) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !r.requisition_number.toLowerCase().includes(q) &&
        !(r.purpose ?? '').toLowerCase().includes(q) &&
        !(r.projectName ?? '').toLowerCase().includes(q) &&
        !(r.notes ?? '').toLowerCase().includes(q)
      )
        return false
    }
    if (fromDate && r.created_at < fromDate) return false
    if (toDate && r.created_at > toDate + 'T23:59:59') return false
    return true
  })

  const handleExport = () => {
    const header = ['Requisition #', 'Purpose', 'Project', 'Branch', 'Status', 'Priority', 'Organizer', 'Created']
    const rows = filtered.map((r) => [
      r.requisition_number,
      r.purpose ?? '',
      r.projectName ?? '',
      r.branch_name ?? '',
      getRequisitionStatusLabel(r.status),
      REQUISITION_PRIORITY_LABELS[r.priority ?? 'low'] ?? r.priority ?? '',
      r.organizerName ?? '',
      r.created_at.slice(0, 10),
    ])
    downloadCSV([header, ...rows], `requisitions-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const columns: Column<Requisition>[] = [
    {
      key: 'priority',
      header: 'Priority',
      render: (r) => {
        const p = r.priority ?? 'low'
        const s = PRIORITY_STYLES[p] ?? PRIORITY_STYLES.low
        if (p === 'low') return <span style={{ fontSize: '12px', color: s.color }}>—</span>
        return (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: s.color,
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: '5px',
              padding: '2px 8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {REQUISITION_PRIORITY_LABELS[p] ?? p}
          </span>
        )
      },
    },
    {
      key: 'requisition_number',
      header: 'Requisition #',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
          {r.requisition_number}
        </span>
      ),
    },
    {
      key: 'purpose',
      header: 'Purpose',
      render: (r) => (
        <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{r.purpose ?? '—'}</span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (r) =>
        r.project_id ? (
          <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{r.projectName ?? '—'}</span>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '13px' }}>—</span>
        ),
    },
    {
      key: 'branch_name',
      header: 'Branch',
      render: (r) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{r.branch_name ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant={getRequisitionStatusVariant(r.status)}>{getRequisitionStatusLabel(r.status)}</Badge>
      ),
    },
    {
      key: 'organizerName',
      header: 'Organizer',
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>{r.organizerName ?? '—'}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>{r.created_at.slice(0, 10)}</span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Requisitions"
        subtitle={`${filtered.length} requisitions`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" size="sm" onClick={handleExport}>
              Export CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/procurement/requisitions/new')
              }}
            >
              New Requisition
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <button
          onClick={() => {
            setMyRequisitionsOnly((v) => !v)
          }}
          style={{
            flexShrink: 0,
            padding: '6px 12px',
            borderRadius: '7px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            border: `1px solid ${myRequisitionsOnly ? theme.success : theme.border}`,
            background: myRequisitionsOnly ? theme.success : theme.bgSurface,
            color: myRequisitionsOnly ? '#fff' : theme.textMuted,
          }}
        >
          👤 My Requisitions
        </button>
      </div>

      <div style={{ marginTop: '10px' }}>
        <FilterChipStrip
          allCount={requisitions.length}
          activeKey={statusFilter}
          onChange={setStatusFilter}
          chips={REQUISITION_STATUSES.map((s) => ({
            key: s.key,
            label: s.label,
            count: requisitions.filter((r) => r.status === s.key).length,
            variant: getRequisitionStatusVariant(s.key),
          }))}
        />
      </div>

      <Card style={{ marginTop: '12px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              options: STATUS_OPTIONS,
              onChange: setStatusFilter,
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        >
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
              setStatusFilter(r.status)
              setFromDate(r.fromDate)
              setToDate(r.toDate)
            }}
            onSave={(name) => {
              savePreset(name, currentFilters)
            }}
            onDelete={deletePreset}
          />
        </FilterBar>

        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="id"
          onRowClick={(r) => {
            navigate(`/procurement/requisitions/${r.id}`)
          }}
          getRowStyle={(r) =>
            r.priority === 'emergency'
              ? { background: 'rgba(220,38,38,0.06)', borderLeft: '3px solid #dc2626' }
              : {}
          }
        />
      </Card>
    </div>
  )
}
