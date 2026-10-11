import i18n from '../../i18n'
import { NavLink, Outlet } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'

const TABS = [
  { get label() { return i18n.t('hr.layout.employees', { defaultValue: "Employees" }) }, path: '/hr/employees' },
  { get label() { return i18n.t('hr.layout.departments', { defaultValue: "Departments" }) }, path: '/hr/departments' },
  { get label() { return i18n.t('hr.layout.workLocations', { defaultValue: "Work Locations" }) }, path: '/hr/locations' },
  { get label() { return i18n.t('hr.layout.shiftConfigs', { defaultValue: "Shift Configs" }) }, path: '/hr/shifts' },
  { get label() { return i18n.t('hr.layout.leaveTypes', { defaultValue: "Leave Types" }) }, path: '/hr/leave/types' },
  { get label() { return i18n.t('hr.layout.leaveRequests', { defaultValue: "Leave Requests" }) }, path: '/hr/leave' },
  { get label() { return i18n.t('hr.layout.overtime', { defaultValue: "Overtime" }) }, path: '/hr/overtime' },
]

export default function HRLayout() {
  const { theme } = useTheme()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          gap: '0',
          padding: '0 24px',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/hr/leave'}
            style={({ isActive }) => ({
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? theme.accent : theme.textMuted,
              textDecoration: 'none',
              borderBottom: isActive ? `2px solid ${theme.accent}` : '2px solid transparent',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s',
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
