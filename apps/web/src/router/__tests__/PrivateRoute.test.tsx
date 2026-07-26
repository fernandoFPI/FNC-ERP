import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PrivateRoute } from '../PrivateRoute'
import { ThemeProvider } from '../../theme/ThemeContext'
import { useAuthStore } from '../../store/authStore'

function makeMockToken(exp: number): string {
  const header = btoa('{"alg":"none"}').replace(/=+$/, '')
  const payload = btoa(JSON.stringify({ sub: '1', exp })).replace(/=+$/, '')
  return `${header}.${payload}.fake`
}

// Expires year 2286 — effectively never expires in tests
const VALID_TOKEN = makeMockToken(9999999999)

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    mfaPending: false,
    tempToken: null,
    themePreference: null,
  })
})

function TestApp({ authenticated }: { authenticated: boolean }) {
  if (authenticated) {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: '1',
        email: 'test@test.com',
        mfaEnabled: false,
        role: 'user',
        permissions: {},
        profileCompleted: true,
      },
      accessToken: VALID_TOKEN,
      refreshToken: 'rtok',
    })
  }
  return (
    <ThemeProvider>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route
            path="/protected"
            element={
              <PrivateRoute>
                <div>Protected content</div>
              </PrivateRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  )
}

describe('PrivateRoute', () => {
  it('redirects to /login when not authenticated', async () => {
    render(<TestApp authenticated={false} />)
    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })

  it('renders children when authenticated', async () => {
    render(<TestApp authenticated={true} />)
    expect(await screen.findByText('Protected content')).toBeInTheDocument()
  })
})
