import React, { useState } from 'react'
import type { CSSProperties } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import type { ThemeTokens } from '../../theme/tokens'
import { useFocusRing } from '../ui/keyboardFocus'
import { shellFocusRing } from './shellParts'
import { useApprovalStore } from '../../store/approvalStore'
import { useMyQueueCount } from '../../hooks/useMyQueueCount'
import { useAPPendingCount } from '../../hooks/useAPPendingCount'
import { usePermission } from '../../hooks/usePermission'
import { useCompanyStore } from '../../store/companyStore'
import { useAuthStore } from '../../store/authStore'
import { getInitials } from '../../lib/userDisplay'
import { useTranslation } from 'react-i18next'
import { navLabel, useIsRtl } from '../../i18n'

export interface NavChild {
  label: string
  path: string
  badge?: number | 'overdue' | 'ap_pending'
  permKeys?: string[]
}

export interface NavItem {
  label: string
  icon: React.ReactNode
  path: string
  badge?: number | 'overdue' | 'queue' | 'ap_pending'
  children?: NavChild[]
  permKeys?: string[]
  factoryOnly?: boolean
}

export interface NavSection {
  section: string
  items: NavItem[]
}

function Icon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    grid: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
    'dollar-sign': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    'file-text': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    'refresh-cw': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
    'shopping-cart': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
    package: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    tool: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    home: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    truck: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="1" y="3" width="15" height="13" rx="1" />
        <path d="M16 8h4l3 5v3h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    users: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    'credit-card': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    'bar-chart-2': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    settings: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    'help-circle': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    'chevron-left': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    ),
    'chevron-right': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    ),
    'chevron-down': (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    ),
    x: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    layers: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
    calendar: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    clipboard: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      </svg>
    ),
    'map-pin': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    'log-out': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),
    'corner-up-left': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <polyline points="9 14 4 9 9 4" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    ),
    activity: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    tag: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
    percent: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </svg>
    ),
    inbox: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
    'git-branch': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
    ),
    clock: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    'check-circle': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    'alert-circle': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    'pie-chart': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    ),
    'arrow-left-right': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M21 7H3" />
        <polyline points="7 3 3 7 7 11" />
        <path d="M3 17h18" />
        <polyline points="17 13 21 17 17 21" />
      </svg>
    ),
    shield: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    box: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <polyline points="16 7 16 5 8 5 8 7" />
        <line x1="12" y1="12" x2="12" y2="17" />
        <line x1="9.5" y1="14.5" x2="14.5" y2="14.5" />
      </svg>
    ),
    landmark: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <line x1="3" y1="22" x2="21" y2="22" />
        <line x1="6" y1="18" x2="6" y2="11" />
        <line x1="10" y1="18" x2="10" y2="11" />
        <line x1="14" y1="18" x2="14" y2="11" />
        <line x1="18" y1="18" x2="18" y2="11" />
        <polygon points="12 2 20 7 4 7 12 2" />
      </svg>
    ),
    'file-clock': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h5" />
        <polyline points="14 2 14 8 20 8" />
        <circle cx="18" cy="18" r="4" />
        <polyline points="18 16 18 18 20 18" />
      </svg>
    ),
    archive: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <polyline points="21 8 21 21 3 21 3 8" />
        <rect x="1" y="3" width="22" height="5" rx="1" />
        <line x1="10" y1="12" x2="14" y2="12" />
      </svg>
    ),
    'trending-up': (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
    sliders: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    ),
    smartphone: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="5" y="2" width="14" height="20" rx="2.5" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
  }
  return <>{icons[name] ?? null}</>
}

