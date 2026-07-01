import { useEffect, useState } from 'react'

interface AttendanceSummary {
  daysPresent: number
  daysAbsent: number
  totalHours: number
  overtimeHours: number
  leaveDays: number
}

const cache: Record<string, AttendanceSummary> = {}

export function useAttendanceSummary(employeeId: string | undefined, month: string | undefined) {
  const key = `${employeeId}-${month}`
  const [summary, setSummary] = useState<AttendanceSummary | null>(cache[key] ?? null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!employeeId || !month) return
    if (cache[key]) { setSummary(cache[key]); return }
    setLoading(true)
    fetch(`/api/v1/hr/attendance/summary?employee_id=${employeeId}&month=${month}`)
      .then((r) => r.json())
      .then((json) => {
        const s: AttendanceSummary = {
          daysPresent: json.days_present ?? 0,
          daysAbsent: json.days_absent ?? 0,
          totalHours: json.total_hours ?? 0,
          overtimeHours: json.overtime_hours ?? 0,
          leaveDays: json.leave_days ?? 0,
        }
        cache[key] = s
        setSummary(s)
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [key, employeeId, month])

  return { summary, loading }
}
