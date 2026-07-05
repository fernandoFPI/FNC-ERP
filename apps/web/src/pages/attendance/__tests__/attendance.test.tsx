import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'

const mockUseQuery = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>()
  return { ...actual, useQuery: (...args: unknown[]) => mockUseQuery(...args), useMutation: vi.fn().mockReturnValue([vi.fn(), { loading: false }]), gql: actual.gql }
})

vi.mock('../../../store/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1', email: 'user@test.com' } }) }))
vi.mock('../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter><ThemeProvider>{ui}</ThemeProvider></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseQuery.mockReturnValue({ data: undefined, loading: false, refetch: vi.fn() })
})

// ── AttendanceCalendar component ───────────────────────────────────────────────
describe('AttendanceCalendar component', () => {
  it('renders correct number of day header labels', async () => {
    const { AttendanceCalendar } = await import('../../../components/ui/AttendanceCalendar')
    render(<ThemeProvider>
      <AttendanceCalendar month={new Date(2026, 5, 1)} days={[]} onDayClick={vi.fn()} />
    </ThemeProvider>)
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Fri')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
  })

  it('renders month label in header', async () => {
    const { AttendanceCalendar } = await import('../../../components/ui/AttendanceCalendar')
    render(<ThemeProvider>
      <AttendanceCalendar month={new Date(2026, 5, 1)} days={[]} onDayClick={vi.fn()} />
    </ThemeProvider>)
    expect(screen.getByText(/june 2026/i)).toBeInTheDocument()
  })

  it('calls onDayClick when a day with data is clicked', async () => {
    const { AttendanceCalendar } = await import('../../../components/ui/AttendanceCalendar')
    const onDayClick = vi.fn()
    render(<ThemeProvider>
      <AttendanceCalendar
        month={new Date(2026, 5, 1)}
        days={[{ date: '2026-06-15', punches: [], hasOvertime: false, isAbsent: false, isWeekend: false, isLeave: false, hoursWorked: 8 }]}
        onDayClick={onDayClick}
      />
    </ThemeProvider>)
    fireEvent.click(screen.getByText('15'))
    expect(onDayClick).toHaveBeenCalledWith('2026-06-15')
  })

  it('shows legend with status colors', async () => {
    const { AttendanceCalendar } = await import('../../../components/ui/AttendanceCalendar')
    render(<ThemeProvider>
      <AttendanceCalendar month={new Date(2026, 5, 1)} days={[]} onDayClick={vi.fn()} />
    </ThemeProvider>)
    expect(screen.getByText('Present')).toBeInTheDocument()
    expect(screen.getByText('Absent')).toBeInTheDocument()
    expect(screen.getByText('On leave')).toBeInTheDocument()
  })

  it('renders loading skeleton when loading=true', async () => {
    const { AttendanceCalendar } = await import('../../../components/ui/AttendanceCalendar')
    const { container } = render(<ThemeProvider>
      <AttendanceCalendar month={new Date(2026, 5, 1)} days={[]} onDayClick={vi.fn()} loading={true} />
    </ThemeProvider>)
    const skeletons = container.querySelectorAll('.skeleton')
    expect(skeletons.length).toBeGreaterThan(0)
  })
})

// ── AttendancePage ─────────────────────────────────────────────────────────────
describe('AttendancePage', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: { attendanceCalendar: [], attendanceSummary: { days_present: 20, days_absent: 2, total_hours: 160, overtime_hours: 8, leave_days: 2 }, attendanceLogs: [] }, loading: false, refetch: vi.fn() })
  })

  it('renders Attendance page header', async () => {
    const AttendancePage = (await import('../AttendancePage')).default
    wrap(<AttendancePage />)
    expect(screen.getByText('Attendance')).toBeInTheDocument()
  })

  it('shows KPI cards when summary data available', async () => {
    const AttendancePage = (await import('../AttendancePage')).default
    wrap(<AttendancePage />)
    // "Present" may appear in both KPI card and calendar legend
    expect(screen.getAllByText('Present').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Absent').length).toBeGreaterThan(0)
    expect(screen.getByText('Total hours')).toBeInTheDocument()
  })
})

// ── PunchHistory ───────────────────────────────────────────────────────────────
describe('PunchHistory', () => {
  const logs = [
    { id: 'p1', employee_name: 'Ahmad Hassan', punch_type: 'in', punched_at: '2026-06-15T08:00:00Z', is_valid: true, work_location_name: 'Main Office', distance_from_zone: -10 },
    { id: 'p2', employee_name: 'Sara Ali', punch_type: 'out', punched_at: '2026-06-15T17:00:00Z', is_valid: false, work_location_name: 'Main Office', distance_from_zone: 500, rejection_reason: 'Outside geofence' },
  ]

  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: { attendanceLogs: { logs, total: 2 } }, loading: false, refetch: vi.fn() })
  })

  it('renders punch history table', async () => {
    const PunchHistory = (await import('../PunchHistory')).default
    wrap(<PunchHistory />)
    expect(screen.getByText('Ahmad Hassan')).toBeInTheDocument()
    expect(screen.getByText('Sara Ali')).toBeInTheDocument()
  })

  it('shows rejection reason for invalid punches', async () => {
    const PunchHistory = (await import('../PunchHistory')).default
    wrap(<PunchHistory />)
    expect(screen.getByText('Outside geofence')).toBeInTheDocument()
  })

  it('shows summary stats at top', async () => {
    const PunchHistory = (await import('../PunchHistory')).default
    wrap(<PunchHistory />)
    expect(screen.getByText('Total punches')).toBeInTheDocument()
    expect(screen.getByText('Valid punches')).toBeInTheDocument()
    expect(screen.getByText('Rejection rate')).toBeInTheDocument()
  })

  it('shows valid/invalid badges', async () => {
    const PunchHistory = (await import('../PunchHistory')).default
    wrap(<PunchHistory />)
    expect(screen.getAllByText('Valid').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Invalid').length).toBeGreaterThan(0)
  })
})

// ── NotificationsDrawer ────────────────────────────────────────────────────────
describe('NotificationsDrawer', () => {
  it('renders empty state when no notifications', async () => {
    const { NotificationsDrawer } = await import('../../../components/shell/NotificationsDrawer')
    // Mock store
    vi.mock('../../../store/notificationStore', () => ({
      useNotificationStore: (selector: (s: object) => unknown) => {
        const state = { notifications: [], unreadCount: 0, markAsRead: vi.fn(), markAllAsRead: vi.fn(), setNotifications: vi.fn(), appendNotifications: vi.fn() }
        return selector ? selector(state) : state
      },
    }))
    render(<ThemeProvider><MemoryRouter><NotificationsDrawer open={true} onClose={vi.fn()} /></MemoryRouter></ThemeProvider>)
    expect(screen.getByText(/no notifications/i)).toBeInTheDocument()
  })
})
