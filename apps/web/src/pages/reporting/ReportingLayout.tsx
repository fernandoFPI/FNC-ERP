import i18n from '../../i18n'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'

const REPORTING_NAV: ({ label: string; path: string } | null)[] = [
  { get label() { return i18n.t('rep.layout.executive', { defaultValue: "Executive" }) }, path: '/reporting/executive' },
  null,
  { get label() { return i18n.t('rep.layout.cashFlow', { defaultValue: "Cash Flow" }) }, path: '/reporting/financial/cash-flow' },
  null,
  { get label() { return i18n.t('rep.layout.consolidatedPL', { defaultValue: "Consolidated P&L" }) }, path: '/reporting/consolidated/pl' },
  { get label() { return i18n.t('rep.layout.consolidatedBs', { defaultValue: "Consolidated BS" }) }, path: '/reporting/consolidated/bs' },
  { get label() { return i18n.t('rep.layout.trialBalance', { defaultValue: "Trial Balance" }) }, path: '/reporting/consolidated/trial-balance' },
  null,
  { get label() { return i18n.t('rep.layout.projectProfitability', { defaultValue: "Project Profitability" }) }, path: '/reporting/projects/profitability' },
  null,
  { get label() { return i18n.t('rep.layout.payrollCosts', { defaultValue: "Payroll Costs" }) }, path: '/reporting/payroll/costs' },
  { get label() { return i18n.t('rep.layout.attendance', { defaultValue: "Attendance" }) }, path: '/reporting/payroll/attendance' },
  null,
  { get label() { return i18n.t('rep.layout.inventoryValuation', { defaultValue: "Inventory Valuation" }) }, path: '/reporting/inventory/valuation' },
  null,
  { get label() { return i18n.t('rep.layout.withholdingTax', { defaultValue: "Withholding Tax" }) }, path: '/reporting/compliance/wht' },
  { get label() { return i18n.t('rep.layout.fxExposure', { defaultValue: "FX Exposure" }) }, path: '/reporting/compliance/fx-exposure' },
  { get label() { return i18n.t('rep.layout.payrollTax', { defaultValue: "Payroll Tax" }) }, path: '/reporting/compliance/payroll-tax' },
]

export default function ReportingLayout() {
  const { theme } = useTheme()
  const location = useLocation()

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sub-nav */}
      <div
        style={{
          width: '200px',
          minWidth: '200px',
          borderInlineEnd: `0.5px solid ${theme.border}`,
          overflowY: 'auto',
          padding: '12px 0',
          flexShrink: 0,
        }}
      >
        {REPORTING_NAV.map((item, i) => {
          if (item === null)
            return (
              <div key={i} style={{ height: '1px', background: theme.border, margin: '8px 0' }} />
            )
          const isActive =
            location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <div
                style={{
                  padding: '7px 16px',
                  fontSize: '12px',
                  color: isActive ? theme.accent : theme.textSecondary,
                  fontWeight: isActive ? 500 : 400,
                  background: isActive ? theme.accentBg : 'transparent',
                  borderInlineStart: isActive ? `2px solid ${theme.accent}` : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
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
