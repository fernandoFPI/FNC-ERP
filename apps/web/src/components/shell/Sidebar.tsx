import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useApprovalStore } from '../../store/approvalStore'
import { useMyPOQueueCount } from '../../hooks/useMyPOQueueCount'
import { useAPPendingCount } from '../../hooks/useAPPendingCount'
import { usePermission } from '../../hooks/usePermission'
import { useCompanyStore } from '../../store/companyStore'
import { useAuthStore } from '../../store/authStore'

interface NavChild {
  label: string
  path: string
  badge?: number | 'overdue'
  permKeys?: string[]
}

interface NavItem {
  label: string
  icon: React.ReactNode
  path: string
  badge?: number | 'approval' | 'overdue' | 'queue' | 'ap_pending'
  children?: NavChild[]
  permKeys?: string[]
  factoryOnly?: boolean
}

interface NavSection {
  section: string
  items: NavItem[]
}

function Icon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    grid: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
    'dollar-sign': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    'file-text': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    'refresh-cw': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
    'shopping-cart': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
    package: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    tool: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
    home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    truck: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    users: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    'credit-card': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    'bar-chart-2': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    'help-circle': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    'chevron-left': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
    'chevron-right': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
    'chevron-down': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
    x: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    layers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
    calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    clipboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
    'map-pin': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    activity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    tag: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
    percent: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
    inbox: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
    'git-branch': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>,
    clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    'check-circle': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    'alert-circle': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    'pie-chart': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>,
    'arrow-left-right': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 7H3"/><polyline points="7 3 3 7 7 11"/><path d="M3 17h18"/><polyline points="17 13 21 17 17 21"/></svg>,
    shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    box: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><polyline points="16 7 16 5 8 5 8 7"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/></svg>,
    landmark: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7 12 2"/></svg>,
    'file-clock': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h5"/><polyline points="14 2 14 8 20 8"/><circle cx="18" cy="18" r="4"/><polyline points="18 16 18 18 20 18"/></svg>,
    archive: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
    'trending-up': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    'sliders': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  }
  return <>{icons[name] ?? null}</>
}

