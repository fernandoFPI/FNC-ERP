import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'

const REPORTING_NAV: ({ label: string; path: string } | null)[] = [
  { label: 'Executive', path: '/reporting/executive' },
  null,
  { label: 'Consolidated P&L', path: '/reporting/consolidated/pl' },
  { label: 'Consolidated BS', path: '/reporting/consolidated/bs' },
  { label: 'Trial Balance', path: '/reporting/consolidated/trial-balance' },
  null,
  { label: 'Project Profitability', path: '/reporting/projects/profitability' },
  null,
  { label: 'Payroll Costs', path: '/reporting/payroll/costs' },
  { label: 'Attendance', path: '/reporting/payroll/attendance' },
  null,
  { label: 'Inventory Valuation', path: '/reporting/inventory/valuation' },
  null,
  { label: 'Withholding Tax', path: '/reporting/compliance/wht' },
  { label: 'FX Exposure', path: '/reporting/compliance/fx-exposure' },
  { label: 'Payroll Tax', path: '/reporting/compliance/payroll-tax' },
]

export default function ReportingLayout() {
  const { theme } = useTheme()
  const location = useLocation()

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sub-nav */}
      <div style={{
        width: '200px',
        minWidth: '200px',
        borderRight: `0.5px solid ${theme.border}`,
        overflowY: 'auto',
        padding: '12px 0',
        flexShrink: 0,
      }}>
        {REPORTING_NAV.map((item, i) => {
          if (item === null) return <div key={i} style={{ height: '1px', background: theme.border, margin: '8px 0' }} />
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <NavLink key={item.path} to={item.path} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                padding: '7px 16px',
                fontSize: '12px',
                color: isActive ? theme.accent : theme.textSecondary,
                fontWeight: isActive ? 500 : 400,
                background: isActive ? theme.accentBg : 'transparent',
                borderLeft: isActive ? `2px solid ${theme.accent}` : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}>
                {item.label}
              </div>
            </NavLink>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