// Exported so SearchPalette can offer "go to page" quick-navigation from
// the same single source of truth the sidebar itself renders from — a
// hand-maintained second copy would drift the same way the Journal
// Entries source-type filter did.
export const NAV_SECTIONS: NavSection[] = [
  {
    section: 'Overview',
    items: [{ label: 'Dashboard', icon: <Icon name="grid" />, path: '/dashboard' }],
  },
  {
    section: 'Finance',
    items: [
      {
        label: 'Journals & Accounts',
        icon: <Icon name="dollar-sign" />,
        path: '_f_ledger',
        permKeys: ['finance.accounts.view', 'finance.journals.view'],
        children: [
          {
            label: 'Chart of Accounts',
            path: '/finance/accounts',
            permKeys: ['finance.accounts.view'],
          },
          {
            label: 'Journal Entries',
            path: '/finance/journals',
            permKeys: ['finance.journals.view'],
          },
          {
            // G1/G2: which GL account every automated journal producer
            // resolves through per role, instead of a guessed chart-code
            // prefix. View-gated here (same as Chart of Accounts); the
            // page itself requires finance.accounts.edit to change anything.
            label: 'Posting Accounts',
            path: '/finance/posting-accounts',
            permKeys: ['finance.accounts.view'],
          },
        ],
      },
      {
        label: 'Receivables & Payables',
        icon: <Icon name="activity" />,
        path: '_f_arp',
        permKeys: ['finance.ar.view', 'finance.ap.view', 'finance.retention.view'],
        children: [
          { label: 'Accounts Receivable', path: '/finance/ar', permKeys: ['finance.ar.view'] },
          {
            label: 'Accounts Payable',
            path: '/finance/ap',
            badge: 'ap_pending' as const,
            permKeys: ['finance.ap.view'],
          },
          { label: 'WHT Payable', path: '/finance/wht-payable', permKeys: ['finance.ap.view'] },
          {
            label: 'Payment Vouchers',
            path: '/finance/payment-vouchers',
            permKeys: ['finance.ap.view'],
          },
          { label: 'Retention', path: '/finance/retention', permKeys: ['finance.retention.view'] },
        ],
      },
      {
        label: 'Cash & Bank',
        icon: <Icon name="landmark" />,
        path: '_f_cash',
        permKeys: [
          'finance.bank.view',
          'finance.petty_cash.view',
          'finance.expenses.view',
          'finance.advances.view',
        ],
        children: [
          { label: 'Bank Reconciliation', path: '/finance/bank', permKeys: ['finance.bank.view'] },
          {
            label: 'Petty Cash',
            path: '/finance/petty-cash',
            permKeys: ['finance.petty_cash.view'],
          },
          {
            // Claims themselves are filed/browsed via Procurement →
            // Requisitions (Purpose: Expense) now — this links straight to
            // the company-wide outstanding-by-employee rollup, which has no
            // equivalent there.
            label: 'Expense Claims Dashboard',
            path: '/finance/expense-claims/dashboard',
            permKeys: ['finance.expenses.view'],
          },
          {
            label: 'Employee Advances',
            path: '/finance/advances',
            permKeys: ['finance.advances.view'],
          },
        ],
      },
      {
        label: 'Assets & Budgets',
        icon: <Icon name="trending-up" />,
        path: '_f_assets',
        // FX Revaluation disabled (Phase 5 of the currency fix plan):
        // nothing is converted anymore, so there's nothing left to
        // revalue. Its tables/routes stay, menu entry removed. See
        // RevaluationPage.tsx / services/finance/src/routes/revaluation.ts.
        permKeys: ['finance.assets.view', 'finance.budget.view'],
        children: [
          { label: 'Fixed Assets', path: '/finance/assets', permKeys: ['finance.assets.view'] },
          { label: 'GL Budgets', path: '/finance/budget', permKeys: ['finance.budget.view'] },
        ],
      },
      {
        label: 'Reports',
        icon: <Icon name="bar-chart-2" />,
        path: '/finance/reports',
        permKeys: ['finance.reports.view'],
        children: [
          {
            label: 'Trial Balance',
            path: '/finance/reports/trial-balance',
            permKeys: ['finance.reports.view'],
          },
          {
            label: 'Profit & Loss',
            path: '/finance/reports/profit-loss',
            permKeys: ['finance.reports.view'],
          },
          {
            label: 'Balance Sheet',
            path: '/finance/reports/balance-sheet',
            permKeys: ['finance.reports.view'],
          },
        ],
      },
    ],
  },
  {
    section: 'Procurement',
    items: [
      {
        label: 'Requisitions',
        icon: <Icon name="clipboard" />,
        path: '/procurement/requisitions',
        permKeys: ['procurement.po.view'],
      },
      {
        label: 'Vendors',
        icon: <Icon name="users" />,
        path: '/procurement/vendors',
        permKeys: ['procurement.vendors.view'],
      },
      {
        label: 'Purchase Orders',
        icon: <Icon name="shopping-cart" />,
        path: '/procurement/purchase-orders',
        permKeys: ['procurement.po.view'],
      },
      {
        label: 'Project Contracts',
        icon: <Icon name="clipboard" />,
        path: '/projects/contracts',
        permKeys: ['projects.contracts.view'],
      },
      {
        label: 'Project Invoices',
        icon: <Icon name="file-text" />,
        path: '/projects/invoices',
        permKeys: ['projects.invoices.view'],
      },
      {
        label: 'My Queue',
        icon: <Icon name="inbox" />,
        path: '/procurement/queue',
        badge: 'queue',
        permKeys: ['procurement.po.view'],
      },
    ],
  },
  {
    section: 'Inventory',
    items: [
      {
        label: 'Products',
        icon: <Icon name="package" />,
        path: '/inventory/products',
        permKeys: ['inventory.products.view'],
      },
      {
        label: 'New Items to Catalog',
        icon: <Icon name="clipboard" />,
        path: '/inventory/pending-catalog',
        permKeys: ['inventory.products.view'],
      },
      {
        label: 'Cost Change Approvals',
        icon: <Icon name="check-circle" />,
        path: '/inventory/cost-approvals',
        permKeys: ['inventory.products.approve_cost_change'],
      },
      {
        label: 'Locations',
        icon: <Icon name="map-pin" />,
        path: '/inventory/locations',
        permKeys: ['inventory.locations.view'],
      },
      {
        label: 'Stock Balances',
        icon: <Icon name="layers" />,
        path: '/inventory/balances',
        permKeys: ['inventory.stock_moves.view'],
      },
      {
        label: 'Stock Moves',
        icon: <Icon name="activity" />,
        path: '/inventory/moves',
        factoryOnly: true,
        permKeys: ['inventory.stock_moves.view'],
      },
      {
        label: 'Adjust Stock',
        icon: <Icon name="refresh-cw" />,
        path: '/inventory/adjust',
        factoryOnly: true,
        permKeys: ['inventory.stock_moves.view'],
      },
      {
        label: 'Store Out',
        icon: <Icon name="log-out" />,
        path: '/inventory/store-out',
        permKeys: ['inventory.stock_moves.view'],
      },
      {
        label: 'Store In',
        icon: <Icon name="inbox" />,
        path: '/inventory/store-in',
        permKeys: ['inventory.stock_moves.view'],
      },
      {
        label: 'Material Returns',
        icon: <Icon name="corner-up-left" />,
        path: '/inventory/material-returns',
        permKeys: ['inventory.stock_moves.view'],
      },
      {
        label: 'Returnables',
        icon: <Icon name="tool" />,
        path: '/inventory/returnables',
        permKeys: ['inventory.stock_moves.view'],
      },
      {
        label: 'Temp Store & Transit',
        icon: <Icon name="truck" />,
        path: '/inventory/temp-store',
        permKeys: ['inventory.stock_moves.view'],
      },
      {
        label: 'Store History',
        icon: <Icon name="activity" />,
        path: '/inventory/history',
        permKeys: ['inventory.stock_moves.view'],
      },
      {
        label: 'Lots',
        icon: <Icon name="tag" />,
        path: '/inventory/lots',
        permKeys: ['inventory.lots.view'],
      },
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
        permKeys: [
          'manufacturing.boms.view',
          'manufacturing.orders.view',
          'manufacturing.work_centers.view',
        ],
        children: [
          {
            label: 'Orders',
            path: '/manufacturing/orders',
            permKeys: ['manufacturing.orders.view'],
          },
          {
            label: 'Requests',
            path: '/manufacturing/requests',
            permKeys: ['manufacturing.orders.view'],
          },
          {
            label: 'Bills of Materials',
            path: '/manufacturing/boms',
            permKeys: ['manufacturing.boms.view'],
          },
          {
            label: 'Work Centers',
            path: '/manufacturing/work-centers',
            permKeys: ['manufacturing.work_centers.view'],
          },
        ],
      },
      {
        label: 'Projects',
        icon: <Icon name="home" />,
        path: '/projects',
        permKeys: ['projects.view'],
        children: [{ label: 'All Projects', path: '/projects', permKeys: ['projects.view'] }],
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
          {
            label: 'Maintenance',
            path: '/rental/maintenance',
            badge: 'overdue',
            permKeys: ['rental.maintenance.view'],
          },
        ],
      },
    ],
  },
  {
    section: 'People',
    items: [
      {
        label: 'HR',
        icon: <Icon name="users" />,
        path: '/hr/employees',
        permKeys: ['hr.employees.view'],
      },
      {
        label: 'Attendance',
        icon: <Icon name="check-circle" />,
        path: '/attendance',
        permKeys: ['attendance.view'],
      },
      {
        label: 'Recharge Requests',
        icon: <Icon name="smartphone" />,
        path: '/recharge',
        permKeys: ['hr.recharge.view'],
      },
      {
        label: 'My Advances',
        icon: <Icon name="dollar-sign" />,
        path: '/my-advances',
        // No permKeys — reachable by any authenticated user, matching
        // /my-advances not being nested under the finance.accounts.view-
        // gated /finance route (see router/index.tsx). Requesting an
        // advance only requires a linked employee record, checked
        // server-side and surfaced in-page, not gated by a permission.
      },
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
          {
            label: 'Executive',
            path: '/reporting/executive',
            permKeys: ['reporting.executive.view'],
          },
          {
            label: 'Consolidated P&L',
            path: '/reporting/consolidated/pl',
            permKeys: ['reporting.consolidated.view'],
          },
          {
            label: 'Consolidated BS',
            path: '/reporting/consolidated/bs',
            permKeys: ['reporting.consolidated.view'],
          },
          {
            label: 'Consolidated Trial Balance',
            path: '/reporting/consolidated/trial-balance',
            permKeys: ['reporting.consolidated.view'],
          },
          {
            label: 'Project Profitability',
            path: '/reporting/projects/profitability',
            permKeys: ['reporting.operational.view'],
          },
          {
            label: 'Payroll Costs',
            path: '/reporting/payroll/costs',
            permKeys: ['reporting.operational.view'],
          },
          {
            label: 'Inventory Valuation',
            path: '/reporting/inventory/valuation',
            permKeys: ['reporting.operational.view'],
          },
          {
            label: 'Compliance',
            path: '/reporting/compliance/wht',
            permKeys: ['reporting.compliance.view'],
          },
        ],
      },
      {
        label: 'Inter-company',
        icon: <Icon name="arrow-left-right" />,
        path: '/interco',
        permKeys: ['interco.transactions.view', 'interco.stock_transfers.view'],
        children: [
          {
            label: 'Transactions',
            path: '/interco/transactions',
            permKeys: ['interco.transactions.view'],
          },
          {
            label: 'Stock Transfers',
            path: '/interco/stock-transfers',
            permKeys: ['interco.stock_transfers.view'],
          },
          {
            label: 'Transfer Pricing',
            path: '/interco/pricing',
            permKeys: ['interco.transactions.view'],
          },
        ],
      },
    ],
  },
]

