import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MockedProvider } from '@apollo/client/testing'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { MY_PROFILE_QUERY, MY_PREFERENCES_QUERY, MY_SESSIONS_QUERY } from '../../../graphql/settings'
import ProfilePage from '../profile/ProfilePage'
import AppearancePage from '../appearance/AppearancePage'
import NotificationPreferencesPage from '../notifications/NotificationPreferencesPage'
import SettingsLayout from '../SettingsLayout'

const profileMock = {
  request: { query: MY_PROFILE_QUERY, variables: {} },
  result: {
    data: {
      myProfile: {
        id: 'u1',
        email: 'user@fnc.com',
        mfaEnabled: false,
        lastLogin: '2026-06-07T09:00:00Z',
        createdAt: '2025-01-01T00:00:00Z',
      },
    },
  },
}

const preferencesMock = {
  request: { query: MY_PREFERENCES_QUERY, variables: {} },
  result: {
    data: {
      myPreferences: {
        themePreference: 'dark',
        dateFormat: 'DD/MM/YYYY',
        numberFormat: 'standard',
        notificationPreferences: null,
      },
    },
  },
}

const sessionsMock = {
  request: { query: MY_SESSIONS_QUERY, variables: {} },
  result: {
    data: {
      mySessions: [
        { id: 's1', deviceName: 'Chrome on Windows', platform: 'web', ipAddress: '192.168.1.1', createdAt: '2026-06-07T08:00:00Z', lastActive: '2026-06-07T10:00:00Z', isCurrent: true },
      ],
    },
  },
}

function wrap(component: React.ReactNode, mocks: unknown[] = []) {
  return render(
    <MockedProvider mocks={mocks as never} addTypename={false}>
      <MemoryRouter>
        <ThemeProvider>
          {component}
        </ThemeProvider>
      </MemoryRouter>
    </MockedProvider>
  )
}

describe('SettingsLayout', () => {
  it('renders Profile nav link', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter initialEntries={['/settings/profile']}>
          <ThemeProvider>
            <Routes>
              <Route path="/settings/*" element={<SettingsLayout />} />
            </Routes>
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>
    )
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
  })

  it('does NOT show Company nav for non-admin', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter initialEntries={['/settings/profile']}>
          <ThemeProvider>
            <Routes>
              <Route path="/settings/*" element={<SettingsLayout />} />
            </Routes>
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>
    )
    expect(screen.queryByText('Company')).not.toBeInTheDocument()
  })
})

describe('ProfilePage', () => {
  it('renders My Profile heading', () => {
    wrap(<ProfilePage />, [profileMock, preferencesMock, sessionsMock])
    expect(screen.getByText('My Profile')).toBeInTheDocument()
  })

  it('shows skeleton loading state initially', () => {
    const { container } = wrap(<ProfilePage />, [profileMock, preferencesMock, sessionsMock])
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })
})

describe('AppearancePage', () => {
  it('renders Appearance heading', () => {
    wrap(<AppearancePage />, [preferencesMock])
    expect(screen.getByText('Appearance')).toBeInTheDocument()
  })

  it('has theme section heading', () => {
    wrap(<AppearancePage />, [preferencesMock])
    expect(screen.getByText('Theme')).toBeInTheDocument()
  })
})

describe('NotificationPreferencesPage', () => {
  it('renders Notifications page header', () => {
    wrap(<NotificationPreferencesPage />, [preferencesMock])
    const headings = screen.getAllByText(/Notification/i)
    expect(headings.length).toBeGreaterThanOrEqual(1)
  })
})
