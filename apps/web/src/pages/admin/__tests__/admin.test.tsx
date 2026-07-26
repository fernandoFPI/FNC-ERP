import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MockedProvider } from '@apollo/client/testing'
import { ThemeProvider } from '../../../theme/ThemeContext'
import {
  USERS_QUERY,
  OUTBOX_MONITOR_QUERY,
  OUTBOX_EVENTS_QUERY,
  SYSTEM_HEALTH_QUERY,
  AUDIT_LOG_QUERY,
  OUTBOX_EVENT_CONFIGS_QUERY,
  OUTBOX_DLQ_QUERY,
} from '../../../graphql/admin'
import UsersPage from '../users/UsersPage'
import OutboxMonitorPage from '../outbox/OutboxMonitorPage'
import SystemHealthPage from '../health/SystemHealthPage'
import AuditLogPage from '../audit/AuditLogPage'
import EventConfigsPage from '../event-configs/EventConfigsPage'
import DLQPage from '../outbox/DLQPage'
import AdminLayout from '../AdminLayout'
import { useAuthStore } from '../../../store/authStore'

const adminUser = {
  id: 'u1',
  email: 'admin@fnc.com',
  mfaEnabled: false,
  system_admin: true,
  role: 'system_admin',
}

const usersMock = {
  request: {
    query: USERS_QUERY,
    variables: { search: undefined, isActive: undefined, companyId: undefined, page: 1, limit: 20 },
  },
  result: { data: { users: { items: [], total: 0, page: 1, limit: 20 } } },
}

const outboxMock = {
  request: { query: OUTBOX_MONITOR_QUERY, variables: {} },
  result: {
    data: {
      outboxMonitor: {
        health: 'healthy',
        counts: { pending: 5, failed: 2, dlq: 0, stuck: 0 },
        generatedAt: new Date().toISOString(),
      },
    },
  },
}

const eventsMock = {
  request: {
    query: OUTBOX_EVENTS_QUERY,
    variables: { status: undefined, service: undefined, eventType: undefined, page: 1, limit: 50 },
  },
  result: { data: { outboxEvents: { items: [], total: 0, page: 1, limit: 50 } } },
}

const healthMock = {
  request: { query: SYSTEM_HEALTH_QUERY, variables: {} },
  result: {
    data: {
      systemHealth: [
        {
          service: 'auth',
          status: 'ok',
          latencyMs: 12,
          checks: { database: 'ok', redis: 'ok' },
          uptime: 86400,
          lastChecked: '2026-06-07T10:00:00Z',
        },
        {
          service: 'finance',
          status: 'ok',
          latencyMs: 25,
          checks: { database: 'ok' },
          uptime: 86400,
          lastChecked: '2026-06-07T10:00:00Z',
        },
      ],
    },
  },
}

const auditMock = {
  request: {
    query: AUDIT_LOG_QUERY,
    variables: {
      userId: undefined,
      companyId: undefined,
      tableName: undefined,
      action: undefined,
      recordId: undefined,
      fromDate: undefined,
      toDate: undefined,
      page: 1,
      limit: 50,
    },
  },
  result: { data: { auditLog: { items: [], total: 0, page: 1, limit: 50 } } },
}

const configsMock = {
  request: { query: OUTBOX_EVENT_CONFIGS_QUERY, variables: {} },
  result: { data: { outboxEventConfigs: [] } },
}

const dlqMock = {
  request: {
    query: OUTBOX_DLQ_QUERY,
    variables: { status: undefined, priority: undefined, eventType: undefined, page: 1, limit: 50 },
  },
  result: { data: { outboxDLQ: { items: [], total: 0, page: 1, limit: 50 } } },
}

function wrap(component: React.ReactNode, mocks: unknown[] = []) {
  return render(
    <MockedProvider mocks={mocks as never} addTypename={false}>
      <MemoryRouter>
        <ThemeProvider>{component}</ThemeProvider>
      </MemoryRouter>
    </MockedProvider>,
  )
}

describe('AdminLayout', () => {
  it('redirects non-admin to dashboard', () => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      mfaPending: false,
      tempToken: null,
      themePreference: null,
    })
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter initialEntries={['/admin/users']}>
          <ThemeProvider>
            <Routes>
              <Route path="/admin/*" element={<AdminLayout />} />
              <Route path="/dashboard" element={<div>Dashboard</div>} />
            </Routes>
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>,
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders admin nav for system admin', () => {
    useAuthStore.setState({
      user: adminUser as never,
      isAuthenticated: true,
      accessToken: 'tok',
      refreshToken: 'ref',
      mfaPending: false,
      tempToken: null,
      themePreference: null,
    })
    render(
      <MockedProvider mocks={[usersMock]} addTypename={false}>
        <MemoryRouter initialEntries={['/admin/users']}>
          <ThemeProvider>
            <Routes>
              <Route path="/admin/*" element={<AdminLayout />} />
            </Routes>
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>,
    )
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('System Health')).toBeInTheDocument()
    expect(screen.getByText('Outbox Monitor')).toBeInTheDocument()
    expect(screen.getByText('Dead Letter Queue')).toBeInTheDocument()
    expect(screen.getByText('Audit Log')).toBeInTheDocument()
  })
})

describe('UsersPage', () => {
  it('renders page title', () => {
    wrap(<UsersPage />, [usersMock])
    expect(screen.getByText('Users')).toBeInTheDocument()
  })

  it('shows skeleton loading initially', () => {
    const { container } = wrap(<UsersPage />, [usersMock])
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })
})

describe('OutboxMonitorPage', () => {
  it('renders page title', () => {
    wrap(<OutboxMonitorPage />, [outboxMock, eventsMock])
    expect(screen.getByText(/Outbox Monitor/i)).toBeInTheDocument()
  })
})

describe('SystemHealthPage', () => {
  it('renders page title', () => {
    wrap(<SystemHealthPage />, [healthMock])
    expect(screen.getByText(/System Health/i)).toBeInTheDocument()
  })
})

describe('AuditLogPage', () => {
  it('renders page title', () => {
    wrap(<AuditLogPage />, [auditMock])
    expect(screen.getByText(/Audit Log/i)).toBeInTheDocument()
  })
})

describe('EventConfigsPage', () => {
  it('renders page title', () => {
    wrap(<EventConfigsPage />, [configsMock])
    expect(screen.getByText(/Event Config/i)).toBeInTheDocument()
  })
})

describe('DLQPage', () => {
  it('renders page title', () => {
    wrap(<DLQPage />, [dlqMock])
    expect(screen.getByText(/Dead Letter|DLQ/i)).toBeInTheDocument()
  })
})
