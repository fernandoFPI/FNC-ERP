import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Grid } from '../../../components/ui/Grid'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { ATTENDANCE_SUMMARY_QUERY } from '../../../graphql/reporting'

interface AttendanceRow {
  employeeName: string
  employeeNumber: string
  department: string
  totalPresent: number
  totalAbsent: number
  totalLeave: number
  totalOvertime: number
  attendancePct: number
}

interface AttendanceData {
  attendanceSummaryReport: {
    rows: AttendanceRow[]
    totalEmployees: number
    avgAttendancePct: number
  }
}

function attendanceColor(pct: number, theme: { success: string; warning: string; danger: string }) {
  if (pct >= 90) return theme.success
  if (pct >= 75) return theme.warning
  return theme.danger
}

export default function AttendanceSummaryReport() {
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(today)
  const [search, setSearch] = useState('')

  const { data, loading, refetch } = useQuery<AttendanceData>(ATTENDANCE_SUMMARY_QUERY, {
    variables: { fromDate, toDate },
  })

  const d = data?.attendanceSummaryReport
  const rows = (d?.rows ?? []).filter(
    (r) =>
      !search ||
      r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      r.employeeNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.department.toLowerCase().includes(search.toLowerCase()),
  )

  const columns: Column<AttendanceRow>[] = [
    {
      key: 'employeeNumber',
      header: 'Employee #',
      mobilePriority: 4,
      render: (row) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{row.employeeNumber}</span>
      ),
    },
    {
      key: 'employeeName',
      header: 'Name',
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{row.employeeName}</span>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      mobileSecondary: true,
      render: (row) => row.department,
    },
    {
      key: 'totalPresent',
      header: 'Present',
      mobilePriority: 3,
      render: (row) => <span style={{ color: theme.success }}>{row.totalPresent}</span>,
    },
    {
      key: 'totalAbsent',
      header: 'Absent',
      mobilePriority: 2,
      render: (row) => (
        <span style={{ color: row.totalAbsent > 0 ? theme.danger : theme.textMuted }}>
          {row.totalAbsent}
        </span>
      ),
    },
    {
      key: 'totalLeave',
      header: 'Leave',
      mobilePriority: 5,
      render: (row) => <span style={{ color: theme.info }}>{row.totalLeave}</span>,
    },
    {
      key: 'totalOvertime',
      header: 'Overtime',
      mobilePriority: 6,
      render: (row) => <span style={{ color: theme.warning }}>{row.totalOvertime}</span>,
    },
    {
      key: 'attendancePct',
      header: 'Attendance %',
      mobileLabel: 'Attendance',
      mobilePriority: 1,
      render: (row) => (
        <span
          style={{
            fontWeight: 600,
            color: attendanceColor(row.attendancePct, theme),
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {row.attendancePct.toFixed(1)}%
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Attendance Summary"
        subtitle="Employee attendance statistics by period"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refetch()
            }}
          >
            Refresh
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search employee or department…',
          }}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onExport={() => undefined}
          resultCount={rows.length}
        />
      </Card>

      {/* Summary */}
      {d && (
        <Grid cols={2} tabletCols={2} phoneCols={2} gap={12} style={{ marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total Employees
            </p>
            <p style={{ fontSize: '22px', fontWeight: 500, color: theme.textPrimary }}>
              {d.totalEmployees}
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Avg Attendance
            </p>
            <p
              style={{
                fontSize: '22px',
                fontWeight: 500,
                color: attendanceColor(d.avgAttendancePct, theme),
              }}
            >
              {d.avgAttendancePct.toFixed(1)}%
            </p>
          </Card>
        </Grid>
      )}

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '40px', borderRadius: '6px', marginBottom: '8px' }}
              />
            ))}
          </div>
        ) : rows.length ? (
          <Table columns={columns} data={rows} rowKey="employeeNumber" />
        ) : (
          <EmptyState
            title="No attendance data"
            message="Adjust the date range to load attendance records."
          />
        )}
      </Card>
    </div>
  )
}