const NAV_SECTIONS: NavSection[] = [
  {
    section: 'Overview',
    items: [{ label: 'Dashboard', icon: <Icon name="grid" />, path: '/dashboard' }],
  },
  {
    section: 'Finance',
    items: [
      { label: 'Chart of Accounts', icon: <Icon name="dollar-sign" />, path: '/finance/accounts', permKeys: ['finance.accounts.view'] },
      { label: 'Journal Entries', icon: <Icon name="file-text" />, path: '/finance/journals', permKeys: ['finance.journals.view'] },
      { label: 'Project Invoices', icon: <Icon name="file-text" />, path: '/projects/invoices', permKeys: ['projects.invoices.view'] },
      { label: 'Accounts Receivable', icon: <Icon name="activity" />, path: '/finance/ar', permKeys: ['finance.ar.view'] },
      { label: 'Accounts Payable', icon: <Icon name="credit-card" />, path: '/finance/ap', badge: 'ap_pending', permKeys: ['finance.ap.view'] },
      { label: 'WHT Payable', icon: <Icon name="percent" />, path: '/finance/wht-payable', permKeys: ['finance.ap.view'] },
      { label: 'Payment Vouchers', icon: <Icon name="credit-card" />, path: '/finance/payment-vouchers', permKeys: ['finance.ap.view'] },
      { label: 'Bank Reconciliation', icon: <Icon name="landmark" />, path: '/finance/bank', permKeys: ['finance.bank.view'] },
      { label: 'Fixed Assets', icon: <Icon name="box" />, path: '/finance/assets', permKeys: ['finance.assets.view'] },
      { label: 'Payment Terms', icon: <Icon name="file-clock" />, path: '/finance/payment-terms', permKeys: ['finance.terms.view'] },
      { label: 'Retention', icon: <Icon name="archive" />, path: '/finance/retention', permKeys: ['finance.retention.view'] },
      { label: 'GL Budgets', icon: <Icon name="sliders" />, path: '/finance/budget', permKeys: ['finance.budget.view'] },
      { label: 'FX Revaluation', icon: <Icon name="trending-up" />, path: '/finance/revaluation', permKeys: ['finance.revaluation.view'] },
      { label: 'Expense Claims', icon: <Icon name="clipboard" />, path: '/finance/expense-claims', permKeys: ['finance.expenses.view'] },
      { label: 'Petty Cash', icon: <Icon name="dollar-sign" />, path: '/finance/petty-cash', permKeys: ['finance.petty_cash.view'] },
      { label: 'Cost Centers', icon: <Icon name="layers" />, path: '/finance/cost-centers', permKeys: ['finance.cost_centers.view'] },
      { label: 'Analytic Accounts', icon: <Icon name="tag" />, path: '/finance/analytic-accounts', permKeys: ['finance.analytic_accounts.view'] },
      { label: 'FX Rates', icon: <Icon name="refresh-cw" />, path: '/finance/fx-rates', permKeys: ['finance.fx_rates.view'] },
      { label: 'Periods', icon: <Icon name="calendar" />, path: '/finance/periods', permKeys: ['finance.periods.view'] },
      {
        label: 'Reports',
        icon: <Icon name="bar-chart-2" />,
        path: '/finance/reports',
        permKeys: ['finance.reports.view'],
        children: [
          { label: 'Trial Balance', path: '/finance/reports/trial-balance', permKeys: ['finance.reports.view'] },
          { label: 'Profit & Loss', path: '/finance/reports/profit-loss', permKeys: ['finance.reports.view'] },
          { label: 'Balance Sheet', path: '/finance/reports/balance-sheet', permKeys: ['finance.reports.view'] },
        ],
      },
    ],
  },
  {
    section: 'Procurement',
    items: [
      { label: 'Vendors', icon: <Icon name="users" />, path: '/procurement/vendors', permKeys: ['procurement.vendors.view'] },
      { label: 'Purchase Orders', icon: <Icon name="shopping-cart" />, path: '/procurement/purchase-orders', permKeys: ['procurement.po.view'] },
      { label: 'My PO queue', icon: <Icon name="inbox" />, path: '/procurement/queue', badge: 'queue', permKeys: ['procurement.po.view'] },
      { label: 'Approval Queue', icon: <Icon name="check-circle" />, path: '/procurement/purchase-orders/approval-queue', badge: 'approval', permKeys: ['procurement.po.approve'] },
    ],
  },
  {
    section: 'Inventory',
    items: [
      { label: 'Products', icon: <Icon name="package" />, path: '/inventory/products', permKeys: ['inventory.products.view'] },
      { label: 'Locations', icon: <Icon name="map-pin" />, path: '/inventory/locations', permKeys: ['inventory.locations.view'] },
      { label: 'Stock Balances', icon: <Icon name="layers" />, path: '/inventory/balances', permKeys: ['inventory.stock_moves.view'] },
      { label: 'Stock Moves', icon: <Icon name="activity" />, path: '/inventory/moves', permKeys: ['inventory.stock_moves.view'] },
      { label: 'Lots', icon: <Icon name="tag" />, path: '/inventory/lots', permKeys: ['inventory.lots.view'] },
    ],
  },
  {
    section: 'Operations',
    items: [
      {
        label: 'Manufacturing',
        icon: <Icon name="tool" />,
        path: '/manufacturing',
        factoryOnly: true,
        permKeys: ['manufacturing.boms.view', 'manufacturing.orders.view', 'manufacturing.work_centers.view'],
        children: [
          { label: 'Orders', path: '/manufacturing/orders', permKeys: ['manufacturing.orders.view'] },
          { label: 'Requests', path: '/manufacturing/requests', permKeys: ['manufacturing.orders.view'] },
          { label: 'Bills of Materials', path: '/manufacturing/boms', permKeys: ['manufacturing.boms.view'] },
          { label: 'Work Centers', path: '/manufacturing/work-centers', permKeys: ['manufacturing.work_centers.view'] },
        ],
      },
      {
        label: 'Projects',
        icon: <Icon name="home" />,
        path: '/projects',
        permKeys: ['projects.view'],
        children: [
          { label: 'All Projects', path: '/projects', permKeys: ['projects.view'] },
          { label: 'Contracts', path: '/projects/contracts', permKeys: ['projects.view'] },
        ],
      },
      {
        label: 'Rental',
        icon: <Icon name="truck" />,
        path: '/rental',
        permKeys: ['rental.assets.view', 'rental.contracts.view', 'rental.maintenance.view'],
        children: [
          { label: 'Fleet', path: '/rental/fleet', permKeys: ['rental.assets.view'] },
          { label: 'Assets', path: '/rental/assets', permKeys: ['rental.assets.view'] },
          { label: 'Contracts', path: '/rental/contracts', permKeys: ['rental.contracts.view'] },
          { label: 'Maintenance', path: '/rental/maintenance', badge: 'overdue', permKeys: ['rental.maintenance.view'] },
        ],
      },
    ],
  },
  {
    section: 'People',
    items: [
      { label: 'HR', icon: <Icon name="users" />, path: '/hr/employees', permKeys: ['hr.employees.view'] },
      { label: 'Attendance', icon: <Icon name="check-circle" />, path: '/attendance', permKeys: ['attendance.view'] },
      {
        label: 'Payroll',
        icon: <Icon name="credit-card" />,
        path: '/payroll',
        permKeys: ['payroll.runs.view', 'payroll.payslips.view'],
        children: [
          { label: 'Payroll Runs', path: '/payroll/runs', permKeys: ['payroll.runs.view'] },
          { label: 'Payslips', path: '/payroll/payslips', permKeys: ['payroll.payslips.view'] },
        ],
      },
    ],
  },
  {
    section: 'Group',
    items: [
      {
        label: 'Reporting',
        icon: <Icon name="bar-chart-2" />,
        path: '/reporting',
        permKeys: [
          'reporting.executive.view',
          'reporting.financial.view',
          'reporting.consolidated.view',
          'reporting.operational.view',
          'reporting.compliance.view',
        ],
        children: [
          { label: 'Executive', path: '/reporting/executive', permKeys: ['reporting.executive.view'] },
          { label: 'Consolidated P&L', path: '/reporting/consolidated/pl', permKeys: ['reporting.consolidated.view'] },
          { label: 'Consolidated BS', path: '/reporting/consolidated/bs', permKeys: ['reporting.consolidated.view'] },
          { label: 'Consolidated Trial Balance', path: '/reporting/consolidated/trial-balance', permKeys: ['reporting.consolidated.view'] },
          { label: 'Project Profitability', path: '/reporting/projects/profitability', permKeys: ['reporting.operational.view'] },
          { label: 'Payroll Costs', path: '/reporting/payroll/costs', permKeys: ['reporting.operational.view'] },
          { label: 'Inventory Valuation', path: '/reporting/inventory/valuation', permKeys: ['reporting.operational.view'] },
          { label: 'Compliance', path: '/reporting/compliance/wht', permKeys: ['reporting.compliance.view'] },
        ],
      },
      {
        label: 'Inter-company',
        icon: <Icon name="arrow-left-right" />,
        path: '/interco',
        permKeys: ['interco.transactions.view', 'interco.stock_transfers.view'],
        children: [
          { label: 'Transactions', path: '/interco/transactions', permKeys: ['interco.transactions.view'] },
          { label: 'Stock Transfers', path: '/interco/stock-transfers', permKeys: ['interco.stock_transfers.view'] },
          { label: 'Transfer Pricing', path: '/interco/pricing', permKeys: ['interco.transactions.view'] },
        ],
      },
    ],
  },
]

