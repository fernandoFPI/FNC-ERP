import { useState } from 'react'
import { useQuery } from '@apollo/client'
import {
  ATTENDANCE_CALENDAR_QUERY,
  ATTENDANCE_SUMMARY_QUERY,
  ATTENDANCE_LOGS_QUERY,
} from '../../graphql/hr'
import { useTheme } from '../../theme/ThemeContext'
import { usePagePadding } from '../../hooks/usePagePadding'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Grid } from '../../components/ui/Grid'
import { AttendanceCalendar } from '../../components/ui/AttendanceCalendar'
import { useAuthStore } from '../../store/authStore'
import { AttendanceDayDrawer } from './AttendanceDayDrawer'
import type { AttendanceCalendarQuery, AttendanceCalendarQueryVariables, AttendanceLogsQuery, AttendanceLogsQueryVariables, AttendanceSummaryQuery, AttendanceSummaryQueryVariables } from '../../graphql/generated'

export default function AttendancePage() {
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const { isPhone } = useBreakpoint()
  const user = useAuthStore((s) => s.user)
  const [calMonth, setCalMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const monthStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}`
  const empId = user?.id ?? ''

  const { data: calData, loading: calLoading } = useQuery<AttendanceCalendarQuery, AttendanceCalendarQueryVariables>(ATTENDANCE_CALENDAR_QUERY, {
    variables: { employeeId: empId, month: monthStr },
    skip: !empId,
    fetchPolicy: 'cache-and-network',
  })
  const { data: summaryData } = useQuery<AttendanceSummaryQuery, AttendanceSummaryQueryVariables>(ATTENDANCE_SUMMARY_QUERY, {
    variables: { employeeId: empId, month: monthStr },
    skip: !empId,
  })

  const selectedStart = selectedDate ? `${selectedDate}T00:00:00` : ''
  const selectedEnd = selectedDate ? `${selectedDate}T23:59:59` : ''
  const { data: dayData, loading: dayLoading } = useQuery<AttendanceLogsQuery, AttendanceLogsQueryVariables>(ATTENDANCE_LOGS_QUERY, {
    variables: { employee_id: empId, from_date: selectedStart, to_date: selectedEnd },
    skip: !selectedDate || !empId,
  })

  const calDays = (calData?.attendanceCalendar ?? []).filter(
    (x): x is NonNullable<typeof x> => x !== null,
  )
  const summary = summaryData?.attendanceSummary
  const dayPunches = (dayData?.attendanceLogs ?? [])
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .map((p) => ({
      id: p.id,
      punch_type: p.punch_type,
      punched_at: p.punched_at,
      is_valid: p.geofence_valid ?? true,
      work_location_id: p.work_location_id,
      distance_from_zone: p.distance_from_location_m != null ? Number(p.distance_from_location_m) : undefined,
    }))

  const selectedDay = calDays.find((d: { date: string }) => d.date === selectedDate)
  const dayMeta = selectedDay
    ? {
        hoursWorked: selectedDay.hoursWorked ?? 0,
        hasOvertime: selectedDay.hasOvertime,
        isAbsent: selectedDay.isAbsent,
        leaveTypeName: selectedDay.leaveTypeName ?? undefined,
      }
    : undefined

  return (
    <div
      style={{
        ...pagePadding,
        margin: '0 auto',
        maxWidth: '1300px',
        paddingBottom: isPhone ? 'calc(env(safe-area-inset-bottom, 0px) + 80px)' : undefined,
      }}
    >
      <PageHeader
        title="Attendance"
        subtitle={calMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
      />

      {/* Monthly KPIs */}
      {summary && (
        <Grid cols={5} tabletCols={3} phoneCols={2} gap={8} style={{ marginBottom: '20px' }}>
          {[
            { label: 'Present', value: summary.days_present, color: theme.success },
            { label: 'Absent', value: summary.days_absent, color: theme.danger },
            { label: 'Total hours', value: `${summary.total_hours?.toFixed(1)}h` },
            {
              label: 'OT hours',
              value: `${summary.overtime_hours?.toFixed(1)}h`,
              color: theme.warning,
            },
            { label: 'Leave days', value: summary.leave_days, color: theme.info },
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
                  fontSize: '18px',
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
        </Grid>
      )}

      <Card style={{ padding: '20px', marginBottom: '20px' }}>
        <AttendanceCalendar
          month={calMonth}
          days={calDays}
          onDayClick={setSelectedDate}
          loading={calLoading}
          onMonthChange={setCalMonth}
        />
      </Card>

      <AttendanceDayDrawer
        open={!!selectedDate}
        onClose={() => {
          setSelectedDate(null)
        }}
        date={selectedDate}
        punches={dayPunches}
        loading={dayLoading}
        dayMeta={dayMeta}
      />
    </div>
  )
}