// ── Rows ─────────────────────────────────────────────────────────────────────
//
// Every row of the sidebar (a page, a group, a page inside a group, Settings, Help) is one pill: 8px corners inset from the
// edge, the accent tint and the solid-accent text for the page you are on (the pale accent is 4.19:1 on its own tint, the
// solid one is above 4.5:1), the readable grey for the rest, and a keyboard ring that shows for keyboard focus only.

interface RowLook {
  /** This is the page (the text turns accent). */
  active: boolean
  /** Draws the tint: the page itself, or a closed group that holds the page. */
  tinted: boolean
  /** Icon-only rail. */
  collapsed: boolean
  /** Phone drawer: taller rows for a finger. */
  touch: boolean
  child?: boolean
}

function rowStyle(
  theme: ThemeTokens,
  { active, tinted, collapsed, touch, child = false }: RowLook,
  hover: boolean,
  ring: boolean,
): CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'flex-start',
    gap: '10px',
    boxSizing: 'border-box',
    width: collapsed ? '40px' : '100%',
    minHeight: touch ? (child ? '44px' : '48px') : collapsed ? '40px' : child ? '34px' : '38px',
    margin: collapsed ? '2px auto' : '1px 0',
    padding: collapsed ? 0 : '0 8px',
    borderRadius: '8px',
    border: 'none',
    background: tinted ? theme.accentBg : hover ? theme.bgSurfaceHover : 'transparent',
    color: active ? theme.accentSolid : hover ? theme.textPrimary : theme.textSecondary,
    fontSize: '13px',
    fontWeight: active ? 600 : 500,
    fontFamily: 'inherit',
    textAlign: 'start',
    textDecoration: 'none',
    cursor: 'pointer',
    outline: 'none',
    boxShadow: ring ? shellFocusRing(theme) : 'none',
    transition: 'background 0.12s ease, color 0.12s ease',
    WebkitTapHighlightColor: 'transparent',
  }
}