interface SidebarProps {
  // Phone drawer mode — fixed overlay with X button
  mobile?: boolean
  expanded?: boolean
  onClose?: () => void
  // Tablet rail mode — icon-only 60px in-flow
  rail?: boolean
  onToggle?: () => void
}

export function Sidebar({ mobile = false, expanded = false, onClose, rail = false, onToggle }: SidebarProps) {
  const { theme } = useTheme()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const approvalCount = useApprovalStore((s) => s.pendingCount)
  const overdueMaintenanceCount = useApprovalStore((s) => s.overdueMaintenanceCount)
  const myPOQueueCount = useMyPOQueueCount()
  const apPendingCount = useAPPendingCount()
  const { canAny, isSystemLevel } = usePermission()
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const isFactoryCompany = !!activeCompany?.name?.toLowerCase().includes('factory')
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('fnc-sidebar-collapsed') === 'true'
  })
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    const path = window.location.pathname
    const expanded = new Set<string>()
    NAV_SECTIONS.forEach((sec) => {
      sec.items.forEach((item) => {
        if (item.children && item.children.some((c) => path.startsWith(c.path))) {
          expanded.add(item.path)
        }
      })
    })
    return expanded
  })

  // mobile=true → always expanded (drawer content), rail=true → always collapsed (icon-only)
  const effectiveCollapsed = mobile ? false : rail ? true : collapsed

  const width = mobile ? '260px' : effectiveCollapsed ? '60px' : '220px'

  function isItemVisible(item: NavItem): boolean {
    if (item.factoryOnly && !isFactoryCompany) return false
    if (!item.permKeys || item.permKeys.length === 0) return true
    if (isSystemLevel) return true
    return canAny(item.permKeys)
  }

  function toggleCollapseInternal() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('fnc-sidebar-collapsed', String(next))
  }

  function toggleExpand(path: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function resolveBadge(badge: number | 'approval' | 'overdue' | 'queue' | 'ap_pending' | undefined): number | undefined {
    if (badge === 'approval') return approvalCount > 0 ? approvalCount : undefined
    if (badge === 'overdue') return overdueMaintenanceCount > 0 ? overdueMaintenanceCount : undefined
    if (badge === 'queue') return myPOQueueCount > 0 ? myPOQueueCount : undefined
    if (badge === 'ap_pending') return apPendingCount > 0 ? apPendingCount : undefined
    if (typeof badge === 'number') return badge
    return undefined
  }

  function getBadgeCount(item: NavItem): number | undefined {
    return resolveBadge(item.badge)
  }

  function handleNavClick() {
    if (mobile) onClose?.()
  }

  const touchMinHeight = mobile ? '48px' : undefined

  function renderNavItem(item: NavItem) {
    const visibleChildren = (item.children ?? []).filter((c) => {
      if (!c.permKeys || c.permKeys.length === 0) return true
      if (isSystemLevel) return true
      return canAny(c.permKeys)
    })
    const hasChildren = visibleChildren.length > 0
    const isExpanded = expandedItems.has(item.path)
    const isParentActive = location.pathname.startsWith(item.path)
    const isDirectActive = !hasChildren && (location.pathname === item.path || location.pathname.startsWith(item.path + '/'))
    const badgeCount = getBadgeCount(item)

    // In rail mode, clicking a parent with children navigates to the first visible child
    const railNavTarget = hasChildren && effectiveCollapsed
      ? (visibleChildren[0]?.path ?? item.path)
      : item.path

    const itemContent = (
      <div
        title={effectiveCollapsed ? item.label : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: effectiveCollapsed ? '9px 0' : '9px 16px',
          justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
          position: 'relative',
          minHeight: touchMinHeight,
          background: isDirectActive || (hasChildren && isParentActive) ? theme.accentBg : 'transparent',
          borderLeft: isDirectActive || (hasChildren && isParentActive) ? `2.5px solid ${theme.accent}` : '2.5px solid transparent',
          cursor: 'pointer',
          transition: 'background 0.15s ease',
          WebkitTapHighlightColor: 'transparent',
        }}
        onMouseEnter={(e) => { if (!isDirectActive) e.currentTarget.style.background = theme.bgSurfaceHover }}
        onMouseLeave={(e) => { e.currentTarget.style.background = isDirectActive || (hasChildren && isParentActive) ? theme.accentBg : 'transparent' }}
        onClick={hasChildren && !effectiveCollapsed ? () => toggleExpand(item.path) : undefined}
      >
        <span style={{ color: isDirectActive || isParentActive ? theme.accent : theme.textSecondary, display: 'flex', flexShrink: 0 }}>
          {item.icon}
        </span>
        {!effectiveCollapsed && (
          <>
            <span style={{
              fontSize: '13px',
              fontWeight: isDirectActive || isParentActive ? 500 : 400,
              color: isDirectActive || isParentActive ? theme.accent : theme.textSecondary,
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {item.label}
            </span>
            {badgeCount !== undefined && (
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: '10px',
                background: theme.accentBg,
                color: theme.accent,
                border: `1px solid ${theme.accentBorder}`,
              }}>
                {badgeCount}
              </span>
            )}
            {hasChildren && (
              <span style={{
                color: theme.textMuted,
                display: 'flex',
                transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.15s ease',
              }}>
                <Icon name="chevron-down" />
              </span>
            )}
          </>
        )}
      </div>
    )

    return (
      <div key={item.path}>
        {/* In rail/collapsed mode, everything becomes a NavLink (children navigate to first child) */}
        {hasChildren && !effectiveCollapsed ? (
          itemContent
        ) : (
          <NavLink to={railNavTarget} style={{ textDecoration: 'none', display: 'block' }} onClick={handleNavClick}>
            {itemContent}
          </NavLink>
        )}
        {hasChildren && !effectiveCollapsed && isExpanded && (
          <div>
            {visibleChildren.map((child) => {
              const isChildActive = location.pathname === child.path || location.pathname.startsWith(child.path + '/')
              const childBadge = resolveBadge(child.badge)
              return (
                <NavLink key={child.path} to={child.path} style={{ textDecoration: 'none', display: 'block' }} onClick={handleNavClick}>
                  <div
                    style={{
                      padding: '7px 16px 7px 42px',
                      fontSize: '12px',
                      color: isChildActive ? theme.accent : theme.textMuted,
                      fontWeight: isChildActive ? 500 : 400,
                      background: isChildActive ? theme.accentBg : 'transparent',
                      borderLeft: isChildActive ? `2.5px solid ${theme.accent}` : '2.5px solid transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'background 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      minHeight: touchMinHeight,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    onMouseEnter={(e) => { if (!isChildActive) e.currentTarget.style.background = theme.bgSurfaceHover }}
                    onMouseLeave={(e) => { if (!isChildActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span>{child.label}</span>
                    {childBadge !== undefined && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '10px',
                        background: theme.dangerBg,
                        color: theme.danger,
                        border: `1px solid ${theme.dangerBorder}`,
                        marginRight: '8px',
                      }}>
                        {childBadge}
                      </span>
                    )}
                  </div>
                </NavLink>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Header — differs by mode ─────────────────────────────────────────────────

  function renderHeader() {
    if (mobile) {
      // Phone drawer: title + X button
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: '56px',
          borderBottom: `0.5px solid ${theme.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: theme.textPrimary, letterSpacing: '-0.01em' }}>
            FNC GROUP
          </span>
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              color: theme.textMuted,
              cursor: 'pointer',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon name="x" />
          </button>
        </div>
      )
    }

    if (rail) {
      // Tablet rail: centered toggle button
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '56px',
          borderBottom: `0.5px solid ${theme.border}`,
          flexShrink: 0,
        }}>
          <button
            onClick={onToggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              color: theme.textMuted,
              cursor: 'pointer',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      )
    }

    // Desktop: FNC GROUP title + collapse toggle
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: effectiveCollapsed ? 'center' : 'space-between',
        padding: effectiveCollapsed ? '16px 0' : '16px 16px',
        height: '56px',
        borderBottom: `0.5px solid ${theme.border}`,
        flexShrink: 0,
      }}>
        {!effectiveCollapsed && (
          <span style={{ fontSize: '16px', fontWeight: 700, color: theme.textPrimary, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            FNC GROUP
          </span>
        )}
        <button
          onClick={rail ? onToggle : toggleCollapseInternal}
          aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            color: theme.textMuted,
            cursor: 'pointer',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={effectiveCollapsed ? 'chevron-right' : 'chevron-left'} />
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        width,
        minWidth: width,
        height: mobile ? '100dvh' : '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.bgSidebar,
        backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
        WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
        borderRight: `0.5px solid ${theme.border}`,
        transition: mobile
          ? 'transform 0.25s cubic-bezier(.4,0,.2,1)'
          : 'width 0.22s cubic-bezier(.4,0,.2,1), min-width 0.22s cubic-bezier(.4,0,.2,1)',
        overflow: 'hidden',
        position: mobile ? 'fixed' : 'relative',
        top: mobile ? 0 : undefined,
        left: mobile ? 0 : undefined,
        transform: mobile ? (expanded ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        zIndex: mobile ? 200 : 10,
        flexShrink: 0,
      }}
    >
      {theme.topRim !== 'none' && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '0.5px',
          background: theme.topRim,
          zIndex: 1,
        }} />
      )}

      {renderHeader()}

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => isItemVisible(item))
          if (visibleItems.length === 0) return null
          return (
            <div key={section.section} style={{ marginBottom: '4px' }}>
              {!effectiveCollapsed && (
                <div style={{
                  padding: '8px 16px 4px',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: theme.textMuted,
                  whiteSpace: 'nowrap',
                }}>
                  {section.section}
                </div>
              )}
              {visibleItems.map(renderNavItem)}
            </div>
          )
        })}
      </div>

      <div style={{ borderTop: `0.5px solid ${theme.border}`, padding: '8px 0', flexShrink: 0 }}>
        {user?.system_admin && (
          <NavLink to="/admin" style={{ textDecoration: 'none', display: 'block' }} onClick={handleNavClick}>
            <div
              title={effectiveCollapsed ? 'Admin' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: effectiveCollapsed ? '9px 0' : '9px 16px',
                justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
                minHeight: touchMinHeight,
                color: location.pathname.startsWith('/admin') ? theme.accent : theme.textSecondary,
                background: location.pathname.startsWith('/admin') ? theme.accentBg : 'transparent',
                borderLeft: location.pathname.startsWith('/admin') ? `2.5px solid ${theme.accent}` : '2.5px solid transparent',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={(e) => { if (!location.pathname.startsWith('/admin')) e.currentTarget.style.background = theme.bgSurfaceHover }}
              onMouseLeave={(e) => { if (!location.pathname.startsWith('/admin')) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ display: 'flex', flexShrink: 0 }}><Icon name="shield" /></span>
              {!effectiveCollapsed && <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>Admin</span>}
            </div>
          </NavLink>
        )}
        <NavLink to="/settings" style={{ textDecoration: 'none', display: 'block' }} onClick={handleNavClick}>
          <div
            title={effectiveCollapsed ? 'Settings' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: effectiveCollapsed ? '9px 0' : '9px 16px',
              justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
              minHeight: touchMinHeight,
              color: location.pathname.startsWith('/settings') ? theme.accent : theme.textSecondary,
              background: location.pathname.startsWith('/settings') ? theme.accentBg : 'transparent',
              borderLeft: location.pathname.startsWith('/settings') ? `2.5px solid ${theme.accent}` : '2.5px solid transparent',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
            onMouseEnter={(e) => { if (!location.pathname.startsWith('/settings')) e.currentTarget.style.background = theme.bgSurfaceHover }}
            onMouseLeave={(e) => { if (!location.pathname.startsWith('/settings')) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ display: 'flex', flexShrink: 0 }}><Icon name="settings" /></span>
            {!effectiveCollapsed && <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>Settings</span>}
          </div>
        </NavLink>
        <a
          href="https://docs.fnc-group.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'block' }}
        >
          <div
            title={effectiveCollapsed ? 'Help' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: effectiveCollapsed ? '9px 0' : '9px 16px',
              justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
              minHeight: touchMinHeight,
              color: theme.textSecondary,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgSurfaceHover }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ display: 'flex', flexShrink: 0 }}><Icon name="help-circle" /></span>
            {!effectiveCollapsed && <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>Help</span>}
          </div>
        </a>
      </div>
    </div>
  )
}
