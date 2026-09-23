import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MockedProvider } from '@apollo/client/testing'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { USER_QUERY, COMPANIES_QUERY, ASSIGN_ROLE } from '../../../../graphql/admin'
import { useAuthStore } from '../../../../store/authStore'
import UserDetail from '../UserDetail'

const adminUser = {
  id: 'admin-1',
  email: 'admin@fnc.com',
  mfaEnabled: false,
  role: 'system_admin',
}

const baseUser = {
  id: 'u1',
  email: 'zain@npbsco.com',
  isActive: true,
  mfaEnabled: false,
  lastLogin: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  createdAt: '2026-01-01T00:00:00Z',
  roles: [] as {
    id: string
    companyId: string
    companyName: string
    module: string
    role: string
    isActive: boolean
  }[],
}

const companiesMock = {
  request: { query: COMPANIES_QUERY },
  result: {
    data: {
      companies: [
        {
          id: 'co-1',
          name: 'Nishtimani Yakam',
          legalName: 'Nishtimani Yakam LLC',
          city: 'Erbil',
          countryCode: 'IQ',
          currencyCode: 'IQD',
          isActive: true,
          setupCompleted: true,
          intercoTransferPricingMethod: 'cost',
          configuration: { defaultCurrency: 'IQD', fiscalYearStartMonth: 1 },
        },
      ],
    },
  },
}

function userQueryMock(roles: typeof baseUser.roles) {
  return {
    request: { query: USER_QUERY, variables: { id: 'u1' } },
    result: { data: { user: { ...baseUser, roles } } },
  }
}

function assignRoleMock(module: string, roleId: string) {
  return {
    request: {
      query: ASSIGN_ROLE,
      variables: {
        input: { user_id: 'u1', company_id: 'co-1', role: 'module_admin', module },
      },
    },
    result: {
      data: {
        assignRole: { id: roleId, role: 'module_admin', module, isActive: true },
      },
    },
  }
}

function wrap(mocks: unknown[]) {
  return render(
    <MockedProvider mocks={mocks as never} addTypename={false}>
      <MemoryRouter initialEntries={['/admin/users/u1']}>
        <ThemeProvider>
          <Routes>
            <Route path="/admin/users/:id" element={<UserDetail />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    </MockedProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({
    user: adminUser as never,
    isAuthenticated: true,
    accessToken: 'tok',
    refreshToken: 'ref',
    mfaPending: false,
    tempToken: null,
    themePreference: null,
  })
})

describe('UserDetail — module admin on multiple modules', () => {
  it('assigns module_admin on every checked module from one Add role submission', async () => {
    wrap([
      companiesMock,
      userQueryMock([]),
      assignRoleMock('procurement', 'role-1'),
      assignRoleMock('finance', 'role-2'),
      userQueryMock([
        {
          id: 'role-1',
          companyId: 'co-1',
          companyName: 'Nishtimani Yakam',
          module: 'procurement',
          role: 'module_admin',
          isActive: true,
        },
        {
          id: 'role-2',
          companyId: 'co-1',
          companyName: 'Nishtimani Yakam',
          module: 'finance',
          role: 'module_admin',
          isActive: true,
        },
      ]),
    ])

    fireEvent.click(await screen.findByRole('button', { name: 'Roles' }))
    // Only one "Add role" button exists before the modal opens — the
    // tab's trigger button.
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }))

    // SearchableSelect options select on mousedown (with preventDefault),
    // not click — see SearchableSelect.tsx's option row onMouseDown.
    fireEvent.click(screen.getByText('Select company…'))
    fireEvent.mouseDown(await screen.findByText('Nishtimani Yakam'))

    fireEvent.click(screen.getByText('Select role…'))
    fireEvent.mouseDown(await screen.findByText('Module Admin'))

    fireEvent.click(await screen.findByText('Procurement'))
    fireEvent.click(screen.getByText('Finance'))

    // Now two "Add role" buttons exist: the (still-mounted) tab trigger
    // and the modal's submit button, portaled in after it in the DOM.
    const addRoleButtons = screen.getAllByRole('button', { name: 'Add role' })
    expect(addRoleButtons).toHaveLength(2)
    fireEvent.click(addRoleButtons[addRoleButtons.length - 1])

    // Modal only closes once every selected module's assignRole call
    // resolved — proves both mocked mutations were called and matched.
    await waitFor(() => {
      expect(screen.queryByText('Add Role')).not.toBeInTheDocument()
    })

    // Refetch picked up both newly created rows.
    expect(await screen.findByText('procurement')).toBeInTheDocument()
    expect(screen.getByText('finance')).toBeInTheDocument()
  })
})
