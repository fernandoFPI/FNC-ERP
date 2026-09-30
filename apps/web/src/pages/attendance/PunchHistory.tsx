import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { ATTENDANCE_LOGS_QUERY } from '../../graphql/hr'
import { useTheme } from '../../theme/ThemeContext'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { FilterBar } from '../../components/ui/FilterBar'
import type { Column } from '../../components/ui/Table'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import type { AttendanceLogsQuery, AttendanceLogsQueryVariables } from '../../graphql/generated'

// NOTE: this page was built against a richer attendanceLogs shape
// (isValid/limit filters, a {logs} wrapper, work_location_name,
// rejection_reason, device_id) that ATTENDANCE_LOGS_QUERY / the
// AttendanceLog schema type never actually implements — it only supports
// employee_id/from_date/to_date and returns the flat fields below. Mapped to
// the closest real fields (validity/distance) and filtered client-side
// instead of via a server isValid arg; work_location_name, rejection_reason
// and device_id have no backing field at all and are dropped.
interface PunchLog {
  id: string
  employee_name?: string | null
  punch_type: string
  punched_at: string
  is_valid: boolean
  work_location_id?: string | null
  distance_from_zone?: number
}

const VALID_OPTIONS = [
  { value: 'true', label: 'Valid' },
  { value: 'false', label: 'Invalid' },
]

export default function PunchHistory() {
  const { theme } = useTheme()
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])
  const [validFilter, setValidFilter] = useState('')

  const isValidBool = validFilter === 'true' ? true : validFilter === 'false' ? false : undefined

  const { data, loading, refetch } = useQuery<AttendanceLogsQuery, AttendanceLogsQueryVariables>(ATTENDANCE_LOGS_QUERY, {
    variables: {
      from_date: `${fromDate}T00:00:00`,
      to_date: `${toDate}T23:59:59`,
    },
    fetchPolicy: 'cache-and-network',
  })

  const logs: PunchLog[] = (data?.attendanceLogs ?? [])
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .map((l) => ({
      id: l.id,
      employee_name: l.employee_name,
      punch_type: l.punch_type,
      punched_at: l.punched_at,
      is_valid: l.geofence_valid ?? true,
      work_location_id: l.work_location_id,
      distance_from_zone: l.distance_from_location_m != null ? Number(l.distance_from_location_m) : undefined,
    }))
  const filtered = logs.filter((l) => {
    if (isValidBool !== undefined && l.is_valid !== isValidBool) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (l.employee_name ?? '').toLowerCase().includes(q)
  })

  const total = logs.length
  const valid = logs.filter((l) => l.is_valid).length
  const rejectionRate = total > 0 ? Math.round(((total - valid) / total) * 100) : 0

  const columns: Column<PunchLog>[] = [
    {
      key: 'employee_name',
      header: 'Employee',
      render: (l) => (
        <span style={{ fontWeight: 500, color: theme.textPrimary }}>{l.employee_name ?? '—'}</span>
      ),
    },
    {
      key: 'punched_at',
      header: 'Date',
      render: (l) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {l.punched_at.slice(0, 10)}
        </span>
      ),
    },
    {
      key: 'punch_type',
      header: 'Type',
      render: (l) => (
        <Badge variant={l.punch_type === 'in' ? 'success' : 'info'}>{l.punch_type}</Badge>
      ),
    },
    {
      key: 'punched_at',
      header: 'Time',
      render: (l) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {l.punched_at.slice(11, 19)}
        </span>
      ),
    },
    {
      key: 'work_location_id',
      header: 'Location',
      render: (l) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {l.work_location_id ?? '—'}
        </span>
      ),
    },
    {
      key: 'distance_from_zone',
      header: 'Distance',
      render: (l) => {
        if (l.distance_from_zone == null) return <span style={{ color: theme.textMuted }}>—</span>
        const inside = l.distance_from_zone <= 0
        return (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              color: inside ? theme.success : theme.danger,
            }}
          >
            {l.distance_from_zone}m
          </span>
        )
      },
    },
    {
      key: 'is_valid',
      header: 'Valid',
      render: (l) => (
        <Badge variant={l.is_valid ? 'success' : 'danger'}>
          {l.is_valid ? 'Valid' : 'Invalid'}
        </Badge>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader title="Punch History" subtitle="All employee attendance logs" />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '8px',
          marginBottom: '20px',
        }}
      >
        {[
          { label: 'Total punches', value: total },
          { label: 'Valid punches', value: valid, color: theme.success },
          {
            label: 'Rejection rate',
            value: `${rejectionRate}%`,
            color: rejectionRate > 10 ? theme.danger : theme.textPrimary,
          },
        ].map(({ label, value, color }) => (
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
                fontSize: '10px',
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 700,
                fontFamily: 'monospace',
                color: color ?? theme.textPrimary,
                marginTop: '4px',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <Card>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            filters={[
              {
                key: 'valid',
                label: 'Validity',
                value: validFilter,
                options: VALID_OPTIONS,
                onChange: setValidFilter,
              },
            ]}
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            resultCount={filtered.length}
            onRefresh={() => void refetch()}
          />
        </div>
        <Table columns={columns} data={filtered} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