interface RowFaceProps {
  icon?: React.ReactNode
  label: string
  collapsed: boolean
  badge?: number
  /** `count` is a number of things waiting (a solid pill); `alert` is something overdue (the danger tint). */
  badgeTone?: 'count' | 'alert'
  chevron?: React.ReactNode
}

// What a row shows inside: the icon, the label, the count, the chevron of a group. In the icon-only rail the label goes and
// a count becomes a dot, so a waiting queue is not invisible there.
function RowFace({ icon, label, collapsed, badge, badgeTone = 'count', chevron }: RowFaceProps) {
  const { theme } = useTheme()
  const hasBadge = badge !== undefined
  return (
    <>
      {icon && (
        <span aria-hidden="true" style={{ display: 'flex', flexShrink: 0 }}>
          {icon}
        </span>
      )}
      {!collapsed && (
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
      {!collapsed && hasBadge && (
        <span
          style={{
            minWidth: '20px',
            height: '20px',
            boxSizing: 'border-box',
            padding: '0 6px',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
            ...(badgeTone === 'alert'
              ? {
                  background: theme.dangerBg,
                  color: theme.danger,
                  border: `1px solid ${theme.dangerBorder}`,
                }
              : { background: theme.accentSolid, color: theme.accentSolidText }),
          }}
        >
          {badge}
        </span>
      )}
      {!collapsed && chevron}
      {collapsed && hasBadge && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '6px',
            insetInlineEnd: '6px',
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: badgeTone === 'alert' ? theme.danger : theme.accentSolid,
            boxShadow: `0 0 0 2px ${theme.bgSidebar}`,
          }}
        />
      )}
    </>
  )
}

