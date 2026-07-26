import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MockedProvider } from '@apollo/client/testing'
import { Sidebar } from '../Sidebar'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { useAuthStore } from '../../../store/authStore'
import { MY_PO_QUEUE_QUERY } from '../../../graphql/procurement'

const poQueueMock = {
  request: { query: MY_PO_QUEUE_QUERY, variables: {} },
  result: { data: { myPOQueue: [] } },
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({
    user: {
      id: 'u1',
      email: 'user@fnc.com',
      role: 'company_admin',
      mfaEnabled: false,
      system_admin: false,
    } as never,
    isAuthenticated: true,
    accessToken: 'tok',
    refreshToken: 'ref',
    mfaPending: false,
    tempToken: null,
    themePreference: null,
  })
})

function wrap(initialPath = '/dashboard') {
  return render(
    <MockedProvider mocks={[poQueueMock]} addTypename={false}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ThemeProvider>
          <Sidebar />
        </ThemeProvider>
      </MemoryRouter>
    </MockedProvider>,
  )
}

describe('Sidebar Phase 5 — Group section', () => {
  it('renders Group section', () => {
    wrap()
    expect(screen.getByText('Group')).toBeInTheDocument()
  })

  it('renders Reporting nav item', () => {
    wrap()
    expect(screen.getByText('Reporting')).toBeInTheDocument()
  })

  it('renders Inter-company nav item', () => {
    wrap()
    expect(screen.getByText('Inter-company')).toBeInTheDocument()
  })

  it('expands Reporting to show sub-items on click', () => {
    wrap()
    fireEvent.click(screen.getByText('Reporting'))
    expect(screen.getByText('Executive')).toBeInTheDocument()
    expect(screen.getByText('Consolidated P&L')).toBeInTheDocument()
    expect(screen.getByText('Project Profitability')).toBeInTheDocument()
  })

  it('expands Inter-company to show sub-items on click', () => {
    wrap()
    fireEvent.click(screen.getByText('Inter-company'))
    expect(screen.getByText('Transactions')).toBeInTheDocument()
    expect(screen.getByText('Stock Transfers')).toBeInTheDocument()
    expect(screen.getByText('Transfer Pricing')).toBeInTheDocument()
  })

  it('does NOT show Admin link for non-admin user', () => {
    wrap()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('shows Admin link for system admin', () => {
    useAuthStore.setState({
      user: {
        id: '1',
        email: 'admin@fnc.com',
        mfaEnabled: false,
        system_admin: true,
      } as unknown as ReturnType<typeof useAuthStore.getState>['user'],
      isAuthenticated: true,
      accessToken: 'token',
      refreshToken: 'refresh',
      mfaPending: false,
      tempToken: null,
      themePreference: null,
    })
    wrap()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('shows Settings in bottom utility section', () => {
    wrap()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows Help in bottom utility section', () => {
    wrap()
    expect(screen.getByText('Help')).toBeInTheDocument()
  })

  it('Reporting item can be clicked to expand sub-items', () => {
    wrap('/reporting/executive')
    // On /reporting path — click Reporting to expand
    const reportingItem = screen.getByText('Reporting')
    fireEvent.click(reportingItem)
    expect(screen.getByText('Compliance')).toBeInTheDocument()
  })
})
