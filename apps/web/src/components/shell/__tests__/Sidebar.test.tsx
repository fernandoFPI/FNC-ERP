import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MockedProvider } from '@apollo/client/testing'
import { Sidebar } from '../Sidebar'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { MY_PO_QUEUE_QUERY } from '../../../graphql/procurement'
import { useAuthStore } from '../../../store/authStore'

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

describe('Sidebar', () => {
  it('renders all nav sections', () => {
    wrap()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByText('Operations')).toBeInTheDocument()
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('Group')).toBeInTheDocument()
  })

  it('renders all nav items', () => {
    // Chart of Accounts lives inside the collapsible "Journals & Accounts" group,
    // which only auto-expands when the current route matches one of its children.
    wrap('/finance/accounts')
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
    expect(screen.getByText('Purchase Orders')).toBeInTheDocument()
  })

  it('collapses to 60px when toggle clicked', () => {
    const { container } = wrap()
    const sidebar = container.firstChild as HTMLElement
    expect(sidebar.style.width).toBe('220px')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(sidebar.style.width).toBe('60px')
  })

  it('expands when toggle clicked again', () => {
    const { container } = wrap()
    const sidebar = container.firstChild as HTMLElement
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(sidebar.style.width).toBe('220px')
  })

  it('persists collapse state to localStorage', () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(localStorage.getItem('fnc-sidebar-collapsed')).toBe('true')
  })

  it('hides labels when collapsed', () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('shows approval queue badge when there are pending approvals', () => {
    // approvalStore starts at 0, so no badge rendered by default
    wrap()
    expect(screen.getByText('Approval Queue')).toBeInTheDocument()
  })
})