interface LinkRowProps extends Omit<RowFaceProps, 'collapsed'> {
  to: string
  look: RowLook
  onClick?: () => void
}

function LinkRow({ to, look, onClick, ...face }: LinkRowProps) {
  const { theme } = useTheme()
  const { ring, handlers } = useFocusRing()
  const [hover, setHover] = useState(false)
  const count = face.badge !== undefined ? ` (${face.badge})` : ''
  return (
    <NavLink
      to={to}
      onClick={onClick}
      // an icon-only row has no visible text, so it is named (and shows a tooltip) with the page's name
      {...(look.collapsed ? { title: face.label, 'aria-label': `${face.label}${count}` } : {})}
      {...handlers}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      style={rowStyle(theme, look, hover, ring)}
    >
      {look.active && !look.collapsed && !look.child && <ActiveBar />}
      <RowFace {...face} collapsed={look.collapsed} />
    </NavLink>
  )
}

// The accent bar at the edge of the page you are on (it sits in the 8px the list leaves beside the pills).
function ActiveBar() {
  const { theme } = useTheme()
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        insetInlineStart: '-6px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '3px',
        height: '18px',
        borderStartEndRadius: '3px',
        borderEndEndRadius: '3px',
        background: theme.accentSolid,
      }}
    />
  )
}

interface GroupRowProps extends Omit<RowFaceProps, 'collapsed' | 'chevron'> {
  look: RowLook
  expanded: boolean
  controlsId: string
  onToggle: () => void
}

// A group that opens to show its pages. A real button (the old row was a div with a click handler, which the keyboard
// could not reach), and it says whether it is open.
function GroupRow({ look, expanded, controlsId, onToggle, ...face }: GroupRowProps) {
  const { theme } = useTheme()
  const rtl = useIsRtl()
  const { ring, handlers } = useFocusRing()
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={expanded ? controlsId : undefined}
      onClick={onToggle}
      {...handlers}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      style={rowStyle(theme, look, hover, ring)}
    >
      <RowFace
        {...face}
        collapsed={false}
        chevron={
          <span
            aria-hidden="true"
            style={{
              display: 'flex',
              color: theme.textSecondary,
              // pointing at the side the pages are on while closed; a chevron is an icon, so the browser does not mirror it
              transform: expanded ? 'rotate(0deg)' : `rotate(${rtl ? 90 : -90}deg)`,
              transition: 'transform 0.15s ease',
            }}
          >
            <Icon name="chevron-down" />
          </span>
        }
      />
    </button>
  )
}

// A small ghost button for the sidebar header (collapse, expand, close).
function HeaderButton({
  label,
  onClick,
  size,
  expanded,
  children,
}: {
  label: string
  onClick?: () => void
  size: number
  expanded?: boolean
  children: React.ReactNode
}) {
  const { theme } = useTheme()
  const { ring, handlers } = useFocusRing()
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      {...handlers}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: 'none',
        borderRadius: '8px',
        background: hover ? theme.bgSurfaceHover : 'transparent',
        color: hover ? theme.textPrimary : theme.textSecondary,
        boxShadow: ring ? shellFocusRing(theme) : 'none',
        outline: 'none',
        cursor: 'pointer',
        transition: 'background 0.12s ease, color 0.12s ease',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  )
}

interface SidebarProps {
  // Phone drawer mode — fixed overlay with X button
  mobile?: boolean
  expanded?: boolean
  onClose?: () => void
  // Tablet rail mode — icon-only 60px in-flow
  rail?: boolean
  onToggle?: () => void
}

export function Sidebar({
  mobile = false,
  expanded = false,
  onClose,
  rail = false,
  onToggle,
}: SidebarProps) {
  const { theme } = useTheme()
  const rtl = useIsRtl()
  const { t } = useTranslation()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const overdueMaintenanceCount = useApprovalStore((s) => s.overdueMaintenanceCount)
  const myQueueCount = useMyQueueCount()
  const apPendingCount = useAPPendingCount()
  const { canAny, isSystemLevel } = usePermission()
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const isFactoryCompany = !!activeCompany?.name.toLowerCase().includes('factory')
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('fnc-sidebar-collapsed') === 'true'
  })
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    const path = location.pathname
    const expanded = new Set<string>()
    NAV_SECTIONS.forEach((sec) => {
      sec.items.forEach((item) => {
        if (item.children?.some((c) => path.startsWith(c.path))) {
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

  function resolveBadge(
    badge: number | 'overdue' | 'queue' | 'ap_pending' | undefined,
  ): number | undefined {
    if (badge === 'overdue')
      return overdueMaintenanceCount > 0 ? overdueMaintenanceCount : undefined
    if (badge === 'queue') return myQueueCount > 0 ? myQueueCount : undefined
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

  function renderNavItem(item: NavItem) {
    const visibleChildren = (item.children ?? []).filter((c) => {
      if (!c.permKeys || c.permKeys.length === 0) return true
      if (isSystemLevel) return true
      return canAny(c.permKeys)
    })
    const hasChildren = visibleChildren.length > 0
    const isExpanded = expandedItems.has(item.path)
    const isChildCurrentlyActive =
      hasChildren &&
      visibleChildren.some(
        (c) => location.pathname === c.path || location.pathname.startsWith(c.path + '/'),
      )
    const isParentActive = location.pathname.startsWith(item.path) || isChildCurrentlyActive
    const isDirectActive =
      !hasChildren &&
      (location.pathname === item.path || location.pathname.startsWith(item.path + '/'))
    const badgeCount = getBadgeCount(item)
    const label = navLabel(item.label)

    // A group that is open shows the page you are on as its own highlighted row, so the group only turns its text accent;
    // closed (or in the icon rail), the group carries the tint so you can still see where you are.
    if (hasChildren && !effectiveCollapsed) {
      const groupId = `nav-group-${item.path.replace(/[^a-z0-9]+/gi, '-')}`
      return (
        <div key={item.path}>
          <GroupRow
            look={{
              active: isParentActive,
              tinted: isParentActive && !isExpanded,
              collapsed: false,
              touch: mobile,
            }}
            expanded={isExpanded}
            controlsId={groupId}
            onToggle={() => {
              toggleExpand(item.path)
            }}
            icon={item.icon}
            label={label}
            badge={badgeCount}
          />
          {isExpanded && (
            <div
              id={groupId}
              style={{
                margin: '2px 0 6px',
                marginInlineStart: '18px',
                paddingInlineStart: '8px',
                borderInlineStart: `1px solid ${theme.borderStrong}`,
              }}
            >
              {visibleChildren.map((child) => {
                const isChildActive =
                  location.pathname === child.path || location.pathname.startsWith(child.path + '/')
                return (
                  <LinkRow
                    key={child.path}
                    to={child.path}
                    onClick={handleNavClick}
                    look={{
                      active: isChildActive,
                      tinted: isChildActive,
                      collapsed: false,
                      touch: mobile,
                      child: true,
                    }}
                    label={navLabel(child.label)}
                    badge={resolveBadge(child.badge)}
                    badgeTone="alert"
                  />
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // In rail/collapsed mode, everything becomes a link (a group goes to its first page)
    const railNavTarget =
      hasChildren && effectiveCollapsed ? (visibleChildren[0]?.path ?? item.path) : item.path
    const active = hasChildren ? isParentActive : isDirectActive
    return (
      <LinkRow
        key={item.path}
        to={railNavTarget}
        onClick={handleNavClick}
        look={{ active, tinted: active, collapsed: effectiveCollapsed, touch: mobile }}
        icon={item.icon}
        label={label}
        badge={badgeCount}
      />
    )
  }

  // ── Header — differs by mode ─────────────────────────────────────────────────

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    // 56px, the same as the top bar, so the two hairlines meet in one line
    height: '56px',
    borderBottom: `1px solid ${theme.border}`,
    flexShrink: 0,
  }

  const wordmark = (
    <span
      style={{
        fontSize: '15px',
        fontWeight: 700,
        color: theme.textPrimary,
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      FNC GROUP
    </span>
  )

  // The chevrons are icons, so the browser does not mirror them: on the right-hand side of an Arabic page they point the other way.
  const towardEdge = rtl ? 'chevron-right' : 'chevron-left'
  const awayFromEdge = rtl ? 'chevron-left' : 'chevron-right'

  function renderHeader() {
    if (mobile) {
      // Phone drawer: title + X button
      return (
        <div style={{ ...headerStyle, justifyContent: 'space-between', padding: '0 8px 0 18px' }}>
          {wordmark}
          <HeaderButton label={t('shell.closeSidebar')} onClick={onClose} size={40}>
            <Icon name="x" />
          </HeaderButton>
        </div>
      )
    }

    if (rail) {
      // Tablet rail: centered toggle button
      return (
        <div style={{ ...headerStyle, justifyContent: 'center' }}>
          <HeaderButton label={t('shell.expandSidebar')} onClick={onToggle} size={36}>
            <Icon name={awayFromEdge} />
          </HeaderButton>
        </div>
      )
    }

    // Desktop: FNC GROUP title + collapse toggle
    return (
      <div
        style={{
          ...headerStyle,
          justifyContent: effectiveCollapsed ? 'center' : 'space-between',
          padding: effectiveCollapsed ? 0 : '0 10px 0 18px',
        }}
      >
        {!effectiveCollapsed && wordmark}
        <HeaderButton
          label={effectiveCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          onClick={toggleCollapseInternal}
          size={effectiveCollapsed ? 36 : 32}
          expanded={!effectiveCollapsed}
        >
          <Icon name={effectiveCollapsed ? awayFromEdge : towardEdge} />
        </HeaderButton>
      </div>
    )
  }

  const visibleSections = NAV_SECTIONS.map((section) => ({
    section,
    items: section.items.filter((item) => isItemVisible(item)),
  })).filter((s) => s.items.length > 0)

  const onProfile = location.pathname === '/settings/profile'
  const onAdmin = location.pathname.startsWith('/admin')
  const onSettings = location.pathname.startsWith('/settings')

  return (
    <div
      // Remounts on a language-direction flip. The closed/off-screen position
      // mirrors sign based on `rtl` (-100% in LTR, +100% in RTL) — without
      // this key, switching language while the mobile drawer is closed
      // animates transform across that unconditional transition, visibly
      // sliding the hidden panel all the way across the screen and back out.
      // A fresh key means React mounts a new node already at its final
      // transform value, with nothing to transition from.
      key={mobile ? `sidebar-${rtl}` : 'sidebar'}
      style={{
        width,
        minWidth: width,
        height: mobile ? '100dvh' : '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.bgSidebar,
        backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
        WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
        borderInlineEnd: `1px solid ${theme.border}`,
        transition: mobile
          ? 'transform 0.25s cubic-bezier(.4,0,.2,1)'
          : 'width 0.22s cubic-bezier(.4,0,.2,1), min-width 0.22s cubic-bezier(.4,0,.2,1)',
        overflow: 'hidden',
        position: mobile ? 'fixed' : 'relative',
        top: mobile ? 0 : undefined,
        insetInlineStart: mobile ? 0 : undefined,
        transform: mobile
          ? expanded
            ? 'translateX(0)'
            : rtl
              ? 'translateX(100%)'
              : 'translateX(-100%)'
          : 'none',
        zIndex: mobile ? 200 : 10,
        flexShrink: 0,
      }}
    >
      {theme.topRim !== 'none' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '0.5px',
            background: theme.topRim,
            zIndex: 1,
          }}
        />
      )}

      {renderHeader()}

      <nav
        aria-label={t('shell.mainNavigation')}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 6px',
          scrollbarWidth: 'thin',
          scrollbarColor: `${theme.borderStrong} transparent`,
        }}
      >
        {visibleSections.map(({ section, items }, index) => (
          <div key={section.section} role="group" aria-label={navLabel(section.section)}>
            {effectiveCollapsed ? (
              // no room for a heading in the rail: a hairline between sections keeps them apart
              index > 0 && (
                <div
                  role="separator"
                  style={{ height: '1px', margin: '8px 6px', background: theme.border }}
                />
              )
            ) : (
              <div
                style={{
                  padding: index === 0 ? '4px 8px 6px' : '16px 8px 6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.textSecondary,
                  whiteSpace: 'nowrap',
                }}
              >
                {navLabel(section.section)}
              </div>
            )}
            {items.map(renderNavItem)}
          </div>
        ))}
      </nav>

      <div
        style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '8px 6px',
          flexShrink: 0,
        }}
      >
        {/* Phone drawer only — Topbar drops the avatar menu on phone, so
            identity + Profile/Sign out live here instead, reachable via
            BottomNav's "More" button. */}
        {mobile && user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 8px 12px',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                flexShrink: 0,
                background: theme.accentBg,
                border: `1px solid ${theme.accentBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontSize: '12px',
                fontWeight: 700,
                color: theme.accentSolid,
              }}
            >
              {user.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt={t('shell.avatar')}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                getInitials(user.email)
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              {user.firstName && user.lastName && (
                <p
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: theme.textPrimary,
                    margin: '0 0 1px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user.firstName} {user.lastName}
                </p>
              )}
              <p
                style={{
                  fontSize: '12px',
                  color: theme.textSecondary,
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.email}
              </p>
            </div>
          </div>
        )}

        {mobile && (
          <LinkRow
            to="/settings/profile"
            onClick={handleNavClick}
            look={{ active: onProfile, tinted: onProfile, collapsed: false, touch: true }}
            icon={<Icon name="users" />}
            label={navLabel('Profile')}
          />
        )}

        {user?.system_admin && (
          <LinkRow
            to="/admin"
            onClick={handleNavClick}
            look={{
              active: onAdmin,
              tinted: onAdmin,
              collapsed: effectiveCollapsed,
              touch: mobile,
            }}
            icon={<Icon name="shield" />}
            label={navLabel('Admin')}
          />
        )}

        <LinkRow
          to="/settings"
          onClick={handleNavClick}
          look={{
            active: onSettings,
            tinted: onSettings,
            collapsed: effectiveCollapsed,
            touch: mobile,
          }}
          icon={<Icon name="settings" />}
          label={navLabel('Settings')}
        />

        <HelpRow collapsed={effectiveCollapsed} touch={mobile} label={t('shell.help')} />

        {mobile && (
          <SignOutRow
            label={t('shell.signOut')}
            onSelect={() => {
              clearAuth()
              navigate('/login')
            }}
          />
        )}
      </div>
    </div>
  )
}

// Help opens the help drawer (a global event), so it is a button, drawn like the rows above it.
function HelpRow({
  collapsed,
  touch,
  label,
}: {
  collapsed: boolean
  touch: boolean
  label: string
}) {
  const { theme } = useTheme()
  const { ring, handlers } = useFocusRing()
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={() => window.dispatchEvent(new Event('fnc:open-help'))}
      {...handlers}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      style={rowStyle(theme, { active: false, tinted: false, collapsed, touch }, hover, ring)}
    >
      <RowFace icon={<Icon name="help-circle" />} label={label} collapsed={collapsed} />
    </button>
  )
}

function SignOutRow({ label, onSelect }: { label: string; onSelect: () => void }) {
  const { theme } = useTheme()
  const { ring, handlers } = useFocusRing()
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onSelect}
      {...handlers}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      style={{
        ...rowStyle(
          theme,
          { active: false, tinted: false, collapsed: false, touch: true },
          false,
          ring,
        ),
        color: theme.danger,
        background: hover ? theme.dangerBg : 'transparent',
      }}
    >
      <RowFace icon={<Icon name="log-out" />} label={label} collapsed={false} />
    </button>
  )
}
